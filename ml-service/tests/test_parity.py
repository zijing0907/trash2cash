"""Preprocessing parity test (project brief, section 9): the service must give the same probabilities
as notebook 02 for the same photos, within 1e-4.

It needs two things that are not in the repo yet, and is skipped until both are there:
- the real model export in ml-service/models/ (meta.json + best_cnn*.keras), see models/README.md
- tests/fixtures/golden.json and the photos it lists, made in notebook 02 (see fixtures/README.md)

Each photo goes through POST /predict with zoom and TTA off, like the notebook's plain predict().
For every photo the test also compares a hash of the 128 x 128 model input, so a failure tells you
where the difference comes from: the preprocessing (Pillow decoding/resizing) or the model (TensorFlow).
"""

import dataclasses
import hashlib
import json
from importlib.metadata import version
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import load_settings
from app.main import create_app
from app.preprocessing import load_photo

TOLERANCE = 1e-4
FIXTURES = Path(__file__).parent / "fixtures"
GOLDEN_PATH = FIXTURES / "golden.json"
GOLDEN = json.loads(GOLDEN_PATH.read_text()) if GOLDEN_PATH.exists() else None
MODEL_KEYS = sorted({key for item in GOLDEN["items"] for key in item["probs"]}) if GOLDEN else []

pytestmark = pytest.mark.skipif(GOLDEN is None, reason="tests/fixtures/golden.json not provided yet")


def installed_versions() -> dict[str, str]:
    names = {"tensorflow": "tensorflow-cpu", "keras": "keras", "numpy": "numpy", "pillow": "pillow",
             "pillow_heif": "pillow-heif"}  # fmt: skip
    return {k: version(dist) for k, dist in names.items()}


@pytest.mark.parametrize("model_key", MODEL_KEYS)
def test_service_matches_notebook_02(model_key):
    settings = dataclasses.replace(load_settings(), model_key=model_key)
    meta_path = settings.model_dir / "meta.json"
    if not meta_path.exists():
        pytest.skip(f"no model export in {settings.model_dir}")
    meta = json.loads(meta_path.read_text())
    if model_key not in meta["models"] or not (settings.model_dir / meta["models"][model_key]["file"]).exists():
        pytest.skip(f"model file for {model_key} not in {settings.model_dir}")

    problems = []
    with TestClient(create_app(settings)) as client:
        class_names = client.get("/model").json()["class_names"]
        for item in GOLDEN["items"]:
            if model_key not in item["probs"]:
                continue
            data = (FIXTURES / item["file"]).read_bytes()

            _, arr = load_photo(data, meta["img_size"], settings.max_image_pixels)
            same_input = hashlib.sha256(arr.tobytes()).hexdigest() == item["input_sha256"]

            r = client.post("/predict?zoom=false&tta=false", files={"file": (item["file"], data)})
            assert r.status_code == 200, f"{item['file']}: {r.text}"
            ours = np.array([r.json()["probs"][c] for c in class_names])
            diff = float(np.abs(ours - np.array(item["probs"][model_key])).max())

            if diff > TOLERANCE or not same_input:
                where = "model (TensorFlow)" if same_input else "preprocessing (model input differs)"
                problems.append(f"{item['file']}: max difference {diff:.2e}; cause: {where}")

    assert not problems, (
        f"{model_key} does not match notebook 02 within {TOLERANCE}:\n  "
        + "\n  ".join(problems)
        + f"\nVersions in Colab: {GOLDEN.get('versions')}\nVersions here:     {installed_versions()}"
    )
