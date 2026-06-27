import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

export function daysUntil(due: Date | null): number | null {
  if (!due) return null;
  const ms = due.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
