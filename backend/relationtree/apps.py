from django.apps import AppConfig


class RelationTreeConfig(AppConfig):
    name = "relationtree"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self) -> None:
        from relationtree import signals  # noqa: F401
