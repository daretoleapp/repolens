import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export function riskBand(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "High", color: "bg-red-500/20 text-red-400 border-red-500/40" };
  if (score >= 50) return { label: "Medium", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
  if (score >= 25) return { label: "Low", color: "bg-blue-500/20 text-blue-400 border-blue-500/40" };
  return { label: "Minimal", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
}
