#!/usr/bin/env python3
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_PHASES = {"phase4", "phase5", "phase6", "phase7", "phase8"}
REQUIRED_APPROVALS = {"governance", "security", "operations", "releaseAuthority"}


def finalize(release_id: str, commit: str, evidence: dict[str, Path], approvals_path: Path) -> dict:
    if set(evidence) != REQUIRED_PHASES:
        missing = sorted(REQUIRED_PHASES - set(evidence))
        extra = sorted(set(evidence) - REQUIRED_PHASES)
        raise ValueError(f"phase evidence mismatch; missing={missing}, extra={extra}")
    artifacts = []
    for phase, path in sorted(evidence.items()):
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f"missing or empty {phase} evidence: {path}")
        artifacts.append({"phase": phase, "path": str(path.resolve()), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    approval_document = json.loads(approvals_path.read_text(encoding="utf-8"))
    if approval_document.get("releaseId") != release_id or approval_document.get("commit") != commit:
        raise ValueError("approval release ID or commit does not match")
    approvals = approval_document.get("approvals", {})
    if set(approvals) != REQUIRED_APPROVALS:
        raise ValueError("all governance, security, operations, and release-authority approvals are required")
    for role, approval in approvals.items():
        if approval.get("approved") is not True or not approval.get("name") or not approval.get("approvedAt"):
            raise ValueError(f"approval is incomplete: {role}")
    names = [approval["name"] for approval in approvals.values()]
    if len(set(names)) != len(names):
        raise ValueError("approval roles must be held by independent named approvers")
    return {
        "schemaVersion": "1",
        "status": "approved-for-go-live",
        "releaseId": release_id,
        "commit": commit,
        "certifiedAt": datetime.now(timezone.utc).isoformat(),
        "evidence": artifacts,
        "approvalsSha256": hashlib.sha256(approvals_path.read_bytes()).hexdigest(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Issue the final SynapseNet go-live certificate")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--approvals", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--evidence", action="append", required=True, help="phase=path")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=root, text=True).strip():
        raise SystemExit("Refusing certification from a dirty worktree")
    evidence = {}
    for item in args.evidence:
        phase, separator, path = item.partition("=")
        if not separator or phase in evidence:
            raise SystemExit(f"Invalid or duplicate evidence argument: {item}")
        evidence[phase] = Path(path)
    certificate = finalize(args.release_id, commit, evidence, args.approvals)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(certificate, indent=2) + "\n", encoding="utf-8")
    print(f"Go-live certificate written to {args.output}")


if __name__ == "__main__":
    main()
