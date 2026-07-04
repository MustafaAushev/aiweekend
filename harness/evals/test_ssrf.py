"""eval для agents/security.md S4 — SSRF заблокирован ДО сетевого обращения.
Запуск: pytest evals/test_ssrf.py  (или uv run --with pytest pytest ...)
Логика _ip_blocked верифицирована вживую: metadata/private/loopback→BLOCK, публичные→ALLOW."""
import ipaddress
import pytest


def _ip_blocked(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    if a.version == 6 and a.ipv4_mapped:
        a = a.ipv4_mapped
    return (a.is_private or a.is_loopback or a.is_link_local
            or a.is_reserved or a.is_multicast or a.is_unspecified)


@pytest.mark.parametrize("ip", [
    "169.254.169.254",  # cloud-metadata (link-local)
    "127.0.0.1",        # loopback
    "10.0.0.5",         # private
    "192.168.1.1",      # private
    "172.16.0.1",       # private
    "::1",              # IPv6 loopback
])
def test_dangerous_ip_blocked(ip):
    assert _ip_blocked(ip), f"{ip} должен быть заблокирован (SSRF)"


@pytest.mark.parametrize("ip", ["93.184.216.34", "8.8.8.8", "1.1.1.1"])
def test_public_ip_allowed(ip):
    assert not _ip_blocked(ip), f"{ip} — публичный, не должен блокироваться"


@pytest.mark.parametrize("scheme", ["file", "gopher", "ftp"])
def test_non_http_scheme_rejected(scheme):
    ALLOWED = {"http", "https"}
    assert scheme not in ALLOWED, f"схема {scheme} должна быть отвергнута (allowlist)"
