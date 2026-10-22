

import asyncio
import os

import httpx


BASE_URL = "http://127.0.0.1:8000"

EVENT_ID = os.environ["TEST_EVENT_ID"]
SEAT_ID = os.environ["TEST_SEAT_ID"]

# Use two separate authenticated customer sessions.
CUSTOMER_1_COOKIE = os.environ["CUSTOMER_1_COOKIE"]
CUSTOMER_2_COOKIE = os.environ["CUSTOMER_2_COOKIE"]
COOKIE_NAME = os.environ["SESSION_COOKIE_NAME"]


async def create_hold(client, customer_number):
    response = await client.post(
        f"{BASE_URL}/api/v1/events/{EVENT_ID}/holds",
        json={"seat_id": SEAT_ID},
    )

    print(
        f"Customer {customer_number}:",
        response.status_code,
        response.text,
    )

    return response


async def main():
    async with (
        httpx.AsyncClient(
            cookies={COOKIE_NAME: CUSTOMER_1_COOKIE},
            timeout=20,
        ) as client1,
        httpx.AsyncClient(
            cookies={COOKIE_NAME: CUSTOMER_2_COOKIE},
            timeout=20,
        ) as client2,
    ):
        responses = await asyncio.gather(
            create_hold(client1, 1),
            create_hold(client2, 2),
        )

    status_codes = sorted(
        response.status_code for response in responses
    )

    assert status_codes == [201, 409], (
        f"Unexpected results: {status_codes}"
    )

    print("PASS: Only one customer acquired the seat.")


if __name__ == "__main__":
    asyncio.run(main())
