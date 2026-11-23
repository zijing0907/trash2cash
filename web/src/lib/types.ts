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
