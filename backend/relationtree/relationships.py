"""Relationship semantics shared by the API (and, later, the AI features)."""

from uuid import UUID

from relationtree.models import Connection

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
