"""The #274 campaign golden set — 15 real French accounts.

Same file shape as ``app/eval/golden/*.json`` (``slug`` / ``company`` /
``fixture`` / ``expect``) but kept in its own directory on purpose: the shipped
bench (``app.eval.run``) iterates *its* golden dir and requires every entry to
carry a scoreable fixture. These 15 accounts have **no fixture yet** — capturing
one means running the real pipeline — so dropping them next to the bench goldens
would break it. Separate dir ⇒ the shipped bench is untouched.

**No fabricated data.** Every factual field (SIREN, dénomination, NAF, tranche
d'effectif, commune) comes from the public Annuaire des Entreprises API
(``recherche-entreprises.api.gouv.fr``, DINUM, adossé à INSEE Sirene) and is
recorded per file in a ``registry`` block with its fetch date. ``expect`` carries
only structural expectations plus the verified SIREN; ``isPublic`` /
``hasSubsidiaries`` are deliberately absent because that source cannot prove
them. The reference output of each account is ``_capture_status:
"not_captured"`` until a baseline run produces it.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
COMPANIES_DIR = _HERE / "companies"

# Segments the DoD asks the set to span ("grand compte / ETI / scale-up").
SEGMENTS = ("grand-compte", "eti", "scale-up")

CAPTURE_NOT_CAPTURED = "not_captured"
CAPTURE_CAPTURED = "captured"


@dataclass(frozen=True)
class CampaignCompany:
    """One golden-set account: what to run, and what is verifiably true of it."""

    slug: str
    company: str
    segment: str
    sector_hint: str
    expect: dict[str, Any]
    registry: dict[str, Any]
    fixture: str | None = None
    capture_status: str = CAPTURE_NOT_CAPTURED

    @property
    def siren(self) -> str:
        return str(self.registry.get("siren") or self.expect.get("siren") or "")

    @property
    def captured(self) -> bool:
        return self.capture_status == CAPTURE_CAPTURED

    def as_expectations(self) -> dict[str, Any]:
        """The mapping shape consumed by ``app.eval.metrics.completeness``."""
        return {"company": self.company, "slug": self.slug, "expect": dict(self.expect)}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_company(slug: str, directory: Path | None = None) -> CampaignCompany:
    path = (directory or COMPANIES_DIR) / f"{slug}.json"
    if not path.exists():
        raise FileNotFoundError(f"No campaign company named {slug!r} in {directory or COMPANIES_DIR}")
    raw = _load_json(path)
    return CampaignCompany(
        slug=str(raw.get("slug") or path.stem),
        company=str(raw.get("company") or path.stem),
        segment=str(raw.get("segment") or ""),
        sector_hint=str(raw.get("sector_hint") or ""),
        expect=dict(raw.get("expect") or {}),
        registry=dict(raw.get("registry") or {}),
        fixture=raw.get("fixture"),
        capture_status=str(raw.get("_capture_status") or CAPTURE_NOT_CAPTURED),
    )


def list_companies(
    directory: Path | None = None, *, segment: str | None = None
) -> list[CampaignCompany]:
    """Every campaign account, slug-sorted; optionally filtered to one segment."""
    d = directory or COMPANIES_DIR
    companies = [load_company(p.stem, d) for p in sorted(d.glob("*.json"))]
    if segment:
        companies = [c for c in companies if c.segment == segment]
    return companies


def segment_counts(companies: Iterable[CampaignCompany]) -> dict[str, int]:
    counts = dict.fromkeys(SEGMENTS, 0)
    for c in companies:
        counts[c.segment] = counts.get(c.segment, 0) + 1
    return counts
