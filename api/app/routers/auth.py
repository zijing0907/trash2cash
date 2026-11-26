from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import api_error
from ..models import Role, User
from ..schemas import LoginIn, RegisterIn, UserOut
from ..security import clear_session_cookie, hash_password, optional_user, set_session_cookie, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = User(
        email=body.email.lower(),
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        role=Role.resident,  # operators and admins are created by an admin, never by sign-up
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise api_error(409, "email_taken", "An account with this e-mail already exists. Log in instead.") from None
    set_session_cookie(response, request, user)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not verify_password(user.password_hash if user else None, body.password):
        raise api_error(401, "bad_credentials", "Wrong e-mail or password.")
    set_session_cookie(response, request, user)
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    clear_session_cookie(response, request)


@router.get("/me", response_model=UserOut | None)
def me(user: User | None = Depends(optional_user)):
    """The logged-in user, or null for a guest. (A 200 either way: being a guest is not an error, and the
    web app asks this on every page load.)"""
    return user
