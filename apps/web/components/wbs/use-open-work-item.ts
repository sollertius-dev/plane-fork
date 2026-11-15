/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import type { TIssue } from "@plane/types";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TWbsIssue } from "./types";

// Open a work item the way the work item lists do: in the side peek view (a full page on a phone).
// A click with Ctrl, Cmd or Shift, or a middle click, is left to the browser and opens the full page in a new tab.
export function useOpenWorkItem(slug: string) {
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  return (e: MouseEvent, issue: Pick<TWbsIssue, "id" | "project_id" | "ref">) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const sequence = Number(issue.ref.split("-").pop());
    handleRedirection(slug, { id: issue.id, project_id: issue.project_id, sequence_id: sequence } as TIssue, isMobile);
  };
}
