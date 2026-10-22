

import os
from pathlib import Path

from dotenv import dotenv_values


BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_ENV = BACKEND_DIR / ".env.test"

if not TEST_ENV.is_file():
    raise RuntimeError("Missing backend/.env.test")

test_database_url = dotenv_values(TEST_ENV).get("DATABASE_URL")

if not test_database_url:
    raise RuntimeError("DATABASE_URL missing from .env.test")

# Fail closed: never run tests against the development database.
from sqlalchemy.engine import make_url

parsed_url = make_url(test_database_url)

if (
    parsed_url.get_backend_name() != "postgresql"
    or parsed_url.database != "eventsphere_test_db"
):
    raise RuntimeError(
        "Tests must use the PostgreSQL eventsphere_test_db database"
    )

# Set this before importing application modules.
os.environ["DATABASE_URL"] = test_database_url
