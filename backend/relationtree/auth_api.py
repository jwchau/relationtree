from django.contrib.auth import authenticate, login, logout
from django.http import HttpRequest
from django.middleware.csrf import get_token
from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from ninja.utils import check_csrf

from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["auth"])


class LoginIn(Schema):
    username: str
    password: str


class UserOut(Schema):
    id: int
    username: str


class CsrfOut(Schema):
    csrf_token: str


@router.get("/csrf", response=CsrfOut, auth=None)
def csrf(request: HttpRequest) -> CsrfOut:
    # The frontend lives on another origin and can't read the API's csrftoken cookie,
    # so it fetches the token here and echoes it back in the X-CSRFToken header.
    return CsrfOut(csrf_token=get_token(request))


@router.post("/login", response={200: UserOut, 401: ErrorOut, 403: ErrorOut}, auth=None)
def login_view(request: HttpRequest, payload: LoginIn) -> Status[UserOut | ErrorOut]:
    # Session-authenticated endpoints get CSRF checks from django_auth; login runs
    # before there is a session, so it has to check explicitly.
    if check_csrf(request) is not None:
        return Status(403, ErrorOut(detail="CSRF verification failed"))
    user = authenticate(request, username=payload.username, password=payload.password)
    if user is None:
        return Status(401, ErrorOut(detail="Invalid username or password"))
    login(request, user)
    return Status(200, UserOut(id=user.pk, username=user.get_username()))


@router.post("/logout", response={204: None}, auth=django_auth)
def logout_view(request: AuthedRequest) -> Status[None]:
    logout(request)
    return Status(204, None)


@router.get("/me", response=UserOut, auth=django_auth)
def me(request: AuthedRequest) -> UserOut:
    return UserOut(id=request.user.pk, username=request.user.username)
