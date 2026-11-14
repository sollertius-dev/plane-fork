/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

export const extendedRoutes: RouteConfigEntry[] = [
  // Sollertius patch: WBS schedule (see apps/web/components/wbs)
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        layout("./(all)/[workspaceSlug]/(projects)/wbs/layout.tsx", [
          route(":workspaceSlug/wbs", "./(all)/[workspaceSlug]/(projects)/wbs/page.tsx"),
        ]),
      ]),
    ]),
  ]),
];
