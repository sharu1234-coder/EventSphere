

import logging
import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_db
from app.models.payment import Payment
from app.services.razorpay_client import get_razorpay_client
from app.models.core import Booking, BookingHold, BookingItem, Event, EventSeat, SeatHold, User

from app.schemas.payments import (
    PaymentOrderCreate,
    PaymentOrderResponse,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
)
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/payments",
    tags=["Payments"],
)



def get_booking_hold_ids(db: Session, booking: Booking):
    hold_ids = db.scalars(
        select(BookingHold.hold_id)
        .where(BookingHold.booking_id == booking.id)
        .order_by(BookingHold.hold_id)
    ).all()

    if not hold_ids and booking.hold_id is not None:
        hold_ids = [booking.hold_id]

    return hold_ids


def lock_booking_reservation(db: Session, booking_id):
    booking_info = db.scalar(
        select(Booking).where(Booking.id == booking_id)
    )

    if booking_info is None:
        raise HTTPException(404, "Booking not found")

    hold_ids = get_booking_hold_ids(db, booking_info)

    if not hold_ids or len(hold_ids) > 6:
        raise HTTPException(409, "Invalid booking holds")

    seat_ids = db.scalars(
        select(SeatHold.event_seat_id)
        .where(SeatHold.id.in_(hold_ids))
    ).all()

    if len(seat_ids) != len(hold_ids):
        raise HTTPException(409, "Missing reservation seats")

    seats = db.scalars(
        select(EventSeat)
        .where(EventSeat.id.in_(seat_ids))
        .order_by(EventSeat.id)
        .with_for_update()
    ).all()

    holds = db.scalars(
        select(SeatHold)
        .where(SeatHold.id.in_(hold_ids))
        .order_by(SeatHold.id)
        .with_for_update()
    ).all()

    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .with_for_update()
    )

    if (
        booking is None
        or len(seats) != len(hold_ids)
        or len(holds) != len(hold_ids)
        or len({seat.id for seat in seats}) != len(hold_ids)
        or len({hold.event_seat_id for hold in holds}) != len(hold_ids)
        or {seat.id for seat in seats}
            != {hold.event_seat_id for hold in holds}
        or any(seat.event_id != booking.event_id for seat in seats)
    ):
        raise HTTPException(409, "Booking reservation mismatch")

    return booking, holds, seats


def reservation_is_valid(booking, holds, seats, user_id, now):
    return (
        booking.status == "pending"
        and all(
            hold.user_id == user_id
            and hold.status == "active"
            and hold.expires_at > now
            for hold in holds
        )
        and all(seat.status == "held" for seat in seats)
    )


def booking_amount_matches(booking, seats):
    return (
        booking.total_amount > 0
        and booking.total_amount
            == sum((seat.price for seat in seats), Decimal("0"))
    )


@router.post("/orders", response_model=PaymentOrderResponse)
def create_payment_order(
    payload: PaymentOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking, holds, seats = lock_booking_reservation(
        db, payload.booking_id
    )

    if booking.user_id != current_user.id:
        raise HTTPException(404, "Booking not found")

    now = datetime.now(timezone.utc)

    if not reservation_is_valid(
        booking, holds, seats, current_user.id, now
    ):
        raise HTTPException(409, "Seat reservation has expired or changed")

    event = db.get(Event, booking.event_id)

    if (
        event is None
        or event.status != "published"
        or event.starts_at <= now
    ):
        raise HTTPException(409, "Event is unavailable")

    if not booking_amount_matches(booking, seats):
        raise HTTPException(409, "Booking amount is invalid")

    key_id = os.getenv("RAZORPAY_KEY_ID")
    if not key_id:
        raise HTTPException(503, "Payment gateway is not configured")

    amount_paise = int(
        (Decimal(str(booking.total_amount)) * 100).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )

    # Reuse an existing order for this booking.
    existing_payment = db.scalar(
        select(Payment)
        .where(Payment.booking_id == booking.id)
        .where(Payment.status == "created")
        .order_by(Payment.created_at.desc())
        .limit(1)
    )

    if existing_payment is not None:
        return PaymentOrderResponse(
            razorpay_order_id=existing_payment.razorpay_order_id,
            amount=amount_paise,
            currency=existing_payment.currency,
            key_id=key_id,
        )

    try:
        client = get_razorpay_client()

        order = client.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": str(booking.id),
                "notes": {
                    "booking_id": str(booking.id),
                },
            }
        )
    except Exception:
        logger.exception("Razorpay order creation failed")
        raise HTTPException(
            status_code=502,
            detail="Unable to create payment order",
        )

    if (
        not order.get("id")
        or order.get("amount") != amount_paise
        or order.get("currency") != "INR"
    ):
        raise HTTPException(502, "Invalid payment gateway response")

    payment = Payment(
        booking_id=booking.id,
        razorpay_order_id=order["id"],
        amount=booking.total_amount,
        currency="INR",
        status="created",
    )

    db.add(payment)
    db.commit()

    return PaymentOrderResponse(
        razorpay_order_id=payment.razorpay_order_id,
        amount=amount_paise,
        currency="INR",
        key_id=key_id,
    )

@router.post(
    "/verify",
    response_model=PaymentVerifyResponse,
)
def verify_payment(
    payload: PaymentVerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Look up the payment order and verify ownership.
    payment_info = db.execute(
        select(Payment.booking_id)
        .where(
            Payment.razorpay_order_id == payload.razorpay_order_id
        )
    ).first()

    if payment_info is None:
        raise HTTPException(404, "Payment order not found")

    booking_info = db.execute(
        select(Booking.hold_id, Booking.user_id)
        .where(Booking.id == payment_info.booking_id)
    ).first()

    if (
        booking_info is None
        or booking_info.user_id != current_user.id
    ):
        raise HTTPException(404, "Payment order not found")

    if booking_info.hold_id is None:
        raise HTTPException(409, "Booking has no seat hold")

    # Verify Razorpay signature and independently fetch
    # the actual payment state from the gateway.
    try:
        client = get_razorpay_client()

        client.utility.verify_payment_signature({
            "razorpay_order_id": payload.razorpay_order_id,
            "razorpay_payment_id": payload.razorpay_payment_id,
            "razorpay_signature": payload.razorpay_signature,
        })
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(400, "Invalid payment signature")
    except Exception:
        logger.exception("Payment signature verification failed")
        raise HTTPException(502, "Payment verification unavailable")

    try:
        gateway_payment = client.payment.fetch(
            payload.razorpay_payment_id
        )
    except Exception:
        logger.exception("Unable to fetch Razorpay payment")
        raise HTTPException(502, "Unable to verify payment status")

    booking, holds, seats = lock_booking_reservation(
        db, payment_info.booking_id
    )

    payment = db.scalar(
        select(Payment)
        .where(
            Payment.razorpay_order_id == payload.razorpay_order_id
        )
        .with_for_update()
    )

    if (
        payment is None
        or booking.user_id != current_user.id
        or payment.booking_id != booking.id
    ):
        raise HTTPException(409, "Payment reservation mismatch")

    expected_amount = int(
        (Decimal(str(payment.amount)) * 100).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )

    if (
        gateway_payment.get("id") != payload.razorpay_payment_id
        or gateway_payment.get("order_id")
            != payment.razorpay_order_id
        or gateway_payment.get("amount") != expected_amount
        or gateway_payment.get("currency") != payment.currency
        or gateway_payment.get("status") != "captured"
    ):
        raise HTTPException(
            409,
            "Payment is not captured or details do not match",
        )

    # Idempotency: a verified payment must not create
    # another booking item.
    if payment.status == "verified":
        if (
            booking.status != "confirmed"
            or payment.razorpay_payment_id
                != payload.razorpay_payment_id
        ):
            raise HTTPException(
                409,
                "Previously verified payment state mismatch",
            )

        return PaymentVerifyResponse(
            booking_id=booking.id,
            booking_status=booking.status,
            payment_status=payment.status,
            message="Booking already confirmed",
        )

    if payment.status == "refund_required":
        if (
            payment.razorpay_payment_id
            != payload.razorpay_payment_id
        ):
            raise HTTPException(
                409,
                "Payment reconciliation mismatch",
            )

        return PaymentVerifyResponse(
            booking_id=booking.id,
            booking_status=booking.status,
            payment_status=payment.status,
            message="Payment requires refund or reconciliation",
        )

    if payment.status != "created":
        raise HTTPException(409, "Payment is not eligible")

    now = datetime.now(timezone.utc)

    # Verify the total price of all selected seats.
    if (
        payment.amount != booking.total_amount
        or not booking_amount_matches(booking, seats)
        or payment.currency != "INR"
    ):
        raise HTTPException(409, "Booking amount mismatch")

    event = db.get(Event, booking.event_id)

    valid_reservation = (
        reservation_is_valid(
            booking, holds, seats, current_user.id, now
        )
        and event is not None
        and event.status == "published"
        and event.starts_at > now
    )

    existing_items = db.scalars(
        select(BookingItem.event_seat_id)
        .where(
            BookingItem.event_seat_id.in_(
                [seat.id for seat in seats]
            )
        )
    ).all()

    if existing_items:
        valid_reservation = False

    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.verified_at = now

    if not valid_reservation:
        # Record the captured payment, but do not allocate
        # an expired or otherwise unavailable seat.
        payment.status = "refund_required"
        db.commit()

        return PaymentVerifyResponse(
            booking_id=booking.id,
            booking_status=booking.status,
            payment_status="refund_required",
            message=(
                "Payment captured, but reservation is no longer "
                "valid. Refund or manual reconciliation required."
            ),
        )

    # Confirm all selected seats atomically.
    for seat in seats:
        db.add(
            BookingItem(
                booking_id=booking.id,
                event_seat_id=seat.id,
                price=seat.price,
            )
        )
        seat.status = "booked"

    for hold in holds:
        hold.status = "converted"

    booking.status = "confirmed"
    payment.status = "verified"

    db.commit()

    return PaymentVerifyResponse(
        booking_id=booking.id,
        booking_status="confirmed",
        payment_status="verified",
        message="Payment verified and booking confirmed",
    )
