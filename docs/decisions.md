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
- **Open question (resolved in Milestone 2, decision 2.6):** the zoomed confidence is the best of about
  20 crops, so it is biased upwards and not calibrated. In a test the plain answer was 0.39 ("not sure")
  and zoom found a crop at 0.40, so the answer stopped being "not sure" although 0.40 is still below the
  0.5 threshold.

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

## Milestone 2 — main API and web app (23 Nov 2026)

### 2.1 The web app talks only to the main API, on the same origin
- **Chose:** everything the browser calls is under `/api`. In Docker, nginx serves the built web app and
  proxies `/api` to the API; in development, Vite proxies `/api` the same way. ml-service is reachable
  only from the API.
- **Alternatives:** the browser calls ml-service directly for scans; the API on its own domain with CORS.
- **Why:** one origin means a first-party session cookie and no CORS rules to get wrong. The API can
  store every scan, apply the rate limit and the upload limit before the expensive model runs, and the
  model service stays internal (decision 15).

### 2.2 Stack: FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL; React + Vite + TypeScript + Tailwind
- **API:** sync SQLAlchemy sessions in sync endpoints (FastAPI runs them in a thread pool), so a database
  or ml-service call never blocks the event loop, without the extra complexity of async drivers.
  `httpx2` (what FastAPI's test client uses) calls ml-service.
- **Web:** React 19, React Router, TanStack Query for server state (caching, retries, loading and error
  states), Tailwind 4 with the Malaysian bin colours as design tokens, lucide icons, self-hosted fonts
  (no requests to Google Fonts). TypeScript 6.0, not 7.0: typescript-eslint does not support 7 yet.

### 2.3 Accounts and sessions
- **Chose:** e-mail + password, hashed with Argon2id. The session is a signed JWT in an **httpOnly,
  SameSite=Lax** cookie (`Secure` when `COOKIE_SECURE=true`, i.e. behind HTTPS). Sign-up always creates a
  `resident`; `operator` and `admin` exist as roles for Milestones 3–4 and can only be given by an admin.
- **Alternatives:** a token in `localStorage` sent as a Bearer header; server-side sessions in a table.
- **Why:** page scripts cannot read an httpOnly cookie, so an XSS bug cannot steal the session.
  SameSite=Lax stops other sites' forms from sending it with POSTs, which covers CSRF for this app (all
  state-changing requests are POST/PUT/DELETE, and there is no CORS). A JWT needs no session table.
  **Trade-off:** a JWT cannot be revoked before it expires (7 days); logout deletes the cookie. If
  Milestone 3 adds anything valuable to steal (points that convert to money), add a `token_version`
  column to revoke all sessions of a user.
- Login with an unknown e-mail still runs one Argon2 check, so the response time does not reveal which
  e-mails have accounts. Wrong password and unknown e-mail give the same message.
- `GET /api/auth/me` answers `null` (HTTP 200) for guests instead of 401: being a guest is normal, and
  the web app asks on every page load, so a 401 would put an error in the console of every visitor.

### 2.4 Guests can scan; scans are stored, photos are not
- **Chose:** scanning needs no account. Every scan stores the model's answer, the model version and a
  64-bit difference hash, but **not the photo**, unless the user ticks "donate this photo" for that
  photo. Donated photos can be deleted again (`DELETE /api/scans/{id}/photo`). The consent switch resets
  for every new photo.
- **Why:** trying it without signing up is the best demo, and stored answers (with `model_version`)
  show how the model does in real use: how often it is unsure, which classes users correct. Photos of
  people's homes are personal data (Malaysia's PDPA 2010), so they are kept only with explicit consent
  and with a way to withdraw it. The browser re-sends the photo for the Grad-CAM view instead of the API
  keeping it.
- A guest's scan can be labelled by whoever holds its id, a random UUID returned only to the browser
  that scanned. A logged-in user's scans can be changed only by that user (others get 404, not 403, so
  ids of other people's scans cannot be confirmed).

### 2.5 Labels: confirm, correct or "something else"
- **Chose:** `PUT /api/scans/{id}/label` with one of the model's class names or `other`. The scan
  screen asks "Did we get it right?" for a confident answer, and "Which one is it?" (top 3, then all
  classes, then "something else") for an unsure one. The bin shown is then the bin of the user's label,
  without the model's confidence.
- **Why:** corrected labels plus donated photos are exactly the data the next training round needs,
  each linked to the model version that made the mistake. `other` records items outside the 12 classes
  (styrofoam, drink cartons), which tells us which class to add next.

### 2.6 "Not sure" with zoom search: the stricter rule
- **Chose:** `unsure = confidence < threshold`, also when zoom search picked the crop (changed in
  `ml-service/app/model.py`; notebook 02 never marked a zoomed answer as unsure).
- **Why:** the threshold is the lowest confidence at which the model was right at least 90% of the time
  on validation data, and the UI promises "below this, we ask you". A zoomed confidence is the maximum
  over about 20 crops, so it is biased upwards; if even that maximum is below the threshold, the model
  really is not sure. The UI also tells the user that a zoomed percentage is optimistic.

### 2.7 Errors, limits and abuse
- Every error is `{code, message}`, as in ml-service. ml-service's own 4xx/504 errors are passed on
  unchanged; when it is down or crashes the API answers 503 `ml_unavailable` and never forwards its
  internals. Validation errors use the same shape with the field name.
- Uploads above 8 MB are refused from `Content-Length` before the body is read, and again while
  reading, so they never reach the model. The web app checks size and type before uploading.
- Scans and heat maps are limited per client IP (`SCAN_RATE_PER_MIN`, default 20), because each one
  runs the CNN on a CPU. The limiter is in memory, which is right for one API process; several processes
  would need Redis. Behind nginx the client IP comes from `X-Forwarded-For` (`TRUST_PROXY=true`, set only
  in docker compose, where the API is not exposed directly).

### 2.8 Security headers and caching (nginx)
- A strict Content-Security-Policy (`default-src 'self'`, images also from `blob:` for photo previews,
  `frame-ancestors 'none'`), `nosniff`, a referrer policy and a permissions policy that allows the
  camera only for this site. Hashed files under `/assets` are cached for a year; `index.html` is never
  cached, so a new deployment is picked up at once. The API docs (`/api/docs`) are excluded from the CSP
  because Swagger UI loads from a CDN.

### 2.9 Tests
- **API:** pytest with ml-service replaced by an `httpx` MockTransport, so each test can make the model
  answer, fail or time out. They run on in-memory SQLite by default and on PostgreSQL when
  `TEST_DATABASE_URL` is set; CI does both, and also checks that the migrations apply, roll back and
  match the models (`alembic check`).
- **Web:** Vitest + Testing Library for the scan flow (confident, unsure, corrected, "something else",
  error), the upload checks, the API client's error handling, consent reset and the crop-box maths.
- **End to end (by hand, not in CI yet):** the full Docker stack was run with a stand-in model (random
  weights, flagged `quick_run` so the model page warns that its numbers mean nothing) and driven with
  Playwright on desktop and phone sizes: scan, heat map, correction, sign-up, donation, history, guide,
  model page, with no console errors under the CSP. Moving this into CI needs a stand-in model export
  that CI can build; planned for Milestone 4.

### 2.10 Honest content
- The landing page cites its numbers (national recycling rate 35.4% in 2023 per SWCorp; 40% target
  for 2025) and marks "drop off & earn" as in development. The hackathon deck's "40% of collections are
  premature" and "recycling below 30%" are not used: the first has no source we could find, the second
  is out of date.
- The model page shows only what the served model's `meta.json` says, and labels test-set metrics as
  such: real phone photos are harder.
