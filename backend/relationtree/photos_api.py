from typing import Annotated, Literal
from uuid import UUID

from ninja import Router, Schema
from ninja.responses import Status
from ninja.security import django_auth
from pydantic import Field

from relationtree.access import person_editable_by
from relationtree.models import Person
from relationtree.people_api import PersonOut
from relationtree.photos import (
    MAX_PHOTO_BYTES,
    delete_photo_quietly,
    get_photo_storage,
    is_photo_key_for,
    new_photo_key,
)
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["photos"], auth=django_auth)


class UploadUrlIn(Schema):
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    size: Annotated[int, Field(gt=0, le=MAX_PHOTO_BYTES)]


class UploadUrlOut(Schema):
    upload_url: str
    key: str


@router.post("/{person_id}/photo/upload-url", response=UploadUrlOut)
def create_upload_url(
    request: AuthedRequest, person_id: UUID, payload: UploadUrlIn
) -> UploadUrlOut:
    person = person_editable_by(request.user, person_id)
    key = new_photo_key(person, payload.content_type)
    url = get_photo_storage().presign_upload(key, payload.content_type, payload.size)
    return UploadUrlOut(upload_url=url, key=key)


class ConfirmPhotoIn(Schema):
    key: str


@router.put("/{person_id}/photo", response={200: PersonOut, 422: ErrorOut})
def confirm_photo(
    request: AuthedRequest, person_id: UUID, payload: ConfirmPhotoIn
) -> Status[Person | ErrorOut]:
    person = person_editable_by(request.user, person_id)
    if not is_photo_key_for(person, payload.key):
        return Status(422, ErrorOut(detail="That photo doesn't belong to this person"))
    previous = person.photo_key
    person.photo_key = payload.key
    person.save(update_fields=["photo_key", "updated_at"])
    if previous and previous != payload.key:
        delete_photo_quietly(previous)
    return Status(200, person)


@router.delete("/{person_id}/photo", response={204: None})
def remove_photo(request: AuthedRequest, person_id: UUID) -> Status[None]:
    person = person_editable_by(request.user, person_id)
    previous = person.photo_key
    if previous:
        person.photo_key = ""
        person.save(update_fields=["photo_key", "updated_at"])
        delete_photo_quietly(previous)
    return Status(204, None)
