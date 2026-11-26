"""Rappel des rôles de tête — le banc voit CE compte-là (#4923.14).

Retour Julien Laszlo 30/10/2026 : sur L'Oréal, Decathlon et AXA, l'analyse ne
remontait ni Head of Data / CDO / Head of AI, ni Directeur Achats, ni DSI groupe.
Une moyenne de banc ne le voit pas : on mesure donc, par compte de référence, la
part des familles de tête ATTENDUES dont une tête a été trouvée.

Deux clés dans le bloc ``expect`` d'un golden :

  - ``headRoles`` — le PLANCHER : ce que le corpus committé donne. Une famille
    déclarée dont la tête disparaît fait échouer le banc (même logique que
    ``role_floor``, c77).
  - ``headRolesTarget`` — l'ATTENTE du retour : les familles de tête que le
    commercial veut voir. Le rappel est mesuré contre ``HEAD_RECALL_THRESHOLD``.

Le seuil est posé AVANT la première mesure : 2 familles de tête sur 3 (data,
achats, dsi). Il n'est PAS bloquant par défaut : les fixtures committées sont des
dossiers synthétiques enregistrés avant #4923, ils ne portent pas les têtes que la
nouvelle collecte remonte. Le passer en bloquant se fait avec le rattrapage
(#4923.15) qui rafraîchit les fixtures — jamais en baissant le seuil.

« Non évaluable » n'est jamais « 0 » (GA-18/GA-19) : un dossier sans contact sort
du dénominateur. Un rappel mesure ce qu'on a SU TROUVER, jamais ce que le marché
contient (GA-259). Aucun nom de fournisseur, aucun contenu de message.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.services.contact_themes import THEME_PRESETS, is_target_head

from .golden import Golden
from .metrics import _contacts_of as contacts_of

#: Le plancher (ce que le corpus donne) et l'attente (ce que le retour demande).
HEAD_FLOOR_KEY = "headRoles"
HEAD_TARGET_KEY = "headRolesTarget"

#: Fixé AVANT de mesurer : 2 familles de tête sur 3 (data, achats, dsi).
HEAD_RECALL_THRESHOLD = 2 / 3

#: Comptes nommés par le retour qui n'ont AUCUN jeu de référence committé. Les
#: nommer vaut mieux que les taire : ils ne sont pas mesurés, ils ne sont pas à 0.
NAMED_WITHOUT_REFERENCE: tuple[str, ...] = ("loreal",)


def _declared(golden: Golden, key: str) -> tuple[str, ...]:
    raw = (golden.expect or {}).get(key) or []
    if isinstance(raw, (str, bytes)) or not isinstance(raw, Sequence):
        return ()
    return tuple(str(r).strip() for r in raw if str(r).strip())


@dataclass(frozen=True)
class AccountHeadRecall:
    slug: str
    company: str
    floor: tuple[str, ...]
    target: tuple[str, ...]
    found: tuple[str, ...]
    missing: tuple[str, ...]
    lost: tuple[str, ...]
    unevaluable: tuple[str, ...]
    unknown: tuple[str, ...]
    contacts_read: int

    def recall(self) -> float | None:
        """Familles de tête trouvées / attendues, ``None`` quand rien n'était évaluable."""
        if not self.target or self.contacts_read == 0:
            return None
        return round(len(self.found) / len(self.target), 4)

    def below_threshold(self) -> bool:
        if not self.target or self.contacts_read == 0:
            return False
        # Rapport brut : la valeur affichée est arrondie, pas la comparaison au seuil.
        return len(self.found) / len(self.target) + 1e-9 < HEAD_RECALL_THRESHOLD


def account_head_recall(golden: Golden, analysis: Mapping[str, Any]) -> AccountHeadRecall:
    floor_all = _declared(golden, HEAD_FLOOR_KEY)
    target_all = _declared(golden, HEAD_TARGET_KEY)
    unknown = tuple(f for f in dict.fromkeys((*floor_all, *target_all)) if f not in THEME_PRESETS)
    floor = tuple(f for f in floor_all if f in THEME_PRESETS)
    target = tuple(f for f in target_all if f in THEME_PRESETS)

    contacts = contacts_of(analysis)
    if not contacts:
        return AccountHeadRecall(
            golden.slug, golden.company, floor, target, (), (), (),
            tuple(dict.fromkeys((*floor, *target))), unknown, 0,
        )
    titles = [str(c.get("title") or "") for c in contacts if isinstance(c, Mapping)]
    held = {f for f in THEME_PRESETS if any(is_target_head(t, [f]) for t in titles)}
    return AccountHeadRecall(
        golden.slug, golden.company, floor, target,
        found=tuple(f for f in target if f in held),
        missing=tuple(f for f in target if f not in held),
        lost=tuple(f for f in floor if f not in held),
        unevaluable=(),
        unknown=unknown,
        contacts_read=len(contacts),
    )


@dataclass(frozen=True)
class HeadRecallVerdict:
    accounts: tuple[AccountHeadRecall, ...]
    accounts_read: int
    heads_checked: int
    below_threshold: tuple[str, ...]
    problems: tuple[str, ...]

    def passed(self) -> bool:
        return not self.problems


def check_head_recall(
    pairs: Sequence[tuple[Golden, Mapping[str, Any]]],
    *,
    enforce_threshold: bool = False,
    require_corpus: bool = True,
) -> HeadRecallVerdict:
    accounts = tuple(account_head_recall(g, a) for g, a in pairs)
    heads_checked = sum(len(a.floor) + len(a.target) for a in accounts if a.contacts_read)
    below = tuple(a.slug for a in accounts if a.below_threshold())

    problems: list[str] = []
    for a in accounts:
        problems += [
            f"{a.company} : la tête de la famille « {f} » a disparu — plancher #4923.14 "
            f"déclaré dans golden/{a.slug}.json"
            for f in a.lost
        ]
        problems += [
            f"{a.slug} : famille inconnue « {f} » dans expect.{HEAD_FLOOR_KEY}/{HEAD_TARGET_KEY}"
            for f in a.unknown
        ]
        if enforce_threshold and a.slug in below:
            problems.append(
                f"{a.company} : rappel des têtes {a.recall():.2f} sous le seuil "
                f"{HEAD_RECALL_THRESHOLD:.2f} — manquent : {', '.join(a.missing)}"
            )
    if require_corpus and heads_checked == 0:
        problems.append(
            f"rappel des têtes : AUCUNE famille vérifiée ({len(accounts)} compte(s) chargé(s)) — "
            "« aucune tête perdue » serait vrai et le vert serait faux"
        )
    return HeadRecallVerdict(accounts, len(accounts), heads_checked, below, tuple(problems))


def format_head_recall(verdict: HeadRecallVerdict) -> list[str]:
    """Un rappel n'est jamais nu : ses familles trouvées et manquantes sont nommées."""
    lines = [
        f"\n── Rappel des têtes (#4923.14) ──  {verdict.accounts_read} compte(s) lu(s), "
        f"{verdict.heads_checked} famille(s) vérifiée(s), seuil {HEAD_RECALL_THRESHOLD:.2f}"
    ]
    for a in verdict.accounts:
        if not a.target:
            continue
        value = a.recall()
        head = "non mesuré" if value is None else f"{value:.2f}"
        lines.append(
            f"  {'·' if a.below_threshold() else '✓'} {a.slug:<18} {head:>10}  — "
            f"trouvées: {', '.join(a.found) or '—'} · manquent: {', '.join(a.missing) or '—'}"
        )
    for slug in NAMED_WITHOUT_REFERENCE:
        lines.append(f"  · {slug:<18} {'non mesuré':>10}  — aucun jeu de référence committé")
    return lines
