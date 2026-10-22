

from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from pwdlib import PasswordHash

from app.models.core import User


env_path = Path(__file__).resolve().parents[1] / ".env.test"
database_url = dotenv_values(env_path)["DATABASE_URL"]

if make_url(database_url).database != "eventsphere_test_db":
    raise RuntimeError("Refusing to modify a non-test database")

engine = create_engine(database_url)
password_hash = PasswordHash.recommended()

test_customers = [
    ("testcustomer1@example.com", "Test Customer One"),
    ("testcustomer2@example.com", "Test Customer Two"),
    ("testorganizer@example.com", "Test Organizer"),
]

with Session(engine) as db:
    for email, full_name in test_customers:
        existing_user = db.scalar(
            select(User).where(User.email == email)
        )

        if existing_user:
            print(f"Already exists: {email} | ID: {existing_user.id}")
            continue

        user = User(
            email=email,
            full_name=full_name,
            password_hash=password_hash.hash("TestPassword123!"),
            role=(
    "organizer"
    if email == "testorganizer@example.com"
    else "customer"
),
        )

        db.add(user)
        db.flush()

        print(f"Created: {email} | ID: {user.id}")

    db.commit()

engine.dispose()
