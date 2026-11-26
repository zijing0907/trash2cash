"""Phase 6b: home pickups, from booking to points for what the collector weighed at the door."""

from datetime import date, timedelta

import pytest

from .test_jobs import JPEG, crew  # noqa: F401  (crew is a fixture)
from .test_points import login, world  # noqa: F401

TODAY = date.today()  # the tests' clock and Malaysia agree except a few hours a day; the window is 14 days


def book(client, **over):
    data = {"streams": "blue bin,orange bin", "rough_kg": "25", "address": "No. 12, Jalan Mawar 3, Kampar",
            "lat": "4.31234", "lng": "101.15678", "day": str(TODAY + timedelta(days=2)), "slot": "morning",
            "note": "Boxes by the gate"}  # fmt: skip
    photo = over.pop("photo", JPEG)
    data.update({k: str(v) for k, v in over.items()})
    return client.post("/api/home-pickups", data=data, files={"photo": ("items.jpg", photo, "image/jpeg")})


@pytest.fixture
def booked(client, crew):  # noqa: F811
    login(client, "res@example.com")
    r = book(client)
    assert r.status_code == 201, r.text
    return r.json()


def test_a_resident_books_a_home_pickup(client, booked):
    assert booked["status"] == "requested" and booked["streams"] == ["blue bin", "orange bin"]
    assert booked["address"].startswith("No. 12") and booked["lat"] == 4.31234
    assert [p["id"] for p in client.get("/api/home-pickups/mine").json()] == [booked["id"]]
    assert client.get(f"/api/home-pickups/{booked['id']}/photo").content == JPEG


@pytest.mark.parametrize(
    ("over", "code"),
    [
        ({"streams": "gold bin"}, "bad_streams"),
        ({"rough_kg": 2}, "bad_weight"),  # small amounts belong at a drop-off point
        ({"day": str(TODAY - timedelta(days=1))}, "bad_day"),
        ({"day": str(TODAY + timedelta(days=30))}, "bad_day"),
        ({"photo": b"%PDF"}, "not_a_photo"),
    ],
)
def test_bookings_are_checked(client, crew, over, code):  # noqa: F811
    login(client, "res@example.com")
    r = book(client, **over)
    assert r.status_code == 422 and r.json()["detail"]["code"] == code


def test_two_open_bookings_at_most_and_only_signed_in(client, crew):  # noqa: F811
    client.cookies.clear()
    assert book(client).status_code == 401
    login(client, "res@example.com")
    assert book(client).status_code == 201 and book(client).status_code == 201
    third = book(client)
    assert third.status_code == 409 and third.json()["detail"]["code"] == "too_many_open"


def test_other_collectors_see_the_area_not_the_address(client, booked):
    login(client, "col1@example.com")
    seen = client.get("/api/collector/home-pickups").json()["open"][0]
    assert seen["area"] == [4.31, 101.16]
    assert not {"address", "lat", "lng", "note", "resident"} & seen.keys()
    assert client.get(f"/api/home-pickups/{booked['id']}/photo").status_code == 404  # not until taken

    taken = client.post(f"/api/collector/home-pickups/{booked['id']}/take").json()
    assert taken["status"] == "taken" and taken["address"].startswith("No. 12") and taken["resident"]["name"] == "Res"
    assert client.get(f"/api/home-pickups/{booked['id']}/photo").status_code == 200
    login(client, "col2@example.com")
    late = client.post(f"/api/collector/home-pickups/{booked['id']}/take")
    assert late.status_code == 409 and late.json()["detail"]["code"] == "pickup_not_open"


def test_points_come_from_the_weights_at_the_door_not_the_estimate(client, booked):
    login(client, "col1@example.com")
    client.post(f"/api/collector/home-pickups/{booked['id']}/take")
    lines = [{"stream_key": "blue bin", "weight_kg": 31.5}, {"stream_key": "orange bin", "weight_kg": 4}]
    done = client.post(f"/api/collector/home-pickups/{booked['id']}/collect", json=lines)
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "done" and body["points"] == 315 + 80  # 31.5 kg x 10 + 4 kg x 20
    assert body["weighed"] == [
        {"stream_key": "blue bin", "weight_g": 31500},
        {"stream_key": "orange bin", "weight_g": 4000},
    ]
    again = client.post(f"/api/collector/home-pickups/{booked['id']}/collect", json=lines)
    assert again.status_code == 409  # a second tap does not pay twice

    login(client, "res@example.com")
    page = client.get("/api/me/points").json()
    assert page["items"][0]["delta"] == 395 and page["items"][0]["point_name"] == "Home pickup"
    assert page["balance"] == 300 + 395  # 300 from the 30 kg the crew fixture weighed in at Point A
    # A home pickup fills no drop-off bin, but counts in the month's recycled weight
    login(client, "admin@example.com")
    board = client.get("/api/admin/board").json()
    fills = {b["stream_key"]: b["fill_kg"] for b in board["points"][0]["bins"]}
    assert fills == {"blue bin": 30, "orange bin": 0}  # only the 30 kg weighed in at the point itself
    assert board["month"]["kg_total"] == 30 + 35.5
    assert [p["status"] for p in client.get("/api/admin/home-pickups").json()] == ["done"]


def test_missed_release_and_cancel(client, booked):
    login(client, "res@example.com")
    second = book(client).json()
    login(client, "col1@example.com")
    client.post(f"/api/collector/home-pickups/{booked['id']}/take")
    released = client.post(f"/api/collector/home-pickups/{booked['id']}/release").json()
    assert released["status"] == "requested" and released["collector"] is None and "address" not in released
    client.post(f"/api/collector/home-pickups/{booked['id']}/take")
    r = client.post(f"/api/collector/home-pickups/{booked['id']}/missed", json={"reason": "Nobody home at 11 am"})
    assert r.json()["status"] == "missed" and r.json()["missed_reason"] == "Nobody home at 11 am"
    assert [p["status"] for p in client.get("/api/collector/home-pickups").json()["done"]] == ["missed"]

    login(client, "res@example.com")
    assert client.post(f"/api/home-pickups/{second['id']}/cancel").json()["status"] == "cancelled"
    assert client.post(f"/api/home-pickups/{second['id']}/cancel").status_code == 409
    assert book(client).status_code == 201  # missed and cancelled ones no longer count as open


def test_a_taken_pickup_cannot_be_cancelled_and_others_cannot_touch_it(client, booked):
    login(client, "col1@example.com")
    client.post(f"/api/collector/home-pickups/{booked['id']}/take")
    login(client, "res@example.com")
    r = client.post(f"/api/home-pickups/{booked['id']}/cancel")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "already_taken"
    login(client, "col2@example.com")
    assert client.post(f"/api/collector/home-pickups/{booked['id']}/collect", json=[]).status_code == 404
    login(client, "op@example.com")
    assert client.get("/api/collector/home-pickups").status_code == 403
    assert client.get(f"/api/home-pickups/{booked['id']}/photo").status_code == 404
