from collections.abc import Callable

from django.contrib.auth.models import User
from django.db.models import F
from django.test import Client

from relationtree.access import default_tree_for
from relationtree.models import Connection, Person
from relationtree.relationships import relationship_summary
from relationtree.search import document_text, embed_pending
from tests.test_search import add_person, search


def connect(client: Client, a: str, b: str, type_: str) -> str:
    response = client.post(
        "/api/connections",
        {"person_a_id": a, "person_b_id": b, "type": type_},
        content_type="application/json",
    )
    assert response.status_code == 201
    connection_id: str = response.json()["id"]
    return connection_id


def text_of(person_id: str) -> str:
    return document_text(Person.objects.get(id=person_id))


def test_relationships_are_summarised_from_each_persons_point_of_view(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam, ann, ben = add_person(alice, "Sam"), add_person(alice, "Ann"), add_person(alice, "Ben")

    connect(alice, sam, ann, "PARENT")  # Sam is Ann's parent
    assert "Has a child." in text_of(sam)
    assert "Has a parent." in text_of(ann)

    connect(alice, sam, ben, "PARENT")
    assert "Has 2 children." in text_of(sam)
    assert "Has a child." not in text_of(sam)


def pending_ids() -> set[str]:
    stale = Person.objects.exclude(embedded_version=F("content_version"))
    return {str(pk) for pk in stale.values_list("id", flat=True)}


def test_adding_a_connection_marks_both_people_for_re_embedding(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam, ann, _bystander = (
        add_person(alice, "Sam"),
        add_person(alice, "Ann"),
        add_person(alice, "Jo"),
    )
    embed_pending()

    connect(alice, sam, ann, "SPOUSE")

    assert pending_ids() == {sam, ann}


def test_removing_a_connection_marks_both_people_for_re_embedding(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam, ann, _bystander = (
        add_person(alice, "Sam"),
        add_person(alice, "Ann"),
        add_person(alice, "Jo"),
    )
    connection = connect(alice, sam, ann, "SPOUSE")
    embed_pending()

    assert alice.delete(f"/api/connections/{connection}").status_code == 204

    assert pending_ids() == {sam, ann}
    assert "Is married." not in text_of(sam)


def test_deleting_a_person_marks_the_people_they_were_connected_to(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam, ann, ben = add_person(alice, "Sam"), add_person(alice, "Ann"), add_person(alice, "Ben")
    _bystander = add_person(alice, "Jo")
    connect(alice, sam, ann, "PARENT")
    connect(alice, sam, ben, "FRIEND")
    embed_pending()

    assert alice.delete(f"/api/people/{sam}").status_code == 204

    assert pending_ids() == {ann, ben}
    assert "Has a parent." not in text_of(ann)


def test_connected_peoples_names_stay_out_and_renames_affect_no_one_else(
    login_as: Callable[[str], Client],
) -> None:
    alice = login_as("alice")
    sam, ann = add_person(alice, "Sam"), add_person(alice, "Annabelle")
    connect(alice, sam, ann, "SIBLING")
    embed_pending()

    assert "Annabelle" not in text_of(sam)
    alice.patch(f"/api/people/{ann}", {"name": "Annie"}, content_type="application/json")
    assert pending_ids() == {ann}


def test_the_summary_stays_short_however_many_connections_there_are(
    login_as: Callable[[str], Client],
) -> None:
    """Measured with the real model: a list of 1000 names took ~6800 tokens (silently cut at the
    2048 context) and pulled the vector away from the person's own description."""
    login_as("alice")
    hub = Person.objects.create(
        tree=default_tree_for(User.objects.get(username="alice")), name="Hub"
    )
    others = Person.objects.bulk_create(
        Person(tree=hub.tree, name=f"Coworker {i}") for i in range(1000)
    )
    Connection.objects.bulk_create(
        Connection(
            tree=hub.tree, person_a=hub, person_b=o, type=Connection.RelationshipType.COWORKER
        )
        for o in others
    )

    assert relationship_summary(hub) == "Has 1000 coworkers."
    assert len(text_of(str(hub.id))) < 100


def test_asking_who_has_kids_finds_the_parent(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    sam, ann = add_person(alice, "Sam"), add_person(alice, "Ann")
    add_person(alice, "Jo")
    connect(alice, sam, ann, "PARENT")
    embed_pending()

    names = [r["person"]["name"] for r in search(alice, "who has kids?").json()["results"]]

    assert names == ["Sam"]
