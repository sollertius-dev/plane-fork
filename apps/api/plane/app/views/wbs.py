# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WBS schedules: phases, epics and touch points with man-day, effort and lead time.

A workspace has several WBS plans. Each plan is tied to a set of projects, and only work items of those
projects can be linked to it.

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
    Project,
    ProjectMember,
    Workspace,
    WorkspaceMember,
    WbsMilestone,
    WbsNode,
    WbsNodeIssue,
    WbsPhase,
    WbsPlan,
    WbsPlanProject,
)

READ = [ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST]
WRITE = [ROLE.ADMIN, ROLE.MEMBER]

# ---------------------------------------------------------------- input validation
class PlanInput(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=200)
    working_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), required=False, min_length=1, max_length=7
    )
    holidays = serializers.ListField(child=serializers.DateField(), required=False, max_length=400)


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


class WorkCalendar:
    """The working days of a plan: chosen weekdays (Monday is 0) minus the holidays.

    Lead time counts working days. A row that starts on a day off starts on the next working day.
    """

    LIMIT = 40000  # safety bound for the day-by-day walk

    def __init__(self, working_days, holidays):
        self.days = {int(d) for d in working_days} or {0, 1, 2, 3, 4}
        self.holidays = {date.fromisoformat(h) if isinstance(h, str) else h for h in holidays}

    def is_working(self, d):
        return d.weekday() in self.days and d not in self.holidays

    def first_working(self, d):
        for _ in range(4000):
            if self.is_working(d):
                return d
            d += timedelta(days=1)
        return d

    def span(self, start, n):
        """(first working day, day on which the n-th working day ends). A zero-length row is a one-day marker."""
        if not start:
            return None, None
        first = self.first_working(start)
        n = max(n, 1)
        d, counted, steps = first, 1, 0
        while counted < n and steps < self.LIMIT:
            d += timedelta(days=1)
            steps += 1
            if self.is_working(d):
                counted += 1
        if counted < n:  # absurd lengths: degrade to calendar days instead of walking on
            d += timedelta(days=n - counted)
        return first, d

    def count(self, a, b):
        """Working days from a to b, both included."""
        if not a or not b or b < a:
            return 0
        if (b - a).days > self.LIMIT:
            return (b - a).days + 1
        return sum(1 for i in range((b - a).days + 1) if self.is_working(a + timedelta(days=i)))


def plan_calendar(plan):
    return WorkCalendar(plan.working_days, plan.holidays)


def member_projects(user, workspace_id):
    """Projects of the workspace that the user is a member of: what the user may see and offer to a plan."""
    ids = ProjectMember.objects.filter(member=user, workspace_id=workspace_id, is_active=True).values_list(
        "project_id", flat=True
    )
    return Project.objects.filter(workspace_id=workspace_id, id__in=ids)


def get_plan(slug, plan_id):
    return WbsPlan.objects.filter(workspace__slug=slug, pk=plan_id).first()


def plan_issues(user, plan):
    """Work items a plan may use: projects of the plan AND projects the user belongs to."""
    plan_project_ids = WbsPlanProject.objects.filter(plan=plan).values_list("project_id", flat=True)
    return Issue.issue_objects.filter(
        workspace_id=plan.workspace_id,
        project_id__in=member_projects(user, plan.workspace_id).filter(id__in=plan_project_ids).values_list("id", flat=True),
    )


def not_found():
    return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)


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


def delete_phase_tree(phase):
    for epic in WbsNode.objects.filter(phase=phase, parent__isnull=True):
        delete_node_tree(epic)
    phase.delete()


# ---------------------------------------------------------------- plans
def plan_out(plan, user):
    mine = {p.id: p for p in member_projects(user, plan.workspace_id)}
    ids = list(WbsPlanProject.objects.filter(plan=plan).values_list("project_id", flat=True))
    shown = [mine[i] for i in ids if i in mine]
    return {
        "id": str(plan.id), "name": plan.name,
        "projects": [{"id": str(p.id), "identifier": p.identifier, "name": p.name} for p in shown],
        "hidden_projects": len(ids) - len(shown),  # projects of the plan that this user is not a member of
        "working_days": sorted(plan.working_days),
        "holidays": sorted(plan.holidays),
    }


def apply_calendar(plan, v):
    if "working_days" in v:
        plan.working_days = sorted(set(v["working_days"]))
    if "holidays" in v:
        plan.holidays = sorted({h.isoformat() for h in v["holidays"]})


def set_plan_projects(plan, user, project_ids):
    """Make the plan's projects exactly project_ids. Only projects the user belongs to can be added."""
    allowed = {p.id for p in member_projects(user, plan.workspace_id)}
    wanted = set(project_ids)
    # projects the user cannot see stay as they are: a member cannot add or drop what they do not see
    if not wanted <= allowed:
        return False
    current = {pp.project_id: pp for pp in WbsPlanProject.objects.filter(plan=plan)}
    for pid in wanted - set(current):
        WbsPlanProject.objects.create(workspace_id=plan.workspace_id, plan=plan, project_id=pid)
    for pid, pp in current.items():
        if pid in allowed and pid not in wanted:
            pp.delete()
    return True


class WbsProjectsEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        return Response([
            {"id": str(p.id), "identifier": p.identifier, "name": p.name}
            for p in member_projects(request.user, workspace.id).order_by("name")
        ])


class WbsPlanEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=READ, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        can_write = WorkspaceMember.objects.filter(
            workspace=workspace, member=request.user, is_active=True, role__in=[r.value for r in WRITE]
        ).exists()
        return Response({
            "can_write": can_write,
            "plans": [plan_out(p, request.user) for p in WbsPlan.objects.filter(workspace=workspace)],
        })

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug):
        data = PlanInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not v.get("name"):
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        workspace = Workspace.objects.get(slug=slug)
        with transaction.atomic():
            plan = WbsPlan(workspace=workspace, name=v["name"], sort_order=next_sort_order(WbsPlan, workspace=workspace))
            apply_calendar(plan, v)
            plan.save()
            if not set_plan_projects(plan, request.user, v.get("project_ids", [])):
                transaction.set_rollback(True)
                return Response({"error": "Unknown project"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(plan_out(plan, request.user), status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, plan):
        data = PlanInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        obj = get_plan(slug, plan)
        if not obj:
            return not_found()
        with transaction.atomic():
            if "name" in v:
                obj.name = v["name"]
            apply_calendar(obj, v)
            obj.save()
            if "project_ids" in v and not set_plan_projects(obj, request.user, v["project_ids"]):
                transaction.set_rollback(True)
                return Response({"error": "Unknown project"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(plan_out(obj, request.user))

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, plan):
        obj = get_plan(slug, plan)
        if not obj:
            return not_found()
        with transaction.atomic():
            for ph in WbsPhase.objects.filter(plan=obj):
                delete_phase_tree(ph)
            for m in WbsMilestone.objects.filter(plan=obj):
                m.delete()
            for pp in WbsPlanProject.objects.filter(plan=obj):
                pp.delete()
            obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- tree
class WbsTreeEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=READ, level="WORKSPACE")
    def get(self, request, slug, plan):
        plan_obj = get_plan(slug, plan)
        if not plan_obj:
            return not_found()
        workspace = plan_obj.workspace
        can_write = WorkspaceMember.objects.filter(
            workspace=workspace, member=request.user, is_active=True, role__in=[r.value for r in WRITE]
        ).exists()
        phases = list(WbsPhase.objects.filter(plan=plan_obj))
        cal = plan_calendar(plan_obj)

        nodes = list(WbsNode.objects.filter(phase__plan=plan_obj))
        visible = plan_issues(request.user, plan_obj)
        links = (
            WbsNodeIssue.objects.filter(node__phase__plan=plan_obj, issue__in=visible)
            .select_related("issue", "issue__state", "issue__project")
            .order_by("created_at")
        )
        assignees = defaultdict(dict)
        for ia in IssueAssignee.objects.filter(issue__in=[l.issue_id for l in links]).select_related(
            "assignee", "assignee__avatar_asset"
        ):
            assignees[ia.issue_id][ia.assignee_id] = {
                "id": str(ia.assignee_id), "name": ia.assignee.display_name, "avatar": ia.assignee.avatar_url or None,
            }
        by_node = defaultdict(list)
        for link in links:
            by_node[link.node_id].append(link)

        def node_out(n):
            days = lead_days(n.man_day, n.effort)
            start, end = cal.span(n.start_date, days)
            node_links = by_node.get(n.id, [])
            counts = defaultdict(int)
            who = {}
            for l in node_links:
                counts[l.issue.state.group if l.issue.state_id else "backlog"] += 1
                who.update(assignees.get(l.issue_id, {}))
            label, group = node_status(counts)
            return {
                "id": str(n.id), "title": n.title, "man_day": float(n.man_day), "effort": float(n.effort),
                "lead_days": days, "start": start, "end": end, "start_input": n.start_date,
                "issues": [
                    {
                        "id": str(l.issue_id), "ref": f"{l.issue.project.identifier}-{l.issue.sequence_id}",
                        "name": l.issue.name, "status": l.issue.state.name if l.issue.state_id else None,
                        "status_group": l.issue.state.group if l.issue.state_id else None,
                    }
                    for l in node_links
                ],
                "issues_done": counts.get("completed", 0),
                "status": label, "status_group": group, "assignees": sorted(who.values(), key=lambda u: (u["name"] or "").lower()),
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
                    e["lead_days"] = cal.count(r["start"], r["end"])
                e["touchpoints"] = tps
                epics.append(e)
            r = roll(epics)
            out.append({
                "id": str(ph.id), "name": ph.name, "color": ph.color, **r,
                "lead_days": cal.count(r["start"], r["end"]), "epics": epics,
            })
        return Response({
            "today": date.today(),
            "calendar": {"working_days": sorted(plan_obj.working_days), "holidays": sorted(plan_obj.holidays)},
            "can_write": can_write,
            "phases": out,
            "milestones": [
                {"id": str(m.id), "name": m.name, "day": m.day} for m in WbsMilestone.objects.filter(plan=plan_obj)
            ],
        })


# ---------------------------------------------------------------- phases
class WbsPhaseEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug, plan):
        data = PhaseInput(data=request.data)
        data.is_valid(raise_exception=True)
        if "name" not in data.validated_data:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        plan_obj = get_plan(slug, plan)
        if not plan_obj:
            return not_found()
        ph = WbsPhase.objects.create(
            workspace=plan_obj.workspace, plan=plan_obj, name=data.validated_data["name"],
            color=data.validated_data.get("color", "#64748b"), sort_order=next_sort_order(WbsPhase, plan=plan_obj),
        )
        return Response({"id": str(ph.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, plan, pk):
        data = PhaseInput(data=request.data)
        data.is_valid(raise_exception=True)
        ph = WbsPhase.objects.filter(plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not ph:
            return not_found()
        for k, v in data.validated_data.items():
            setattr(ph, k, v)
        ph.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, plan, pk):
        ph = WbsPhase.objects.filter(plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not ph:
            return not_found()
        with transaction.atomic():
            delete_phase_tree(ph)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- nodes
class WbsNodeEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug, plan):
        data = NodeCreateInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "title" not in v:
            return Response({"error": "title is required"}, status=status.HTTP_400_BAD_REQUEST)
        plan_obj = get_plan(slug, plan)
        if not plan_obj:
            return not_found()
        workspace = plan_obj.workspace
        if "parent_id" in v:
            parent = WbsNode.objects.filter(phase__plan=plan_obj, pk=v["parent_id"]).first()
            if not parent:
                return Response({"error": "Parent not found"}, status=status.HTTP_404_NOT_FOUND)
            if parent.parent_id:
                return Response(
                    {"error": "Only two levels below a phase: epic and touch point"}, status=status.HTTP_400_BAD_REQUEST
                )
            phase_id = parent.phase_id
        else:
            phase_id = v.get("phase_id")
            if not phase_id or not WbsPhase.objects.filter(plan=plan_obj, pk=phase_id).exists():
                return Response({"error": "A valid phase_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        node = WbsNode.objects.create(
            workspace=workspace, phase_id=phase_id, parent_id=v.get("parent_id"), title=v["title"],
            man_day=v.get("man_day", 0), effort=v.get("effort", 1), start_date=v.get("start_date"),
            sort_order=next_sort_order(WbsNode, workspace=workspace),
        )
        return Response({"id": str(node.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, plan, pk):
        data = NodeInput(data=request.data)
        data.is_valid(raise_exception=True)
        node = WbsNode.objects.filter(phase__plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not node:
            return not_found()
        for k, v in data.validated_data.items():
            setattr(node, k, v)
        node.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, plan, pk):
        node = WbsNode.objects.filter(phase__plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not node:
            return not_found()
        with transaction.atomic():
            delete_node_tree(node)  # Plane work items are untouched
        return Response(status=status.HTTP_204_NO_CONTENT)


class WbsNodeIssueEndpoint(BaseAPIView):
    """Link or unlink a Plane work item. Only work items the user can see (project member) can be linked."""

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug, plan, pk):
        data = IssueLinkInput(data=request.data)
        data.is_valid(raise_exception=True)
        plan_obj = get_plan(slug, plan)
        node = WbsNode.objects.filter(phase__plan=plan_obj, pk=pk).first() if plan_obj else None
        if not node:
            return not_found()
        # only work items of this plan's projects (and of projects the user belongs to) can be linked
        issue = plan_issues(request.user, plan_obj).filter(pk=data.validated_data["issue_id"]).first()
        if not issue:
            return Response({"error": "Work item not found in the projects of this WBS"}, status=status.HTTP_404_NOT_FOUND)
        WbsNodeIssue.objects.get_or_create(workspace_id=node.workspace_id, node=node, issue=issue)
        return Response({"ok": True}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, plan, pk, issue_id):
        link = WbsNodeIssue.objects.filter(
            node__phase__plan_id=plan, workspace__slug=slug, node_id=pk, issue_id=issue_id
        ).first()
        if not link:
            return not_found()
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- milestones
class WbsMilestoneEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def post(self, request, slug, plan):
        data = MilestoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "name" not in v or "day" not in v:
            return Response({"error": "name and day are required"}, status=status.HTTP_400_BAD_REQUEST)
        plan_obj = get_plan(slug, plan)
        if not plan_obj:
            return not_found()
        m = WbsMilestone.objects.create(workspace=plan_obj.workspace, plan=plan_obj, name=v["name"], day=v["day"])
        return Response({"id": str(m.id)}, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def patch(self, request, slug, plan, pk):
        data = MilestoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        m = WbsMilestone.objects.filter(plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not m:
            return not_found()
        for k, v in data.validated_data.items():
            setattr(m, k, v)
        m.save()
        return Response({"ok": True})

    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def delete(self, request, slug, plan, pk):
        m = WbsMilestone.objects.filter(plan_id=plan, workspace__slug=slug, pk=pk).first()
        if not m:
            return not_found()
        m.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- work item search
class WbsIssueSearchEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=WRITE, level="WORKSPACE")
    def get(self, request, slug, plan):
        plan_obj = get_plan(slug, plan)
        if not plan_obj:
            return not_found()
        q = (request.query_params.get("q") or "").strip()
        qs = plan_issues(request.user, plan_obj).select_related("project", "state")
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
