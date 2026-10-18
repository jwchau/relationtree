"""Semantic search over people. Text is embedded by a background worker (embed_pending) and
queries are embedded on demand; Postgres/pgvector does the nearest-neighbour ranking."""

from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.db.models import F
from pgvector.django import CosineDistance

from relationtree.access import people_visible_to
from relationtree.ai import get_embedder
from relationtree.models import Person
from relationtree.relationships import relationship_summary

# qwen3-embedding format: documents as-is, queries prefixed with a task instruction. Measured on
# a 10-question set it beat nomic-embed-text on separation (median top-1 lead 0.098 vs 0.057).
DOCUMENT_PREFIX = ""
QUERY_PREFIX = (
    "Instruct: Given a question about the people in someone's life, "
    "retrieve the people it describes\nQuery: "
)

# Similarity scores only mean something relative to each other, so results are the best match
# plus anything within this distance of it. Tuned on the same question set.
MATCH_WINDOW = 0.06

BATCH_SIZE = 32


def document_text(person: Person) -> str:
    """The searchable description of a person: who they are to you, never contact details.

    Changing what this produces leaves existing embeddings stale: ship a migration that bumps
    every person's content_version (see 0004_reembed_with_relationship_summaries)."""
    parts = [person.name]
    if person.relationship_category:
        parts.append(person.get_relationship_category_display())
    if person.context:
        parts.append(person.context)
    if person.notes:
        parts.append(person.notes)
    if relationships := relationship_summary(person):
        parts.append(relationships)
    return DOCUMENT_PREFIX + "\n".join(parts)


def embed_pending(batch_size: int = BATCH_SIZE) -> int:
    """Embed one batch of people whose searchable text changed. Returns how many were done."""
    pending = list(
        Person.objects.exclude(embedded_version=F("content_version")).order_by("updated_at")[
            :batch_size
        ]
    )
    if not pending:
        return 0
    vectors = get_embedder().embed([document_text(p) for p in pending])
    _check_dimensions(vectors)
    for person, vector in zip(pending, vectors, strict=True):
        person.embedding = vector
        person.embedded_version = person.content_version
        person.save(update_fields=["embedding", "embedded_version"])
    return len(pending)


def _check_dimensions(vectors: list[list[float]]) -> None:
    expected = Person._meta.get_field("embedding").dimensions
    for vector in vectors:
        if len(vector) != expected:
            raise ImproperlyConfigured(
                f"EMBED_MODEL={settings.EMBED_MODEL!r} returns {len(vector)}-dimensional "
                f"vectors, but Person.embedding stores {expected}. Use the model the database "
                "was built for, or migrate the column to the new size."
            )


def search_people(user: User, query: str, limit: int = 10) -> list[tuple[Person, float]]:
    [vector] = get_embedder().embed([QUERY_PREFIX + query])
    people = (
        people_visible_to(user)
        .filter(embedding__isnull=False)
        .annotate(distance=CosineDistance("embedding", vector))
        .order_by("distance")[:limit]
    )
    ranked = [(p, 1 - p.distance) for p in people]
    if not ranked:
        return []
    best = ranked[0][1]
    return [(p, score) for p, score in ranked if score >= best - MATCH_WINDOW]


def pending_count(user: User) -> int:
    """How many of the user's people aren't searchable with their latest text yet."""
    return people_visible_to(user).exclude(embedded_version=F("content_version")).count()
