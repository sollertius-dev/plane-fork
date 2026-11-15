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
    WbsPlanEndpoint,
    WbsProjectsEndpoint,
    WbsTreeEndpoint,
)

P = "workspaces/<str:slug>/wbs/"
PLAN = P + "plans/<uuid:plan>/"

urlpatterns = [
    path(P + "projects/", WbsProjectsEndpoint.as_view(), name="wbs-projects"),
    path(P + "plans/", WbsPlanEndpoint.as_view(), name="wbs-plans"),
    path(PLAN, WbsPlanEndpoint.as_view(), name="wbs-plan"),
    path(PLAN + "tree/", WbsTreeEndpoint.as_view(), name="wbs-tree"),
    path(PLAN + "issues/", WbsIssueSearchEndpoint.as_view(), name="wbs-issue-search"),
    path(PLAN + "phases/", WbsPhaseEndpoint.as_view(), name="wbs-phases"),
    path(PLAN + "phases/<uuid:pk>/", WbsPhaseEndpoint.as_view(), name="wbs-phase"),
    path(PLAN + "nodes/", WbsNodeEndpoint.as_view(), name="wbs-nodes"),
    path(PLAN + "nodes/<uuid:pk>/", WbsNodeEndpoint.as_view(), name="wbs-node"),
    path(PLAN + "nodes/<uuid:pk>/issues/", WbsNodeIssueEndpoint.as_view(), name="wbs-node-issues"),
    path(PLAN + "nodes/<uuid:pk>/issues/<uuid:issue_id>/", WbsNodeIssueEndpoint.as_view(), name="wbs-node-issue"),
    path(PLAN + "milestones/", WbsMilestoneEndpoint.as_view(), name="wbs-milestones"),
    path(PLAN + "milestones/<uuid:pk>/", WbsMilestoneEndpoint.as_view(), name="wbs-milestone"),
]
