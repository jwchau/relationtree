from django.contrib import admin

from relationtree.models import Person, Tree, TreeMembership


class TreeMembershipInline(admin.TabularInline[TreeMembership, Tree]):
    model = TreeMembership
    extra = 0


@admin.register(Tree)
class TreeAdmin(admin.ModelAdmin[Tree]):
    list_display = ["name", "created_at"]
    inlines = [TreeMembershipInline]


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin[Person]):
    list_display = ["name", "relationship_category", "tree", "last_contacted_date"]
    list_filter = ["relationship_category", "tree"]
    search_fields = ["name", "notes", "context"]
