/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWbsMilestone, TWbsTree } from "./types";

// The WBS API is served by the proxy under the same origin, so the Plane session cookie travels with every call.
const base = (slug: string) => `/wbs-api/${encodeURIComponent(slug)}`;

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
  return (await res.json()) as T;
}

export type TNodePatch = Partial<{
  title: string;
  man_day: number;
  effort: number;
  start_date: string;
  issue_id: string;
  clear: ("start_date" | "issue_id")[];
}>;

export const wbsApi = {
  tree: (slug: string) => call<TWbsTree>("GET", `${base(slug)}/tree`),
  addPhase: (slug: string, name: string) => call<{ id: string }>("POST", `${base(slug)}/phases`, { name }),
  patchPhase: (slug: string, id: string, data: { name?: string; color?: string }) =>
    call("PATCH", `${base(slug)}/phases/${id}`, data),
  deletePhase: (slug: string, id: string) => call("DELETE", `${base(slug)}/phases/${id}`),
  addNode: (slug: string, data: { phase_id?: string; parent_id?: string; title: string }) =>
    call<{ id: string }>("POST", `${base(slug)}/nodes`, data),
  patchNode: (slug: string, id: string, data: TNodePatch) => call("PATCH", `${base(slug)}/nodes/${id}`, data),
  deleteNode: (slug: string, id: string) => call("DELETE", `${base(slug)}/nodes/${id}`),
  addMilestone: (slug: string, data: Pick<TWbsMilestone, "name" | "day">) =>
    call<{ id: string }>("POST", `${base(slug)}/milestones`, data),
  deleteMilestone: (slug: string, id: string) => call("DELETE", `${base(slug)}/milestones/${id}`),
  searchIssues: (slug: string, q: string) =>
    call<{ id: string; ref: string; name: string; status: string | null }[]>(
      "GET",
      `${base(slug)}/issues?q=${encodeURIComponent(q)}`
    ),
};
