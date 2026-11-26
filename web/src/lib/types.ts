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
  /** Bin-level answer: the likeliest bin, its probability, and whether that is below the threshold (null on
   * scans made before it existed). unsure true with bin_unsure false = sure of the bin, not of the item. */
  top_bin?: string | null;
  bin_confidence?: number | null;
  bin_unsure?: boolean | null;
  user_label: string | null;
  photo_donated: boolean;
}

export interface ScanResult extends Scan {
  class_index: number;
  threshold: number;
  crop_box: [number, number, number, number];
  battery_chance?: number;
  /** The item could be a battery: say so, whatever the answer */
  battery_warning?: boolean;
}

/** The bin the app names for a scan without a user label: only when the model was sure of the bin but not
 * of the item (otherwise the item's own bin, or nothing, is shown). */
export function binLevelAnswer(scan: Scan): string | null {
  return !scan.user_label && scan.unsure && scan.bin_unsure === false && scan.top_bin ? scan.top_bin : null;
}

export type Role = "resident" | "operator" | "admin" | "collector";

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
  /** From this battery probability on, the result warns that the item could be a battery */
  battery_warn_at?: number;
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
  last_deposit_at?: string | null;
  est_fill_kg?: number;
  correction?: Correction | null;
  due_because?: "forecast" | "reports" | null;
  reports?: (BinReports & { photo_ids: number[] }) | null;
}

/** Phase 6: what collectors' scales showed at this bin against what was weighed in */
export interface Correction {
  factor: number;
  pickups: number;
  measured_kg: number;
  weighed_kg: number;
}

/** Phase 6: reports from the public that still count (since the bin was emptied, last 24 hours) */
export interface BinReports {
  /** Different people */
  count: number;
  last_at: string;
  overflowing: boolean;
  /** Enough people: the bin is due */
  confirmed: boolean;
  /** The signed-in person reported it */
  mine: boolean;
}

/** The open or taken job at a point, if any (Phase 4) */
export interface ActiveJob {
  id: number;
  status: JobStatus;
  collector: string | null;
}

export interface BoardPoint {
  id: number;
  name: string;
  address: string;
  is_demo: boolean;
  status: BinStatus;
  next_pickup_on: string | null;
  bins: BoardBin[];
  job?: ActiveJob | null;
}

export interface Board {
  today: string;
  is_demo: boolean;
  points: BoardPoint[];
  run: {
    stops: {
      point_id: number;
      name: string;
      km_from_previous: number;
      bins: string[];
      job?: ActiveJob | null;
    }[];
    total_km: number;
  };
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

// ---- Phase 4: the public map and pickup jobs

export interface MapBin {
  stream_key: string;
  stream_name: string;
  capacity_kg: number;
  /** The sum of weighed drop-offs since the bin was last emptied */
  fill_kg: number;
  /** fill_kg scaled by the correction (the same without one). Phase 6 fields are optional: an older API has none */
  est_fill_kg?: number;
  fill_ratio: number;
  correction?: Correction | null;
  due_because?: "forecast" | "reports" | null;
  reports?: BinReports | null;
  rate_kg_per_day: number;
  full_on: string | null;
  status: BinStatus;
  last_deposit_at: string | null;
  emptied_at: string | null;
}

export interface MapPoint {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  is_demo: boolean;
  status: BinStatus;
  bins: MapBin[];
}

export interface DropOffMap {
  generated_at: string;
  points: MapPoint[];
}

export type JobStatus = "open" | "taken" | "done" | "cancelled";

export interface JobItem {
  id: number;
  container_id: number;
  stream_key: string;
  stream_name: string;
  capacity_kg: number;
  /** The board's fill when the job was offered */
  expected_kg: number;
  state: "to_do" | "collected" | "skipped";
  /** What the truck's scale said */
  collected_kg: number | null;
  /** What the weighed drop-offs added up to when it was collected */
  weighed_in_kg: number | null;
  pickup_id: number | null;
  has_photo: boolean;
  skipped_reason: string | null;
  finished_at: string | null;
}

export interface Job {
  id: number;
  status: JobStatus;
  point: { id: number; name: string; address: string; lat: number; lng: number; is_demo: boolean };
  created_at: string;
  taken_at: string | null;
  finished_at: string | null;
  collector: { id: number; name: string } | null;
  items: JobItem[];
}

export interface CollectorJobs {
  open: Job[];
  mine: Job[];
  done: Job[];
}

// ---- Phase 6b: home pickups

export type HomeStatus = "requested" | "taken" | "done" | "missed" | "cancelled";
export type Slot = "morning" | "afternoon" | "evening";

export interface HomePickup {
  id: number;
  status: HomeStatus;
  streams: string[];
  rough_kg: number;
  day: string;
  slot: Slot;
  created_at: string;
  taken_at: string | null;
  finished_at: string | null;
  collector: { id: number; name: string } | null;
  missed_reason: string | null;
  /** What the collector weighed at the door */
  weighed: { stream_key: string; weight_g: number }[];
  points: number | null;
  /** The position rounded to about a kilometre: all a collector sees before taking it */
  area: [number, number];
  // Only for the resident, admins and the collector who took it
  address?: string;
  lat?: number;
  lng?: number;
  note?: string;
  resident?: { name: string };
  has_photo?: boolean;
}

export interface CollectorHomePickups {
  open: HomePickup[];
  mine: HomePickup[];
  done: HomePickup[];
}

