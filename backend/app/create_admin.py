"""
Run this once from the backend directory to create the default admin user.

Usage:
    cd backend
    python create_admin.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Admin credentials — change these if needed
# ---------------------------------------------------------------------------
ADMIN_EMAIL = "parthpurbia@gmail.com"
ADMIN_PASSWORD = "admin123"
ADMIN_USER_ID = "user_admin000001"
# ---------------------------------------------------------------------------

try:
    from passlib.context import CryptContext
except ImportError:
    print("ERROR: passlib is not installed. Run: pip install passlib bcrypt")
    sys.exit(1)

# Resolve the users index path the same way config.py does
data_dir = Path(__file__).resolve().parent / "data"
users_path = data_dir / "users.json"
data_dir.mkdir(parents=True, exist_ok=True)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Load existing users
try:
    users = json.loads(users_path.read_text(encoding="utf-8")) if users_path.exists() else []
except json.JSONDecodeError:
    users = []

# Check if admin already exists
existing = next((u for u in users if u["email"] == ADMIN_EMAIL.lower()), None)
if existing:
    # Update password in case it changed
    existing["hashed_password"] = pwd_context.hash(ADMIN_PASSWORD)
    print(f"Admin user already exists — password reset to 'admin123'.")
else:
    users.append({
        "user_id": ADMIN_USER_ID,
        "email": ADMIN_EMAIL.lower(),
        "hashed_password": pwd_context.hash(ADMIN_PASSWORD),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    print(f"Admin user created.")

users_path.write_text(json.dumps(users, indent=2), encoding="utf-8")
print(f"Saved to: {users_path}")
print(f"\nLogin with:")
print(f"  Email:    {ADMIN_EMAIL}")
print(f"  Password: {ADMIN_PASSWORD}")