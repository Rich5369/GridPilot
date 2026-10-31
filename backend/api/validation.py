"""Preserve standard 422 validation responses for nonfinite JSON numbers."""
from math import isfinite
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def validation_error_response(request, exc: RequestValidationError):
    # Python's JSON parser accepts NaN/Infinity and overflows 1e309 to infinity.
    # Pydantic rejects them correctly, but the default error echoes the float,
    # which JSONResponse cannot serialize. Keep the normal detail/error shape;
    # encode only nonfinite diagnostic values as strings, never valid inputs.
    errors = jsonable_encoder(exc.errors(), custom_encoder={
        float: lambda value: value if isfinite(value) else str(value),
    })
    return JSONResponse(status_code=422, content={'detail': errors})
