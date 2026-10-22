

from uuid import UUID

from pydantic import BaseModel


class PaymentOrderCreate(BaseModel):
    booking_id: UUID


class PaymentOrderResponse(BaseModel):
    razorpay_order_id: str
    amount: int
    currency: str
    key_id: str

class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentVerifyResponse(BaseModel):
    booking_id: UUID
    booking_status: str
    payment_status: str
    message: str
