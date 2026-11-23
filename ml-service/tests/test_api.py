"""HTTP tests for app/main.py, using the tiny fake models from conftest.py."""

import dataclasses
import io
import time

from PIL import Image

from .conftest import CLASS_NAMES, FAKE_IMG_SIZE, photo_bytes


def upload(data: bytes, name="photo.jpg", content_type="image/jpeg"):
    return {"file": (name, data, content_type)}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["model_version"].startswith("CNN-test@")


def test_model_info_comes_from_meta_json(client):
    body = client.get("/model").json()
    assert body["key"] == "cnn"
    assert body["class_names"] == CLASS_NAMES
    assert body["img_size"] == FAKE_IMG_SIZE
    assert body["bins"]["plastic"] == "orange bin"
    assert body["threshold"] == 0.6
    assert body["metrics"] == {"test_macro_f1": 0.5}


def test_default_service_serves_the_robust_model(default_client):
    assert default_client.get("/model").json()["key"] == "cnn_robust"


def test_predict(client):
    r = client.post("/predict", files=upload(photo_bytes()))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["top3"][0] == {"class": "plastic", "prob": body["confidence"]}
    assert body["bin"] == "orange bin"
    assert body["unsure"] is False
    assert body["class_index"] == CLASS_NAMES.index("plastic")
    assert set(body["probs"]) == set(CLASS_NAMES)
    assert len(body["crop_box"]) == 4
    assert body["latency_ms"] > 0
    assert body["model_version"].startswith("CNN-test@")


def test_predict_not_sure(default_client):
    body = default_client.post("/predict", files=upload(photo_bytes())).json()
    assert body["unsure"] is True
    assert len(body["top3"]) == 3


def test_predict_options(client):
    body = client.post("/predict?zoom=true&tta=true", files=upload(photo_bytes((600, 400)))).json()
    assert body["tta"] is True
    assert isinstance(body["zoomed"], bool)


def test_predict_png_and_heic(client):
    for fmt, mime in (("PNG", "image/png"), ("HEIF", "image/heic")):
        r = client.post("/predict", files=upload(photo_bytes(fmt=fmt), "x", mime))
        assert r.status_code == 200, (fmt, r.text)


def test_explain(client):
    r = client.post("/explain?class_index=2", files=upload(photo_bytes()))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-class-index"] == "2"
    assert r.headers["x-class"] == CLASS_NAMES[2]
    assert Image.open(io.BytesIO(r.content)).size == (FAKE_IMG_SIZE, FAKE_IMG_SIZE)


def test_explain_default_class_is_the_prediction(client):
    r = client.post("/explain", files=upload(photo_bytes()))
    assert r.headers["x-class"] == "plastic"


def test_explain_rejects_a_class_index_out_of_range(client):
    r = client.post(f"/explain?class_index={len(CLASS_NAMES)}", files=upload(photo_bytes()))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "bad_class_index"


# ---- error messages the web app will show ----------------------------------------------


def test_file_too_large_by_content_length(client):
    big = b"\xff" * (2 * 1024 * 1024)  # the test settings allow 1 MB
    r = client.post("/predict", files=upload(big))
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "file_too_large"


def test_file_too_large_without_content_length_check(client):
    # just above 1 MB: passes the header check (which allows multipart overhead) but not read_upload
    data = b"\xff" * (1024 * 1024 + 10)
    r = client.post("/predict", files=upload(data))
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "file_too_large"


def test_not_an_image(client):
    r = client.post("/predict", files=upload(b"%PDF-1.7 not a photo", "doc.pdf", "application/pdf"))
    assert r.status_code == 415
    assert r.json()["detail"]["code"] == "unsupported_format"


def test_fake_content_type_does_not_matter(client):
    # a real JPEG sent with a wrong Content-Type still works: we check the decoded image, not the label
    r = client.post("/predict", files=upload(photo_bytes(), "photo.txt", "text/plain"))
    assert r.status_code == 200


def test_damaged_image(client):
    data = photo_bytes((400, 300))
    r = client.post("/predict", files=upload(data[: len(data) // 2]))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "corrupt_image"


def test_too_many_pixels(client):
    buf = io.BytesIO()
    Image.new("RGB", (2500, 2000), (90, 90, 90)).save(buf, format="PNG")  # 5 MP > 4 MP test limit, but a tiny file
    r = client.post("/predict", files=upload(buf.getvalue(), "big.png", "image/png"))
    assert r.status_code == 413
    assert r.json()["detail"]["code"] == "image_too_large"


def test_missing_file(client):
    assert client.post("/predict").status_code == 422


def test_timeout_returns_504_quickly(client, monkeypatch):
    app = client.app
    clf = app.state.classifier
    monkeypatch.setattr(app.state, "settings", dataclasses.replace(app.state.settings, inference_timeout_s=0.2))
    monkeypatch.setattr(clf, "classify", lambda *a, **k: time.sleep(1.5))

    t0 = time.perf_counter()
    r = client.post("/predict", files=upload(photo_bytes()))
    assert r.status_code == 504
    assert r.json()["detail"]["code"] == "timeout"
    assert time.perf_counter() - t0 < 1.2  # the client did not wait for the slow job
