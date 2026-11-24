import type {
  Board,
  Card,
  DepositOut,
  DropPoint,
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
  staff: (q: string) => request<Staff[]>(`/admin/staff?q=${encodeURIComponent(q)}`),
  setRole: (userId: number, body: { role: string; drop_point_id: number | null }) =>
    request<Staff>(`/admin/users/${userId}/role`, json("PUT", body)),
};
