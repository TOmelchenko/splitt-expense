"""Domain errors shared by the store and routers.

Mirrors `ServiceError` in frontend/src/services/types.ts: a single error type
whose message is always safe to show directly to the user. The two request
outcomes an endpoint can hit are "the input is bad" (ValidationError -> 400)
and "the thing doesn't exist" (NotFoundError -> 404); both are wired to
FastAPI exception handlers in app/main.py that render the shared Error schema
({"message": "..."}) from openapi.yaml.
"""


class ValidationError(Exception):
    pass


class NotFoundError(Exception):
    pass


class AuthError(Exception):
    """Bad credentials or a missing/invalid/expired bearer token."""
