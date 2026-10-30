from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import Field, StringConstraints, field_validator

from relationtree.access import (
    person_editable_by,
    person_visible_to,
    require_write_access,
    tree_for,
)
from relationtree.models import Person, TreeMembership
from relationtree.photos import get_photo_storage
from relationtree.types import AuthedRequest

router = Router(tags=["people"], auth=django_auth)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PersonIn(Schema):
    # photo_key is server-managed: set only via the photo endpoints, which check it belongs
    # to this person. Unknown fields like photo_key are ignored.
    name: Name
    relationship_category: Person.RelationshipCategory | None = None
    context: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    birthday: date | None = None
    notes: str = ""
    last_contacted_date: date | None = None


class PersonPatch(Schema):
    name: Name | None = None
    relationship_category: Person.RelationshipCategory | None = None
    context: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    birthday: date | None = None
    notes: str | None = None
    last_contacted_date: date | None = None

    @field_validator("name", "context", "phone", "email", "address", "notes")
    @classmethod
    def not_null(cls, value: str | None) -> str:
        # Omitting a field leaves it unchanged (validators skip defaults); sending null is an
        # error for these NOT NULL columns. Send "" to clear an optional text field.
        if value is None:
            raise ValueError("may not be null")
        return value


class PersonOut(Schema):
    id: UUID
    tree_id: UUID
    name: str
    relationship_category: Person.RelationshipCategory | None
    context: str
    phone: str
    email: str
    address: str
    birthday: date | None
    photo_url: str | None
    photo_original_url: str | None
    notes: str
    last_contacted_date: date | None
    created_at: datetime
    updated_at: datetime

    is_me: bool = Field(description='Whether the current user marked this person "This is me"')

    @staticmethod
    def resolve_photo_url(person: Person) -> str | None:
        # Short-lived presigned GET; signing is local, so this costs no network round trip.
        # The thumbnail when there is one: the app never shows a photo bigger than 80px.
        key = person.photo_thumb_key or person.photo_key
        return get_photo_storage().presign_download(key) if key else None

    @staticmethod
    def resolve_photo_original_url(person: Person) -> str | None:
        return get_photo_storage().presign_download(person.photo_key) if person.photo_key else None

    @staticmethod
    def resolve_is_me(person: Person, context: dict[str, Any]) -> bool:
        return person.id in me_ids(context["request"])


def me_ids(request: AuthedRequest) -> set[UUID]:
    """The people this user marked as themselves, looked up once per request."""
    if not hasattr(request, "_me_ids"):
        request._me_ids = set(  # type: ignore[attr-defined]
            TreeMembership.objects.filter(user=request.user, me__isnull=False).values_list(
                "me_id", flat=True
            )
        )
    return request._me_ids  # type: ignore[attr-defined,no-any-return]


# `tree` picks which of the user's trees; without it, their default tree (see tree_for).
@router.get("", response=list[PersonOut])
def list_people(request: AuthedRequest, tree: UUID | None = None) -> list[Person]:
    return list(tree_for(request.user, tree).people.order_by("name"))


@router.post("", response={201: PersonOut})
def create_person(
    request: AuthedRequest, payload: PersonIn, tree: UUID | None = None
) -> Status[Person]:
    target = tree_for(request.user, tree)
    require_write_access(request.user, target.id)
    person = Person.objects.create(tree=target, **payload.dict())
    return Status(201, person)


@router.get("/{person_id}", response=PersonOut)
def get_person(request: AuthedRequest, person_id: UUID) -> Person:
    return person_visible_to(request.user, person_id)


@router.patch("/{person_id}", response=PersonOut)
def update_person(request: AuthedRequest, person_id: UUID, payload: PersonPatch) -> Person:
    person = person_editable_by(request.user, person_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(person, field, value)
    person.save()
    return person


@router.delete("/{person_id}", response={204: None})
def delete_person(request: AuthedRequest, person_id: UUID) -> Status[None]:
    person_editable_by(request.user, person_id).delete()
    return Status(204, None)


# "This is me" is about the user, not the tree's data, so viewers can set it too.
@router.put("/{person_id}/me", response=PersonOut)
def mark_as_me(request: AuthedRequest, person_id: UUID) -> Person:
    person = person_visible_to(request.user, person_id)
    TreeMembership.objects.filter(tree=person.tree_id, user=request.user).update(me=person)
    return person


@router.delete("/{person_id}/me", response={204: None})
def unmark_as_me(request: AuthedRequest, person_id: UUID) -> Status[None]:
    person = person_visible_to(request.user, person_id)
    TreeMembership.objects.filter(tree=person.tree_id, user=request.user, me=person).update(me=None)
    return Status(204, None)
