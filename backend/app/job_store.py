import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict

from app.config import get_settings
from app.database_sqlite import get_db_connection, j, js, with_lock


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        json_path = Path(settings.data_dir) / "jobs.json"
        if not json_path.exists():
            return
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM jobs").fetchone()[0]
            if count:
                return
            try:
                records = json.loads(json_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return
            for item in records:
                conn.execute(
                    "INSERT OR IGNORE INTO jobs (job_id, status, progress, message, result, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        item.get("job_id"),
                        item.get("status", "uploading"),
                        item.get("progress", 0),
                        item.get("message", ""),
                        js(item.get("result", {})),
                        item.get("updated_at"),
                    ),
                )
            conn.commit()
            json_path.rename(json_path.with_name(json_path.name + ".migrated"))
    except Exception:
        return


_migrate_from_json()


def create_job(job_id: str) -> Dict:
    job = {
        "job_id": job_id,
        "status": "uploading",
        "progress": 0,
        "message": "Uploading document...",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "INSERT OR REPLACE INTO jobs (job_id, status, progress, message, result, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                job["job_id"],
                job["status"],
                job["progress"],
                job["message"],
                js({}),
                job["updated_at"],
            ),
        )
        conn.commit()
    return job


def update_job(job_id: str, status: str, progress: int, message: str) -> Dict:
    job = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
        "message": message,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "UPDATE jobs SET status = ?, progress = ?, message = ?, updated_at = ? WHERE job_id = ?",
            (status, progress, message, job["updated_at"], job_id),
        )
        conn.commit()
    return job


def get_job(job_id: str) -> Dict | None:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT job_id, status, progress, message, updated_at FROM jobs WHERE job_id = ?",
        (job_id,),
    ).fetchone()
    return dict(row) if row else None
