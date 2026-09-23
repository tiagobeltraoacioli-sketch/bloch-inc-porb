"""Export the same synthetic fixture consumed by the local API."""

import json
from pathlib import Path

from .data import OVERVIEW


def main():
    target = Path(__file__).resolve().parents[1] / "site" / "assets" / "demo.json"
    target.write_text(json.dumps(OVERVIEW, indent=2, ensure_ascii=False) + "\n")
    print(target)


if __name__ == "__main__":
    main()
