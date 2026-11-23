# ML service image: Python 3.12 (same as Colab) + TensorFlow for CPU.
# Build context is the ml-service/ folder:  docker build -t trash2cash-ml ml-service
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    MODEL_DIR=/app/models

WORKDIR /app

# Dependencies first: Docker caches this layer until requirements.txt changes,
# so editing the code does not reinstall TensorFlow.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY models ./models

# Do not run as root inside the container
RUN useradd --create-home appuser
USER appuser

EXPOSE 8001
# start-period: loading TensorFlow and the model takes a while
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
