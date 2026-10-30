import uuid
from typing import Any, Self

from django.conf import settings
from django.db import models
from pgvector.django import HnswIndex, VectorField


class Tree(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class TreeMembership(models.Model):
    """Who can access a tree. The single source of truth for permissions."""

    class Role(models.TextChoices):
        OWNER = "owner"
        EDITOR = "editor"
        VIEWER = "viewer"

    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tree_memberships"
    )
    role = models.CharField(max_length=10, choices=Role.choices)
    # The person in this tree who is this user ("This is me"), so questions like "how am I
    # connected to Priya?" have a starting point. Per membership: each member can mark
    # themselves in a shared tree. Must be in this tree (checked where it's set).
    me = models.ForeignKey(
        "Person", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tree", "user"], name="unique_tree_membership"),
        ]

    def __str__(self) -> str:
        return f"{self.user} → {self.tree} ({self.role})"


class Invite(models.Model):
    """A one-time link that adds someone to a tree (see invites.py). Only the token's SHA-256
    is stored, so the database alone can't be used to join."""

    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="invites")
    role = models.CharField(max_length=10, choices=TreeMembership.Role.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    used_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    def __str__(self) -> str:
        return f"{self.role} invite to {self.tree}"


class Person(models.Model):
    class RelationshipCategory(models.TextChoices):
        FAMILY = "FAMILY"
        FRIEND = "FRIEND"
        COWORKER = "COWORKER"
        ACQUAINTANCE = "ACQUAINTANCE"
        OTHER = "OTHER"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="people")
    name = models.CharField(max_length=200)
    # NULL = uncategorised; maps 1:1 onto the API's nullable enum.
    relationship_category = models.CharField(  # noqa: DJ001
        max_length=20, choices=RelationshipCategory.choices, null=True, blank=True
    )
    context = models.TextField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    birthday = models.DateField(null=True, blank=True)
    photo_key = models.CharField(max_length=500, blank=True, default="")
    # A small copy the browser makes on upload; blank for photos uploaded before thumbnails.
    # db_default so code that predates this column can still insert people.
    photo_thumb_key = models.CharField(max_length=500, blank=True, db_default="")
    notes = models.TextField(blank=True, default="")
    last_contacted_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Semantic search (see search.py). content_version moves when searchable text changes;
    # the embed worker catches embedded_version up. Unequal means "needs (re-)embedding".
    embedding = VectorField(dimensions=1024, null=True, blank=True, editable=False)
    content_version = models.PositiveIntegerField(default=1, editable=False)
    embedded_version = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        indexes = [
            HnswIndex(
                name="person_embedding_hnsw",
                fields=["embedding"],
                opclasses=["vector_cosine_ops"],
            ),
        ]

    # The fields search.document_text() reads. Changing one means the embedding is out of date.
    SEARCHABLE_FIELDS = ("name", "relationship_category", "context", "notes")

    def __str__(self) -> str:
        return self.name

    def save(self, *args: Any, **kwargs: Any) -> None:
        snapshot = getattr(self, "_searchable_snapshot", None)
        changed = snapshot is not None and snapshot != self._searchable_values()
        if changed:
            # Incremented in SQL so two overlapping edits can't land on the same version.
            self.content_version = models.F("content_version") + 1
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = {*update_fields, "content_version"}
        super().save(*args, **kwargs)
        if changed:
            self.content_version = (
                Person.objects.filter(pk=self.pk).values_list("content_version", flat=True).get()
            )
        self._searchable_snapshot = self._searchable_values()

    @classmethod
    def from_db(cls, db: str | None, field_names: Any, values: Any, **kwargs: Any) -> Self:
        instance = super().from_db(db, field_names, values, **kwargs)
        # Only snapshot fully loaded rows: touching a deferred field here would trigger another
        # partial load, and so on. A partially loaded Person never bumps content_version.
        if set(cls.SEARCHABLE_FIELDS) <= set(field_names):
            instance._searchable_snapshot = instance._searchable_values()
        return instance

    def _searchable_values(self) -> tuple[object, ...]:
        return tuple(getattr(self, f) for f in self.SEARCHABLE_FIELDS)


class Connection(models.Model):
    class RelationshipType(models.TextChoices):
        SPOUSE = "SPOUSE"
        SIBLING = "SIBLING"
        FRIEND = "FRIEND"
        COWORKER = "COWORKER"
        ACQUAINTANCE = "ACQUAINTANCE"
        PARENT = "PARENT"
        MANAGER = "MANAGER"

    class ParentKind(models.TextChoices):
        BIOLOGICAL = "BIOLOGICAL"
        ADOPTIVE = "ADOPTIVE"
        STEP = "STEP"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="connections")
    person_a = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    person_b = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    type = models.CharField(max_length=20, choices=RelationshipType.choices)
    # Only on PARENT links, where it's always set (biological unless said otherwise). NULL,
    # not "", marks "not a parent link", which the check constraint below relies on.
    parent_kind = models.CharField(  # noqa: DJ001
        max_length=10, choices=ParentKind.choices, null=True, blank=True
    )
    # Only on SPOUSE links: a former partner.
    ended = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(person_a=models.F("person_b")), name="no_self_connection"
            ),
            # Symmetric types are stored with the lower UUID as person_a (see
            # relationships.canonical_pair), so this also catches B-A duplicates of A-B.
            models.UniqueConstraint(
                fields=["person_a", "person_b", "type"], name="unique_connection"
            ),
            models.CheckConstraint(
                condition=models.Q(type="PARENT", parent_kind__isnull=False)
                | (~models.Q(type="PARENT") & models.Q(parent_kind__isnull=True)),
                name="parent_kind_only_on_parent",
            ),
            models.CheckConstraint(
                condition=models.Q(ended=False) | models.Q(type="SPOUSE"),
                name="ended_only_on_spouse",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.person_a} {self.type} {self.person_b}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        # A parent link made without a kind is biological, wherever it's made from.
        if self.type == self.RelationshipType.PARENT and self.parent_kind is None:
            self.parent_kind = self.ParentKind.BIOLOGICAL
        super().save(*args, **kwargs)
