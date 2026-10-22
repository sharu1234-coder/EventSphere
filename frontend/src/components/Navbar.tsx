
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  Menu,
  ScanLine,
  Ticket,
  X,
} from "lucide-react";

type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: "customer" | "organizer" | "admin";
};

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  // Check authentication when the navbar mounts
  // or the current route changes.
  useEffect(() => {
    const controller = new AbortController();

    async function loadCurrentUser() {
      setLoading(true);

      try {
        const response = await fetch("/api/v1/auth/me", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });

        if (response.status === 401) {
          if (!controller.signal.aborted) {
            setUser(null);
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to check login status.");
        }

        const currentUser =
          (await response.json()) as CurrentUser;

        if (!controller.signal.aborted) {
          setUser(currentUser);
        }
      } catch {
        if (!controller.signal.aborted) {
          setUser(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      controller.abort();
    };
  }, [location.pathname]);

  // Close the mobile menu after navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  const isOrganizer =
    user?.role === "organizer" ||
    user?.role === "admin";

  const linkClass =
    "text-sm font-medium text-slate-300 transition-colors hover:text-white";

  const mobileLinkClass =
    "block rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white";

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed. Please try again.");
      }

      setUser(null);
      setMenuOpen(false);

      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Unable to log out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080A12]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
        {/* Logo */}
        <Link
          to="/"
          aria-label="EventSphere home"
          className="flex shrink-0 items-center gap-3"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/20">
            <Ticket size={21} className="text-white" />
          </span>

          <span className="text-xl font-extrabold tracking-tight text-white">
            Event
            <span className="text-violet-400">
              Sphere
            </span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-5 lg:flex"
        >
          <Link to="/" className={linkClass}>
            Discover
          </Link>

          <a href="/#events" className={linkClass}>
            Explore Events
          </a>

          <a href="/#about" className={linkClass}>
            Why EventSphere
          </a>

          {!loading && user && (
            <Link
              to="/my-tickets"
              className={linkClass}
            >
              My Tickets
            </Link>
          )}

          {!loading && isOrganizer && (
            <Link
              to="/organizer/scanner"
              className="inline-flex items-center gap-2 text-sm font-semibold text-violet-300 transition-colors hover:text-white"
            >
              <ScanLine size={17} />
              Organizer Scanner
            </Link>
          )}
        </nav>

        {/* Desktop Authentication */}
        <div className="hidden items-center gap-3 lg:flex">
          {loading ? (
            <span
              role="status"
              className="text-xs text-slate-500"
            >
              Checking account...
            </span>
          ) : !user ? (
            <>
              <Link
                to="/login"
                className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
              >
                Login
              </Link>

              <Link
                to="/register"
                className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                Sign Up
              </Link>
            </>
          ) : (
            <>
              <span
                className="max-w-32 truncate text-sm text-slate-300"
                title={user.full_name}
              >
                {user.full_name}
              </span>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut size={16} />
                {loggingOut
                  ? "Logging out..."
                  : "Logout"}
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          aria-label={
            menuOpen
              ? "Close navigation menu"
              : "Open navigation menu"
          }
          aria-expanded={menuOpen}
          aria-controls="eventsphere-mobile-nav"
          onClick={() =>
            setMenuOpen((previous) => !previous)
          }
          className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 lg:hidden"
        >
          {menuOpen ? (
            <X size={25} />
          ) : (
            <Menu size={25} />
          )}
        </button>
      </div>

      {/* Logout Error */}
      {logoutError && (
        <div
          role="alert"
          className="mx-auto max-w-7xl px-5 pb-3 text-sm text-rose-300 lg:px-8"
        >
          {logoutError}
        </div>
      )}

      {/* Mobile Navigation */}
      {menuOpen && (
        <nav
          id="eventsphere-mobile-nav"
          aria-label="Mobile navigation"
          className="border-t border-white/10 bg-[#0D0C19] px-5 py-5 lg:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2">
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className={mobileLinkClass}
            >
              Discover
            </Link>

            <a
              href="/#events"
              onClick={() => setMenuOpen(false)}
              className={mobileLinkClass}
            >
              Explore Events
            </a>

            <a
              href="/#about"
              onClick={() => setMenuOpen(false)}
              className={mobileLinkClass}
            >
              Why EventSphere
            </a>

            {!loading && user && (
              <Link
                to="/my-tickets"
                onClick={() => setMenuOpen(false)}
                className={mobileLinkClass}
              >
                My Tickets
              </Link>
            )}

            {!loading && isOrganizer && (
              <Link
                to="/organizer/scanner"
                onClick={() => setMenuOpen(false)}
                className={`${mobileLinkClass} flex items-center gap-2 text-violet-300`}
              >
                <ScanLine size={17} />
                Organizer Scanner
              </Link>
            )}

            <div className="my-2 border-t border-white/10" />

            {loading ? (
              <p className="px-3 py-2 text-sm text-slate-400">
                Checking account...
              </p>
            ) : !user ? (
              <>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className={mobileLinkClass}
                >
                  Login
                </Link>

                <Link
                  to="/register"
                  onClick={() => setMenuOpen(false)}
                  className="mt-2 rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-500"
                >
                  Sign Up
                </Link>
              </>
            ) : (
              <>
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold text-white">
                    {user.full_name}
                  </p>

                  <p className="mt-1 break-all text-xs text-slate-400">
                    {user.email}
                  </p>

                  <p className="mt-1 text-xs capitalize text-violet-300">
                    {user.role}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                >
                  <LogOut size={17} />
                  {loggingOut
                    ? "Logging out..."
                    : "Logout"}
                </button>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
