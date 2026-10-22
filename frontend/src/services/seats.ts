

export type SeatStatus = "available" | "held" | "booked";

export interface EventSeat {
  seat_id: string;
  section_id: string;
  section_name: string;
  row_label: string;
  seat_number: number;
  price: string;
  status: SeatStatus;
}

export interface SeatHold {
  hold_ids: string[];
  event_id: string;
  seat_ids: string[];
  expires_at: string;
  status: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Please log in before reserving a seat.");
    }

    if (response.status === 409) {
      throw new Error(
        "This seat is no longer available. Refresh and choose another."
      );
    }

    let message = `Request failed (HTTP ${response.status})`;

    try {
      const data: { detail?: unknown } = await response.json();

      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // Keep the HTTP error message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function getSeatAvailability(
  eventId: string,
  signal?: AbortSignal
): Promise<EventSeat[]> {
  const response = await fetch(
    `/api/v1/events/${encodeURIComponent(eventId)}/availability`,
    {
      credentials: "include",
      signal,
    }
  );

  return readResponse<EventSeat[]>(response);
}

export async function createSeatHold(
  eventId: string,
  seatIds: string[]
): Promise<SeatHold> {
  if (seatIds.length < 1 || seatIds.length > 6) {
    throw new Error("Select between 1 and 6 seats.");
  }

  const response = await fetch(
    `/api/v1/events/${encodeURIComponent(eventId)}/holds`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ seat_ids: seatIds }),
    }
  );

  return readResponse<SeatHold>(response);
}

export async function cancelSeatHold(
  holdId: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/events/holds/${encodeURIComponent(holdId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  await readResponse<unknown>(response);
}
