from django.db import connection
from django.http import HttpRequest
from ninja import NinjaAPI, Schema
from ninja.responses import Status

from relationtree.auth_api import router as auth_router
from relationtree.people_api import router as people_router

api = NinjaAPI(title="RelationTree API")
api.add_router("/auth", auth_router)
api.add_router("/people", people_router)


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
