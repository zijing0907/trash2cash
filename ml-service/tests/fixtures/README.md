# Parity test fixtures

`test_parity.py` checks that the service gives the same probabilities as notebook 02, within 1e-4.
It needs `golden.json` and the photos it lists, in this folder. Until they are here, the test is skipped.

## How to make them (in Colab)

1. Put 4–6 photos in `MyDrive/AML_Waste_Project/golden_photos/`. Cover the tricky cases:
   a normal JPEG, a phone photo taken sideways (EXIF rotation), a PNG with a transparent
   background and an iPhone HEIC.
2. Open `ml/notebooks/02_real_life_photo_demo.ipynb` on a **CPU runtime** (the Docker container runs
   on CPU too), run Part 1, then run this in a new cell:

```python
import hashlib, PIL, pillow_heif

GOLD_DIR = PROJECT_DIR / "golden_photos"
CNNS = [n for n in ("CNN", "CNN-robust") if n in MODELS]
golden = {
    "versions": {
        "tensorflow": tf.__version__,
        "keras": keras.__version__,
        "numpy": np.__version__,
        "pillow": PIL.__version__,
        "pillow_heif": pillow_heif.__version__,
    },
    "runs": {MODEL_KEYS[n]: META["models"][MODEL_KEYS[n]]["run"] for n in CNNS},
    "items": [],
}
for p in sorted(GOLD_DIR.iterdir()):
    _, arr = load_photo(p)  # same preprocessing as training
    golden["items"].append(
        {
            "file": p.name,
            "input_sha256": hashlib.sha256(arr.tobytes()).hexdigest(),
            "probs": {MODEL_KEYS[n]: predict(MODELS[n], arr).tolist() for n in CNNS},
        }
    )
(PROJECT_DIR / "golden.json").write_text(json.dumps(golden, indent=2))
print(len(golden["items"]), "photos ->", PROJECT_DIR / "golden.json")
```

3. Copy `golden.json` and the photos into this folder, keeping the file names.

## golden.json format

```json
{
  "versions": {"tensorflow": "...", "keras": "...", "numpy": "...", "pillow": "...", "pillow_heif": "..."},
  "runs": {"cnn": "CNN-B", "cnn_robust": "CNN-R"},
  "items": [
    {"file": "plastic_bottle.jpg",
     "input_sha256": "<sha256 of the 128x128x3 uint8 model input>",
     "probs": {"cnn": [12 floats], "cnn_robust": [12 floats]}}
  ]
}
```

`versions` matters: `ml-service/requirements.txt` is pinned to the same TensorFlow, Keras, NumPy and
Pillow versions, and the test prints both sets of versions if it fails.
