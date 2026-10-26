"""EE-owned optimizer boundary; no API or frontend dependencies."""
from backend.models.contracts import OptimizationResult, Scenario


def optimize_scenario(scenario: Scenario) -> OptimizationResult:
    """Respect building capacity and equipment windows; report infeasibility explicitly."""
    raise NotImplementedError("Optimization is not implemented")
