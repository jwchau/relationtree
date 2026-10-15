from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from relationtree.models import Tree, TreeMembership


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_default_tree(sender: Any, instance: Any, created: bool, **kwargs: Any) -> None:
    """Every user owns a tree from day one, so the app works before sharing exists."""
    if not created:
        return
    with transaction.atomic():
        tree = Tree.objects.create(name=f"{instance.get_username()}'s tree")
        TreeMembership.objects.create(tree=tree, user=instance, role=TreeMembership.Role.OWNER)
