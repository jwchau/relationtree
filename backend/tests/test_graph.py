import itertools
import json
from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User

from relationtree.access import default_tree_for
from relationtree.graph import (
    find_people,
    get_person,
    path_between,
    people_with_relationship,
)
from relationtree.models import Connection, Person, Tree, TreeMembership
from relationtree.relationships import canonical_pair

MakePeople = Callable[..., list[Person]]


@pytest.fixture
def alice(db: None) -> User:
    return User.objects.create_user("alice", password="unused-in-these-tests")


@pytest.fixture
def tree(alice: User) -> Tree:
    return default_tree_for(alice)


@pytest.fixture
def make_people() -> MakePeople:
    def _make_people(tree: Tree, *names: str) -> list[Person]:
        return [Person.objects.create(tree=tree, name=name) for name in names]

    return _make_people


def link(a: Person, type_: str, b: Person) -> None:
    """a <type> of b, e.g. link(ann, "PARENT", ben): Ann is Ben's parent."""
    kind = Connection.RelationshipType(type_)
    first, second = canonical_pair(kind, a.id, b.id)
    people = {a.id: a, b.id: b}
    Connection.objects.create(
        tree=a.tree, person_a=people[first], person_b=people[second], type=kind
    )


def steps(path: list[dict[str, Any]] | None) -> list[tuple[str, str | None]] | None:
    if path is None:
        return None
    return [(step["name"], step.get("role")) for step in path]


def test_path_between_returns_the_chain_with_each_persons_role(
    tree: Tree, make_people: MakePeople
) -> None:
    ann, ben, cara = make_people(tree, "Ann", "Ben", "Cara")
    link(ann, "PARENT", ben)
    link(ben, "SPOUSE", cara)

    path = path_between(tree, ann.id, cara.id)

    assert steps(path) == [("Ann", None), ("Ben", "Child"), ("Cara", "Spouse")]


@pytest.mark.parametrize("short_route_first", [True, False])
def test_path_between_takes_the_shortest_of_several_routes(
    tree: Tree, make_people: MakePeople, short_route_first: bool
) -> None:
    """Built in both orders, so a search that happens to try the long route first is caught."""
    ann, ben, cara, dan, eve = make_people(tree, "Ann", "Ben", "Cara", "Dan", "Eve")

    def short_route() -> None:
        link(ann, "FRIEND", ben)
        link(ben, "COWORKER", eve)

    def long_route() -> None:
        link(ann, "FRIEND", cara)
        link(cara, "FRIEND", dan)
        link(dan, "FRIEND", eve)

    for build in (short_route, long_route) if short_route_first else (long_route, short_route):
        build()

    assert steps(path_between(tree, ann.id, eve.id)) == [
        ("Ann", None),
        ("Ben", "Friend"),
        ("Eve", "Coworker"),
    ]


def test_path_between_is_none_for_unconnected_people_and_chains_over_the_limit(
    tree: Tree, make_people: MakePeople
) -> None:
    ann, ben, cara, loner = make_people(tree, "Ann", "Ben", "Cara", "Loner")
    link(ann, "SIBLING", ben)
    link(ben, "SIBLING", cara)

    assert path_between(tree, ann.id, loner.id) is None
    assert path_between(tree, loner.id, ann.id) is None
    assert path_between(tree, ann.id, cara.id, max_length=1) is None
    assert steps(path_between(tree, ann.id, cara.id, max_length=2)) == [
        ("Ann", None),
        ("Ben", "Sibling"),
        ("Cara", "Sibling"),
    ]


def test_people_with_a_relationship_are_the_ones_who_have_it(
    tree: Tree, make_people: MakePeople
) -> None:
    """ "Who has kids?" asks for "Child" and must list the parents, not the children."""
    ann, ben, cara, dan = make_people(tree, "Ann", "Ben", "Cara", "Dan")
    link(ann, "PARENT", ben)
    link(ann, "PARENT", cara)
    link(dan, "PARENT", cara)

    found = people_with_relationship(tree, "Child")

    assert sorted((p["name"], sorted(p["related"])) for p in found) == [
        ("Ann", ["Ben", "Cara"]),
        ("Dan", ["Cara"]),
    ]
    parents = people_with_relationship(tree, "parent")  # labels match case-insensitively
    assert sorted((p["name"], sorted(p["related"])) for p in parents) == [
        ("Ben", ["Ann"]),
        ("Cara", ["Ann", "Dan"]),
    ]


def test_find_people_matches_part_of_a_name_ignoring_case(
    tree: Tree, make_people: MakePeople
) -> None:
    make_people(tree, "Priya Patel", "Sam Priyanka", "Ben")

    assert sorted(p["name"] for p in find_people(tree, "PRIY")) == [
        "Priya Patel",
        "Sam Priyanka",
    ]
    assert find_people(tree, "nobody") == []


def test_tools_cannot_see_other_trees_people_even_by_id(
    tree: Tree, make_people: MakePeople
) -> None:
    bob = User.objects.create_user("bob", password="unused-in-these-tests")
    [ann] = make_people(tree, "Ann")
    bens, cara = make_people(default_tree_for(bob), "Ann's twin", "Cara")
    link(bens, "PARENT", cara)

    assert find_people(tree, "Ann") == [{"id": str(ann.id), "name": "Ann", "category": None}]
    assert get_person(tree, cara.id) is None
    assert path_between(tree, bens.id, cara.id) is None
    assert path_between(tree, cara.id, cara.id) is None
    assert people_with_relationship(tree, "Child") == []


def test_no_tool_returns_contact_details(tree: Tree, make_people: MakePeople) -> None:
    ann, ben = make_people(tree, "Ann", "Ben")
    Person.objects.filter(id__in=[ann.id, ben.id]).update(
        phone="555-0199", email="secret@example.com", address="1 Hidden Lane"
    )
    link(ann, "PARENT", ben)

    outputs = [
        find_people(tree, "Ann"),
        get_person(tree, ann.id),
        get_person(tree, ben.id),
        path_between(tree, ann.id, ben.id),
        people_with_relationship(tree, "Child"),
    ]

    text = json.dumps(outputs)
    for secret in ("555-0199", "secret@example.com", "1 Hidden Lane"):
        assert secret not in text


@pytest.mark.parametrize("length", [2, 20])
def test_graph_queries_dont_grow_with_the_tree(
    tree: Tree,
    make_people: MakePeople,
    django_assert_num_queries: Any,
    length: int,
) -> None:
    chain = make_people(tree, *(f"P{i}" for i in range(length + 1)))
    for parent, child in itertools.pairwise(chain):
        link(parent, "PARENT", child)

    with django_assert_num_queries(2):
        path = path_between(tree, chain[0].id, chain[-1].id, max_length=length)
    with django_assert_num_queries(2):
        parents = people_with_relationship(tree, "Child")

    assert path is not None and len(path) == length + 1
    assert len(parents) == length


def test_path_from_a_person_to_themselves_is_just_them(tree: Tree, make_people: MakePeople) -> None:
    [loner] = make_people(tree, "Loner")

    assert steps(path_between(tree, loner.id, loner.id)) == [("Loner", None)]


def test_tools_stay_in_one_tree_even_for_a_member_of_both(
    tree: Tree, make_people: MakePeople
) -> None:
    other = Tree.objects.create(name="Work")
    TreeMembership.objects.create(
        tree=other, user=User.objects.get(username="alice"), role=TreeMembership.Role.OWNER
    )
    [ann] = make_people(tree, "Ann")
    ben, cara = make_people(other, "Ben", "Cara")
    link(ben, "PARENT", cara)

    assert find_people(tree, "") == [{"id": str(ann.id), "name": "Ann", "category": None}]
    assert get_person(tree, ben.id) is None
    assert path_between(other, ben.id, cara.id) is not None
    assert path_between(tree, ben.id, cara.id) is None
    assert people_with_relationship(tree, "Child") == []
    assert [p["name"] for p in people_with_relationship(other, "Child")] == ["Ben"]
