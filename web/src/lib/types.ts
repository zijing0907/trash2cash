// Shapes returned by the API (see api/app/schemas.py)

export interface ClassProb {
  class: string;
  prob: number;
}

export interface Scan {
  id: string;
  created_at: string;
  model_version: string;
  predicted_class: string;
  predicted_bin: string | null;
  confidence: number;
  unsure: boolean;
  zoomed: boolean;
  top3: ClassProb[];
  latency_ms: number;
  user_label: string | null;
  photo_donated: boolean;
}

export interface ScanResult extends Scan {
  class_index: number;
  threshold: number;
  crop_box: [number, number, number, number];
}

export type Role = "resident" | "operator" | "admin";

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
  member_code: string;
  drop_point_id: number | null;
}

export interface ModelInfo {
  key: string;
  run: string;
  version: string;
  class_names: string[];
  img_size: number;
  bins: Record<string, string>;
  threshold: number;
  use_tta: boolean;
  gradcam_layer: string;
  metrics: Record<string, number>;
  available_models: string[];
  dataset: string | null;
  quick_run: boolean;
  preprocessing: string | null;
}

export interface ScanPage {
  items: Scan[];
  next_before: string | null;
}

export interface ScanSummary {
  total: number;
  labelled: number;
  by_bin: { bin: string; count: number }[];
}

// ---- Milestone 3: points, rewards, deposits

export interface Stream {
  key: string;
  name: string;
  points_per_kg: number;
  price_sen_per_kg: number;
}

export interface DropPoint {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  is_demo: boolean;
  streams: string[];
}

export interface Card {
  display_name: string;
  member_code: string;
  balance: number;
}

export interface Line {
  stream_key: string;
  weight_g: number;
  points: number;
}

export interface LedgerItem {
  id: number;
  delta: number;
  reason: "deposit" | "redemption" | "adjustment";
  created_at: string;
  point_name: string | null;
  lines: Line[];
  reward_name: string | null;
}

export interface PointsPage {
  balance: number;
  items: LedgerItem[];
  next_before: number | null;
}

export interface Reward {
  id: number;
  name: string;
  description: string;
  cost_points: number;
  stock: number | null;
  active: boolean;
  is_demo: boolean;
}

export interface Redemption {
  id: string;
  reward_name: string;
  cost_points: number;
  code: string;
  created_at: string;
  used_at: string | null;
}

export interface Voucher extends Redemption {
  member_name: string;
  member_code: string;
}

export interface DropPointAdmin {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  active: boolean;
  is_demo: boolean;
  bins: { container_id: number; stream_key: string; capacity_kg: number }[];
}

export interface ResidentLookup {
  display_name: string;
  member_code: string;
  balance: number;
}

export interface DepositOut {
  id: string;
  created_at: string;
  points: number;
  resident_name: string;
  member_code: string;
  point_name: string;
  lines: Line[];
  balance_after: number | null;
}

// ---- Milestone 4: the admin board

export type BinStatus = "due" | "soon" | "later" | "idle";

export interface BoardBin {
  container_id: number;
  stream_key: string;
  stream_name: string;
  capacity_kg: number;
  fill_kg: number;
  fill_ratio: number;
  rate_kg_per_day: number;
  full_on: string | null;
  pickup_on: string | null;
  status: BinStatus;
  last_pickup_at: string | null;
}

export interface BoardPoint {
  id: number;
  name: string;
  address: string;
  is_demo: boolean;
  status: BinStatus;
  next_pickup_on: string | null;
  bins: BoardBin[];
}

export interface Board {
  today: string;
  is_demo: boolean;
  points: BoardPoint[];
  run: { stops: { point_id: number; name: string; km_from_previous: number; bins: string[] }[]; total_km: number };
  month: {
    from: string;
    kg_by_stream: { stream_key: string; stream_name: string; kg: number }[];
    kg_total: number;
    value_sen: number;
    deposits: number;
    residents: number;
    points_issued: number;
    points_redeemed: number;
  };
}

export interface Staff {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  drop_point_id: number | null;
}
