from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from relationtree.models import Person, Tree, TreeMembership
from relationtree.photos import delete_photo_quietly


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_default_tree(sender: Any, instance: Any, created: bool, **kwargs: Any) -> None:
    """Every user owns a tree from day one, so the app works before sharing exists."""
    if not created:
        return
    with transaction.atomic():
        tree = Tree.objects.create(name=f"{instance.get_username()}'s tree")
        TreeMembership.objects.create(tree=tree, user=instance, role=TreeMembership.Role.OWNER)


@receiver(post_delete, sender=Person)
def delete_person_photo(sender: Any, instance: Person, **kwargs: Any) -> None:
    """Covers API deletes, admin deletes, and people removed by a tree cascade."""
    if instance.photo_key:
        delete_photo_quietly(instance.photo_key)
