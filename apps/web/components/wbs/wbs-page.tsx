/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { cn } from "@plane/utils";
import { WbsGuideline } from "./wbs-guideline";
import { WbsSchedule } from "./wbs-root";

const TABS = [
  { key: "schedule", label: "Schedule" },
  { key: "guideline", label: "Guideline" },
] as const;

export function WbsRoot({ slug }: { slug: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("schedule");
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-1">
      <div className="flex flex-shrink-0 gap-1 border-b border-subtle px-4" role="tablist">
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
      </div>
      <div className="min-h-0 flex-1">{tab === "schedule" ? <WbsSchedule slug={slug} /> : <WbsGuideline />}</div>
    </div>
  );
}
