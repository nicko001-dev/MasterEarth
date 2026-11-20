"""Shared test configuration.

The weather refresh loop is a background worker started by the FastAPI
lifespan. Tests exercise the weather service directly and must not open a
PostgreSQL connection from a background thread, otherwise a missing test
database can keep pytest alive after the last test has finished.
"""

import os

os.environ["WEATHER_ENABLED"] = "false"
