"""Person photos in Cloudflare R2. Django only signs URLs and deletes objects; the browser
uploads and downloads directly, so photo bytes never pass through the home server."""

import logging
import re
import uuid
from typing import TYPE_CHECKING, Protocol

import boto3
from botocore.config import Config
from django.conf import settings

if TYPE_CHECKING:
    from relationtree.models import Person

logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}

UPLOAD_URL_TTL_SECONDS = 5 * 60
DOWNLOAD_URL_TTL_SECONDS = 60 * 60


def _folder(person: Person) -> str:
    return f"trees/{person.tree_id}/people/{person.id}/"


def new_photo_key(person: Person, content_type: str) -> str:
    return f"{_folder(person)}{uuid.uuid4()}.{EXTENSIONS[content_type]}"


_GENERATED_NAME = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)"
)


def is_photo_key_for(person: Person, key: str) -> bool:
    """Only keys we could have generated for this person: blocks pointing a person's photo at
    another tree's object (which would then be served via a presigned URL) and path tricks."""
    folder = _folder(person)
    return key.startswith(folder) and _GENERATED_NAME.fullmatch(key[len(folder) :]) is not None


class PhotoStorage(Protocol):
    def presign_upload(self, key: str, content_type: str, size: int) -> str: ...
    def presign_download(self, key: str) -> str: ...
    def delete(self, key: str) -> None: ...


class R2PhotoStorage:
    def __init__(
        self, *, account_id: str, access_key_id: str, secret_access_key: str, bucket: str
    ) -> None:
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )

    def presign_upload(self, key: str, content_type: str, size: int) -> str:
        # ContentType and ContentLength are part of the signature, so R2 rejects an upload
        # whose type or size differs from what the API validated.
        return self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": size,
            },
            ExpiresIn=UPLOAD_URL_TTL_SECONDS,
        )

    def presign_download(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=DOWNLOAD_URL_TTL_SECONDS,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


_storage: PhotoStorage | None = None


def get_photo_storage() -> PhotoStorage:
    global _storage
    if _storage is None:
        _storage = R2PhotoStorage(
            account_id=settings.CLOUDFLARE_R2_ACCOUNT_ID,
            access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
            secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
        )
    return _storage


def set_photo_storage(storage: PhotoStorage | None) -> None:
    """Swap the storage backend (tests use an in-memory fake)."""
    global _storage
    _storage = storage


def delete_photo_quietly(key: str) -> None:
    """Best effort: the database change already happened, so an R2 hiccup must not turn it
    into an error. A missed delete only leaves an orphaned object in the bucket."""
    try:
        get_photo_storage().delete(key)
    except Exception:
        logger.warning("Failed to delete photo %s from storage", key, exc_info=True)
