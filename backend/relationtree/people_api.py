from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import StringConstraints, field_validator

from relationtree.access import (
    default_tree_for,
    people_visible_to,
    person_editable_by,
    person_visible_to,
)
from relationtree.models import Person
from relationtree.types import AuthedRequest

router = Router(tags=["people"], auth=django_auth)

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PersonIn(Schema):
    name: Name
    relationship_category: Person.RelationshipCategory | None = None
    context: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    birthday: date | None = None
    photo_key: str = ""
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
    photo_key: str | None = None
    notes: str | None = None
    last_contacted_date: date | None = None

    @field_validator("name", "context", "phone", "email", "address", "photo_key", "notes")
    @classmethod
    def not_null(cls, value: str | None) -> str:
        # Omitting a field leaves it unchanged (validators skip defaults); sending null is an
        # error for these NOT NULL columns. Send "" to clear an optional text field.
        if value is None:
            raise ValueError("may not be null")
        return value


class PersonOut(Schema):
    id: UUID
    name: str
    relationship_category: Person.RelationshipCategory | None
    context: str
    phone: str
    email: str
    address: str
    birthday: date | None
    photo_key: str
    notes: str
    last_contacted_date: date | None
    created_at: datetime
    updated_at: datetime


@router.get("", response=list[PersonOut])
def list_people(request: AuthedRequest) -> list[Person]:
    return list(people_visible_to(request.user).order_by("name"))


@router.post("", response={201: PersonOut})
def create_person(request: AuthedRequest, payload: PersonIn) -> Status[Person]:
    person = Person.objects.create(tree=default_tree_for(request.user), **payload.dict())
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
