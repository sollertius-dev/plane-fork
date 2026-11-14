/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { wbsApi } from "./api";

type Hit = { id: string; ref: string; name: string; status: string | null };

type Props = {
  slug: string;
  current: { id: string; ref: string; name: string } | null;
  canWrite: boolean;
  onPick: (issueId: string | null) => void;
};

// Small popover to link a WBS row to a Plane work item (search by name or PROJ-123).
export function IssueLink({ slug, current, canWrite, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      wbsApi
        .searchIssues(slug, q)
        .then(setHits)
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, q, slug]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative flex-shrink-0">
      {current ? (
        <a
          href={`/${slug}/browse/${current.ref}/`}
          target="_blank"
          rel="noreferrer"
          title={current.name}
          className="rounded-sm bg-layer-2 px-1.5 py-0.5 text-[11px] font-medium text-secondary hover:text-primary"
        >
          {current.ref}
        </a>
      ) : null}
      {canWrite ? (
        <button
          type="button"
          title={current ? "Change linked work item" : "Link a work item"}
          onClick={() => setOpen((v) => !v)}
          className={
            current
              ? "ml-0.5 hidden rounded-sm px-1 text-[11px] text-tertiary group-hover:inline hover:text-primary"
              : "rounded-sm px-1 text-[11px] text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary"
          }
        >
          {current ? "✎" : "🔗"}
        </button>
      ) : null}
      {open ? (
        <div className="absolute top-7 left-0 z-40 w-72 rounded-md border border-subtle bg-surface-1 p-2 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search work item or type PFD-3"
            className="h-8 w-full rounded-sm border border-subtle bg-surface-1 px-2 text-[13px] text-primary outline-none focus:border-accent-strong"
          />
          <div className="mt-1 max-h-56 overflow-y-auto">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onPick(h.id);
                  setOpen(false);
                }}
                className="flex w-full items-baseline gap-2 rounded-sm px-2 py-1 text-left text-[13px] hover:bg-layer-1-hover"
              >
                <span className="flex-shrink-0 text-[11px] font-medium text-tertiary">{h.ref}</span>
                <span className="truncate text-primary">{h.name}</span>
              </button>
            ))}
            {hits.length === 0 ? <p className="px-2 py-1 text-[13px] text-tertiary">No work items found</p> : null}
          </div>
          {current ? (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-sm px-2 py-1 text-left text-[13px] text-danger-primary hover:bg-layer-1-hover"
            >
              Remove link
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
