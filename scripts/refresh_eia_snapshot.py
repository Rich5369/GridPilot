"""Refresh only public EIA numeric data: python -m scripts.refresh_eia_snapshot.

Review the diff before committing. No account or key; never accesses ISO feeds.
"""
import asyncio
from backend.eia.retail import DATA_DIR, RetailPrices, RetailService


async def main():
    report = await RetailService().fetch()
    path = DATA_DIR / 'commercial_snapshot.json'
    previous = RetailPrices.model_validate_json(path.read_text())
    if report.period < previous.period or report.released_at < previous.released_at:
        raise ValueError('Refusing older report')
    if len(report.states) != 51 or any(s.cents_per_kwh is None for s in report.states):
        raise ValueError('Incomplete source: review missing state data before updating snapshot')
    path.write_text(report.model_dump_json(indent=2) + '\n')
    print(f'EIA {report.period}; released {report.released_at}; {len(report.states)} areas. Review snapshot diff.')


if __name__ == '__main__':
    asyncio.run(main())
