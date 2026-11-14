/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { WbsRoot } from "@/components/wbs/wbs-page";
import type { Route } from "./+types/page";

function WbsPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="WBS schedule" />
      <WbsRoot slug={params.workspaceSlug} />
    </>
  );
}

export default WbsPage;
