from django.db import connection
from django.http import HttpRequest
from ninja import NinjaAPI, Schema
from ninja.responses import Status

api = NinjaAPI(title="RelationTree API")


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
