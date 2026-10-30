from datetime import date
from typing import Annotated
from uuid import UUID

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import StringConstraints

from relationtree.access import membership_in, require_owner
from relationtree.connections_api import ConnectionOut
from relationtree.models import Connection, Person, Tree, TreeMembership
from relationtree.photos import get_photo_storage
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["trees"], auth=django_auth)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LAST_OWNER = "A tree needs at least one owner. Make someone else an owner first."


class TreeIn(Schema):
    name: Name


class TreeUpdateIn(Schema):
    """Whatever the owner is changing; categories left out of category_hues keep theirs."""

    name: Name | None = None
    category_hues: dict[Person.RelationshipCategory, Tree.Hue] | None = None


class TreeOut(Schema):
    id: UUID
    name: str
    role: TreeMembership.Role
    member_count: int
    category_hues: dict[Person.RelationshipCategory, Tree.Hue]


class MemberIn(Schema):
    username: str
    role: TreeMembership.Role


class RoleIn(Schema):
    role: TreeMembership.Role


class MemberOut(Schema):
    user_id: int
    username: str
    role: TreeMembership.Role
    is_me: bool


class GraphPersonOut(Schema):
    """A person as the map draws them. No contact details, context or notes."""

    id: UUID
    name: str
    photo_url: str | None
    birthday: date | None
    relationship_category: Person.RelationshipCategory | None
    is_me: bool
    # The map files people by their relationship_category around an owner's "me" (the
    # category records how an owner knows them), so it needs every owner's, not just yours.
    is_owner_me: bool


class TreeGraphOut(Schema):
    people: list[GraphPersonOut]
    connections: list[ConnectionOut]


def tree_out(membership: TreeMembership, member_count: int | None = None) -> TreeOut:
    if member_count is None:
        member_count = TreeMembership.objects.filter(tree=membership.tree_id).count()
    return TreeOut(
        id=membership.tree_id,
        name=membership.tree.name,
        role=TreeMembership.Role(membership.role),
        member_count=member_count,
        category_hues={
            Person.RelationshipCategory(category): hue
            for category, hue in membership.tree.hues().items()
        },
    )


def _member_out(request: AuthedRequest, membership: TreeMembership) -> MemberOut:
    return MemberOut(
        user_id=membership.user_id,
        username=membership.user.username,
        role=TreeMembership.Role(membership.role),
        is_me=membership.user_id == request.user.pk,
    )


def _is_last_owner(membership: TreeMembership) -> bool:
    """Whether this member is the tree's only owner. Locks the owners' rows, so call it in a
    transaction: two owners demoting each other at once can't both succeed."""
    owners = list(
        TreeMembership.objects.select_for_update()
        .filter(tree=membership.tree_id, role=TreeMembership.Role.OWNER)
        .values_list("user_id", flat=True)
    )
    return owners == [membership.user_id]


@router.get("/trees", response=list[TreeOut])
def list_trees(request: AuthedRequest) -> list[TreeOut]:
    memberships = (
        TreeMembership.objects.filter(user=request.user)
        .select_related("tree")
        .annotate(member_count=Count("tree__memberships"))
        .order_by("tree__name")
    )
    return [tree_out(m, m.member_count) for m in memberships]


@router.post("/trees", response={201: TreeOut})
def create_tree(request: AuthedRequest, payload: TreeIn) -> Status[TreeOut]:
    with transaction.atomic():
        tree = Tree.objects.create(name=payload.name)
        membership = TreeMembership.objects.create(
            tree=tree, user=request.user, role=TreeMembership.Role.OWNER
        )
    return Status(201, tree_out(membership))


@router.patch("/trees/{tree_id}", response=TreeOut)
def update_tree(request: AuthedRequest, tree_id: UUID, payload: TreeUpdateIn) -> TreeOut:
    membership = membership_in(request.user, tree_id)
    require_owner(membership)
    tree = membership.tree
    if payload.name is not None:
        tree.name = payload.name
    if payload.category_hues is not None:
        tree.category_hues = tree.category_hues | {
            category.value: hue.value for category, hue in payload.category_hues.items()
        }
    tree.save(update_fields=["name", "category_hues"])
    return tree_out(membership)


@router.get("/trees/{tree_id}/graph", response=TreeGraphOut)
def tree_graph(request: AuthedRequest, tree_id: UUID) -> TreeGraphOut:
    """The whole tree for the map, in a fixed number of queries whatever its size."""
    membership = membership_in(request.user, tree_id)
    owner_mes = set(
        TreeMembership.objects.filter(
            tree=tree_id, role=TreeMembership.Role.OWNER, me__isnull=False
        ).values_list("me_id", flat=True)
    )
    people = [
        GraphPersonOut(
            id=p.id,
            name=p.name,
            # Signing is local, but only touch storage when there's a photo, like PersonOut.
            # The thumbnail when there is one, also like PersonOut.
            photo_url=(
                get_photo_storage().presign_download(p.photo_thumb_key or p.photo_key)
                if p.photo_key
                else None
            ),
            birthday=p.birthday,
            relationship_category=(
                Person.RelationshipCategory(p.relationship_category)
                if p.relationship_category
                else None
            ),
            is_me=p.id == membership.me_id,
            is_owner_me=p.id in owner_mes,
        )
        for p in Person.objects.filter(tree=tree_id).order_by("name")
    ]
    connections = [
        ConnectionOut(
            id=c.id,
            person_a_id=c.person_a_id,
            person_b_id=c.person_b_id,
            type=Connection.RelationshipType(c.type),
            parent_kind=Connection.ParentKind(c.parent_kind) if c.parent_kind else None,
            ended=c.ended,
        )
        for c in Connection.objects.filter(tree=tree_id).order_by("id")
    ]
    return TreeGraphOut(people=people, connections=connections)


@router.get("/trees/{tree_id}/members", response=list[MemberOut])
def list_members(request: AuthedRequest, tree_id: UUID) -> list[MemberOut]:
    membership_in(request.user, tree_id)
    members = (
        TreeMembership.objects.filter(tree=tree_id)
        .select_related("user")
        .order_by("user__username")
    )
    return [_member_out(request, m) for m in members]


@router.post("/trees/{tree_id}/members", response={201: MemberOut, 404: ErrorOut, 409: ErrorOut})
def add_member(
    request: AuthedRequest, tree_id: UUID, payload: MemberIn
) -> Status[MemberOut | ErrorOut]:
    require_owner(membership_in(request.user, tree_id))
    user = User.objects.filter(username=payload.username.strip()).first()
    if user is None:
        return Status(404, ErrorOut(detail="No user with that username"))
    try:
        with transaction.atomic():
            added = TreeMembership.objects.create(tree_id=tree_id, user=user, role=payload.role)
    except IntegrityError:
        return Status(409, ErrorOut(detail=f"{user.username} is already a member"))
    return Status(201, _member_out(request, added))


@router.patch("/trees/{tree_id}/members/{user_id}", response={200: MemberOut, 409: ErrorOut})
def change_role(
    request: AuthedRequest, tree_id: UUID, user_id: int, payload: RoleIn
) -> Status[MemberOut | ErrorOut]:
    require_owner(membership_in(request.user, tree_id))
    with transaction.atomic():
        member = get_object_or_404(
            TreeMembership.objects.select_related("user"), tree=tree_id, user=user_id
        )
        if payload.role != TreeMembership.Role.OWNER and _is_last_owner(member):
            return Status(409, ErrorOut(detail=LAST_OWNER))
        member.role = payload.role
        member.save(update_fields=["role"])
    return Status(200, _member_out(request, member))


@router.delete("/trees/{tree_id}/members/{user_id}", response={204: None, 409: ErrorOut})
def remove_member(request: AuthedRequest, tree_id: UUID, user_id: int) -> Status[ErrorOut | None]:
    """An owner removes someone, or a member leaves."""
    mine = membership_in(request.user, tree_id)
    if user_id != request.user.pk:
        require_owner(mine)
    with transaction.atomic():
        member = get_object_or_404(TreeMembership, tree=tree_id, user=user_id)
        if _is_last_owner(member):
            return Status(409, ErrorOut(detail=LAST_OWNER))
        # Deleting the membership also drops that user's "This is me" marker for the tree.
        member.delete()
    return Status(204, None)
