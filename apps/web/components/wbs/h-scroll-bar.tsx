/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type Metrics = { left: number; client: number; total: number };

// A horizontal scroll bar that is always visible at the bottom of the schedule (macOS hides the native one),
// with a draggable thumb, a click-to-page track and step buttons at both ends.
export function HScrollBar({ target, step }: { target: RefObject<HTMLDivElement | null>; step: number }) {
  const [m, setM] = useState<Metrics>({ left: 0, client: 1, total: 1 });
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; ratio: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const update = () => setM({ left: el.scrollLeft, client: el.clientWidth, total: el.scrollWidth });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [target]);

  const trackW = track.current?.clientWidth ?? 0;
  const scrollable = m.total > m.client + 1;
  const thumbW = scrollable && trackW ? Math.max(48, (m.client / m.total) * trackW) : trackW;
  const range = Math.max(1, trackW - thumbW);
  const thumbLeft = scrollable ? (m.left / (m.total - m.client)) * range : 0;

  const by = (dx: number) => target.current?.scrollBy({ left: dx, behavior: "smooth" });

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, left: target.current?.scrollLeft ?? 0, ratio: (m.total - m.client) / range };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d && target.current) target.current.scrollLeft = d.left + (e.clientX - d.x) * d.ratio;
  };
  const onUp = () => {
    drag.current = null;
  };
  const onTrack = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // the thumb handles its own drag
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    by(x < thumbLeft ? -m.client * 0.9 : m.client * 0.9);
  };

  const arrow =
    "flex h-6 w-7 flex-shrink-0 items-center justify-center rounded-sm text-[12px] text-secondary hover:bg-layer-2 hover:text-primary";
  return (
    <div className="flex flex-shrink-0 items-center gap-1 border-t border-subtle bg-layer-1 px-2 py-1.5">
      <button type="button" className={arrow} onClick={() => by(-step)} aria-label="Scroll timeline left" title="Move left">
        ◀
      </button>
      <div ref={track} onPointerDown={onTrack} className="relative h-3 min-w-0 flex-1 cursor-pointer rounded-full bg-layer-3">
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-valuenow={Math.round(m.left)}
          className="absolute top-0 h-3 cursor-grab touch-none rounded-full bg-accent-primary opacity-70 hover:opacity-100 active:cursor-grabbing active:opacity-100"
          style={{ left: thumbLeft, width: thumbW }}
        />
      </div>
      <button type="button" className={arrow} onClick={() => by(step)} aria-label="Scroll timeline right" title="Move right">
        ▶
      </button>
    </div>
  );
}
