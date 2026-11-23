"""Image preprocessing. It must match what the model saw in training, so the functions marked
"ported" are copied from the notebooks unchanged (only comments and type hints added).

Sources (update both places if a notebook changes):
- to_rgb, center_crop_resize, open_photo, load_photo: notebook 02, cell "Same preprocessing as in training"
- zoom_boxes: notebook 02, the cell with predict / zoom_search / grad_cam
- dhash: notebook 01, the data audit cell

Pixel values stay 0-255. The model standardises them itself (its "standardise" Normalization
layer), so we must NOT divide by 255 or normalise here.
"""

import io

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()  # lets Image.open read iPhone .heic / .heif photos

RESAMPLE = getattr(Image, "Resampling", Image).LANCZOS

# Decoded formats we accept. We check what Pillow actually decoded, not the file name or the
# Content-Type the browser sent, because both can be wrong or faked. MPO is what some phones
# call a JPEG with extra embedded images. This matches IMG_EXTS in notebook 02.
ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "HEIF", "BMP"}


class ImageRejected(ValueError):
    """The upload cannot be used. `code` is a stable string the web app can turn into a message."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ---- ported from notebook 02 -------------------------------------------------------------


def to_rgb(im: Image.Image) -> Image.Image:
    """Transparent areas become white (like the white backgrounds in the dataset)."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        return bg
    return im.convert("RGB")


def center_crop_resize(im: Image.Image, size: int) -> Image.Image:
    """Centre square crop, then resize to size x size with Lanczos."""
    w, h = im.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    return im.crop((left, top, left + s, top + s)).resize((size, size), RESAMPLE)


def zoom_boxes(w: int, h: int, fracs=(1.0, 0.75, 0.55)) -> list[tuple[int, int, int, int]]:
    """Overlapping square crops (left, top, right, bottom) at three sizes, sliding along both axes.
    The first box is the plain centre crop, so zoom search can always fall back to the normal view."""
    s0 = min(w, h)
    boxes = [((w - s0) // 2, (h - s0) // 2, (w - s0) // 2 + s0, (h - s0) // 2 + s0)]
    for f in fracs:
        side = int(round(s0 * f))
        nx = 1 + int(np.ceil((w - side) / (side / 2))) if w > side else 1
        ny = 1 + int(np.ceil((h - side) / (side / 2))) if h > side else 1
        for x in np.linspace(0, w - side, nx):
            for y in np.linspace(0, h - side, ny):
                b = (int(x), int(y), int(x) + side, int(y) + side)
                if b not in boxes:
                    boxes.append(b)
    return boxes


# ---- ported from notebook 01 -------------------------------------------------------------


def dhash(im: Image.Image, hash_size: int = 8) -> str:
    """Difference hash: 64 bits as 16 hex characters. Near-identical photos (re-saved, resized)
    get hashes that differ in only a few bits (notebook 01 treats Hamming distance <= 4 as a copy)."""
    g = np.asarray(im.convert("L").resize((hash_size + 1, hash_size), RESAMPLE), dtype=np.int16)
    return np.packbits((g[:, 1:] > g[:, :-1]).flatten()).tobytes().hex()


# ---- service versions of open_photo / load_photo -------------------------------------------


def center_box(w: int, h: int) -> tuple[int, int, int, int]:
    """The box center_crop_resize cuts out, in the photo's pixels (returned to the client as crop_box)."""
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    return left, top, left + s, top + s


def open_photo(data: bytes, max_pixels: int) -> Image.Image:
    """Bytes of an uploaded file -> upright RGB image.

    Same steps as notebook 02's open_photo for raw bytes: Image.open -> EXIF rotation fix -> to_rgb.
    (The notebook version also accepted Gradio editor values and numpy arrays; the service only
    receives bytes.) Added for the service: checks that the upload is a supported, undamaged image
    of a sensible size. Raises ImageRejected otherwise.
    """
    if not data:
        raise ImageRejected("empty_file", "The uploaded file is empty.")
    try:
        im = Image.open(io.BytesIO(data))  # reads only the header, so size checks are cheap
    except UnidentifiedImageError:
        raise ImageRejected(
            "unsupported_format", "This file is not an image we can read. Use a JPEG, PNG, WebP or HEIC photo."
        ) from None
    except Image.DecompressionBombError:
        raise ImageRejected("image_too_large", "The image has too many pixels.") from None
    if im.format not in ALLOWED_FORMATS:
        raise ImageRejected(
            "unsupported_format", f"{im.format} images are not supported. Use a JPEG, PNG, WebP or HEIC photo."
        )
    w, h = im.size
    if w * h > max_pixels:
        raise ImageRejected(
            "image_too_large",
            f"The image is {w}x{h} pixels; the limit is {max_pixels / 1e6:.0f} megapixels.",
        )
    try:
        return to_rgb(ImageOps.exif_transpose(im))
    except (OSError, SyntaxError, ValueError):  # truncated or damaged file, found while decoding
        raise ImageRejected("corrupt_image", "The image file is damaged or incomplete.") from None


def load_photo(data: bytes, img_size: int, max_pixels: int) -> tuple[Image.Image, np.ndarray]:
    """Returns (upright RGB photo, model input as a uint8 array of shape img_size x img_size x 3)."""
    im = open_photo(data, max_pixels)
    return im, np.asarray(center_crop_resize(im, img_size), dtype=np.uint8)
