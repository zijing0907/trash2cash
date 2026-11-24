"""Loads the exported model once and runs it.

The functions marked "ported" are copied from notebook 02 (the cell with predict / zoom_search /
grad_cam / overlay / verdict). The only changes: values the notebook kept in global variables
(IMG_SIZE, CLASS_NAMES, UNSURE_BELOW) are passed in or read from the model, and grad_cam can
reuse a sub-model built once at start-up instead of building it on every call (same maths).
"""

import hashlib
import io
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import keras
import numpy as np
import tensorflow as tf
from matplotlib import colormaps
from PIL import Image

from .preprocessing import RESAMPLE, center_box, center_crop_resize, dhash, zoom_boxes

log = logging.getLogger(__name__)

# Models this service can serve, in order of preference (notebook 02: PRIMARY = "CNN-robust" if
# it exists, else "CNN"). The FCNN models are not served: they have no Grad-CAM layer.
SERVABLE_KEYS = ("cnn_robust", "cnn")


class ModelNotFound(RuntimeError):
    pass


# ---- ported from notebook 02 -------------------------------------------------------------


def predict(model: keras.Model, arr: np.ndarray, tta: bool = False) -> np.ndarray:
    """Class probabilities for one 0-255 uint8 image. tta=True also averages a mirrored copy and a tighter crop."""
    img_size = arr.shape[0]  # notebook: IMG_SIZE
    batch = [arr]
    if tta:
        batch.append(arr[:, ::-1])
        m = img_size // 10
        batch.append(np.asarray(Image.fromarray(arr[m:-m, m:-m]).resize((img_size, img_size), RESAMPLE)))
    x = tf.convert_to_tensor(np.stack(batch).astype("float32"))
    return model(x, training=False).numpy().mean(axis=0)


def zoom_search(model: keras.Model, im: Image.Image, top_k: int = 5) -> tuple[np.ndarray, tuple[int, ...], np.ndarray]:
    """Look at ~20 overlapping crops and average the top_k most confident ones (a consensus), so one odd crop
    cannot decide on its own. Returns (consensus probs, box of the crop that best shows the consensus class in
    the original photo's pixels, that crop's array)."""
    img_size = model.input_shape[1]  # notebook: IMG_SIZE
    f = max(1, min(im.size) // 1024)
    small = im.reduce(f) if f > 1 else im  # 12 MP phone photos: crop a smaller copy, much faster
    boxes = zoom_boxes(*small.size)
    crops = np.stack([np.asarray(small.crop(b).resize((img_size, img_size), RESAMPLE), dtype=np.uint8) for b in boxes])
    probs = np.asarray(model.predict(crops.astype("float32"), verbose=0, batch_size=64))
    best = np.argsort(-probs.max(1))[: min(top_k, len(probs))]
    cons = probs[best].mean(0)
    c = int(cons.argmax())
    k = int(probs[:, c].argmax())
    return cons, tuple(v * f for v in boxes[k]), crops[k]


def build_grad_model(model: keras.Model, layer_name: str) -> keras.Model:
    """Sub-model that outputs the Grad-CAM layer's feature map and the last hidden layer (head_relu)."""
    return keras.Model(model.inputs, [model.get_layer(layer_name).output, model.get_layer("head_relu").output])


def grad_cam(
    model: keras.Model,
    arr: np.ndarray,
    layer_name: str,
    class_idx: int | None = None,
    grad_model: keras.Model | None = None,
) -> np.ndarray:
    """Grad-CAM heat map (values 0-1, at the feature map's resolution) for one uint8 image."""
    out = model.get_layer("class_probs")  # rebuild the pre-softmax class score (Selvaraju et al., 2017)
    if grad_model is None:
        grad_model = build_grad_model(model, layer_name)
    x = tf.convert_to_tensor(arr[None].astype("float32"))
    with tf.GradientTape() as tape:
        fmap, h = grad_model(x, training=False)
        logits = tf.matmul(tf.cast(h, tf.float32), tf.convert_to_tensor(out.kernel)) + tf.convert_to_tensor(out.bias)
        if class_idx is None:
            class_idx = int(tf.argmax(logits[0]))
        score = logits[:, class_idx]
    grads = tf.cast(tape.gradient(score, fmap), tf.float32)
    fmap = tf.cast(fmap, tf.float32)
    cam = tf.nn.relu(tf.reduce_sum(fmap * tf.reduce_mean(grads, axis=(1, 2))[:, None, None, :], axis=-1))[0].numpy()
    return cam / (cam.max() + 1e-8)


def overlay(arr: np.ndarray, cam: np.ndarray, alpha: float = 0.45) -> np.ndarray:
    """Heat map on top of the model input. Returns floats 0-1. (notebook: plt.get_cmap("jet"), the same colour map)"""
    heat = np.asarray(Image.fromarray(np.uint8(cam * 255)).resize((arr.shape[1], arr.shape[0]), Image.BILINEAR)) / 255.0
    return np.clip((1 - alpha) * arr / 255.0 + alpha * colormaps["jet"](heat)[..., :3], 0, 1)


def verdict(probs: np.ndarray, class_names: list[str], threshold: float) -> str:
    k = int(np.argmax(probs))
    return class_names[k] if probs[k] >= threshold else f"not sure (maybe {class_names[k]})"


# ---- loading -----------------------------------------------------------------------------


def read_meta(model_dir: Path) -> dict:
    path = model_dir / "meta.json"
    if not path.exists():
        raise ModelNotFound(
            f"{path} not found. Copy the model export (meta.json + best_cnn*.keras) into this folder; "
            "see ml-service/models/README.md."
        )
    return json.loads(path.read_text())


def choose_model_key(meta: dict, model_dir: Path, requested: str | None = None) -> str:
    """The model to serve: `requested` (the MODEL_KEY setting) if given, else cnn_robust if its file
    exists, else cnn."""
    models = meta.get("models", {})

    def file_exists(key: str) -> bool:
        return key in models and (model_dir / models[key]["file"]).exists()

    if requested:
        if requested not in SERVABLE_KEYS:
            raise ModelNotFound(f"MODEL_KEY must be one of {', '.join(SERVABLE_KEYS)}; got {requested!r}.")
        if not file_exists(requested):
            raise ModelNotFound(f"MODEL_KEY={requested} but meta.json has no such model or its file is missing.")
        return requested
    for key in SERVABLE_KEYS:
        if file_exists(key):
            return key
    raise ModelNotFound(f"No CNN model file found in {model_dir} (looked for {', '.join(SERVABLE_KEYS)} in meta.json).")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


@dataclass
class WasteClassifier:
    """Everything needed to serve one model. Created once at start-up by WasteClassifier.load()."""

    meta: dict
    key: str
    model: keras.Model
    version: str  # "<run name>@<first 8 hex digits of the file's sha256>", stored with every scan
    threshold: float  # below this confidence the answer is "not sure"
    gradcam_layer: str
    grad_model: keras.Model = field(repr=False)
    available_keys: list[str] = field(default_factory=list)

    @classmethod
    def load(cls, model_dir: Path, requested_key: str | None = None) -> "WasteClassifier":
        meta = read_meta(model_dir)
        key = choose_model_key(meta, model_dir, requested_key)
        info = meta["models"][key]
        path = model_dir / info["file"]

        t0 = time.perf_counter()
        model = keras.models.load_model(path, compile=False)
        model.compile(jit_compile=False)  # as in notebook 02: plain TensorFlow, no XLA compilation
        layer = info.get("gradcam_layer") or meta["gradcam_layer"]
        # notebook 02: the robust model has its own threshold, chosen on its validation data
        threshold = meta.get("unsure_below_robust", 0.5) if key == "cnn_robust" else meta.get("unsure_below", 0.5)

        clf = cls(
            meta=meta,
            key=key,
            model=model,
            version=f"{info['run']}@{file_sha256(path)[:8]}",
            threshold=float(threshold),
            gradcam_layer=layer,
            grad_model=build_grad_model(model, layer),
            available_keys=[
                k for k in SERVABLE_KEYS if k in meta["models"] and (model_dir / meta["models"][k]["file"]).exists()
            ],
        )
        clf.warm_up()
        log.info(
            "Loaded %s (%s) in %.1fs; 'not sure' below %.2f; Grad-CAM layer %s",
            key, clf.version, time.perf_counter() - t0, clf.threshold, layer,
        )  # fmt: skip
        if meta.get("quick_run"):
            log.warning("meta.json says quick_run=true: this model was trained for 2 epochs only, for testing.")
        return clf

    # ---- values from meta.json ----

    @property
    def info(self) -> dict:
        return self.meta["models"][self.key]

    @property
    def class_names(self) -> list[str]:
        return self.meta["class_names"]

    @property
    def img_size(self) -> int:
        return int(self.meta["img_size"])

    @property
    def bins(self) -> dict[str, str]:
        return self.meta.get("bins", {})

    @property
    def use_tta(self) -> bool:
        return bool(self.info.get("use_tta", False))  # notebook 01 decides this on validation data

    @property
    def metrics(self) -> dict[str, float]:
        return {k: v for k, v in self.info.items() if k.startswith("test_")}

    # ---- inference ----

    def warm_up(self) -> None:
        """Run every code path once, so TensorFlow builds its graphs before the first real request."""
        grey = Image.new("RGB", (self.img_size * 2, self.img_size * 2), (128, 128, 128))
        arr = np.asarray(center_crop_resize(grey, self.img_size), dtype=np.uint8)
        predict(self.model, arr, tta=True)
        zoom_search(self.model, grey)
        grad_cam(self.model, arr, self.gradcam_layer, grad_model=self.grad_model)

    def answer(
        self, im: Image.Image, zoom: bool, tta: bool = False
    ) -> tuple[np.ndarray, np.ndarray, tuple[int, ...], bool]:
        """Class probabilities for a photo, as notebook 02's app_predict computes them: the centre crop, and with
        zoom=True an even blend of that and the zoom-search consensus. Returns (probs, the model input Grad-CAM
        explains, crop box in the photo, zoomed?)."""
        arr = np.asarray(center_crop_resize(im, self.img_size), dtype=np.uint8)
        probs = predict(self.model, arr, tta)
        if zoom:
            zp, box, zarr = zoom_search(self.model, im)
            return 0.5 * probs + 0.5 * zp, zarr, box, True
        return probs, arr, center_box(*im.size), False

    def classify(self, im: Image.Image, zoom: bool = False, tta: bool | None = None) -> dict:
        """Everything /predict returns, except latency."""
        tta = self.use_tta if tta is None else tta
        probs, _, box, zoomed = self.answer(im, zoom, tta)
        k = int(np.argmax(probs))
        top3 = [int(i) for i in np.argsort(probs)[::-1][:3]]
        # "Not sure" uses the same threshold with or without zoom search, as notebook 02 now does too
        unsure = bool(probs[k] < self.threshold)
        log.info("predict %s: %s (%.2f)%s", self.version, verdict(probs, self.class_names, self.threshold),
                 probs[k], " zoomed" if zoomed else "")  # fmt: skip
        return {
            "model_version": self.version,
            "top3": [{"class": self.class_names[i], "prob": float(probs[i])} for i in top3],
            "class_index": k,
            "bin": self.bins.get(self.class_names[k]),
            "confidence": float(probs[k]),
            "unsure": unsure,
            "threshold": self.threshold,
            "crop_box": [int(v) for v in box],
            "zoomed": zoomed,
            "tta": tta,
            "probs": {c: float(p) for c, p in zip(self.class_names, probs, strict=True)},
            "dhash": dhash(im),
        }

    def explain_png(self, im: Image.Image, class_idx: int | None = None, zoom: bool = False) -> tuple[bytes, int]:
        """Grad-CAM overlay as PNG bytes for the same photo and zoom setting as /predict: the centre crop, or with
        zoom the crop that best shows the answer (notebook 02). class_idx None = the class /predict answers.
        Returns (png bytes, class index explained)."""
        probs, arr, _, _ = self.answer(im, zoom)
        if class_idx is None:
            class_idx = int(np.argmax(probs))
        cam = grad_cam(self.model, arr, self.gradcam_layer, class_idx, grad_model=self.grad_model)
        heat = np.uint8(overlay(arr, cam) * 255)  # as in notebook 02's web app
        buf = io.BytesIO()
        Image.fromarray(heat).save(buf, format="PNG")
        return buf.getvalue(), class_idx
