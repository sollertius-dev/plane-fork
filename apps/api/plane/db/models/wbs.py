# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

# Module imports
from .base import BaseModel


class WbsPhase(BaseModel):
    """Top level of the WBS schedule (for example Foundation, Market data)."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="wbs_phases")
    name = models.CharField(max_length=120)
    color = models.CharField(max_length=7, default="#3b82f6")
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "WBS phase"
        verbose_name_plural = "WBS phases"
        db_table = "wbs_phases"
        ordering = ("sort_order", "created_at")


class WbsMilestone(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="wbs_milestones")
    name = models.CharField(max_length=120)
    day = models.DateField()

    class Meta:
        verbose_name = "WBS milestone"
        verbose_name_plural = "WBS milestones"
        db_table = "wbs_milestones"
        ordering = ("day", "created_at")


class WbsNode(BaseModel):
    """An epic (parent is null) or a touch point (parent is an epic) inside a phase.

    Lead time is not stored: it is man_day / effort and is calculated when the tree is read.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="wbs_nodes")
    phase = models.ForeignKey(WbsPhase, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    title = models.CharField(max_length=300)
    man_day = models.DecimalField(max_digits=8, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    # Share of a person's time given to the item: 0 < effort <= 1
    effort = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=1,
        validators=[MinValueValidator(0.01), MaxValueValidator(1)],
    )
    start_date = models.DateField(null=True, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "WBS node"
        verbose_name_plural = "WBS nodes"
        db_table = "wbs_nodes"
        ordering = ("sort_order", "created_at")


class WbsNodeIssue(BaseModel):
    """Link between a WBS node and a Plane work item. A node can have many work items."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="wbs_node_issues")
    node = models.ForeignKey(WbsNode, on_delete=models.CASCADE, related_name="issue_links")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="wbs_links")

    class Meta:
        verbose_name = "WBS node work item"
        verbose_name_plural = "WBS node work items"
        db_table = "wbs_node_issues"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["node", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="wbs_node_issue_unique_when_not_deleted",
            )
        ]
