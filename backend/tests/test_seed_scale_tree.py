from collections.abc import Callable

import pytest
from django.core.management import CommandError, call_command
from django.test import Client

from relationtree.models import Connection, Tree, TreeMembership

NAME = "Synthetic scale (60)"


def seed(*args: str) -> None:
    call_command(
        "seed_scale_tree", "--owner", "owner", "--people", "60", "--connections", "150", *args
    )


def test_makes_a_tree_of_the_asked_size_owned_by_the_user(
    login_as: Callable[[str], Client],
) -> None:
    owner = login_as("owner")
    seed()

    tree = Tree.objects.get(name=NAME)
    assert TreeMembership.objects.get(tree=tree, user__username="owner").role == "owner"
    assert (tree.people.count(), tree.connections.count()) == (60, 150)
    graph = owner.get(f"/api/trees/{tree.id}/graph").json()
    assert (len(graph["people"]), len(graph["connections"])) == (60, 150)


def test_gives_the_same_tree_every_time(login_as: Callable[[str], Client]) -> None:
    login_as("owner")

    def shape() -> list[tuple[str, str, str, str | None, bool]]:
        rows = Connection.objects.filter(tree__name=NAME).values_list(
            "person_a__name", "type", "person_b__name", "parent_kind", "ended"
        )
        return sorted(rows)

    seed()
    first = shape()
    seed("--replace")

    assert Tree.objects.filter(name=NAME).count() == 1
    assert shape() == first


def test_refuses_to_add_a_second_copy_without_replace(login_as: Callable[[str], Client]) -> None:
    login_as("owner")
    seed()
    with pytest.raises(CommandError, match="--replace"):
        seed()


def test_needs_an_existing_owner(db: None) -> None:
    with pytest.raises(CommandError, match="owner"):
        seed()
