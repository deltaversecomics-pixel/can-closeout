import Dexie, { Table } from "dexie";

export type PaymentType = "cash" | "card" | "account";
export type PricingType = "metered" | "flat";
export type BoardAdjType = "none" | "credit" | "short";

export type Session = {
  id: string;
  createdAt: number;
  closedAt: number | null;
  title: string;
};

export type Entry = {
  id: string;
  sessionId: string;
  createdAt: number;

  paymentType: PaymentType;
  pricingType: PricingType;

  // For card: fareCents is fare only, tipCents is tip only, totalCents = fare + tip.
  // For cash/account: fareCents is the entered amount, tipCents = 0, totalCents = fareCents.
  fareCents: number;
  tipCents: number;
  totalCents: number;

  note?: string;
  trashedAt: number | null;
};

export type Closeout = {
  sessionId: string;
  gasPaidCents: number;
  boardAdjType: BoardAdjType;
  boardAdjCents: number;
  updatedAt: number;
};

class CabDB extends Dexie {
  sessions!: Table<Session, string>;
  entries!: Table<Entry, string>;
  closeouts!: Table<Closeout, string>;

  constructor() {
    super("cab_closeout_db");
    this.version(1).stores({
      sessions: "id, createdAt, closedAt",
      entries: "id, sessionId, createdAt, trashedAt, paymentType",
      closeouts: "sessionId"
    });
  }
}

export const db = new CabDB();

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function dollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(/^\$/, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;

  const [d, cRaw] = cleaned.split(".");
  const cents = (cRaw ?? "").padEnd(2, "0").slice(0, 2);
  const total = Number(d) * 100 + Number(cents);
  return Number.isFinite(total) ? total : null;
}

export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, "0");
  return `${sign}$${d}.${c}`;
}

export function roundToWholeDollars(cents: number): number {
  // Normal rounding to whole dollars: .50 and up goes up
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const roundedDollars = rem >= 50 ? dollars + 1 : dollars;
  return sign * roundedDollars * 100;
}
