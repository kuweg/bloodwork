/**
 * Group blood tests into clinical panels (Lipids, Liver, Kidney, …) by matching
 * keywords against the canonical slug + display name. Canonical names come from
 * the LLM and vary, so matching is keyword/word-boundary based and anything that
 * doesn't match falls into "Other".
 */

interface Panel {
  name: string;
  keywords: string[];
}

// Ordered — first matching panel wins, so put more specific panels before
// broader ones where keywords could overlap.
const PANELS: Panel[] = [
  {
    name: "Lipids",
    keywords: [
      "cholesterol", "ldl", "hdl", "triglyceride", "triglycerides",
      "lipid", "vldl", "apob", "apo b", "lipoprotein",
    ],
  },
  {
    name: "Glucose & Diabetes",
    keywords: ["glucose", "hba1c", "a1c", "glycated", "glycohemoglobin", "insulin", "c peptide", "fructosamine"],
  },
  {
    name: "Liver",
    keywords: [
      "alt", "ast", "ggt", "alp", "alkaline phosphatase", "bilirubin",
      "albumin", "total protein", "sgpt", "sgot", "alanine aminotransferase",
      "aspartate aminotransferase", "transaminase",
    ],
  },
  {
    name: "Kidney",
    keywords: ["creatinine", "urea", "bun", "egfr", "gfr", "uric acid", "cystatin", "blood urea nitrogen"],
  },
  {
    name: "Electrolytes",
    keywords: ["sodium", "potassium", "chloride", "calcium", "magnesium", "phosphate", "phosphorus", "bicarbonate", "natrium", "kalium"],
  },
  {
    name: "Blood Count (CBC)",
    keywords: [
      "hemoglobin", "haemoglobin", "hematocrit", "haematocrit", "rbc", "wbc",
      "leukocyte", "leucocyte", "erythrocyte", "platelet", "thrombocyte",
      "mcv", "mch", "mchc", "rdw", "neutrophil", "lymphocyte", "monocyte",
      "eosinophil", "basophil", "hgb", "hct",
    ],
  },
  {
    name: "Thyroid",
    keywords: ["tsh", "thyroid", "t3", "t4", "ft3", "ft4", "thyroxine", "triiodothyronine"],
  },
  {
    name: "Iron",
    keywords: ["iron", "ferritin", "transferrin", "tibc", "saturation", "sideremia"],
  },
  {
    name: "Vitamins",
    keywords: ["vitamin", "b12", "cobalamin", "folate", "folic", "vit d", "25 oh", "calciferol"],
  },
  {
    name: "Inflammation",
    keywords: ["crp", "c reactive", "esr", "sedimentation", "procalcitonin", "fibrinogen"],
  },
  {
    name: "Hormones",
    keywords: ["testosterone", "estradiol", "cortisol", "prolactin", "lh", "fsh", "progesterone", "dhea"],
  },
  {
    name: "Cardiac",
    keywords: ["troponin", "bnp", "nt pro", "ck mb", "ckmb"],
  },
  {
    name: "Coagulation",
    keywords: ["inr", "aptt", "ptt", "prothrombin", "d dimer"],
  },
];

const OTHER_PANEL = "Other";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED = PANELS.map((p) => ({
  name: p.name,
  res: p.keywords.map((k) => new RegExp(`\\b${escapeRe(k)}\\b`)),
}));

function normalize(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

/** Return the panel name for a test, or "Other" if nothing matches. */
export function panelFor(canonical: string, displayName?: string): string {
  const text = normalize(canonical, displayName);
  for (const p of COMPILED) {
    if (p.res.some((re) => re.test(text))) return p.name;
  }
  return OTHER_PANEL;
}

/**
 * Group items by panel, preserving panel order (Other last) and the incoming
 * order of items within each panel. Empty panels are omitted.
 */
export function groupByPanel<T>(
  items: T[],
  key: (item: T) => { canonical: string; name?: string },
): { panel: string; items: T[] }[] {
  const order = [...PANELS.map((p) => p.name), OTHER_PANEL];
  const map = new Map<string, T[]>();
  for (const item of items) {
    const { canonical, name } = key(item);
    const panel = panelFor(canonical, name);
    const arr = map.get(panel);
    if (arr) arr.push(item);
    else map.set(panel, [item]);
  }
  return order
    .filter((p) => map.has(p))
    .map((p) => ({ panel: p, items: map.get(p) as T[] }));
}
