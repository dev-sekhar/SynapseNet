#!/usr/bin/env python3
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(release_id: str, artifacts: list[Path], root: Path) -> dict:
    missing = [str(path) for path in artifacts if not path.is_file() or not path.stat().st_size]
    if missing:
        raise ValueError(f"missing or empty evidence: {', '.join(missing)}")
    commit = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=root, text=True
    ).strip()
    return {
        "schemaVersion": "1",
        "releaseId": release_id,
        "commit": commit,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "artifacts": [
            {"path": str(path.resolve()), "sha256": digest(path), "bytes": path.stat().st_size}
            for path in sorted(artifacts, key=lambda item: str(item))
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a tamper-evident Phase 6 release manifest")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("artifacts", nargs="+", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    result = build(args.release_id, args.artifacts, root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Release evidence manifest written to {args.output}")


if __name__ == "__main__":
    main()
