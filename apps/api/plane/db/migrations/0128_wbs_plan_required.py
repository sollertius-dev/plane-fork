# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    # Separate from 0127: PostgreSQL refuses to alter a table that has pending trigger events from the data move.
    dependencies = [
        ("db", "0127_wbs_plans"),
    ]

    operations = [
        migrations.AlterField(
            model_name="wbsmilestone",
            name="plan",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="milestones", to="db.wbsplan"),
        ),
        migrations.AlterField(
            model_name="wbsphase",
            name="plan",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="phases", to="db.wbsplan"),
        ),
    ]
