from django.http import HttpRequest


def client_ip(request: HttpRequest) -> str | None:
    return request.META.get("HTTP_CF_CONNECTING_IP") or request.META.get("REMOTE_ADDR")
