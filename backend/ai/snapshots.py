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
        k = (*key(scenario, mode), result.result_id)
        _results[k] = result.model_copy(deep=True)
        _results.move_to_end(k)
        while len(_results) > 64:
            _results.popitem(last=False)

def lookup(scenario, mode, result_id=None):
    with _lock:
        result = next((r for (inputs, m, _), r in reversed(_results.items())
                       if m == mode and inputs == scenario.model_dump_json()), None)
        if result_id is not None:
            result = next((r for (inputs, m, _), r in _results.items()
                           if m == mode and inputs == scenario.model_dump_json() and r.result_id == result_id), None)
        return result.model_copy(deep=True) if result else None
