# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WBS schedule: phases, epics and touch points with man-day, effort and lead time.

The tree is read in one call. Lead time (man_day / effort), roll-ups and the status of a
node (from its linked work items) are calculated here and never stored.
"""

import math
from collections import defaultdict
from decimal import Decimal
from datetime import date, timedelta

# Django imports
from django.db import transaction
from django.db.models import Max, Q

# Third party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    Issue,
    IssueAssignee,
    ProjectMember,
    Workspace,
    WorkspaceMember,
    WbsMilestone,
    WbsNode,
    WbsNodeIssue,
    WbsPhase,
)

READ = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]
WRITE = [ROLE.ADMIN, ROLE.MEMBER]

# The phases a workspace starts with (draft in docs/plans/001-wbs-extension-plan.md)
DEFAULT_PHASES = [("Foundation", "#3b82f6"), ("Market data", "#10b981"), ("Analysis", "#f59e0b"), ("News", "#a855f7")]


# ---------------------------------------------------------------- input validation
class PhaseInput(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)


class NodeInput(serializers.Serializer):
    title = serializers.CharField(max_length=300, required=False)
    man_day = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=0, required=False)
    effort = serializers.DecimalField(max_digits=4, decimal_places=2, min_value=Decimal("0.01"), max_value=Decimal("1"), required=False)
    start_date = serializers.DateField(required=False, allow_null=True)  # null clears the date


class NodeCreateInput(NodeInput):
    phase_id = serializers.UUIDField(required=False)
    parent_id = serializers.UUIDField(required=False)


class MilestoneInput(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    day = serializers.DateField(required=False)


class IssueLinkInput(serializers.Serializer):
    issue_id = serializers.UUIDField()


def lead_days(man_day, effort):
    man_day, effort = float(man_day or 0), float(effort or 0)
    return math.ceil(man_day / effort) if man_day > 0 and effort > 0 else 0


def span(start, days):
    """Calendar-day span. A zero-day item with a start date is a one-day marker."""
    if not start:
        return None, None
    return start, start + timedelta(days=max(days, 1) - 1)


def visible_issues(user, workspace_id):
    """Work items of projects the user is a member of: the same visibility rule as the rest of Plane."""
    project_ids = ProjectMember.objects.filter(
        member=user, workspace_id=workspace_id, is_active=True
    ).values_list("project_id", flat=True)
    return Issue.issue_objects.filter(workspace_id=workspace_id, project_id__in=project_ids)


def next_sort_order(model, **filters):
    last = model.objects.filter(**filters).aggregate(m=Max("sort_order"))["m"]
    return last + 10000 if last is not None else 65535


def node_status(group_counts):
    """Status of a node from the state groups of its linked work items."""
    total = sum(group_counts.values())
    if total == 0:
        return None, None
    done = group_counts.get("completed", 0)
    started = group_counts.get("started", 0)
    cancelled = group_counts.get("cancelled", 0)
    active = total - cancelled
    if active == 0:
        return "Cancelled", "cancelled"
    if done == active:
        return "Done", "completed"
    if done or started:
        return "In progress", "started"
    return "Not started", "unstarted"


def delete_node_tree(node):
    """Soft-delete a node with its touch points and links right away (Plane's own cascade runs in a background task)."""
    for n in [node, *WbsNode.objects.filter(parent=node)]:
        for link in WbsNodeIssue.objects.filter(node=n):
            link.delete()
        if n.pk != node.pk:
            n.delete()
    node.delete()


# ---------------------------------------------------------------- tree
class WbsTreeEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=READ, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        can_write = WorkspaceMember.objects.filter(
            workspace=workspace, member=request.user, is_active=True, role__in=[r.value for r in WRITE]
        ).exists()
        phases = list(WbsPhase.objects.filter(workspace=workspace))
        if not phases:
            with transaction.atomic():
                if WbsPhase.objects.select_for_update().filter(workspace=workspace).count() == 0:
                    for i, (name, color) in enumerate(DEFAULT_PHASES):
                        WbsPhase.objects.create(workspace=workspace, name=name, color=color, sort_order=65535 + i * 10000)
            phases = list(WbsPhase.objects.filter(workspace=workspace))

        nodes = list(WbsNode.objects.filter(workspace=workspace))
        visible = visible_issues(request.user, workspace.id)
        links = (
            WbsNodeIssue.objects.filter(workspace=workspace, issue__in=visible)
            .select_related("issue", "issue__state", "issue__project")
            .order_by("created_at")
        )
        assignees = defaultdict(set)
        for ia in IssueAssignee.objects.filter(issue__in=[l.issue_id for l in links]).select_related("assignee"):
            assignees[ia.issue_id].add(ia.assignee.display_name)
        by_node = defaultdict(list)
        for link in links:
            by_node[link.node_id].append(link)

        def node_out(n):
            days = lead_days(n.man_day, n.effort)
            start, end = span(n.start_date, days)
            node_links = by_node.get(n.id, [])
            counts = defaultdict(int)
            who = set()
            for l in node_links:
                counts[l.issue.state.group if l.issue.state_id else "backlog"] += 1
                who |= assignees.get(l.issue_id, set())
            label, group = node_status(counts)
            return {
                "id": str(n.id), "title": n.title, "man_day": float(n.man_day), "effort": float(n.effort),
                "lead_days": days, "start": start, "end": end,
                "issues": [
                    {
                        "id": str(l.issue_id), "ref": f"{l.issue.project.identifier}-{l.issue.sequence_id}",
                        "name": l.issue.name, "status": l.issue.state.name if l.issue.state_id else None,
                        "status_group": l.issue.state.group if l.issue.state_id else None,
                    }
                    for l in node_links
                ],
                "issues_done": counts.get("completed", 0),
                "status": label, "status_group": group, "assignees": ", ".join(sorted(who)) or None,
            }

        def roll(items):
            starts = [i["start"] for i in items if i["start"]]
            ends = [i["end"] for i in items if i["end"]]
            return {
                "man_day": round(sum(i["man_day"] for i in items), 2),
                "start": min(starts) if starts else None,
                "end": max(ends) if ends else None,
            }

        children = defaultdict(list)
        for n in nodes:
            if n.parent_id:
                children[n.parent_id].append(n)

        out = []
        for ph in phases:
            epics = []
            for ep in [n for n in nodes if n.phase_id == ph.id and n.parent_id is None]:
                tps = [node_out(c) for c in children.get(ep.id, [])]
                e = node_out(ep)
                if tps:  # an epic with touch points is the roll-up of them
                    r = roll(tps)
                    e.update(r, rolled=True, children_done=sum(1 for t in tps if t["status_group"] == "completed"))
                    e["lead_days"] = (r["end"] - r["start"]).days + 1 if r["start"] else 0
                e["touchpoints"] = tps
                epics.append(e)
            r = roll(epics)
            out.append({
                "id": str(ph.id), "name": ph.name, "color": ph.color, **r,
                "lead_days": (r["end"] - r["start"]).days + 1 if r["start"] else 0, "epics": epics,
            })
        return Response({
            "today": date.today(),
            "can_write": can_write,
            "phases": out,
            "milestones": [
                {"id": str(m.id), "name": m.name, "day": m.day} for m in WbsMilestone.objects.filter(workspace=workspace)
            ],
        })


# ---------------------------------------------------------------- phases
class WbsPhaseEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug):
        data = PhaseInput(data=request.data)
        data.is_valid(raise_exception=True)
        if "name" not in data.validated_data:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        workspace = Workspace.objects.get(slug=slug)
        ph = WbsPhase.objects.create(
            workspace=workspace, name=data.validated_data["name"], color=data.validated_data.get("color", "#64748b"),
            sort_order=next_sort_order(WbsPhase, workspace=workspace),
        )
        return Response({"id": str(ph.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, pk):
        data = PhaseInput(data=request.data)
        data.is_valid(raise_exception=True)
        ph = WbsPhase.objects.filter(workspace__slug=slug, pk=pk).first()
        if not ph:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        for k, v in data.validated_data.items():
            setattr(ph, k, v)
        ph.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, pk):
        ph = WbsPhase.objects.filter(workspace__slug=slug, pk=pk).first()
        if not ph:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            for epic in WbsNode.objects.filter(phase=ph, parent__isnull=True):
                delete_node_tree(epic)
            ph.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- nodes
class WbsNodeEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug):
        data = NodeCreateInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "title" not in v:
            return Response({"error": "title is required"}, status=status.HTTP_400_BAD_REQUEST)
        workspace = Workspace.objects.get(slug=slug)
        if "parent_id" in v:
            parent = WbsNode.objects.filter(workspace=workspace, pk=v["parent_id"]).first()
            if not parent:
                return Response({"error": "Parent not found"}, status=status.HTTP_404_NOT_FOUND)
            if parent.parent_id:
                return Response(
                    {"error": "Only two levels below a phase: epic and touch point"}, status=status.HTTP_400_BAD_REQUEST
                )
            phase_id = parent.phase_id
        else:
            phase_id = v.get("phase_id")
            if not phase_id or not WbsPhase.objects.filter(workspace=workspace, pk=phase_id).exists():
                return Response({"error": "A valid phase_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        node = WbsNode.objects.create(
            workspace=workspace, phase_id=phase_id, parent_id=v.get("parent_id"), title=v["title"],
            man_day=v.get("man_day", 0), effort=v.get("effort", 1), start_date=v.get("start_date"),
            sort_order=next_sort_order(WbsNode, workspace=workspace),
        )
        return Response({"id": str(node.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, pk):
        data = NodeInput(data=request.data)
        data.is_valid(raise_exception=True)
        node = WbsNode.objects.filter(workspace__slug=slug, pk=pk).first()
        if not node:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        for k, v in data.validated_data.items():
            setattr(node, k, v)
        node.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, pk):
        node = WbsNode.objects.filter(workspace__slug=slug, pk=pk).first()
        if not node:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            delete_node_tree(node)  # Plane work items are untouched
        return Response(status=status.HTTP_204_NO_CONTENT)


class WbsNodeIssueEndpoint(BaseAPIView):
    """Link or unlink a Plane work item. Only work items the user can see (project member) can be linked."""

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug, pk):
        data = IssueLinkInput(data=request.data)
        data.is_valid(raise_exception=True)
        node = WbsNode.objects.filter(workspace__slug=slug, pk=pk).first()
        if not node:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        issue = visible_issues(request.user, node.workspace_id).filter(pk=data.validated_data["issue_id"]).first()
        if not issue:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)
        WbsNodeIssue.objects.get_or_create(workspace_id=node.workspace_id, node=node, issue=issue)
        return Response({"ok": True}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, pk, issue_id):
        link = WbsNodeIssue.objects.filter(workspace__slug=slug, node_id=pk, issue_id=issue_id).first()
        if not link:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- milestones
class WbsMilestoneEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug):
        data = MilestoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "name" not in v or "day" not in v:
            return Response({"error": "name and day are required"}, status=status.HTTP_400_BAD_REQUEST)
        m = WbsMilestone.objects.create(workspace=Workspace.objects.get(slug=slug), name=v["name"], day=v["day"])
        return Response({"id": str(m.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, pk):
        data = MilestoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        m = WbsMilestone.objects.filter(workspace__slug=slug, pk=pk).first()
        if not m:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        for k, v in data.validated_data.items():
            setattr(m, k, v)
        m.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, pk):
        m = WbsMilestone.objects.filter(workspace__slug=slug, pk=pk).first()
        if not m:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        m.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- work item search
class WbsIssueSearchEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        q = (request.query_params.get("q") or "").strip()
        qs = visible_issues(request.user, workspace.id).select_related("project", "state")
        if q:
            cond = Q(name__icontains=q)
            if "-" in q:
                ident, _, seq = q.rpartition("-")
                if seq.isdigit():
                    cond |= Q(project__identifier__iexact=ident, sequence_id=int(seq))
            qs = qs.filter(cond)
        qs = qs.order_by("project__identifier", "sequence_id")[:20]
        return Response([
            {"id": str(i.id), "ref": f"{i.project.identifier}-{i.sequence_id}", "name": i.name,
             "status": i.state.name if i.state_id else None}
            for i in qs
        ])
