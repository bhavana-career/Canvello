import base64
import os
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import settings

# Derive 256-bit key from settings.SECRET_KEY or generate deterministic key
import hashlib
_DERIVED_KEY = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
_aesgcm = AESGCM(_DERIVED_KEY)


def encrypt_token_at_rest(raw_token: str) -> str:
    """
    Encrypts sensitive tokens (OAuth user tokens, refresh tokens) at rest using AES-256-GCM.
    Returns standard Base64-encoded string: nonce (12 bytes) + ciphertext + tag (16 bytes).
    """
    if not raw_token:
        return ""
    nonce = secrets.token_bytes(12)
    ciphertext = _aesgcm.encrypt(nonce, raw_token.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_token_at_rest(encrypted_token: str) -> str:
    """
    Decrypts AES-256-GCM encrypted tokens at rest.
    """
    if not encrypted_token:
        return ""
    raw_payload = base64.b64decode(encrypted_token.encode("utf-8"))
    nonce = raw_payload[:12]
    ciphertext = raw_payload[12:]
    decrypted_bytes = _aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted_bytes.decode("utf-8")
