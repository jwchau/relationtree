"""Relationship semantics shared by the API and the AI features."""

from collections import Counter
from dataclasses import dataclass
from uuid import UUID

from django.db.models import Q

from relationtree.models import Connection, Person

# A stored connection reads "person_a is <type> of person_b" (Ann PARENT Ben: Ann is Ben's parent).
# Labels describe the *other* person's role relative to the person being viewed.
SYMMETRIC = frozenset(
    {
        Connection.RelationshipType.SPOUSE,
        Connection.RelationshipType.SIBLING,
        Connection.RelationshipType.FRIEND,
        Connection.RelationshipType.COWORKER,
        Connection.RelationshipType.ACQUAINTANCE,
    }
)

# For directional types: person_b's role, as seen from person_a's page.
_ROLE_OF_B = {
    Connection.RelationshipType.PARENT: "Child",
    Connection.RelationshipType.MANAGER: "Report",
}


def label_for(type_: Connection.RelationshipType, viewer_is_person_a: bool) -> str:
    if viewer_is_person_a and type_ in _ROLE_OF_B:
        return _ROLE_OF_B[type_]
    return str(type_.label)


def canonical_pair(type_: Connection.RelationshipType, a: UUID, b: UUID) -> tuple[UUID, UUID]:
    """Symmetric connections have no direction; store them one way so duplicates collide."""
    if type_ in SYMMETRIC and b < a:
        return b, a
    return a, b


@dataclass(frozen=True)
class ConnectionView:
    """One connection as seen from a particular person's page."""

    connection: Connection
    other: Person
    label: str


def connections_of(person: Person) -> list[ConnectionView]:
    """Everyone connected to this person, labelled from their point of view (2 queries max)."""
    connections = (
        Connection.objects.filter(Q(person_a=person) | Q(person_b=person))
        .select_related("person_a", "person_b")
        .order_by("created_at")
    )
    views = []
    for c in connections:
        viewer_is_a = c.person_a_id == person.id
        views.append(
            ConnectionView(
                connection=c,
                other=c.person_b if viewer_is_a else c.person_a,
                label=label_for(Connection.RelationshipType(c.type), viewer_is_a),
            )
        )
    return views


# How each label (the other person's role) reads in a person's searchable summary, in this order.
# Plain sentences match how people ask ("who is married?") far better than "Spouse: 1".
_SUMMARY_SENTENCES: dict[str, tuple[str, str]] = {
    "Spouse": ("Is married.", "Is married."),
    "Child": ("Has a child.", "Has {n} children."),
    "Parent": ("Has a parent.", "Has {n} parents."),
    "Sibling": ("Has a sibling.", "Has {n} siblings."),
    "Report": ("Manages 1 person.", "Manages {n} people."),
    "Manager": ("Has a manager.", "Has {n} managers."),
    "Friend": ("Has a friend.", "Has {n} friends."),
    "Coworker": ("Has a coworker.", "Has {n} coworkers."),
    "Acquaintance": ("Has an acquaintance.", "Has {n} acquaintances."),
}


def relationship_summary(person: Person) -> str:
    """Counts, not names: stays ~a sentence per kind of relationship however many there are,
    so it can't drown out the person's own description in their embedding."""
    counts = Counter(view.label for view in connections_of(person))
    sentences = []
    for label, (one, many) in _SUMMARY_SENTENCES.items():
        n = counts.get(label, 0)
        if n:
            sentences.append(one if n == 1 else many.format(n=n))
    return " ".join(sentences)
