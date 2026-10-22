

from getpass import getpass

from sqlalchemy import select, func

from app.database import SessionLocal
from app.models.core import User
from app.services.security import verify_password


def main():
    email = input("Existing account email: ").strip().lower()
    password = getpass("Account password: ")

    with SessionLocal() as db:
        admin_count = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin")
        )

        if admin_count != 0:
            print("Bootstrap refused: an administrator already exists.")
            return

        user = db.scalar(
            select(User)
            .where(User.email == email)
            .with_for_update()
        )

        if user is None or not verify_password(
            password, user.password_hash
        ):
            print("Invalid email or password.")
            return

        if user.role != "customer":
            print("Only a customer account can be bootstrapped.")
            return

        if input("Promote this account to admin? (yes/no): ").strip().lower() != "yes":
            print("Cancelled.")
            return

        # Recheck under a database-level bootstrap lock.
        db.execute(
            select(func.pg_advisory_xact_lock(107110))
        )

        admin_count = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin")
        )

        if admin_count != 0:
            print("An administrator already exists. Cancelled.")
            return

        user.role = "admin"
        db.commit()

        print("Administrator account created successfully.")


if __name__ == "__main__":
    main()
