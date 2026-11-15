# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WBS schedule: calculation, roll-up, work item links and access rules."""

from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import (
    Issue,
    Project,
    ProjectMember,
    State,
    User,
    WbsNode,
    WorkspaceMember,
)

BASE = "/api/workspaces/{slug}/wbs/"


def url(workspace, path):
    return BASE.format(slug=workspace.slug) + path


@pytest.fixture
def project(db, workspace, create_user):
    p = Project.objects.create(name="Demo", identifier="DEM", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=p, member=create_user, role=20, is_active=True)
    return p


def make_project(workspace, user, identifier, member=True):
    p = Project.objects.create(name=f"Project {identifier}", identifier=identifier, workspace=workspace, created_by=user)
    if member:
        ProjectMember.objects.create(project=p, member=user, role=20, is_active=True)
    return p


def make_plan(client, workspace, name="WBS", projects=()):
    r = client.post(url(workspace, "plans/"), {"name": name, "project_ids": [str(p.id) for p in projects]}, format="json")
    assert r.status_code == 201, r.content
    return r.json()["id"]


@pytest.fixture
def plan(session_client, workspace, project):
    return make_plan(session_client, workspace, "Main", [project])


def make_issue(project, workspace, name, group):
    state = State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
    return Issue.objects.create(name=name, project=project, workspace=workspace, state=state)


def pu(workspace, plan, path):
    return url(workspace, f"plans/{plan}/{path}")


def tree(client, workspace, plan):
    return client.get(pu(workspace, plan, "tree/")).json()


def add_phase(client, workspace, plan, name="Phase"):
    return client.post(pu(workspace, plan, "phases/"), {"name": name}, format="json").json()["id"]


@pytest.mark.contract
@pytest.mark.django_db
class TestWbs:
    def test_new_plan_is_empty(self, session_client, workspace, plan):
        t = tree(session_client, workspace, plan)
        assert t["phases"] == [] and t["can_write"] is True

    def test_lead_time_and_rollup(self, session_client, workspace, plan):
        phase = add_phase(session_client, workspace, plan)
        epic = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "Epic"}, format="json").json()["id"]
        post = lambda body: session_client.post(pu(workspace, plan, "nodes/"), {"parent_id": epic, **body}, format="json")
        assert post({"title": "A", "man_day": 28, "effort": 0.7, "start_date": "2026-11-16"}).status_code == 201
        assert post({"title": "B", "man_day": 4, "effort": 0.2, "start_date": "2026-12-28"}).status_code == 201
        ph = tree(session_client, workspace, plan)["phases"][0]
        e = ph["epics"][0]
        assert [t["lead_days"] for t in e["touchpoints"]] == [40, 20]  # 28 / 0.7 and 4 / 0.2
        assert e["man_day"] == 32 and e["rolled"] is True
        assert (e["start"], e["end"]) == ("2026-11-16", "2027-01-16")
        assert ph["man_day"] == 32 and ph["end"] == "2027-01-16"

    def test_validation(self, session_client, workspace, plan):
        phase = add_phase(session_client, workspace, plan)
        epic = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        tp = session_client.post(pu(workspace, plan, "nodes/"), {"parent_id": epic, "title": "T"}, format="json").json()["id"]
        too_deep = session_client.post(pu(workspace, plan, "nodes/"), {"parent_id": tp, "title": "x"}, format="json")
        assert too_deep.status_code == status.HTTP_400_BAD_REQUEST
        for bad in ({"effort": 0}, {"effort": 1.5}, {"man_day": -1}):
            r = session_client.patch(pu(workspace, plan, f"nodes/{tp}/"), bad, format="json")
            assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert session_client.patch(pu(workspace, plan, f"nodes/{tp}/"), {"start_date": "2026-11-16"}, format="json").status_code == 200
        assert session_client.patch(pu(workspace, plan, f"nodes/{tp}/"), {"start_date": None}, format="json").status_code == 200

    def test_many_work_items_per_node_and_status(self, session_client, workspace, plan, project):
        phase = add_phase(session_client, workspace, plan)
        node = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        done = make_issue(project, workspace, "done one", "completed")
        todo = make_issue(project, workspace, "todo one", "unstarted")
        for i in (done, todo):
            assert session_client.post(pu(workspace, plan, f"nodes/{node}/issues/"), {"issue_id": str(i.id)}, format="json").status_code == 201
        assert session_client.post(pu(workspace, plan, f"nodes/{node}/issues/"), {"issue_id": str(done.id)}, format="json").status_code == 201
        n = tree(session_client, workspace, plan)["phases"][0]["epics"][0]
        assert len(n["issues"]) == 2 and n["issues_done"] == 1
        assert (n["status"], n["status_group"]) == ("In progress", "started")
        assert session_client.delete(pu(workspace, plan, f"nodes/{node}/issues/{todo.id}/")).status_code == 204
        n = tree(session_client, workspace, plan)["phases"][0]["epics"][0]
        assert (n["status"], n["status_group"]) == ("Done", "completed")

    def test_search_finds_by_name_and_key(self, session_client, workspace, plan, project):
        make_issue(project, workspace, "Price feeder", "started")
        by_name = session_client.get(pu(workspace, plan, "issues/") + "?q=feeder").json()
        assert [i["name"] for i in by_name] == ["Price feeder"]
        assert session_client.get(pu(workspace, plan, "issues/") + f"?q={by_name[0]['ref']}").json()[0]["name"] == "Price feeder"

    # ---- several WBS, each with its own projects
    def test_a_plan_only_works_with_its_own_projects(self, session_client, workspace, create_user):
        a, b, d = (make_project(workspace, create_user, i) for i in ("AAA", "BBB", "DDD"))
        x = make_plan(session_client, workspace, "X", [a, b])
        y = make_plan(session_client, workspace, "Y", [d])
        ia, ib, idd = (make_issue(p, workspace, f"item {p.identifier}", "started") for p in (a, b, d))

        names = lambda plan: sorted(i["name"] for i in session_client.get(pu(workspace, plan, "issues/")).json())
        assert names(x) == ["item AAA", "item BBB"] and names(y) == ["item DDD"]

        phase = add_phase(session_client, workspace, x)
        node = session_client.post(pu(workspace, x, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        link = lambda issue: session_client.post(pu(workspace, x, f"nodes/{node}/issues/"), {"issue_id": str(issue.id)}, format="json")
        assert link(ia).status_code == 201 and link(ib).status_code == 201
        assert link(idd).status_code == status.HTTP_404_NOT_FOUND  # a project of Y, not of X

    def test_removing_a_project_hides_its_links_and_adding_it_back_restores_them(self, session_client, workspace, create_user):
        a, b = make_project(workspace, create_user, "AAA"), make_project(workspace, create_user, "BBB")
        plan = make_plan(session_client, workspace, "X", [a, b])
        phase = add_phase(session_client, workspace, plan)
        node = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        for p in (a, b):
            i = make_issue(p, workspace, f"item {p.identifier}", "started")
            session_client.post(pu(workspace, plan, f"nodes/{node}/issues/"), {"issue_id": str(i.id)}, format="json")
        count = lambda: len(tree(session_client, workspace, plan)["phases"][0]["epics"][0]["issues"])
        assert count() == 2
        assert session_client.patch(pu(workspace, plan, ""), {"project_ids": [str(a.id)]}, format="json").status_code == 200
        assert count() == 1
        assert session_client.patch(pu(workspace, plan, ""), {"project_ids": [str(a.id), str(b.id)]}, format="json").status_code == 200
        assert count() == 2

    def test_data_of_one_plan_is_invisible_to_another(self, session_client, workspace, plan, project):
        phase = add_phase(session_client, workspace, plan, "Only in main")
        other = make_plan(session_client, workspace, "Other", [project])
        assert tree(session_client, workspace, other)["phases"] == []
        # a phase id of another plan cannot be used
        r = session_client.post(pu(workspace, other, "nodes/"), {"phase_id": phase, "title": "x"}, format="json")
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert session_client.delete(pu(workspace, other, f"phases/{phase}/")).status_code == status.HTTP_404_NOT_FOUND

    def test_plan_list_and_rename(self, session_client, workspace, plan, project):
        listing = session_client.get(url(workspace, "plans/")).json()
        assert [p["name"] for p in listing["plans"]] == ["Main"] and listing["can_write"] is True
        assert listing["plans"][0]["projects"][0]["identifier"] == "DEM"
        assert session_client.patch(pu(workspace, plan, ""), {"name": "Renamed"}, format="json").json()["name"] == "Renamed"
        assert session_client.patch(pu(workspace, plan, ""), {"name": ""}, format="json").status_code == 400

    def test_cannot_use_a_project_the_user_is_not_in(self, session_client, workspace, create_user):
        hidden = make_project(workspace, create_user, "SEC", member=False)
        r = session_client.post(url(workspace, "plans/"), {"name": "X", "project_ids": [str(hidden.id)]}, format="json")
        assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert session_client.get(url(workspace, "plans/")).json()["plans"] == []  # rolled back, no half-made plan
        assert hidden.identifier not in [p["identifier"] for p in session_client.get(url(workspace, "projects/")).json()]

    def test_delete_plan_removes_everything_and_keeps_work_items(self, session_client, workspace, plan, project):
        phase = add_phase(session_client, workspace, plan)
        node = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        issue = make_issue(project, workspace, "kept", "started")
        session_client.post(pu(workspace, plan, f"nodes/{node}/issues/"), {"issue_id": str(issue.id)}, format="json")
        session_client.post(pu(workspace, plan, "milestones/"), {"name": "M", "day": "2026-12-01"}, format="json")
        assert session_client.delete(pu(workspace, plan, "")).status_code == 204
        assert WbsNode.objects.filter(workspace=workspace).count() == 0
        assert session_client.get(pu(workspace, plan, "tree/")).status_code == status.HTTP_404_NOT_FOUND
        assert Issue.objects.filter(pk=issue.pk).exists()  # the Plane work item is untouched

    # ---- access
    def test_guest_reads_but_cannot_write(self, session_client, api_client, workspace, plan):
        guest = User.objects.create(email=f"g-{uuid4().hex[:6]}@plane.so", username=f"g_{uuid4().hex[:6]}")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        api_client.force_authenticate(user=guest)
        t = api_client.get(pu(workspace, plan, "tree/"))
        assert t.status_code == 200 and t.json()["can_write"] is False
        assert api_client.post(pu(workspace, plan, "phases/"), {"name": "x"}, format="json").status_code == status.HTTP_403_FORBIDDEN
        assert api_client.post(url(workspace, "plans/"), {"name": "x"}, format="json").status_code == status.HTTP_403_FORBIDDEN

    def test_other_workspace_member_is_refused(self, api_client, workspace, plan):
        outsider = User.objects.create(email=f"o-{uuid4().hex[:6]}@plane.so", username=f"o_{uuid4().hex[:6]}")
        api_client.force_authenticate(user=outsider)
        assert api_client.get(pu(workspace, plan, "tree/")).status_code == status.HTTP_403_FORBIDDEN

    def test_delete_epic_removes_touch_points(self, session_client, workspace, plan):
        phase = add_phase(session_client, workspace, plan)
        epic = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        session_client.post(pu(workspace, plan, "nodes/"), {"parent_id": epic, "title": "T"}, format="json")
        assert session_client.delete(pu(workspace, plan, f"nodes/{epic}/")).status_code == 204
        assert WbsNode.objects.filter(workspace=workspace).count() == 0

    def test_delete_phase_removes_everything_below(self, session_client, workspace, plan, project):
        phase = add_phase(session_client, workspace, plan)
        epic = session_client.post(pu(workspace, plan, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        tp = session_client.post(pu(workspace, plan, "nodes/"), {"parent_id": epic, "title": "T"}, format="json").json()["id"]
        issue = make_issue(project, workspace, "kept", "started")
        session_client.post(pu(workspace, plan, f"nodes/{tp}/issues/"), {"issue_id": str(issue.id)}, format="json")
        assert session_client.delete(pu(workspace, plan, f"phases/{phase}/")).status_code == 204
        assert WbsNode.objects.filter(workspace=workspace).count() == 0
        assert Issue.objects.filter(pk=issue.pk).exists()
