

export interface Booking {
  booking_id: string;
  event_id: string;
  seat_ids: string[];
  total_amount: string;
  status: string;
  created_at: string;
}

export async function createBooking(
  holdIds: string[]
): Promise<Booking> {
  if (holdIds.length < 1 || holdIds.length > 6) {
    throw new Error("Select between 1 and 6 seats.");
  }
  const response = await fetch("/api/v1/bookings", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      hold_ids: holdIds,
    }),
  });

  if (!response.ok) {
    let message = `Booking failed (HTTP ${response.status})`;

    try {
      const data: { detail?: unknown } =
        await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // Keep the HTTP error message.
    }

    throw new Error(message);
  }

  return (await response.json()) as Booking;
}

export async function getBooking(
  bookingId: string
): Promise<Booking> {
  const response = await fetch(
    `/api/v1/bookings/${encodeURIComponent(bookingId)}`,
    {
      credentials: "include",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to load booking.");
  }

  return (await response.json()) as Booking;
}
