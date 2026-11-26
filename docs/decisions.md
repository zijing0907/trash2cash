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

## The trained model goes in (24 Nov 2026)

### 3.1 Serve CNN-R, although CNN-A scores higher on the test split
- **Chose:** keep the Milestone 1 rule (`cnn_robust` when its file exists). The model page shows CNN-R's own numbers.
- **Alternative:** serve CNN-A (macro F1 0.864 against 0.764 on the garbage-12 test split).
- **Why:** notebook 03's matched stress test pastes the same test objects onto background kinds never used in
  training. CNN-A drops to 0.267 macro F1 there; CNN-R keeps 0.556, and loses 14 accuracy points to the background
  change against CNN-A's 56. Against CNN-B, its own architecture without the robustness changes, CNN-R loses nothing
  measurable on the test split (−0.005, 95% interval −0.025 to +0.015). Phone photos of cluttered rooms look more
  like the stress test than like the studio test split. To be re-checked once notebook 02's real-photo test has
  photos: if CNN-A wins there, switch with `MODEL_KEY=cnn`.

### 3.2 Keras pinned to the Colab version
- **Chose:** `keras==3.13.2`, the version notebook 03 printed and the `.keras` files record; TensorFlow 2.21.0 already
  matched. The parity test against notebook 02 still waits for `tests/fixtures/golden.json`, which also records the
  NumPy and Pillow versions.

### 3.3 Zoom search follows notebook 02's newer rule
- **Chose:** port the current notebook: zoom search averages the 5 most confident of about 20 crops (one odd crop
  cannot decide alone), and the answer is an even blend of the centre crop and that consensus. The crop box is the
  crop that shows the answer best, and Grad-CAM explains that crop. The threshold applies to the blended answer,
  which is the rule decision 2.6 chose.
- The notebook can also average several models (an `ensemble` block in `meta.json`); this export has none, so the
  service does not implement it yet.

### 3.4 Logs in the repository
- `ml/results/notebook-01-logs/` (3.3 MB of CSV and JSON) is committed, so every number in the README can be traced
  to a file. The model files are committed too (decision 14).

### 3.5 Still to do
- The home page's captures were taken with a stand-in model. Retake them with `web/scripts/capture-states.cjs` and
  two real photos (one the model is sure about, one it is not).

## Milestones 3 and 4: drop-off deposits, points, rewards and the pickup board (24 Nov 2026)

### 4.1 Points only for weighed, verified deposits
- **Chose:** a resident earns points only when an operator at a drop-off point finds them by member code (QR or
  typed), weighs what they hand in per bin and confirms. Points = kg x the bin's points per kg, set by an admin.
- **Alternative:** points per scan, as the hackathon pitch implied.
- **Why:** a photo proves nothing: the same bottle can be photographed a hundred times. Weighing at a counter is
  how buy-back centres already work, and it gives the board real weights. Staff cannot credit themselves, one bin
  appears once per deposit, and a line over 100 kg is refused as a typo.

### 4.2 An append-only ledger, and redemption that cannot overspend
- **Chose:** a balance is the sum of `points_ledger` rows; nothing overwrites it. Redeeming locks the user's row
  (`SELECT ... FOR UPDATE`), checks the balance, takes limited stock with a conditional `UPDATE ... WHERE stock > 0`,
  and writes the redemption and its negative entry in one commit.
- **Why:** every point can be traced to a deposit or a reward, and two redemptions sent at the same moment cannot
  both spend the same points or the last item in stock.

### 4.3 Member codes, not user ids, in the QR code
- **Chose:** 8 random characters from an alphabet without 0/O, 1/I/L (`7KQM-3XPA`), unique, created at sign-up and
  backfilled by migration 0002. The operator screen accepts it typed in any case, with or without the dash.
  Phones that have a built-in barcode reader (Chrome, Android) can scan it with the camera; others type it.
- **Why:** a counter needs something short to read aloud; a random code reveals nothing about the account.

### 4.4 A forecast you can explain
- **Chose:** fill = weight deposited since the bin was last emptied; inflow = the average per day over the last
  14 days; a straight line gives the day it is full and the day it passes 90%. Due = past 90% or less than two
  days from it; soon = within a week. Today's run takes the due drop-off points, most urgent first, then always the
  nearest next (great-circle distance).
- **Alternatives:** a time-series model per bin; an exact route optimiser.
- **Why:** with a few weeks of data a straight line is as good as anything, and an admin can check it by hand.
  Nearest-neighbour is fine for the handful of stops a daily run has; the code says where it would stop being
  enough. The 90% rule answers the pitch's problem directly: trucks come before bins overflow, not when half empty.

### 4.5 Rates, prices and rewards are the admin's, and demo data says it is demo data
- **Chose:** migration 0002 creates the five bins with placeholder points and no price; an admin sets the real
  values in Setup. `python -m app.cli seed-demo` adds sample drop-off points (marked `is_demo`), 40 residents,
  six weeks of deposits and sample rewards, and every screen that shows them says "demo data". Past pickups in the
  seed are worked out backwards from a spread of current fills, so each one collected exactly what was deposited
  since the previous one.
- **Why:** none of these numbers were given, so none are presented as real.

### 4.6 Screens
- All five are app screens in the locked Editorial system (`web/design.md`): tables before cards, every data area
  with loading, empty, error and full states, the accent only for the primary action and state, bin colours only to
  name bins. Navigation follows the role: operators get Weigh-in, admins Weigh-in and Board.
- The Hallmark render checks ran on these routes signed out (they cannot log in), so the signed-in screens were
  checked by driving the app as each demo role at desktop and phone size.

## Phase 1: closing the gaps (24 Nov 2026)

### 5.1 Vouchers are collected once
- **Chose:** migration 0003 adds `used_at` and `used_by_id` to redemptions. Staff check a code at the weigh-in
  screen (reward, member, when it was claimed) and hand it over; collecting is one `UPDATE ... WHERE used_at IS NULL`,
  so showing the same code twice, or two staff pressing at once, collects it once. Residents see "Collected" in
  My vouchers.

### 5.2 Admins manage real drop-off points
- **Chose:** Setup adds and edits points: name, address, map position (pasted as "lat, lng" from Google Maps or
  OpenStreetMap), open or closed, and each bin with its size. A bin can be resized or added at any time, but one with
  recorded deposits or pickups cannot be removed (its history would lose its place); close the point instead.
  Closed points disappear for residents and from the board but keep their history.
- A map to pick the position comes with the OpenStreetMap map in Phase 4.

### 5.3 Times compared in UTC
- **Fixed:** "today's deposits" and the board's day and month boundaries compared a Malaysian-midnight time with
  stored times. PostgreSQL converted correctly; SQLite (the tests) stores times without a zone, so the comparison
  broke just after midnight in Malaysia. Boundaries are now converted to UTC before comparing, and zone-less times
  are read as UTC. Caught by the test suite running after midnight, Malaysian time.

## Phase 2: a better scan (26 Nov 2026)

### 6.1 The camera inside the page, and smaller uploads
- **Chose:** "Open the camera" shows the camera in the page with the model's square drawn over the frame, so
  people fill the square before they take the photo. The whole frame is sent (zoom search can use all of it).
  Where the page cannot use the camera (not https, no camera, access blocked), the old "Take a photo" button
  opens the phone's own camera app instead, and the reason is shown.
- **Chose:** photos are shrunk in the browser to 1600 pixels on the long side (JPEG, quality 0.9) before upload.
  The model reads a 128-pixel square and zoom search works on about 1000 pixels a side, so this changes nothing
  it sees in practice; a 12-megapixel photo goes up about ten times smaller. Photos already small, or in a
  format the browser cannot decode (HEIC outside Safari), are sent unchanged. Donated photos are the shrunk copy,
  still eight times the training resolution.
- **Why not crop to the square in the browser:** zoom search needs the rest of the photo.

### 6.2 Bin-level answers
- **Chose:** ml-service adds the class probabilities per bin. When the item is below the "not sure" threshold
  but one bin is above it (brown or green glass, paper or cardboard), the app names that bin, says what it cannot
  tell apart, and asks which item it was, so the label still reaches the training data. Stored with the scan as
  `top_bin`, `bin_confidence` and `bin_unsure` (migration 0004; empty for older scans, not filled in afterwards).
- **The same threshold (0.63):** a confident class always gives a confident bin, so the two answers never
  disagree. The threshold was chosen for classes on validation data; whether bins deserve a different one has not
  been measured. To check: run notebook 03's selective-accuracy cell on per-bin probabilities.
- **The bin can differ from the top class's bin:** trash 34%, plastic 33%, metal 33% is "not sure" as a class but
  66% orange bin, so the app names the orange bin, not general waste.

### 6.3 The battery warning
- **Chose:** warn when the battery probability is 10% or more, unless the answer already is a sure battery. It
  shows above any answer until the user says what the item is. A battery in a household bin can start a fire in
  the rubbish truck; a needless warning costs a few seconds of reading.
- **Why 10%:** just above chance for 12 classes (8.3%), so it needs some sign of a battery, not just an undecided
  model. meta.json can set `battery_warn_at`.
- **Known weakness:** a plain white photo scores 9.9% battery, the white-background habit the dataset taught the
  model, so items photographed on white may set it off. The real-photo test will measure how often it fires
  wrongly and how often it misses.

### 6.4 Two moments of motion
- **Chose:** the locked system was still. The scan screen now has two moments: a line passing over what the
  model reads while it works, and the answer settling into place. Both are off under reduced motion
  (`web/design.md`, Motion). Everything else stays still.

## Phase 4: the map and collector jobs (26 Nov 2026)

### 7.1 OpenStreetMap through Leaflet
- **Chose:** Leaflet with OpenStreetMap's standard tiles: free, no API key, no account. The tiles are shown in grey
  so the square pins (due solid ink, soon an ink outline, like the board's status tags) and the route carry the
  meaning. The map code is only downloaded by the three screens that show a map.
- **Limit:** OpenStreetMap's own tile servers are for light use. A busy public site should move to a tile
  provider; that is part of putting the site online (Phase 3). If tiles do not load, the pins and the list still
  work and a note says so.
- **Location:** asked only when the person presses "Nearest to me" or "Use my location", used in the browser to
  sort and draw, never sent to the server. Browsers only allow it on https or localhost.

### 7.2 Honest certainty instead of a live percentage
- **Chose:** there are no sensors, so the map never shows a "live" fill. Each bin says what its fill rests on and
  how old that is: the last weighed drop-off ("Weighed 2 hours ago") or the last pickup ("Emptied 30 minutes ago,
  nothing weighed in since"). After seven days without either, it adds "so it may be out of date". The forecast
  is always worded as an estimate. Phase 6 adds a third kind of fact: reports from the public.
- **Why:** a percentage looks precise but would hide that unweighed items are not counted. Saying how each number
  is known is more useful and easier to defend.

### 7.3 Jobs: one point, one collector, proof at every bin
- **Chose:** a job is one drop-off point's bins that are due or soon (or, if none, every bin with something in
  it). An admin offers the run in one tap; a point cannot have two open jobs. Taking a job is a conditional
  `UPDATE ... WHERE status = 'open'`, so when two collectors tap at once, one gets it and the other is told.
  Finishing a bin is also conditional, so a second tap on a slow connection does not record a second pickup.
- **At each bin:** the weight from the truck's scale and a photo of the emptied bin (checked by its first bytes:
  JPEG, PNG, WebP or HEIC, and shrunk in the browser first). The pickup stores both what the scale said
  (`collected_g`, `measured = true`) and what the weighed drop-offs added up to (`expected_g`). The gap is what
  people left without weighing; Phase 6 uses it to correct the forecast. A bin that could not be emptied is
  skipped with a reason and keeps its fill.
- **Hand back:** a collector can return a job until they have finished a bin; after that they finish or skip the
  rest. An admin can withdraw any open or taken job; bins already collected stay collected.
- **Photos** are kept in the media folder and shown only to admins and to the collector who took them.
- **Not yet:** paying collectors, and collectors' own location on the admin's map.

## Phase 6a: reports from the public, and a forecast that corrects itself (26 Nov 2026)

### 8.1 "Bin full" reports
- **Chose:** anyone signed in can report a bin full or overflowing, with an optional photo. One report is a hint
  on the map ("Reported full by 1 person, 20 minutes ago"). Three different people within 24 hours, since the
  bin was last emptied, make it due on the board and put its point in today's run, so it can be offered to
  collectors like any other stop.
- **Against abuse:** an account is needed; each person can report a bin once every six hours and at most twenty
  times a day; the map shows how many people reported, never who; photos are for admins only; reports stop
  counting after 24 hours and when the bin is emptied. One person cannot make a bin due on their own.
- **Why three:** two could be friends joking; three independent people within a day is unlikely without a real
  full bin. Not measured yet; it is a constant (`CONFIRM_PEOPLE`) to tune once real reports come in.

### 8.2 The forecast corrects itself with the collectors' scales
- **Chose:** for each bin, the last five measured pickups (Phase 4) give a factor: what the scale showed divided by
  what had been weighed in. The fill and the daily inflow are multiplied by it before the forecast runs, so a bin
  where people drop things in without weighing is forecast to fill sooner.
- **Only with enough to learn from:** at least two measured pickups with 10 kg weighed in between them, from the
  last 180 days; otherwise the plain forecast stands. Factors are kept between 0.5 and 3, because anything outside
  is more likely a typing mistake on the scale than a habit.
- **Shown, not hidden:** the map and the board say "About 50 kg: 40 kg weighed in, and at the last 2 pickups the
  scale showed 1.25 times what was weighed in". The weighed-in figure stays visible next to the estimate.
- **Demo data:** the seed's last three pickups per bin are now generated as measured, with a made-up share of
  unweighed items per bin (5% to 40%), so the correction can be seen. Most demo bins have fewer than two such
  pickups in six weeks and keep the plain forecast, which is what would happen in real use too.

## Phase 6b: home pickups (26 Nov 2026)

### 8.3 Booked by residents, weighed by collectors
- **Chose:** a resident with 5 to 500 kg books a pickup: which bins the items belong in, a rough weight, the
  address and a pin on the map, a day up to two weeks ahead, a time of day and a photo. A collector takes it
  (a conditional update, so only one does), comes, weighs each bin's share at the door, and the resident gets
  points for those weights. The resident's guess never earns anything: the same rule as drop-offs, where only
  what staff weigh counts.
- **A deposit without a drop-off point:** the weighing is stored as an ordinary deposit with no point (migration
  0007 makes `deposits.point_id` nullable), credited through the same ledger. It counts in the month's recycled
  weight but fills no drop-off bin. Points history shows it as "Home pickup".
- **Privacy:** until a collector takes a pickup, other collectors see only the area (the position rounded to
  0.01 degree, about a kilometre), the day, the bins and the rough weight. The address, the exact pin, the note,
  the resident's name and the photo are for the resident, admins and the collector who took it. Location from
  "Use my location" stays in the browser until the resident books.
- **When it goes wrong:** before it is taken, the resident can cancel. The collector can hand it back, or mark it
  missed with a reason (nobody home, much more than booked); the resident can then book again. A resident can have
  two pickups open at a time.
- **Not yet:** paying collectors, and letting a resident and a collector message each other.

## Phase 7: the community page and what people find confusing (26 Nov 2026)

### 9.1 Totals by place, never by person
- **Chose:** a public page with this month's weighed-in kilograms, drop-offs and residents taking part, the last
  eight weeks, and the month by drop-off point (home pickups as their own row) and by bin. Only weighed figures:
  no CO2 or "trees saved", because there is no source for a conversion we could defend.
- **The weekly chart:** one series, so one colour (ink) and no legend; the heading names it. The high point and
  the week so far carry their numbers, every week shows its own on hover or keyboard focus, and the same figures
  are a table underneath. The week so far is hatched, so it is not read as a drop. Ends stay square, as every mark
  in this design system does.

### 9.2 Confusion, with a privacy floor
- **Chose:** from the last 90 days of scans by signed-in residents: the items people asked about most (by the
  answer they confirmed, or the model's sure answer), the pairs where people corrected the model, and how many
  people scanned something that is none of the 12 kinds. People are counted, not scans, so one person scanning the
  same thing twenty times counts once.
- **Privacy floor:** a row shows only once 3 different people are in it; the rest are counted ("2 more items
  ... are not shown"). Guest scans are left out because they cannot be told apart as people. Nothing names a
  person, and the place filter covers groups of residents, not single scans.
- **Places without locations:** scans record no location. "By place" means the residents whose drop-offs were
  mostly weighed at that point; the page says so. Adding an optional rough location to scans would be more direct,
  but it is a new thing to ask people for, so it waits until there is a reason.
- **Demo data:** scans now carry `is_demo` (migration 0008). The seed generates a few hundred scans for the demo
  residents with plausible mix-ups (paper and cardboard, a greasy box read as cardboard), and the page says the
  figures are demo data whenever any are.
- **Not yet:** Bahasa Melayu (set aside for now), and a printable poster from the confusion figures.

## Phase 8a: motion that explains (26 Nov 2026)

### 10.1 From "still" to "considered"
- **Chose:** the design rules said "still: state changes only". Phase 8a keeps the printed look but lets motion
  explain changes (`web/design.md`, Motion): pages glide and the green mark slides to the new link; the scan photo
  moves from the preview into the result; the bin's name stamps down, confidence fills, the tips follow; points
  count up from what this browser saw last, with what was earned since floating up; bars grow from their baseline
  a beat apart; map pins drop, a chosen place is flown to, a collector's route draws itself; ticks draw and short
  notes ("Booked", "Collected", "Report sent") slide up at the bottom; loading shows the shape of what is coming.
- **How:** CSS for almost everything (`src/motion.css`), the View Transitions API for page changes and the photo,
  and a small JavaScript count. Only transform and opacity move.
- **Reduced motion:** every animation ends at once, view transitions are off, counts show the final number, pins
  do not drop and the map jumps instead of flying. Every end state is the same, so nothing is lost. Tests run
  without motion for the same reason.
- **Found on the way:** a count could show a wrong number for one frame, because a browser can stamp the first
  frame slightly before the time read in code; the count now times itself from the first frame and stays between
  the old and the new number.

## Phase 8b: ease of use (26 Nov 2026)

### 10.2 What changed, and why
- **Fewer, clearer menus:** at most five top links per role, each role's own screen first (Board for admins,
  Weigh-in for operators, Jobs for collectors). The account is the name at the top right; "The model" moved to
  the footer and the home page. On phones Scan sits in the middle of the tab bar, under the thumb; Home is the
  wordmark.
- **Undo instead of "are you sure?":** cancelling a home pickup, withdrawing a job, handing a job back and deleting
  a donated photo happen at once, with Undo in the note at the bottom. The API can restore a cancelled pickup or
  reopen a withdrawn job for 10 minutes; handing back is undone by taking the job again; a photo is deleted 5
  seconds later (at once if the person leaves the page). Spending points and recording a pickup keep their
  confirm step, because they move points or weights.
- **Forms say what is wrong where it is wrong:** the home pickup form checks each field once the person leaves
  it, updates as they fix it, puts the cursor on the first problem, and keeps "Book" in reach on phones.
- **A faster counter for staff:** the member code box has the cursor, "/" brings it back from anywhere, Enter
  finds the member and moves to the first weight, Enter steps through the bins and credits on the last; weights
  are big; "Same member again" after a receipt.
- **Help where it is needed:** three steps on a person's first scan, until "Got it"; empty pages say the next
  step; anything that fails to load offers "Try again"; a line under the masthead says when the browser is
  offline.
- **Accessibility:** each page has its own tab title, and after a page change focus moves to the new heading (a
  page that put the cursor in a field keeps it). axe-core finds no violations on any page for any role, at
  desktop and phone sizes; the only one it found (source links in the home page's dark band, told apart by colour
  alone) is fixed.
- **Home and link previews:** the home page gains "After the bin" (map, home pickups, reports, community) and a
  share image with a title and description for WhatsApp and LinkedIn. The image address is relative until the
  site has its own domain (Phase 3), when it should become absolute.

