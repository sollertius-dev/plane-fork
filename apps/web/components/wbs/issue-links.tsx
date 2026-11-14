/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { wbsApi } from "./api";
import type { TWbsIssue } from "./types";

type Hit = { id: string; ref: string; name: string; status: string | null };

type Props = {
  slug: string;
  issues: TWbsIssue[];
  canWrite: boolean;
  onAdd: (issueId: string) => void;
  onRemove: (issueId: string) => void;
};

// Work items linked to one WBS row: a counter on the row, and a popover to see, add and remove them.
export function IssueLinks({ slug, issues, canWrite, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !canWrite) return;
    const timer = setTimeout(() => {
      wbsApi
        .searchIssues(slug, q)
        .then(setHits)
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, q, slug, canWrite]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const linked = new Set(issues.map((i) => i.id));
  const first = issues[0];
  if (issues.length === 0 && !canWrite) return null;

  return (
    <div ref={box} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={issues.length ? issues.map((i) => `${i.ref} ${i.name}`).join("\n") : "Link work items"}
        className={
          issues.length
            ? "flex items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-[11px] font-medium text-secondary hover:text-primary"
            : "rounded-sm px-1 text-[11px] text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary"
        }
      >
        {issues.length ? (
          <>
            {first.ref}
            {issues.length > 1 ? <span className="text-tertiary">+{issues.length - 1}</span> : null}
          </>
        ) : (
          "🔗 Link"
        )}
      </button>
      {open ? (
        <div className="absolute top-7 left-0 z-40 w-80 rounded-md border border-subtle bg-surface-1 p-2 shadow-lg">
          {issues.length ? (
            <div className="mb-2 max-h-44 overflow-y-auto">
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Linked work items
              </p>
              {issues.map((i) => (
                <div key={i.id} className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-layer-1-hover">
                  <a
                    href={`/${slug}/browse/${i.ref}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]"
                  >
                    <span className="flex-shrink-0 text-[11px] font-medium text-tertiary">{i.ref}</span>
                    <span className="truncate text-primary">{i.name}</span>
                  </a>
                  <span className="flex-shrink-0 text-[11px] text-tertiary">{i.status ?? ""}</span>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => onRemove(i.id)}
                      title="Remove link"
                      className="flex-shrink-0 text-[12px] text-tertiary hover:text-danger-primary"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-2 pb-1 text-[13px] text-tertiary">No work items linked yet.</p>
          )}
          {canWrite ? (
            <>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Add: search by name or type PFD-3"
                className="h-8 w-full rounded-sm border border-subtle bg-surface-1 px-2 text-[13px] text-primary outline-none focus:border-accent-strong"
              />
              <div className="mt-1 max-h-48 overflow-y-auto">
                {hits
                  .filter((h) => !linked.has(h.id))
                  .map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => onAdd(h.id)}
                      className="flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-[13px] hover:bg-layer-1-hover"
                    >
                      <span className="flex-shrink-0 text-[11px] font-medium text-tertiary">{h.ref}</span>
                      <span className="truncate text-primary">{h.name}</span>
                    </button>
                  ))}
                {hits.filter((h) => !linked.has(h.id)).length === 0 ? (
                  <p className="px-2 py-1 text-[13px] text-tertiary">No other work items found</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
