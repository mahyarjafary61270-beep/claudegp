/** Date/time formatting with optional Jalali calendar (fa-IR) — Intl native, no deps. */

const jw = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
const jdt = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });
const jdtt = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const jdty = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const ew = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const edt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const edtt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const edty = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function formatTime(iso: string, jalali = true): string {
  const d = new Date(iso);
  return jalali ? jw.format(d) : ew.format(d);
}

export function formatDay(iso: string, jalali = true): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return jalali ? 'امروز' : 'Today';
  if (d.toDateString() === yesterday.toDateString()) return jalali ? 'دیروز' : 'Yesterday';
  return jalali ? jdt.format(d) : edt.format(d);
}

export function formatFull(iso: string, jalali = true): string {
  const d = new Date(iso);
  const years = new Date().getFullYear() - d.getFullYear();
  return (jalali ? (years > 0 ? jdty : jdtt) : years > 0 ? edty : edtt).format(d);
}

export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}
