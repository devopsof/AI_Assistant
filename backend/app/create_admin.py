"""
Run this once from the backend directory to create the default admin user.

Usage:
    cd backend
    python create_admin.py
"""

import sys

from fastapi import HTTPException

from app.auth import signup_user

# ---------------------------------------------------------------------------
# Admin credentials
# ---------------------------------------------------------------------------
ADMIN_EMAIL = "parthpurbia@gmail.com"
ADMIN_PASSWORD = "admin123"
# ---------------------------------------------------------------------------


def main() -> None:
    try:
        signup_user(ADMIN_EMAIL, ADMIN_PASSWORD)
        print("Admin user created.")
    except HTTPException as exc:
        if exc.status_code == 400:
            print("Admin user already exists.")
        else:
            raise

    print("\nLogin with:")
    print(f"Email: {ADMIN_EMAIL}")
    print(f"Password: {ADMIN_PASSWORD}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
