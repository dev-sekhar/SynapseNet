#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path


def verify(manifest_path: Path, expected_release: str) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != "1":
        raise ValueError("unsupported release evidence schema")
    if manifest.get("releaseId") != expected_release:
        raise ValueError("release evidence ID does not match RELEASE_ID")
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError("release evidence contains no artifacts")
    for artifact in artifacts:
        path = Path(artifact["path"])
        if not path.is_file():
            raise ValueError(f"evidence artifact is missing: {path}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != artifact.get("sha256"):
            raise ValueError(f"evidence artifact digest changed: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify a Phase 6 release evidence manifest")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--release-id", required=True)
    args = parser.parse_args()
    verify(args.manifest, args.release_id)
    print(f"Release evidence verified for {args.release_id}.")


if __name__ == "__main__":
    main()
