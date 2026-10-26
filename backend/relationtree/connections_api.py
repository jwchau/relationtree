from typing import Self
from uuid import UUID

from django.db import IntegrityError, transaction
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import model_validator

from relationtree.access import (
    connection_editable_by,
    person_visible_to,
    require_write_access,
)
from relationtree.models import Connection
from relationtree.people_api import PersonOut
from relationtree.relationships import canonical_pair, connections_of
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["connections"], auth=django_auth)


class ConnectionIn(Schema):
    person_a_id: UUID
    person_b_id: UUID
    type: Connection.RelationshipType
    # Only for PARENT links (biological when left out), and only for SPOUSE links.
    parent_kind: Connection.ParentKind | None = None
    ended: bool = False

    @model_validator(mode="after")
    def not_self(self) -> Self:
        if self.person_a_id == self.person_b_id:
            raise ValueError("A person can't be connected to themselves")
        return self

    @model_validator(mode="after")
    def fields_fit_the_type(self) -> Self:
        check_kind_fields(self.type, self.parent_kind, self.ended)
        return self


def check_kind_fields(
    type_: Connection.RelationshipType | str, parent_kind: object, ended: bool | None
) -> None:
    """A parent kind only on parent links, and "former" only on spouse links (FG-8)."""
    if parent_kind is not None and type_ != Connection.RelationshipType.PARENT:
        raise ValueError("Only a parent link has a parent kind")
    if ended and type_ != Connection.RelationshipType.SPOUSE:
        raise ValueError("Only a spouse link can be a former partner")


class ConnectionOut(Schema):
    id: UUID
    person_a_id: UUID
    person_b_id: UUID
    type: Connection.RelationshipType
    parent_kind: Connection.ParentKind | None
    ended: bool


class PersonConnectionOut(Schema):
    """A connection seen from one person's page. `label` is the other person's plain role
    ("Parent"); the page adds the kind ("Step-parent") from `parent_kind` and `ended`."""

    id: UUID
    type: Connection.RelationshipType
    parent_kind: Connection.ParentKind | None
    ended: bool
    label: str
    other_person: PersonOut


@router.post("/connections", response={201: ConnectionOut, 409: ErrorOut, 422: ErrorOut})
def create_connection(
    request: AuthedRequest, payload: ConnectionIn
) -> Status[Connection | ErrorOut]:
    person_a = person_visible_to(request.user, payload.person_a_id)
    person_b = person_visible_to(request.user, payload.person_b_id)
    if person_a.tree_id != person_b.tree_id:
        return Status(422, ErrorOut(detail="Both people must be in the same tree"))
    require_write_access(request.user, person_a.tree_id)
    a, b = canonical_pair(payload.type, payload.person_a_id, payload.person_b_id)
    try:
        with transaction.atomic():
            connection = Connection.objects.create(
                tree_id=person_a.tree_id,
                person_a_id=a,
                person_b_id=b,
                type=payload.type,
                parent_kind=(
                    (payload.parent_kind or Connection.ParentKind.BIOLOGICAL)
                    if payload.type == Connection.RelationshipType.PARENT
                    else None
                ),
                ended=payload.ended,
            )
    except IntegrityError:
        return Status(409, ErrorOut(detail="These two people already have that connection"))
    return Status(201, connection)


@router.get("/people/{person_id}/connections", response=list[PersonConnectionOut])
def list_person_connections(request: AuthedRequest, person_id: UUID) -> list[dict[str, object]]:
    person = person_visible_to(request.user, person_id)
    # Hand Ninja the model, not a pre-built PersonOut: its response serialization runs
    # PersonOut's resolvers (photo_url), which model_validate would skip.
    return [
        {
            "id": v.connection.id,
            "type": v.connection.type,
            "parent_kind": v.connection.parent_kind,
            "ended": v.connection.ended,
            "label": v.label,
            "other_person": v.other,
        }
        for v in connections_of(person)
    ]


class ConnectionEdit(Schema):
    """The parts of a link that can change: its parent kind, and whether a partnership has
    ended. Fields left out stay as they are."""

    parent_kind: Connection.ParentKind | None = None
    ended: bool | None = None


@router.patch("/connections/{connection_id}", response={200: ConnectionOut, 422: ErrorOut})
def edit_connection(
    request: AuthedRequest, connection_id: UUID, payload: ConnectionEdit
) -> Status[Connection | ErrorOut]:
    connection = connection_editable_by(request.user, connection_id)
    sent = payload.model_fields_set
    parent_kind = payload.parent_kind if "parent_kind" in sent else connection.parent_kind
    ended = payload.ended if "ended" in sent else connection.ended
    is_parent = connection.type == Connection.RelationshipType.PARENT
    try:
        if is_parent and parent_kind is None:
            raise ValueError("A parent link always has a parent kind")
        check_kind_fields(connection.type, None if is_parent else parent_kind, ended)
    except ValueError as err:
        return Status(422, ErrorOut(detail=str(err)))
    connection.parent_kind = parent_kind
    connection.ended = bool(ended)
    connection.save(update_fields=["parent_kind", "ended"])
    return Status(200, connection)


@router.delete("/connections/{connection_id}", response={204: None})
def delete_connection(request: AuthedRequest, connection_id: UUID) -> Status[None]:
    connection_editable_by(request.user, connection_id).delete()
    return Status(204, None)
