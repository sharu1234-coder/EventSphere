
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Ticket,
} from "lucide-react";

import type { EventResponse } from "../services/events";

function EventDetails() {
  const { eventId } = useParams<{ eventId: string }>();

  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) {
      setError("Invalid event ID");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadEvent() {
      setLoading(true);
      setError(null);
      setEvent(null);

      try {
        const response = await fetch(
          `/api/v1/events/${encodeURIComponent(eventId!)}`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Event not found"
              : `Unable to load event (HTTP ${response.status})`
          );
        }

        const data: EventResponse = await response.json();

        if (!controller.signal.aborted) {
          setEvent(data);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadEvent();

    return () => controller.abort();
  }, [eventId]);

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));

  const formatTime = (value: string) =>
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));

  const eventHasStarted = event
    ? new Date(event.starts_at).getTime() <= Date.now()
    : false;

  return (
    <div className="min-h-screen bg-[#080A12] text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080A12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/20">
              <Ticket size={21} />
            </div>

            <span className="text-xl font-extrabold tracking-tight">
              Event
              <span className="text-violet-400">
                Sphere
              </span>
            </span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
          >
            <ArrowLeft size={17} />
            Back to events
          </Link>
        </div>
      </header>

      {/* Loading */}
      {loading ? (
        <main className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <div className="h-6 w-36 animate-pulse rounded-lg bg-violet-500/20" />
          <div className="mt-8 h-14 w-2/3 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-6 h-6 w-1/2 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-20 h-64 animate-pulse rounded-2xl bg-white/5" />
        </main>
      ) : error ? (
        /* Error */
        <main className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <div className="max-w-xl rounded-2xl border border-red-500/20 bg-red-500/10 p-8">
            <h1 className="text-3xl font-bold">
              Unable to open event
            </h1>

            <p className="mt-4 text-slate-300">
              {error}
            </p>

            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-semibold transition hover:bg-violet-500"
            >
              <ArrowLeft size={17} />
              Return home
            </Link>
          </div>
        </main>
      ) : event ? (
        <main>
          {/* Hero */}
          <section className="relative isolate overflow-hidden border-b border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-950/50 via-[#080A12] to-[#080A12]" />

            <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />

            <div className="relative mx-auto max-w-7xl px-5 py-24 lg:px-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                <Ticket size={14} />
                Live experience
              </span>

              <h1 className="mt-8 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                {event.title}
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                {event.description}
              </p>

              <div className="mt-8 flex flex-wrap gap-5 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <CalendarDays
                    size={18}
                    className="text-violet-400"
                  />
                  {formatDate(event.starts_at)}
                </span>

                <span className="flex items-center gap-2">
                  <Clock3
                    size={18}
                    className="text-violet-400"
                  />
                  {formatTime(event.starts_at)} IST
                </span>
              </div>
            </div>
          </section>

          {/* Event Information */}
          <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold">
                About this event
              </h2>

              <p className="mt-5 whitespace-pre-line leading-8 text-slate-400">
                {event.description}
              </p>

              <div className="mt-10 grid gap-5 sm:grid-cols-2">
                {/* Date */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <CalendarDays
                    size={25}
                    className="mb-4 text-violet-400"
                  />

                  <p className="text-sm text-slate-400">
                    Event date
                  </p>

                  <p className="mt-2 font-semibold">
                    {formatDate(event.starts_at)}
                  </p>
                </div>

                {/* Time */}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <Clock3
                    size={25}
                    className="mb-4 text-violet-400"
                  />

                  <p className="text-sm text-slate-400">
                    Event time (IST)
                  </p>

                  <p className="mt-2 font-semibold">
                    {formatTime(event.starts_at)}
                    {" – "}
                    {formatTime(event.ends_at)}
                  </p>
                </div>
              </div>

              {/* Booking Process */}
              <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-7">
                <h3 className="text-xl font-bold">
                  How seat booking works
                </h3>

                <div className="mt-6 grid gap-6 sm:grid-cols-3">
                  {[
                    {
                      number: "01",
                      title: "Choose a seat",
                      description:
                        "Explore the live seating layout.",
                    },
                    {
                      number: "02",
                      title: "Reserve",
                      description:
                        "Hold your chosen seat for 10 minutes.",
                    },
                    {
                      number: "03",
                      title: "Checkout",
                      description:
                        "Complete payment to confirm your ticket.",
                    },
                  ].map((step) => (
                    <div key={step.number}>
                      <span className="text-2xl font-bold text-violet-400">
                        {step.number}
                      </span>

                      <h4 className="mt-3 font-semibold">
                        {step.title}
                      </h4>

                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Booking Sidebar */}
            <aside className="h-fit rounded-2xl border border-violet-500/20 bg-[#111522] p-7 shadow-2xl shadow-violet-900/10 lg:sticky lg:top-28">
              <div className="flex items-center gap-3 text-violet-400">
                <Ticket size={22} />
                <span className="font-semibold">
                  Event tickets
                </span>
              </div>

              <h3 className="mt-6 text-2xl font-bold">
                Find your perfect seat
              </h3>

              <p className="mt-3 text-sm leading-7 text-slate-400">
                Explore available seating, compare ticket prices,
                and choose where you want to experience this event.
              </p>

              <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-6 text-sm text-slate-400">
                <MapPin
                  size={17}
                  className="shrink-0 text-violet-400"
                />
                Venue details coming soon
              </div>

              {/* Functional Seat Selection Link */}
              {eventHasStarted ? (
                <div className="mt-7 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-center font-semibold text-slate-400">
                  Booking is closed for this event
                </div>
              ) : (
                <Link
                  to={`/events/${event.id}/seats`}
                  className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-violet-600 px-6 py-4 font-bold text-white shadow-lg shadow-violet-600/20 transition duration-300 hover:-translate-y-0.5 hover:bg-violet-500"
                >
                  Select Seats
                  <ArrowRight size={18} />
                </Link>
              )}

              <p className="mt-4 text-center text-xs leading-5 text-slate-500">
                Live seat availability and ticket prices are shown
                on the next page.
              </p>
            </aside>
          </section>
        </main>
      ) : null}
    </div>
  );
}

export default EventDetails;
