
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";

type Ticket = {
  ticket_id: string;
  booking_id: string;
  event_id: string;
  event_title: string;
  event_starts_at: string;
  seats: {
    section_name: string;
    row_label: string;
    seat_number: number;
  }[];
  checked_in_at: string | null;
};

type QRResponse = {
  ticket_id: string;
  qr_code: string;
};

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("LOGIN_REQUIRED");
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;

    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        detail = data.detail;
      }
    } catch {
      // Use the default error message.
    }

    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default function MyTickets() {
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTickets() {
      try {
        const data = await apiGet<Ticket[]>("/api/v1/tickets");

        if (active) {
          setTickets(data);
        }
      } catch (err) {
        if (!active) return;

        if (
          err instanceof Error &&
          err.message === "LOGIN_REQUIRED"
        ) {
          navigate("/login", {
            replace: true,
            state: { from: "/my-tickets" },
          });
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load tickets."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    loadTickets();

    return () => {
      active = false;
    };
  }, [navigate]);

  async function loadQR(ticketId: string): Promise<string> {
    if (qrCodes[ticketId]) {
      return qrCodes[ticketId];
    }

    const data = await apiGet<QRResponse>(
      `/api/v1/tickets/${ticketId}/qr`
    );

    setQrCodes((previous) => ({
      ...previous,
      [ticketId]: data.qr_code,
    }));

    return data.qr_code;
  }

  async function showQR(ticketId: string) {
    setBusyId(ticketId);
    setError("");

    try {
      await loadQR(ticketId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate QR code."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function downloadTicket(ticket: Ticket) {
    setBusyId(ticket.ticket_id);
    setError("");

    try {
      const qrCode = await loadQR(ticket.ticket_id);

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();

      pdf.setFillColor(24, 13, 46);
      pdf.rect(0, 0, pageWidth, 210, "F");

      pdf.setTextColor(205, 175, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("EVENTSPHERE", pageWidth / 2, 20, {
        align: "center",
      });

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);

      const titleLines = pdf.splitTextToSize(
        ticket.event_title,
        pageWidth - 24
      );

      pdf.text(titleLines, pageWidth / 2, 38, {
        align: "center",
      });

      const detailsY = 51 + (titleLines.length - 1) * 6;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(225, 215, 240);

      pdf.text(
        `Date: ${formatDate(ticket.event_starts_at)}`,
        12,
        detailsY
      );

      pdf.text(
        `Seats booked: ${ticket.seats.length}`,
        12,
        detailsY + 9
      );

      const seatLines = ticket.seats.map(
        (seat) =>
          `${seat.section_name} - Row ${seat.row_label} - Seat ${seat.seat_number}`
      );

      const seatText = pdf.splitTextToSize(
        seatLines.join("\n"),
        pageWidth - 24
      ) as string[];

      const maxSeatLines = 12;

      if (seatText.length > maxSeatLines) {
        throw new Error("Too many seat details for the ticket PDF.");
      }

      pdf.text(seatText, 12, detailsY + 18);

      const qrY = Math.max(
        detailsY + 26,
        detailsY + 20 + seatText.length * 5
      );

      if (qrY + 92 > pdf.internal.pageSize.getHeight() - 5) {
        throw new Error("Ticket details exceed the PDF page.");
      }

      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(
        pageWidth / 2 - 34,
        qrY,
        68,
        68,
        3,
        3,
        "F"
      );

      pdf.addImage(
        qrCode,
        "PNG",
        pageWidth / 2 - 31,
        qrY + 3,
        62,
        62
      );

      pdf.setFontSize(8);
      pdf.setTextColor(190, 175, 210);

      pdf.text(
        `Ticket ID: ${ticket.ticket_id}`,
        pageWidth / 2,
        qrY + 79,
        { align: "center" }
      );

      pdf.text(
        "Present this QR code at event entry.",
        pageWidth / 2,
        qrY + 88,
        { align: "center" }
      );

      pdf.save(`EventSphere-Ticket-${ticket.ticket_id}.pdf`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to download ticket."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #10091f, #21103a 55%, #10091f)",
        color: "#ffffff",
        padding: "32px 20px 80px",
        fontFamily: "inherit",
      }}
    >
      <div style={{ maxWidth: 1050, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "transparent",
            border: "none",
            color: "#c4b5fd",
            cursor: "pointer",
            marginBottom: 28,
            fontSize: 15,
          }}
        >
          ← Back to Events
        </button>

        <div style={{ marginBottom: 32 }}>
          <p
            style={{
              color: "#a78bfa",
              letterSpacing: 3,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            EVENTSPHERE
          </p>

          <h1
            style={{
              fontSize: "clamp(30px, 5vw, 44px)",
              margin: "8px 0",
            }}
          >
            My Tickets
          </h1>

          <p style={{ color: "#b7a9cf" }}>
            Your confirmed event tickets, all in one place.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: "#4c1d2c",
              border: "1px solid #be4b66",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <p style={{ color: "#c4b5fd" }}>
            Loading your tickets...
          </p>
        )}

        {!loading && tickets.length === 0 && !error && (
          <div
            style={{
              padding: 48,
              borderRadius: 20,
              background: "#241637",
              textAlign: "center",
            }}
          >
            <h2>No tickets yet</h2>
            <p style={{ color: "#b7a9cf" }}>
              Book an event to see your tickets here.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                marginTop: 16,
                padding: "12px 24px",
                border: "none",
                borderRadius: 10,
                background: "#8b5cf6",
                color: "white",
                cursor: "pointer",
              }}
            >
              Explore Events
            </button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 350px), 1fr))",
            gap: 24,
          }}
        >
          {tickets.map((ticket) => {
            const qr = qrCodes[ticket.ticket_id];
            const busy = busyId === ticket.ticket_id;

            return (
              <div
                key={ticket.ticket_id}
                style={{
                  background: "#241637",
                  border: "1px solid #4c356a",
                  borderRadius: 20,
                  padding: 24,
                  boxShadow: "0 14px 35px #00000033",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      color: "#c4b5fd",
                      fontWeight: 700,
                      fontSize: 12,
                      letterSpacing: 2,
                    }}
                  >
                    DIGITAL TICKET
                  </span>

                  <span
                    style={{
                      background: ticket.checked_in_at
                        ? "#374151"
                        : "#14532d",
                      color: "#dcfce7",
                      padding: "6px 10px",
                      borderRadius: 20,
                      fontSize: 12,
                    }}
                  >
                    {ticket.checked_in_at
                      ? "Checked In"
                      : "Confirmed"}
                  </span>
                </div>

                <h2 style={{ fontSize: 23, marginBottom: 12 }}>
                  {ticket.event_title}
                </h2>

                <p
                  style={{
                    color: "#c4b5fd",
                    marginBottom: 24,
                  }}
                >
                  {formatDate(ticket.event_starts_at)}
                </p>

                <div
                  style={{
                    background: "#170e29",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 24,
                  }}
                >
                  <div
                    style={{
                      color: "#c4b5fd",
                      fontWeight: 700,
                      marginBottom: 12,
                    }}
                  >
                    {ticket.seats.length} SEAT
                    {ticket.seats.length !== 1 ? "S" : ""} BOOKED
                  </div>

                  {ticket.seats.map((seat, index) => (
                    <div
                      key={`${seat.section_name}-${seat.row_label}-${seat.seat_number}-${index}`}
                      style={{
                        padding: "9px 0",
                        borderTop: "1px solid #4c356a",
                        fontSize: 14,
                      }}
                    >
                      {seat.section_name} {" | "} Row {seat.row_label} {" | "} Seat{" "}
                      {seat.seat_number}
                    </div>
                  ))}
                </div>

                {qr && (
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 14,
                      padding: 12,
                      width: 220,
                      maxWidth: "100%",
                      margin: "0 auto 24px",
                    }}
                  >
                    <img
                      src={qr}
                      alt={`QR code for ${ticket.event_title}`}
                      style={{ width: "100%", display: "block" }}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <button
                    disabled={busy}
                    onClick={() => showQR(ticket.ticket_id)}
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #8b5cf6",
                      background: "#6d28d9",
                      color: "white",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? "Loading..." : qr ? "Show QR Again" : "Show QR"}
                  </button>

                  <button
                    disabled={busy}
                    onClick={() => downloadTicket(ticket)}
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid #6d568d",
                      background: "#33214e",
                      color: "white",
                      cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    Download PDF
                  </button>
                </div>

                <p
                  style={{
                    marginTop: 20,
                    color: "#8f81a8",
                    fontSize: 11,
                    overflowWrap: "anywhere",
                  }}
                >
                  Ticket ID: {ticket.ticket_id}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
