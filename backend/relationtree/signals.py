from typing import Any
from uuid import UUID

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from relationtree.models import Connection, Person, Tree, TreeMembership
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


def _mark_for_reembedding(*person_ids: UUID) -> None:
    # Same atomic bump as Person.save(), so it composes with the embed worker's version check.
    Person.objects.filter(id__in=person_ids).update(content_version=F("content_version") + 1)


@receiver(post_save, sender=Connection)
def connection_added(sender: Any, instance: Connection, created: bool, **kwargs: Any) -> None:
    """A connection changes both people's relationship summaries (search.document_text)."""
    if created:
        _mark_for_reembedding(instance.person_a_id, instance.person_b_id)


@receiver(post_delete, sender=Connection)
def connection_removed(sender: Any, instance: Connection, **kwargs: Any) -> None:
    """Also fires for connections removed because a person was deleted (cascade)."""
    _mark_for_reembedding(instance.person_a_id, instance.person_b_id)
