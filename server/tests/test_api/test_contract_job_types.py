"""The contract's ``JobType`` covers every job type the server can create (F16).

The expected set is read from the source, not copied by hand: every call to a
job repository's ``create(...)`` under ``src/journal`` names its job type
either as a string literal or as a parameter of the enclosing helper (as
``_stage_child`` in ``services/jobs/save_pipeline.py`` does), in which case the
literal comes from that helper's call sites. A new ``jobs.create("new_type")``
therefore fails ``test_every_created_job_type_is_in_the_contract`` until
``JobType`` gains it, and a type the code stops creating fails
``test_job_type_has_no_stale_members`` until it is removed or listed in
``LEGACY_JOB_TYPES`` (still present in old ``jobs`` rows the API returns).
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, get_args

import pytest

from journal.api.contract import schemas

if TYPE_CHECKING:
    from starlette.testclient import TestClient

    from journal.db.jobs_repository import SQLiteJobRepository

SRC_DIR = Path(schemas.__file__).resolve().parents[2]  # .../src/journal
assert SRC_DIR.name == "journal"

# Receivers that hold a SQLiteJobRepository: `self._jobs`, `jobs`,
# `job_repository`, `job_repo`, `self._job_repository`, ...
_JOB_REPO_RECEIVER = re.compile(r"(^|\.)_?(jobs|job_repo|job_repository)$")


@dataclass(frozen=True)
class _Site:
    path: Path
    line: int

    def __str__(self) -> str:
        return f"{self.path.relative_to(SRC_DIR.parent)}:{self.line}"


def _is_job_repo_create(node: ast.Call) -> bool:
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr == "create"
        and bool(_JOB_REPO_RECEIVER.search(ast.unparse(func.value)))
    )


def _str_const(node: ast.AST) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _job_type_arg(call: ast.Call) -> ast.AST | None:
    if call.args:
        return call.args[0]
    for kw in call.keywords:
        if kw.arg == "job_type":
            return kw.value
    return None


def _enclosing_functions(tree: ast.Module) -> dict[ast.AST, ast.FunctionDef]:
    """Map every node to the innermost function definition containing it."""
    owner: dict[ast.AST, ast.FunctionDef] = {}

    def visit(node: ast.AST, current: ast.FunctionDef | None) -> None:
        for child in ast.iter_child_nodes(node):
            inner = child if isinstance(child, ast.FunctionDef) else current
            if current is not None:
                owner[child] = current
            visit(child, inner)

    visit(tree, None)
    return owner


def _literals_for_parameter(
    tree: ast.Module, func: ast.FunctionDef, param: str
) -> list[str | None]:
    """Values passed for ``param`` at every call of ``func`` in the module."""
    names = [a.arg for a in (*func.args.posonlyargs, *func.args.args)]
    index = names.index(param)
    values: list[str | None] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
            continue
        if node.func.id != func.name:
            continue
        if index < len(node.args):
            values.append(_str_const(node.args[index]))
        else:
            kw = next((k for k in node.keywords if k.arg == param), None)
            values.append(_str_const(kw.value) if kw else None)
    return values


def created_job_types() -> tuple[dict[str, list[_Site]], list[str]]:
    """Scan ``src/journal`` for job-repository ``create`` calls.

    Returns ``(job type -> call sites, unresolved call sites)``.
    """
    found: dict[str, list[_Site]] = {}
    unresolved: list[str] = []
    for path in sorted(SRC_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        owners: dict[ast.AST, ast.FunctionDef] | None = None
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and _is_job_repo_create(node)):
                continue
            site = _Site(path, node.lineno)
            arg = _job_type_arg(node)
            literal = _str_const(arg) if arg is not None else None
            if literal is not None:
                found.setdefault(literal, []).append(site)
                continue
            # A variable: resolve it if it is a parameter of the enclosing
            # helper, from the literals the module passes to that helper.
            if owners is None:
                owners = _enclosing_functions(tree)
            func = owners.get(node)
            params = (
                {a.arg for a in (*func.args.posonlyargs, *func.args.args)} if func else set()
            )
            if not (isinstance(arg, ast.Name) and func and arg.id in params):
                unresolved.append(str(site))
                continue
            values = _literals_for_parameter(tree, func, arg.id)
            if not values or None in values:
                unresolved.append(f"{site} (via {func.name}({arg.id}=...))")
                continue
            for value in values:
                assert value is not None
                found.setdefault(value, []).append(site)
    return found, unresolved


def contract_job_types() -> set[str]:
    return set(get_args(schemas.JobType.__value__))


@pytest.fixture(scope="module")
def scan() -> tuple[dict[str, list[_Site]], list[str]]:
    return created_job_types()


def test_scan_finds_the_job_repository_calls(
    scan: tuple[dict[str, list[_Site]], list[str]],
) -> None:
    """Guard the scanner itself: it must see the known call shapes."""
    found, _ = scan
    # A literal in the runner, and one resolved through _stage_child.
    assert "entity_extraction" in found
    assert any("save_pipeline.py" in str(s) for s in found["reprocess_embeddings"])
    assert "save_entry_pipeline" in found
    assert len(found) >= 14


def test_every_job_repository_create_call_is_resolved(
    scan: tuple[dict[str, list[_Site]], list[str]],
) -> None:
    _, unresolved = scan
    assert not unresolved, (
        "Cannot tell which job type these create() calls use. Pass a string "
        f"literal (or a helper parameter fed literals): {unresolved}"
    )


def test_every_created_job_type_is_in_the_contract(
    scan: tuple[dict[str, list[_Site]], list[str]],
) -> None:
    found, _ = scan
    missing = {t: [str(s) for s in sites] for t, sites in found.items()
               if t not in contract_job_types()}
    assert not missing, (
        f"Job types created in code but missing from JobType in "
        f"journal/api/contract/schemas.py: {missing}. Add them, run "
        "`uv run journal contract export` and `npm run contract:gen`, and give "
        "them labels in the webapp."
    )


def test_job_type_has_no_stale_members(
    scan: tuple[dict[str, list[_Site]], list[str]],
) -> None:
    found, _ = scan
    not_created = contract_job_types() - set(found)
    assert not_created == set(schemas.LEGACY_JOB_TYPES), (
        f"JobType members no code creates: {sorted(not_created)}. Remove them, "
        "or add them to LEGACY_JOB_TYPES if old jobs rows still carry them."
    )


def test_scanner_resolves_helper_parameters(tmp_path: Path) -> None:
    source = (
        "def submit(jobs):\n"
        "    def _stage(job_type, keys):\n"
        "        jobs.create(job_type, {})\n"
        "    _stage('a_type', 1)\n"
        "    _stage(job_type='b_type', keys=2)\n"
        "    self._jobs.create('c_type', {})\n"
    )
    tree = ast.parse(source)
    calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and _is_job_repo_create(n)]
    assert len(calls) == 2
    [via_param] = [c for c in calls if isinstance(c.args[0], ast.Name)]
    owners = _enclosing_functions(tree)
    stage = owners[via_param]
    assert stage.name == "_stage"
    assert _literals_for_parameter(tree, stage, "job_type") == ["a_type", "b_type"]


def test_every_job_type_round_trips_through_the_jobs_api(
    client: TestClient, services: dict
) -> None:
    """A job row of each contract type passes the runtime contract check."""
    jobs: SQLiteJobRepository = services["job_repository"]
    for job_type in sorted(contract_job_types()):
        jobs.create(job_type, {"user_id": 1}, user_id=1)

    resp = client.get("/api/jobs?limit=100")

    assert resp.status_code == 200
    assert {j["type"] for j in resp.json()["items"]} == contract_job_types()
    assert client.contract_check.checked[-1] == "api_list_jobs"


def test_entity_type_and_job_status_match_the_models() -> None:
    from journal import models

    assert get_args(schemas.EntityType.__value__) == get_args(models.EntityType)
    assert get_args(schemas.JobStatus.__value__) == get_args(models.JobStatus)
