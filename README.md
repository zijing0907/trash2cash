# Trash2Cash

A mobile-first web app for household recycling in Malaysia. A resident photographs an item, a CNN
trained from scratch says which recycling stream it belongs to (blue, brown or orange bin, e-waste,
textile, food waste or general waste), and the resident earns points when an operator weighs and
verifies the items at a drop-off point. Admins see how full each drop-off point is and when it will
need a pickup.

> **Status:** work in progress. Milestone 1 (the ML service) is being built. The web app, API,
> live demo, screenshots and model card come in later milestones.

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
| `api/` | Main API: auth, scans, deposits, points ledger, rewards (FastAPI + PostgreSQL) | M2–M3 |
| `web/` | React + Vite + TypeScript web app (PWA) | M2–M4 |
| `scripts/` | Seed data and export scripts | M4 |
| `docs/` | Design decisions (`decisions.md`) and diagrams | every milestone |

## Run the ML service locally

You need Docker Desktop. Put the model export in `ml-service/models/` first
(see [`ml-service/models/README.md`](ml-service/models/README.md)).

```bash
cp .env.example .env
docker compose up --build
```

Then open http://localhost:8001/docs to try the endpoints in the browser.

Development without Docker is described in [`ml-service/README.md`](ml-service/README.md).

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
