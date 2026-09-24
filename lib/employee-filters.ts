export type DatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom" | "all";

export interface DateRange {
  start: string | null;
  end: string | null;
}

export function getPresetRange(preset: DatePreset): DateRange {
  if (preset === "all") return { start: null, end: null };

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (preset === "today") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: todayStart.toISOString(), end: end.toISOString() };
  }

  if (preset === "yesterday") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 1);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === "this_week") {
    const day = todayStart.getDay();
    const start = new Date(todayStart);
    start.setDate(start.getDate() - day);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  return { start: null, end: null };
}

export function applyDateFilter<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  range: DateRange,
  column: string
): T {
  let q = query;
  if (range.start) q = q.gte(column, range.start);
  if (range.end) q = q.lte(column, range.end);
  return q;
}

export const PLATFORM_CONFIG = [
  { name: "Uber", statuses: ["RINGING", "FRESH", "EXISTING", "OTHER_HERO", "ID_DONE", "NOT_INTERESTED", "DOC_ISSUE", "VEHICLE_ISSUE", "ID_BLOCK", "CALLBACK", "INTERESTED"] },
  { name: "Rapido", statuses: ["RINGING", "FRESH", "EXISTING", "OTHER_NUMBER", "ID_DONE", "NOT_INTERESTED", "CALLBACK", "INTERESTED"] },
  { name: "Ola", statuses: ["RINGING", "FRESH", "EXISTING", "PAYMENT_ISSUE", "NOT_INTERESTED", "CALLBACK", "INTERESTED"] },
];

export const PLATFORM_STATUS_MAP: Record<string, string[]> = {
  Uber: PLATFORM_CONFIG[0].statuses,
  Rapido: PLATFORM_CONFIG[1].statuses,
  Ola: PLATFORM_CONFIG[2].statuses,
};

export const PLATFORM_STATUS_LABELS: Record<string, string> = {
  RINGING: "Ringing",
  FRESH: "Fresh",
  EXISTING: "Existing",
  PAYMENT_ISSUE: "Payment Issue",
  NOT_INTERESTED: "Not Interested",
  OTHER_NUMBER: "Other Number",
  ID_DONE: "ID Done",
  INTERESTED: "Interested",
  CALLBACK: "Callback",
  NEW: "New",
  ID_BLOCK: "ID Block",
  DOC_ISSUE: "Doc Issue",
  VEHICLE_ISSUE: "Vehicle Issue",
  OTHER_ISSUE: "Other Issue",
  OTHER_HERO: "Other Hero",
  ADMIN_REVIEW: "Admin Review",
  TAG_ADDED: "Tag Added",
  PENDING: "Pending",
};

export function getStatusesForPlatform(platform: string | null): string[] | null {
  if (!platform) return null;
  const key = Object.keys(PLATFORM_STATUS_MAP).find(
    (k) => k.toLowerCase() === platform.toLowerCase()
  );
  return key ? PLATFORM_STATUS_MAP[key] : null;
}

export function mapPlatformStatusToLeadStatus(platformStatus: string): string {
  const direct: string[] = [
    "RINGING", "ID_DONE", "ID_BLOCK", "DOC_ISSUE", "VEHICLE_ISSUE",
    "OTHER_HERO", "NOT_INTERESTED", "INTERESTED", "CALLBACK", "TAG_ADDED",
    "ADMIN_REVIEW", "NEW", "OTHER_ISSUE",
  ];
  if (direct.includes(platformStatus)) return platformStatus;
  if (platformStatus === "FRESH") return "NEW";
  if (platformStatus === "EXISTING") return "RINGING";
  if (platformStatus === "OTHER_NUMBER" || platformStatus === "PAYMENT_ISSUE") return "OTHER_ISSUE";
  if (platformStatus === "DONE") return "ID_DONE";
  return platformStatus;
}
