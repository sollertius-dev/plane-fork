/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Sollertius WBS: types shared by the WBS screens. Data comes from the WBS API (/wbs-api).

export type TStatusGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled" | null;

export type TWbsIssue = {
  id: string;
  ref: string; // e.g. PFD-3
  name: string;
  status: string | null;
  status_group: TStatusGroup;
};

export type TWbsNode = {
  id: string;
  title: string;
  man_day: number;
  effort: number; // fraction of a person's time, 0 < effort <= 1
  lead_days: number; // calendar days = ceil(man_day / effort)
  start: string | null; // first working day of the row (the entered date, or the next working day)
  start_input: string | null; // the date that was entered
  end: string | null;
  issues: TWbsIssue[]; // linked Plane work items (many per node)
  issues_done: number;
  status: string | null; // derived from the linked work items
  status_group: TStatusGroup;
  assignees: string | null;
  rolled?: boolean; // true when the values are the roll-up of the children
  children_done?: number;
  touchpoints?: TWbsNode[];
};

export type TWbsPhase = {
  id: string;
  name: string;
  color: string;
  man_day: number;
  start: string | null;
  end: string | null;
  lead_days: number;
  epics: TWbsNode[];
};

export type TWbsMilestone = { id: string; name: string; day: string };

export type TWbsTree = {
  today: string;
  can_write: boolean;
  calendar: { working_days: number[]; holidays: string[] };
  phases: TWbsPhase[];
  milestones: TWbsMilestone[];
};

export type TRowKind = "phase" | "epic" | "touchpoint";

export type TWbsRow = {
  kind: TRowKind;
  id: string;
  depth: number;
  title: string;
  color: string;
  man_day: number;
  effort: number | null; // null for phases
  lead_days: number;
  start: string | null;
  end: string | null;
  rolled: boolean; // computed from children: not editable
  childCount: number;
  node?: TWbsNode;
};

export type TWbsProject = { id: string; identifier: string; name: string };

export type TWbsPlan = {
  id: string;
  name: string;
  projects: TWbsProject[]; // the projects of the plan that the current user is a member of
  hidden_projects: number; // projects of the plan the user is not a member of
  working_days: number[]; // Monday is 0
  holidays: string[]; // ISO dates that are not worked
};

export type TWbsPlanList = { can_write: boolean; plans: TWbsPlan[] };
