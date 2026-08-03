import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from eth_account import Account
from eth_account.messages import encode_defunct

from .config import settings


def normalize_address(address: str) -> str:
    return address.lower()


def challenge_message(address: str, nonce: str, expires_at: datetime) -> str:
    return "\n".join(
        (
            "SynapseNet wallet authentication",
            f"Address: {normalize_address(address)}",
            f"Nonce: {nonce}",
            f"Expires At: {expires_at.isoformat()}",
            "Purpose: Sign in without sharing your private key.",
        )
    )


def new_challenge(address: str) -> tuple[str, str, datetime]:
    nonce = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(seconds=settings().wallet_challenge_ttl_seconds)
    return challenge_message(address, nonce, expires_at), hash_nonce(nonce), expires_at


def hash_nonce(nonce: str) -> str:
    return hashlib.sha256(nonce.encode()).hexdigest()


def recover_address(message: str, signature: str) -> str:
    return normalize_address(Account.recover_message(encode_defunct(text=message), signature=signature))


def encryption_key() -> bytes:
    key = base64.urlsafe_b64decode(settings().encryption_key)
    if len(key) != 32:
        raise ValueError("SYNAPSENET_ENCRYPTION_KEY must encode exactly 32 bytes")
    return key


def encrypt_metadata(payload: bytes, associated_data: bytes) -> tuple[bytes, bytes]:
    nonce = secrets.token_bytes(12)
    return AESGCM(encryption_key()).encrypt(nonce, payload, associated_data), nonce


def decrypt_metadata(ciphertext: bytes, nonce: bytes, associated_data: bytes) -> bytes:
    return AESGCM(encryption_key()).decrypt(nonce, ciphertext, associated_data)
