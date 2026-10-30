"""EIA monthly commercial retail averages; never optimizer tariff inputs."""
import asyncio
import json
import math
import re
import time
from datetime import date, datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field

SOURCE_URL = 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a'
REUSE_URL = 'https://www.eia.gov/about/copyrights_reuse.php'
DATA_DIR = Path(__file__).parent
STATES = tuple(json.loads((DATA_DIR / 'states.json').read_text()))
TTL_SECONDS = 6 * 60 * 60
FETCH_DEADLINE_SECONDS = 8


class StatePrice(BaseModel):
    state: str
    cents_per_kwh: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    previous_year_cents_per_kwh: float | None = Field(default=None, ge=0, allow_inf_nan=False)


class RetailPrices(BaseModel):
    source: str = 'U.S. Energy Information Administration · Electric Power Monthly, Table 5.6.A'
    source_url: str = SOURCE_URL
    reuse_url: str = REUSE_URL
    sector: Literal['Commercial'] = 'Commercial'
    units: Literal['cents/kWh'] = 'cents/kWh'
    period: str = Field(pattern=r'^\d{4}-\d{2}$')
    previous_year_period: str = Field(pattern=r'^\d{4}-\d{2}$')
    released_at: date
    source_checked_at: datetime
    status: Literal['available', 'saved', 'delayed'] = 'available'
    notice: str | None = None
    preliminary: bool = True
    states: list[StatePrice]


class TableParser(HTMLParser):
    """Read only the numeric EIA report table; never render upstream HTML."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.rows = []
        self.active = False
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table' and attrs.get('summary', '').startswith('Procedure Report:'):
            self.active = True
        if self.active and tag == 'tr':
            self.row = []
        if self.active and tag in ('td', 'th'):
            self.cell = {'text': '', 'span': int(attrs.get('colspan', '1'))}
        if self.cell is not None and tag == 'br':
            self.cell['text'] += ' '

    def handle_data(self, data):
        self.text.append(data)
        if self.cell is not None:
            self.cell['text'] += data

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.cell['text'] = ' '.join(self.cell['text'].split())
            if self.row is not None:
                self.row.append(self.cell)
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        if tag == 'table':
            self.active = False


def number(value):
    try:
        result = float(value.replace(',', ''))
        return result if math.isfinite(result) and result >= 0 else None
    except (ValueError, AttributeError):
        return None


def parse_report(html, checked_at):
    parser = TableParser()
    parser.feed(html)
    text = ' '.join(' '.join(parser.text).split())
    if 'Table 5.6.A.' not in text or 'Cents per Kilowatthour' not in text:
        raise ValueError('Unexpected EIA table or units')
    groups, periods, *rows = parser.rows
    expanded = [cell['text'] for cell in groups for _ in range(cell['span'])]
    columns = [i for i, label in enumerate(expanded) if label == 'Commercial']
    if len(columns) != 2 or len(periods) != len(expanded):
        raise ValueError('Unexpected commercial column layout')
    current, previous = (datetime.strptime(periods[i]['text'], '%B %Y').date() for i in columns)
    release_match = re.search(r'(?<!Next )Release Date:\s*([A-Za-z]+ \d{1,2}, \d{4})', text)
    released_at = datetime.strptime(release_match[1], '%B %d, %Y').date()
    if current.month != previous.month or current.year != previous.year + 1 or current > released_at or released_at > checked_at.date():
        raise ValueError('Unexpected EIA reporting dates')
    records = {}
    for row in rows:
        if not row or row[0]['text'] not in STATES:
            continue
        name = row[0]['text']
        if name in records or len(row) != len(expanded):
            raise ValueError('Duplicate state or incomplete row')
        records[name] = StatePrice(state=name, cents_per_kwh=number(row[columns[0]]['text']),
                                  previous_year_cents_per_kwh=number(row[columns[1]]['text']))
    if not any(r.cents_per_kwh is not None for r in records.values()):
        raise ValueError('No commercial prices reported')
    return RetailPrices(period=current.strftime('%Y-%m'), previous_year_period=previous.strftime('%Y-%m'),
                        released_at=released_at, source_checked_at=checked_at,
                        states=[records.get(name, StatePrice(state=name)) for name in STATES])


class RetailService:
    def __init__(self, clock=None, monotonic=None, snapshot_path=None):
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.monotonic = monotonic or time.monotonic
        self.snapshot_path = snapshot_path or DATA_DIR / 'commercial_snapshot.json'
        self.cache = None
        self.expires = 0
        self.lock = asyncio.Lock()

    async def fetch(self):
        async with asyncio.timeout(FETCH_DEADLINE_SECONDS):
            async with httpx.AsyncClient(timeout=httpx.Timeout(6, connect=3), follow_redirects=True) as client:
                # Bound both download memory and source request volume.
                async with client.stream('GET', SOURCE_URL) as response:
                    response.raise_for_status()
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > 1_000_000:
                            raise ValueError('EIA response too large')
                return parse_report(body.decode('utf-8', errors='replace'), self.clock())

    async def get(self):
        if self.monotonic() >= self.expires:
            async with self.lock:
                if self.monotonic() >= self.expires:
                    try:
                        fresh = await self.fetch()
                        previous = self.cache
                        # The saved release is also available across cold starts.
                        if previous is None:
                            previous = RetailPrices.model_validate_json(self.snapshot_path.read_text())
                        if fresh.released_at < previous.released_at or fresh.period < previous.period:
                            raise ValueError('Provider report regressed')
                        self.cache = fresh
                    except (TimeoutError, httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError, IndexError, OverflowError):
                        self.cache = self.cache or RetailPrices.model_validate_json(self.snapshot_path.read_text())
                        self.cache = self.cache.model_copy(update={'status': 'saved', 'notice': 'Refresh unavailable. Showing the saved EIA release with its original reporting month and source-check time.'})
                    self.expires = self.monotonic() + TTL_SECONDS
        result = self.cache.model_copy(deep=True)
        if (self.clock().date() - result.released_at).days > 62:
            result.status = 'delayed'
            result.notice = 'This release is more than 62 days old. Check EIA for a newer publication; the reporting month has not been changed.'
        return result


service = RetailService()
