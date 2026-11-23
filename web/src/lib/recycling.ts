/**
 * What a household in Malaysia does with each item the model knows.
 *
 * The class -> bin mapping itself comes from the model's meta.json (served by /api/model); this file
 * only adds how to show each bin and practical preparation tips. Bin colours follow the national
 * 3-colour recycling bins: blue = paper, brown = glass, orange = plastic and metal (aluminium) cans.
 */
import {
  Apple,
  Battery,
  CupSoda,
  Footprints,
  Leaf,
  type LucideIcon,
  Milk,
  Newspaper,
  Package,
  Recycle,
  Shirt,
  Trash2,
  Wine,
  Zap,
} from "lucide-react";

export interface BinInfo {
  title: string;
  /** What goes in it, in a few words */
  holds: string;
  /** Where to take it */
  where: string;
  color: string; // solid colour (badges, icons)
  tint: string; // light background
  icon: LucideIcon;
}

export const BINS: Record<string, BinInfo> = {
  "blue bin": {
    title: "Blue bin",
    holds: "Paper & cardboard",
    where: "Blue recycling bin, or a recycling buy-back centre.",
    color: "var(--color-bin-blue)",
    tint: "#e6eefa",
    icon: Newspaper,
  },
  "brown bin": {
    title: "Brown bin",
    holds: "Glass bottles & jars",
    where: "Brown recycling bin, or a recycling buy-back centre.",
    color: "var(--color-bin-brown)",
    tint: "#f3ebe2",
    icon: Wine,
  },
  "orange bin": {
    title: "Orange bin",
    holds: "Plastic, aluminium & metal cans",
    where: "Orange recycling bin, or a recycling buy-back centre.",
    color: "var(--color-bin-orange)",
    tint: "#fcefe3",
    icon: CupSoda,
  },
  "e-waste collection": {
    title: "E-waste collection",
    holds: "Batteries & electronics",
    where: "An e-waste collection point (many malls, councils and electronics shops have one). Never a household bin.",
    color: "var(--color-bin-ewaste)",
    tint: "#f8e6ed",
    icon: Zap,
  },
  "textile donation": {
    title: "Textile donation",
    holds: "Clothes, shoes & fabric",
    where: "A clothes donation bin, charity shop or textile recycling bin.",
    color: "var(--color-bin-textile)",
    tint: "#e2f2f2",
    icon: Shirt,
  },
  "food waste": {
    title: "Food waste",
    holds: "Food scraps & garden waste",
    where: "Home or community compost if you have one; otherwise wrap it and put it in general waste.",
    color: "var(--color-bin-food)",
    tint: "#ebf2e2",
    icon: Leaf,
  },
  "general waste": {
    title: "General waste",
    holds: "Not recyclable as it is",
    where: "Your normal household rubbish bin.",
    color: "var(--color-bin-general)",
    tint: "#eceef1",
    icon: Trash2,
  },
};

export const UNKNOWN_BIN: BinInfo = {
  title: "Check locally",
  holds: "Not sure where this goes",
  where: "Ask your local recycling centre or council.",
  color: "var(--color-ink-soft)",
  tint: "#eeebe3",
  icon: Recycle,
};

export function binInfo(bin: string | null | undefined): BinInfo {
  return (bin && BINS[bin]) || UNKNOWN_BIN;
}

export interface ClassInfo {
  name: string;
  icon: LucideIcon;
  /** How to prepare the item before it goes in the bin */
  tips: string[];
  /** The default bin, used only if the model's meta.json is not available */
  bin: string;
  /** Extra words people might search for in the bin guide */
  keywords?: string;
}

export const CLASSES: Record<string, ClassInfo> = {
  paper: {
    name: "Paper",
    icon: Newspaper,
    keywords: "newspaper magazine office paper envelope flyer book receipt",
    bin: "blue bin",
    tips: ["Keep it clean and dry.", "Tissues, greasy or waxed paper go in general waste."],
  },
  cardboard: {
    name: "Cardboard",
    icon: Package,
    keywords: "box carton parcel packaging egg tray",
    bin: "blue bin",
    tips: ["Flatten boxes to save space.", "Pizza boxes with grease or food go in general waste."],
  },
  "brown-glass": {
    name: "Brown glass",
    icon: Wine,
    keywords: "beer bottle sauce bottle jar",
    bin: "brown bin",
    tips: ["Empty and rinse.", "Take off metal caps and lids.", "No mirrors, window glass, ceramics or bulbs."],
  },
  "green-glass": {
    name: "Green glass",
    icon: Wine,
    keywords: "wine bottle beer bottle jar",
    bin: "brown bin",
    tips: ["Empty and rinse.", "Take off metal caps and lids.", "No mirrors, window glass, ceramics or bulbs."],
  },
  "white-glass": {
    name: "Clear glass",
    icon: Wine,
    keywords: "jar bottle clear glass jam",
    bin: "brown bin",
    tips: ["Empty and rinse.", "Take off metal caps and lids.", "No mirrors, window glass, ceramics or bulbs."],
  },
  plastic: {
    name: "Plastic",
    icon: Milk,
    keywords: "bottle container pet hdpe shampoo detergent cup tub",
    bin: "orange bin",
    tips: [
      "Empty and rinse; food residue spoils a whole batch.",
      "Squash bottles to save space.",
      "Plastic bags and film are often not accepted; ask your centre.",
    ],
  },
  metal: {
    name: "Metal",
    icon: CupSoda,
    keywords: "can tin aluminium drink can food can foil",
    bin: "orange bin",
    tips: ["Rinse cans.", "Squash aluminium cans.", "Aerosol cans must be completely empty."],
  },
  battery: {
    name: "Battery",
    icon: Battery,
    keywords: "aa aaa lithium phone battery power bank button cell",
    bin: "e-waste collection",
    tips: [
      "Never put batteries in a household bin: they can start fires in collection trucks.",
      "Tape over the ends of lithium batteries.",
    ],
  },
  clothes: {
    name: "Clothes",
    icon: Shirt,
    keywords: "shirt pants dress fabric towel textile",
    bin: "textile donation",
    tips: ["Wash and dry first.", "Torn clothes can still go to textile recycling."],
  },
  shoes: {
    name: "Shoes",
    icon: Footprints,
    keywords: "sneaker slipper sandal boot",
    bin: "textile donation",
    tips: ["Keep pairs together (tie the laces).", "Clean and dry."],
  },
  biological: {
    name: "Food & organic",
    icon: Apple,
    keywords: "food fruit peel vegetable leaves compost leftover",
    bin: "food waste",
    tips: ["Compost fruit and vegetable scraps if you can.", "Keep food out of recycling bins."],
  },
  trash: {
    name: "General trash",
    icon: Trash2,
    keywords: "tissue styrofoam diaper wrapper chip packet dirty",
    bin: "general waste",
    tips: ["Dirty or mixed-material items cannot be recycled.", "If part of it is clean, separate that part."],
  },
};

export function classInfo(name: string): ClassInfo {
  return (
    CLASSES[name] ?? {
      name: name.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      icon: Recycle,
      bin: "general waste",
      tips: [],
    }
  );
}

export const OTHER_LABEL = "other";
