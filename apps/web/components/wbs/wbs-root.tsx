/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@plane/utils";
import { wbsApi } from "./api";
import { EditableCell } from "./editable-cell";
import { AssigneeAvatars } from "./assignee-avatars";
import { ColResizer, useColumns } from "./columns";
import type { TColKey } from "./columns";
import { HScrollBar } from "./h-scroll-bar";
import { IssueLinks } from "./issue-links";
import { buildTimeline, dayOfMonth, DAY_PX, fmtDate, mondayOnOrBefore, monthKey, monthLabel, toDay, WEEK_PX, xOf } from "./timeline";
import type { TStatusGroup, TWbsNode, TWbsPhase, TWbsRow } from "./types";
import { useWbs } from "./use-wbs";

const ROW_H = { phase: 38, epic: 34, touchpoint: 34, issue: 30 } as const;
const HEAD_H = 72; // months + weeks + milestone flags

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  backlog: { bg: "rgba(120,120,130,.16)", fg: "#6b7280" },
  unstarted: { bg: "rgba(120,120,130,.16)", fg: "#6b7280" },
  started: { bg: "rgba(245,158,11,.18)", fg: "#b45309" },
  completed: { bg: "rgba(16,185,129,.18)", fg: "#047857" },
  cancelled: { bg: "rgba(239,68,68,.16)", fg: "#b91c1c" },
};

function flatten(phases: TWbsPhase[], collapsed: Set<string>, openIssues: Set<string>): TWbsRow[] {
  const rows: TWbsRow[] = [];
  // the work items linked to a node, shown under it when the node is opened
  const pushIssues = (node: TWbsNode, depth: number, color: string) => {
    if (!openIssues.has(node.id)) return;
    for (const it of node.issues) {
      rows.push({
        kind: "issue", id: `${node.id}:${it.id}`, depth, title: it.name, color, man_day: 0, effort: null, lead_days: 0,
        start: it.start, end: it.end, rolled: false, childCount: 0, issue: it, nodeId: node.id,
      });
    }
  };
  for (const ph of phases) {
    rows.push({
      kind: "phase", id: ph.id, depth: 0, title: ph.name, color: ph.color, man_day: ph.man_day, effort: null,
      lead_days: ph.lead_days, start: ph.start, end: ph.end, rolled: true, childCount: ph.epics.length,
    });
    if (collapsed.has(ph.id)) continue;
    for (const ep of ph.epics) {
      const tps = ep.touchpoints ?? [];
      rows.push({
        kind: "epic", id: ep.id, depth: 1, title: ep.title, color: ph.color, man_day: ep.man_day,
        effort: ep.rolled ? null : ep.effort, lead_days: ep.lead_days, start: ep.start, end: ep.end,
        rolled: !!ep.rolled, childCount: tps.length, node: ep,
      });
      if (tps.length === 0) pushIssues(ep, 2, ph.color);
      if (collapsed.has(ep.id)) continue;
      for (const tp of tps) {
        rows.push({
          kind: "touchpoint", id: tp.id, depth: 2, title: tp.title, color: ph.color, man_day: tp.man_day,
          effort: tp.effort, lead_days: tp.lead_days, start: tp.start, end: tp.end, rolled: false, childCount: 0, node: tp,
        });
        pushIssues(tp, 3, ph.color);
      }
    }
  }
  return rows;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function StatusChip({ node, row }: { node?: TWbsNode; row: TWbsRow }) {
  if (row.rolled && row.kind === "epic" && node?.touchpoints?.length) {
    return <span className="text-[12px] text-tertiary">{node.children_done ?? 0}/{node.touchpoints.length} done</span>;
  }
  if (!node?.status) return <span className="text-[12px] text-tertiary">—</span>;
  const progress = node.issues.length > 1 ? ` ${node.issues_done}/${node.issues.length}` : "";
  const s = STATUS_STYLE[(node.status_group ?? "backlog") as Exclude<TStatusGroup, null>] ?? STATUS_STYLE.backlog;
  return (
    <span className="truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: s.bg, color: s.fg }}>
      {node.status}{progress}
    </span>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" className={cn("size-3.5 transition-transform", open ? "rotate-90" : "")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

export function WbsSchedule({ slug, plan }: { slug: string; plan: string }) {
  const scope = useMemo(() => ({ slug, plan }), [slug, plan]);
  const { tree, error, loading, run, clearError } = useWbs(scope);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openIssues, setOpenIssues] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const [msForm, setMsForm] = useState<{ name: string; day: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  const rows = useMemo(() => (tree ? flatten(tree.phases, collapsed, openIssues) : []), [tree, collapsed, openIssues]);
  const today = tree ? toDay(tree.today) : toDay(new Date().toISOString().slice(0, 10));
  const tl = useMemo(() => {
    const days: number[] = [];
    tree?.phases.forEach((p) => {
      if (p.start) days.push(toDay(p.start));
      if (p.end) days.push(toDay(p.end));
    });
    tree?.milestones.forEach((m) => days.push(toDay(m.day)));
    return buildTimeline(days, today);
  }, [tree, today]);
  const { cols, setWidth, commit, reset } = useColumns();
  const detailW = cols.manDay + cols.effort + cols.lead + cols.start + cols.who + cols.status;
  const leftW = compact ? cols.name : cols.name + detailW;
  const canWrite = !!tree?.can_write;

  const scrollByWeeks = (w: number) => scroller.current?.scrollBy({ left: w * WEEK_PX, behavior: "smooth" });
  const scrollToToday = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: Math.max(0, xOf(tl, today) - 160), behavior: "smooth" });
  };
  useEffect(() => {
    if (tree && !scrolled.current && scroller.current) {
      scrolled.current = true;
      scroller.current.scrollLeft = Math.max(0, xOf(tl, today) - 160);
    }
  }, [tree, tl, today]);
  useEffect(() => {
    if (!autoEditId) return;
    const t = setTimeout(() => setAutoEditId(null), 1500);
    return () => clearTimeout(t);
  }, [autoEditId]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleIssues = (id: string) =>
    setOpenIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const nodesWithIssues = useMemo(() => {
    const ids: string[] = [];
    tree?.phases.forEach((p) =>
      p.epics.forEach((e) => {
        if (e.issues.length) ids.push(e.id);
        e.touchpoints?.forEach((t) => (t.issues.length ? ids.push(t.id) : null));
      })
    );
    return ids;
  }, [tree]);
  const allParents = useMemo(() => {
    const ids: string[] = [];
    tree?.phases.forEach((p) => {
      ids.push(p.id);
      p.epics.forEach((e) => (e.touchpoints?.length ? ids.push(e.id) : null));
    });
    return ids;
  }, [tree]);

  const addPhase = async () => {
    const r = await run(() => wbsApi.addPhase(scope, "New phase"));
    if (r) setAutoEditId(r.id);
  };
  const addChild = async (row: TWbsRow) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    const r = await run(() =>
      row.kind === "phase"
        ? wbsApi.addNode(scope, { phase_id: row.id, title: "New epic" })
        : wbsApi.addNode(scope, { parent_id: row.id, title: "New touch point" })
    );
    if (r) setAutoEditId(r.id);
  };
  const remove = async (row: TWbsRow) => {
    const kids = row.childCount ? ` and its ${row.childCount} item(s)` : "";
    if (!window.confirm(`Delete "${row.title}"${kids}? Linked Plane work items are not touched.`)) return;
    await run(() => (row.kind === "phase" ? wbsApi.deletePhase(scope, row.id) : wbsApi.deleteNode(scope, row.id)));
  };
  const addMilestone = async () => {
    if (!msForm?.name.trim() || !msForm.day) return;
    await run(() => wbsApi.addMilestone(scope, { name: msForm.name.trim(), day: msForm.day }));
    setMsForm(null);
  };

  if (loading && !tree) return <div className="p-6 text-[13px] text-tertiary">Loading WBS…</div>;
  if (!tree) {
    return (
      <div className="p-6">
        <p className="text-[14px] font-medium text-primary">The WBS service is not reachable.</p>
        <p className="mt-1 text-[13px] text-tertiary">{error ?? "No response."} Check that the wbs container is running.</p>
      </div>
    );
  }

  // Week lines, plus a light shade on days off (weekdays that are not worked, and holidays).
  // The timeline starts on a Monday, so the weekday of a column is its index inside the week.
  const off = "rgba(128,128,128,.09)";
  const workingSet = new Set(tree.calendar.working_days);
  const weekShade = `repeating-linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => `${workingSet.has(i) ? "transparent" : off} ${i * DAY_PX}px ${(i + 1) * DAY_PX}px`).join(", ")})`;
  const weekLines = `repeating-linear-gradient(to right, transparent 0, transparent ${WEEK_PX - 1}px, rgba(128,128,128,.16) ${WEEK_PX - 1}px, rgba(128,128,128,.16) ${WEEK_PX}px)`;
  const holidayXs = tree.calendar.holidays.map((h) => xOf(tl, toDay(h))).filter((x) => x >= 0 && x < tl.width);
  const gridBg: CSSProperties = {
    backgroundImage: [weekShade, weekLines, ...holidayXs.map(() => `linear-gradient(${off}, ${off})`)].join(", "),
    backgroundSize: ["auto", "auto", ...holidayXs.map(() => `${DAY_PX}px 100%`)].join(", "),
    backgroundPosition: ["0 0", "0 0", ...holidayXs.map((x) => `${x}px 0`)].join(", "),
    backgroundRepeat: ["repeat", "repeat", ...holidayXs.map(() => "no-repeat")].join(", "),
  };
  const weekStarts = Array.from({ length: tl.weeks }, (_, i) => tl.origin + i * 7);
  const months: { key: string; label: string; from: number; count: number }[] = [];
  weekStarts.forEach((d, i) => {
    const k = monthKey(d);
    const last = months[months.length - 1];
    if (last && last.key === k) last.count += 1;
    else months.push({ key: k, label: monthLabel(d), from: i, count: 1 });
  });
  const bodyH = rows.reduce((h, r) => h + ROW_H[r.kind], 0);
  const todayX = xOf(tl, today) + DAY_PX / 2;

  const btn = "h-7 rounded-md border border-subtle bg-surface-1 px-2.5 text-[12px] font-medium text-secondary hover:bg-layer-1-hover hover:text-primary";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-1">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-2">
        <span className="mr-2 text-[12px] text-tertiary">
          {tree.phases.length} phases · {num(tree.phases.reduce((s, p) => s + p.man_day, 0))} man-days
        </span>
        {canWrite ? <button type="button" className={btn} onClick={addPhase}>+ Phase</button> : null}
        {canWrite ? <button type="button" className={btn} onClick={() => setMsForm(msForm ? null : { name: "", day: tree.today })}>+ Milestone</button> : null}
        <button type="button" className={btn} onClick={scrollToToday}>Today</button>
        <button type="button" className={btn} onClick={() => { if (collapsed.size) { setCollapsed(new Set()); setOpenIssues(new Set(nodesWithIssues)); } else { setCollapsed(new Set(allParents)); setOpenIssues(new Set()); } }}>{collapsed.size ? "Expand all" : "Collapse all"}</button>
        <button type="button" className={btn} onClick={() => setCompact((v) => !v)}>{compact ? "Show details" : "Hide details"}</button>
        {msForm ? (
          <span className="flex items-center gap-1.5">
            <input autoFocus value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void addMilestone(); if (e.key === "Escape") setMsForm(null); }} placeholder="Milestone name" className="h-7 w-44 rounded-sm border border-subtle bg-surface-1 px-2 text-[12px] text-primary outline-none focus:border-accent-strong" />
            <input type="date" value={msForm.day} onKeyDown={(e) => e.key === "Escape" && setMsForm(null)} onChange={(e) => setMsForm({ ...msForm, day: e.target.value })} className="h-7 rounded-sm border border-subtle bg-surface-1 px-1.5 text-[12px] text-primary outline-none focus:border-accent-strong" />
            <button type="button" className={cn(btn, "bg-accent-primary text-on-color hover:bg-accent-primary")} onClick={addMilestone}>Add</button>
            <button type="button" className={btn} onClick={() => setMsForm(null)} title="Close without adding (Esc)">Cancel</button>
          </span>
        ) : null}
        {error ? (
          <span className="ml-auto flex items-center gap-2 rounded-md bg-danger-subtle px-2.5 py-1 text-[12px] text-danger-primary">
            {error}
            <button type="button" onClick={clearError} aria-label="Dismiss">✕</button>
          </span>
        ) : null}
      </div>

      {/* table + gantt in one scroll area, so rows always line up */}
      <div className="relative min-h-0 flex-1">
      <button type="button" onClick={() => scrollByWeeks(-6)} title="Move the timeline 6 weeks back" aria-label="Timeline back"
        className="absolute top-0.5 z-30 flex h-5 w-6 items-center justify-center rounded-sm border border-subtle bg-layer-1 text-[10px] text-secondary hover:text-primary" style={{ left: leftW + 6 }}>◀</button>
      <button type="button" onClick={() => scrollByWeeks(6)} title="Move the timeline 6 weeks forward" aria-label="Timeline forward"
        className="absolute top-0.5 right-4 z-30 flex h-5 w-6 items-center justify-center rounded-sm border border-subtle bg-layer-1 text-[10px] text-secondary hover:text-primary">▶</button>
      <div ref={scroller} className="relative h-full overflow-auto">
        <div className="relative" style={{ width: leftW + tl.width, minWidth: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-20 flex border-b border-subtle bg-layer-1" style={{ height: HEAD_H }}>
            <div className="sticky left-0 z-30 flex flex-shrink-0 items-end border-r border-subtle bg-layer-1 text-[11px] font-semibold tracking-wide text-tertiary uppercase" style={{ width: leftW }}>
              {(
                [
                  ["name", "Phase / Epic / Touch point", "px-3 text-left"],
                  ["manDay", "Man-day", "pr-2 text-right"],
                  ["effort", "Effort", "pr-2 text-right"],
                  ["lead", "Lead", "pr-2 text-right"],
                  ["start", "Start", "pl-2 text-left"],
                  ["who", "Assignee", "pl-2 text-left"],
                  ["status", "Status", "pl-2 text-left"],
                ] as [TColKey, string, string][]
              )
                .filter(([k]) => !(compact && k !== "name"))
                .map(([k, label, cls]) => (
                  <div key={k} className={cn("relative h-full flex-shrink-0 border-r border-subtle pb-2 whitespace-nowrap", "flex items-end", cls, cls.includes("right") && "justify-end")} style={{ width: cols[k] }}>
                    <span className="truncate">{label}</span>
                    <ColResizer width={cols[k]} onChange={(w) => setWidth(k, w)} onDone={commit} onReset={() => reset(k)} />
                  </div>
                ))}
            </div>
            <div className="relative flex-shrink-0" style={{ width: tl.width }}>
              {months.map((m) => (
                <div key={m.key} className="absolute top-0 h-6 truncate border-l border-subtle px-2 text-[11px] leading-6 font-semibold text-secondary" style={{ left: m.from * WEEK_PX, width: m.count * WEEK_PX }}>
                  {m.label}
                </div>
              ))}
              {weekStarts.map((d, i) => (
                <div key={d} className={cn("absolute top-6 h-6 border-l border-subtle text-center text-[10px] leading-6 text-tertiary", d === mondayOnOrBefore(today) && "font-semibold text-primary")} style={{ left: i * WEEK_PX, width: WEEK_PX }}>
                  {dayOfMonth(d)}
                </div>
              ))}
              {/* milestone flags + Now */}
              <div className="absolute top-12 h-6 w-full">
                {tree.milestones.map((m) => (
                  <button key={m.id} type="button" disabled={!canWrite} title={`${m.name} · ${fmtDate(m.day)}${canWrite ? " (click to delete)" : ""}`}
                    onClick={() => window.confirm(`Delete milestone "${m.name}"?`) && run(() => wbsApi.deleteMilestone(scope, m.id))}
                    className="absolute top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-primary" style={{ left: xOf(tl, toDay(m.day)) + DAY_PX / 2 }}>
                    <span className="size-2 rotate-45 bg-amber-500" />{m.name}
                  </button>
                ))}
                <span className="absolute top-1 -translate-x-1/2 rounded-sm bg-danger-primary px-1.5 text-[10px] leading-4 font-semibold text-on-color" style={{ left: todayX }}>Now</span>
              </div>
            </div>
          </div>

          {/* rows */}
          <div className="relative">
            {rows.map((row) => {
              if (row.kind === "issue" && row.issue) {
                const it = row.issue;
                const st = STATUS_STYLE[(it.status_group ?? "backlog") as Exclude<TStatusGroup, null>] ?? STATUS_STYLE.backlog;
                const dash = <span className="w-full pr-1.5 text-right text-[13px] text-tertiary">—</span>;
                const hasBar = !!(it.start && it.end);
                const x = hasBar ? xOf(tl, toDay(it.start as string)) : 0;
                const w = hasBar ? Math.max((toDay(it.end as string) - toDay(it.start as string) + 1) * DAY_PX, DAY_PX) : 0;
                return (
                  <div key={row.id} className="group flex" style={{ height: ROW_H.issue }}>
                    <div className="sticky left-0 z-10 flex flex-shrink-0 items-center border-r border-b border-subtle bg-surface-1 group-hover:bg-layer-1" style={{ width: leftW }}>
                      <div className="relative flex h-full flex-shrink-0 items-center gap-2 overflow-hidden border-r border-subtle" style={{ width: cols.name, paddingLeft: 8 + row.depth * 18 + 24, paddingRight: canWrite ? 30 : 4 }}>
                        <a href={`/${slug}/browse/${it.ref}/`} target="_blank" rel="noreferrer" className="flex-shrink-0 text-[11px] font-medium text-tertiary hover:text-primary hover:underline">{it.ref}</a>
                        <span className="truncate text-[12px] text-secondary" title={it.name}>{it.name}</span>
                        {canWrite ? (
                          <button type="button" title="Unlink this work item" onClick={() => run(() => wbsApi.unlinkIssue(scope, row.nodeId as string, it.id))} className="absolute right-1 hidden size-6 items-center justify-center rounded-sm bg-layer-1 text-[12px] text-tertiary group-hover:flex hover:text-danger-primary">✕</button>
                        ) : null}
                      </div>
                      {compact ? null : (
                        <>
                          <div className="h-full flex-shrink-0 border-r border-subtle" style={{ width: cols.manDay }}><div className="flex h-full items-center">{dash}</div></div>
                          <div className="h-full flex-shrink-0 border-r border-subtle" style={{ width: cols.effort }}><div className="flex h-full items-center">{dash}</div></div>
                          <div className="h-full flex-shrink-0 border-r border-subtle" style={{ width: cols.lead }}><div className="flex h-full items-center">{dash}</div></div>
                          <div className="flex h-full flex-shrink-0 items-center border-r border-subtle pl-2 text-[12px] text-secondary" style={{ width: cols.start }} title="Start date of the work item in Plane">{fmtDate(it.start)}</div>
                          <div className="flex h-full flex-shrink-0 items-center overflow-hidden border-r border-subtle" style={{ width: cols.who }}><AssigneeAvatars people={it.assignees} /></div>
                          <div className="flex h-full flex-shrink-0 items-center overflow-hidden border-r border-subtle px-1.5" style={{ width: cols.status }}>
                            {it.status ? <span className="truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: st.bg, color: st.fg }}>{it.status}</span> : <span className="text-[12px] text-tertiary">—</span>}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative flex-shrink-0 border-b border-subtle" style={{ width: tl.width, ...gridBg }}>
                      {hasBar ? (
                        <div className="absolute top-1/2 -translate-y-1/2 rounded-[3px] border" title={`${it.ref}: ${fmtDate(it.start)} → ${fmtDate(it.end)} (dates in Plane)`} style={{ left: x, width: w, height: 8, borderColor: row.color, background: `${row.color}40` }} />
                      ) : null}
                    </div>
                  </div>
                );
              }
              const nodeIssues = row.node?.issues.length ?? 0;
              const expandable = row.kind === "phase" ? row.childCount > 0 : row.childCount > 0 || nodeIssues > 0;
              const opensIssues = row.kind !== "phase" && row.childCount === 0;
              const isLeaf = row.kind === "touchpoint" || (row.kind === "epic" && !row.rolled);
              const node = row.node;
              const canEditNumbers = canWrite && isLeaf;
              const tokenStart = row.start ? toDay(row.start) : null;
              const bar = tokenStart !== null && row.end ? { x: xOf(tl, tokenStart), w: Math.max((toDay(row.end) - tokenStart + 1) * DAY_PX, DAY_PX) } : null;
              const done = node?.status_group === "completed";
              const barH = row.kind === "phase" ? 10 : row.kind === "epic" ? 14 : 18;
              const cell = (w: number, child: ReactNode, extra?: string) => (
                <div className={cn("flex h-full flex-shrink-0 items-center overflow-hidden border-r border-subtle px-0.5", extra)} style={{ width: w }}>{child}</div>
              );
              const patch = (data: Parameters<typeof wbsApi.patchNode>[2]) => run(() => wbsApi.patchNode(scope, row.id, data));
              return (
                <div key={row.id} className="group flex" style={{ height: ROW_H[row.kind] }}>
                  <div className={cn("sticky left-0 z-10 flex flex-shrink-0 items-center border-r border-b border-subtle group-hover:bg-layer-1", row.kind === "phase" ? "bg-layer-1" : "bg-surface-1")} style={{ width: leftW }}>
                    {/* name */}
                    <div className="relative flex h-full flex-shrink-0 items-center gap-1 overflow-hidden border-r border-subtle" style={{ width: cols.name, paddingLeft: 8 + row.depth * 18, paddingRight: canWrite ? 58 : 4 }}>
                      {expandable ? (
                        <button type="button" onClick={() => (opensIssues ? toggleIssues(row.id) : toggle(row.id))} className="flex size-5 flex-shrink-0 items-center justify-center rounded-sm text-tertiary hover:bg-layer-2 hover:text-primary" aria-label={opensIssues ? "Show or hide the linked work items" : "Expand or collapse"} title={opensIssues ? "Show or hide the linked work items" : undefined}>
                          <Chevron open={opensIssues ? openIssues.has(row.id) : !collapsed.has(row.id)} />
                        </button>
                      ) : <span className="size-5 flex-shrink-0" />}
                      {row.kind === "phase" ? (
                        canWrite ? (
                          <input type="color" value={row.color} onChange={(e) => run(() => wbsApi.patchPhase(scope, row.id, { color: e.target.value }))} className="size-4 flex-shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0" title="Phase colour" />
                        ) : <span className="size-3 flex-shrink-0 rounded-sm" style={{ background: row.color }} />
                      ) : null}
                      <EditableCell title={row.title} value={row.title} readOnly={!canWrite} autoEdit={autoEditId === row.id}
                        display={<span className={cn(row.kind === "phase" ? "font-semibold text-primary" : row.kind === "epic" ? "font-medium text-primary" : "text-secondary")}>{row.title}</span>}
                        onCommit={(v) => v.trim() && (row.kind === "phase" ? run(() => wbsApi.patchPhase(scope, row.id, { name: v.trim() })) : patch({ title: v.trim() }))} />
                      {row.kind !== "phase" && node ? (
                        <IssueLinks scope={scope} slug={slug} canWrite={canWrite} issues={node.issues}
                          onAdd={(id) => run(() => wbsApi.linkIssue(scope, row.id, id))}
                          onRemove={(id) => run(() => wbsApi.unlinkIssue(scope, row.id, id))} />
                      ) : null}
                      {canWrite ? (
                        <div className="absolute right-1 hidden items-center gap-0.5 rounded-sm bg-layer-1 group-hover:flex">
                          {row.kind !== "touchpoint" ? (
                            <button type="button" onClick={() => addChild(row)} title={row.kind === "phase" ? "Add epic" : "Add touch point"} className="flex size-6 items-center justify-center rounded-sm text-[15px] text-tertiary hover:bg-layer-2 hover:text-primary">+</button>
                          ) : null}
                          <button type="button" onClick={() => remove(row)} title="Delete" className="flex size-6 items-center justify-center rounded-sm text-[12px] text-tertiary hover:bg-layer-2 hover:text-danger-primary">✕</button>
                        </div>
                      ) : null}
                    </div>
                    {compact ? null : (
                      <>
                        {cell(cols.manDay, <EditableCell align="right" type="number" min={0} step={0.5} readOnly={!canEditNumbers} value={String(row.man_day)}
                          display={<span className={cn(row.rolled && "font-medium text-primary", !row.rolled && "text-secondary")}>{num(row.man_day)}</span>}
                          onCommit={(v) => Number(v) >= 0 && patch({ man_day: Number(v) })} />)}
                        {cell(cols.effort, row.effort === null ? <span className="w-full pr-1.5 text-right text-[13px] text-tertiary">—</span> :
                          <EditableCell align="right" type="number" min={1} max={100} step={5} readOnly={!canEditNumbers} value={String(Math.round(row.effort * 100))}
                            display={<span className="text-secondary">{Math.round(row.effort * 100)}%</span>}
                            onCommit={(v) => Number(v) > 0 && Number(v) <= 100 && patch({ effort: Number(v) / 100 })} />)}
                        {cell(cols.lead, <span className="w-full pr-1.5 text-right text-[13px] text-secondary" title={row.lead_days ? `${row.lead_days} working days` : undefined}>{row.lead_days ? `${row.lead_days}d` : "—"}</span>)}
                        {cell(cols.start, <EditableCell type="date" readOnly={!canEditNumbers} value={node?.start_input ?? row.start ?? ""}
                          display={<span className={row.start ? "text-secondary" : "text-tertiary"} title={node?.start_input && node.start_input !== row.start ? `Entered ${fmtDate(node.start_input)}, a day off: work starts on the next working day` : undefined}>{fmtDate(row.start)}{node?.start_input && node.start_input !== row.start ? " *" : ""}</span>}
                          onCommit={(v) => patch({ start_date: v || null })} />, "pl-2")}
                                                {cell(cols.who, <AssigneeAvatars people={node?.assignees ?? []} />)}
                        {cell(cols.status, <span className="px-1.5"><StatusChip node={node} row={row} /></span>)}
                      </>
                    )}
                  </div>
                  {/* gantt cell */}
                  <div className="relative flex-shrink-0 border-b border-subtle" style={{ width: tl.width, ...gridBg }}>
                    {bar ? (
                      <div className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-[3px]" title={`${row.title}: ${fmtDate(row.start)} → ${fmtDate(row.end)} · ${row.lead_days} working days · ${num(row.man_day)} man-day`}
                        style={{ left: bar.x, width: bar.w, height: barH, background: row.color, opacity: row.kind === "phase" ? 0.95 : row.kind === "epic" ? 0.55 : done ? 1 : 0.78 }}>
                        {row.kind === "touchpoint" && bar.w > 46 ? <span className="px-1.5 text-[10px] font-semibold whitespace-nowrap text-white">{num(row.man_day)}d{done ? " ✓" : ""}</span> : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 ? (
              <div className="p-8 text-[13px] text-tertiary">{canWrite ? "No phases yet. Use “+ Phase” to start." : "No phases yet."}</div>
            ) : null}
            {/* milestone lines and the Now line, drawn once across all rows */}
            <div className="pointer-events-none absolute top-0 z-[5]" style={{ left: leftW, width: tl.width, height: bodyH }}>
              {tree.milestones.map((m) => (
                <div key={m.id} className="absolute top-0 bottom-0 border-l border-dashed border-amber-500" style={{ left: xOf(tl, toDay(m.day)) + DAY_PX / 2 }} />
              ))}
              <div className="absolute top-0 bottom-0 w-px bg-danger-primary" style={{ left: todayX }} />
            </div>
          </div>
        </div>
      </div>
      </div>
      <HScrollBar target={scroller} step={WEEK_PX * 6} />
    </div>
  );
}
