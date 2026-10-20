from django.db import connection
from django.http import HttpRequest
from ninja import NinjaAPI, Schema
from ninja.responses import Status

from relationtree.ask_api import router as ask_router
from relationtree.auth_api import router as auth_router
from relationtree.connections_api import router as connections_router
from relationtree.extract_api import router as extract_router
from relationtree.invites_api import router as invites_router
from relationtree.people_api import router as people_router
from relationtree.photos_api import router as photos_router
from relationtree.search_api import router as search_router
from relationtree.summary_api import router as summary_router
from relationtree.trees_api import router as trees_router

api = NinjaAPI(title="RelationTree API")
api.add_router("/auth", auth_router)
# Before people_router, or "/people/search" would be matched as /people/{person_id}.
api.add_router("/people", search_router)
api.add_router("/people", people_router)
api.add_router("/people", photos_router)
api.add_router("/people", summary_router)
api.add_router("", connections_router)
api.add_router("", ask_router)
api.add_router("", trees_router)
api.add_router("", invites_router)
api.add_router("", extract_router)


class HealthOut(Schema):
    status: str
    database: str


@api.get("/health", response={200: HealthOut, 503: HealthOut}, auth=None)
def health(request: HttpRequest) -> Status[HealthOut]:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        return Status(503, HealthOut(status="degraded", database="unreachable"))
    return Status(200, HealthOut(status="ok", database="ok"))
