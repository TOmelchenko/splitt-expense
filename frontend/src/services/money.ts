import { ServiceError } from "./types";

/**
 * Largest remainder method in integer cents, stable by participant list order,
 * so the shares always sum back to the exact expense total.
 */
export function splitEqually(amountCents: number, memberCount: number): number[] {
  if (memberCount <= 0) throw new ServiceError("A group needs at least one participant.");
  const base = Math.floor(amountCents / memberCount);
  let leftover = amountCents - base * memberCount;
  return Array.from({ length: memberCount }, () => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return base + extra;
  });
}

/** "25.50" -> 2550. Rejects €0, negatives and >2 decimals. */
export function parseAmountToCents(raw: string): number {
  const value = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new ServiceError("Enter an amount in euros with at most 2 decimals, e.g. 25.50.");
  }
  const cents = Math.round(parseFloat(value) * 100);
  if (cents <= 0) throw new ServiceError("The amount must be greater than €0.00.");
  return cents;
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEur(cents: number): string {
  return eur.format(cents / 100);
}

export function formatSigned(cents: number): string {
  const sign = cents > 0 ? "+ " : cents < 0 ? "− " : "± ";
  return sign + eur.format(Math.abs(cents) / 100);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
