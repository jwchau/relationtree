from collections.abc import Callable
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import Client

from relationtree.ai import AIUnavailable
from relationtree.models import TreeMembership
from relationtree.search import embed_pending
from tests.fakes import FakeEmbedder


def add_person(client: Client, name: str, notes: str = "", **fields: Any) -> str:
    response = client.post(
        "/api/people", {"name": name, "notes": notes, **fields}, content_type="application/json"
    )
    assert response.status_code == 201
    person_id: str = response.json()["id"]
    return person_id


def search(client: Client, q: str) -> Any:
    return client.get("/api/people/search", {"q": q})


def test_search_ranks_people_by_meaning(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    add_person(alice, "Priya", "Investment banker")
    add_person(alice, "Sam", "Met at the climbing gym")
    add_person(alice, "Jo", "Accountant at a bank, finance and investment; plays in a band")
    embed_pending()

    response = search(alice, "who do I know in finance?")

    assert response.status_code == 200
    names = [r["person"]["name"] for r in response.json()["results"]]
    assert names == ["Priya", "Jo"]  # Sam is unrelated, so not listed at all
    scores = [r["score"] for r in response.json()["results"]]
    assert scores == sorted(scores, reverse=True)


def test_only_matches_close_to_the_best_one_are_returned(
    login_as: Callable[[str], Client],
) -> None:
    """Scores are only meaningful relative to each other; a distant runner-up is noise."""
    alice = login_as("alice")
    add_person(alice, "Priya", "Investment banker")  # all finance
    add_person(alice, "Jo", "Guitar, band, music, and a little finance")  # mostly music
    embed_pending()

    names = [r["person"]["name"] for r in search(alice, "finance").json()["results"]]

    assert names == ["Priya"]


def test_search_only_covers_your_own_trees(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Priya", "Investment banker")
    add_person(bob, "Bob's accountant", "Finance, bank, investment, accountant")
    embed_pending()

    names = [r["person"]["name"] for r in search(alice, "finance").json()["results"]]

    assert names == ["Priya"]


def test_worker_embeds_new_people_once(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    add_person(alice, "Priya", "Investment banker")
    add_person(alice, "Sam", "Climbing gym")

    assert embed_pending() == 2
    assert embed_pending() == 0
    assert len(embedder.inputs) == 2


def test_worker_works_through_a_backlog_in_batches(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    for i in range(5):
        add_person(alice, f"Person {i}")

    assert [embed_pending(batch_size=2) for _ in range(4)] == [2, 2, 1, 0]


def test_editing_searchable_text_triggers_re_embedding_but_contact_details_do_not(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    sam = add_person(alice, "Sam", "Climbing gym")
    embed_pending()

    alice.patch(f"/api/people/{sam}", {"phone": "555-0100"}, content_type="application/json")
    assert embed_pending() == 0

    alice.patch(
        f"/api/people/{sam}",
        {"notes": "Now an accountant at a bank"},
        content_type="application/json",
    )
    assert embed_pending() == 1
    names = [r["person"]["name"] for r in search(alice, "finance").json()["results"]]
    assert names == ["Sam"]
    assert search(alice, "finance").json()["results"][0]["score"] > 0.9


def test_an_edit_made_while_embedding_is_not_lost(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    sam = add_person(alice, "Sam", "Climbing gym")

    def edit_meanwhile() -> None:
        alice.patch(
            f"/api/people/{sam}", {"notes": "Accountant at a bank"}, content_type="application/json"
        )

    embedder.during_embed = edit_meanwhile
    embed_pending()  # embeds the old "Climbing gym" text while the edit lands

    # The edit must not be marked as embedded: the next pass picks up the new text.
    assert embed_pending() == 1
    assert "Accountant at a bank" in embedder.inputs[-1]
    assert [r["person"]["name"] for r in search(alice, "finance").json()["results"]][:1] == ["Sam"]


def test_embedded_text_uses_the_models_query_format_and_leaves_out_private_details(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    add_person(
        alice,
        "Sam",
        "Climbing gym regular",
        relationship_category="FRIEND",
        context="Met through work",
        phone="555-0100",
        email="sam@private.example",
        address="1 Hidden Lane",
        birthday="1990-04-02",
    )
    embed_pending()
    search(alice, "climbers")

    document, query = embedder.inputs
    # qwen3-embedding: documents are embedded as-is, queries carry a task instruction.
    assert document.startswith("Sam\n")
    for expected in ["Sam", "Friend", "Met through work", "Climbing gym regular"]:
        assert expected in document
    for private in ["555-0100", "sam@private.example", "1 Hidden Lane", "1990"]:
        assert private not in document
    assert query.startswith("Instruct: ")
    assert query.endswith("\nQuery: climbers")


def test_ollama_down_means_503_for_search_and_a_retry_later_for_the_worker(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    add_person(alice, "Priya", "Investment banker")
    embedder.error = AIUnavailable("connection refused")

    with pytest.raises(AIUnavailable):
        embed_pending()
    response = search(alice, "finance")
    assert response.status_code == 503
    assert response.json() == {"detail": "AI is unavailable right now"}

    embedder.error = None
    assert embed_pending() == 1
    assert search(alice, "finance").status_code == 200


def test_search_reports_how_many_of_your_people_are_still_being_indexed(
    login_as: Callable[[str], Client],
) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    sam = add_person(alice, "Sam", "Climbing gym")
    add_person(alice, "Priya", "Investment banker")
    embed_pending()
    alice.patch(f"/api/people/{sam}", {"notes": "Bouldering"}, content_type="application/json")
    add_person(alice, "Jo", "Guitarist")
    add_person(bob, "Dee", "Bob's friend")  # someone else's backlog doesn't count

    assert search(alice, "anything").json()["pending"] == 2
    embed_pending()
    assert search(alice, "anything").json()["pending"] == 0


def test_embed_worker_once_drains_the_whole_backlog(login_as: Callable[[str], Client]) -> None:
    alice = login_as("alice")
    for i in range(40):  # more than one batch
        add_person(alice, f"Person {i}")

    call_command("embed_worker", "--once")

    assert search(alice, "anything").json()["pending"] == 0


def test_embed_worker_once_survives_ollama_being_down(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    add_person(alice, "Priya")
    embedder.error = AIUnavailable("connection refused")

    call_command("embed_worker", "--once")  # logs and returns instead of crashing

    assert search(alice, "anything").status_code == 503
    embedder.error = None
    assert search(alice, "anything").json()["pending"] == 1


@pytest.mark.parametrize("q", ["", "x" * 501])
def test_search_query_must_be_reasonable(login_as: Callable[[str], Client], q: str) -> None:
    assert search(login_as("alice"), q).status_code == 422


def test_a_mismatched_embedding_model_fails_with_a_clear_message(
    login_as: Callable[[str], Client], embedder: FakeEmbedder
) -> None:
    alice = login_as("alice")
    add_person(alice, "Priya")
    embedder.dimensions = 768  # e.g. EMBED_MODEL switched to a model with a different size

    with pytest.raises(ImproperlyConfigured, match="768.*1024"):
        embed_pending()
    assert search(alice, "anything").json()["pending"] == 1


def test_search_and_pending_cover_one_tree(login_as: Callable[[str], Client]) -> None:
    alice, bob = login_as("alice"), login_as("bob")
    add_person(alice, "Priya", "Investment banker")
    add_person(bob, "Bob's accountant", "Finance, bank, investment, accountant")
    alices = TreeMembership.objects.get(user__username="alice").tree
    TreeMembership.objects.create(
        tree=alices, user=User.objects.get(username="bob"), role=TreeMembership.Role.VIEWER
    )
    embed_pending()
    add_person(bob, "Bea", "Not indexed yet")

    own = search(bob, "finance").json()
    shared = bob.get("/api/people/search", {"q": "finance", "tree": str(alices.id)}).json()

    assert [r["person"]["name"] for r in own["results"]] == ["Bob's accountant"]
    assert own["pending"] == 1
    assert [r["person"]["name"] for r in shared["results"]] == ["Priya"]
    assert shared["pending"] == 0
    stranger = login_as("carol")
    assert stranger.get("/api/people/search", {"q": "x", "tree": str(alices.id)}).status_code == 404
