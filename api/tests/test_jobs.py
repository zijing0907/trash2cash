"""Phase 4: the public map, and pickup jobs from offer to a weighed, photographed pickup."""

import pytest

from app.models import Role, User
from app.points import new_member_code
from app.security import hash_password

from .test_points import deposit, login, world  # noqa: F401  (world is a fixture)

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


@pytest.fixture
def crew(client, world):  # noqa: F811
    """world plus two collectors, and 30 kg of paper weighed in at Point A."""
    with client.app.state.sessionmaker() as db:
        for email in ("col1@example.com", "col2@example.com"):
            db.add(User(email=email, display_name=email.split("@")[0], password_hash=hash_password("password1"),
                        role=Role.collector, member_code=new_member_code(db)))  # fmt: skip
        db.commit()
    login(client, "op@example.com")
    assert (
        deposit(client, world["resident"]["member_code"], [{"stream_key": "blue bin", "weight_kg": 30}]).status_code
        == 201
    )
    return world


def offer(client, point_id):
    login(client, "admin@example.com")
    return client.post("/api/admin/jobs", json={"point_ids": [point_id]})


def collect(client, job, item, kg=33.5, photo=JPEG):
    return client.post(
        f"/api/collector/jobs/{job['id']}/items/{item['id']}/collect",
        data={"weight_kg": str(kg)},
        files={"photo": ("bin.jpg", photo, "image/jpeg")},
    )


def test_the_map_is_public_and_shows_how_each_fill_is_known(client, crew):
    client.cookies.clear()
    point = client.get("/api/map").json()["points"][0]
    bins = {b["stream_key"]: b for b in point["bins"]}
    assert point["name"] == "Point A" and point["lat"] == 4.3375
    assert bins["blue bin"]["fill_kg"] == 30 and bins["blue bin"]["last_deposit_at"] is not None
    assert bins["orange bin"]["fill_kg"] == 0 and bins["orange bin"]["last_deposit_at"] is None
    assert bins["blue bin"]["emptied_at"] is None
    assert "container_id" not in bins["blue bin"]  # internal ids stay internal


def test_nothing_weighed_in_means_nothing_to_offer(client, world):  # noqa: F811
    r = offer(client, world["point_id"])
    assert r.status_code == 422 and r.json()["detail"]["code"] == "nothing_to_collect"


def test_a_job_lists_the_bins_with_something_in_them_and_cannot_be_offered_twice(client, crew):
    r = offer(client, crew["point_id"])
    assert r.status_code == 201, r.text
    job = r.json()[0]
    assert job["status"] == "open" and job["collector"] is None
    assert [(i["stream_key"], i["expected_kg"], i["state"]) for i in job["items"]] == [("blue bin", 30.0, "to_do")]
    again = offer(client, crew["point_id"])
    assert again.status_code == 409 and again.json()["detail"]["code"] == "job_exists"
    board = client.get("/api/admin/board").json()
    assert board["points"][0]["job"] == {"id": job["id"], "status": "open", "collector": None}


def test_a_collector_takes_the_job_weighs_and_photographs_the_pickup(client, crew):
    job = offer(client, crew["point_id"]).json()[0]
    login(client, "col1@example.com")
    assert [j["id"] for j in client.get("/api/collector/jobs").json()["open"]] == [job["id"]]
    taken = client.post(f"/api/collector/jobs/{job['id']}/take").json()
    assert taken["status"] == "taken" and taken["collector"]["name"] == "col1"

    login(client, "col2@example.com")  # the second collector is too late, and cannot see the first one's job
    late = client.post(f"/api/collector/jobs/{job['id']}/take")
    assert late.status_code == 409 and late.json()["detail"]["code"] == "job_not_open"
    assert client.get("/api/collector/jobs").json() == {"open": [], "mine": [], "done": []}

    login(client, "col1@example.com")
    r = collect(client, job, job["items"][0])
    assert r.status_code == 200, r.text
    done = r.json()
    item = done["items"][0]
    assert done["status"] == "done" and done["finished_at"] is not None
    assert (item["state"], item["collected_kg"], item["weighed_in_kg"], item["has_photo"]) == (
        "collected",
        33.5,
        30.0,
        True,
    )
    assert [j["id"] for j in client.get("/api/collector/jobs").json()["done"]] == [job["id"]]

    # The bin starts from zero, and the map says when it was emptied
    blue = next(b for b in client.get("/api/map").json()["points"][0]["bins"] if b["stream_key"] == "blue bin")
    assert blue["fill_kg"] == 0 and blue["emptied_at"] is not None

    photo = f"/api/pickups/{item['pickup_id']}/photo"
    got = client.get(photo)
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg" and got.content == JPEG
    login(client, "admin@example.com")
    assert client.get(photo).status_code == 200
    for who in ("col2@example.com", "res@example.com"):
        login(client, who)
        assert client.get(photo).status_code == 404


def test_a_pickup_needs_a_real_photo_and_a_sensible_weight_and_counts_once(client, crew):
    job = offer(client, crew["point_id"]).json()[0]
    item = job["items"][0]
    login(client, "col1@example.com")
    client.post(f"/api/collector/jobs/{job['id']}/take")
    not_photo = collect(client, job, item, photo=b"%PDF-1.7 not a photo")
    assert not_photo.status_code == 422 and not_photo.json()["detail"]["code"] == "not_a_photo"
    for kg in (0, -3, 6000):
        assert collect(client, job, item, kg=kg).json()["detail"]["code"] == "bad_weight"
    assert collect(client, job, item).status_code == 200
    twice = collect(client, job, item)
    assert twice.status_code == 409  # the job is done; a second tap does not record a second pickup


def test_release_before_starting_and_skip_with_a_reason(client, crew):
    login(client, "op@example.com")
    deposit(client, crew["resident"]["member_code"], [{"stream_key": "orange bin", "weight_kg": 4}])
    job = offer(client, crew["point_id"]).json()[0]
    assert len(job["items"]) == 2
    login(client, "col1@example.com")
    client.post(f"/api/collector/jobs/{job['id']}/take")
    released = client.post(f"/api/collector/jobs/{job['id']}/release").json()
    assert released["status"] == "open" and released["collector"] is None

    client.post(f"/api/collector/jobs/{job['id']}/take")
    blue, orange = job["items"]
    r = client.post(f"/api/collector/jobs/{job['id']}/items/{orange['id']}/skip", json={"reason": "Bin was locked"})
    assert r.json()["status"] == "taken"  # one bin still to do
    late = client.post(f"/api/collector/jobs/{job['id']}/release")
    assert late.status_code == 409 and late.json()["detail"]["code"] == "job_started"
    done = collect(client, job, blue).json()
    assert done["status"] == "done"
    assert [(i["state"], i["skipped_reason"]) for i in done["items"]] == [
        ("collected", None),
        ("skipped", "Bin was locked"),
    ]
    orange_now = next(b for b in client.get("/api/map").json()["points"][0]["bins"] if b["stream_key"] == "orange bin")
    assert orange_now["fill_kg"] == 4  # a skipped bin keeps its fill


def test_admin_lists_and_withdraws_jobs(client, crew):
    job = offer(client, crew["point_id"]).json()[0]
    assert [j["id"] for j in client.get("/api/admin/jobs").json()] == [job["id"]]
    cancelled = client.post(f"/api/admin/jobs/{job['id']}/cancel").json()
    assert cancelled["status"] == "cancelled"
    assert client.post(f"/api/admin/jobs/{job['id']}/cancel").status_code == 409
    login(client, "col1@example.com")
    assert client.get("/api/collector/jobs").json()["open"] == []
    assert offer(client, crew["point_id"]).status_code == 201  # the point can be offered again


def test_only_collectors_take_jobs_and_only_admins_offer_them(client, crew):
    for who in ("res@example.com", "op@example.com", "admin@example.com"):
        login(client, who)
        assert client.get("/api/collector/jobs").status_code == 403
    login(client, "col1@example.com")
    assert client.post("/api/admin/jobs", json={"point_ids": [crew["point_id"]]}).status_code == 403


def test_making_someone_a_collector_clears_their_drop_off_point(client, crew):
    login(client, "admin@example.com")
    op = next(s for s in client.get("/api/admin/staff").json() if s["email"] == "op@example.com")
    r = client.put(f"/api/admin/users/{op['id']}/role", json={"role": "collector", "drop_point_id": crew["point_id"]})
    assert r.status_code == 200 and r.json()["role"] == "collector" and r.json()["drop_point_id"] is None


def test_demo_seed_adds_collectors_even_to_an_older_demo(client):
    from sqlalchemy import delete, select

    from app.demo import seed_demo
    from app.models import Stream

    from .test_points import STREAMS

    with client.app.state.sessionmaker() as db:
        for i, (key, name, pts, price) in enumerate(
            STREAMS + [("e-waste collection", "Batteries", 30, 100), ("textile donation", "Clothes", 8, 20)]
        ):
            db.add(Stream(key=key, name=name, points_per_kg=pts, price_sen_per_kg=price, sort=i))
        db.commit()
        assert seed_demo(db, days=7)["logins"]["collector"] == "collector1.demo@example.com"
        collectors = lambda: db.scalars(select(User.email).where(User.role == Role.collector)).all()  # noqa: E731
        assert len(collectors()) == 2
        db.execute(delete(User).where(User.role == Role.collector))  # as if seeded before Phase 4
        db.commit()
        again = seed_demo(db)
        assert again["skipped"] and len(again["added collectors"]) == 2 and len(collectors()) == 2


def test_a_withdrawn_job_can_be_reopened_shortly_after(client, crew):
    from datetime import UTC, datetime, timedelta

    from app.models import Job

    job = offer(client, crew["point_id"]).json()[0]
    client.post(f"/api/admin/jobs/{job['id']}/cancel")
    back = client.post(f"/api/admin/jobs/{job['id']}/reopen")
    assert back.status_code == 200 and back.json()["status"] == "open" and back.json()["collector"] is None
    assert client.post(f"/api/admin/jobs/{job['id']}/reopen").status_code == 409  # it is open, not withdrawn

    client.post(f"/api/admin/jobs/{job['id']}/cancel")
    with client.app.state.sessionmaker() as db:
        db.get(Job, job["id"]).finished_at = datetime.now(UTC) - timedelta(minutes=11)
        db.commit()
    assert client.post(f"/api/admin/jobs/{job['id']}/reopen").json()["detail"]["code"] == "cannot_reopen"
