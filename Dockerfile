FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MAX_LLAMADAS_SIMULTANEAS=2

WORKDIR /app

COPY requirements-hf.txt ./requirements-hf.txt
RUN pip install --upgrade pip && pip install -r requirements-hf.txt

COPY . .

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
