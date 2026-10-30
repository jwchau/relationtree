"""Step, adoptive and former relationships in what the AI features see."""

from collections.abc import Callable
from typing import Any

import pytest
from django.db import connection as db_connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client

from relationtree.ask import TOOLS
from relationtree.graph import get_person, path_between, people_with_relationship
from relationtree.models import Connection, Person, Tree
from relationtree.prompts import ASK_SYSTEM_PROMPT, build_summary_context
from relationtree.relationships import connections_of, relationship_summary, role_of
from tests.test_connection_kinds import connect
from tests.test_connections import add_person
from tests.test_connections import connections_of as api_connections_of

Type = Connection.RelationshipType
Kind = Connection.ParentKind


def link(type_: Type, parent_kind: Kind | None = None, ended: bool = False) -> Connection:
    # "a PARENT b" reads "a is b's parent", so person_a's page sees person_b as the child.
    return Connection(type=type_, parent_kind=parent_kind, ended=ended)


@pytest.mark.parametrize(
    ("connection", "seen_from_a", "seen_from_b"),
    [
        (link(Type.PARENT, Kind.BIOLOGICAL), "Child", "Parent"),
        (link(Type.PARENT, Kind.STEP), "Step-child", "Step-parent"),
        (link(Type.PARENT, Kind.ADOPTIVE), "Adopted child", "Adoptive parent"),
        (link(Type.SPOUSE), "Spouse", "Spouse"),
        (link(Type.SPOUSE, ended=True), "Former spouse", "Former spouse"),
        (link(Type.MANAGER), "Report", "Manager"),
        (link(Type.FRIEND), "Friend", "Friend"),
    ],
)
def test_names_the_other_persons_role_with_its_kind(
    connection: Connection, seen_from_a: str, seen_from_b: str
) -> None:
    assert role_of(connection, viewer_is_a=True) == seen_from_a
    assert role_of(connection, viewer_is_a=False) == seen_from_b


def family(client: Client) -> dict[str, str]:
    """Robin's ex-wife Lee, Robin's stepson Kit, and Robin's adoptive mother Mae."""
    ids = {name: add_person(client, name) for name in ["Robin", "Lee", "Kit", "Mae"]}
    links: list[tuple[str, str, str, dict[str, Any]]] = [
        ("Robin", "SPOUSE", "Lee", {"ended": True}),
        ("Robin", "PARENT", "Kit", {"parent_kind": "STEP"}),
        ("Mae", "PARENT", "Robin", {"parent_kind": "ADOPTIVE"}),
    ]
    for a, type_, b, fields in links:
        assert connect(client, ids[a], ids[b], type_, **fields).status_code == 201
    return ids


def test_a_persons_connections_carry_the_specific_role_while_the_api_label_stays_plain(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ids = family(alice)

    robin = Person.objects.get(id=ids["Robin"])
    assert {v.other.name: v.role for v in connections_of(robin)} == {
        "Lee": "Former spouse",
        "Kit": "Step-child",
        "Mae": "Adoptive parent",
    }
    # The person page words it itself from parent_kind and ended (connectionLabel).
    assert {
        c["other_person"]["name"]: c["label"] for c in api_connections_of(alice, ids["Robin"])
    } == {
        "Lee": "Spouse",
        "Kit": "Child",
        "Mae": "Parent",
    }


def test_ask_sees_an_ex_as_a_former_spouse_and_a_stepson_as_a_step_child(
    login_as: Callable[[str], Client],
) -> None:
    ids = family(login_as("alice"))
    robin = Person.objects.get(id=ids["Robin"])

    details = get_person(robin.tree, robin.id)

    assert details is not None
    assert {c["name"]: c["role"] for c in details["connections"]} == {
        "Lee": "Former spouse",
        "Kit": "Step-child",
        "Mae": "Adoptive parent",
    }


def related(tree: Tree, role: str) -> dict[str, list[str]]:
    return {r["name"]: r["related"] for r in people_with_relationship(tree, role)}


def test_asking_for_a_role_follows_how_people_ask(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ids = family(alice)
    ids |= {name: add_person(alice, name) for name in ["Sam", "Ivy"]}
    connect(alice, ids["Robin"], ids["Sam"], "SPOUSE")
    connect(alice, ids["Robin"], ids["Ivy"], "PARENT")
    tree = Person.objects.get(id=ids["Robin"]).tree

    # A spouse is a current one; an ex is asked for as a former spouse.
    assert related(tree, "Spouse") == {"Robin": ["Sam"], "Sam": ["Robin"]}
    assert related(tree, "Former spouse") == {"Lee": ["Robin"], "Robin": ["Lee"]}
    # "Who has kids?" counts step and adopted children too, and says which they are.
    assert related(tree, "Child") == {
        "Mae": ["Robin (adopted child)"],
        "Robin": ["Ivy", "Kit (step-child)"],
    }
    assert related(tree, "Parent") == {
        "Ivy": ["Robin"],
        "Kit": ["Robin (step-parent)"],
        "Robin": ["Mae (adoptive parent)"],
    }
    # Asked for by kind, only that kind.
    assert related(tree, "Step-child") == {"Robin": ["Kit"]}
    assert related(tree, "adoptive parent") == {"Robin": ["Mae"]}


def test_a_path_names_each_step_with_its_kind(login_as: Callable[[str], Client]) -> None:
    ids = family(login_as("alice"))
    tree = Person.objects.get(id=ids["Robin"]).tree

    path = path_between(
        tree, Person.objects.get(id=ids["Kit"]).id, Person.objects.get(id=ids["Lee"]).id
    )

    assert path is not None
    assert [(step["name"], step.get("role")) for step in path] == [
        ("Kit", None),
        ("Robin", "Step-parent"),
        ("Lee", "Former spouse"),
    ]


def test_search_summaries_tell_exes_and_step_and_adoptive_relations_apart(
    login_as: Callable[[str], Client],
) -> None:
    ids = family(login_as("alice"))
    summary = {name: relationship_summary(Person.objects.get(id=i)) for name, i in ids.items()}

    assert summary["Robin"] == "Has a stepchild. Has an adoptive parent. Has a former spouse."
    assert summary["Lee"] == "Has a former spouse."
    assert summary["Kit"] == "Has a step-parent."
    assert summary["Mae"] == "Has an adopted child."


@pytest.mark.usefixtures("migrator")
def test_the_migration_queues_everyone_for_re_embedding_with_the_new_summaries() -> None:
    before = [("relationtree", "0007_connection_kinds")]
    after = [("relationtree", "0008_reembed_with_relationship_kinds")]
    executor = MigrationExecutor(db_connection)
    executor.migrate(before)
    old = executor.loader.project_state(before).apps
    tree = old.get_model("relationtree", "Tree").objects.create(name="Old tree")
    ann = old.get_model("relationtree", "Person").objects.create(
        tree=tree, name="Ann", content_version=3, embedded_version=3
    )

    executor = MigrationExecutor(db_connection)
    executor.migrate(after)

    # Read through the models as of `after`: later migrations add columns it doesn't have yet.
    new = executor.loader.project_state(after).apps
    refreshed = new.get_model("relationtree", "Person").objects.get(id=ann.id)
    assert (refreshed.content_version, refreshed.embedded_version) == (4, 3)


def test_a_catch_up_summary_hears_who_is_an_ex_or_a_step_relation(
    login_as: Callable[[str], Client],
) -> None:
    ids = family(login_as("alice"))

    context = build_summary_context(Person.objects.get(id=ids["Robin"]))

    assert "Connected to: Lee (Former spouse), Kit (Step-child), Mae (Adoptive parent)" in context


def test_ask_is_told_the_roles_with_kinds() -> None:
    by_name = {t["function"]["name"]: t["function"] for t in TOOLS}
    roles = by_name["people_with_relationship"]["description"]
    for role in ["Former spouse", "Step-child", "Step-parent", "Adopted child", "Adoptive parent"]:
        assert role in roles
    assert "Former spouse" in ASK_SYSTEM_PROMPT
