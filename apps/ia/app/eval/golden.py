"""Golden set — reference companies + expected/known attributes.

Each ``golden/<slug>.json`` file declares STRUCTURAL, verifiable expectations for
a reference company (exact SIREN, sector present, has-subsidiaries, is-public,
min entities). Values mirror the in-repo frozen research fixtures
(``packages/contracts/.../research.<slug>.json``) — no fabricated business
claims. A golden optionally points at a bundled analysis fixture
(``fixtures/<file>``) used as its default output to score.

Analysis fixtures are self-contained synthetic test dossiers: their firmographic
facts are the real (in-repo verifiable) values; their contacts are clearly
labelled placeholder test data (``_synthetic: true``), never claims about real
people.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
GOLDEN_DIR = _HERE / "golden"
FIXTURES_DIR = _HERE / "fixtures"


@dataclass(frozen=True)
class Golden:
    """A reference company's expectations, as loaded from ``golden/<slug>.json``."""

    slug: str
    company: str
    expect: dict[str, Any]
    fixture: str | None = None

    def as_expectations(self) -> dict[str, Any]:
        """The mapping shape consumed by :func:`app.eval.metrics.completeness`."""
        return {"company": self.company, "slug": self.slug, "expect": self.expect}


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_golden(slug: str) -> Golden:
    path = GOLDEN_DIR / f"{slug}.json"
    if not path.exists():
        raise FileNotFoundError(f"No golden named {slug!r} in {GOLDEN_DIR}")
    raw = load_json(path)
    return Golden(
        slug=str(raw.get("slug") or path.stem),
        company=str(raw.get("company") or path.stem),
        expect=dict(raw.get("expect") or {}),
        fixture=raw.get("fixture"),
    )


def list_goldens() -> list[Golden]:
    return [load_golden(p.stem) for p in sorted(GOLDEN_DIR.glob("*.json"))]


def load_fixture(name: str) -> dict[str, Any]:
    """Load a bundled analysis fixture by file name (with or without .json)."""
    fname = name if name.endswith(".json") else f"{name}.json"
    path = FIXTURES_DIR / fname
    if not path.exists():
        raise FileNotFoundError(f"No fixture named {fname!r} in {FIXTURES_DIR}")
    return load_json(path)


def resolve_analysis(golden: Golden) -> dict[str, Any]:
    """The default analysis output to score for a golden — its bundled fixture."""
    fixture = golden.fixture or f"{golden.slug}.analysis.json"
    return load_fixture(fixture)
