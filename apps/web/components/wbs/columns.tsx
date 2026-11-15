/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export type TColKey = "name" | "manDay" | "effort" | "lead" | "actual" | "start" | "who" | "status";
export type TCols = Record<TColKey, number>;

export const DEFAULT_COLS: TCols = { name: 340, manDay: 66, effort: 58, lead: 52, actual: 62, start: 100, who: 92, status: 104 };
export const MIN_COLS: TCols = { name: 160, manDay: 48, effort: 48, lead: 44, actual: 52, start: 84, who: 48, status: 70 };
const KEY = "wbs_columns";

const read = (): TCols => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<TCols> | null;
    if (!raw) return DEFAULT_COLS;
    const out = { ...DEFAULT_COLS };
    (Object.keys(out) as TColKey[]).forEach((k) => {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) out[k] = Math.max(MIN_COLS[k], Math.min(900, v));
    });
    return out;
  } catch {
    return DEFAULT_COLS;
  }
};

// Column widths of the table, kept in this browser.
export function useColumns() {
  const [cols, setCols] = useState<TCols>(read);
  const save = (next: TCols) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* a convenience only */
    }
  };
  const setWidth = useCallback((key: TColKey, width: number) => {
    setCols((prev) => ({ ...prev, [key]: Math.max(MIN_COLS[key], Math.min(900, Math.round(width))) }));
  }, []);
  const commit = useCallback(() => setCols((c) => (save(c), c)), []);
  const reset = useCallback((key: TColKey) => {
    setCols((prev) => {
      const next = { ...prev, [key]: DEFAULT_COLS[key] };
      save(next);
      return next;
    });
  }, []);
  return { cols, setWidth, commit, reset };
}

// A drag handle on the right edge of a header cell. Double-click puts the column back to its default width.
export function ColResizer({ width, onChange, onDone, onReset }: { width: number; onChange: (w: number) => void; onDone: () => void; onReset: () => void }) {
  const [start, setStart] = useState<{ x: number; w: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setStart({ x: e.clientX, w: width });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (start) onChange(start.w + e.clientX - start.x);
  };
  const up = () => {
    if (start) onDone();
    setStart(null);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize, double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      className={`absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent-primary/40 ${start ? "bg-accent-primary/50" : ""}`}
    />
  );
}
