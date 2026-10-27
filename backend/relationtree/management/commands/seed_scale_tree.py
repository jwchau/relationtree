import random
import uuid
from datetime import date
from typing import Any

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction

from relationtree.models import Connection, Person, Tree, TreeMembership
from relationtree.relationships import canonical_pair

Type = Connection.RelationshipType
Kind = Connection.ParentKind

# Made-up names only: real trees never go in screenshots (PRODUCT.md).
FIRST = [
    "Ada", "Bram", "Cleo", "Dov", "Esme", "Finn", "Gwen", "Hal", "Iris", "Jory", "Kit", "Lark",
    "Milo", "Nell", "Oren", "Pia", "Quill", "Rue", "Sol", "Tam", "Una", "Vale", "Wren", "Xan",
    "Yara", "Zev",
]  # fmt: skip
LAST = [
    "Ashby", "Brook", "Calder", "Dunmore", "Ellery", "Fenwick", "Garrow", "Hale", "Ingram", "Joss",
    "Kestrel", "Lowe",
]  # fmt: skip


class Command(BaseCommand):
    help = (
        "Add a generated tree for measuring the map at scale (FG-12): generations of couples "
        "and children, then random social links. The same tree every time; local use only."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--owner", required=True, help="Username who owns the new tree.")
        parser.add_argument("--people", type=int, default=1000)
        parser.add_argument("--connections", type=int, default=3000)
        parser.add_argument(
            "--replace", action="store_true", help="Delete an earlier copy of this tree first."
        )

    @transaction.atomic
    def handle(
        self, *args: Any, owner: str, people: int, connections: int, replace: bool, **options: Any
    ) -> None:
        user = get_user_model().objects.filter(username=owner).first()
        if user is None:
            raise CommandError(f"No user {owner!r} to own the tree.")
        name = f"Synthetic scale ({people:,})"
        existing = Tree.objects.filter(name=name)
        if existing.exists():
            if not replace:
                raise CommandError(f"{name!r} already exists; pass --replace to rebuild it.")
            existing.delete()

        tree = Tree.objects.create(name=name)
        TreeMembership.objects.create(tree=tree, user=user, role=TreeMembership.Role.OWNER)
        rng = random.Random(7)
        # uuid4 would make each run differ, and canonical_pair orders symmetric links by id.
        ids = [uuid.UUID(int=rng.getrandbits(128), version=4) for _ in range(people)]
        birthdays: dict[int, date] = {}
        links: list[tuple[int, Type, int, Kind | None, bool]] = []
        seen: set[tuple[uuid.UUID, uuid.UUID, str]] = set()

        def link(
            a: int, type_: Type, b: int, kind: Kind | None = None, ended: bool = False
        ) -> None:
            if a == b or len(links) >= connections:
                return
            key = (*canonical_pair(type_, ids[a], ids[b]), type_.value)
            if key not in seen:
                seen.add(key)
                links.append((a, type_, b, kind, ended))

        # Generations of couples, most of the tree, then social links at random.
        family = int(people * 0.7)
        couples = [(0, 1, 1900)]
        link(0, Type.SPOUSE, 1)
        next_id = 2
        while couples and next_id < family:
            a, b, year = couples.pop(0)
            for _ in range(rng.randint(1, 4)):
                if next_id >= family:
                    break
                child = next_id
                next_id += 1
                birthdays[child] = date(year + rng.randint(22, 36), rng.randint(1, 12), 15)
                kind = (
                    rng.choice([Kind.STEP, Kind.ADOPTIVE])
                    if rng.random() < 0.1
                    else Kind.BIOLOGICAL
                )
                link(a, Type.PARENT, child, kind)
                link(b, Type.PARENT, child, Kind.BIOLOGICAL)
                if next_id >= family:
                    break
                partner = next_id
                next_id += 1
                link(child, Type.SPOUSE, partner, ended=rng.random() < 0.15)
                couples.append((child, partner, year + 25))
                if rng.random() < 0.1 and next_id + 1 < family:
                    # A second partner, and a half-sibling for this couple's children.
                    second, half = next_id, next_id + 1
                    next_id += 2
                    link(child, Type.SPOUSE, second)
                    link(child, Type.PARENT, half, Kind.BIOLOGICAL)
                    link(second, Type.PARENT, half, Kind.BIOLOGICAL)
        social = [Type.FRIEND, Type.COWORKER, Type.ACQUAINTANCE, Type.MANAGER]
        while len(links) < connections:
            link(rng.randrange(people), rng.choice(social), rng.randrange(people))

        # bulk_create skips save() and signals, so nothing is queued for search embedding.
        Person.objects.bulk_create(
            Person(
                id=ids[i],
                tree=tree,
                name=f"{FIRST[i % len(FIRST)]} {LAST[(i // len(FIRST)) % len(LAST)]} {i}",
                birthday=birthdays.get(i),
                relationship_category=(
                    Person.RelationshipCategory.FAMILY
                    if i < family
                    else rng.choice(
                        [Person.RelationshipCategory.FRIEND, Person.RelationshipCategory.COWORKER]
                    )
                ),
            )
            for i in range(people)
        )
        rows = []
        for a, type_, b, parent_kind, is_ended in links:
            person_a, person_b = canonical_pair(type_, ids[a], ids[b])
            rows.append(
                Connection(
                    tree=tree,
                    person_a_id=person_a,
                    person_b_id=person_b,
                    type=type_,
                    parent_kind=parent_kind if type_ == Type.PARENT else None,
                    ended=is_ended,
                )
            )
        Connection.objects.bulk_create(rows)
        self.stdout.write(f"Created {name!r}: {people} people, {len(rows)} connections.")
