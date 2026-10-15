"""Tree-membership permission checks. Every query for tree data goes through here."""

from uuid import UUID

from django.contrib.auth.models import User
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from ninja.errors import HttpError

from relationtree.models import Person, Tree, TreeMembership


def default_tree_for(user: User) -> Tree:
    """Where new records go while the UI has no tree switcher: the user's oldest owned tree."""
    membership = (
        TreeMembership.objects.select_related("tree")
        .filter(user=user, role=TreeMembership.Role.OWNER)
        .earliest("created_at")
    )
    return membership.tree


def people_visible_to(user: User) -> QuerySet[Person]:
    return Person.objects.filter(tree__memberships__user=user)


def person_visible_to(user: User, person_id: UUID) -> Person:
    """404 (not 403) for people in trees the user isn't a member of, so ids don't leak."""
    return get_object_or_404(people_visible_to(user), id=person_id)


WRITE_ROLES = (TreeMembership.Role.OWNER, TreeMembership.Role.EDITOR)


def person_editable_by(user: User, person_id: UUID) -> Person:
    """404 if the user can't see the person at all; 403 if they can see but not edit it."""
    person = person_visible_to(user, person_id)
    can_write = TreeMembership.objects.filter(
        tree=person.tree_id, user=user, role__in=WRITE_ROLES
    ).exists()
    if not can_write:
        raise HttpError(403, "You have read-only access to this tree")
    return person
