# Design decisions

One entry per milestone: what was chosen, the alternatives, and why.

## Milestone 1 — repo scaffold and ML service (23 Nov 2026)

### 1. A new repo for the product, notebooks copied in
- **Chose:** a new `trash2cash` repo. The three notebooks are copied into `ml/notebooks/`, and
  `ml/README.md` links back to the original coursework repo (commit `c68f468`) and credits the group.
- **Alternatives:** build inside the coursework repo `machine-learning`; use a git submodule.
- **Why:** the coursework repo stays an unchanged record of the group assignment, and the product gets
  a clear name and its own deployments. A submodule is harder to clone and explain for little gain,
  because the notebooks are only read here, never run.

### 2. The model runs in its own service
- **Chose:** `ml-service/`, a small FastAPI app that loads the model once and only does inference.
  The main API (Milestone 2) calls it over internal HTTP.
- **Alternatives:** load TensorFlow inside the main API.
- **Why:** TensorFlow is large (the image is about 2.3 GB) and needs much more RAM than a normal web API.
  Separating them lets the API stay small and restart fast, lets each be hosted where it fits
  (Milestone 4), and means a model crash cannot take down login or points.

### 3. Port the notebook code unchanged, then prove it with tests
- **Chose:** `to_rgb`, `center_crop_resize`, `zoom_boxes`, `dhash`, `predict`, `zoom_search`,
  `grad_cam`, `overlay` and `verdict` are copied from notebooks 01 and 02. The only changes:
  globals (`IMG_SIZE`, `CLASS_NAMES`, `UNSURE_BELOW`) become arguments or are read from the model,
  `plt.get_cmap("jet")` became `matplotlib.colormaps["jet"]` (the same colour map), and the Grad-CAM
  sub-model is built once at start-up instead of on every call.
- **Alternatives:** rewrite the preprocessing in a cleaner style, or with another image library.
- **Why:** the model only works if it sees the same pixels it was trained on. Even a different resize
  filter changes the probabilities. Copying keeps the behaviour, and the tests check it:
  - `test_parity.py` (the brief's quality bar) compares `/predict` with probabilities that notebook 02
    produced, within 1e-4. It also compares a SHA-256 hash of the 128×128 model input, so a failure
    tells you whether the preprocessing or TensorFlow differs. It is skipped until `golden.json` and
    the model files are added.
  - Already checked during development: notebook 02's own functions, run from the notebook file,
    and the service gave identical model inputs, zoom boxes, TTA results and Grad-CAM images
    (difference 0.0) on 5 test photos (JPEG, sideways JPEG, transparent PNG, HEIC, 12 MP) with a
    stand-in model. The real model still has to pass `test_parity.py`.
  - `test_model.py` checks that the cached Grad-CAM sub-model gives the same heat map as building it
    each time, as the notebook does.

### 4. Which model is served, and its version
- **Chose:** `cnn_robust` if its file exists, otherwise `cnn`, as notebook 02 picks its main model.
  `MODEL_KEY` can force one. The version is `<run name>@<first 8 hex digits of the file's SHA-256>`,
  for example `CNN-R@1a2b3c4d`.
- **Alternatives:** version from the file's date or a number typed by hand.
- **Why:** the run name says which experiment it is. The hash changes whenever the weights change,
  even if someone re-exports with the same run name, so every stored scan can be traced to the exact file.
- The FCNN is not served: it has no Grad-CAM layer and is about 50 MB. Its file is git-ignored.

### 5. `meta.json` is the only source of class names, bins, thresholds and metrics
- **Why:** the service never hard-codes them, so a retrained model only needs a new export folder.
  The tests use a fake `meta.json` with a 32-pixel image size precisely so that a hard-coded 128 would
  fail them.

### 6. "Not sure" and zoom search
- **Chose:** `unsure = confidence < threshold`, with the threshold from `meta.json` (`unsure_below` or
  `unsure_below_robust`, chosen on validation data in the notebooks). Zoom search is off by default.
  When it is on and wins, the notebook's rule is kept (a zoomed answer is never "not sure"), and the
  response says `zoomed: true`.
- **Open question:** the zoomed confidence is the best of about 20 crops, so it is biased upwards and
  not calibrated. In a test the plain answer was 0.39 ("not sure") and zoom found a crop at 0.40, so
  the answer stopped being "not sure" although 0.40 is still below the 0.5 threshold. A stricter rule
  would be "zoomed and below the threshold is still not sure". To be decided with the scan UI in Milestone 2.

### 7. `/explain` repeats the preprocessing instead of taking a crop box
- **Chose:** the client sends the same photo and the same `zoom` value as for `/predict`, and the service
  computes the same model input again.
- **Alternative:** accept the `crop_box` returned by `/predict`.
- **Why:** zoom search crops a shrunken copy of big photos, so cropping the full photo with the box would
  give slightly different pixels. Repeating the same steps guarantees the heat map explains exactly what
  the model saw, at the cost of one more small inference.

### 8. Upload checks and error messages
- **Chose:**
  - The size limit (8 MB) is checked twice: first from the `Content-Length` header, before the body is
    read, then while reading, for clients that do not send the header.
  - The format is checked on the decoded image (JPEG, PNG, WebP, BMP, HEIC), not on the file name or
    the browser's Content-Type.
  - A 60-megapixel limit stops "decompression bombs", small files that expand to huge images.
  - Every error is `{code, message}` with a fitting HTTP status (413, 415, 422, 504), so the web app
    can show a clear message.
- **Why:** the brief asks for clear errors for "too big", "unsupported format" and "service down".
  Trusting file names or Content-Type would let any file through.

### 9. Timeout without blocking other requests
- **Chose:** each prediction runs in a worker thread (`asyncio.to_thread`) under `asyncio.wait_for`.
  After `INFERENCE_TIMEOUT_S` the client gets HTTP 504.
- **Limitation:** TensorFlow cannot be stopped half way, so the thread finishes in the background.
  The timeout protects the caller, not the CPU. With heavy traffic a request queue or a limit on
  parallel predictions would be needed; not needed for the demo.

### 10. Fail fast when the model is missing
- **Chose:** the service refuses to start if `meta.json` or the model file is missing, with a message
  that says what to copy where.
- **Alternative:** start anyway and answer 503 until a model appears.
- **Why:** a service without a model is never useful, and a crash at start-up is easier to notice than
  a half-working service.

### 11. Tests without the real model
- **Chose:** `conftest.py` builds a tiny Keras model with the real layer names (`block4b_relu`,
  `head_relu`, `class_probs`) and saves it as a `.keras` file with a matching `meta.json`. One version is
  confidently "plastic", the other never sure, so both paths of the UI flow are tested.
- **Why:** CI runs in seconds with no model files, and the whole path (load → predict → HTTP) is still
  exercised. The real numbers are checked by the parity test.

### 12. Versions and platform
- **Chose:** Python 3.12 (as on Colab) and pinned `tensorflow-cpu`, `keras`, `numpy` and `pillow`.
  The pins will be changed to the versions recorded in `golden.json`, so the service runs what Colab ran.
  The developer machine is Windows on x86-64, so the CPU-only TensorFlow build is used: it has wheels
  for both Linux (Docker) and Windows.
- **Why:** TensorFlow and Pillow versions can change results slightly. Pinning makes the parity test
  meaningful and builds repeatable.

### 13. Docker and docker compose
- **Chose:** `python:3.12-slim` base image; dependencies installed before the code is copied (so code
  changes do not reinstall TensorFlow); runs as a non-root user; Docker health check on `/health`;
  model files copied into the image. `docker-compose.yml` has only the ML service for now.
- **Why:** a slim image is smaller and has fewer security updates to worry about. Baking the model into
  the image means the same image runs anywhere, which also suits hosting in Milestone 4. PostgreSQL,
  the API and the web app join compose in Milestone 2, when they exist, instead of as empty placeholders.
- **To revisit in Milestone 4:** the image is about 2.3 GB because of TensorFlow. If the chosen host is
  too small, convert the model to TFLite or ONNX for `/predict` (and keep TensorFlow only for `/explain`).

### 14. Model files in git
- **Chose:** commit `meta.json` and the CNN `.keras` files (estimated at about 5 MB each from the layer
  sizes) directly. Git LFS was the alternative.
- **Why:** the simplest setup: cloning gives a working service, and every host can build the image
  without LFS support.

### 15. The ML service is internal
- **Note:** it has no login or CORS settings, because only the main API calls it. If Milestone 4 hosts it
  on a public URL (for example Hugging Face Spaces), add a shared secret header that the API sends, so
  strangers cannot use it.
