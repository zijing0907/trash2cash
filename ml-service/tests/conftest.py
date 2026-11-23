"""Shared test fixtures.

The real model files are not needed for most tests. Instead we build a tiny Keras model with the
same input and the same layer names the service relies on ("block4b_relu" for Grad-CAM,
"head_relu" and "class_probs" to rebuild the class score), save it like the notebooks do, and
write a meta.json in the same format. So the whole path (meta.json -> load_model -> predict ->
HTTP) is tested in seconds, also in CI.

The numbers in the fake meta.json are test values, not real results.
"""

import io
import json
from pathlib import Path

import keras
import numpy as np
import pytest
from fastapi.testclient import TestClient
from keras import layers
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.model import WasteClassifier

CLASS_NAMES = [
    "battery", "biological", "brown-glass", "cardboard", "clothes", "green-glass",
    "metal", "paper", "plastic", "shoes", "trash", "white-glass",
]  # fmt: skip
# Notebook 01's mapping of the 12 classes to Malaysian bins
BINS = {
    "paper": "blue bin", "cardboard": "blue bin",
    "brown-glass": "brown bin", "green-glass": "brown bin", "white-glass": "brown bin",
    "plastic": "orange bin", "metal": "orange bin",
    "battery": "e-waste collection", "clothes": "textile donation", "shoes": "textile donation",
    "biological": "food waste", "trash": "general waste",
}  # fmt: skip
FAKE_IMG_SIZE = 32  # deliberately not 128, so a hard-coded 128 anywhere in the service would fail the tests


def build_tiny_cnn(img_size: int, favourite: int | None) -> keras.Model:
    """A miniature of notebook 01's build_cnn with the same layer names.
    favourite=None: almost uniform probabilities (always "not sure").
    favourite=k: the bias makes class k win with ~99% for any photo."""
    keras.utils.set_random_seed(0)
    inp = keras.Input((img_size, img_size, 3), name="image")  # raw 0-255 RGB, like the real model
    x = layers.Normalization(mean=[127.5] * 3, variance=[5000.0] * 3, name="standardise")(inp)
    x = layers.Conv2D(8, 3, padding="same", use_bias=False, name="block4b_conv")(x)
    x = layers.BatchNormalization(name="block4b_bn")(x)
    x = layers.Activation("relu", name="block4b_relu")(x)
    x = layers.MaxPooling2D(2, name="block4_pool")(x)
    x = layers.GlobalAveragePooling2D(name="gap")(x)
    x = layers.Dense(16, use_bias=False, name="head_dense")(x)
    x = layers.BatchNormalization(name="head_bn")(x)
    x = layers.Activation("relu", name="head_relu")(x)
    x = layers.Dropout(0.4, name="head_dropout2")(x)
    out = layers.Dense(len(CLASS_NAMES), activation="softmax", name="class_probs")(x)
    model = keras.Model(inp, out, name="tiny_cnn")

    kernel, bias = model.get_layer("class_probs").get_weights()
    bias = np.zeros_like(bias)
    if favourite is not None:
        bias[favourite] = 8.0
    model.get_layer("class_probs").set_weights([kernel * 0.01, bias])
    return model


@pytest.fixture(scope="session")
def fake_model_dir(tmp_path_factory) -> Path:
    """An export folder like notebook 01 + 03 write: cnn = confident 'plastic', cnn_robust = always unsure."""
    d = tmp_path_factory.mktemp("models")
    build_tiny_cnn(FAKE_IMG_SIZE, favourite=CLASS_NAMES.index("plastic")).save(d / "best_cnn.keras")
    build_tiny_cnn(FAKE_IMG_SIZE, favourite=None).save(d / "best_cnn_robust.keras")
    meta = {
        "class_names": CLASS_NAMES,
        "img_size": FAKE_IMG_SIZE,
        "preprocessing": "test",
        "gradcam_layer": "block4b_relu",
        "unsure_below": 0.6,
        "unsure_below_robust": 0.55,
        "bins": BINS,
        "models": {
            "fcnn": {"run": "FCNN-test", "file": "best_fcnn.keras", "use_tta": False},  # file absent on purpose
            "cnn": {"run": "CNN-test", "file": "best_cnn.keras", "use_tta": False, "test_macro_f1": 0.5},
            "cnn_robust": {
                "run": "CNN-R-test",
                "file": "best_cnn_robust.keras",
                "gradcam_layer": "block4b_relu",
                "test_macro_f1": 0.4,
            },  # fmt: skip
        },
        "dataset": "test",
        "quick_run": False,
    }
    (d / "meta.json").write_text(json.dumps(meta))
    return d


def make_settings(model_dir: Path, model_key: str | None = None, **overrides) -> Settings:
    values = dict(
        model_dir=model_dir,
        model_key=model_key,
        max_upload_bytes=1 * 1024 * 1024,
        max_image_pixels=4_000_000,
        inference_timeout_s=30.0,
    )
    values.update(overrides)
    return Settings(**values)


@pytest.fixture(scope="session")
def cnn_clf(fake_model_dir) -> WasteClassifier:
    return WasteClassifier.load(fake_model_dir, "cnn")


@pytest.fixture(scope="session")
def robust_clf(fake_model_dir) -> WasteClassifier:
    return WasteClassifier.load(fake_model_dir, "cnn_robust")


@pytest.fixture(scope="session")
def client(fake_model_dir):
    """Service with the confident fake model (MODEL_KEY=cnn)."""
    with TestClient(create_app(make_settings(fake_model_dir, "cnn"))) as c:
        yield c


@pytest.fixture(scope="session")
def default_client(fake_model_dir):
    """Service with no MODEL_KEY: picks cnn_robust, the always-unsure fake model."""
    with TestClient(create_app(make_settings(fake_model_dir))) as c:
        yield c


def photo_bytes(size=(120, 90), fmt="JPEG", seed=0) -> bytes:
    rng = np.random.default_rng(seed)
    im = Image.fromarray(rng.integers(0, 255, (size[1], size[0], 3), dtype=np.uint8))
    buf = io.BytesIO()
    im.save(buf, format=fmt)
    return buf.getvalue()
