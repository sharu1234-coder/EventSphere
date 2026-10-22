

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Ticket,
} from "lucide-react";

import {
  cancelSeatHold,
  createSeatHold,
  getSeatAvailability,
  type EventSeat,
  type SeatHold,
} from "../services/seats";

import { getCurrentUser } from "../services/auth";

const formatPrice = (price: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(price));

function SeatSelection() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const [seats, setSeats] = useState<EventSeat[]>([]);
  const [selectedSeatIds, setSelectedSeatIds] =
    useState<string[]>([]);

  const [hold, setHold] = useState<SeatHold | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Load live seat availability from FastAPI.
  const loadSeats = useCallback(
    async (signal?: AbortSignal) => {
      if (!eventId) {
        setError("Invalid event ID.");
        setLoading(false);
        return;
      }

      try {
        const data = await getSeatAvailability(
          eventId,
          signal
        );

        if (signal?.aborted) return;

        setSeats(data);
      } catch (err) {
        if (signal?.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load seats."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [eventId]
  );

  // Load seats on page opening.
  useEffect(() => {
    const controller = new AbortController();

    void loadSeats(controller.signal);

    return () => controller.abort();
  }, [loadSeats]);

  // Update reservation countdown.
  useEffect(() => {
    if (!hold) {
      setSecondsLeft(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil(
          (new Date(hold.expires_at).getTime() -
            Date.now()) /
            1000
        )
      );

      setSecondsLeft(remaining);
    };

    updateCountdown();

    const interval = window.setInterval(
      updateCountdown,
      1000
    );

    return () => window.clearInterval(interval);
  }, [hold]);

  // Handle expired reservations.
  useEffect(() => {
    if (!hold || secondsLeft !== 0) return;

    if (
      new Date(hold.expires_at).getTime() <= Date.now()
    ) {
      setHold(null);
      setSelectedSeatIds([]);

      setMessage(
        "Your reservation expired. Please select another seat."
      );

      void loadSeats();
    }
  }, [hold, secondsLeft, loadSeats]);

  // Group seats by section and row.
  const sections = useMemo(() => {
    const grouped = new Map<
      string,
      {
        name: string;
        rows: Map<string, EventSeat[]>;
      }
    >();

    for (const seat of seats) {
      if (!grouped.has(seat.section_id)) {
        grouped.set(seat.section_id, {
          name: seat.section_name,
          rows: new Map(),
        });
      }

      const section = grouped.get(seat.section_id)!;

      if (!section.rows.has(seat.row_label)) {
        section.rows.set(seat.row_label, []);
      }

      section.rows.get(seat.row_label)!.push(seat);
    }

    return Array.from(
      grouped,
      ([id, section]) => ({
        id,
        name: section.name,
        rows: Array.from(
          section.rows,
          ([label, rowSeats]) => ({
            label,
            seats: rowSeats.sort(
              (a, b) =>
                a.seat_number - b.seat_number
            ),
          })
        ),
      })
    );
  }, [seats]);

  const selectedSeats = seats.filter(
    (seat) => selectedSeatIds.includes(seat.seat_id)
  );

  const totalPrice = selectedSeats.reduce(
    (total, seat) => total + Number(seat.price),
    0
  );

  function toggleSeat(seatId: string) {
    if (hold || busy) return;

    setSelectedSeatIds((current) => {
      if (current.includes(seatId)) {
        return current.filter((id) => id !== seatId);
      }

      if (current.length >= 6) {
        setError("You can select a maximum of 6 seats.");
        return current;
      }

      return [...current, seatId];
    });

    setError(null);
  }

  const availableCount = seats.filter(
    (seat) => seat.status === "available"
  ).length;

  const reservationActive =
    hold !== null &&
    new Date(hold.expires_at).getTime() > Date.now();

  // Reserve selected seat.
  async function reserveSeat() {
    if (
      !eventId ||
      selectedSeats.length === 0 ||
      busy ||
      hold ||
      selectedSeats.some((seat) => seat.status !== "available")
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const user = await getCurrentUser();

      if (!user) {
        const returnPath = `/events/${eventId}/seats`;

        navigate(
          `/login?returnTo=${encodeURIComponent(
            returnPath
          )}`
        );

        return;
      }

      const newHold = await createSeatHold(
        eventId,
        selectedSeatIds
      );

      setHold(newHold);

      setMessage(
        "Your seats are reserved for 10 minutes."
      );

      await loadSeats();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reserve seat."
      );

      await loadSeats();
    } finally {
      setBusy(false);
    }
  }

  // Release all holds in the reservation.
  async function releaseSeat() {
    if (!hold || busy) return;

    setBusy(true);
    setError(null);

    try {
      const results = await Promise.allSettled(
        hold.hold_ids.map((id) => cancelSeatHold(id))
      );

      const failed = results.filter(
        (result) => result.status === "rejected"
      );

      if (failed.length > 0) {
        throw new Error(
          "Some seats could not be released. Please refresh."
        );
      }

      setHold(null);
      setSelectedSeatIds([]);
      setMessage("Seat reservation cancelled successfully.");
      await loadSeats();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not cancel reservation."
      );
      await loadSeats();
    } finally {
      setBusy(false);
    }
  }

  function continueToCheckout() {
    if (
      !eventId ||
      selectedSeats.length === 0 ||
      !hold ||
      !reservationActive ||
      busy
    ) {
      return;
    }

    navigate("/checkout", {
      state: {
        holdIds: hold.hold_ids,
        eventId,
        seats: selectedSeats.map((seat) => ({
          seatId: seat.seat_id,
          sectionName: seat.section_name,
          rowLabel: seat.row_label,
          seatNumber: seat.seat_number,
          price: seat.price,
        })),
        totalPrice,
        expiresAt: hold.expires_at,
      },
    });
  }

  const minutes = String(
    Math.floor(secondsLeft / 60)
  ).padStart(2, "0");

  const seconds = String(
    secondsLeft % 60
  ).padStart(2, "0");

  return (
    <div className="min-h-screen bg-[#080A12] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0D101B]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
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

          <Link
            to={eventId ? `/events/${eventId}` : "/"}
            className="flex items-center gap-2 text-sm text-slate-300 transition hover:text-white"
          >
            <ArrowLeft size={17} />
            Event details
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        {/* Title */}
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">
            Your experience starts here
          </p>

          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Choose your seat
          </h1>

          <p className="mt-4 text-slate-400">
            Explore live seat availability and
            reserve your favourite seat.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200"
          >
            {error}
          </div>
        )}

        {/* Success message */}
        {message && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 text-violet-200"
          >
            {message}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Seating layout */}
          <section className="min-w-0 rounded-3xl border border-white/10 bg-[#111522] p-5 sm:p-8">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  Seating layout
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  {availableCount} available of{" "}
                  {seats.length} seats
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  void loadSeats();
                }}
                disabled={busy || loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>

            {/* Legend */}
            <div className="mb-8 flex flex-wrap gap-5 text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-violet-600" />
                Available
              </span>

              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-emerald-500" />
                Selected
              </span>

              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-amber-500/60" />
                Held
              </span>

              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-slate-600" />
                Booked
              </span>
            </div>

            {/* Stage */}
            <div className="mb-10 rounded-xl border border-violet-400/20 bg-gradient-to-b from-violet-500/20 to-transparent py-5 text-center text-xs font-bold uppercase tracking-[0.5em] text-violet-200">
              Stage
            </div>

            {/* Seat grid */}
            {loading ? (
              <div className="py-20 text-center text-slate-400">
                Loading live seats...
              </div>
            ) : seats.length === 0 ? (
              <div className="py-20 text-center text-slate-400">
                No seat inventory is available
                for this event.
              </div>
            ) : (
              <div className="space-y-10">
                {sections.map((section) => (
                  <div key={section.id}>
                    <h3 className="mb-5 border-b border-white/10 pb-3 text-lg font-bold text-violet-300">
                      {section.name}
                    </h3>

                    <div className="space-y-4 overflow-x-auto pb-3">
                      {section.rows.map((row) => (
                        <div
                          key={row.label}
                          className="flex min-w-max items-center gap-3"
                        >
                          <span className="w-8 shrink-0 text-sm font-semibold text-slate-400">
                            {row.label}
                          </span>

                          <div className="flex gap-2">
                            {row.seats.map((seat) => {
                              const selected =
                                selectedSeatIds.includes(seat.seat_id);

                              const disabled =
                                seat.status !== "available" ||
                                busy ||
                                Boolean(hold);

                              const color = selected
                                ? "bg-emerald-500 text-white ring-2 ring-emerald-300"
                                : seat.status === "booked"
                                  ? "bg-slate-700 text-slate-400"
                                  : seat.status === "held"
                                    ? "bg-amber-600/50 text-amber-100"
                                    : "bg-violet-600 text-white hover:bg-violet-400";

                              return (
                                <button
                                  key={seat.seat_id}
                                  type="button"
                                  disabled={disabled}
                                  aria-pressed={selected}
                                  title={`${section.name}, row ${seat.row_label}, seat ${seat.seat_number} — ${formatPrice(seat.price)} — ${seat.status}`}
                                  onClick={() => {
                                    toggleSeat(seat.seat_id);
                                  }}
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition ${color} disabled:cursor-not-allowed`}
                                >
                                  {seat.seat_number}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Booking summary */}
          <aside className="h-fit rounded-3xl border border-violet-500/25 bg-[#111522] p-7 lg:sticky lg:top-8">
            <div className="flex items-center gap-3 text-violet-400">
              <Ticket size={21} />
              <span className="font-semibold">
                Your selection
              </span>
            </div>

            {selectedSeats.length > 0 ? (
              <>
                <h2 className="mt-7 text-2xl font-bold">
                  {selectedSeats.length} seat
                  {selectedSeats.length !== 1 ? "s" : ""} selected
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  Select up to 6 seats per booking.
                </p>

                <div className="mt-5 space-y-3">
                  {selectedSeats.map((seat) => (
                    <div
                      key={seat.seat_id}
                      className="flex justify-between gap-3 rounded-xl bg-white/5 p-3 text-sm"
                    >
                      <span>
                        {seat.section_name} ? Row {seat.row_label} ?
                        Seat {seat.seat_number}
                      </span>
                      <span className="font-semibold">
                        {formatPrice(seat.price)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-sm text-slate-400">
                    Total price
                  </p>
                  <p className="mt-2 text-3xl font-extrabold">
                    {formatPrice(String(totalPrice))}
                  </p>
                </div>

                {hold ? (
                  <>
                    <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 size={18} />
                        <span className="font-semibold">
                          Seats reserved
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-xl font-bold">
                        <Clock3 size={19} />
                        {minutes}:{seconds}
                      </div>
                      <p className="mt-2 text-xs text-slate-300">
                        Reservation time remaining
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={continueToCheckout}
                      disabled={busy || !reservationActive}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-4 font-bold transition hover:bg-violet-500 disabled:opacity-50"
                    >
                      Continue to Checkout
                      <ArrowRight size={19} />
                    </button>

                    <button
                      type="button"
                      onClick={() => void releaseSeat()}
                      disabled={busy}
                      className="mt-3 w-full rounded-xl border border-white/20 px-5 py-3 font-semibold transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {busy ? "Processing..." : "Release seats"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void reserveSeat()}
                    disabled={
                      busy ||
                      selectedSeats.some(
                        (seat) => seat.status !== "available"
                      )
                    }
                    className="mt-7 w-full rounded-xl bg-violet-600 px-5 py-4 font-bold transition hover:bg-violet-500 disabled:opacity-50"
                  >
                    {busy ? "Reserving..." : "Reserve for 10 minutes"}
                  </button>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-slate-400">
                Select 1 to 6 available seats from the layout.
              </div>
            )}

            <p className="mt-5 text-xs leading-5 text-slate-500">
              Seat availability may change
              until the backend confirms your
              reservation. Login is required
              to reserve a seat.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default SeatSelection;
