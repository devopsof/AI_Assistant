import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def _users_registry_path() -> Path:
    settings = get_settings()
    return settings.users_index_path


def _load_users() -> list[Dict]:
    path = _users_registry_path()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def _save_users(users: list[Dict]) -> None:
    _users_registry_path().write_text(json.dumps(users, indent=2), encoding="utf-8")


def _find_user_by_email(email: str) -> Optional[Dict]:
    email = email.strip().lower()
    return next((user for user in _load_users() if user["email"] == email), None)


def _find_user_by_id(user_id: str) -> Optional[Dict]:
    return next((user for user in _load_users() if user["user_id"] == user_id), None)


def _create_access_token(user_id: str, email: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)


def signup_user(email: str, password: str) -> Dict[str, str]:
    normalized_email = email.strip().lower()
    if _find_user_by_email(normalized_email):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    users = _load_users()
    user = {
        "user_id": f"user_{uuid4().hex[:12]}",
        "email": normalized_email,
        "hashed_password": pwd_context.hash(password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    users.append(user)
    _save_users(users)
    return {
        "token": _create_access_token(user["user_id"], user["email"]),
        "user_id": user["user_id"],
    }


def login_user(email: str, password: str) -> Dict[str, str]:
    normalized_email = email.strip().lower()
    user = _find_user_by_email(normalized_email)
    if not user or not pwd_context.verify(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {
        "token": _create_access_token(user["user_id"], user["email"]),
        "user_id": user["user_id"],
    }


def verify_token(token: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc

    user_id = payload.get("sub")
    if not user_id or not _find_user_by_id(user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is not associated with a valid user.",
        )
    return user_id


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return verify_token(credentials.credentials)
