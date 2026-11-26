# Trash2Cash

A mobile-first web app for household recycling in Malaysia. A resident photographs an item, a CNN
trained from scratch says which recycling stream it belongs to (blue, brown or orange bin, e-waste,
textile, food waste or general waste), and the resident earns points when an operator weighs and
verifies the items at a drop-off point. Admins see how full each drop-off point is and when it will
need a pickup.

> **Status:** work in progress. Done: the ML service (Milestone 1), the API and web app with the full scan
> flow (Milestone 2), and the trained model served by the app. Next: drop-off deposits, points and rewards (Milestone 3), the admin
> dashboard with pickup forecasts and a live demo (Milestone 4), and the model card with real-photo
> results (Milestone 5).

## What works today

- **Scan:** take or upload a photo (JPEG, PNG, WebP or iPhone HEIC); the app shows the square the model
  looks at, which bin the item goes in and how to prepare it. Below a confidence threshold chosen on
  validation data, it says **"not sure"** and asks instead of guessing.
- **Explain:** a Grad-CAM heat map shows which part of the photo drove the answer.
- **Teach:** confirm or correct every answer, or say "something else"; optionally donate the photo
  (and delete it again). These labels are the material for retraining.
- **Accounts and history:** guests can scan; signed-in residents get a history and a per-bin summary.
- **Bin guide** with search, and a **model page** that reads the served model's own metrics.

## Origin

Trash2Cash started as the pitch of team C2G6 ("Hack-a-saurus Rex") at the **SDG XI Hackathon 2025**,
topic *Smart Mobility & Communities* (SDG 11), subtopic 3 *Waste & Sanitation Management*. The pitch
was slides and mockups only. This repo turns it into a working product.

The image classifier comes from our UECS2523 Applied Machine Learning group project
(see [`ml/README.md`](ml/README.md)).

## Repository layout

| Folder | What it holds | Milestone |
|---|---|---|
| `ml-service/` | FastAPI service that loads the exported Keras model and serves `/predict`, `/explain`, `/model` | M1 |
| `ml/notebooks/` | The training and evaluation notebooks the model comes from (read-only here) | M1 |
| `api/` | Main API: accounts, scans, labels, donated photos (FastAPI + SQLAlchemy + Alembic + PostgreSQL); deposits, points and rewards in M3 | M2–M3 |
| `web/` | React + Vite + TypeScript + Tailwind web app, served by nginx | M2–M4 |
| `scripts/` | Seed data and export scripts | M4 |
| `docs/` | Design decisions (`decisions.md`) and diagrams | every milestone |

## Architecture

```
browser ──► web (nginx: the built React app, and /api proxied) ──► api (FastAPI) ──► db (PostgreSQL)
                                                                      └──────────► ml-service (TensorFlow CNN)
```

The browser only ever talks to one origin. The API stores scans and accounts and calls ml-service over
internal HTTP; ml-service only does inference. Why it is split this way is in
[`docs/decisions.md`](docs/decisions.md).

## Run it locally

You need Docker Desktop. Put the model export in `ml-service/models/` first
(see [`ml-service/models/README.md`](ml-service/models/README.md)).

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

Then open http://localhost:8080. The API docs are at http://localhost:8080/api/docs and the ML service
can be tried on its own at http://localhost:8001/docs. The first start takes a few minutes (TensorFlow
is large).

Development without Docker, with hot reload, is described in each service's README:
[`ml-service/`](ml-service/README.md), [`api/`](api/README.md), [`web/`](web/README.md).

## Quality checks

Every push runs [CI](.github/workflows/ci.yml): ruff and pytest for both Python services (the API's
tests on SQLite and on PostgreSQL, plus a migration round trip), eslint, the TypeScript check, Vitest
and a production build for the web app, and a Docker build of every image.

## Model card

The app serves **CNN-R** (`CNN-R@3764b8d2`): a convolutional network with 1.24 million weights, trained from
random weights (no pretrained model). Numbers below come from the training notebooks' own outputs; the raw
logs are in [`ml/results/`](ml/results/).

| Test | Best FCNN (FCNN-B32) | Best plain CNN (CNN-A) | **CNN-R (served)** |
|---|---|---|---|
| Garbage-12 test split, macro F1 | 0.601 | 0.864 | 0.764 |
| Garbage-12 test split, accuracy | 0.675 | 0.888 | 0.807 |
| Same test objects pasted on unseen backgrounds, macro F1 | 0.184 | 0.267 | **0.556** |
| Accuracy lost when only the background changes | 28 points | 56 points | **14 points** |

- **Data:** 15,515 images in 12 classes ([Garbage Classification](https://www.kaggle.com/datasets/mostafaabla/garbage-classification));
  15,493 after removing exact duplicates and copies filed under two classes. Near-duplicates are kept in one
  split, so no picture is in both training and test. Split 70 / 15 / 15, stratified by class.
- **CNN against fully-connected network:** CNN-A beats the best FCNN by 0.26 macro F1 (95% interval 0.24 to 0.29;
  McNemar p < 10⁻⁹⁰).
- **Why CNN-R, not the higher-scoring CNN-A:** the dataset's photos are mostly studio shots, and CNN-A partly
  learned "white background means battery or trash". CNN-R was trained with backgrounds swapped, objects shrunk
  and moved, and real-world photos from RealWaste and Garbage Classification v2. Against CNN-B, the same network
  without those changes, it loses nothing measurable on the test split (−0.005 macro F1, 95% interval −0.025 to
  +0.015) and gains 0.33 on unseen backgrounds. Phone photos look more like the second test.
- **"Not sure":** below 63% confidence the app asks instead of answering; 0.63 is the lowest confidence at which
  CNN-R was right at least 90% of the time on validation data.
- **Not measured yet:** accuracy on our own phone photos (notebook 02, part 4, has no photos yet). That is the
  number that matters most for real use.
- **Limits:** one item per photo; 12 classes only; it cannot tell whether a container is clean or which plastic it is.

## Acknowledgements

- Classifier: UECS2523 Applied Machine Learning group project with Benjamin Thio Zi Liang,
  Chew Zi Jing and Jeremy Gabriel Lee Ji Hin.
- Datasets:
  - [Garbage Classification (12 classes)](https://www.kaggle.com/datasets/mostafaabla/garbage-classification)
    (`mostafaabla/garbage-classification` on Kaggle), the main training and test data.
  - The robust model (CNN-R) also trains on
    [RealWaste](https://archive.ics.uci.edu/dataset/908/realwaste) (Single et al., 2023) and
    [Garbage Classification v2](https://www.kaggle.com/datasets/sumn2u/garbage-classification-v2)
    (sumn2u), plus our own phone photos. Notebook 03 explains how they were chosen and de-duplicated.
