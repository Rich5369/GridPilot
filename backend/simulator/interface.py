"""EE-owned baseline simulator boundary; no API or frontend dependencies."""
from backend.models.contracts import BaselineResult, Scenario


def simulate_baseline(scenario: Scenario) -> BaselineResult:
    """Return a documented uncontrolled baseline; implement policy before wiring API."""
    raise NotImplementedError("Baseline simulation is not implemented")
