from urllib.parse import parse_qs, urlparse

from relationtree.photos import R2PhotoStorage


def make_storage() -> R2PhotoStorage:
    # Presigning is pure local computation; these dummy credentials never reach the network.
    return R2PhotoStorage(
        account_id="acct123",
        access_key_id="AKIDEXAMPLE",
        secret_access_key="secret-example",
        bucket="photos-test",
    )


def test_upload_url_signs_the_content_type_and_size() -> None:
    url = make_storage().presign_upload("trees/t/people/p/x.png", "image/png", 1234)

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.netloc == "acct123.r2.cloudflarestorage.com"
    assert parsed.path == "/photos-test/trees/t/people/p/x.png"
    signed_headers = query["X-Amz-SignedHeaders"][0].split(";")
    assert "content-type" in signed_headers
    assert "content-length" in signed_headers
    assert query["X-Amz-Expires"] == ["300"]


def test_download_url_expires_after_an_hour() -> None:
    url = make_storage().presign_download("trees/t/people/p/x.png")

    assert parse_qs(urlparse(url).query)["X-Amz-Expires"] == ["3600"]
