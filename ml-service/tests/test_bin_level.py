"""Bin-level answers and the battery warning (Phase 2): what classify() adds on top of the class answer."""

import json
import shutil

import numpy as np
import pytest
from PIL import Image

import app.model as model_module
from app.model import BATTERY_WARN_AT, bin_probs

from .conftest import BINS, CLASS_NAMES


def a_photo() -> Image.Image:
    return Image.fromarray(np.random.default_rng(0).integers(0, 255, (90, 120, 3), dtype=np.uint8))


def probs_for(**classes: float) -> np.ndarray:
    """Probabilities with the named classes set and the rest shared evenly, so they sum to 1."""
    p = np.zeros(len(CLASS_NAMES), dtype="float32")
    for name, v in classes.items():
        p[CLASS_NAMES.index(name.replace("_", "-"))] = v
    rest = [i for i, v in enumerate(p) if v == 0]
    p[rest] = (1 - p.sum()) / len(rest)
    return p


@pytest.fixture
def answer_with(monkeypatch):
    """Makes the model answer every photo with the given probabilities."""

    def use(probs: np.ndarray):
        monkeypatch.setattr(model_module, "predict", lambda model, arr, tta=False: probs)

    return use


def test_bin_probs_sums_the_classes_in_each_bin():
    p = probs_for(brown_glass=0.3, green_glass=0.2, white_glass=0.1, plastic=0.2)
    per_bin = bin_probs(p, CLASS_NAMES, BINS)
    assert per_bin["brown bin"] == pytest.approx(0.6)
    assert sum(per_bin.values()) == pytest.approx(1.0)
    assert bin_probs(p, CLASS_NAMES, {}) == {}  # no bins in meta.json: no bin-level answer


def test_a_confident_class_gives_a_confident_bin(cnn_clf):
    r = cnn_clf.classify(a_photo())
    assert r["unsure"] is False
    assert r["top_bin"] == r["bin"] == "orange bin"
    assert r["bin_confidence"] >= r["confidence"]
    assert r["bin_unsure"] is False


def test_unsure_which_glass_but_sure_of_the_brown_bin(robust_clf, answer_with):
    answer_with(probs_for(brown_glass=0.35, green_glass=0.3, white_glass=0.2))
    r = robust_clf.classify(a_photo())
    assert r["unsure"] is True  # 35% is below the threshold
    assert r["top_bin"] == "brown bin"
    assert r["bin_confidence"] == pytest.approx(0.85, abs=1e-6)
    assert r["bin_unsure"] is False


def test_the_bin_can_differ_from_the_top_class_bin(robust_clf, answer_with):
    """Trash is the single most likely class, but plastic and metal together make the orange bin likelier."""
    answer_with(probs_for(trash=0.3, plastic=0.29, metal=0.29))
    r = robust_clf.classify(a_photo())
    assert r["bin"] == "general waste"  # where the top class goes, as before
    assert r["top_bin"] == "orange bin"
    assert r["bin_unsure"] is False


def test_unsure_of_the_bin_too(robust_clf, answer_with):
    answer_with(probs_for(trash=0.4, plastic=0.3, paper=0.2))
    r = robust_clf.classify(a_photo())
    assert r["unsure"] is True and r["bin_unsure"] is True


@pytest.mark.parametrize(
    ("probs", "warn"),
    [
        (probs_for(metal=0.8, battery=0.12), True),  # a can that might be a battery
        (probs_for(metal=0.8, battery=BATTERY_WARN_AT), True),  # from the level on, not just above it
        (probs_for(metal=0.9, battery=0.05), False),  # no real sign of a battery
        (probs_for(battery=0.9), False),  # a sure battery: the answer itself says e-waste
        (probs_for(battery=0.45, metal=0.4), True),  # battery on top but unsure: warn
    ],
)
def test_battery_warning(robust_clf, answer_with, probs, warn):
    answer_with(probs)
    r = robust_clf.classify(a_photo())
    assert r["battery_chance"] == pytest.approx(float(probs[CLASS_NAMES.index("battery")]))
    assert r["battery_warning"] is warn


def test_meta_json_can_set_the_battery_level(fake_model_dir, tmp_path):
    shutil.copytree(fake_model_dir, tmp_path, dirs_exist_ok=True)  # the shared folder stays as it is
    meta = json.loads((tmp_path / "meta.json").read_text())
    meta["battery_warn_at"] = 0.25
    (tmp_path / "meta.json").write_text(json.dumps(meta))
    assert model_module.WasteClassifier.load(tmp_path).battery_warn_at == 0.25
