"""Phase 7: the community page's totals, and the confusion figures with their privacy threshold."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import DropPoint, Role, Scan, User
from app.points import new_member_code
from app.security import hash_password

from .test_points import deposit, login, world  # noqa: F401  (world is a fixture)


def scan(db, user_id, predicted, label=None, unsure=False, days_ago=1):
    db.add(Scan(user_id=user_id, created_at=datetime.now(UTC) - timedelta(days=days_ago), model_version="t",
                predicted_class=predicted, predicted_bin=None, confidence=0.5 if unsure else 0.9, unsure=unsure,
                top3=[], dhash="0" * 16, latency_ms=1.0, user_label=label))  # fmt: skip


@pytest.fixture
def town(client, world):  # noqa: F811
    """world, a second point, and five residents: three usually at Point A, two at Point B."""
    with client.app.state.sessionmaker() as db:
        b = DropPoint(name="Point B", address="Hostel", lat=4.34, lng=101.15)
        db.add(b)
        ids = []
        for i in range(1, 6):
            u = User(email=f"r{i}@example.com", display_name=f"R{i}", password_hash=hash_password("password1"),
                     role=Role.resident, member_code=new_member_code(db))  # fmt: skip
            db.add(u)
            db.flush()
            ids.append((u.id, u.member_code))
        db.commit()
        b_id = b.id
    login(client, "op@example.com")  # the operator works at Point A
    for _, code in ids[:3]:
        deposit(client, code, [{"stream_key": "blue bin", "weight_kg": 2}])
    login(client, "admin@example.com")
    point_b = {"name": "Point B", "address": "Hostel", "lat": 4.34, "lng": 101.15, "active": True,
               "bins": [{"stream_key": "blue bin", "capacity_kg": 50}]}  # fmt: skip
    client.put(f"/api/admin/points/{b_id}", json=point_b)
    for _, code in ids[3:]:
        client.post("/api/operator/deposits", json={"member_code": code, "point_id": b_id,
                                                    "lines": [{"stream_key": "blue bin", "weight_kg": 1}]})  # fmt: skip
    client.cookies.clear()
    return {**world, "b_id": b_id, "ids": [i for i, _ in ids]}


def test_the_community_page_is_public_and_adds_up(client, town):
    page = client.get("/api/community").json()
    assert page["month"]["kg_total"] == 8 and page["month"]["deposits"] == 5 and page["month"]["residents"] == 5
    assert [(p["name"], p["kg_month"]) for p in page["places"]] == [("Point A", 6.0), ("Point B", 2.0)]
    assert page["streams"] == [{"stream_key": "blue bin", "stream_name": "Paper and cardboard", "kg_month": 8.0}]
    weeks = page["weeks"]
    assert len(weeks) == 8 and weeks[-1]["partial"] and weeks[-1]["kg"] == 8 and sum(w["kg"] for w in weeks) == 8
    assert not any(k in str(page) for k in ("r1@example.com", "R1"))  # no person in it


def test_confusion_shows_only_rows_with_enough_people(client, town):
    a1, a2, a3, b1, b2 = town["ids"]
    with client.app.state.sessionmaker() as db:
        for u in (a1, a2, a3):
            scan(db, u, "cardboard", label="trash")  # greasy pizza boxes: three people say so
        for u in (a1, a2):
            scan(db, u, "paper", label="cardboard")  # only two people: counted, not shown
        for u in (a1, b1, b2):
            scan(db, u, "plastic", label="other")
        scan(db, a1, "metal", unsure=True)  # unanswered "not sure": says nothing about the item
        scan(db, None, "cardboard", label="trash")  # a guest: cannot be counted as a person
        scan(db, a2, "cardboard", label="trash", days_ago=120)  # too old
        db.commit()
    c = client.get("/api/community/confusion").json()
    assert c["min_people"] == 3 and c["people"] == 5
    assert c["disagreements"] == [{"model_said": "cardboard", "people_said": "trash", "people": 3, "scans": 3}]
    assert c["asked"] == [{"item": "trash", "people": 3, "scans": 3}]
    assert c["unknown"] == {"people": 3, "scans": 3}
    assert c["hidden"] == 2  # "cardboard" asked by two people, and the paper/cardboard pair

    at_a = client.get(f"/api/community/confusion?point_id={town['point_id']}").json()
    assert at_a["people"] == 3 and at_a["disagreements"][0]["people"] == 3 and at_a["unknown"] is None
    at_b = client.get(f"/api/community/confusion?point_id={town['b_id']}").json()
    assert at_b["disagreements"] == [] and at_b["asked"] == []
    assert client.get("/api/community/confusion?point_id=999").status_code == 404


def test_demo_scans_are_marked(client):
    from app.demo import seed_demo
    from app.models import Stream

    from .test_points import STREAMS

    with client.app.state.sessionmaker() as db:
        for i, (key, name, pts, price) in enumerate(
            STREAMS + [("e-waste collection", "Batteries", 30, 100), ("textile donation", "Clothes", 8, 20)]
        ):
            db.add(Stream(key=key, name=name, points_per_kg=pts, price_sen_per_kg=price, sort=i))
        db.commit()
        seed_demo(db, days=14)
    c = client.get("/api/community/confusion").json()
    assert c["is_demo"] and c["scans"] > 100 and c["disagreements"]
    assert client.get("/api/community").json()["is_demo"]
