import httpx2 as httpx


def test_model_info_is_cached(client, fake_ml):
    a = client.get("/api/model").json()
    b = client.get("/api/model").json()
    assert a == b and a["class_names"][0] == "battery"
    assert fake_ml.paths().count("/model") == 1


def test_health_ok(client):
    h = client.get("/api/health").json()
    assert h == {"status": "ok", "database": "ok", "ml_service": "ok", "model_version": "CNN-R-test@deadbeef"}


def test_health_degraded_when_ml_is_down(client, fake_ml):
    def down(req):
        raise httpx.ConnectError("refused")

    fake_ml.handler = down
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "degraded" and r.json()["ml_service"] == "down"


def test_docs_are_served_under_api(client):
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").json()["info"]["title"] == "Trash2Cash API"
