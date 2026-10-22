

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type CurrentUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

type OrganizerApplication = {
  application_id: string;
  user_id: string;
  full_name: string;
  email: string;
  organization_name: string;
  status: string;
  created_at: string;
};

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<
    OrganizerApplication[]
  >([]);
  const [processingId, setProcessingId] = useState<string | null>(
    null
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadApplications = useCallback(async () => {
    const response = await fetch(
      "/api/v1/auth/organizer-applications?application_status=pending",
      { credentials: "include" }
    );

    if (!response.ok) {
      throw new Error("Unable to load organizer applications.");
    }

    const data = (await response.json()) as OrganizerApplication[];
    setApplications(data);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const response = await fetch("/api/v1/auth/me", {
          credentials: "include",
        });

        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to verify your account.");
        }

        const user = (await response.json()) as CurrentUser;

        if (user.role !== "admin") {
          if (active) {
            setError("Administrator access required.");
          }
          return;
        }

        if (active) {
          setAuthorized(true);
        }

        await loadApplications();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [navigate, loadApplications]);

  async function reviewApplication(
    application: OrganizerApplication,
    action: "approve" | "reject"
  ) {
    const confirmation = window.confirm(
      `Are you sure you want to ${action} ${application.full_name}'s organizer application?`
    );

    if (!confirmation) return;

    setProcessingId(application.application_id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/v1/auth/organizer-applications/${application.application_id}/${action}`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Failed to ${action} application.`
        );
      }

      setMessage(
        action === "approve"
          ? `${application.full_name} is now an approved organizer.`
          : `${application.full_name}'s application was rejected.`
      );

      await loadApplications();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#080716] px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/"
            className="text-2xl font-black tracking-tight"
          >
            Event<span className="text-violet-400">Sphere</span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to Home
          </Link>
        </div>

        <div className="mb-8 flex items-center gap-4">
          <div className="rounded-2xl bg-violet-500/15 p-4 text-violet-300">
            <ShieldCheck size={30} />
          </div>

          <div>
            <h1 className="text-3xl font-bold">
              Admin Dashboard
            </h1>
            <p className="mt-1 text-slate-400">
              Review and manage organizer applications.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            Loading applications...
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300"
              >
                {error}
              </div>
            )}

            {message && (
              <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-300">
                {message}
              </div>
            )}

            {authorized && (
              <>
                <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <Clock3 className="text-amber-300" size={24} />
                  <div>
                    <p className="text-sm text-slate-400">
                      Pending Applications
                    </p>
                    <p className="text-2xl font-bold">
                      {applications.length}
                    </p>
                  </div>
                </div>

                {applications.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                    <CheckCircle2
                      size={40}
                      className="mx-auto mb-4 text-emerald-400"
                    />
                    <h2 className="text-xl font-semibold">
                      All caught up!
                    </h2>
                    <p className="mt-2 text-slate-400">
                      There are no pending organizer applications.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    {applications.map((application) => {
                      const processing =
                        processingId === application.application_id;

                      return (
                        <div
                          key={application.application_id}
                          className="rounded-2xl border border-white/10 bg-[#151229] p-6"
                        >
                          <div className="mb-5 flex items-start gap-3">
                            <div className="rounded-xl bg-violet-500/15 p-3 text-violet-300">
                              <Building2 size={23} />
                            </div>

                            <div className="min-w-0">
                              <h2 className="text-lg font-bold">
                                {application.organization_name}
                              </h2>
                              <p className="text-sm text-slate-400">
                                {application.full_name}
                              </p>
                            </div>
                          </div>

                          <p className="break-all text-sm text-slate-300">
                            {application.email}
                          </p>

                          <p className="mt-3 text-xs text-slate-500">
                            Applied:{" "}
                            {new Date(
                              application.created_at
                            ).toLocaleString()}
                          </p>

                          <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                void reviewApplication(
                                  application,
                                  "approve"
                                )
                              }
                              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold transition hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {processing ? (
                                <Loader2
                                  size={17}
                                  className="animate-spin"
                                />
                              ) : (
                                <CheckCircle2 size={17} />
                              )}
                              Approve
                            </button>

                            <button
                              type="button"
                              disabled={processing}
                              onClick={() =>
                                void reviewApplication(
                                  application,
                                  "reject"
                                )
                              }
                              className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <XCircle size={17} />
                              Reject
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
