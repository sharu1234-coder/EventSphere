
import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar";
import Hero3D from "./components/Hero3D";
import {
  fetchPublishedEvents,
  formatEventDate,
  type EventResponse,
} from "./services/events";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Compass,
  Search,
  Sparkles,
  Ticket,
} from "lucide-react";

// Decorative images only. The backend does not yet store event images.
const HERO_IMAGE =
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1600&auto=format&fit=crop&q=85";
const EVENT_IMAGES = [
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1000&auto=format&fit=crop&q=85",
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1000&auto=format&fit=crop&q=85",
  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&auto=format&fit=crop&q=85",
];

function App() {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const result = await fetchPublishedEvents(controller.signal);
        if (!controller.signal.aborted) {
          setEvents(result);
          setError(null);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load events");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, []);

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) =>
      `${event.title} ${event.description}`.toLowerCase().includes(term),
    );
  }, [events, search]);

  return (
    <div className="min-h-screen bg-[#080A12] text-white">
      {/* Navigation */}
      <Navbar />

      {/* Premium 3D hero */}
      <section id="top" className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080A12] via-[#080A12]/95 to-[#080A12]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080A12] via-transparent to-[#080A12]/30" />
        <div className="pointer-events-none absolute right-[5%] top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-violet-600/20 blur-[120px]" />

        <div className="relative mx-auto flex min-h-[700px] max-w-7xl items-center px-5 py-24 lg:px-8">
          <div className="pointer-events-none absolute right-[-5%] top-1/2 hidden h-[540px] w-[54%] -translate-y-1/2 lg:block motion-reduce:hidden">
            <Hero3D />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold tracking-wide text-violet-200 backdrop-blur-md">
              <Sparkles size={14} /> YOUR NEXT UNFORGETTABLE EXPERIENCE
            </div>
            <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
              Life happens.<br />
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                Be there.
              </span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-8 text-slate-300 sm:text-lg">
              Discover extraordinary concerts, experiences, festivals, and live events.
              Find your people. Make every moment count.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <a href="#events" className="inline-flex items-center gap-3 rounded-xl bg-violet-600 px-7 py-4 text-sm font-bold shadow-xl shadow-violet-700/20 transition duration-300 hover:-translate-y-1 hover:bg-violet-500">
                Explore Events <ArrowRight size={18} />
              </a>
              <a href="#about" className="inline-flex items-center gap-3 rounded-xl border border-white/20 bg-white/5 px-7 py-4 text-sm font-semibold backdrop-blur transition hover:bg-white/10">
                How It Works <ChevronRight size={18} />
              </a>
            </div>
            <div className="mt-12 flex flex-wrap gap-8 border-t border-white/15 pt-7">
              {[
                ["01", "Discover events"],
                ["02", "Choose your seat"],
                ["03", "Enjoy the moment"],
              ].map(([number, label]) => (
                <div key={number}>
                  <div className="text-2xl font-bold">{number}</div>
                  <div className="mt-1 text-xs text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Events from FastAPI */}
      <section id="events" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-400">
              <Compass size={17} /> DISCOVER WHAT'S NEXT
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Explore extraordinary events
            </h2>
            <p className="mt-3 text-slate-400">Real published events from EventSphere.</p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-violet-500 lg:w-80">
            <Search size={19} className="shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events..."
              aria-label="Search events"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
          </label>
        </div>

        {loading ? (
          <div role="status" className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-[420px] animate-pulse rounded-2xl border border-white/10 bg-white/5" />
            ))}
            <span className="sr-only">Loading events...</span>
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-8">
            <h3 className="text-lg font-semibold">Could not load events</h3>
            <p className="mt-2 text-sm text-slate-300">{error}</p>
            <p className="mt-2 text-sm text-slate-400">Check that FastAPI is running on port 8000.</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-20 text-center">
            <Search size={32} className="mx-auto mb-4 text-slate-500" />
            <h3 className="text-xl font-semibold">No events found</h3>
            <p className="mt-2 text-sm text-slate-400">
              {events.length === 0 ? "No published events are available yet." : "Try another search."}
            </p>
          </div>
        ) : (
          <div className="grid gap-7 md:grid-cols-2 xl:grid-cols-3">
            {filteredEvents.map((event, index) => (
              <article
                key={event.id}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-[#111522] transition duration-300 hover:-translate-y-1 hover:border-violet-500/40 hover:shadow-2xl hover:shadow-violet-900/10"
              >
                <div className="relative h-60 overflow-hidden">
                  <img
                    src={EVENT_IMAGES[index % EVENT_IMAGES.length]}
                    alt="Decorative concert atmosphere"
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute left-4 top-4 rounded-lg border border-white/20 bg-black/50 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
                    Live Event
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold tracking-tight">{event.title}</h3>
                  <p className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-slate-400">
                    {event.description}
                  </p>
                  <div className="mt-5 flex items-center gap-3 text-sm text-slate-300">
                    <CalendarDays size={17} className="shrink-0 text-violet-400" />
                    {formatEventDate(event.starts_at)}
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                      Published
                    </span>
                    <a
                      href={`/events/${encodeURIComponent(event.id)}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-violet-600"
                      aria-label={`View API details for ${event.title}`}
                    >
                      Event Details <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="mt-6 text-xs text-slate-500">
          Event photography is illustrative. Venue names, categories and ticket prices will appear once supported by the backend.
          Select Event Details to view the event and choose your seat.
        </p>
      </section>

      {/* Why EventSphere */}
      <section id="about" className="border-y border-white/10 bg-[#0D101B]">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mb-12 max-w-xl">
            <p className="text-sm font-bold uppercase tracking-widest text-violet-400">Made for memorable moments</p>
            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              Every great experience starts with a ticket.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Search, title: "Discover effortlessly", text: "Find upcoming published events in one beautiful place." },
              { icon: Ticket, title: "Choose your seat", text: "Select your preferred spot with reserved-seat booking." },
              { icon: Sparkles, title: "Make memories", text: "Less time planning. More time enjoying what you love." },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                  <feature.icon size={23} />
                </div>
                <h3 className="text-lg font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-10 md:flex-row">
          <div>
            <div className="flex items-center gap-2 text-xl font-extrabold">
              <Ticket className="text-violet-400" />
              Event<span className="text-violet-400">Sphere</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">
              Discover incredible events and turn ordinary days into unforgettable experiences.
            </p>
          </div>
          <div className="flex gap-10 text-sm text-slate-400">
            <a href="#events" className="hover:text-white">Explore</a>
            <a href="#about" className="hover:text-white">About</a>
            <a href="#top" className="hover:text-white">Back to top</a>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3 pt-7 text-xs text-slate-500 sm:flex-row">
          <span>© 2026 EventSphere. All rights reserved.</span>
          <span>Designed for extraordinary experiences.</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
