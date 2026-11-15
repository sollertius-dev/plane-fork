/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { wbsPlanApi } from "./api";
import { DAY_NAMES, DEFAULT_WORKING_DAYS } from "./calendar";
import { fmtDate } from "./timeline";
import type { TWbsPlan, TWbsProject } from "./types";

type Props = {
  slug: string;
  plan: TWbsPlan | null; // null: create a new WBS
  onSaved: (plan: TWbsPlan) => void;
  onDeleted: () => void;
  onClose: () => void;
};

// Create or edit a WBS: its name and the projects it works with.
export function PlanDialog({ slug, plan, onSaved, onDeleted, onClose }: Props) {
  const [name, setName] = useState(plan?.name ?? "");
  const [projects, setProjects] = useState<TWbsProject[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(plan?.projects.map((p) => p.id) ?? []));
  const [workDays, setWorkDays] = useState<Set<number>>(new Set(plan?.working_days ?? DEFAULT_WORKING_DAYS));
  const [holidays, setHolidays] = useState<string[]>(plan?.holidays ?? []);
  const [newHoliday, setNewHoliday] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(String(plan?.hours_per_day ?? 8));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wbsPlanApi
      .projects(slug)
      .then(setProjects)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [slug]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleDay = (d: number) =>
    setWorkDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const addHoliday = () => {
    if (newHoliday && !holidays.includes(newHoliday)) setHolidays([...holidays, newHoliday].sort());
    setNewHoliday("");
  };

  const save = async () => {
    if (!name.trim()) return setError("Give the WBS a name.");
    if (workDays.size === 0) return setError("Choose at least one working day.");
    const hours = Number(hoursPerDay);
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) return setError("Hours per working day must be between 0.5 and 24.");
    setBusy(true);
    try {
      const body = { name: name.trim(), project_ids: [...picked], working_days: [...workDays].sort(), holidays, hours_per_day: hours };
      onSaved(plan ? await wbsPlanApi.update(slug, plan.id, body) : await wbsPlanApi.create(slug, body));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!plan) return;
    if (!window.confirm(`Delete the WBS "${plan.name}" with all its phases, rows and milestones? Work items in Plane are not touched.`)) return;
    setBusy(true);
    try {
      await wbsPlanApi.remove(slug, plan.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-subtle bg-surface-1 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={plan ? "Edit WBS" : "New WBS"}
      >
        <div className="border-b border-subtle px-5 py-3 text-[15px] font-semibold text-primary">
          {plan ? "Edit WBS" : "New WBS"}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <label className="mb-1 block text-[12px] font-medium text-secondary" htmlFor="wbs-name">Name</label>
          <input
            id="wbs-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="For example: Trading platform"
            className="mb-4 h-9 w-full rounded-sm border border-subtle bg-surface-1 px-2.5 text-[14px] text-primary outline-none focus:border-accent-strong"
          />
          <p className="mb-1 text-[12px] font-medium text-secondary">Projects of this WBS</p>
          <p className="mb-2 text-[12px] text-tertiary">
            Only work items of these projects can be linked to rows of this WBS.
          </p>
          <div className="rounded-sm border border-subtle">
            {projects === null ? <p className="p-3 text-[13px] text-tertiary">Loading projects…</p> : null}
            {projects?.length === 0 ? <p className="p-3 text-[13px] text-tertiary">You are not a member of any project.</p> : null}
            {projects?.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2.5 border-b border-subtle px-3 py-2 text-[13px] last:border-b-0 hover:bg-layer-1-hover">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="w-12 flex-shrink-0 text-[11px] font-medium text-tertiary">{p.identifier}</span>
                <span className="truncate text-primary">{p.name}</span>
              </label>
            ))}
          </div>
          {plan && plan.hidden_projects > 0 ? (
            <p className="mt-2 text-[12px] text-tertiary">
              {plan.hidden_projects} more project(s) of this WBS are not shown because you are not a member of them. They stay as they are.
            </p>
          ) : null}
          <p className="mt-5 mb-1 text-[12px] font-medium text-secondary">Working days</p>
          <p className="mb-2 text-[12px] text-tertiary">
            Lead time is counted in these days. A row that starts on a day off starts on the next working day.
          </p>
          <div className="flex gap-1.5">
            {DAY_NAMES.map((n, d) => (
              <button
                key={n}
                type="button"
                aria-pressed={workDays.has(d)}
                onClick={() => toggleDay(d)}
                className={
                  workDays.has(d)
                    ? "h-8 flex-1 rounded-md bg-accent-primary text-[12px] font-medium text-on-color"
                    : "h-8 flex-1 rounded-md border border-subtle text-[12px] text-tertiary hover:bg-layer-1-hover"
                }
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-4 mb-1 text-[12px] font-medium text-secondary">Hours per working day</p>
          <p className="mb-2 text-[12px] text-tertiary">Turns the effort hours of work items into days in the Actual column.</p>
          <input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
            className="h-8 w-24 rounded-sm border border-subtle bg-surface-1 px-2 text-[13px] text-primary outline-none focus:border-accent-strong"
          />
          <p className="mt-4 mb-1 text-[12px] font-medium text-secondary">Days off (holidays)</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHoliday()}
              className="h-8 rounded-sm border border-subtle bg-surface-1 px-2 text-[13px] text-primary outline-none focus:border-accent-strong"
            />
            <button type="button" onClick={addHoliday} className="h-8 rounded-md border border-subtle px-3 text-[12px] text-secondary hover:bg-layer-1-hover">
              Add
            </button>
          </div>
          {holidays.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {holidays.map((h) => (
                <span key={h} className="flex items-center gap-1 rounded-full bg-layer-2 px-2.5 py-0.5 text-[12px] text-secondary">
                  {fmtDate(h)}
                  <button type="button" aria-label={`Remove ${h}`} onClick={() => setHolidays(holidays.filter((x) => x !== h))} className="text-tertiary hover:text-danger-primary">✕</button>
                </span>
              ))}
            </div>
          ) : null}
          {error ? <p className="mt-3 text-[13px] text-danger-primary">{error}</p> : null}
        </div>
        <div className="flex items-center gap-2 border-t border-subtle px-5 py-3">
          {plan ? (
            <button type="button" disabled={busy} onClick={remove} className="mr-auto text-[13px] text-danger-primary hover:underline">
              Delete WBS
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="ml-auto h-8 rounded-md border border-subtle px-3 text-[13px] text-secondary hover:bg-layer-1-hover">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={save} className="h-8 rounded-md bg-accent-primary px-3 text-[13px] font-medium text-on-color disabled:opacity-60">
            {plan ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
