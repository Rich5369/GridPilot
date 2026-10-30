"""Bounded process-local copies of actual solver responses; never client results."""
from collections import OrderedDict
from threading import Lock
from backend.models.contracts import Scenario, OptimizationResult

_results = OrderedDict()
_lock = Lock()

def key(scenario, mode):
    return (scenario.model_dump_json(), mode)

def remember(scenario: Scenario, mode: str, result: OptimizationResult):
    with _lock:
        k = key(scenario, mode)
        _results[k] = result.model_copy(deep=True)
        _results.move_to_end(k)
        while len(_results) > 64:
            _results.popitem(last=False)

def lookup(scenario, mode):
    with _lock:
        result = _results.get(key(scenario, mode))
        return result.model_copy(deep=True) if result else None
