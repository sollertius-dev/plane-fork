/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { EIssuesStoreType } from "@plane/types";
import { cn } from "@plane/utils";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { wbsPlanApi } from "./api";
import { weekLabel } from "./calendar";
import { PlanDialog } from "./plan-dialog";
import type { TWbsPlan, TWbsPlanList } from "./types";
import { WbsGuideline } from "./wbs-guideline";
import { WbsSchedule } from "./wbs-root";

const TABS = [
  { key: "schedule", label: "Schedule" },
  { key: "guideline", label: "Guideline" },
] as const;

const storeKey = (slug: string) => `wbs_plan_${slug}`;
const readStored = (slug: string): string | null => {
  try {
    return window.localStorage.getItem(storeKey(slug));
  } catch {
    return null;
  }
};
const writeStored = (slug: string, id: string) => {
  try {
    window.localStorage.setItem(storeKey(slug), id);
  } catch {
    /* the choice is a convenience only */
  }
};

export function WbsRoot({ slug }: { slug: string }) {
  const { setPeekIssue } = useIssueDetail();
  // leaving the page must not leave a side view open on the next one
  useEffect(() => () => setPeekIssue(undefined), [setPeekIssue]);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("schedule");
  const [list, setList] = useState<TWbsPlanList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);

  const load = useCallback(
    async (select?: string | null) => {
      try {
        const l = await wbsPlanApi.list(slug);
        setList(l);
        setError(null);
        const wanted = select ?? readStored(slug);
        const chosen = l.plans.find((p) => p.id === wanted) ?? l.plans[0] ?? null;
        setPlanId(chosen?.id ?? null);
        if (chosen) writeStored(slug, chosen.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [slug]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const plan: TWbsPlan | null = list?.plans.find((p) => p.id === planId) ?? null;
  const canWrite = !!list?.can_write;
  const btn = "h-7 rounded-md border border-subtle bg-surface-1 px-2.5 text-[12px] font-medium text-secondary hover:bg-layer-1-hover hover:text-primary";

  let body;
  if (tab === "guideline") body = <WbsGuideline />;
  else if (error) body = <div className="p-6 text-[13px] text-tertiary">Could not load the WBS list: {error}</div>;
  else if (!list) body = <div className="p-6 text-[13px] text-tertiary">Loading…</div>;
  else if (!plan) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[15px] font-medium text-primary">No WBS yet</p>
        <p className="max-w-sm text-[13px] text-tertiary">
          A WBS is a high-level schedule tied to some projects. {canWrite ? "Create the first one and choose its projects." : "Ask a member to create one."}
        </p>
        {canWrite ? <button type="button" className={cn(btn, "h-8 px-3")} onClick={() => setDialog("new")}>+ New WBS</button> : null}
      </div>
    );
  } else body = <WbsSchedule key={`${plan.id}:${plan.working_days.join("")}:${plan.holidays.join(",")}`} slug={slug} plan={plan.id} />;

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.GLOBAL}>
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-1">
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-subtle px-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === t.key ? "border-accent-strong text-primary" : "border-transparent text-tertiary hover:text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
        {tab === "schedule" && list ? (
          <div className="ml-auto flex items-center gap-2 py-1.5">
            {list.plans.length > 0 ? (
              <>
                <label className="text-[12px] text-tertiary" htmlFor="wbs-select">WBS</label>
                <select
                  id="wbs-select"
                  value={planId ?? ""}
                  onChange={(e) => {
                    setPlanId(e.target.value);
                    writeStored(slug, e.target.value);
                  }}
                  className="h-7 max-w-[260px] rounded-md border border-subtle bg-surface-1 px-2 text-[12px] font-medium text-primary outline-none focus:border-accent-strong"
                >
                  {list.plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </>
            ) : null}
            {plan ? (
              <span
                className="text-[12px] text-tertiary"
                title={plan.projects.map((p) => `${p.identifier} ${p.name}`).join("\n") || "No projects selected"}
              >
                {plan.projects.length + plan.hidden_projects} project{plan.projects.length + plan.hidden_projects === 1 ? "" : "s"}
              </span>
            ) : null}
            {plan ? (
              <span
                className="text-[12px] text-tertiary"
                title={`Working days: ${weekLabel(plan.working_days)}${plan.holidays.length ? `\n${plan.holidays.length} day(s) off` : ""}`}
              >
                · {weekLabel(plan.working_days)}
              </span>
            ) : null}
            {canWrite && plan ? <button type="button" className={btn} onClick={() => setDialog("edit")}>Edit</button> : null}
            {canWrite ? <button type="button" className={btn} onClick={() => setDialog("new")}>+ New WBS</button> : null}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{body}</div>
      {dialog ? (
        <PlanDialog
          slug={slug}
          plan={dialog === "edit" ? plan : null}
          onClose={() => setDialog(null)}
          onSaved={(p) => {
            setDialog(null);
            void load(p.id);
          }}
          onDeleted={() => {
            setDialog(null);
            void load(null);
          }}
        />
      ) : null}
      {/* the side view of a work item, as in the work item lists */}
      <IssuePeekOverview />
    </div>
    </IssuesStoreContext.Provider>
  );
}
