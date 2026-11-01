"""Turns a furniture pack sent through the issue form into files for a pull request.

Reads the issue from the GitHub event file (never from the command line or the shell), checks the pack with NextFloor's own
import check (custom_components/nextfloor/packs.py, checked out beside this repository), and writes packs/<id>.json and the
pack's entry in index.json. Writes what happened to the file named by the RESULT environment variable (JSON), for the
workflow's comment on the issue. Exit code 0 also when the pack is refused: the comment tells the author why.

Run by .github/workflows/furniture.yml; locally: python3 scripts/submission.py <event.json> <path to NextFloor>.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
RAW = "https://raw.githubusercontent.com/therealMRBK/NextFloor-Plugins/main/packs/{id}.json"
MAX_PACKS_BYTES = 1_000_000


def pack_text(body: str) -> str | None:
    """The pack from the issue body: the "Pack" section of the form, inside its json code fence if there is one."""
    match = re.search(r"^###\s*Pack\s*$(.*?)(?=^###\s|\Z)", body, flags=re.M | re.S)
    section = match.group(1) if match else body
    fenced = re.search(r"```(?:json)?\s*\n(.*?)\n```", section, flags=re.S)
    text = (fenced.group(1) if fenced else section).strip()
    # an empty field of the form reads "_No response_"
    return text if text and text != "_No response_" else None


def run(event: dict, nextfloor: Path) -> dict:
    sys.path.insert(0, str(nextfloor / "custom_components" / "nextfloor"))
    from packs import PackError, parse_pack  # noqa: PLC0415 - NextFloor's own check, from the checkout

    issue = event.get("issue") or {}
    author = (issue.get("user") or {}).get("login", "")
    text = pack_text(issue.get("body") or "")
    if not text:
        return {"ok": False, "reason": "No pack found in the issue. Paste the whole pack file into the \"Pack\" field."}
    if len(text.encode()) > MAX_PACKS_BYTES:
        return {"ok": False, "reason": "The pack is larger than 1 MB."}
    try:
        pack = parse_pack(text)
    except PackError as err:
        return {"ok": False, "reason": f"NextFloor would not import this pack: {err}"}
    pack_id = pack["id"]
    if pack_id.startswith("nextfloor."):
        return {"ok": False, "reason": "Pack ids starting with \"nextfloor.\" are kept for the packs that come with NextFloor."}
    # parse_pack only lets [a-z0-9_.-] through, so the id is a safe file name; check again all the same
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{0,39}", pack_id) or ".." in pack_id:
        return {"ok": False, "reason": "The pack id is not a valid file name."}

    index_file = ROOT / "index.json"
    index = json.loads(index_file.read_text(encoding="utf-8"))
    packs = index.setdefault("packs", [])
    old = next((p for p in packs if p.get("id") == pack_id), None)
    # only who first shared a pack may send new versions of it
    if old and old.get("submitter") and old["submitter"].lower() != author.lower():
        return {"ok": False, "reason": f"A pack with the id \"{pack_id}\" was shared by @{old['submitter']}. Choose another id."}
    if old and int(pack.get("release", 1)) <= int(old.get("release", 1)):
        return {"ok": False, "reason": f"The store has release {old.get('release', 1)} of this pack already: raise the version in the builder."}

    content = json.dumps(pack, ensure_ascii=False, indent=1) + "\n"
    target = ROOT / "packs" / f"{pack_id}.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(content, encoding="utf-8")
    entry = {
        "id": pack_id,
        "name": pack["name"],
        "description": pack.get("description", ""),
        "author": pack["publisher"],
        "submitter": author,
        "release": int(pack.get("release", 1)),
        "items": len(pack["items"]),
        "url": RAW.format(id=pack_id),
        "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
    }
    index["packs"] = sorted([p for p in packs if p.get("id") != pack_id] + [entry], key=lambda p: p["id"])
    index_file.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "id": pack_id, "name": pack["name"], "release": entry["release"], "items": entry["items"], "update": bool(old)}


def main() -> None:
    event_path, nextfloor = Path(sys.argv[1]), Path(sys.argv[2])
    result = run(json.loads(event_path.read_text(encoding="utf-8")), nextfloor)
    out = os.environ.get("RESULT")
    if out:
        Path(out).write_text(json.dumps(result), encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
