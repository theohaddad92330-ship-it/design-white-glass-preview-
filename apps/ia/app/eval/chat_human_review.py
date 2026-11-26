"""#2443.4 (#2899) — LA MÉTHODE « HUMAIN MÉTIER » POUR UN CAS DU CORPUS CHAT.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#2443 demande TROIS méthodes pour juger un cas du corpus chat : DÉTERMINISTE
(déjà là — les assertions des sept suites `test_copilote_*_eval.py`), LLM
JUDGE (déjà là pour le banc dossier, `app/eval/bench/judge.py` — jamais seul
décideur), et HUMAIN MÉTIER (« Sales, recruteur, manager, ADV, dirigeant ») —
ABSENTE avant ce module.

Ce module est le GABARIT que remplit un relecteur métier pour UN cas, et le
contrôleur qui refuse une soumission incohérente — jamais un écran, jamais un
stockage : la soumission reste un DOCUMENT (JSON versionnable, relu au diff),
comme le corpus lui-même.

─────────────────────────────────────────────────────────────────────────────
QUI RELIT — DÉRIVÉ, JAMAIS UNE SECONDE TAXONOMIE DE RÔLES
─────────────────────────────────────────────────────────────────────────────
#2443 nomme cinq personas relecteurs (« Sales, recruteur, manager, ADV,
dirigeant »). Ce sont, à l'orthographe près, LES CINQ FAMILLES QUE
`app/access/rights_matrix.Famille` porte déjà (#1920) : Sales/ADV →
BUSINESS_MANAGER, recruteur → RECRUTEUR, manager → DIRECTEUR_AGENCE, dirigeant
→ DIRIGEANT. `NOUVEL_ARRIVANT` n'est pas un rôle relecteur (#1920.6 : ce n'est
pas un rôle, mais une ANCIENNETÉ) — il reste éligible en lecteur, jamais
recensé à part.

Un cas du corpus porte DÉJÀ qui il concerne (`Meta.personas`, #1948.13) : le
pool de relecteurs éligibles pour un cas EST `meta.personas`, jamais une
seconde liste de rôles qui pourrait diverger (GA-26).

Document du protocole : `agent_docs/methode-revue-humaine-metier.md`.

Un relecteur dont la famille n'est pas dans `meta.personas` du cas soumet
NON_CONCERNE — jamais un autre verdict sous une famille étrangère au cas ;
ce verdict précis est l'échappatoire correcte, jamais une erreur de
soumission (`validate_review` ne compare `reviewer_family`/`case_personas`
que lorsque le verdict n'est PAS `NON_CONCERNE`).

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche)
─────────────────────────────────────────────────────────────────────────────
Aucun stockage ni écran d'administration des revues : une soumission reste un
document versionné, relu au diff comme le corpus lui-même — construire un
pipeline qui les agrège en tableau de pilotage (#2443.11) ou les fait
regagner le corpus comme golden test (#2278.37) est un système séparé, non
construit ici.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from app.access.rights_matrix import Famille

_DATE_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")

#: Le seuil de longueur d'un commentaire — un verdict sans motif ne dit rien,
#: qu'il soit CONFORME ou NON_CONFORME (l'un comme l'autre engagent un futur
#: gate). Ni un plafond, ni une exigence de style : un plancher grossier.
_COMMENTAIRE_MIN_CHARS = 10


class HumanVerdict(StrEnum):
    """Le verdict d'un relecteur métier sur UN cas — jamais un score, jamais
    une probabilité (doctrine : aucune PROBABILITÉ ne s'affiche, y compris ici)."""

    CONFORME = "conforme — le comportement attendu du cas est respecté"
    NON_CONFORME = "non conforme — un hard failure ou une déviation métier"
    NON_CONCERNE = "non concerné — ce persona n'est pas visé par ce cas"


@dataclass(frozen=True)
class HumanReview:
    """LE GABARIT (#2443.4) : ce qu'un relecteur métier remplit pour UN cas du
    corpus chat (`tests/test_copilote_scenario_corpus.py::CORPUS`).

    Champs volontairement plats — un JSON versionnable, relu au diff comme le
    reste du corpus, jamais un écran ni une base à administrer."""

    case_identifiant: str
    reviewer_family: Famille
    verdict: HumanVerdict
    commentaire: str
    #: Date ISO (YYYY-MM-DD) — pas un horodatage : la revue humaine se date
    #: au jour, jamais à la seconde (ce n'est pas un événement journalisé).
    date_iso: str
    #: #2278.12 / .17 — le TOUR visé (1 = première réponse) d'une conversation
    #: multi-tour. ``None`` = la revue porte sur le cas entier (comportement
    #: d'avant, à l'octet près) : un défaut au tour 2 ne se noie plus dans un
    #: verdict global sur la conversation.
    tour: int | None = None


def validate_review(
    review: HumanReview,
    *,
    case_identifiant: str,
    case_personas: frozenset[Famille],
    case_tours: int = 1,
) -> tuple[str, ...]:
    """Les défauts d'une soumission — jamais un rejet silencieux côté
    appelant. `case_identifiant`/`case_personas` viennent du `Canonique` réel
    (`item.identifiant`, `item.meta.personas`) — passés en DONNÉES plutôt que
    l'objet lui-même : ce module reste sous `app/`, `Canonique` sous `tests/`,
    et l'un ne doit jamais importer l'autre (GA-26 — deux fichiers canoniques,
    jamais un troisième qui les mélange)."""
    problems: list[str] = []

    if review.case_identifiant != case_identifiant:
        problems.append(
            f"la soumission cite le cas « {review.case_identifiant} », pas « {case_identifiant} »"
        )

    if review.verdict != HumanVerdict.NON_CONCERNE and review.reviewer_family not in case_personas:
        problems.append(
            f"« {review.reviewer_family} » n'est pas un persona visé par ce cas "
            f"({sorted(case_personas)}) — un cas non concerné se soumet en NON_CONCERNE, "
            "pas sous un autre persona"
        )

    if review.verdict not in HumanVerdict:
        problems.append(f"verdict hors énumération : {review.verdict!r}")

    if review.tour is not None and not 1 <= review.tour <= max(case_tours, 1):
        problems.append(
            f"tour {review.tour!r} hors de la conversation (1 à {max(case_tours, 1)}) — "
            "une revue vise un tour qui existe, ou le cas entier (tour absent)"
        )

    if not review.commentaire or len(review.commentaire.strip()) < _COMMENTAIRE_MIN_CHARS:
        problems.append("commentaire absent ou trop court — un verdict sans motif ne dit rien")

    if not _DATE_ISO.match(review.date_iso or ""):
        problems.append(f"date_iso doit être au format AAAA-MM-JJ, reçu {review.date_iso!r}")

    return tuple(problems)


__all__ = ["HumanReview", "HumanVerdict", "validate_review"]
