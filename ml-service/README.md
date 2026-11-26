# ml-service

A small FastAPI service that loads the exported Keras model once and classifies photos.
Only the main API (`api/`) calls it; the web app never talks to it directly.

```
photo bytes ─► open_photo (EXIF fix, RGB, checks) ─► centre crop 128×128 (or zoom search)
            ─► CNN (standardises 0–255 pixels itself) ─► probabilities ─► top-3, bin, "not sure"
```

| File | What it does |
|---|---|
| `app/preprocessing.py` | Image decoding and preprocessing, ported unchanged from notebooks 01 and 02 |
| `app/model.py` | Loads `meta.json` + the model; `predict`, `zoom_search`, `grad_cam`, `overlay`, `verdict` ported from notebook 02 |
| `app/main.py` | The HTTP endpoints, upload limits, timeout and error messages |
| `app/config.py` | Settings from environment variables |
| `tests/` | pytest: preprocessing, model, HTTP API and the parity test against notebook 02 |

## Endpoints

| Method and path | Returns |
|---|---|
| `GET /health` | `{"status": "ok", "model_version": ...}` |
| `GET /model` | Classes, bins, threshold, test metrics and version, all from `meta.json` |
| `POST /predict` (form field `file`; query `zoom`, `tta`) | `model_version`, `top3`, `bin`, `confidence`, `unsure`, `threshold`, `crop_box`, `zoomed`, all `probs`, `dhash`, `latency_ms`; the bin-level answer `top_bin`, `bin_confidence`, `bin_unsure`; `battery_chance`, `battery_warning` |
| `POST /explain` (form field `file`; query `class_index`, `zoom`) | Grad-CAM overlay as a PNG (`X-Class`, `X-Model-Version` headers) |

Interactive docs: http://localhost:8001/docs once the service runs.

Errors always look like `{"detail": {"code": "...", "message": "..."}}`:

| HTTP | `code` | When |
|---|---|---|
| 413 | `file_too_large` | Upload bigger than `MAX_UPLOAD_MB` (default 8) |
| 413 | `image_too_large` | More pixels than `MAX_IMAGE_MEGAPIXELS` (default 60) |
| 415 | `unsupported_format` | Not a JPEG, PNG, WebP, BMP or HEIC image (checked on the decoded file, not its name) |
| 422 | `corrupt_image`, `empty_file`, `bad_class_index` | Damaged or empty file, or a class index out of range |
| 504 | `timeout` | Prediction took longer than `INFERENCE_TIMEOUT_S` (default 30) |

## Try it

With the service running (`docker compose up --build` from the repo root):

```bash
curl -F "file=@my_photo.jpg" "http://localhost:8001/predict"
```

```bash
curl -F "file=@my_photo.jpg" -o heatmap.png "http://localhost:8001/explain?zoom=false"
```

## Develop without Docker

Needs Python 3.12. From the `ml-service` folder:

```bash
python -m venv .venv
```

Activate it: `.venv\Scripts\Activate.ps1` in PowerShell, or `source .venv/bin/activate` on macOS/Linux. Then:

```bash
pip install -r requirements-dev.txt
```

```bash
pytest
```

```bash
uvicorn app.main:app --reload --port 8001
```

The tests do not need the real model: they build a tiny Keras model with the same layer names.
`ruff check .` and `ruff format .` keep the code style the same as in CI.
