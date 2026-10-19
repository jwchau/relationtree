import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, Any

from django.conf import settings
from django.http import StreamingHttpResponse
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import StringConstraints

from relationtree.ai import AIUnavailable
from relationtree.ask import answer
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["ai"], auth=django_auth)

UNAVAILABLE = "AI is unavailable right now"

STREAMED_EVENTS = {
    200: {
        "description": (
            "Newline-delimited JSON events while the model works: "
            '{"tool": progress text}, {"text": answer text}, an {"error": message} if the AI '
            'stops mid-answer, and finally {"people": [{"id", "name"}]} for those mentioned.'
        ),
        "content": {"application/x-ndjson": {"schema": {"type": "string"}}},
    }
}


class AskIn(Schema):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


def _line(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode()


@router.post("/ask", response={503: ErrorOut}, openapi_extra={"responses": STREAMED_EVENTS})
async def ask(request: AuthedRequest, payload: AskIn) -> StreamingHttpResponse | Status[ErrorOut]:
    events = answer(request.user, payload.question)

    # As with summaries: wait for the first event before committing to a 200, so "Ollama is off"
    # becomes a clean 503 instead of a stream that dies straight away.
    try:
        first = await asyncio.wait_for(anext(events), settings.AI_FIRST_TOKEN_TIMEOUT)
    except AIUnavailable, TimeoutError:
        await events.aclose()
        return Status(503, ErrorOut(detail=UNAVAILABLE))

    async def body() -> AsyncIterator[bytes]:
        try:
            yield _line(first)
            async for event in events:
                yield _line(event)
        except AIUnavailable:
            yield _line({"error": UNAVAILABLE})
        finally:
            # Also runs when the browser disconnects, which stops generation on the GPU.
            await events.aclose()

    return StreamingHttpResponse(body(), content_type="application/x-ndjson")
