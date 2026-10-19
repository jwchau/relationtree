"""Read-only graph queries over the people a user can see. The Ask agent's tools call these.

Like prompts.py, nothing here returns contact details (phone, email, address).
"""

from collections import deque
from typing import Any
from uuid import UUID

from django.contrib.auth.models import User

from relationtree.access import people_visible_to
from relationtree.models import Connection, Person
from relationtree.relationships import connections_of, label_for

MAX_PATH_LENGTH = 6


def _neighbours(user: User) -> dict[UUID, list[tuple[UUID, str]]]:
    """Every visible connection from both ends: person -> [(other, other's role to person)]."""
    connections = Connection.objects.filter(tree__memberships__user=user).values_list(
        "person_a_id", "person_b_id", "type"
    )
    neighbours: dict[UUID, list[tuple[UUID, str]]] = {}
    for a, b, type_ in connections:
        kind = Connection.RelationshipType(type_)
        neighbours.setdefault(a, []).append((b, label_for(kind, True)))
        neighbours.setdefault(b, []).append((a, label_for(kind, False)))
    return neighbours


def _names(user: User, ids: set[UUID]) -> dict[UUID, str]:
    return dict(people_visible_to(user).filter(id__in=ids).values_list("id", "name"))


def _brief(person: Person) -> dict[str, Any]:
    return {
        "id": str(person.id),
        "name": person.name,
        "category": person.get_relationship_category_display() or None,
    }


def find_people(user: User, name: str, limit: int = 10) -> list[dict[str, Any]]:
    """People whose name contains this text, ignoring case."""
    matches = people_visible_to(user).filter(name__icontains=name.strip()).order_by("name")
    return [_brief(p) for p in matches[:limit]]


def get_person(user: User, person_id: UUID) -> dict[str, Any] | None:
    """What the user recorded about someone, and their connections. No contact details."""
    person = people_visible_to(user).filter(id=person_id).first()
    if person is None:
        return None
    details = _brief(person)
    details.update(
        context=person.context or None,
        notes=person.notes or None,
        birthday=person.birthday.isoformat() if person.birthday else None,
        last_contacted=(
            person.last_contacted_date.isoformat() if person.last_contacted_date else None
        ),
        connections=[
            {"id": str(view.other.id), "name": view.other.name, "role": view.label}
            for view in connections_of(person)
        ],
    )
    return details


def people_with_relationship(user: User, label: str) -> list[dict[str, Any]]:
    """People who have someone in this role, e.g. "Child" -> parents, with those someones."""
    wanted = label.strip().casefold()
    related: dict[UUID, list[UUID]] = {}
    for person, others in _neighbours(user).items():
        matches = [other for other, role in others if role.casefold() == wanted]
        if matches:
            related[person] = matches
    names = _names(user, {*related, *(o for others in related.values() for o in others)})
    return [
        {"id": str(p), "name": names[p], "related": sorted(names[o] for o in others)}
        for p, others in sorted(related.items(), key=lambda item: names[item[0]])
    ]


def path_between(
    user: User, start: UUID, end: UUID, max_length: int = MAX_PATH_LENGTH
) -> list[dict[str, Any]] | None:
    """The shortest chain of connections from start to end, or None.

    Each step after the first carries `role`: who that person is to the previous one
    ("Child" means they are the previous person's child). Loads the visible connections in one
    query and searches in Python: a recursive SQL query would enumerate every path, which grows
    exponentially in a dense tree (a team of coworkers who all know each other).
    """
    neighbours = _neighbours(user)
    came_from: dict[UUID, tuple[UUID, str] | None] = {start: None}
    frontier = deque([(start, 0)])
    while frontier:
        node, depth = frontier.popleft()
        if node == end:
            break
        if depth == max_length:
            continue
        for other, role in neighbours.get(node, []):
            if other not in came_from:
                came_from[other] = (node, role)
                frontier.append((other, depth + 1))
    if end not in came_from:
        return None

    chain: list[tuple[UUID, str | None]] = []
    walk: UUID | None = end
    while walk is not None:
        step = came_from[walk]
        chain.append((walk, step[1] if step else None))
        walk = step[0] if step else None
    chain.reverse()

    names = _names(user, {n for n, _ in chain})
    if len(names) < len(chain):
        return None  # only possible when start is someone this user can't see
    path: list[dict[str, Any]] = []
    for node_id, step_role in chain:
        entry: dict[str, Any] = {"id": str(node_id), "name": names[node_id]}
        if step_role is not None:
            entry["role"] = step_role
        path.append(entry)
    return path
