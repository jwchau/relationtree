from django.contrib.auth.models import User
from django.http import HttpRequest


class AuthedRequest(HttpRequest):
    """Request on an endpoint guarded by django_auth, where request.user is always a real User."""

    user: User
