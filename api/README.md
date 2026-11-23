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
| `app/models.py` | Tables: `users`, `scans` |
| `migrations/` | Alembic migrations (`alembic upgrade head` runs on container start) |

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `POST /api/auth/register` | anyone | Create a resident account and log in (`email`, `password` ≥ 8 chars, `display_name`) |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | | Session in an httpOnly cookie |
| `POST /api/scans` | anyone (guests too) | Form: `file`, `zoom`, `donate`. Returns the stored scan plus `class_index`, `threshold`, `crop_box` |
| `POST /api/explain` | anyone | Form: `file`, `class_index`, `zoom`. Grad-CAM PNG |
| `PUT /api/scans/{id}/label` | the scan's owner | `{"label": "<class>" or "other"}`: what the item really is |
| `DELETE /api/scans/{id}/photo` | the scan's owner | Deletes a donated photo (withdraw consent) |
| `GET /api/scans?before=&limit=` | logged in | Own scans, newest first, paged |
| `GET /api/scans/summary` | logged in | Own scans per bin |
| `GET /api/model` | anyone | Classes, bins, threshold and test metrics of the served model |
| `GET /api/health` | anyone | Database and ml-service status |

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
