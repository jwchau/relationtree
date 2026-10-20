from typing import Annotated
from uuid import UUID

from asgiref.sync import sync_to_async
from django.contrib.auth.models import User
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import StringConstraints

from relationtree.access import require_write_access, tree_for
from relationtree.ai import AIUnavailable
from relationtree.extract import ApplyError, ExtractionFailed, apply, propose
from relationtree.models import Connection, Person, Tree, TreeMembership
from relationtree.people_api import Name, PersonOut
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["ai"], auth=django_auth)

UNREADABLE = "Couldn't read that note. Try rephrasing it."


class ExtractIn(Schema):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ProposedPerson(Schema):
    ref: str
    name: Name
    match_id: UUID | None = None
    category: Person.RelationshipCategory | None = None
    context: str | None = None
    note: str | None = None


class ProposedConnection(Schema):
    a: str
    b: str
    type: Connection.RelationshipType


class Proposal(Schema):
    """People (new, or matched to someone in the tree) and connections between them, by ref.
    Returned by /extract for review, and sent back, edited, to /extract/apply."""

    people: list[ProposedPerson]
    connections: list[ProposedConnection]


class AppliedOut(Schema):
    created: list[PersonOut]
    updated: list[PersonOut]
    connections_added: int
    connections_skipped: int


def _prepare(user: User, tree_id: UUID | None) -> tuple[Tree, list[tuple[str, str]], Person | None]:
    """The tree (checked writable), its people's ids and names, and who "me" is in it."""
    tree = tree_for(user, tree_id)
    require_write_access(user, tree.id)
    known = [(str(i), n) for i, n in tree.people.order_by("name").values_list("id", "name")]
    me = TreeMembership.objects.filter(tree=tree, user=user).select_related("me").get().me
    return tree, known, me


@router.post("/extract", response={200: Proposal, 502: ErrorOut, 503: ErrorOut})
async def extract(
    request: AuthedRequest, payload: ExtractIn, tree: UUID | None = None
) -> Status[Proposal | ErrorOut]:
    """Proposes people and connections from a note. Saves nothing."""
    scope, known, me = await sync_to_async(_prepare)(request.user, tree)
    try:
        proposal = await propose(scope, payload.text, known, me)
    except AIUnavailable, TimeoutError:
        return Status(503, ErrorOut(detail="AI is unavailable right now"))
    except ExtractionFailed:
        return Status(502, ErrorOut(detail=UNREADABLE))
    return Status(200, Proposal.model_validate(proposal))


@router.post("/extract/apply", response={200: AppliedOut, 422: ErrorOut})
def apply_proposal(
    request: AuthedRequest, payload: Proposal, tree: UUID | None = None
) -> Status[AppliedOut | ErrorOut]:
    """Saves a reviewed proposal in one go: new people, notes on matched ones, connections."""
    scope = tree_for(request.user, tree)
    require_write_access(request.user, scope.id)
    data = payload.dict()
    try:
        applied = apply(scope, data["people"], data["connections"])
    except ApplyError as err:
        return Status(422, ErrorOut(detail=str(err)))
    return Status(
        200,
        {  # type: ignore[arg-type]
            "created": applied.created,
            "updated": applied.updated,
            "connections_added": applied.connections_added,
            "connections_skipped": applied.connections_skipped,
        },
    )
