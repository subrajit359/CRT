/**
 * One date helper for the whole app — keeps "5m ago" / "yesterday" /
 * "Mar 14" formatting consistent across pages.
 */

export function relativeTime(input, { compact = false, fallback = "—" } = {}) {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return fallback;
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  let out;
  if (sec < 45) out = compact ? `${sec}s` : "just now";
  else if (min < 60) out = compact ? `${min}m` : `${min} min${min === 1 ? "" : "s"}`;
  else if (hr < 24) out = compact ? `${hr}h` : `${hr} hour${hr === 1 ? "" : "s"}`;
  else if (day < 7) out = compact ? `${day}d` : `${day} day${day === 1 ? "" : "s"}`;
  else if (day < 30) {
    const w = Math.round(day / 7);
    out = compact ? `${w}w` : `${w} week${w === 1 ? "" : "s"}`;
  } else if (day < 365) {
    const mo = Math.round(day / 30);
    out = compact ? `${mo}mo` : `${mo} month${mo === 1 ? "" : "s"}`;
  } else {
    const y = Math.round(day / 365);
    out = compact ? `${y}y` : `${y} year${y === 1 ? "" : "s"}`;
  }
  if (sec < 45 && !compact) return out;
  return future ? `in ${out}` : compact ? `${out} ago` : `${out} ago`;
}

export function shortDate(input, fallback = "—") {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return fallback;
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function dateTime(input, fallback = "—") {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(input, fallback = "") {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return fallback;
  const today = new Date();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

/** Friendly absolute timestamp suitable for tooltips. */
export function absolute(input, fallback = "") {
  if (!input) return fallback;
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleString();
}
