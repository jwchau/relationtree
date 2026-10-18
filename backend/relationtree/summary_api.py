import asyncio
from collections.abc import AsyncIterator
from uuid import UUID

from asgiref.sync import sync_to_async
from django.conf import settings
from django.http import StreamingHttpResponse
from ninja import Router
from ninja.responses import Status
from ninja.security import django_auth

from relationtree.access import person_visible_to
from relationtree.ai import AIUnavailable, get_chat_model
from relationtree.prompts import build_summary_messages
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["ai"], auth=django_auth)

STREAMED_TEXT = {
    200: {
        "description": "The summary, streamed as plain text while the model writes it",
        "content": {"text/plain": {"schema": {"type": "string"}}},
    }
}


def _messages_for(request: AuthedRequest, person_id: UUID) -> list[dict[str, str]]:
    return build_summary_messages(person_visible_to(request.user, person_id))


@router.post(
    "/{person_id}/summary", response={503: ErrorOut}, openapi_extra={"responses": STREAMED_TEXT}
)
async def summarize_person(
    request: AuthedRequest, person_id: UUID
) -> StreamingHttpResponse | Status[ErrorOut]:
    messages = await sync_to_async(_messages_for)(request, person_id)
    stream = get_chat_model().stream(
        messages,
        model=settings.CHAT_MODEL,
        # Ollama's default context window is small and truncates silently, so always set it.
        options={"num_ctx": settings.OLLAMA_NUM_CTX},
        # Thinking models otherwise reason silently before the first visible token.
        think=False,
    )

    # Wait for the first token before committing to a 200, so "Ollama is off" or "Ollama is
    # stuck" becomes a clean 503 instead of a response that hangs or dies half-way.
    try:
        first = await asyncio.wait_for(anext(stream, ""), settings.AI_FIRST_TOKEN_TIMEOUT)
    except AIUnavailable, TimeoutError:
        await stream.aclose()
        return Status(503, ErrorOut(detail="AI is unavailable right now"))

    async def body() -> AsyncIterator[bytes]:
        try:
            if first:
                yield first.encode()
            async for chunk in stream:
                yield chunk.encode()
        finally:
            # Also runs when the browser disconnects, which stops generation on the GPU.
            await stream.aclose()

    return StreamingHttpResponse(body(), content_type="text/plain; charset=utf-8")
