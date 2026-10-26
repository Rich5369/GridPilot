from fastapi import APIRouter

from backend.models.contracts import HealthResponse, NotImplementedResponse, Scenario

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.post("/optimize", response_model=NotImplementedResponse, status_code=501)
def optimize(scenario: Scenario) -> NotImplementedResponse:
    """Validate the scenario, then explicitly report the unimplemented capability."""
    return NotImplementedResponse()
