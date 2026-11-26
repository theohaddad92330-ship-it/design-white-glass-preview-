"""Golden-set evaluator for the Phase-1 research output (#275 / #274).

The deck defines a richer dossier than the pipeline currently produces. Every
prompt change that chases that richness (zones, what-to-sell, source tags…)
carries a regression risk, so #275 makes a golden-set eval **obligatory** before
merge. This module is the deterministic core of that harness: given a research
``output`` dict and a golden ``expectations`` dict, it runs a list of named
checks and returns a structured report. Pure — no I/O, no API — so it unit-tests
in CI without keys. The semantic (LLM-judge) layer lives in ``judge.py`` and the
runner in ``run_eval.py``.

A "check" is ``{name, group, passed, detail}``. Groups let a caller assert on a
subset (e.g. only the already-shipped ``entities`` / ``zones`` checks) while the
not-yet-implemented ``what_to_sell`` checks are expected to be red — that red is
what drives the next increment.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field


@dataclass
class Check:
    name: str
    group: str
    passed: bool
    detail: str = ""


@dataclass
class Report:
    company: str
    checks: list[Check] = field(default_factory=list)

    def add(self, name: str, group: str, passed: bool, detail: str = "") -> None:
        self.checks.append(Check(name=name, group=group, passed=passed, detail=detail))

    def groups(self) -> set[str]:
        return {c.group for c in self.checks}

    def in_group(self, group: str) -> list[Check]:
        return [c for c in self.checks if c.group == group]

    def passed(self, *, only: Sequence[str] | None = None) -> bool:
        checks = self.checks if only is None else [c for c in self.checks if c.group in only]
        return all(c.passed for c in checks)

    def score(self, *, only: Sequence[str] | None = None) -> tuple[int, int]:
        checks = self.checks if only is None else [c for c in self.checks if c.group in only]
        return sum(1 for c in checks if c.passed), len(checks)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _entities(output: Mapping[str, object]) -> list[dict]:
    raw = output.get("entitiesExhaustive") or output.get("entities_exhaustive") or []
    return [e for e in raw if isinstance(e, Mapping)]  # type: ignore[list-item]


def _name(entity: Mapping[str, object]) -> str:
    return str(entity.get("name") or "")


def _lower_strings(value: object) -> list[str]:
    """Flatten a value (list or scalar) into lowercased strings."""
    if isinstance(value, str):
        return [value.lower()]
    if isinstance(value, Sequence):
        out: list[str] = []
        for v in value:
            out.extend(_lower_strings(v))
        return out
    return []


def _matches_any(name: str, needles: Sequence[str]) -> bool:
    low = name.lower()
    return any(str(n).lower() in low for n in needles)


def _find_entity(entities: Sequence[Mapping[str, object]], needles: Sequence[str]) -> dict | None:
    for e in entities:
        if _matches_any(_name(e), needles):
            return dict(e)
    return None


# ── Checks ────────────────────────────────────────────────────────────────────


def evaluate(output: Mapping[str, object], expectations: Mapping[str, object]) -> Report:
    """Run every golden check declared in ``expectations`` against ``output``."""
    company = str(expectations.get("company") or output.get("companyName") or "?")
    report = Report(company=company)
    expect = expectations.get("expect")
    expect = expect if isinstance(expect, Mapping) else {}
    entities = _entities(output)

    # ── entities group ──
    ent_spec = expect.get("entities")
    if isinstance(ent_spec, Mapping):
        min_count = int(ent_spec.get("min_count") or 0)
        if min_count:
            report.add(
                "entities.min_count",
                "entities",
                len(entities) >= min_count,
                f"{len(entities)} entities (need ≥ {min_count})",
            )
        for group in ent_spec.get("must_include_any") or []:
            names = list(group) if isinstance(group, Sequence) and not isinstance(group, str) else [group]
            found = _find_entity(entities, names) is not None
            report.add(
                f"entities.include[{names[0]}]",
                "entities",
                found,
                f"{'found' if found else 'missing'}: any of {names}",
            )

    if expect.get("it_entity_present"):
        has_it = any(e.get("isItEntity") is True for e in entities)
        report.add("entities.it_entity_present", "entities", has_it, "isItEntity flag on ≥1 entity")

    # ── zones group ──
    zones_spec = expect.get("zones")
    if isinstance(zones_spec, Mapping):
        by_zone: dict[str, int] = {}
        for e in entities:
            z = str(e.get("zone") or "")
            if z:
                by_zone[z] = by_zone.get(z, 0) + 1
        for zone_key, minimum in zones_spec.items():
            got = by_zone.get(str(zone_key), 0)
            report.add(
                f"zones.{zone_key}",
                "zones",
                got >= int(minimum),
                f"{got} entities in {zone_key} (need ≥ {minimum})",
            )

    # ── hypotheses group (signals → qualified hypotheses) ──
    hyp_spec = expect.get("hypotheses")
    if isinstance(hyp_spec, Mapping):
        hyps = output.get("qualifiedHypotheses") or output.get("qualified_hypotheses") or []
        hyps = [h for h in hyps if isinstance(h, Mapping)]
        min_count = int(hyp_spec.get("min_count") or 0)
        if min_count:
            report.add(
                "hypotheses.min_count", "hypotheses", len(hyps) >= min_count,
                f"{len(hyps)} hypotheses (need ≥ {min_count})",
            )
        wanted = hyp_spec.get("mention_any")
        if wanted:
            texts = " ".join(s for h in hyps for s in _lower_strings(h.get("hypothesis")))
            hit = any(str(w).lower() in texts for w in wanted)
            report.add(
                "hypotheses.mention", "hypotheses", hit,
                f"{'ok' if hit else 'none of'} {list(wanted)}",
            )

    # ── what_to_sell group (the #275 increment this harness drives) ──
    wts = expect.get("what_to_sell")
    if isinstance(wts, Mapping):
        if wts.get("per_entity_required"):
            # Every priority entity (P1/P2) must carry a non-empty whatToSell.
            priority = [e for e in entities if str(e.get("priorityTier") or "") in ("P1", "P2")]
            missing = [_name(e) for e in priority if not _lower_strings(e.get("whatToSell"))]
            report.add(
                "what_to_sell.per_entity",
                "what_to_sell",
                not missing,
                "all P1/P2 entities have whatToSell" if not missing else f"missing on: {missing}",
            )
        for spec in wts.get("entity_expectations") or []:
            if not isinstance(spec, Mapping):
                continue
            needles = list(spec.get("match") or [])
            label = needles[0] if needles else "?"
            entity = _find_entity(entities, needles)
            if entity is None:
                report.add(
                    f"what_to_sell.{label}", "what_to_sell", False, f"entity not found: {needles}",
                )
                continue
            haystack = set(_lower_strings(entity.get("stack")) + _lower_strings(entity.get("whatToSell")))
            for axis in ("stack_any", "angles_any"):
                wanted = spec.get(axis)
                if not wanted:
                    continue
                hit = any(any(w.lower() in h for h in haystack) for w in wanted)
                report.add(
                    f"what_to_sell.{label}.{axis}",
                    "what_to_sell",
                    hit,
                    f"{'ok' if hit else 'none of'} {list(wanted)} in {sorted(haystack)}",
                )

    return report
