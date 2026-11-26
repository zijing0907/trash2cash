"""Phase 2: the bin-level answer is stored with the scan, and the battery warning is passed on."""

import httpx2 as httpx

from .conftest import prediction, register, upload


def glass_not_sure_which() -> dict:
    """ml-service's answer for a bottle it cannot place: brown or green glass, but surely the brown bin."""
    p = prediction("brown-glass", 0.41, unsure=True)
    return {**p, "top_bin": "brown bin", "bin_confidence": 0.86, "bin_unsure": False}


def test_bin_level_answer_is_stored_and_returned(client, fake_ml):
    register(client)
    fake_ml.handler = lambda req: httpx.Response(200, json=glass_not_sure_which())
    body = client.post("/api/scans", files=upload()).json()
    assert body["unsure"] is True
    assert (body["top_bin"], body["bin_confidence"], body["bin_unsure"]) == ("brown bin", 0.86, False)

    stored = client.get("/api/scans").json()["items"][0]
    assert (stored["top_bin"], stored["bin_confidence"], stored["bin_unsure"]) == ("brown bin", 0.86, False)


def test_battery_warning_is_passed_on(client, fake_ml):
    warn = {**prediction("metal", 0.7), "battery_chance": 0.14, "battery_warning": True}
    fake_ml.handler = lambda req: httpx.Response(200, json=warn)
    body = client.post("/api/scans", files=upload()).json()
    assert body["battery_warning"] is True and body["battery_chance"] == 0.14


def test_an_older_ml_service_without_bin_level_answers_still_works(client, fake_ml):
    old = {
        k: v
        for k, v in prediction("trash", 0.31, unsure=True).items()
        if not k.startswith(("top_bin", "bin_", "battery_"))
    }
    fake_ml.handler = lambda req: httpx.Response(200, json=old)
    r = client.post("/api/scans", files=upload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["top_bin"] is None and body["bin_unsure"] is None  # left empty, not guessed
    assert body["battery_warning"] is False


def test_summary_counts_a_bin_level_answer_under_the_bin_the_app_named(client, fake_ml):
    """The top class was general waste, but plastic and metal together made the orange bin sure."""
    register(client)
    p = {**prediction("trash", 0.34, unsure=True), "top_bin": "orange bin", "bin_confidence": 0.66, "bin_unsure": False}
    fake_ml.handler = lambda req: httpx.Response(200, json=p)
    client.post("/api/scans", files=upload())
    both_unsure = {**prediction("trash", 0.4, unsure=True), "top_bin": "general waste", "bin_unsure": True}
    fake_ml.handler = lambda req: httpx.Response(200, json=both_unsure)
    client.post("/api/scans", files=upload())
    fake_ml.handler = fake_ml.default
    s = client.get("/api/scans/summary").json()
    assert {b["bin"]: b["count"] for b in s["by_bin"]} == {"orange bin": 1, "general waste": 1}
