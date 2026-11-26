"""Unit tests for app/model.py, using the tiny fake models from conftest.py."""

import io
import json
import re
import shutil

import numpy as np
import pytest
from PIL import Image

import app.model as model_module
from app.model import ModelNotFound, choose_model_key, grad_cam, overlay, predict, read_meta, verdict
from app.preprocessing import center_box, center_crop_resize

from .conftest import CLASS_NAMES, FAKE_IMG_SIZE


def a_photo(w=120, h=90, seed=0) -> Image.Image:
    rng = np.random.default_rng(seed)
    return Image.fromarray(rng.integers(0, 255, (h, w, 3), dtype=np.uint8))


def model_input(im: Image.Image) -> np.ndarray:
    return np.asarray(center_crop_resize(im, FAKE_IMG_SIZE), dtype=np.uint8)


# ---- choosing and loading the model ------------------------------------------------------


def test_default_prefers_the_robust_model(fake_model_dir):
    meta = read_meta(fake_model_dir)
    assert choose_model_key(meta, fake_model_dir) == "cnn_robust"
    assert choose_model_key(meta, fake_model_dir, "cnn") == "cnn"


def test_falls_back_to_cnn_when_robust_file_is_missing(fake_model_dir, tmp_path):
    shutil.copy(fake_model_dir / "meta.json", tmp_path)
    shutil.copy(fake_model_dir / "best_cnn.keras", tmp_path)
    assert choose_model_key(read_meta(tmp_path), tmp_path) == "cnn"


@pytest.mark.parametrize("bad_key", ["fcnn", "nonsense"])
def test_unservable_model_key_is_an_error(fake_model_dir, bad_key):
    with pytest.raises(ModelNotFound):
        choose_model_key(read_meta(fake_model_dir), fake_model_dir, bad_key)


def test_missing_meta_json_explains_what_to_do(tmp_path):
    with pytest.raises(ModelNotFound, match="models/README.md"):
        read_meta(tmp_path)


def test_no_model_files_is_an_error(fake_model_dir, tmp_path):
    shutil.copy(fake_model_dir / "meta.json", tmp_path)
    with pytest.raises(ModelNotFound):
        choose_model_key(read_meta(tmp_path), tmp_path)


def test_version_threshold_and_gradcam_layer(cnn_clf, robust_clf, fake_model_dir):
    meta = json.loads((fake_model_dir / "meta.json").read_text())
    assert re.fullmatch(r"CNN-test@[0-9a-f]{8}", cnn_clf.version)
    assert re.fullmatch(r"CNN-R-test@[0-9a-f]{8}", robust_clf.version)
    assert cnn_clf.threshold == meta["unsure_below"]  # notebook 02: plain CNN uses unsure_below
    assert robust_clf.threshold == meta["unsure_below_robust"]  # ...and the robust CNN its own threshold
    assert cnn_clf.gradcam_layer == "block4b_relu"  # from the top-level gradcam_layer
    assert cnn_clf.metrics == {"test_macro_f1": 0.5}
    assert cnn_clf.available_keys == ["cnn_robust", "cnn"]  # the FCNN file does not exist


# ---- ported functions ------------------------------------------------------------------


def test_predict_returns_probabilities(cnn_clf):
    arr = model_input(a_photo())
    for tta in (False, True):
        p = predict(cnn_clf.model, arr, tta=tta)
        assert p.shape == (len(CLASS_NAMES),)
        assert p.sum() == pytest.approx(1.0, abs=1e-5)


def test_cached_grad_model_gives_the_same_heat_map(cnn_clf):
    arr = model_input(a_photo())
    cached = grad_cam(cnn_clf.model, arr, "block4b_relu", 3, grad_model=cnn_clf.grad_model)
    rebuilt = grad_cam(cnn_clf.model, arr, "block4b_relu", 3)  # the notebook builds it on every call
    np.testing.assert_allclose(cached, rebuilt, atol=1e-6)
    assert cached.min() >= 0 and cached.max() <= 1


def test_overlay_is_an_rgb_image_in_0_1(cnn_clf):
    arr = model_input(a_photo())
    out = overlay(arr, np.random.default_rng(0).random((8, 8)))
    assert out.shape == (FAKE_IMG_SIZE, FAKE_IMG_SIZE, 3)
    assert out.min() >= 0 and out.max() <= 1


def test_verdict():
    probs = np.array([0.1, 0.7, 0.2])
    assert verdict(probs, ["a", "b", "c"], 0.5) == "b"
    assert verdict(probs, ["a", "b", "c"], 0.8) == "not sure (maybe b)"


# ---- classify / explain ----------------------------------------------------------------


def test_confident_prediction(cnn_clf):
    im = a_photo(120, 90)
    r = cnn_clf.classify(im)
    assert r["top3"][0]["class"] == "plastic"
    assert r["bin"] == "orange bin"
    assert r["confidence"] > 0.9 and r["unsure"] is False
    assert [t["prob"] for t in r["top3"]] == sorted((t["prob"] for t in r["top3"]), reverse=True)
    assert sum(r["probs"].values()) == pytest.approx(1.0, abs=1e-5)
    assert r["crop_box"] == list(center_box(120, 90))
    assert r["zoomed"] is False and r["tta"] is False
    assert len(r["dhash"]) == 16


def test_low_confidence_is_not_sure(robust_clf):
    r = robust_clf.classify(a_photo())
    assert r["confidence"] < robust_clf.threshold
    assert r["unsure"] is True
    assert len(r["top3"]) == 3  # the UI offers these three to choose from


class CropModel:
    """Stands in for the Keras model inside zoom_search: answers each crop with a row of prepared probabilities."""

    input_shape = (None, FAKE_IMG_SIZE, FAKE_IMG_SIZE, 3)

    def __init__(self, rows):
        self.rows = rows

    def predict(self, x, verbose=0, batch_size=64):
        out = np.full((len(x), len(CLASS_NAMES)), 1 / len(CLASS_NAMES), dtype="float32")
        for i, row in self.rows.items():
            out[i] = row
        return out


def probs_for(**classes) -> np.ndarray:
    p = np.zeros(len(CLASS_NAMES), dtype="float32")
    for name, v in classes.items():
        p[CLASS_NAMES.index(name.replace("_", "-"))] = v
    return p


def test_zoom_search_averages_the_five_surest_crops():
    """notebook 02: one odd crop cannot decide alone; the 5 most confident crops are averaged, and the box is the
    crop that shows the consensus class best."""
    rows = {0: probs_for(battery=1.0)}  # one very confident odd crop
    rows.update({i: probs_for(metal=0.8, plastic=0.2) for i in (1, 2, 3)})
    rows[4] = probs_for(metal=0.9, plastic=0.1)  # the clearest view of the consensus class
    im = a_photo(120, 90)
    cons, box, crop = model_module.zoom_search(CropModel(rows), im)
    assert CLASS_NAMES[int(cons.argmax())] == "metal"
    assert cons[CLASS_NAMES.index("metal")] == pytest.approx((0.8 * 3 + 0.9) / 5)
    assert box == model_module.zoom_boxes(120, 90)[4]
    assert crop.shape == (FAKE_IMG_SIZE, FAKE_IMG_SIZE, 3)


def test_zoom_blends_the_centre_crop_with_the_consensus(cnn_clf, monkeypatch):
    """notebook 02's app: with zoom, the answer is an even blend of the plain view and the zoom consensus."""
    cons = probs_for(metal=1.0)
    crop = np.full((FAKE_IMG_SIZE, FAKE_IMG_SIZE, 3), 200, dtype=np.uint8)
    monkeypatch.setattr(model_module, "zoom_search", lambda model, im: (cons, (10, 5, 50, 45), crop))

    im = a_photo(120, 90)
    plain = predict(cnn_clf.model, model_input(im))
    r = cnn_clf.classify(im, zoom=True)
    assert r["zoomed"] is True
    assert r["crop_box"] == [10, 5, 50, 45]
    for c in ("plastic", "metal"):
        expected = 0.5 * plain[CLASS_NAMES.index(c)] + 0.5 * cons[CLASS_NAMES.index(c)]
        assert r["probs"][c] == pytest.approx(expected, abs=1e-6)


def test_zoomed_answer_below_the_threshold_is_not_sure(robust_clf, monkeypatch):
    """The same threshold applies with and without zoom (notebook 02 and docs/decisions.md 2.6)."""
    cons = np.full(len(CLASS_NAMES), 1 / len(CLASS_NAMES), dtype="float32")
    crop = np.full((FAKE_IMG_SIZE, FAKE_IMG_SIZE, 3), 200, dtype=np.uint8)
    monkeypatch.setattr(model_module, "zoom_search", lambda model, im: (cons, (10, 5, 50, 45), crop))

    r = robust_clf.classify(a_photo(), zoom=True)
    assert r["zoomed"] is True
    assert r["confidence"] < robust_clf.threshold
    assert r["unsure"] is True


def test_without_zoom_the_box_is_the_centre_square(cnn_clf):
    r = cnn_clf.classify(a_photo(120, 90), zoom=False)
    assert r["zoomed"] is False
    assert r["crop_box"] == list(center_box(120, 90))


def test_real_zoom_search_runs_on_a_big_photo(cnn_clf):
    r = cnn_clf.classify(a_photo(2400, 1800), zoom=True)  # > 1024 px, so zoom search shrinks it first
    left, top, right, bottom = r["crop_box"]
    assert 0 <= left < right <= 2400 and 0 <= top < bottom <= 1800


def test_explain_returns_a_png_of_the_model_input(cnn_clf):
    png, k = cnn_clf.explain_png(a_photo())
    assert k == CLASS_NAMES.index("plastic")  # default = the predicted class
    im = Image.open(io.BytesIO(png))
    assert im.format == "PNG" and im.size == (FAKE_IMG_SIZE, FAKE_IMG_SIZE)

    _, k = cnn_clf.explain_png(a_photo(), class_idx=0)
    assert k == 0
