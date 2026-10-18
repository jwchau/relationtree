"""Tree-membership permission checks. Every query for tree data goes through here.

Convention: 404 when the user can't see a record at all (so ids don't leak),
403 when they can see it but only have read access to its tree.
"""

from uuid import UUID

from django.contrib.auth.models import User
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from ninja.errors import HttpError

from relationtree.models import Connection, Person, Tree, TreeMembership

WRITE_ROLES = (TreeMembership.Role.OWNER, TreeMembership.Role.EDITOR)


def default_tree_for(user: User) -> Tree:
    """Where new records go while the UI has no tree switcher: the user's oldest owned tree."""
    membership = (
        TreeMembership.objects.select_related("tree")
        .filter(user=user, role=TreeMembership.Role.OWNER)
        .earliest("created_at")
    )
    return membership.tree


def require_write_access(user: User, tree_id: UUID) -> None:
    can_write = TreeMembership.objects.filter(
        tree=tree_id, user=user, role__in=WRITE_ROLES
    ).exists()
    if not can_write:
        raise HttpError(403, "You have read-only access to this tree")


def people_visible_to(user: User) -> QuerySet[Person]:
    return Person.objects.filter(tree__memberships__user=user)


def person_visible_to(user: User, person_id: UUID) -> Person:
    return get_object_or_404(people_visible_to(user), id=person_id)


def person_editable_by(user: User, person_id: UUID) -> Person:
    person = person_visible_to(user, person_id)
    require_write_access(user, person.tree_id)
    return person


def connection_editable_by(user: User, connection_id: UUID) -> Connection:
    visible = Connection.objects.filter(tree__memberships__user=user)
    connection = get_object_or_404(visible, id=connection_id)
    require_write_access(user, connection.tree_id)
    return connection
