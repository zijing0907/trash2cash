import type {
  Board,
  Card,
  Community,
  Confusion,
  CollectorHomePickups,
  CollectorJobs,
  DepositOut,
  DropPoint,
  DropPointAdmin,
  DropOffMap,
  HomePickup,
  Job,
  ModelInfo,
  PointsPage,
  Redemption,
  ResidentLookup,
  Reward,
  Scan,
  ScanPage,
  ScanResult,
  ScanSummary,
  Staff,
  Stream,
  User,
  Voucher,
} from "./types";

/** Every API error has a stable `code` (for logic) and a human `message` (to show). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError(0, "network", "Can't reach Trash2Cash. Check your connection and try again.");
  }
  if (!res.ok) {
    let code = "http_error";
    let message = `Something went wrong (HTTP ${res.status}). Please try again.`;
    try {
      const body = await res.json();
      if (body?.detail?.code) {
        code = body.detail.code;
        message = body.detail.message ?? message;
      }
    } catch {
      // not JSON (e.g. a proxy error page): keep the generic message
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function form(fields: Record<string, string | Blob>): RequestInit {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return { method: "POST", body: data };
}

export const api = {
  /** The logged-in user, or null for a guest */
  me: () => request<User | null>("/auth/me"),
  login: (email: string, password: string) => request<User>("/auth/login", json("POST", { email, password })),
  register: (email: string, password: string, display_name: string) =>
    request<User>("/auth/register", json("POST", { email, password, display_name })),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  scan: (file: File, opts: { zoom: boolean; donate: boolean }) =>
    request<ScanResult>("/scans", form({ file, zoom: String(opts.zoom), donate: String(opts.donate) })),
  explain: (file: File, classIndex: number, zoom: boolean) =>
    request<Blob>("/explain", form({ file, class_index: String(classIndex), zoom: String(zoom) })),
  label: (scanId: string, label: string) => request<Scan>(`/scans/${scanId}/label`, json("PUT", { label })),
  deletePhoto: (scanId: string) => request<void>(`/scans/${scanId}/photo`, { method: "DELETE" }),
  scans: (before?: string | null) =>
    request<ScanPage>(`/scans?limit=20${before ? `&before=${encodeURIComponent(before)}` : ""}`),
  summary: () => request<ScanSummary>("/scans/summary"),
  model: () => request<ModelInfo>("/model"),

  // Points and rewards
  streams: () => request<Stream[]>("/streams"),
  dropPoints: () => request<DropPoint[]>("/points"),
  card: () => request<Card>("/me/card"),
  points: (before?: number | null) => request<PointsPage>(`/me/points?limit=20${before ? `&before=${before}` : ""}`),
  rewards: () => request<Reward[]>("/rewards"),
  redeem: (rewardId: number) => request<Redemption>(`/rewards/${rewardId}/redeem`, { method: "POST" }),
  redemptions: () => request<Redemption[]>("/me/redemptions"),

  // Operators
  findResident: (code: string) => request<ResidentLookup>(`/operator/residents/${encodeURIComponent(code.trim())}`),
  deposit: (body: { member_code: string; point_id?: number | null; lines: { stream_key: string; weight_kg: number }[] }) =>
    request<DepositOut>("/operator/deposits", json("POST", body)),
  voucher: (code: string) => request<Voucher>(`/operator/vouchers/${encodeURIComponent(code.trim())}`),
  collectVoucher: (code: string) =>
    request<Voucher>(`/operator/vouchers/${encodeURIComponent(code.trim())}/collect`, { method: "POST" }),
  todaysDeposits: (pointId?: number | null) =>
    request<DepositOut[]>(`/operator/deposits${pointId ? `?point_id=${pointId}` : ""}`),

  // Admins
  board: () => request<Board>("/admin/board"),
  pickups: (containerIds: number[]) =>
    request<{ emptied: number; collected_kg: number }>("/admin/pickups", json("POST", { container_ids: containerIds })),
  updateStream: (key: string, body: { points_per_kg: number; price_sen_per_kg: number }) =>
    request<Stream>(`/admin/streams/${encodeURIComponent(key)}`, json("PUT", body)),
  adminRewards: () => request<Reward[]>("/admin/rewards"),
  saveReward: (id: number | null, body: Omit<Reward, "id" | "is_demo">) =>
    id ? request<Reward>(`/admin/rewards/${id}`, json("PUT", body)) : request<Reward>("/admin/rewards", json("POST", body)),
  adminPoints: () => request<DropPointAdmin[]>("/admin/points"),
  savePoint: (
    id: number | null,
    body: { name: string; address: string; lat: number; lng: number; active: boolean; bins: { stream_key: string; capacity_kg: number }[] },
  ) => (id ? request<DropPointAdmin>(`/admin/points/${id}`, json("PUT", body)) : request<DropPointAdmin>("/admin/points", json("POST", body))),
  offerJobs: (pointIds: number[]) => request<Job[]>("/admin/jobs", json("POST", { point_ids: pointIds })),
  adminJobs: () => request<Job[]>("/admin/jobs"),
  cancelJob: (id: number) => request<Job>(`/admin/jobs/${id}/cancel`, { method: "POST" }),
  staff: (q: string) => request<Staff[]>(`/admin/staff?q=${encodeURIComponent(q)}`),
  setRole: (userId: number, body: { role: string; drop_point_id: number | null }) =>
    request<Staff>(`/admin/users/${userId}/role`, json("PUT", body)),

  // The community page (Phase 7)
  community: () => request<Community>("/community"),
  confusion: (pointId: number | null) =>
    request<Confusion>(`/community/confusion${pointId ? `?point_id=${pointId}` : ""}`),

  // The public map (Phase 4) and reports from the public (Phase 6)
  dropOffMap: () => request<DropOffMap>("/map"),
  reportBin: (pointId: number, streamKey: string, level: "full" | "overflowing", photo: File | null) => {
    const form = new FormData();
    form.append("point_id", String(pointId));
    form.append("stream_key", streamKey);
    form.append("level", level);
    if (photo) form.append("photo", photo);
    return request<{ id: number }>("/reports", { method: "POST", body: form });
  },

  // Collectors (Phase 4)
  collectorJobs: () => request<CollectorJobs>("/collector/jobs"),
  takeJob: (id: number) => request<Job>(`/collector/jobs/${id}/take`, { method: "POST" }),
  releaseJob: (id: number) => request<Job>(`/collector/jobs/${id}/release`, { method: "POST" }),
  collectBin: (jobId: number, itemId: number, weightKg: number, photo: File) => {
    const form = new FormData();
    form.append("weight_kg", String(weightKg));
    form.append("photo", photo);
    return request<Job>(`/collector/jobs/${jobId}/items/${itemId}/collect`, { method: "POST", body: form });
  },
  skipBin: (jobId: number, itemId: number, reason: string) =>
    request<Job>(`/collector/jobs/${jobId}/items/${itemId}/skip`, json("POST", { reason })),
};

export interface HomeBooking {
  streams: string[];
  rough_kg: number;
  address: string;
  lat: number;
  lng: number;
  day: string;
  slot: string;
  note: string;
  photo: File;
}

/** Home pickups (Phase 6b) */
export const homeApi = {
  book: (b: HomeBooking) => {
    const form = new FormData();
    form.append("streams", b.streams.join(","));
    for (const k of ["rough_kg", "address", "lat", "lng", "day", "slot", "note"] as const) form.append(k, String(b[k]));
    form.append("photo", b.photo);
    return request<HomePickup>("/home-pickups", { method: "POST", body: form });
  },
  mine: () => request<HomePickup[]>("/home-pickups/mine"),
  cancel: (id: number) => request<HomePickup>(`/home-pickups/${id}/cancel`, { method: "POST" }),
  forCollector: () => request<CollectorHomePickups>("/collector/home-pickups"),
  take: (id: number) => request<HomePickup>(`/collector/home-pickups/${id}/take`, { method: "POST" }),
  release: (id: number) => request<HomePickup>(`/collector/home-pickups/${id}/release`, { method: "POST" }),
  collect: (id: number, lines: { stream_key: string; weight_kg: number }[]) =>
    request<HomePickup>(`/collector/home-pickups/${id}/collect`, json("POST", lines)),
  missed: (id: number, reason: string) =>
    request<HomePickup>(`/collector/home-pickups/${id}/missed`, json("POST", { reason })),
  forAdmin: () => request<HomePickup[]>("/admin/home-pickups"),
};

export const homePhotoUrl = (id: number) => `/api/home-pickups/${id}/photo`;

/** A report's photo (admins) */
export const reportPhotoUrl = (reportId: number) => `/api/reports/${reportId}/photo`;

/** The collector's photo of an emptied bin (admins, and the collector who took it) */
export const pickupPhotoUrl = (pickupId: number) => `/api/pickups/${pickupId}/photo`;
