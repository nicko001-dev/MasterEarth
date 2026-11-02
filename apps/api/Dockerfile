FROM python:3.12-slim
WORKDIR /srv
COPY apps/api/pyproject.toml apps/api/
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic-settings "sqlalchemy>=2" alembic geoalchemy2 "psycopg[binary]" shapely PyJWT numpy scipy Pillow paho-mqtt
COPY apps/api apps/api
COPY database database
COPY alembic.ini .
ENV PYTHONPATH=/srv/apps/api POSTGRES_HOST=postgres API_HOST=0.0.0.0
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
