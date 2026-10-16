import uuid

from django.conf import settings
from django.db import models


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tree", "user"], name="unique_tree_membership"),
        ]

    def __str__(self) -> str:
        return f"{self.user} → {self.tree} ({self.role})"


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
    notes = models.TextField(blank=True, default="")
    last_contacted_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Connection(models.Model):
    class RelationshipType(models.TextChoices):
        SPOUSE = "SPOUSE"
        SIBLING = "SIBLING"
        FRIEND = "FRIEND"
        COWORKER = "COWORKER"
        ACQUAINTANCE = "ACQUAINTANCE"
        PARENT = "PARENT"
        MANAGER = "MANAGER"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="connections")
    person_a = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    person_b = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    type = models.CharField(max_length=20, choices=RelationshipType.choices)
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
        ]

    def __str__(self) -> str:
        return f"{self.person_a} {self.type} {self.person_b}"
