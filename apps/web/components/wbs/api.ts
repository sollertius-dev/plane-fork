/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWbsMilestone, TWbsPlan, TWbsPlanList, TWbsProject, TWbsTree } from "./types";

// The WBS endpoints are part of the Plane API (same origin), so the session cookie travels with every call.
const ws = (slug: string) => `/api/workspaces/${encodeURIComponent(slug)}/wbs`;

// Everything a screen does happens inside one WBS plan.
export type TScope = { slug: string; plan: string };
const base = (s: TScope) => `${ws(s.slug)}/plans/${s.plan}`;

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* keep status text */
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type TNodePatch = Partial<{
  title: string;
  man_day: number;
  effort: number;
  start_date: string | null; // null clears the date
}>;

export const wbsPlanApi = {
  list: (slug: string) => call<TWbsPlanList>("GET", `${ws(slug)}/plans/`),
  projects: (slug: string) => call<TWbsProject[]>("GET", `${ws(slug)}/projects/`),
  create: (slug: string, data: { name: string; project_ids: string[]; working_days: number[]; holidays: string[] }) =>
    call<TWbsPlan>("POST", `${ws(slug)}/plans/`, data),
  update: (slug: string, id: string, data: { name?: string; project_ids?: string[]; working_days?: number[]; holidays?: string[] }) =>
    call<TWbsPlan>("PATCH", `${ws(slug)}/plans/${id}/`, data),
  remove: (slug: string, id: string) => call("DELETE", `${ws(slug)}/plans/${id}/`),
};

export const wbsApi = {
  tree: (s: TScope) => call<TWbsTree>("GET", `${base(s)}/tree/`),
  addPhase: (s: TScope, name: string) => call<{ id: string }>("POST", `${base(s)}/phases/`, { name }),
  patchPhase: (s: TScope, id: string, data: { name?: string; color?: string }) =>
    call("PATCH", `${base(s)}/phases/${id}/`, data),
  deletePhase: (s: TScope, id: string) => call("DELETE", `${base(s)}/phases/${id}/`),
  addNode: (s: TScope, data: { phase_id?: string; parent_id?: string; title: string }) =>
    call<{ id: string }>("POST", `${base(s)}/nodes/`, data),
  patchNode: (s: TScope, id: string, data: TNodePatch) => call("PATCH", `${base(s)}/nodes/${id}/`, data),
  deleteNode: (s: TScope, id: string) => call("DELETE", `${base(s)}/nodes/${id}/`),
  addMilestone: (s: TScope, data: Pick<TWbsMilestone, "name" | "day">) =>
    call<{ id: string }>("POST", `${base(s)}/milestones/`, data),
  deleteMilestone: (s: TScope, id: string) => call("DELETE", `${base(s)}/milestones/${id}/`),
  linkIssue: (s: TScope, nodeId: string, issueId: string) =>
    call("POST", `${base(s)}/nodes/${nodeId}/issues/`, { issue_id: issueId }),
  unlinkIssue: (s: TScope, nodeId: string, issueId: string) =>
    call("DELETE", `${base(s)}/nodes/${nodeId}/issues/${issueId}/`),
  searchIssues: (s: TScope, q: string) =>
    call<{ id: string; ref: string; name: string; status: string | null }[]>(
      "GET",
      `${base(s)}/issues/?q=${encodeURIComponent(q)}`
    ),
};
