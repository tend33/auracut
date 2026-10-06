FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --only-binary=:all: numpy==2.3.5
WORKDIR /app
COPY server.py studio.py accounts.py ./
COPY static/ ./static/
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin auracut && mkdir -p data && chown auracut:auracut data
ENV AURACUT_HOST=0.0.0.0
ENV PYTHONDONTWRITEBYTECODE=1
ENV OPENBLAS_NUM_THREADS=1
USER auracut
EXPOSE 8000
CMD ["python", "server.py"]
