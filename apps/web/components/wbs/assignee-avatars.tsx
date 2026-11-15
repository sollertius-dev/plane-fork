/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { TWbsPerson } from "./types";

const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
const colorOf = (id: string) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length];
const initials = (name: string) => {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
};

function Avatar({ person }: { person: TWbsPerson }) {
  const [broken, setBroken] = useState(false);
  const size = "size-6 flex-shrink-0 rounded-full border-2 border-surface-1";
  if (person.avatar && !broken) {
    return <img src={person.avatar} alt={person.name} title={person.name} onError={() => setBroken(true)} className={`${size} object-cover`} />;
  }
  return (
    <span title={person.name} className={`${size} flex items-center justify-center text-[9px] font-semibold text-white`} style={{ background: colorOf(person.id) }}>
      {initials(person.name)}
    </span>
  );
}

// Overlapping avatars; the names are in the tooltip. More than three collapse into +N.
export function AssigneeAvatars({ people, max = 3 }: { people: TWbsPerson[]; max?: number }) {
  if (people.length === 0) return <span className="px-1.5 text-[13px] text-tertiary">—</span>;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center pl-1.5" title={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => (
        <span key={p.id} className={i ? "-ml-1.5" : ""}><Avatar person={p} /></span>
      ))}
      {rest > 0 ? (
        <span className="-ml-1.5 flex size-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-surface-1 bg-layer-3 text-[9px] font-semibold text-secondary">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
