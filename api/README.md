# api/

The main API (FastAPI, SQLAlchemy 2, Alembic, PostgreSQL). The web app talks only to this service; it
calls `ml-service` over internal HTTP for the model. Everything is under `/api`, so one web server can
serve the web app and proxy `/api` here (no CORS needed).

| File | What it does |
|---|---|
| `app/main.py` | App factory, upload-size check, error shape |
| `app/routers/auth.py` | Sign up, log in, log out, current user |
| `app/routers/scans.py` | Scan a photo, Grad-CAM, label (confirm/correct), donated photos, history, summary |
| `app/routers/meta.py` | Model info (cached from ml-service) and health |
| `app/ml_client.py` | Calls ml-service; turns its failures into clear errors |
| `app/security.py` | Argon2id passwords, signed session cookie, role checks |
| `app/ratelimit.py` | Per-IP limit on the endpoints that run the model |
| `app/models.py` | Tables: users, scans, streams, drop points, containers, deposits, the points ledger, rewards, redemptions, pickups |
| `app/points.py` | Member codes, deposits, balances, redemptions |
| `app/forecast.py`, `app/board.py` | The fill forecast and pickup run (pure functions), and the admin board built from them |
| `app/cli.py`, `app/demo.py` | `python -m app.cli create-user` and `seed-demo` |
| `migrations/` | Alembic migrations (`alembic upgrade head` runs on container start) |

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `POST /api/auth/register` | anyone | Create a resident account and log in (`email`, `password` ≥ 8 chars, `display_name`) |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | | Session in an httpOnly cookie |
| `POST /api/scans` | anyone (guests too) | Form: `file`, `zoom`, `donate`. Returns the stored scan (with the bin-level answer `top_bin`, `bin_confidence`, `bin_unsure`) plus `class_index`, `threshold`, `crop_box`, `battery_chance`, `battery_warning` |
| `POST /api/explain` | anyone | Form: `file`, `class_index`, `zoom`. Grad-CAM PNG |
| `PUT /api/scans/{id}/label` | the scan's owner | `{"label": "<class>" or "other"}`: what the item really is |
| `DELETE /api/scans/{id}/photo` | the scan's owner | Deletes a donated photo (withdraw consent) |
| `GET /api/scans?before=&limit=` | logged in | Own scans, newest first, paged |
| `GET /api/scans/summary` | logged in | Own scans per bin |
| `GET /api/model` | anyone | Classes, bins, threshold and test metrics of the served model |
| `GET /api/health` | anyone | Database and ml-service status |
| `GET /api/streams`, `GET /api/points` | anyone | The bins (points and buy-back price per kg) and the drop-off points |
| `GET /api/me/card`, `GET /api/me/points`, `GET /api/me/redemptions` | logged in | Member code and balance, the points ledger, vouchers |
| `GET /api/rewards`, `POST /api/rewards/{id}/redeem` | anyone / logged in | Rewards; redeeming locks the user's row, then checks balance and stock |
| `GET /api/operator/residents/{code}`, `POST /api/operator/deposits`, `GET /api/operator/deposits` | operator, admin | Find a member, record weighed bins (points added in the same commit), today's deposits |
| `GET /api/operator/vouchers/{code}`, `POST /api/operator/vouchers/{code}/collect` | operator, admin | Check a voucher; hand the reward over (a conditional update, so a code is collected once) |
| `GET /api/admin/board`, `POST /api/admin/pickups` | admin | Fill, forecast and today's run for every bin; record emptied bins |
| `GET/POST/PUT /api/admin/points` | admin | Drop-off points: name, address, map position, bins and sizes, open or closed |
| `GET /api/map` | anyone | Open drop-off points, each bin's fill (weighed drop-offs since it was emptied), when it was last weighed into or emptied, and the forecast |
| `POST /api/admin/jobs`, `GET /api/admin/jobs`, `POST /api/admin/jobs/{id}/cancel` | admin | Offer points to collectors (one open job per point), follow jobs, withdraw one |
| `GET /api/collector/jobs`, `POST /api/collector/jobs/{id}/take`, `POST .../release` | collector | Open jobs, mine and done this week; take one (a conditional update: only one collector gets it); hand it back before starting |
| `POST /api/collector/jobs/{id}/items/{item}/collect`, `POST .../skip` | collector | Form: `weight_kg` and `photo` (the empty bin): records a measured pickup next to what was weighed in. Or skip with a reason |
| `GET /api/pickups/{id}/photo` | admin, the collector who took it | The photo of the emptied bin |
| `PUT /api/admin/streams/{key}`, `GET/POST/PUT /api/admin/rewards`, `GET /api/admin/staff`, `PUT /api/admin/users/{id}/role` | admin | Rates and prices, rewards, roles |

Interactive docs: http://localhost:8000/api/docs.
Errors always look like `{"detail": {"code": "...", "message": "..."}}`, as in ml-service.

## Develop without Docker

Needs Python 3.12 and a PostgreSQL database (or `docker compose up db` from the repo root). From the `api` folder:

```bash
python -m venv .venv
```

Activate it (`.venv\Scripts\Activate.ps1` in PowerShell, `source .venv/bin/activate` elsewhere), then:

```bash
pip install -r requirements-dev.txt
```

```bash
alembic upgrade head
```

```bash
uvicorn app.main:app --reload --port 8000
```

Tests use an in-memory SQLite database and a fake ml-service, so they need neither:

```bash
pytest
```

To run them against PostgreSQL instead, set `TEST_DATABASE_URL` (CI does this), for example
`postgresql+psycopg://trash2cash:trash2cash@localhost:5432/trash2cash_test`.

After changing `app/models.py`, create a migration and check it:

```bash
alembic revision --autogenerate -m "what changed"
```
