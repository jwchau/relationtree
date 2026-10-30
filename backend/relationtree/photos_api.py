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
    MAX_THUMB_BYTES,
    delete_photo_quietly,
    get_photo_storage,
    is_photo_key_for,
    is_thumb_key_for,
    new_photo_key,
    thumb_key_for,
)
from relationtree.schemas import ErrorOut
from relationtree.types import AuthedRequest

router = Router(tags=["photos"], auth=django_auth)


class ThumbIn(Schema):
    content_type: Literal["image/webp", "image/jpeg"]
    size: Annotated[int, Field(gt=0, le=MAX_THUMB_BYTES)]


class UploadUrlIn(Schema):
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    size: Annotated[int, Field(gt=0, le=MAX_PHOTO_BYTES)]
    thumb: ThumbIn | None = None


class UploadUrlOut(Schema):
    upload_url: str
    key: str
    thumb_upload_url: str | None = None
    thumb_key: str | None = None


@router.post("/{person_id}/photo/upload-url", response=UploadUrlOut)
def create_upload_url(
    request: AuthedRequest, person_id: UUID, payload: UploadUrlIn
) -> UploadUrlOut:
    person = person_editable_by(request.user, person_id)
    storage = get_photo_storage()
    key = new_photo_key(person, payload.content_type)
    out = UploadUrlOut(
        upload_url=storage.presign_upload(key, payload.content_type, payload.size), key=key
    )
    if payload.thumb:
        out.thumb_key = thumb_key_for(key, payload.thumb.content_type)
        out.thumb_upload_url = storage.presign_upload(
            out.thumb_key, payload.thumb.content_type, payload.thumb.size
        )
    return out


class ConfirmPhotoIn(Schema):
    key: str
    thumb_key: str | None = None


@router.put("/{person_id}/photo", response={200: PersonOut, 422: ErrorOut})
def confirm_photo(
    request: AuthedRequest, person_id: UUID, payload: ConfirmPhotoIn
) -> Status[Person | ErrorOut]:
    person = person_editable_by(request.user, person_id)
    if not is_photo_key_for(person, payload.key):
        return Status(422, ErrorOut(detail="That photo doesn't belong to this person"))
    if payload.thumb_key and not is_thumb_key_for(payload.key, payload.thumb_key):
        return Status(422, ErrorOut(detail="That thumbnail doesn't belong to this photo"))
    previous, previous_thumb = person.photo_key, person.photo_thumb_key
    person.photo_key = payload.key
    person.photo_thumb_key = payload.thumb_key or ""
    person.save(update_fields=["photo_key", "photo_thumb_key", "updated_at"])
    if previous and previous != payload.key:
        delete_photo_quietly(previous, previous_thumb)
    return Status(200, person)


@router.delete("/{person_id}/photo", response={204: None})
def remove_photo(request: AuthedRequest, person_id: UUID) -> Status[None]:
    person = person_editable_by(request.user, person_id)
    previous, previous_thumb = person.photo_key, person.photo_thumb_key
    if previous:
        person.photo_key = person.photo_thumb_key = ""
        person.save(update_fields=["photo_key", "photo_thumb_key", "updated_at"])
        delete_photo_quietly(previous, previous_thumb)
    return Status(204, None)
