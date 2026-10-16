from typing import Self
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import Q
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
from relationtree.relationships import canonical_pair, label_for
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["connections"], auth=django_auth)


class ConnectionIn(Schema):
    person_a_id: UUID
    person_b_id: UUID
    type: Connection.RelationshipType

    @model_validator(mode="after")
    def not_self(self) -> Self:
        if self.person_a_id == self.person_b_id:
            raise ValueError("A person can't be connected to themselves")
        return self


class ConnectionOut(Schema):
    id: UUID
    person_a_id: UUID
    person_b_id: UUID
    type: Connection.RelationshipType


class PersonConnectionOut(Schema):
    """A connection seen from one person's page."""

    id: UUID
    type: Connection.RelationshipType
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
                tree_id=person_a.tree_id, person_a_id=a, person_b_id=b, type=payload.type
            )
    except IntegrityError:
        return Status(409, ErrorOut(detail="These two people already have that connection"))
    return Status(201, connection)


@router.get("/people/{person_id}/connections", response=list[PersonConnectionOut])
def list_person_connections(request: AuthedRequest, person_id: UUID) -> list[dict[str, object]]:
    person = person_visible_to(request.user, person_id)
    connections = (
        Connection.objects.filter(Q(person_a=person) | Q(person_b=person))
        .select_related("person_a", "person_b")
        .order_by("created_at")
    )
    result: list[dict[str, object]] = []
    for c in connections:
        viewer_is_a = c.person_a_id == person.id
        result.append(
            {
                "id": c.id,
                "type": c.type,
                "label": label_for(Connection.RelationshipType(c.type), viewer_is_a),
                # Hand Ninja the model, not a pre-built PersonOut: its response serialization
                # runs PersonOut's resolvers (photo_url); model_validate would skip them.
                "other_person": c.person_b if viewer_is_a else c.person_a,
            }
        )
    return result


@router.delete("/connections/{connection_id}", response={204: None})
def delete_connection(request: AuthedRequest, connection_id: UUID) -> Status[None]:
    connection_editable_by(request.user, connection_id).delete()
    return Status(204, None)
