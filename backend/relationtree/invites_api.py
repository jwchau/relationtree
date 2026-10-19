"""Invite links: an owner makes a one-time link for a role and sends it however they like.
Opening it either adds the tree to the visitor's account or creates an account (the only way
to sign up; there is no open registration).

The token is shown once, when the invite is made. Only its SHA-256 is stored, so a leaked
database or backup can't be used to join. Dead links (unknown, expired, used, revoked) all
get the same 404, so a guess learns nothing.
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from django.contrib.auth import login
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.http import HttpRequest
from django.utils import timezone
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from ninja.utils import check_csrf
from pydantic import StringConstraints

from relationtree.access import membership_in, require_owner
from relationtree.models import Invite, TreeMembership
from relationtree.schemas import ErrorOut
from relationtree.trees_api import TreeOut, tree_out
from relationtree.types import AuthedRequest

router = Router(tags=["invites"])

LIFETIME = timedelta(days=7)
DEAD_LINK = "This invite link is invalid or has expired"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _pending() -> QuerySet[Invite]:
    return Invite.objects.filter(used_at__isnull=True, expires_at__gt=timezone.now())


def _usable(token: str) -> QuerySet[Invite]:
    return _pending().filter(token_hash=_hash(token))


def _use(invite: Invite, user: User) -> TreeMembership:
    """Adds the user to the invite's tree and spends the invite. Call with the invite locked."""
    membership = TreeMembership.objects.create(tree=invite.tree, user=user, role=invite.role)
    invite.used_at = timezone.now()
    invite.used_by = user
    invite.save(update_fields=["used_at", "used_by"])
    return membership


class InviteIn(Schema):
    role: TreeMembership.Role


class InviteCreatedOut(Schema):
    token: str
    role: TreeMembership.Role
    expires_at: datetime


class PendingInviteOut(Schema):
    id: int
    role: TreeMembership.Role
    expires_at: datetime
    created_by: str | None


class InviteDetailsOut(Schema):
    tree_name: str
    role: TreeMembership.Role
    invited_by: str | None
    expires_at: datetime


class SignupIn(Schema):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
    password: Annotated[str, StringConstraints(max_length=128)]


@router.post("/trees/{tree_id}/invites", response={201: InviteCreatedOut}, auth=django_auth)
def create_invite(
    request: AuthedRequest, tree_id: UUID, payload: InviteIn
) -> Status[InviteCreatedOut]:
    require_owner(membership_in(request.user, tree_id))
    token = secrets.token_urlsafe(32)
    invite = Invite.objects.create(
        tree_id=tree_id,
        role=payload.role,
        token_hash=_hash(token),
        created_by=request.user,
        expires_at=timezone.now() + LIFETIME,
    )
    return Status(
        201, InviteCreatedOut(token=token, role=payload.role, expires_at=invite.expires_at)
    )


@router.get("/trees/{tree_id}/invites", response=list[PendingInviteOut], auth=django_auth)
def list_invites(request: AuthedRequest, tree_id: UUID) -> list[PendingInviteOut]:
    require_owner(membership_in(request.user, tree_id))
    invites = _pending().filter(tree=tree_id).select_related("created_by").order_by("expires_at")
    return [
        PendingInviteOut(
            id=i.id,
            role=TreeMembership.Role(i.role),
            expires_at=i.expires_at,
            created_by=i.created_by.username if i.created_by else None,
        )
        for i in invites
    ]


@router.delete("/trees/{tree_id}/invites/{invite_id}", response={204: None}, auth=django_auth)
def revoke_invite(request: AuthedRequest, tree_id: UUID, invite_id: int) -> Status[None]:
    require_owner(membership_in(request.user, tree_id))
    Invite.objects.filter(tree=tree_id, id=invite_id).delete()
    return Status(204, None)


@router.get("/invites/{token}", response={200: InviteDetailsOut, 404: ErrorOut}, auth=None)
def invite_details(request: HttpRequest, token: str) -> Status[InviteDetailsOut | ErrorOut]:
    invite = _usable(token).select_related("tree", "created_by").first()
    if invite is None:
        return Status(404, ErrorOut(detail=DEAD_LINK))
    return Status(
        200,
        InviteDetailsOut(
            tree_name=invite.tree.name,
            role=TreeMembership.Role(invite.role),
            invited_by=invite.created_by.username if invite.created_by else None,
            expires_at=invite.expires_at,
        ),
    )


@router.post(
    "/invites/{token}/accept",
    response={200: TreeOut, 404: ErrorOut, 409: ErrorOut},
    auth=django_auth,
)
def accept_invite(request: AuthedRequest, token: str) -> Status[TreeOut | ErrorOut]:
    with transaction.atomic():
        # Locked, so two people opening the same link at once can't both use it.
        invite = _usable(token).select_for_update().select_related("tree").first()
        if invite is None:
            return Status(404, ErrorOut(detail=DEAD_LINK))
        if TreeMembership.objects.filter(tree=invite.tree_id, user=request.user).exists():
            return Status(409, ErrorOut(detail=f"You're already in {invite.tree.name}"))
        membership = _use(invite, request.user)
    return Status(200, tree_out(membership))


@router.post(
    "/invites/{token}/signup",
    response={201: TreeOut, 403: ErrorOut, 404: ErrorOut, 409: ErrorOut, 422: ErrorOut},
    auth=None,
)
def signup_with_invite(
    request: HttpRequest, token: str, payload: SignupIn
) -> Status[TreeOut | ErrorOut]:
    # Like login: no session yet, so CSRF has to be checked explicitly.
    if check_csrf(request) is not None:
        return Status(403, ErrorOut(detail="CSRF verification failed"))
    with transaction.atomic():
        invite = _usable(token).select_for_update().select_related("tree").first()
        if invite is None:
            return Status(404, ErrorOut(detail=DEAD_LINK))
        username = payload.username
        try:
            UnicodeUsernameValidator()(username)
            validate_password(payload.password, User(username=username))
        except ValidationError as err:
            return Status(422, ErrorOut(detail=" ".join(err.messages)))
        if User.objects.filter(username__iexact=username).exists():
            return Status(409, ErrorOut(detail="That username is taken"))
        user = User.objects.create_user(username, password=payload.password)
        membership = _use(invite, user)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return Status(201, tree_out(membership))
