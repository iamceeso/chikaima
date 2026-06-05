from __future__ import annotations

from app.schemas.common import TimestampedResponse


class JobResponse(TimestampedResponse):
    user_id: str
    job_type: str
    status: str
    resource_type: str | None
    resource_id: str | None
    payload: dict
    result: dict
    error_message: str | None
