"""Parent kinds and former partners on connections (FG-8)."""

from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db import connection as db_connection
from django.db.migrations.executor import MigrationExecutor
from django.test import Client

from relationtree.models import Connection, Person, Tree, TreeMembership
from tests.test_connections import add_person, connections_of
from tests.test_tree_graph import graph_of
from tests.test_trees import default_tree_id


def connect(client: Client, a: str, b: str, type_: str, **fields: Any) -> Any:
    return client.post(
        "/api/connections",
        {"person_a_id": a, "person_b_id": b, "type": type_, **fields},
        content_type="application/json",
    )


def test_a_parent_link_is_biological_unless_told_otherwise(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")

    created = connect(alice, ann, ben, "PARENT")

    assert created.status_code == 201
    assert created.json()["parent_kind"] == "BIOLOGICAL"
    assert created.json()["ended"] is False


def test_step_and_adoptive_parents_and_former_partners_are_kept_everywhere(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    ann, ben, cal = add_person(alice, "Ann"), add_person(alice, "Ben"), add_person(alice, "Cal")

    step = connect(alice, ann, ben, "PARENT", parent_kind="STEP")
    adopted = connect(alice, cal, ben, "PARENT", parent_kind="ADOPTIVE")
    former = connect(alice, ann, cal, "SPOUSE", ended=True)

    assert [r.status_code for r in (step, adopted, former)] == [201, 201, 201]
    assert step.json()["parent_kind"] == "STEP"
    assert former.json()["ended"] is True
    assert former.json()["parent_kind"] is None
    on_bens_page = {c["other_person"]["name"]: c for c in connections_of(alice, ben)}
    assert on_bens_page["Ann"]["parent_kind"] == "STEP"
    assert on_bens_page["Cal"]["parent_kind"] == "ADOPTIVE"
    # The label stays the plain role: Ask's search text is built from it.
    assert on_bens_page["Ann"]["label"] == "Parent"
    graph = graph_of(alice, default_tree_id(alice)).json()
    kinds = {(c["type"], c["parent_kind"], c["ended"]) for c in graph["connections"]}
    assert kinds == {
        ("PARENT", "STEP", False),
        ("PARENT", "ADOPTIVE", False),
        ("SPOUSE", None, True),
    }


@pytest.mark.parametrize(
    ("type_", "fields"),
    [
        ("SPOUSE", {"parent_kind": "STEP"}),
        ("FRIEND", {"parent_kind": "BIOLOGICAL"}),
        ("PARENT", {"ended": True}),
        ("SIBLING", {"ended": True}),
    ],
)
def test_each_field_only_goes_with_its_own_type(
    login_as: Callable[[str], Client], type_: str, fields: dict[str, Any]
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")

    response = connect(alice, ann, ben, type_, **fields)

    assert response.status_code == 422
    assert connections_of(alice, ann) == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("type_", "fields"),
    [
        ("SPOUSE", {"parent_kind": "STEP"}),
        ("PARENT", {"parent_kind": None}),
        ("FRIEND", {"ended": True}),
    ],
)
def test_the_database_refuses_a_field_on_the_wrong_type(type_: str, fields: dict[str, Any]) -> None:
    tree = Tree.objects.create(name="Carol's tree")
    ann = Person.objects.create(tree=tree, name="Ann")
    ben = Person.objects.create(tree=tree, name="Ben")
    link = Connection.objects.create(tree=tree, person_a=ann, person_b=ben, type=type_)

    # An update goes straight to the database, past the model's own default.
    with pytest.raises(IntegrityError):
        Connection.objects.filter(id=link.id).update(**fields)


@pytest.mark.django_db(transaction=True)
def test_the_migration_makes_existing_parent_links_biological() -> None:
    before, after = [("relationtree", "0006_invite")], [("relationtree", "0007_connection_kinds")]
    executor = MigrationExecutor(db_connection)
    executor.migrate(before)
    old = executor.loader.project_state(before).apps
    tree = old.get_model("relationtree", "Tree").objects.create(name="Old tree")
    person = old.get_model("relationtree", "Person")
    ann, ben = (person.objects.create(tree=tree, name=n) for n in ("Ann", "Ben"))
    link = old.get_model("relationtree", "Connection").objects
    parent = link.create(tree=tree, person_a=ann, person_b=ben, type="PARENT")
    spouse = link.create(tree=tree, person_a=ann, person_b=ben, type="SPOUSE")

    executor = MigrationExecutor(db_connection)
    executor.migrate(after)

    assert Connection.objects.get(id=parent.id).parent_kind == "BIOLOGICAL"
    assert Connection.objects.get(id=spouse.id).parent_kind is None
    assert Connection.objects.get(id=spouse.id).ended is False

    # Leave the database fully migrated for the tests that run after this one.
    executor = MigrationExecutor(db_connection)
    executor.migrate(executor.loader.graph.leaf_nodes())


def edit(client: Client, connection_id: str, **fields: Any) -> Any:
    return client.patch(
        f"/api/connections/{connection_id}", fields, content_type="application/json"
    )


def test_an_existing_link_can_become_step_or_former(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    parent = connect(alice, ann, ben, "PARENT").json()
    spouse = connect(alice, ann, ben, "SPOUSE").json()

    as_step = edit(alice, parent["id"], parent_kind="STEP")
    as_former = edit(alice, spouse["id"], ended=True)

    assert as_step.status_code == 200
    assert as_step.json()["parent_kind"] == "STEP"
    assert as_former.json()["ended"] is True
    on_bens_page = {c["type"]: c for c in connections_of(alice, ben)}
    assert on_bens_page["PARENT"]["parent_kind"] == "STEP"
    assert on_bens_page["SPOUSE"]["ended"] is True


def test_editing_leaves_out_fields_that_are_not_sent(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    spouse = connect(alice, ann, ben, "SPOUSE", ended=True).json()

    assert edit(alice, spouse["id"]).json()["ended"] is True


@pytest.mark.parametrize(
    ("type_", "fields"),
    [
        ("SPOUSE", {"parent_kind": "STEP"}),
        ("PARENT", {"ended": True}),
        ("PARENT", {"parent_kind": None}),
    ],
)
def test_editing_keeps_each_field_with_its_own_type(
    login_as: Callable[[str], Client], type_: str, fields: dict[str, Any]
) -> None:
    alice = login_as("alice")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    link = connect(alice, ann, ben, type_).json()

    assert edit(alice, link["id"], **fields).status_code == 422


def test_only_editors_can_edit_a_link(login_as: Callable[[str], Client]) -> None:
    alice, bob, cat = login_as("alice"), login_as("bob"), login_as("cat")
    ann, ben = add_person(alice, "Ann"), add_person(alice, "Ben")
    link = connect(alice, ann, ben, "SPOUSE").json()
    TreeMembership.objects.create(
        tree=TreeMembership.objects.get(user__username="alice").tree,
        user=User.objects.get(username="bob"),
        role=TreeMembership.Role.VIEWER,
    )

    assert edit(bob, link["id"], ended=True).status_code == 403
    assert edit(cat, link["id"], ended=True).status_code == 404
    assert connections_of(alice, ann)[0]["ended"] is False
