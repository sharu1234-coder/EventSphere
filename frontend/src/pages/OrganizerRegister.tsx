

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";

type FormValues = {
  full_name: string;
  email: string;
  organization_name: string;
  password: string;
  confirm_password: string;
};

type RegistrationResponse = {
  message: string;
  email: string;
  status: string;
};

export default function OrganizerRegister() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormValues>({
    full_name: "",
    email: "",
    organization_name: "",
    password: "",
    confirm_password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] =
    useState<RegistrationResponse | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function updateField(
    field: keyof FormValues,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setError("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");

    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (
      !form.full_name.trim() ||
      !form.email.trim() ||
      !form.organization_name.trim()
    ) {
      setError("Please complete all required fields.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/v1/auth/register/organizer",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            full_name: form.full_name.trim(),
            email: form.email.trim().toLowerCase(),
            organization_name:
              form.organization_name.trim(),
            password: form.password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const detail = data?.detail;

        throw new Error(
          typeof detail === "string"
            ? detail
            : "Registration failed. Please check your details."
        );
      }

      setSuccess(data as RegistrationResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/5 " +
    "px-4 py-3 pl-11 text-white outline-none " +
    "placeholder:text-slate-500 transition " +
    "focus:border-violet-400/60 focus:ring-2 " +
    "focus:ring-violet-500/20";

  return (
    <div className="min-h-screen bg-[#080716] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-violet-700/20 blur-[110px]" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-700/15 blur-[110px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-2xl font-black tracking-tight"
          >
            Event<span className="text-violet-400">Sphere</span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#121025]/90 p-7 shadow-2xl shadow-violet-950/30 backdrop-blur-xl sm:p-10">
            {success ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2
                    size={42}
                    className="text-emerald-400"
                  />
                </div>

                <h1 className="mb-3 text-3xl font-bold">
                  Application Submitted!
                </h1>

                <p className="mb-5 text-slate-400">
                  Your organizer application has been received.
                  It is awaiting administrator approval.
                </p>

                <div className="mb-8 rounded-2xl border border-violet-400/15 bg-violet-500/5 p-5 text-left">
                  <p className="mb-2 text-sm text-slate-400">
                    Registered email
                  </p>

                  <p className="break-all font-medium">
                    {success.email}
                  </p>

                  <p className="mt-4 text-sm text-slate-400">
                    Application status
                  </p>

                  <span className="mt-2 inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm font-semibold capitalize text-amber-300">
                    {success.status}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3.5 font-semibold transition hover:bg-violet-500"
                >
                  Continue to Login
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
                    <Building2 size={27} />
                  </div>

                  <h1 className="text-3xl font-bold tracking-tight">
                    Become an Organizer
                  </h1>

                  <p className="mt-3 leading-relaxed text-slate-400">
                    Apply to host events, manage reservations,
                    and welcome guests with EventSphere.
                  </p>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  <div>
                    <label
                      htmlFor="organizer-name"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Full Name
                    </label>

                    <div className="relative">
                      <UserRound
                        size={18}
                        className="absolute left-4 top-3.5 text-slate-500"
                      />

                      <input
                        id="organizer-name"
                        type="text"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={150}
                        value={form.full_name}
                        onChange={(e) =>
                          updateField("full_name", e.target.value)
                        }
                        placeholder="Enter your full name"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="organization-name"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Organization Name
                    </label>

                    <div className="relative">
                      <Building2
                        size={18}
                        className="absolute left-4 top-3.5 text-slate-500"
                      />

                      <input
                        id="organization-name"
                        type="text"
                        required
                        minLength={2}
                        maxLength={150}
                        value={form.organization_name}
                        onChange={(e) =>
                          updateField(
                            "organization_name",
                            e.target.value
                          )
                        }
                        placeholder="Your company or event brand"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="organizer-email"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Email Address
                    </label>

                    <div className="relative">
                      <Mail
                        size={18}
                        className="absolute left-4 top-3.5 text-slate-500"
                      />

                      <input
                        id="organizer-email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={255}
                        value={form.email}
                        onChange={(e) =>
                          updateField("email", e.target.value)
                        }
                        placeholder="you@organization.com"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="organizer-password"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Password
                    </label>

                    <div className="relative">
                      <LockKeyhole
                        size={18}
                        className="absolute left-4 top-3.5 text-slate-500"
                      />

                      <input
                        id="organizer-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={form.password}
                        onChange={(e) =>
                          updateField("password", e.target.value)
                        }
                        placeholder="Minimum 8 characters"
                        className={`${inputClass} pr-12`}
                      />

                      <button
                        type="button"
                        onClick={() =>
                          setShowPassword((value) => !value)
                        }
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        className="absolute right-4 top-3.5 text-slate-500 hover:text-white"
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="organizer-confirm-password"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Confirm Password
                    </label>

                    <div className="relative">
                      <LockKeyhole
                        size={18}
                        className="absolute left-4 top-3.5 text-slate-500"
                      />

                      <input
                        id="organizer-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={128}
                        value={form.confirm_password}
                        onChange={(e) =>
                          updateField(
                            "confirm_password",
                            e.target.value
                          )
                        }
                        placeholder="Re-enter your password"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 font-semibold shadow-lg shadow-violet-900/20 transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading
                      ? "Submitting Application..."
                      : "Apply as Organizer"}

                    {!loading && <ArrowRight size={18} />}
                  </button>
                </form>

                <div className="mt-7 border-t border-white/10 pt-6 text-center text-sm text-slate-400">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-violet-400 hover:text-violet-300"
                  >
                    Sign In
                  </Link>
                </div>

                <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
                  Organizer access is activated after application approval.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
