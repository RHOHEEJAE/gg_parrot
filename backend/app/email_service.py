"""Transactional email via Resend (optional).

Used for password-reset links. Reads ``RESEND_API_KEY`` + ``RESET_FROM_EMAIL``
from the env; if either is missing it is a safe no-op (returns False) so the app
runs fine without email configured — the reset endpoint still behaves correctly,
it just can't deliver the mail until these are set.
"""
from __future__ import annotations

import os

import httpx

_ENDPOINT = "https://api.resend.com/emails"


def email_enabled() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("RESET_FROM_EMAIL"))


def send_email(to: str, subject: str, html: str) -> bool:
    """Send one email. Returns True on success, False if unconfigured or on error.
    The key is used in a header only — never logged."""
    key = os.environ.get("RESEND_API_KEY")
    sender = os.environ.get("RESET_FROM_EMAIL")
    if not key or not sender:
        return False
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                _ENDPOINT,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={"from": sender, "to": [to], "subject": subject, "html": html},
            )
            resp.raise_for_status()
        return True
    except Exception:
        return False
