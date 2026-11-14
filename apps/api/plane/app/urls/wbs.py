# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.wbs import (
    WbsIssueSearchEndpoint,
    WbsMilestoneEndpoint,
    WbsNodeEndpoint,
    WbsNodeIssueEndpoint,
    WbsPhaseEndpoint,
    WbsTreeEndpoint,
)

urlpatterns = [
    path("workspaces/<str:slug>/wbs/tree/", WbsTreeEndpoint.as_view(), name="wbs-tree"),
    path("workspaces/<str:slug>/wbs/issues/", WbsIssueSearchEndpoint.as_view(), name="wbs-issue-search"),
    path("workspaces/<str:slug>/wbs/phases/", WbsPhaseEndpoint.as_view(), name="wbs-phases"),
    path("workspaces/<str:slug>/wbs/phases/<uuid:pk>/", WbsPhaseEndpoint.as_view(), name="wbs-phase"),
    path("workspaces/<str:slug>/wbs/nodes/", WbsNodeEndpoint.as_view(), name="wbs-nodes"),
    path("workspaces/<str:slug>/wbs/nodes/<uuid:pk>/", WbsNodeEndpoint.as_view(), name="wbs-node"),
    path("workspaces/<str:slug>/wbs/nodes/<uuid:pk>/issues/", WbsNodeIssueEndpoint.as_view(), name="wbs-node-issues"),
    path(
        "workspaces/<str:slug>/wbs/nodes/<uuid:pk>/issues/<uuid:issue_id>/",
        WbsNodeIssueEndpoint.as_view(),
        name="wbs-node-issue",
    ),
    path("workspaces/<str:slug>/wbs/milestones/", WbsMilestoneEndpoint.as_view(), name="wbs-milestones"),
    path("workspaces/<str:slug>/wbs/milestones/<uuid:pk>/", WbsMilestoneEndpoint.as_view(), name="wbs-milestone"),
]
