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


def make_issue(project, workspace, name, group):
    state = State.objects.create(name=group.title(), group=group, project=project, workspace=workspace)
    return Issue.objects.create(name=name, project=project, workspace=workspace, state=state)


def tree(client, workspace):
    return client.get(url(workspace, "tree/")).json()


@pytest.mark.contract
@pytest.mark.django_db
class TestWbs:
    def test_first_read_seeds_phases(self, session_client, workspace):
        t = tree(session_client, workspace)
        assert [p["name"] for p in t["phases"]] == ["Foundation", "Market data", "Analysis", "News"]
        assert t["can_write"] is True
        assert len(tree(session_client, workspace)["phases"]) == 4  # not seeded twice

    def test_lead_time_and_rollup(self, session_client, workspace):
        phase = tree(session_client, workspace)["phases"][0]["id"]
        epic = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "Epic"}, format="json").json()["id"]
        post = lambda body: session_client.post(url(workspace, "nodes/"), {"parent_id": epic, **body}, format="json")
        assert post({"title": "A", "man_day": 28, "effort": 0.7, "start_date": "2026-11-16"}).status_code == 201
        assert post({"title": "B", "man_day": 4, "effort": 0.2, "start_date": "2026-12-28"}).status_code == 201
        ph = tree(session_client, workspace)["phases"][0]
        e = ph["epics"][0]
        assert [t["lead_days"] for t in e["touchpoints"]] == [40, 20]  # 28 / 0.7 and 4 / 0.2
        assert e["man_day"] == 32 and e["rolled"] is True
        assert (e["start"], e["end"]) == ("2026-11-16", "2027-01-16")
        assert ph["man_day"] == 32 and ph["end"] == "2027-01-16"

    def test_validation(self, session_client, workspace):
        phase = tree(session_client, workspace)["phases"][0]["id"]
        epic = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        tp = session_client.post(url(workspace, "nodes/"), {"parent_id": epic, "title": "T"}, format="json").json()["id"]
        too_deep = session_client.post(url(workspace, "nodes/"), {"parent_id": tp, "title": "x"}, format="json")
        assert too_deep.status_code == status.HTTP_400_BAD_REQUEST
        for bad in ({"effort": 0}, {"effort": 1.5}, {"man_day": -1}):
            r = session_client.patch(url(workspace, f"nodes/{tp}/"), bad, format="json")
            assert r.status_code == status.HTTP_400_BAD_REQUEST
        assert session_client.patch(url(workspace, f"nodes/{tp}/"), {"start_date": "2026-11-16"}, format="json").status_code == 200
        assert session_client.patch(url(workspace, f"nodes/{tp}/"), {"start_date": None}, format="json").status_code == 200

    def test_many_work_items_per_node_and_status(self, session_client, workspace, project):
        phase = tree(session_client, workspace)["phases"][0]["id"]
        node = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        done = make_issue(project, workspace, "done one", "completed")
        todo = make_issue(project, workspace, "todo one", "unstarted")
        for i in (done, todo):
            assert session_client.post(url(workspace, f"nodes/{node}/issues/"), {"issue_id": str(i.id)}, format="json").status_code == 201
        # linking twice is harmless
        assert session_client.post(url(workspace, f"nodes/{node}/issues/"), {"issue_id": str(done.id)}, format="json").status_code == 201
        n = tree(session_client, workspace)["phases"][0]["epics"][0]
        assert len(n["issues"]) == 2 and n["issues_done"] == 1
        assert (n["status"], n["status_group"]) == ("In progress", "started")
        assert session_client.delete(url(workspace, f"nodes/{node}/issues/{todo.id}/")).status_code == 204
        n = tree(session_client, workspace)["phases"][0]["epics"][0]
        assert (n["status"], n["status_group"]) == ("Done", "completed")

    def test_search_finds_by_name_and_key(self, session_client, workspace, project):
        make_issue(project, workspace, "Price feeder", "started")
        by_name = session_client.get(url(workspace, "issues/") + "?q=feeder").json()
        assert [i["name"] for i in by_name] == ["Price feeder"]
        assert session_client.get(url(workspace, "issues/") + f"?q={by_name[0]['ref']}").json()[0]["name"] == "Price feeder"

    def test_cannot_link_work_item_of_a_project_the_user_is_not_in(self, session_client, workspace, create_user):
        other = Project.objects.create(name="Secret", identifier="SEC", workspace=workspace, created_by=create_user)
        hidden = make_issue(other, workspace, "hidden", "started")  # create_user is not a member of "other"
        phase = tree(session_client, workspace)["phases"][0]["id"]
        node = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        r = session_client.post(url(workspace, f"nodes/{node}/issues/"), {"issue_id": str(hidden.id)}, format="json")
        assert r.status_code == status.HTTP_404_NOT_FOUND
        assert session_client.get(url(workspace, "issues/") + "?q=hidden").json() == []

    def test_guest_reads_but_cannot_write(self, api_client, workspace):
        guest = User.objects.create(email=f"g-{uuid4().hex[:6]}@plane.so", username=f"g_{uuid4().hex[:6]}")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        api_client.force_authenticate(user=guest)
        t = api_client.get(url(workspace, "tree/"))
        assert t.status_code == 200 and t.json()["can_write"] is False
        assert api_client.post(url(workspace, "phases/"), {"name": "x"}, format="json").status_code == status.HTTP_403_FORBIDDEN

    def test_other_workspace_member_is_refused(self, api_client, workspace):
        outsider = User.objects.create(email=f"o-{uuid4().hex[:6]}@plane.so", username=f"o_{uuid4().hex[:6]}")
        api_client.force_authenticate(user=outsider)
        assert api_client.get(url(workspace, "tree/")).status_code == status.HTTP_403_FORBIDDEN

    def test_delete_epic_removes_touch_points(self, session_client, workspace):
        phase = tree(session_client, workspace)["phases"][0]["id"]
        epic = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        session_client.post(url(workspace, "nodes/"), {"parent_id": epic, "title": "T"}, format="json")
        assert session_client.delete(url(workspace, f"nodes/{epic}/")).status_code == 204
        assert WbsNode.objects.filter(workspace=workspace).count() == 0

    def test_delete_phase_removes_everything_below(self, session_client, workspace, project):
        phase = tree(session_client, workspace)["phases"][0]["id"]
        epic = session_client.post(url(workspace, "nodes/"), {"phase_id": phase, "title": "E"}, format="json").json()["id"]
        tp = session_client.post(url(workspace, "nodes/"), {"parent_id": epic, "title": "T"}, format="json").json()["id"]
        issue = make_issue(project, workspace, "kept", "started")
        session_client.post(url(workspace, f"nodes/{tp}/issues/"), {"issue_id": str(issue.id)}, format="json")
        assert session_client.delete(url(workspace, f"phases/{phase}/")).status_code == 204
        assert WbsNode.objects.filter(workspace=workspace).count() == 0
        assert Issue.objects.filter(pk=issue.pk).exists()  # the Plane work item is untouched
