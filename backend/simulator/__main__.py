"""Run from repository root: python -m backend.simulator [building.json]."""
import argparse
import json
from pathlib import Path
from backend.simulator import simulate_building

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("config", nargs="?", type=Path,
                    default=Path(__file__).resolve().parents[2] / "sample_data/commercial_office.json")
args = parser.parse_args()
print(simulate_building(json.loads(args.config.read_text())).model_dump_json(indent=2))
