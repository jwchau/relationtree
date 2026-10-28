from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('relationtree', '0007_connection_kinds'),
    ]

    # The relationship summary in search.document_text() now tells former spouses and step and
    # adoptive relations apart ("Has a former spouse." rather than "Is married."). Existing
    # embeddings were built from the old wording, so mark everyone stale; embed_worker
    # re-embeds them in the background.
    operations = [
        migrations.RunSQL(
            "UPDATE relationtree_person SET content_version = content_version + 1",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
