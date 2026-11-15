/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Working calendar helpers. Weekdays are numbered like the API does: Monday is 0, Sunday is 6.
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

// "Mon–Fri", "Mon–Sat", "Mon, Wed, Fri": runs of three or more days are shortened.
export function weekLabel(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 0) return "no working days";
  if (d.length === 7) return "every day";
  const parts: string[] = [];
  for (let i = 0; i < d.length; ) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_NAMES[d[i]]}–${DAY_NAMES[d[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_NAMES[d[k]]);
    i = j + 1;
  }
  return parts.join(", ");
}
