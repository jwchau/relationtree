class FakePhotoStorage:
    """Stands in for R2 in tests: no network, records what was deleted."""

    def __init__(self) -> None:
        self.deleted: list[str] = []

    def presign_upload(self, key: str, content_type: str, size: int) -> str:
        return f"https://r2.test/{key}?op=put&type={content_type}&size={size}"

    def presign_download(self, key: str) -> str:
        return f"https://r2.test/{key}?op=get"

    def delete(self, key: str) -> None:
        self.deleted.append(key)
