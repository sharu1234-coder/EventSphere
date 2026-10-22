from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from razorpay.errors import SignatureVerificationError

from app.api.payments import verify_payment
from app.schemas.payments import PaymentVerifyRequest


def test_invalid_payment_signature_is_rejected():
    user_id = uuid4()
    booking_id = uuid4()
    hold_id = uuid4()

    db = MagicMock()
    db.execute.return_value.first.side_effect = [
        SimpleNamespace(booking_id=booking_id),
        SimpleNamespace(hold_id=hold_id, user_id=user_id),
    ]

    client = MagicMock()
    client.utility.verify_payment_signature.side_effect = (
        SignatureVerificationError("Invalid signature")
    )

    payload = PaymentVerifyRequest(
        razorpay_order_id="order_test_123",
        razorpay_payment_id="pay_test_123",
        razorpay_signature="invalid_signature",
    )

    with patch(
        "app.api.payments.get_razorpay_client",
        return_value=client,
    ):
        with pytest.raises(HTTPException) as exc:
            verify_payment(
                payload=payload,
                db=db,
                current_user=SimpleNamespace(id=user_id),
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Invalid payment signature"

    client.payment.fetch.assert_not_called()
    db.commit.assert_not_called()

def test_other_user_cannot_verify_payment():
    user_id = uuid4()
    booking_id = uuid4()
    owner_id = uuid4()

    db = MagicMock()
    db.execute.return_value.first.side_effect = [
        SimpleNamespace(booking_id=booking_id),
        SimpleNamespace(hold_id=uuid4(), user_id=owner_id),
    ]

    payload = PaymentVerifyRequest(
        razorpay_order_id="order_test_456",
        razorpay_payment_id="pay_test_456",
        razorpay_signature="test_signature",
    )

    with patch("app.api.payments.get_razorpay_client") as gateway:
        with pytest.raises(HTTPException) as exc:
            verify_payment(
                payload=payload,
                db=db,
                current_user=SimpleNamespace(id=user_id),
            )

        gateway.assert_not_called()

    assert exc.value.status_code == 404
    db.commit.assert_not_called()

def test_uncaptured_payment_is_rejected():
    from decimal import Decimal

    user_id = uuid4()
    booking_id = uuid4()
    hold_id = uuid4()
    seat_id = uuid4()

    db = MagicMock()
    db.execute.return_value.first.side_effect = [
        SimpleNamespace(booking_id=booking_id),
        SimpleNamespace(hold_id=hold_id, user_id=user_id),
    ]

    db.scalar.side_effect = [
        seat_id,
        SimpleNamespace(id=seat_id),
        SimpleNamespace(id=hold_id),
        SimpleNamespace(id=booking_id, user_id=user_id, hold_id=hold_id),
        SimpleNamespace(
            booking_id=booking_id,
            razorpay_order_id="order_test_789",
            amount=Decimal("500.00"),
            currency="INR",
        ),
    ]

    client = MagicMock()
    client.payment.fetch.return_value = {
        "id": "pay_test_789",
        "order_id": "order_test_789",
        "amount": 50000,
        "currency": "INR",
        "status": "authorized",
    }

    payload = PaymentVerifyRequest(
        razorpay_order_id="order_test_789",
        razorpay_payment_id="pay_test_789",
        razorpay_signature="test_signature",
    )

    with patch(
        "app.api.payments.get_razorpay_client",
        return_value=client,
    ):
        with pytest.raises(HTTPException) as exc:
            verify_payment(
                payload=payload,
                db=db,
                current_user=SimpleNamespace(id=user_id),
            )

    assert exc.value.status_code == 409
    client.utility.verify_payment_signature.assert_called_once()
    db.commit.assert_not_called()

def test_incorrect_payment_amount_is_rejected():
    from decimal import Decimal

    user_id = uuid4()
    booking_id = uuid4()
    hold_id = uuid4()
    seat_id = uuid4()

    db = MagicMock()
    db.execute.return_value.first.side_effect = [
        SimpleNamespace(booking_id=booking_id),
        SimpleNamespace(hold_id=hold_id, user_id=user_id),
    ]

    db.scalar.side_effect = [
        seat_id,
        SimpleNamespace(id=seat_id),
        SimpleNamespace(id=hold_id),
        SimpleNamespace(id=booking_id, user_id=user_id, hold_id=hold_id),
        SimpleNamespace(
            booking_id=booking_id,
            razorpay_order_id="order_amount_test",
            amount=Decimal("500.00"),
            currency="INR",
        ),
    ]

    client = MagicMock()
    client.payment.fetch.return_value = {
        "id": "pay_amount_test",
        "order_id": "order_amount_test",
        "amount": 10000,
        "currency": "INR",
        "status": "captured",
    }

    payload = PaymentVerifyRequest(
        razorpay_order_id="order_amount_test",
        razorpay_payment_id="pay_amount_test",
        razorpay_signature="test_signature",
    )

    with patch(
        "app.api.payments.get_razorpay_client",
        return_value=client,
    ):
        with pytest.raises(HTTPException) as exc:
            verify_payment(
                payload=payload,
                db=db,
                current_user=SimpleNamespace(id=user_id),
            )

    assert exc.value.status_code == 409
    assert "details do not match" in exc.value.detail
    db.commit.assert_not_called()

def test_duplicate_payment_verification_is_idempotent():
    from decimal import Decimal

    user_id = uuid4()
    booking_id = uuid4()
    hold_id = uuid4()
    seat_id = uuid4()

    db = MagicMock()
    db.execute.return_value.first.side_effect = [
        SimpleNamespace(booking_id=booking_id),
        SimpleNamespace(hold_id=hold_id, user_id=user_id),
    ]

    db.scalar.side_effect = [
        seat_id,
        SimpleNamespace(id=seat_id),
        SimpleNamespace(id=hold_id),
        SimpleNamespace(
            id=booking_id,
            user_id=user_id,
            hold_id=hold_id,
            status="confirmed",
        ),
        SimpleNamespace(
            booking_id=booking_id,
            razorpay_order_id="order_duplicate_test",
            razorpay_payment_id="pay_duplicate_test",
            amount=Decimal("500.00"),
            currency="INR",
            status="verified",
        ),
    ]

    client = MagicMock()
    client.payment.fetch.return_value = {
        "id": "pay_duplicate_test",
        "order_id": "order_duplicate_test",
        "amount": 50000,
        "currency": "INR",
        "status": "captured",
    }

    payload = PaymentVerifyRequest(
        razorpay_order_id="order_duplicate_test",
        razorpay_payment_id="pay_duplicate_test",
        razorpay_signature="test_signature",
    )

    with patch(
        "app.api.payments.get_razorpay_client",
        return_value=client,
    ):
        result = verify_payment(
            payload=payload,
            db=db,
            current_user=SimpleNamespace(id=user_id),
        )

    assert result.booking_status == "confirmed"
    assert result.payment_status == "verified"
    assert result.message == "Booking already confirmed"

    db.add.assert_not_called()
    db.commit.assert_not_called()
