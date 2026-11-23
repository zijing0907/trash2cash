# Trash2Cash

A mobile-first web app for household recycling in Malaysia. A resident photographs an item, a CNN
trained from scratch says which recycling stream it belongs to (blue, brown or orange bin, e-waste,
textile, food waste or general waste), and the resident earns points when an operator weighs and
verifies the items at a drop-off point. Admins see how full each drop-off point is and when it will
need a pickup.

> **Status:** work in progress. Done: the ML service (Milestone 1), and the API and web app with the
> full scan flow (Milestone 2). Next: drop-off deposits, points and rewards (Milestone 3), the admin
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

TODO (Milestone 5): dataset, test metrics read from `meta.json`, real-photo results and known limitations.

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
