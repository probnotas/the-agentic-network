/** Safe JSON parse; returns null on failure */
export function tryParseJsonString(raw: string): unknown {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

export type ExperienceEntry = {
  role: string;
  company: string;
  start: string;
  end: string;
  description: string;
  /** Free-text range when start/end are empty (legacy `period` / `date`) */
  period?: string;
};

function normalizeExperience(x: Record<string, unknown>): ExperienceEntry {
  const role = String(x.role ?? x.title ?? "").trim();
  const company = String(x.company ?? "").trim();
  const start = String(x.start ?? "").trim();
  const end = String(x.end ?? "").trim();
  const periodField = String(x.period ?? "").trim();
  const dateVal = String(x.date ?? "").trim();
  const description = String(x.description ?? "").trim();
  const periodDisplay =
    periodField || (!start && !end && dateVal ? dateVal : "");
  const base: ExperienceEntry = { role, company, start, end, description };
  if (periodDisplay) base.period = periodDisplay;
  return base;
}

/** Parse profiles.experience jsonb / string / array */
export function parseProfileExperience(raw: unknown): ExperienceEntry[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const p = tryParseJsonString(raw);
    if (Array.isArray(p)) return p.map((x) => normalizeExperience((x ?? {}) as Record<string, unknown>));
    if (p && typeof p === "object" && !Array.isArray(p))
      return [normalizeExperience(p as Record<string, unknown>)];
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((x) =>
      typeof x === "object" && x !== null ? normalizeExperience(x as Record<string, unknown>) : normalizeExperience({})
    );
  }
  if (typeof raw === "object") return [normalizeExperience(raw as Record<string, unknown>)];
  return [];
}

export type AwardEntry = {
  name: string;
  issuer: string;
  date: string;
  description: string;
};

function normalizeAward(x: Record<string, unknown>): AwardEntry {
  return {
    name: String(x.name ?? x.title ?? "Award").trim(),
    issuer: String(x.issuer ?? x.issued_by ?? "").trim(),
    date: String(x.date ?? "").trim(),
    description: String(x.description ?? "").trim(),
  };
}

/**
 * Parse awards: jsonb array, text[] of JSON strings, or legacy plain strings.
 */
export function parseProfileAwards(raw: unknown): AwardEntry[] {
  if (raw == null) return [];

  if (typeof raw === "string") {
    const p = tryParseJsonString(raw);
    if (Array.isArray(p)) return p.map((x) => normalizeAward((x ?? {}) as Record<string, unknown>));
    if (p && typeof p === "object" && !Array.isArray(p)) return [normalizeAward(p as Record<string, unknown>)];
    return [];
  }

  if (Array.isArray(raw)) {
    const out: AwardEntry[] = [];
    for (const item of raw) {
      if (item == null) continue;
      if (typeof item === "string") {
        const s = item.trim();
        if (!s) continue;
        if (s.startsWith("{") || s.startsWith("[")) {
          const parsed = tryParseJsonString(s);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            out.push(normalizeAward(parsed as Record<string, unknown>));
            continue;
          }
          if (Array.isArray(parsed)) {
            for (const el of parsed) {
              if (el && typeof el === "object") out.push(normalizeAward(el as Record<string, unknown>));
            }
            continue;
          }
        }
        out.push({ name: s, issuer: "", date: "", description: "" });
        continue;
      }
      if (typeof item === "object") out.push(normalizeAward(item as Record<string, unknown>));
    }
    return out;
  }

  return [];
}

/** Parse skills: string[], json string array, or comma-separated string */
export function parseProfileSkills(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    const p = tryParseJsonString(t);
    if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
    return t.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

/** Parse agent_voice jsonb */
export function parseAgentVoice(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const p = tryParseJsonString(raw);
    if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** Format nested jsonb values as readable text (not a single JSON blob). */
export function formatAgentVoiceValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    return val
      .map((x, i) => {
        const line = formatAgentVoiceValue(x);
        return line.includes("\n") ? `${i + 1}.\n${line.split("\n").map((l) => `  ${l}`).join("\n")}` : `${i + 1}. ${line}`;
      })
      .join("\n");
  }
  if (typeof val === "object") {
    return Object.entries(val as Record<string, unknown>)
      .map(([k, v]) => {
        const sub = formatAgentVoiceValue(v);
        const label = k.replace(/_/g, " ");
        return sub.includes("\n") ? `${label}:\n${sub.split("\n").map((l) => `  ${l}`).join("\n")}` : `${label}: ${sub}`;
      })
      .join("\n");
  }
  return String(val);
}

/** Human-readable rows for agent voice (no raw JSON blobs) */
export function formatAgentVoiceRows(v: Record<string, unknown> | null): { key: string; text: string }[] {
  if (!v) return [];
  return Object.entries(v).map(([k, val]) => ({
    key: k,
    text: formatAgentVoiceValue(val),
  }));
}

export function experienceDateRange(e: ExperienceEntry): string {
  if (e.start && e.end) return `${e.start} – ${e.end}`;
  if (e.start) return `${e.start} – Present`;
  if (e.end) return e.end;
  if (e.period) return e.period;
  return "";
}
