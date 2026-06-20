import jwt

from app.config import settings
from app.db.client import get_db_pool

ALGORITHM = "HS256"


class InvalidTokenError(Exception):
    pass


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.BACKEND_JWT_SECRET, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc


async def upsert_user(google_id: str, email: str, name: str | None, avatar_url: str | None):
    pool = get_db_pool()
    return await pool.fetchrow(
        """
        INSERT INTO users (google_id, email, name, avatar_url)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (google_id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            avatar_url = EXCLUDED.avatar_url
        RETURNING id, google_id, email, name, avatar_url, created_at
        """,
        google_id,
        email,
        name,
        avatar_url,
    )
