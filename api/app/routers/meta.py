"""Model information and health."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter(tags=["meta"])


@router.get("/model")
def model_info(request: Request):
    """Classes, bins, "not sure" threshold and test metrics of the model being served (from its meta.json)."""
    return request.app.state.ml.model_info()


@router.get("/health")
def health(request: Request, db: Session = Depends(get_db)):
    """Always 200 while the API runs, so a slow model start does not restart the API; says what is down."""
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    ml = request.app.state.ml.health()
    return {
        "status": "ok" if db_ok and ml else "degraded",
        "database": "ok" if db_ok else "down",
        "ml_service": "ok" if ml else "down",
        "model_version": ml.get("model_version") if ml else None,
    }
