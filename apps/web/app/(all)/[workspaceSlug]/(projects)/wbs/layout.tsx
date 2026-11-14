/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { Header } from "@plane/blocks/layout";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { WbsIcon } from "@/components/wbs/wbs-icon";

export default function WbsLayout() {
  return (
    <>
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item component={<BreadcrumbLink label="WBS schedule" icon={<WbsIcon className="h-4 w-4 text-tertiary" />} />} />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <div className="h-full w-full overflow-hidden">
        <Outlet />
      </div>
    </>
  );
}
