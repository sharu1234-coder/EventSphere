
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


BASE_URL = "http://127.0.0.1:8001"

EVENT_ID = os.environ.get("TEST_EVENT_ID")
SEAT_ID = os.environ.get("TEST_SEAT_ID")

TEST_PASSWORD = "TestPassword123!"

CUSTOMERS = [
    "testcustomer1@example.com",
    "testcustomer2@example.com",
]


@pytest.mark.integration
def test_two_customers_cannot_hold_same_seat():
    database_url = os.environ["DATABASE_URL"]

    if make_url(database_url).database != "eventsphere_test_db":
        raise RuntimeError("Refusing to use a non-test database")

    assert EVENT_ID, "Set TEST_EVENT_ID"
    assert SEAT_ID, "Set TEST_SEAT_ID"

    engine = create_engine(database_url)

    # Verify that the seat is initially available.
    with engine.connect() as connection:
        row = connection.execute(
            text("""
                SELECT es.status
                FROM event_seats es
                WHERE es.event_id = :event_id
                  AND es.seat_id = :seat_id
            """),
            {
                "event_id": EVENT_ID,
                "seat_id": SEAT_ID,
            },
        ).first()

        assert row is not None, "Test event seat not found"
        assert row.status == "available", (
            "Use a fresh available test seat"
        )

        active_count = connection.execute(
            text("""
                SELECT COUNT(*)
                FROM seat_holds sh
                JOIN event_seats es
                  ON es.id = sh.event_seat_id
                WHERE es.event_id = :event_id
                  AND es.seat_id = :seat_id
                  AND sh.status = 'active'
                  AND sh.expires_at > NOW()
            """),
            {
                "event_id": EVENT_ID,
                "seat_id": SEAT_ID,
            },
        ).scalar_one()

        assert active_count == 0, (
            "Test seat already has an active hold"
        )

    try:
        barrier = Barrier(2)

        def attempt_hold(email):
            with httpx.Client(
                base_url=BASE_URL,
                timeout=20.0,
            ) as client:

                login_response = client.post(
                    "/api/v1/auth/login",
                    json={
                        "email": email,
                        "password": TEST_PASSWORD,
                    },
                )

                assert login_response.status_code == 200, (
                    f"{email}: {login_response.text}"
                )

                me_response = client.get("/api/v1/auth/me")

                assert me_response.status_code == 200
                assert me_response.json()["email"] == email

                # Both requests wait here before competing.
                barrier.wait(timeout=15)

                return client.post(
                    f"/api/v1/events/{EVENT_ID}/holds",
                    json={"seat_id": SEAT_ID},
                )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(attempt_hold, CUSTOMERS))

        status_codes = sorted(
            response.status_code for response in responses
        )

        print("\nHTTP statuses:", status_codes)

        for response in responses:
            print(response.status_code, response.text)

        assert status_codes == [201, 409]

        # Verify the database, not just the HTTP responses.
        with engine.connect() as connection:
            active_count = connection.execute(
                text("""
                    SELECT COUNT(*)
                    FROM seat_holds sh
                    JOIN event_seats es
                      ON es.id = sh.event_seat_id
                    WHERE es.event_id = :event_id
                      AND es.seat_id = :seat_id
                      AND sh.status = 'active'
                      AND sh.expires_at > NOW()
                """),
                {
                    "event_id": EVENT_ID,
                    "seat_id": SEAT_ID,
                },
            ).scalar_one()

            assert active_count == 1

    finally:
        # Clean up the successful hold created by this test.
        # Never modify a booked seat or another test's reservation.
        with engine.begin() as connection:
            seat = connection.execute(
                text("""
                    SELECT es.id, es.status
                    FROM event_seats es
                    WHERE es.event_id = :event_id
                      AND es.seat_id = :seat_id
                    FOR UPDATE
                """),
                {"event_id": EVENT_ID, "seat_id": SEAT_ID},
            ).first()

            if seat is not None and seat.status == "held":
                active_holds = connection.execute(
                    text("""
                        SELECT sh.id
                        FROM seat_holds sh
                        WHERE sh.event_seat_id = :event_seat_id
                          AND sh.status = 'active'
                        FOR UPDATE
                    """),
                    {"event_seat_id": seat.id},
                ).all()

                if len(active_holds) == 1:
                    connection.execute(
                        text("""
                            UPDATE seat_holds
                            SET status = 'expired'
                            WHERE id = :hold_id
                              AND status = 'active'
                        """),
                        {"hold_id": active_holds[0].id},
                    )

                    connection.execute(
                        text("""
                            UPDATE event_seats
                            SET status = 'available'
                            WHERE id = :event_seat_id
                              AND status = 'held'
                              AND NOT EXISTS (
                                  SELECT 1 FROM booking_items
                                  WHERE event_seat_id = :event_seat_id
                              )
                              AND NOT EXISTS (
                                  SELECT 1 FROM seat_holds
                                  WHERE event_seat_id = :event_seat_id
                                    AND status = 'active'
                              )
                        """),
                        {"event_seat_id": seat.id},
                    )



        engine.dispose()
