import uuid

import httpx2 as httpx

from .conftest import photo, prediction, register, upload


def test_guest_can_scan(client, fake_ml):
    r = client.post("/api/scans", files=upload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["predicted_class"] == "plastic" and body["predicted_bin"] == "orange bin"
    assert body["top3"][0] == {"class": "plastic", "prob": 0.91}
    assert body["class_index"] == 8 and body["crop_box"] == [0, 0, 100, 100]
    assert body["unsure"] is False and body["photo_donated"] is False
    uuid.UUID(body["id"])
    assert fake_ml.paths() == ["/predict"]


def test_zoom_is_passed_to_the_model(client, fake_ml):
    client.post("/api/scans", files=upload(), data={"zoom": "true"})
    assert fake_ml.calls[0].url.params["zoom"] == "true"


def test_unsure_answer_is_stored_as_unsure(client, fake_ml):
    fake_ml.handler = lambda req: httpx.Response(200, json=prediction("trash", 0.31, unsure=True))
    body = client.post("/api/scans", files=upload()).json()
    assert body["unsure"] is True and body["confidence"] == 0.31


def test_logged_in_scans_appear_in_history_newest_first(client, fake_ml):
    register(client)
    for cls in ("paper", "metal", "battery"):
        fake_ml.handler = lambda req, cls=cls: httpx.Response(200, json=prediction(cls))
        assert client.post("/api/scans", files=upload()).status_code == 201
    page = client.get("/api/scans?limit=2").json()
    assert [s["predicted_class"] for s in page["items"]] == ["battery", "metal"]
    assert page["next_before"] is not None
    rest = client.get("/api/scans", params={"limit": 2, "before": page["next_before"]}).json()
    assert [s["predicted_class"] for s in rest["items"]] == ["paper"] and rest["next_before"] is None


def test_history_needs_login_and_excludes_guest_scans(client):
    client.post("/api/scans", files=upload())  # as a guest
    assert client.get("/api/scans").status_code == 401
    register(client)
    assert client.get("/api/scans").json()["items"] == []


def test_ml_errors_are_passed_on(client, fake_ml):
    fake_ml.handler = lambda req: httpx.Response(
        415, json={"detail": {"code": "unsupported_format", "message": "GIF images are not supported."}}
    )
    r = client.post("/api/scans", files=upload(name="x.gif", ctype="image/gif"))
    assert r.status_code == 415 and r.json()["detail"]["code"] == "unsupported_format"


def test_ml_service_down_gives_503(client, fake_ml):
    def down(req):
        raise httpx.ConnectError("connection refused")

    fake_ml.handler = down
    r = client.post("/api/scans", files=upload())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "ml_unavailable"


def test_ml_service_crash_gives_503_without_leaking_details(client, fake_ml):
    fake_ml.handler = lambda req: httpx.Response(500, text="Traceback ... secret internals")
    r = client.post("/api/scans", files=upload())
    assert r.status_code == 503 and "Traceback" not in r.text


def test_ml_timeout_gives_504(client, fake_ml):
    def slow(req):
        raise httpx.ReadTimeout("too slow")

    fake_ml.handler = slow
    r = client.post("/api/scans", files=upload())
    assert r.status_code == 504 and r.json()["detail"]["code"] == "timeout"


def test_too_large_upload_never_reaches_the_model(client, fake_ml):
    r = client.post("/api/scans", files=upload(photo(1024 * 1024 + 10)))
    assert r.status_code == 413 and r.json()["detail"]["code"] == "file_too_large"
    assert fake_ml.calls == []


def test_empty_upload(client, fake_ml):
    r = client.post("/api/scans", files=upload(b""))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "empty_file"
    assert fake_ml.calls == []


def test_photo_is_kept_only_with_consent_and_can_be_deleted(client, tmp_path):
    media = tmp_path / "media"
    plain = client.post("/api/scans", files=upload()).json()
    assert plain["photo_donated"] is False and not media.exists()

    donated = client.post("/api/scans", files=upload(), data={"donate": "true"}).json()
    assert donated["photo_donated"] is True
    stored = media / f"{donated['id']}.jpg"
    assert stored.read_bytes() == photo()

    assert client.delete(f"/api/scans/{donated['id']}/photo").status_code == 204
    assert not stored.exists()


def test_label_confirms_or_corrects_a_scan(client):
    scan = client.post("/api/scans", files=upload()).json()
    r = client.put(f"/api/scans/{scan['id']}/label", json={"label": "metal"})
    assert r.status_code == 200 and r.json()["user_label"] == "metal"
    r = client.put(f"/api/scans/{scan['id']}/label", json={"label": "other"})
    assert r.json()["user_label"] == "other"


def test_label_must_be_a_known_class(client):
    scan = client.post("/api/scans", files=upload()).json()
    r = client.put(f"/api/scans/{scan['id']}/label", json={"label": "styrofoam"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "bad_label"


def test_users_cannot_touch_each_others_scans(client, make_client):
    register(client, email="owner@example.com")
    scan = client.post("/api/scans", files=upload(), data={"donate": "true"}).json()

    other = make_client()
    register(other, email="other@example.com")
    assert other.put(f"/api/scans/{scan['id']}/label", json={"label": "metal"}).status_code == 404
    assert other.delete(f"/api/scans/{scan['id']}/photo").status_code == 404
    other.cookies.clear()  # a guest neither
    assert other.put(f"/api/scans/{scan['id']}/label", json={"label": "metal"}).status_code == 404


def test_unknown_scan_is_404(client):
    r = client.put(f"/api/scans/{uuid.uuid4()}/label", json={"label": "metal"})
    assert r.status_code == 404


def test_summary_counts_by_bin_using_the_users_label(client, fake_ml):
    register(client)
    ids = []
    for cls in ("paper", "cardboard", "plastic"):
        fake_ml.handler = lambda req, cls=cls: httpx.Response(200, json=prediction(cls))
        ids.append(client.post("/api/scans", files=upload()).json()["id"])
    fake_ml.handler = fake_ml.default
    client.put(f"/api/scans/{ids[2]}/label", json={"label": "battery"})  # the "plastic" was really a battery
    s = client.get("/api/scans/summary").json()
    assert s["total"] == 3 and s["labelled"] == 1
    assert {b["bin"]: b["count"] for b in s["by_bin"]} == {"blue bin": 2, "e-waste collection": 1}


def test_explain_returns_the_png_and_passes_the_settings(client, fake_ml):
    r = client.post("/api/explain", files=upload(), data={"class_index": "3", "zoom": "true"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.content.startswith(b"\x89PNG") and r.headers["x-class"] == "plastic"
    params = fake_ml.calls[0].url.params
    assert params["class_index"] == "3" and params["zoom"] == "true"


def test_scans_are_rate_limited_per_ip(make_client):
    c = make_client(scan_rate_per_min=2)
    assert c.post("/api/scans", files=upload()).status_code == 201
    assert c.post("/api/explain", files=upload()).status_code == 200
    r = c.post("/api/scans", files=upload())
    assert r.status_code == 429 and r.json()["detail"]["code"] == "rate_limited"
    assert int(r.headers["retry-after"]) > 0
