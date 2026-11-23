"""Unit tests for app/preprocessing.py. All test images are made in code, so no binary fixtures."""

import io

import numpy as np
import pytest
from PIL import Image

from app.preprocessing import (
    ImageRejected,
    center_box,
    center_crop_resize,
    dhash,
    load_photo,
    open_photo,
    to_rgb,
    zoom_boxes,
)

MAX_PIXELS = 60_000_000


def encode(im: Image.Image, fmt: str, **kwargs) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


# ---- to_rgb -----------------------------------------------------------------------------


def test_to_rgb_fully_transparent_becomes_white():
    im = Image.new("RGBA", (10, 10), (255, 0, 0, 0))  # red, but fully transparent
    out = to_rgb(im)
    assert out.mode == "RGB"
    assert np.all(np.asarray(out) == 255)


def test_to_rgb_keeps_opaque_pixels():
    im = Image.new("RGBA", (10, 10), (10, 20, 30, 255))
    assert np.asarray(to_rgb(im))[0, 0].tolist() == [10, 20, 30]


def test_to_rgb_palette_with_transparency_becomes_white():
    im = Image.new("P", (8, 8), 0)
    im.putpalette([0, 0, 0] * 256)
    im.info["transparency"] = 0
    assert np.all(np.asarray(to_rgb(im)) == 255)


# ---- open_photo -------------------------------------------------------------------------


def test_exif_rotation_is_fixed():
    # 60 wide x 40 tall: left half red, right half blue, stored with EXIF orientation 6
    # ("rotate 90 degrees clockwise to view"), which is how phones save portrait photos.
    im = Image.new("RGB", (60, 40), (0, 0, 255))
    im.paste((255, 0, 0), (0, 0, 30, 40))
    exif = Image.Exif()
    exif[0x0112] = 6
    out = open_photo(encode(im, "JPEG", exif=exif, quality=95), MAX_PIXELS)

    assert out.size == (40, 60)  # now portrait
    arr = np.asarray(out).astype(int)
    top, bottom = arr[:25].mean(axis=(0, 1)), arr[35:].mean(axis=(0, 1))
    assert top[0] > 200 and top[2] < 60  # the left (red) half is now on top
    assert bottom[2] > 200 and bottom[0] < 60


def test_transparent_png_upload_becomes_white():
    im = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
    out = open_photo(encode(im, "PNG"), MAX_PIXELS)
    assert out.mode == "RGB" and np.all(np.asarray(out) == 255)


def test_heic_upload_opens():
    im = Image.new("RGB", (64, 48), (200, 30, 30))
    out = open_photo(encode(im, "HEIF"), MAX_PIXELS)
    assert out.mode == "RGB" and out.size == (64, 48)
    assert np.asarray(out)[..., 0].mean() > 150  # still mostly red after lossy compression


@pytest.mark.parametrize(
    ("data", "code"),
    [
        (b"", "empty_file"),
        (b"hello, this is not an image", "unsupported_format"),
        (encode(Image.new("RGB", (10, 10)), "GIF"), "unsupported_format"),
    ],
)
def test_bad_uploads_are_rejected(data, code):
    with pytest.raises(ImageRejected) as e:
        open_photo(data, MAX_PIXELS)
    assert e.value.code == code


def test_truncated_jpeg_is_rejected():
    noise = np.random.default_rng(0).integers(0, 255, (200, 200, 3), dtype=np.uint8)
    data = encode(Image.fromarray(noise), "JPEG")
    with pytest.raises(ImageRejected) as e:
        open_photo(data[: len(data) // 2], MAX_PIXELS)
    assert e.value.code == "corrupt_image"


def test_too_many_pixels_is_rejected():
    data = encode(Image.new("RGB", (300, 200)), "PNG")
    with pytest.raises(ImageRejected) as e:
        open_photo(data, max_pixels=50_000)  # 300 x 200 = 60,000 pixels
    assert e.value.code == "image_too_large"


# ---- model input ------------------------------------------------------------------------


def test_model_input_is_uint8_0_to_255_not_normalised():
    gradient = np.tile(np.linspace(0, 255, 300, dtype=np.uint8), (200, 1))
    im = Image.fromarray(np.stack([gradient] * 3, axis=-1))
    _, arr = load_photo(encode(im, "PNG"), 128, MAX_PIXELS)
    assert arr.shape == (128, 128, 3)
    assert arr.dtype == np.uint8
    assert arr.max() > 200  # still on the 0-255 scale; the model standardises internally


def test_center_box_is_the_crop_center_crop_resize_uses():
    rng = np.random.default_rng(1)
    im = Image.fromarray(rng.integers(0, 255, (90, 151, 3), dtype=np.uint8))  # odd sizes on purpose
    box = center_box(*im.size)
    assert box == (30, 0, 120, 90)
    expected = im.crop(box).resize((32, 32), Image.Resampling.LANCZOS)
    assert np.array_equal(np.asarray(center_crop_resize(im, 32)), np.asarray(expected))


# ---- dhash ------------------------------------------------------------------------------


def test_dhash_of_left_to_right_gradient_is_all_ones():
    # every pixel is brighter than its left neighbour, so all 64 bits are 1
    gradient = np.tile(np.linspace(0, 255, 90).astype(np.uint8), (80, 1))
    assert dhash(Image.fromarray(gradient)) == "f" * 16


def test_dhash_finds_near_copies_but_not_different_photos():
    rng = np.random.default_rng(2)
    photo = Image.fromarray(rng.integers(0, 255, (24, 27, 3), dtype=np.uint8)).resize((270, 240))
    resaved = Image.open(io.BytesIO(encode(photo.resize((135, 120)), "JPEG", quality=80)))
    other = Image.fromarray(rng.integers(0, 255, (24, 27, 3), dtype=np.uint8)).resize((270, 240))

    h = dhash(photo)
    assert len(h) == 16
    assert hamming(h, dhash(resaved)) <= 4  # same picture, smaller and re-compressed
    assert hamming(h, dhash(other)) > 4


# ---- zoom_boxes -------------------------------------------------------------------------


@pytest.mark.parametrize(("w", "h"), [(400, 300), (300, 400), (256, 256), (1000, 200)])
def test_zoom_boxes_are_squares_inside_the_photo(w, h):
    boxes = zoom_boxes(w, h)
    assert boxes[0] == center_box(w, h)  # first box = the plain centre crop
    assert len(boxes) == len(set(boxes))
    for left, top, right, bottom in boxes:
        assert right - left == bottom - top
        assert 0 <= left < right <= w and 0 <= top < bottom <= h
