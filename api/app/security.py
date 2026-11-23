"""Passwords and sessions.

- Passwords are hashed with Argon2id (argon2-cffi defaults).
- The session is a signed JWT in an httpOnly cookie: page scripts cannot read it (so an XSS bug cannot
  steal it), and SameSite=Lax stops other sites from sending it with their POST requests.
"""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from .db import get_db
from .errors import api_error
from .models import Role, User

COOKIE_NAME = "t2c_session"
ALGORITHM = "HS256"

_hasher = PasswordHasher()
# Verified against when the e-mail is unknown, so "no such user" takes as long as "wrong password"
# and response times do not reveal which e-mails have accounts.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def set_session_cookie(response: Response, request: Request, user: User) -> None:
    s = request.app.state.settings
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": str(user.id), "iat": now, "exp": now + timedelta(days=s.session_days)}, s.secret_key, ALGORITHM
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=s.session_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, request: Request) -> None:
    s = request.app.state.settings
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=s.cookie_secure, samesite="lax")


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """The logged-in user, or None for a guest (also when the cookie is expired or forged)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        claims = jwt.decode(token, request.app.state.settings.secret_key, algorithms=[ALGORITHM])
        user_id = int(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    return db.get(User, user_id)


def current_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise api_error(401, "not_logged_in", "Please log in first.")
    return user


def require_role(*roles: Role):
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise api_error(403, "forbidden", "Your account cannot do this.")
        return user

    return check
