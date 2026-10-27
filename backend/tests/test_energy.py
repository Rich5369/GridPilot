import pytest
from pydantic import ValidationError
from backend.simulator.energy import total_energy_kwh, peak_demand_kw, sum_loads


def test_constant_load():
    assert total_energy_kwh([3] * 24) == 72
    assert peak_demand_kw([1] * 23 + [7]) == 7
    assert sum_loads([[1] * 24, [2] * 24]) == [3] * 24


@pytest.mark.parametrize('values', [[1] * 23, [-1] * 24, [float('nan')] * 24, [float('inf')] * 24])
def test_invalid_load(values):
    with pytest.raises(ValidationError):
        total_energy_kwh(values)
