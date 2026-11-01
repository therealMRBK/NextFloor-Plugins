"""Every furniture pack of the store through NextFloor's own import check (custom_components/nextfloor/packs.py).

Run: python3 scripts/check_packs.py <path to a NextFloor checkout>
"""

from __future__ import annotations

from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(sys.argv[1]) / "custom_components" / "nextfloor"))
from packs import PackError, parse_pack  # noqa: E402

failed = 0
for file in sorted((root / "packs").glob("*.json")):
    try:
        pack = parse_pack(file.read_text(encoding="utf-8"))
        print(f"{file.name}: OK, {len(pack['items'])} item(s)")
    except PackError as err:
        failed += 1
        print(f"{file.name}: NextFloor would not import it: {err}")
sys.exit(1 if failed else 0)
