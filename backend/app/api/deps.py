import asyncpg
from fastapi import Depends, Header, HTTPException

from app.db.client import get_db_pool
from app.services.auth_service import InvalidTokenError, decode_token, upsert_user


async def get_db() -> asyncpg.Pool:
    return get_db_pool()


async def get_current_user(authorization: str | None = Header(default=None)):
    """Optional auth. No Authorization header at all is the normal anonymous case
    (the app works without an account) and returns None — but a header that IS
    present and invalid/expired raises 401 rather than silently falling back to
    anonymous, so a stale frontend session can't look logged in while requests are
    quietly going unattributed.
    """
    if authorization is None:
        return None
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = authorization.removeprefix("Bearer ")
    try:
        claims = decode_token(token)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    google_id = claims.get("sub")
    email = claims.get("email")
    if not google_id or not email:
        raise HTTPException(status_code=401, detail="Invalid session token")

    return await upsert_user(google_id, email, claims.get("name"), claims.get("picture"))


async def require_user(user=Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user
