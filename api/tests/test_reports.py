"""Phase 6: reports from the public that a bin is full, and the forecast that corrects itself."""

from datetime import UTC, datetime, timedelta

import pytest

from app.forecast import CORRECTION_RANGE, correction
from app.models import Container, Pickup, Role, User
from app.points import new_member_code
from app.security import hash_password

from .test_jobs import JPEG
from .test_points import deposit, login, world  # noqa: F401  (world is a fixture)


@pytest.fixture
def people(client, world):  # noqa: F811
    """world plus four residents who can report."""
    with client.app.state.sessionmaker() as db:
        for i in range(1, 5):
            db.add(User(email=f"p{i}@example.com", display_name=f"P{i}", password_hash=hash_password("password1"),
                        role=Role.resident, member_code=new_member_code(db)))  # fmt: skip
        db.commit()
    return world


def report(client, point_id, stream="blue bin", level="full", photo=None):
    files = {"photo": ("bin.jpg", photo, "image/jpeg")} if photo else None
    return client.post("/api/reports", data={"point_id": point_id, "stream_key": stream, "level": level}, files=files)


def blue(client):
    return next(b for b in client.get("/api/map").json()["points"][0]["bins"] if b["stream_key"] == "blue bin")


# ---- the correction, as pure maths ----------------------------------------------------------------


def test_no_correction_without_enough_measured_pickups():
    assert correction([]) is None
    assert correction([(130.0, 100.0)]) is None  # one pickup is not a habit
    assert correction([(6.0, 4.0), (6.0, 4.0)]) is None  # 8 kg weighed in is too little to learn from


def test_correction_is_the_scale_against_the_weighed_in_total_of_the_last_five():
    c = correction([(130.0, 100.0), (120.0, 100.0)])
    assert (c.factor, c.pickups, c.measured_kg, c.weighed_kg) == (1.25, 2, 250.0, 200.0)
    old_odd_one = [(110.0, 100.0)] * 5 + [(900.0, 100.0)]
    assert correction(old_odd_one).factor == 1.1  # only the newest five count


def test_correction_stays_within_a_believable_range():
    assert correction([(1000.0, 50.0), (1000.0, 50.0)]).factor == CORRECTION_RANGE[1]  # a typo on the scale
    assert correction([(5.0, 50.0), (5.0, 50.0)]).factor == CORRECTION_RANGE[0]


# ---- the correction on the map and the board -------------------------------------------------------


def test_measured_pickups_scale_the_fill_and_say_so(client, people):
    with client.app.state.sessionmaker() as db:
        c = db.query(Container).filter_by(stream_key="blue bin").one()
        long_ago = datetime.now(UTC) - timedelta(days=10)
        for got, weighed in ((65_000, 50_000), (60_000, 50_000)):
            db.add(Pickup(container_id=c.id, collected_g=got, expected_g=weighed, measured=True, created_at=long_ago))
        db.add(Pickup(container_id=c.id, collected_g=999_000, created_at=long_ago))  # not measured: ignored
        c.emptied_at = long_ago
        db.commit()
    login(client, "op@example.com")
    deposit(client, people["resident"]["member_code"], [{"stream_key": "blue bin", "weight_kg": 40}])
    b = blue(client)
    assert b["fill_kg"] == 40 and b["est_fill_kg"] == 50  # 40 kg weighed in x 1.25
    assert b["correction"] == {"factor": 1.25, "pickups": 2, "measured_kg": 125.0, "weighed_kg": 100.0}
    assert b["fill_ratio"] == 0.5  # of the 100 kg bin, from the corrected fill
    orange = next(x for x in client.get("/api/map").json()["points"][0]["bins"] if x["stream_key"] == "orange bin")
    assert orange["correction"] is None and orange["est_fill_kg"] == orange["fill_kg"]


# ---- reports -----------------------------------------------------------------------------------------


def test_reporting_needs_an_account(client, people):
    client.cookies.clear()
    assert report(client, people["point_id"]).status_code == 401


def test_one_report_is_a_hint_and_three_people_make_the_bin_due(client, people):
    pid = people["point_id"]
    login(client, "p1@example.com")
    assert report(client, pid).status_code == 201
    b = blue(client)
    assert b["reports"]["count"] == 1 and b["reports"]["mine"] and not b["reports"]["confirmed"]
    assert b["status"] == "idle" and b["due_because"] is None  # a hint, nothing more
    again = report(client, pid)
    assert again.status_code == 409 and again.json()["detail"]["code"] == "already_reported"

    login(client, "p2@example.com")
    assert blue(client)["reports"]["mine"] is False  # whose report it is stays private
    report(client, pid, level="overflowing", photo=JPEG)
    login(client, "p3@example.com")
    report(client, pid)
    b = blue(client)
    assert b["reports"]["count"] == 3 and b["reports"]["confirmed"] and b["reports"]["overflowing"]
    assert b["status"] == "due" and b["due_because"] == "reports"
    assert "photo_ids" not in b["reports"]

    login(client, "admin@example.com")
    board = client.get("/api/admin/board").json()
    assert [s["point_id"] for s in board["run"]["stops"]] == [pid]  # into today's run
    photo_ids = board["points"][0]["bins"][0]["reports"]["photo_ids"]
    assert len(photo_ids) == 1 and client.get(f"/api/reports/{photo_ids[0]}/photo").status_code == 200
    login(client, "p2@example.com")
    assert client.get(f"/api/reports/{photo_ids[0]}/photo").status_code == 403  # photos are for admins


def test_reports_reset_when_the_bin_is_emptied(client, people):
    pid = people["point_id"]
    for who in ("p1", "p2", "p3"):
        login(client, f"{who}@example.com")
        report(client, pid)
    login(client, "admin@example.com")
    blue_id = next(b["container_id"] for b in client.get("/api/admin/board").json()["points"][0]["bins"]
                   if b["stream_key"] == "blue bin")  # fmt: skip
    client.post("/api/admin/pickups", json={"container_ids": [blue_id]})
    assert blue(client)["reports"] is None and blue(client)["status"] != "due"


def test_old_reports_stop_counting(client, people):
    pid = people["point_id"]
    login(client, "p1@example.com")
    report(client, pid)
    with client.app.state.sessionmaker() as db:
        from app.models import BinReport

        db.query(BinReport).update({"created_at": datetime.now(UTC) - timedelta(hours=25)})
        db.commit()
    assert blue(client)["reports"] is None
    assert report(client, pid).status_code == 201  # and the cool-down is over too


def test_reports_are_checked(client, people):
    login(client, "p1@example.com")
    assert report(client, people["point_id"], stream="brown bin").json()["detail"]["code"] == "bin_not_found"
    assert report(client, 999).status_code == 404
    assert report(client, people["point_id"], level="smelly").status_code == 422
    bad = report(client, people["point_id"], photo=b"%PDF-1.7")
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "not_a_photo"
