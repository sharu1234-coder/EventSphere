
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Ticket,
} from "lucide-react";

import {
  createBooking,
  getBooking,
  type Booking,
} from "../services/bookings";

import {
  createPaymentOrder,
  loadRazorpay,
  verifyPayment,
  type RazorpaySuccess,
} from "../services/payments";

interface CheckoutSeat {
  seatId: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: number;
  price: string;
}

interface CheckoutState {
  holdIds: string[];
  eventId: string;
  seats: CheckoutSeat[];
  totalPrice: number;
  expiresAt: string;
}

function isCheckoutState(
  value: unknown
): value is CheckoutState {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;

  return (
    Array.isArray(data.holdIds) &&
    data.holdIds.length >= 1 &&
    data.holdIds.length <= 6 &&
    data.holdIds.every((id) => typeof id === "string") &&
    typeof data.eventId === "string" &&
    Array.isArray(data.seats) &&
    data.seats.length === data.holdIds.length &&
    data.seats.every(
      (seat) =>
        seat !== null &&
        typeof seat === "object" &&
        typeof seat.seatId === "string" &&
        typeof seat.sectionName === "string" &&
        typeof seat.rowLabel === "string" &&
        typeof seat.seatNumber === "number" &&
        typeof seat.price === "string"
    ) &&
    typeof data.totalPrice === "number" &&
    Number.isFinite(data.totalPrice) &&
    typeof data.expiresAt === "string"
  );
}

function formatPrice(amount: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(amount));
}

export default function Checkout() {
  const location = useLocation();

  const checkout = isCheckoutState(location.state)
    ? location.state
    : null;

  const [booking, setBooking] =
    useState<Booking | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    null
  );

  const [paymentStatus, setPaymentStatus] = useState<
    string | null
  >(null);

  const [pendingVerification, setPendingVerification] =
    useState<RazorpaySuccess | null>(null);

  const processingRef = useRef(false);

  useEffect(() => {
    if (!checkout) return;

    function updateTimer() {
      const remaining = Math.max(
        0,
        Math.ceil(
          (
            new Date(checkout!.expiresAt).getTime() -
            Date.now()
          ) / 1000
        )
      );

      setSecondsLeft(remaining);
    }

    updateTimer();

    const timer = window.setInterval(
      updateTimer,
      1000
    );

    return () => window.clearInterval(timer);
  }, [checkout]);

  const expired =
    !checkout ||
    new Date(checkout.expiresAt).getTime() <=
      Date.now();

  const confirmed =
    booking?.status === "confirmed";

  const canPay =
    booking?.status === "pending" &&
    !expired &&
    !loading &&
    !verifying &&
    !pendingVerification &&
    paymentStatus !== "refund_required";

  async function handleCreateBooking() {
    if (
      !checkout ||
      loading ||
      booking ||
      expired
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await createBooking(
        checkout.holdIds
      );

      setBooking(result);

      if (result.status !== "pending") {
        setError(
          `Booking status: ${result.status}. Payment cannot be started.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create booking."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerification(
    response: RazorpaySuccess
  ) {
    if (processingRef.current) return;

    processingRef.current = true;
    setVerifying(true);
    setError(null);
    setPendingVerification(response);

    try {
      const result = await verifyPayment(response);

      setPaymentStatus(result.payment_status);
      setMessage(result.message);
      setPendingVerification(null);

      if (
        result.booking_status === "confirmed" &&
        result.payment_status === "verified"
      ) {
        const updatedBooking = await getBooking(
          result.booking_id
        );

        setBooking(updatedBooking);
      } else {
        setError(
          result.payment_status === "refund_required"
            ? "Payment was captured, but your reservation could not be confirmed. Contact support for refund or reconciliation."
            : "Payment was not confirmed. Please check your booking status."
        );
      }
    } catch (err) {
      setError(
        (err instanceof Error
          ? err.message
          : "Payment verification failed.") +
          " If money was deducted, do not pay again. Retry verification or contact support."
      );
    } finally {
      processingRef.current = false;
      setVerifying(false);
    }
  }

  async function handlePayment() {
    if (!booking || !canPay || processingRef.current) {
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await loadRazorpay();

      const order = await createPaymentOrder(
        booking.booking_id
      );

      if (!window.Razorpay) {
        throw new Error(
          "Razorpay Checkout is unavailable."
        );
      }

      if (
        !order.key_id ||
        !order.razorpay_order_id ||
        order.amount <= 0 ||
        order.currency !== "INR"
      ) {
        throw new Error(
          "Invalid payment order returned by the server."
        );
      }

      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "EventSphere",
        description: "Event ticket booking",
        order_id: order.razorpay_order_id,
        theme: {
          color: "#7c3aed",
        },
        handler: (response) => {
          void handleVerification(response);
        },
        modal: {
          ondismiss: () => {
            setMessage(
              "Payment window closed. Your booking remains pending until payment is verified."
            );
          },
        },
      });

      razorpay.on(
        "payment.failed",
        () => {
          setError(
            "Payment failed or was cancelled. No ticket has been confirmed."
          );
        }
      );

      razorpay.open();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start payment."
      );
    } finally {
      processingRef.current = false;
      setLoading(false);
    }
  }

  const minutes = String(
    Math.floor(secondsLeft / 60)
  ).padStart(2, "0");

  const seconds = String(
    secondsLeft % 60
  ).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#080A12] text-white">
      <header className="border-b border-white/10 bg-[#0D101B]">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5">
          <Link
            to="/"
            className="flex items-center gap-3"
          >
            <div className="rounded-xl bg-violet-600 p-3">
              <Ticket size={20} />
            </div>

            <span className="text-xl font-extrabold">
              Event
              <span className="text-violet-400">
                Sphere
              </span>
            </span>
          </Link>

          <span className="text-sm text-slate-400">
            Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <Link
          to={
            checkout
              ? `/events/${checkout.eventId}/seats`
              : "/"
          }
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={17} />
          Back
        </Link>

        <div className="mt-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
            EventSphere Booking
          </p>

          <h1 className="mt-3 text-4xl font-extrabold">
            Checkout
          </h1>

          <p className="mt-3 text-slate-400">
            Review your reservation and complete payment.
          </p>
        </div>

        {!checkout ? (
          <section className="mt-10 rounded-3xl border border-white/10 bg-[#111522] p-8">
            <h2 className="text-xl font-bold">
              No active checkout
            </h2>

            <p className="mt-3 text-slate-400">
              Please reserve your seats before checkout.
            </p>

            <Link
              to="/"
              className="mt-6 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold"
            >
              Browse events
            </Link>
          </section>
        ) : (
          <div className="mt-10 space-y-6">
            <section className="rounded-3xl border border-white/10 bg-[#111522] p-7 sm:p-9">
              <div className="flex items-center gap-3">
                <Ticket
                  size={22}
                  className="text-violet-400"
                />
                <h2 className="text-xl font-bold">
                  Booking summary
                </h2>
              </div>

              <div className="mt-8 space-y-3">
                <p className="text-sm text-slate-400">
                  {checkout.seats.length} selected seat
                  {checkout.seats.length !== 1 ? "s" : ""}
                </p>

                {checkout.seats.map((seat) => (
                  <div
                    key={seat.seatId}
                    className="flex justify-between gap-4 rounded-xl bg-white/5 p-4"
                  >
                    <div>
                      <p className="font-semibold">
                        {seat.sectionName}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Row {seat.rowLabel} | Seat {seat.seatNumber}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatPrice(seat.price)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-white/10 pt-6">
                <p className="text-sm text-slate-400">
                  Total booking amount
                </p>
                <p className="mt-2 text-3xl font-extrabold">
                  {formatPrice(
                    booking
                      ? booking.total_amount
                      : String(checkout.totalPrice)
                  )}
                </p>
              </div>

              {!confirmed && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
                  <Clock3 size={19} />

                  <div>
                    <p className="font-semibold">
                      {expired
                        ? "Reservation expired"
                        : `Reservation remaining: ${minutes}:${seconds}`}
                    </p>

                    <p className="mt-1 text-xs">
                      Payment must be captured and
                      verified while the hold is valid.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                role="status"
                className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 text-violet-200"
              >
                {message}
              </div>
            )}

            {booking ? (
              <section className="rounded-3xl border border-white/10 bg-[#111522] p-7 sm:p-9">
                <div className="flex items-center gap-3">
                  {confirmed ? (
                    <CheckCircle2
                      size={24}
                      className="text-emerald-400"
                    />
                  ) : (
                    <CreditCard
                      size={24}
                      className="text-violet-400"
                    />
                  )}

                  <h2 className="text-xl font-bold">
                    {confirmed
                      ? "Booking confirmed"
                      : "Complete your payment"}
                  </h2>
                </div>

                <p className="mt-5 text-sm text-slate-400">
                  Booking ID
                </p>

                <p className="mt-2 break-all font-mono text-sm">
                  {booking.booking_id}
                </p>

                <p className="mt-5 text-sm text-slate-400">
                  Status
                </p>

                <p
                  className={`mt-2 font-bold ${
                    confirmed
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {booking.status.toUpperCase()}
                </p>

                {confirmed ? (
                  <div className="mt-7 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-200">
                    Payment verified. Your booking is
                    confirmed.
                  </div>
                ) : (
                  <>
                    {pendingVerification && (
                      <button
                        type="button"
                        disabled={verifying}
                        onClick={() =>
                          void handleVerification(
                            pendingVerification
                          )
                        }
                        className="mt-7 w-full rounded-xl border border-amber-500/40 px-5 py-4 font-bold text-amber-200 disabled:opacity-50"
                      >
                        {verifying
                          ? "Verifying payment..."
                          : "Retry payment verification"}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!canPay}
                      onClick={() =>
                        void handlePayment()
                      }
                      className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-5 py-4 font-bold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CreditCard size={20} />

                      {loading
                        ? "Opening payment gateway..."
                        : verifying
                          ? "Verifying payment..."
                          : "Pay securely with Razorpay"}
                    </button>

                    <p className="mt-4 text-center text-xs text-slate-400">
                      Use Razorpay Test Mode while developing.
                    </p>
                  </>
                )}
              </section>
            ) : (
              <button
                type="button"
                disabled={loading || expired}
                onClick={() =>
                  void handleCreateBooking()
                }
                className="w-full rounded-xl bg-violet-600 px-6 py-4 text-lg font-bold transition hover:bg-violet-500 disabled:opacity-50"
              >
                {loading
                  ? "Creating booking..."
                  : "Create booking"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
