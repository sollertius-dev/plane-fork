/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.6V8l2.2 1.4" />
    </svg>
  );
}

// "Effort (hours)" of a work item: the hours the work really took, whatever the days between start and due date.
export function IssueEffortHoursField({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (hours: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value]);

  const commit = () => {
    const next = draft.trim() === "" ? null : Number(draft);
    if (next !== null && (!Number.isFinite(next) || next < 0)) return setDraft(value === null ? "" : String(value));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex h-8 items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={0.5}
        value={draft}
        disabled={disabled}
        placeholder="None"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-8 w-24 rounded-sm border border-transparent bg-transparent px-2 text-body-xs-regular text-primary outline-none placeholder:text-tertiary hover:bg-layer-transparent-hover focus:border-accent-strong disabled:cursor-default disabled:hover:bg-transparent"
        aria-label="Effort in hours"
      />
      {draft !== "" ? <span className="text-body-xs-regular text-tertiary">h</span> : null}
    </div>
  );
}
