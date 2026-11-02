import os
import asyncio
from contextlib import suppress
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from backend.api.validation import validation_error_response
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router

load_dotenv(Path(__file__).with_name(".env"))
@asynccontextmanager
async def lifespan(app):
    task = None
    # Disabled diagnostics must not load the provider SDK on every cold start.
    # Live generation still imports it on demand through ai.service.generate.
    if os.getenv("MODEL_API_DIAGNOSTIC_ON_STARTUP") == "1":
        from backend.ai.startup_diagnostic import list_models_on_startup
        task = asyncio.create_task(list_models_on_startup())
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="GridPilot API", version="0.1.0", lifespan=lifespan)
app.add_exception_handler(RequestValidationError, validation_error_response)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)

from backend.ai.routes import router as ai_router
app.include_router(ai_router)

from backend.savings.routes import router as savings_router
app.include_router(savings_router)
