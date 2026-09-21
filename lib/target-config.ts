import type { Product } from "@/lib/types";

export interface TargetTypeConfig {
  key: string;
  label: string;
  metric: "lead_count" | "id_done_count" | "payment_amount";
  platformFilter?: string | null;
  cityFilter?: string | null;
  idDoneField?: "uber_id_done" | "ola_id_done" | "rapido_id_done" | null;
  description: string;
}

export interface ProductTargetConfig {
  targetTypes: TargetTypeConfig[];
}

export const TARGET_METRIC_LABELS: Record<TargetTypeConfig["metric"], string> = {
  lead_count: "Leads Created",
  id_done_count: "ID Done Count",
  payment_amount: "Collection Amount",
};

const CAR_TARGET_TYPES: TargetTypeConfig[] = [
  {
    key: "ULP_MUMBAI",
    label: "ULP Mumbai",
    metric: "id_done_count",
    cityFilter: "Mumbai",
    idDoneField: "uber_id_done",
    description: "Uber ID Done leads in Mumbai",
  },
  {
    key: "ULP_PUNE",
    label: "ULP Pune",
    metric: "id_done_count",
    cityFilter: "Pune",
    idDoneField: "uber_id_done",
    description: "Uber ID Done leads in Pune",
  },
  {
    key: "OLA_MUMBAI",
    label: "Ola Mumbai",
    metric: "id_done_count",
    cityFilter: "Mumbai",
    idDoneField: "ola_id_done",
    description: "Ola ID Done leads in Mumbai",
  },
  {
    key: "OLA_PUNE",
    label: "Ola Pune",
    metric: "id_done_count",
    cityFilter: "Pune",
    idDoneField: "ola_id_done",
    description: "Ola ID Done leads in Pune",
  },
  {
    key: "RAPIDO",
    label: "Rapido",
    metric: "id_done_count",
    platformFilter: "Rapido",
    idDoneField: "rapido_id_done",
    description: "Rapido ID Done leads",
  },
  {
    key: "OLA_COLLECTION",
    label: "Ola Collection",
    metric: "payment_amount",
    platformFilter: "Ola",
    description: "Payment collection amount from Ola leads",
  },
  {
    key: "FT",
    label: "FT",
    metric: "lead_count",
    description: "Total leads created (Full Target)",
  },
];

const BIKE_TARGET_TYPES: TargetTypeConfig[] = [
  {
    key: "ULP",
    label: "ULP",
    metric: "id_done_count",
    idDoneField: "uber_id_done",
    description: "Uber ID Done leads",
  },
  {
    key: "FT",
    label: "FT",
    metric: "lead_count",
    description: "Total leads created (Full Target)",
  },
];

const TEMPO_TARGET_TYPES: TargetTypeConfig[] = [
  {
    key: "ULP",
    label: "ULP",
    metric: "id_done_count",
    idDoneField: "uber_id_done",
    description: "Uber ID Done leads",
  },
  {
    key: "FT",
    label: "FT",
    metric: "lead_count",
    description: "Total leads created (Full Target)",
  },
];

const AUTO_TARGET_TYPES: TargetTypeConfig[] = [
  {
    key: "ULP",
    label: "ULP",
    metric: "id_done_count",
    idDoneField: "uber_id_done",
    description: "Uber ID Done leads",
  },
  {
    key: "RAPIDO",
    label: "Rapido",
    metric: "id_done_count",
    platformFilter: "Rapido",
    idDoneField: "rapido_id_done",
    description: "Rapido ID Done leads",
  },
  {
    key: "FT",
    label: "FT",
    metric: "lead_count",
    description: "Total leads created (Full Target)",
  },
];

export function classifyProductCode(code: string, name: string) {
  const c = code.toUpperCase();
  const n = name.toLowerCase().trim();
  return {
    isCar: c === "CAR" || c === "MAINC001" || c === "C001" || n === "car" || n.startsWith("car"),
    isAuto: c === "AUTO" || c === "MAINA001" || c === "A001" || c === "P002" || n.startsWith("auto"),
    isBike: c === "BIKE" || c === "MAINB001" || c === "B001" || c === "B002" || n.startsWith("bike"),
    isTempo: c === "TEMPO" || c === "MAINT001" || c === "T001" || n.startsWith("tempo"),
    isHC: c === "HC" || c === "H001" || n === "hc" || n.startsWith("hc"),
  };
}

export function getTargetTypesForProduct(product: Product): TargetTypeConfig[] {
  const { isCar, isBike, isTempo, isAuto } = classifyProductCode(product.code, product.name);
  if (isCar) return CAR_TARGET_TYPES;
  if (isBike) return BIKE_TARGET_TYPES;
  if (isTempo) return TEMPO_TARGET_TYPES;
  if (isAuto) return AUTO_TARGET_TYPES;
  return [];
}

export function shouldShowTargetTab(product: Product): boolean {
  const { isCar, isBike, isTempo, isAuto } = classifyProductCode(product.code, product.name);
  return isCar || isBike || isTempo || isAuto;
}

export function getTargetTypeConfig(product: Product, targetType: string): TargetTypeConfig | undefined {
  return getTargetTypesForProduct(product).find((t) => t.key === targetType);
}

export const PERIOD_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  CUSTOM: "Custom",
};

export function getTargetDateRange(
  startDate: string,
  endDate: string,
  periodType: string
): { start: string; end: string } {
  if (periodType === "DAILY") {
    return { start: startDate + "T00:00:00", end: startDate + "T23:59:59" };
  }
  return { start: startDate + "T00:00:00", end: endDate + "T23:59:59" };
}

export function computeDefaultDates(periodType: string): { start: string; end: string } {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  if (periodType === "DAILY") {
    return { start: todayStr, end: todayStr };
  }
  if (periodType === "WEEKLY") {
    const day = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - day);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return {
      start: `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`,
      end: `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`,
    };
  }
  if (periodType === "MONTHLY") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(monthStart.getDate()).padStart(2, "0")}`,
      end: `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`,
    };
  }
  return { start: todayStr, end: todayStr };
}
