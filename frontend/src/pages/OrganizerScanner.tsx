

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  ScanLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type CurrentUser = {
  id: string;
  full_name: string;
  email: string;
  role: "customer" | "organizer" | "admin";
};

type CheckInResponse = {
  message: string;
  ticket_id: string;
  checked_in_at: string;
};

type ScanResult = {
  success: boolean;
  message: string;
  ticketId?: string;
  checkedInAt?: string;
};

const SCANNER_ID = "eventsphere-qr-reader";

export default function OrganizerScanner() {
  const navigate = useNavigate();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState("");

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const stoppingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    async function checkAccess() {
      try {
        const response = await fetch("/api/v1/auth/me", {
          credentials: "include",
        });

        if (response.status === 401) {
          navigate("/login", {
            replace: true,
            state: { from: "/organizer/scanner" },
          });
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to verify account");
        }

        const account: CurrentUser = await response.json();

        if (mountedRef.current) {
          setUser(account);
          setAuthorized(
            account.role === "organizer" ||
            account.role === "admin"
          );
        }
      } catch {
        if (mountedRef.current) {
          setAuthorized(false);
        }
      } finally {
        if (mountedRef.current) {
          setCheckingAccess(false);
        }
      }
    }

    void checkAccess();

    return () => {
      mountedRef.current = false;

      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (scanner) {
        void scanner.stop().catch(() => {}).finally(() => {
          scanner.clear();
        });
      }
    };
  }, [navigate]);

  const stopCamera = useCallback(async () => {
    if (stoppingRef.current) {
      await stoppingRef.current;
      return;
    }

    const scanner = scannerRef.current;

    if (!scanner) {
      setCameraRunning(false);
      return;
    }

    setCameraBusy(true);

    const operation = (async () => {
      try {
        await scanner.stop();
      } catch {
        // Scanner may already be stopped.
      }

      try {
        scanner.clear();
      } catch {
        // Ignore cleanup errors.
      }

      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }

      if (mountedRef.current) {
        setCameraRunning(false);
        setCameraBusy(false);
      }
    })();

    stoppingRef.current = operation;

    try {
      await operation;
    } finally {
      stoppingRef.current = null;
    }
  }, []);

  const verifyTicket = useCallback(
    async (token: string) => {
      const cleanedToken = token.trim();

      if (!cleanedToken || processingRef.current) {
        return;
      }

      processingRef.current = true;
      setProcessing(true);
      setResult(null);

      try {
        const response = await fetch(
          "/api/v1/tickets/check-in",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              token: cleanedToken,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          let message = "Ticket validation failed";

          if (typeof data.detail === "string") {
            message = data.detail;
          }

          setResult({
            success: false,
            message,
          });

          return;
        }

        const success: CheckInResponse = data;

        setResult({
          success: true,
          message: success.message,
          ticketId: success.ticket_id,
          checkedInAt: success.checked_in_at,
        });

        setManualToken("");
      } catch {
        setResult({
          success: false,
          message:
            "Unable to connect to the ticket validation server.",
        });
      } finally {
        processingRef.current = false;

        if (mountedRef.current) {
          setProcessing(false);
        }
      }
    },
    []
  );

  async function startCamera() {
    if (
      scannerRef.current ||
      cameraBusy ||
      !authorized
    ) {
      return;
    }

    setCameraBusy(true);
    setCameraError("");
    setResult(null);

    const scanner = new Html5Qrcode(SCANNER_ID, {
      verbose: false,
    });

    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: {
            width: 240,
            height: 240,
          },
        },
        (decodedText) => {
          if (processingRef.current) return;

          void stopCamera().then(() => {
            if (mountedRef.current) {
              void verifyTicket(decodedText);
            }
          });
        },
        () => {
          // Ignore frames without a readable QR code.
        }
      );

      if (!mountedRef.current) {
        await scanner.stop();
        scanner.clear();
        return;
      }

      setCameraRunning(true);
    } catch (error) {
      if (scannerRef.current === scanner) {
        scannerRef.current = null;
      }

      try {
        scanner.clear();
      } catch {
        // Ignore cleanup errors.
      }

      setCameraError(
        error instanceof Error
          ? error.message
          : "Could not start camera. Check camera permissions."
      );
    } finally {
      if (mountedRef.current) {
        setCameraBusy(false);
      }
    }
  }

  function handleManualSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    void verifyTicket(manualToken);
  }

  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080A12] text-white">
        Checking organizer access...
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080A12] px-5 text-white">
        <div className="max-w-md rounded-2xl border border-red-500/30 bg-[#15101f] p-8 text-center">
          <XCircle
            size={48}
            className="mx-auto mb-5 text-red-400"
          />

          <h1 className="text-2xl font-bold">
            Access Denied
          </h1>

          <p className="mt-4 text-slate-400">
            Only EventSphere organizers and administrators
            can validate tickets.
          </p>

          <Link
            to="/"
            className="mt-7 inline-block rounded-xl bg-violet-600 px-6 py-3 font-semibold"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080A12] via-[#160e28] to-[#080A12] px-5 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-violet-300 hover:text-white"
        >
          <ArrowLeft size={17} />
          Back to EventSphere
        </Link>

        <div className="mb-9">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-400">
            <ShieldCheck size={17} />
            Authorized Organizer Access
          </div>

          <h1 className="text-3xl font-extrabold sm:text-4xl">
            Ticket QR Scanner
          </h1>

          <p className="mt-3 text-slate-400">
            Scan and validate customer tickets at event entry.
          </p>

          <p className="mt-2 text-sm text-violet-300">
            Signed in as {user?.full_name}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#171225] p-6 shadow-2xl sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <ScanLine
              size={25}
              className="text-violet-400"
            />
            <h2 className="text-xl font-bold">
              Camera Scanner
            </h2>
          </div>

          <div
            id={SCANNER_ID}
            className="mx-auto max-w-lg overflow-hidden rounded-xl bg-black"
          />

          {cameraError && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
            >
              {cameraError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {!cameraRunning ? (
              <button
                type="button"
                disabled={cameraBusy || processing}
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 font-semibold transition hover:bg-violet-500 disabled:opacity-50"
              >
                <Camera size={19} />
                {cameraBusy
                  ? "Starting Camera..."
                  : "Start Camera"}
              </button>
            ) : (
              <button
                type="button"
                disabled={cameraBusy}
                onClick={() => void stopCamera()}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-semibold hover:bg-red-500 disabled:opacity-50"
              >
                <CameraOff size={19} />
                Stop Camera
              </button>
            )}
          </div>

          <p className="mt-4 text-xs leading-6 text-slate-500">
            Allow camera access when prompted. Camera access
            requires localhost or HTTPS in most browsers.
            Each successful scan stops the camera so you can
            review the result before scanning another ticket.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[#171225] p-6 sm:p-8">
          <h2 className="mb-3 text-xl font-bold">
            Manual Token Entry
          </h2>

          <p className="mb-5 text-sm text-slate-400">
            Paste the signed token contained inside a ticket
            QR code to test validation without a camera.
            A ticket ID alone will not work.
          </p>

          <form
            onSubmit={handleManualSubmit}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={manualToken}
              onChange={(event) =>
                setManualToken(event.target.value)
              }
              placeholder="Paste QR token here..."
              aria-label="Ticket QR token"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#0c0917] px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
            />

            <button
              type="submit"
              disabled={
                processing || !manualToken.trim()
              }
              className="rounded-xl bg-violet-600 px-6 py-3 font-semibold hover:bg-violet-500 disabled:opacity-50"
            >
              {processing
                ? "Validating..."
                : "Validate Ticket"}
            </button>
          </form>
        </div>

        {result && (
          <div
            role="status"
            className={`mt-6 rounded-2xl border p-6 ${
              result.success
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-red-500/30 bg-red-500/10"
            }`}
          >
            <div className="flex items-start gap-4">
              {result.success ? (
                <CheckCircle2
                  size={30}
                  className="shrink-0 text-emerald-400"
                />
              ) : (
                <XCircle
                  size={30}
                  className="shrink-0 text-red-400"
                />
              )}

              <div>
                <h3 className="text-xl font-bold">
                  {result.success
                    ? "Ticket Accepted"
                    : "Ticket Rejected"}
                </h3>

                <p className="mt-2 text-slate-200">
                  {result.message}
                </p>

                {result.ticketId && (
                  <p className="mt-3 break-all text-xs text-slate-400">
                    Ticket: {result.ticketId}
                  </p>
                )}

                {result.checkedInAt && (
                  <p className="mt-2 text-xs text-slate-400">
                    Checked in:{" "}
                    {new Date(
                      result.checkedInAt
                    ).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
