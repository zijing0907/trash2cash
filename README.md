# Trash2Cash

A mobile-first web app for household recycling in Malaysia. A resident photographs an item, a CNN
trained from scratch says which recycling stream it belongs to (blue, brown or orange bin, e-waste,
textile, food waste or general waste), and the resident earns points when an operator weighs and
verifies the items at a drop-off point. Admins see how full each drop-off point is and when it will
need a pickup.

> **Status:** work in progress. Done: the ML service (Milestone 1), the API and web app with the full scan
> flow (Milestone 2), the trained model, drop-off deposits with points and rewards (Milestone 3), the admin
> pickup board (Milestone 4), voucher collection and drop-off point setup (Phase 1), the live camera scan
> with bin-level answers and the battery warning (Phase 2), and the drop-off map with pickup jobs for collectors
> (Phase 4), "bin full" reports with a forecast that corrects itself (Phase 6a), and home pickup requests
> (Phase 6b), and the community page with what people find confusing (Phase 7). Next: animations and UI polish,
> then the model in the browser and a public link. Bahasa Melayu is set aside for now.

## What works today

- **Scan:** open the camera inside the page, with the square the model reads drawn over it, or take or upload a
  photo (JPEG, PNG, WebP or iPhone HEIC). Photos are shrunk to 1600 pixels before upload. The app shows which bin
  the item goes in and how to prepare it. Below a confidence threshold chosen on validation data, it says
  **"not sure"** and asks instead of guessing.
- **Bin-level answers:** when the model cannot tell the item apart but is sure of the bin (brown or green glass:
  both go in the brown bin), it names the bin and asks which item it was.
- **Battery warning:** any real chance that the item is a battery (10% or more) brings a warning, whatever the
  answer, because batteries in household bins start fires in rubbish trucks.
- **Explain:** a Grad-CAM heat map shows which part of the photo drove the answer.
- **Teach:** confirm or correct every answer, or say "something else"; optionally donate the photo
  (and delete it again). These labels are the material for retraining.
- **Accounts and history:** guests can scan; signed-in residents get a history and a per-bin summary.
- **Bin guide** with search, and a **model page** that reads the served model's own metrics.
- **Points that cannot be faked:** each resident has a member QR code. Staff at a drop-off point scan it (or type
  the code), weigh what was handed in per bin, and only then are points added, to an append-only ledger.
  Photos alone never earn points.
- **Rewards:** residents spend points on rewards an admin sets up and get a voucher code to collect them;
  two redemptions at the same moment cannot spend the same points.
- **Pickup board for admins:** every bin's fill, how fast it fills (the last two weeks' average) and the day it will
  be full; bins forecast to pass 90% are due, and today's run orders those drop-off points most urgent first, then
  nearest next. Also this month's weight, its worth at buy-back prices, deposits and points.
- **Map of drop-off points** (OpenStreetMap): the nearest point to you, and each bin's fill with how the app knows
  it ("Weighed 2 hours ago", "Emptied 30 minutes ago") and an estimate of when it will be full, labelled as one.
  There are no sensors, so there is no live percentage.
- **Pickup jobs for collectors (the Grab idea):** the admin offers today's run; a collector takes a job (only one
  can), follows the stops on the map, and for each bin enters what the truck's scale said and photographs the
  empty bin, or says why it could not be emptied. The admin sees the scale's weight next to what was weighed in.
- **"Bin full" reports, like Waze:** anyone signed in can report a bin full or overflowing, with a photo if they
  like. One report is a hint on the map; three different people within a day make the bin due and put it in
  today's run. Each person can report a bin once every six hours, and emptying the bin clears its reports.
- **A forecast that corrects itself:** once a bin has two measured pickups, its fill and inflow are scaled by what
  the collectors' scale showed against what was weighed in (people drop things in without weighing), and the map
  and board say so and by how much.
- **Home pickups:** for 5 kg or more, a resident books a collector with a photo, a rough weight, a pin on the map
  and a time of day. Collectors see only the area until one takes it; then they see the address, weigh everything
  at the door, and the resident gets points for those weights, never for the guess.
- **Community page:** what everyone recycled this month and week by week, by drop-off point and by bin, never by
  person. Below it, what people find confusing: the items asked about most, where people and the model disagreed,
  and how often an item was none of the 12 kinds, for every place or for the residents of one. A row shows only
  once three different people are in it.

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

To try the staff screens, load the demo data (sample drop-off points, 40 residents and six weeks of deposits,
labelled as demo data in the app). In a second terminal:

```bash
docker compose exec api python -m app.cli seed-demo
```

Then log in as `admin.demo@example.com`, `operator1.demo@example.com`, `collector1.demo@example.com` or
`resident01.demo@example.com`, password `demo-password`. Running `seed-demo` again on an older demo adds the
collectors. For a real setup, create the first admin instead:

```bash
docker compose exec api python -m app.cli create-user --email you@example.com --name "Your name" --role admin
```

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
  CNN-R was right at least 90% of the time on validation data. The same 63% applies to bins (the class
  probabilities added up per bin); that use of it has not been checked on validation data yet.
- **Battery warning from 10%:** chosen, not measured. A plain white photo already scores 9.9% battery (the
  white-background habit of the dataset), so photos on white may warn more often than they should.
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
