"""Le cœur du protocole, PUR (aucun réseau, aucun fournisseur) : cas de vérité, observation, jugement, coût, rapport.

Trois verdicts, jamais plus (doctrine « non mesuré n'est jamais 0 ») :

* ``juste``   — la source dit ce que la vérité dit ;
* ``faux``    — elle dit l'inverse (un « parti » à tort, un poste ancien donné en cours) ;
* ``inconnu`` — elle ne sait pas (pas de correspondance, pas de clé, panne). Un inconnu n'est PAS une erreur :
  il ne se confond ni avec un juste ni avec un faux, et un coût sans prix n'est jamais « 0 ».

Un jeu de vérité est SANS NOM (RGPD) : le fichier commité ne porte que des cas typés ; les identifiants qui
permettent d'interroger un fournisseur (``handle``) ne vivent que dans le fichier LOCAL, jamais commité.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.current_position import is_ongoing, same_employer

State = Literal["in_post", "left", "unknown"]
Verdict = Literal["juste", "faux", "inconnu"]
Category = Literal["faux_parti", "arrivee_recente", "parti_ancien"]

VERDICTS: tuple[Verdict, ...] = ("juste", "faux", "inconnu")
# Ce que la vérité affirme, par catégorie de cas cité en appel :
#  faux_parti      — un contact donné « parti » à tort : la personne est EN POSTE chez l'employeur de référence ;
#  arrivee_recente — une arrivée (~1 mois) chez l'employeur de référence : EN POSTE là, et pas ailleurs ;
#  parti_ancien    — parti en 2022, donné en poste par un fournisseur : la vérité est « parti ».
TRUTH_BY_CATEGORY: dict[Category, State] = {
    "faux_parti": "in_post",
    "arrivee_recente": "in_post",
    "parti_ancien": "left",
}


@dataclass(frozen=True)
class TruthCase:
    case_id: str
    category: Category
    employer_ref: str
    # Identifiants d'interrogation (id d'annuaire, URL de profil, prénom/nom) : LOCAL seulement, jamais commité.
    handle: dict[str, str] = field(default_factory=dict)

    @property
    def truth(self) -> State:
        return TRUTH_BY_CATEGORY[self.category]


@dataclass(frozen=True)
class Observation:
    """Ce qu'UNE source dit d'UN cas. ``units`` = crédits consommés (0 = tier gratuit), ``None`` = non mesuré."""

    state: State
    employer: str | None = None
    units: float | None = None
    note: str | None = None


UNKNOWN = Observation(state="unknown")


def observe_from_history(history: Iterable[dict[str, Any]] | None, employer_ref: str) -> State:
    """L'état lu d'un PARCOURS (entrées ``organization_name`` / ``end_date`` / ``current``).

    ``in_post`` : une expérience en cours chez l'employeur de référence. ``left`` : une expérience chez lui, close,
    et aucune en cours chez lui. Un parcours qui ne le mentionne pas ne prouve rien ⇒ ``unknown`` (jamais deviné).
    """
    entries = [e for e in (history or []) if isinstance(e, dict)]
    here = [
        e
        for e in entries
        if same_employer(str(e.get("organization_name") or e.get("organization") or ""), employer_ref)
    ]
    if not here:
        return "unknown"
    if any(is_ongoing(e) for e in here):
        return "in_post"
    return "left" if any(str(e.get("end_date") or "").strip() for e in here) else "unknown"


def observe_from_snapshot(employer_now: str | None, employer_ref: str) -> State:
    """L'état lu d'un INSTANTANÉ « employeur actuel » (sans parcours, sans date de fin).

    Vide ⇒ ``unknown``. Même employeur ⇒ ``in_post``. Autre employeur ⇒ ``left`` : c'est ce que la source AFFIRME ;
    si elle est périmée, c'est exactement la faute que la mesure veut compter.
    """
    if not (employer_now or "").strip():
        return "unknown"
    return "in_post" if same_employer(employer_now, employer_ref) else "left"


def judge(case: TruthCase, observation: Observation) -> Verdict:
    """Compare l'observation à la vérité du cas. Les deux seules façons d'être faux : l'inverse, ou le mauvais employeur."""
    if observation.state == "unknown":
        return "inconnu"
    if observation.state != case.truth:
        return "faux"
    # En poste : la source doit nommer le BON employeur quand elle en nomme un (arrivée récente donnée chez l'ancien).
    if case.truth == "in_post" and observation.employer and not same_employer(observation.employer, case.employer_ref):
        return "faux"
    return "juste"


@dataclass
class SourceReport:
    source: str
    # blocked : pas mesurée (clé absente, contrat de champ non vérifié). Une raison NOMMÉE, jamais un « 0 juste ».
    blocked: str | None = None
    counts: dict[Verdict, int] = field(default_factory=lambda: {v: 0 for v in VERDICTS})
    by_category: dict[str, dict[Verdict, int]] = field(default_factory=dict)
    units: float = 0.0
    units_measured: bool = True
    unit_price_usd: float | None = None

    def add(self, case: TruthCase, verdict: Verdict, observation: Observation) -> None:
        self.counts[verdict] += 1
        bucket = self.by_category.setdefault(case.category, {v: 0 for v in VERDICTS})
        bucket[verdict] += 1
        if observation.units is None:
            self.units_measured = False
        else:
            self.units += observation.units

    @property
    def total(self) -> int:
        return sum(self.counts.values())

    @property
    def cost_usd(self) -> float | None:
        """Coût total en dollars, ou ``None`` : prix inconnu OU unités non mesurées — jamais ``0`` par défaut."""
        if self.blocked or self.unit_price_usd is None or not self.units_measured:
            return None
        return self.units * self.unit_price_usd

    @property
    def cost_per_case_usd(self) -> float | None:
        cost = self.cost_usd
        return cost / self.total if cost is not None and self.total else None


def render_markdown(reports: list[SourceReport]) -> str:
    """Le tableau que Louis lit : source × justes / faux / inconnus × coût. Pas de nom de personne, pas d'identifiant."""

    def money(value: float | None) -> str:
        return "non chiffré" if value is None else f"{value:.4f} $"

    lines = [
        "| source | justes | faux | inconnus | cas | coût total | coût / cas |",
        "|---|---|---|---|---|---|---|",
    ]
    for report in reports:
        if report.blocked:
            lines.append(f"| {report.source} | — | — | — | — | BLOCKED : {report.blocked} | — |")
            continue
        c = report.counts
        lines.append(
            f"| {report.source} | {c['juste']} | {c['faux']} | {c['inconnu']} | {report.total} "
            f"| {money(report.cost_usd)} | {money(report.cost_per_case_usd)} |"
        )
    categories = sorted({cat for r in reports for cat in r.by_category})
    if categories:
        lines += ["", "Par catégorie de cas (justes / faux / inconnus) :", ""]
        lines.append("| source | " + " | ".join(categories) + " |")
        lines.append("|---|" + "---|" * len(categories))
        for report in reports:
            if report.blocked:
                continue
            cells = []
            for cat in categories:
                b = report.by_category.get(cat)
                cells.append("—" if b is None else f"{b['juste']} / {b['faux']} / {b['inconnu']}")
            lines.append(f"| {report.source} | " + " | ".join(cells) + " |")
    return "\n".join(lines)
