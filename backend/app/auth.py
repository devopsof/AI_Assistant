"""
Auth module — authentication DISABLED.
All endpoints accept requests without any token.
get_current_user always returns a fixed guest user ID.
"""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Keep the bearer scheme so FastAPI doesn't error on existing Depends() calls,
# but set auto_error=False so missing/invalid tokens are silently ignored.
bearer_scheme = HTTPBearer(auto_error=False)

GUEST_USER_ID = "guest"


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Always returns the guest user. No token required."""
    return GUEST_USER_ID


def login_user(email: str, password: str):
    """Returns a fake token so the frontend login flow still works."""
    return {"token": "no-auth", "user_id": GUEST_USER_ID}


def signup_user(email: str, password: str):
    """Returns a fake token so the frontend signup flow still works."""
    return {"token": "no-auth", "user_id": GUEST_USER_ID}


def verify_token(token: str) -> str:
    return GUEST_USER_ID