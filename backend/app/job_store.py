from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict

_JOBS: Dict[str, Dict] = {}


def create_job(job_id: str) -> Dict:
    _JOBS[job_id] = {
        "job_id": job_id,
        "status": "uploading",
        "progress": 0,
        "message": "Uploading document...",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return _JOBS[job_id]


def update_job(job_id: str, status: str, progress: int, message: str) -> Dict:
    job = _JOBS.setdefault(job_id, {"job_id": job_id})
    job.update(
        {
            "status": status,
            "progress": progress,
            "message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return job


def get_job(job_id: str) -> Dict | None:
    return _JOBS.get(job_id)
