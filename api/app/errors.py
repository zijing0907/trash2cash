"""Every error the API returns looks like {"detail": {"code": "...", "message": "..."}}, the same shape
as ml-service, so the web app needs one way to show errors."""

from fastapi import HTTPException


def api_error(status: int, code: str, message: str, headers: dict[str, str] | None = None) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message}, headers=headers)
