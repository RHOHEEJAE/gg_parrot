"""Lightweight password hashing for leaderboard entry ownership.

This is NOT account authentication — it is a low-stakes "can this person edit
this entry?" proof. We use the standard library's PBKDF2-HMAC-SHA256 with a
per-password random salt so there is no C-extension/build dependency (bcrypt)
to install. Passwords are never stored, transmitted, or logged in plaintext.
"""
from __future__ import annotations

import hashlib
import secrets

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    """Return a self-describing hash: ``pbkdf2_sha256$iters$salt_hex$hash_hex``."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verify a password against a stored hash. False on any error."""
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iters))
        return secrets.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False
