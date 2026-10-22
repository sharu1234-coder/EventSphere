

export interface EventResponse {
  id: string;
  organizer_id: string;
  venue_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

const API_BASE = "/api/v1";

export async function fetchPublishedEvents(
  signal?: AbortSignal
): Promise<EventResponse[]> {
  const response = await fetch(`${API_BASE}/events`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Unable to load events (HTTP ${response.status})`
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Invalid events response");
  }

  return data as EventResponse[];
}

export function formatEventDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(dateString));
}
