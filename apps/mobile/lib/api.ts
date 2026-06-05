import type {
  AnalyzePlateResponse,
  CreateMealRequest,
  DailySummary,
  LoggedMeal,
  PizzaModePlan,
  PizzaModePlanRequest,
  DietaryProfile,
  Reservation,
  CreateReservationRequest,
} from "@coplate/shared";

/**
 * Set this to your laptop's LAN IP (e.g. http://192.168.1.42:3000) so your
 * iPhone running Expo Go can reach the API. `localhost` will NOT work from
 * the phone — that points at the phone itself. Find your IP with `ipconfig
 * getifaddr en0` (macOS).
 */
 export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://10.2.1.5:3000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function analyzePlate(imageBase64: string): Promise<AnalyzePlateResponse> {
  return req<AnalyzePlateResponse>("/analyze", {
    method: "POST",
    body: JSON.stringify({ image_base64: imageBase64, media_type: "image/jpeg" }),
  });
}

export function logMeal(body: CreateMealRequest): Promise<LoggedMeal> {
  return req<LoggedMeal>("/meals", { method: "POST", body: JSON.stringify(body) });
}

export function getTodaySummary(): Promise<DailySummary> {
  return req<DailySummary>("/summary/today");
}

export function planSaveRoom(body: PizzaModePlanRequest): Promise<PizzaModePlan> {
  return req<PizzaModePlan>("/save-room/plan", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createReservation(body: CreateReservationRequest): Promise<Reservation> {
  return req<Reservation>("/reservations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function clearReservation(): Promise<{ cleared: boolean }> {
  return req<{ cleared: boolean }>("/reservations/today", { method: "DELETE" });
}

export function getProfile(): Promise<DietaryProfile> {
  return req<DietaryProfile>("/profile");
}

export function updateProfile(body: DietaryProfile): Promise<DietaryProfile> {
  return req<DietaryProfile>("/profile", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
