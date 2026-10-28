import logging
from inspect import signature
from typing import Literal

from fastapi import APIRouter, HTTPException

from backend.models.contracts import HealthResponse, OptimizationResult, Scenario
from backend.optimizer.interface import optimize_scenario
from backend.optimizer.solver import (
    OptimizationSolverError,
    OptimizationUnresolvedError,
    OptimizationVerificationError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def service_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@router.post("/optimize", response_model=OptimizationResult, responses={
    503: {"description": "Solver unavailable or optimization unresolved"},
    500: {"description": "Solver or independent verification failure"},
})
def optimize(scenario: Scenario, scheduling_mode: Literal["ev_only", "joint"] = "ev_only") -> OptimizationResult:
    """Run the existing verified optimizer in FastAPI's worker thread pool."""
    try:
        # Validate here as well as at the HTTP boundary so invalid adapter output
        # follows the same sanitized failure path as other internal errors.
        if scheduling_mode == "joint":
            # The engineering adapter extension is a separate dependency.
            # Never silently substitute an EV-only solve for a joint request.
            if "optimize_flexible" not in signature(optimize_scenario).parameters:
                raise service_error(503, "joint_adapter_unavailable",
                                    "Joint scheduling is unavailable until the engineering adapter is installed.")
            result = optimize_scenario(scenario, optimize_flexible=True)
        else:
            result = optimize_scenario(scenario)
        return OptimizationResult.model_validate(result)
    except HTTPException:
        raise
    except OptimizationUnresolvedError:
        logger.exception("Optimization unresolved")
        raise service_error(503, "optimization_unresolved", "The solver could not resolve this request. Try again later.") from None
    except OptimizationSolverError as exc:
        logger.exception("Optimization solver failed")
        # The existing engine reports initialization failures before a primary
        # solve as not_run, including a missing GLOP backend. It has no separate
        # unavailable exception; do not classify failures by exception text.
        if exc.outcome.primary_status == "not_run":
            raise service_error(503, "solver_unavailable", "The optimization solver is unavailable. Try again later.") from None
        raise service_error(500, "solver_error", "The optimization solver failed. No result was returned.") from None
    except OptimizationVerificationError:
        logger.exception("Optimization verification failed")
        raise service_error(500, "verification_failed", "The optimization result failed verification. No result was returned.") from None
    except Exception:
        logger.exception("Unexpected optimization failure")
        raise service_error(500, "optimization_error", "Optimization failed. No result was returned.") from None
