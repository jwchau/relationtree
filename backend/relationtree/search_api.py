from typing import Annotated
from uuid import UUID

from ninja import Query, Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import Field

from relationtree.access import tree_for
from relationtree.ai import AIUnavailable
from relationtree.people_api import PersonOut
from relationtree.schemas import ErrorOut
from relationtree.search import pending_count, search_people
from relationtree.types import AuthedRequest

router = Router(tags=["search"], auth=django_auth)


class SearchResult(Schema):
    person: PersonOut
    score: float


class SearchOut(Schema):
    results: list[SearchResult]
    pending: int = Field(description="People not yet indexed with their latest details")


@router.get("/search", response={200: SearchOut, 503: ErrorOut})
def search(
    request: AuthedRequest,
    q: Annotated[str, Query(min_length=1, max_length=500)],
    tree: UUID | None = None,
) -> Status[dict[str, object] | ErrorOut]:
    scope = tree_for(request.user, tree)
    try:
        found = search_people(scope, q)
    except AIUnavailable:
        return Status(503, ErrorOut(detail="AI is unavailable right now"))
    # Hand Ninja the models so PersonOut's resolvers (photo_url) run.
    results = [{"person": p, "score": s} for p, s in found]
    return Status(200, {"results": results, "pending": pending_count(scope)})
