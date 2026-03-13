from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.hash import bcrypt

from app.config import get_settings

bearer_scheme = HTTPBearer(auto_error=True)

GUEST_USER_ID = "guest"
ALGORITHM = "HS256"


def _users_path() -> Path:
    return get_settings().users_index_path


def _load_users() -> list[dict]:
    path = _users_path()
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def _save_users(users: list[dict]) -> None:
    _users_path().write_text(json.dumps(users, indent=2), encoding="utf-8")


def signup_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")
    users = _load_users()
    if any(user.get("email") == email for user in users):
        raise HTTPException(status_code=400, detail="Email already exists.")
    user_id = f"user_{uuid4().hex[:12]}"
    hashed_password = bcrypt.hash(password)
    user = {
        "user_id": user_id,
        "email": email,
        "hashed_password": hashed_password,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    users.append(user)
    _save_users(users)
    return {"user_id": user_id, "email": email}


def login_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    users = _load_users()
    user = next((item for item in users if item.get("email") == email), None)
    if not user or not bcrypt.verify(password, user.get("hashed_password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    settings = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {"sub": user["user_id"], "email": email, "exp": exp}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer"}


def verify_token(token: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
        return user_id
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    settings = get_settings()
    if not settings.auth_enabled:
        return GUEST_USER_ID
    return verify_token(credentials.credentials)
