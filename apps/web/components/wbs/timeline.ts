/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Day arithmetic on ISO dates. Everything is done in UTC day numbers, so time zones and DST never shift a bar.

export const DAY_MS = 86_400_000;
export const toDay = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const fromDay = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
};
export const monthLabel = (day: number): string => {
  const d = new Date(day * DAY_MS);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const dayOfMonth = (day: number): number => new Date(day * DAY_MS).getUTCDate();
export const monthKey = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 7);

// 1970-01-01 was a Thursday, so (day + 3) % 7 is 0 on Mondays.
export const mondayOnOrBefore = (day: number): number => day - ((day + 3) % 7);

export const DAY_PX = 6; // 42 px per week
export const WEEK_PX = DAY_PX * 7;

export type TTimeline = { origin: number; weeks: number; width: number };

export function buildTimeline(days: number[], today: number): TTimeline {
  const all = [...days, today];
  const origin = mondayOnOrBefore(Math.min(...all) - 7);
  const last = Math.max(...all) + 21;
  const weeks = Math.max(16, Math.ceil((last - origin + 1) / 7));
  return { origin, weeks, width: weeks * WEEK_PX };
}

export const xOf = (tl: TTimeline, day: number): number => (day - tl.origin) * DAY_PX;
