#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path, PurePosixPath
from typing import Any, Final

def now_ms() -> int:
    return int(time.monotonic() * 1000)


EXIT_OK: Final = 0
EXIT_BLOCKING_FINDINGS: Final = 1
EXIT_USAGE_ERROR: Final = 2
MAX_SCAN_BYTES: Final = 512 * 1024
REDACTED_SNIPPET: Final = "<redacted>"

PATTERNS: list[tuple[str, str, str, re.Pattern[str]]] = [
    (
        "user_home_path",
        "high",
        "Possible local home path",
        re.compile(
            r"(/Users/[^/\s]+"  # pii:allow - scanner rule, not a real path
            r"|/home/[^/\s]+)(/[^\s`'\"<>()]+)?"  # pii:allow - scanner rule
        ),
    ),
    (
        "email_address",
        "medium",
        "Possible email address",
        re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    ),
    (
        "openai_key",
        "critical",
        "Possible OpenAI-style API key",
        re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    ),
    (
        "github_token",
        "critical",
        "Possible GitHub token",
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    ),
    (
        "bearer_token",
        "high",
        "Possible bearer token",
        re.compile(r"Authorization:\s*Bearer\s+[A-Za-z0-9._-]{10,}", re.IGNORECASE),
    ),
    (
        "private_key",
        "critical",
        "Private key marker",
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ),
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan staged repository changes for sensitive data."
    )
    parser.add_argument("--repo", default=".", help="Repository path to scan")
    parser.add_argument("--staged", action="store_true", help="Scan staged files only")
    parser.add_argument(
        "--include-untracked",
        action="store_true",
        help="Include untracked files with --staged",
    )
    parser.add_argument(
        "--format", choices=("text", "json"), default="text", help="Output format"
    )
    return parser.parse_args()


def _repo_path(repo: str) -> Path:
    return Path(repo).expanduser().resolve()


def _print_text_result(result: dict[str, Any]) -> None:
    data = result.get("data") or {}
    findings = data.get("findings") or []
    files_scanned = data.get("files_scanned", 0)
    if not findings:
        print(f"PII scan clean: {files_scanned} files scanned.")
        return

    print(f"PII scan blocked: {len(findings)} finding(s) in {files_scanned} file(s).")
    for finding in findings:
        print(
            f"- {finding.get('severity')} {finding.get('kind')} "
            f"{finding.get('path')}:{finding.get('line')} {finding.get('snippet')}"
        )


def _is_forbidden_env_path(path: str) -> bool:
    name = PurePosixPath(path).name.lower()
    if name == ".env.example" or name.endswith(".env.example"):
        return False
    return (
        name == ".env"
        or name.startswith(".env.")
        or name.endswith(".env")
        or ".env." in name
    )


def _run_git(repo_path: Path, args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def _unique_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        unique.append(path)
    return unique


def _git_staged_files(repo_path: Path, *, include_untracked: bool) -> list[Path]:
    code, out, err_text = _run_git(
        repo_path, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    )
    if code != 0:
        raise RuntimeError(err_text or out or "git diff --cached failed")
    paths = [repo_path / line for line in out.splitlines() if line.strip()]
    if include_untracked:
        code, out, err_text = _run_git(
            repo_path, ["ls-files", "--others", "--exclude-standard"]
        )
        if code != 0:
            raise RuntimeError(err_text or out or "git ls-files --others failed")
        paths.extend(repo_path / line for line in out.splitlines() if line.strip())
    return _unique_paths(paths)


def _git_staged_content(repo_path: Path, path: Path) -> bytes:
    rel_path = path.relative_to(repo_path).as_posix()
    proc = subprocess.run(
        ["git", "-C", str(repo_path), "show", f":{rel_path}"],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        error = proc.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(error or f"cannot read staged file: {rel_path}")
    return proc.stdout


def _is_binary(data: bytes) -> bool:
    return b"\x00" in data


def _match_findings(repo_path: Path, path: Path, text: str) -> list[dict[str, Any]]:
    rel_path = str(path.relative_to(repo_path))
    matches: list[dict[str, Any]] = []
    for line_no, line in enumerate(text.splitlines(), start=1):
        if "pii:allow" in line:
            continue
        for kind, severity, description, pattern in PATTERNS:
            match = pattern.search(line)
            if not match:
                continue
            matches.append(
                {
                    "path": rel_path,
                    "line": line_no,
                    "kind": kind,
                    "severity": severity,
                    "description": description,
                    "snippet": REDACTED_SNIPPET,
                }
            )
    return matches


def scan_paths(
    repo_path: Path, paths: list[Path], *, scope: str, tool_name: str, started: int
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    files_scanned = 0

    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        try:
            raw = path.read_bytes()
        except Exception:
            continue
        if len(raw) > MAX_SCAN_BYTES or _is_binary(raw):
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = raw.decode("latin-1")
            except Exception:
                continue
        files_scanned += 1
        findings.extend(_match_findings(repo_path, path, text))

    return {
        "status": "ok",
        "tool": tool_name,
        "data": {
            "repo": str(repo_path),
            "scope": scope,
            "clean": not findings,
            "blocking": bool(findings),
            "files_scanned": files_scanned,
            "findings_count": len(findings),
            "findings": findings,
        },
        "error": None,
        "meta": {
            "duration_ms": now_ms() - started,
            "source": "pii",
        },
    }


def _scan_staged(repo_path: Path, *, include_untracked: bool) -> dict[str, Any]:
    paths = _git_staged_files(repo_path, include_untracked=include_untracked)
    findings: list[dict[str, Any]] = []
    files_scanned = 0
    started = now_ms()

    code, staged_output, err_text = _run_git(
        repo_path, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    )
    if code != 0:
        raise RuntimeError(err_text or staged_output or "git diff --cached failed")
    staged_paths = {line for line in staged_output.splitlines() if line.strip()}

    for path in paths:
        rel_path = path.relative_to(repo_path).as_posix()
        if _is_forbidden_env_path(rel_path):
            findings.append(
                {
                    "path": rel_path,
                    "line": 0,
                    "kind": "sensitive_env_file",
                    "severity": "critical",
                    "description": "Environment files other than *.env.example must not be committed",
                    "snippet": REDACTED_SNIPPET,
                }
            )
            continue

        try:
            raw = (
                _git_staged_content(repo_path, path)
                if rel_path in staged_paths
                else path.read_bytes()
            )
        except Exception:
            continue
        if len(raw) > MAX_SCAN_BYTES or _is_binary(raw):
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = raw.decode("latin-1")
            except Exception:
                continue
        files_scanned += 1
        findings.extend(_match_findings(repo_path, path, text))

    return {
        "status": "ok",
        "tool": "scan_pii_staged",
        "data": {
            "repo": str(repo_path),
            "scope": "staged",
            "clean": not findings,
            "blocking": bool(findings),
            "files_scanned": files_scanned,
            "findings_count": len(findings),
            "findings": findings,
        },
        "error": None,
        "meta": {"duration_ms": now_ms() - started, "source": "pii"},
    }


def main() -> int:
    args = _parse_args()

    repo_path = _repo_path(args.repo)
    if not repo_path.exists():
        print(f"error: repo path does not exist: {repo_path}", file=sys.stderr)
        return EXIT_USAGE_ERROR

    if not args.staged:
        print(
            "error: only --staged mode is currently supported by the local CLI",
            file=sys.stderr,
        )
        return EXIT_USAGE_ERROR

    code, out, _ = _run_git(repo_path, ["rev-parse", "--is-inside-work-tree"])
    if code != 0 or out != "true":
        print(f"error: not a git repo: {repo_path}", file=sys.stderr)
        return EXIT_USAGE_ERROR

    try:
        result = _scan_staged(repo_path, include_untracked=args.include_untracked)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE_ERROR

    if args.format == "json":
        print(json.dumps(result, indent=2))
    else:
        _print_text_result(result)
    return (
        EXIT_BLOCKING_FINDINGS
        if (result.get("data") or {}).get("blocking")
        else EXIT_OK
    )


if __name__ == "__main__":
    raise SystemExit(main())
