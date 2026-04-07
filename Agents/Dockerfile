# Use an official Python runtime as a parent image
FROM python:3.10-slim

WORKDIR /app

# Install build deps for scientific Python packages, then clean up.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# Default to uvicorn so the image works without docker-compose overrides.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]
