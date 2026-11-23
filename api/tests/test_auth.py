from app.security import COOKIE_NAME

from .conftest import register


def test_register_logs_in_and_me_returns_the_user(client):
    user = register(client, email="Aina@Example.com")
    assert user["email"] == "aina@example.com"  # stored lower-case
    assert user["role"] == "resident"
    assert "password" not in str(user) and "hash" not in str(user)
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["id"] == user["id"]


def test_me_is_null_for_guests(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json() is None


def test_session_cookie_is_httponly_and_samesite(client):
    r = client.post(
        "/api/auth/register", json={"email": "b@example.com", "password": "long enough", "display_name": "B"}
    )
    cookie = r.headers["set-cookie"].lower()
    assert f"{COOKIE_NAME}=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert "secure" not in cookie  # cookie_secure=False in tests (plain http on localhost)


def test_secure_cookie_when_configured(make_client):
    c = make_client(cookie_secure=True)
    r = c.post("/api/auth/register", json={"email": "s@example.com", "password": "long enough", "display_name": "S"})
    assert "secure" in r.headers["set-cookie"].lower()


def test_duplicate_email_is_rejected(client):
    register(client)
    r = client.post(
        "/api/auth/register", json={"email": "AINA@example.com", "password": "another one", "display_name": "X"}
    )
    assert r.status_code == 409 and r.json()["detail"]["code"] == "email_taken"


def test_validation_errors_use_the_common_shape(client):
    r = client.post("/api/auth/register", json={"email": "c@example.com", "password": "short", "display_name": "C"})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["code"] == "invalid_input" and detail["field"] == "password"


def test_login_logout(client):
    register(client)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json() is None
    r = client.post("/api/auth/login", json={"email": "AINA@example.com", "password": "correct horse"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(client):
    register(client)
    client.cookies.clear()
    wrong = client.post("/api/auth/login", json={"email": "aina@example.com", "password": "wrong password"})
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_forged_or_expired_cookie_counts_as_logged_out(client):
    client.cookies.set(COOKIE_NAME, "not.a.jwt")
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json() is None
    assert client.get("/api/scans").status_code == 401  # endpoints that need a login still refuse


def test_cookie_signed_with_another_key_is_rejected(make_client):
    a = make_client(secret_key="a" * 40)
    register(a)
    token = a.cookies.get(COOKIE_NAME)
    b = make_client(secret_key="b" * 40)
    b.cookies.set(COOKIE_NAME, token)
    assert b.get("/api/auth/me").json() is None
