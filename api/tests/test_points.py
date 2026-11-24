"""Deposits, points, rewards and the admin board, through the HTTP API."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.demo import seed_demo
from app.models import Container, Deposit, DropPoint, Reward, Role, Stream, User
from app.points import new_member_code
from app.security import hash_password

from .conftest import register

STREAMS = [("blue bin", "Paper and cardboard", 10, 30), ("orange bin", "Plastic and metal cans", 20, 80),
           ("brown bin", "Glass bottles and jars", 5, 10)]  # fmt: skip


@pytest.fixture
def world(client):
    """Bins, one drop-off point (blue + orange), an admin, an operator at that point and a resident."""
    with client.app.state.sessionmaker() as db:
        for i, (key, name, pts, price) in enumerate(STREAMS):
            db.add(Stream(key=key, name=name, points_per_kg=pts, price_sen_per_kg=price, sort=i))
        point = DropPoint(name="Point A", address="Library", lat=4.3375, lng=101.1436)
        point.containers = [
            Container(stream_key="blue bin", capacity_kg=100),
            Container(stream_key="orange bin", capacity_kg=50),
        ]
        db.add(point)
        db.flush()
        for email, role in (("admin@example.com", Role.admin), ("op@example.com", Role.operator)):
            db.add(User(email=email, display_name=email.split("@")[0], password_hash=hash_password("password1"),
                        role=role, member_code=new_member_code(db),
                        drop_point_id=point.id if role == Role.operator else None))  # fmt: skip
        db.commit()
        point_id = point.id
    resident = register(client, email="res@example.com", password="password1", name="Res")
    client.cookies.clear()
    return {"point_id": point_id, "resident": resident}


def login(client, email):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": email, "password": "password1"})
    assert r.status_code == 200, r.text


def deposit(client, code, lines):
    return client.post("/api/operator/deposits", json={"member_code": code, "lines": lines})


def test_new_members_get_a_card_with_a_code(client, world):
    login(client, "res@example.com")
    card = client.get("/api/me/card").json()
    assert card["balance"] == 0 and len(card["member_code"]) == 9 and card["member_code"][4] == "-"


def test_operator_weighs_and_the_resident_earns_points(client, world):
    code = world["resident"]["member_code"]
    login(client, "op@example.com")
    found = client.get(f"/api/operator/residents/{code.lower().replace('-', '')}").json()
    assert found == {"display_name": "Res", "member_code": code, "balance": 0}

    r = deposit(
        client, code, [{"stream_key": "blue bin", "weight_kg": 2.5}, {"stream_key": "orange bin", "weight_kg": 1.234}]
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["points"] == 25 + 25 and d["balance_after"] == 50  # 2.5 kg x 10 + 1.234 kg x 20 = 24.68 -> 25
    assert [ln["weight_g"] for ln in d["lines"]] == [2500, 1234]
    assert [x["resident_name"] for x in client.get("/api/operator/deposits").json()] == ["Res"]

    login(client, "res@example.com")
    page = client.get("/api/me/points").json()
    assert page["balance"] == 50
    assert page["items"][0]["reason"] == "deposit" and page["items"][0]["point_name"] == "Point A"


def test_deposit_rules(client, world):
    code = world["resident"]["member_code"]
    login(client, "op@example.com")
    assert (
        deposit(client, code, [{"stream_key": "brown bin", "weight_kg": 1}]).json()["detail"]["code"] == "not_collected"
    )
    two = [{"stream_key": "blue bin", "weight_kg": 1}, {"stream_key": "blue bin", "weight_kg": 2}]
    assert deposit(client, code, two).json()["detail"]["code"] == "duplicate_stream"
    assert deposit(client, code, [{"stream_key": "blue bin", "weight_kg": 101}]).status_code == 422
    assert deposit(client, "ZZZZ-ZZZZ", [{"stream_key": "blue bin", "weight_kg": 1}]).status_code == 404
    with client.app.state.sessionmaker() as db:
        own = db.scalar(select(User.member_code).where(User.email == "op@example.com"))
    assert deposit(client, own, [{"stream_key": "blue bin", "weight_kg": 1}]).json()["detail"]["code"] == "own_deposit"


def test_only_staff_can_record_deposits(client, world):
    code = world["resident"]["member_code"]
    assert deposit(client, code, [{"stream_key": "blue bin", "weight_kg": 1}]).status_code == 401
    login(client, "res@example.com")
    assert deposit(client, code, [{"stream_key": "blue bin", "weight_kg": 1}]).status_code == 403
    assert client.get("/api/admin/board").status_code == 403


def test_operator_without_a_point_is_told_so(client, world):
    with client.app.state.sessionmaker() as db:
        db.scalar(select(User).where(User.email == "op@example.com")).drop_point_id = None
        db.commit()
    login(client, "op@example.com")
    r = deposit(client, world["resident"]["member_code"], [{"stream_key": "blue bin", "weight_kg": 1}])
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_point"


def test_redeeming_spends_points_and_stock(client, world):
    code = world["resident"]["member_code"]
    login(client, "admin@example.com")
    reward = client.post("/api/admin/rewards", json={"name": "Bag", "cost_points": 40, "stock": 1}).json()
    login(client, "res@example.com")
    r = client.post(f"/api/rewards/{reward['id']}/redeem")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "not_enough_points"

    login(client, "op@example.com")
    deposit(client, code, [{"stream_key": "orange bin", "weight_kg": 5}])  # 100 points
    login(client, "res@example.com")
    red = client.post(f"/api/rewards/{reward['id']}/redeem").json()
    assert red["reward_name"] == "Bag" and len(red["code"]) == 9
    assert client.get("/api/me/card").json()["balance"] == 60
    again = client.post(f"/api/rewards/{reward['id']}/redeem")
    assert again.status_code == 409 and again.json()["detail"]["code"] == "out_of_stock"
    assert client.get("/api/me/card").json()["balance"] == 60  # nothing spent on the failed attempt
    assert [x["reward_name"] for x in client.get("/api/me/redemptions").json()] == ["Bag"]


def test_board_forecasts_and_pickups_empty_a_bin(client, world):
    code = world["resident"]["member_code"]
    login(client, "op@example.com")
    deposit(client, code, [{"stream_key": "orange bin", "weight_kg": 46}])  # 92% of a 50 kg bin
    login(client, "admin@example.com")
    board = client.get("/api/admin/board").json()
    bins = {b["stream_key"]: b for b in board["points"][0]["bins"]}
    assert bins["orange bin"]["fill_kg"] == 46 and bins["orange bin"]["status"] == "due"
    assert bins["blue bin"]["status"] == "idle"
    assert board["run"]["stops"][0]["bins"] == ["orange bin"]
    assert board["month"]["kg_total"] == 46 and board["month"]["value_sen"] == 46 * 80
    assert board["month"]["points_issued"] == 920 and board["month"]["residents"] == 1

    r = client.post("/api/admin/pickups", json={"container_ids": [bins["orange bin"]["container_id"]]})
    assert r.json() == {"emptied": 1, "collected_kg": 46.0}
    after = {b["stream_key"]: b for b in client.get("/api/admin/board").json()["points"][0]["bins"]}
    assert after["orange bin"]["fill_kg"] == 0


def test_admin_sets_rates_and_roles(client, world):
    login(client, "admin@example.com")
    r = client.put("/api/admin/streams/blue bin", json={"points_per_kg": 12, "price_sen_per_kg": 35})
    assert r.json()["points_per_kg"] == 12
    res_id = world["resident"]["id"]
    bad = client.put(f"/api/admin/users/{res_id}/role", json={"role": "operator"})
    assert bad.json()["detail"]["code"] == "point_required"
    ok = client.put(f"/api/admin/users/{res_id}/role", json={"role": "operator", "drop_point_id": world["point_id"]})
    assert ok.json()["role"] == "operator"
    me = client.get("/api/auth/me").json()
    assert client.put(f"/api/admin/users/{me['id']}/role", json={"role": "resident"}).status_code == 409
    assert {u["email"] for u in client.get("/api/admin/staff").json()} >= {"admin@example.com", "res@example.com"}


def test_public_lists(client, world):
    assert [s["key"] for s in client.get("/api/streams").json()] == ["blue bin", "orange bin", "brown bin"]
    assert client.get("/api/points").json()[0]["streams"] == ["blue bin", "orange bin"]


def test_demo_seed_fills_the_board_once(client):
    with client.app.state.sessionmaker() as db:
        for i, (key, name, pts, price) in enumerate(
            STREAMS + [("e-waste collection", "Batteries", 30, 100), ("textile donation", "Clothes", 8, 20)]
        ):
            db.add(Stream(key=key, name=name, points_per_kg=pts, price_sen_per_kg=price, sort=i))
        db.commit()
        out = seed_demo(db, days=21)
        assert out["points"] == 4 and seed_demo(db)["skipped"]
        assert db.scalar(select(Deposit.id)) is not None
        assert all(p.is_demo for p in db.scalars(select(DropPoint))) and all(
            r.is_demo for r in db.scalars(select(Reward))
        )
        stamps = [d.created_at for d in db.scalars(select(Deposit))]
        latest = max(t if t.tzinfo else t.replace(tzinfo=UTC) for t in stamps)
        assert latest <= datetime.now(UTC) + timedelta(seconds=1)
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "admin.demo@example.com", "password": "demo-password"})
    assert r.status_code == 200
    board = client.get("/api/admin/board").json()
    assert board["is_demo"] and len(board["points"]) == 4 and board["month"]["kg_total"] >= 0
