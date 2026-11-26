"""Banc de comparaison des objectifs de message — « l'objectif change-t-il vraiment le texte ? ».

#3695 (messages email/LinkedIn : l'objectif pilote le texte). Le critère :
*« Même contact : ouverture, expertise et relance ont des intentions distinctes. »*
La lecture du code ne le prouvait pas ; ce banc le MESURE sur ce que le moteur
construit réellement avant d'appeler le modèle — le prompt utilisateur complet
(``bellum_outreach.build_user_prompt``) pour un même contact, un même compte et
un même signal daté, en ne faisant varier QUE l'objectif.

Ce qu'il mesure (quatre propriétés, chacune avec son contre-exemple dans
``tests/test_eval_message_objectives.py``) :

  - ``distinct_framing`` : deux objectifs différents ne produisent jamais le même
    cadrage — « la même demande avec une date différente » est le défaut visé ;
  - ``anchors_kept`` : le compte, le rôle du contact et le signal DATÉ récent sont
    présents dans CHAQUE variante — changer d'objectif ne fait rien perdre au dossier ;
  - ``no_forced_meeting`` : aucun objectif d'ouverture, de savoir-faire, de
    relance, d'information ou d'orientation ne porte un appel à l'action « échange
    court » ; seuls ``renouvellement`` et ``proposer_profil`` le font, par nature ;
  - ``stale_never_recent`` : un signal ancien du dossier ne passe jamais sous le
    titre « SIGNAUX RÉCENTS ».

Ce qu'il NE mesure PAS, et le dit : la qualité du texte rédigé par le modèle. Il
ne lit que le cadrage envoyé, sans appel réseau ; juger la prose demande un
rejeu avec le modèle (``app.eval.bench``). Un « tout vert » ici veut dire « le
cadrage diffère et garde le dossier », jamais « le message est bon ».

Pur, déterministe, hermétique : aucun réseau, aucune base. Les personnes et
entreprises du scénario sont SYNTHÉTIQUES (``_synthetic``), jamais des
affirmations sur de vraies gens. Le verdict porte ce qu'il a réellement LU
(``variants_read``) et échoue à zéro : une sonde verte sur un jeu vide est la
panne que ce dépôt a déjà connue deux fois.

Lancer : ``python -m app.eval.message_objectives`` (code de sortie 1 si échec).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any

from app.prompts.bellum_outreach import build_user_prompt
from app.services.message_brief import MESSAGE_OBJECTIVES, derive_message_brief, message_brief_block

# Les trois intentions que l'issue exige de distinguer, plus quatre voisines.
DEFAULT_OBJECTIVES: tuple[str, ...] = (
    "ouverture_compte",
    "positionnement_expertise",
    "relance",
    "demande_information",
    "recommandation",
    "proposer_profil",
)
# Les seuls objectifs dont l'appel à l'action est un échange court PAR NATURE.
MEETING_BY_NATURE: frozenset[str] = frozenset({"renouvellement", "proposer_profil"})

# ⚠️ Les dates du scénario sont choisies pour ne pas vieillir avec l'horloge avant
# 2028 : un projet (fenêtre 545 jours) daté 2026-09 reste récent, un recrutement
# (180 jours) daté 2024-03 reste ancien.
SCENARIO: dict[str, Any] = {
    "_synthetic": True,
    "company": "Nova Logistique",
    "contact": {"fullName": "Claire Martin", "title": "Directrice des achats IT"},
    "fresh_signal": {
        "signal": "Appel d'offres infogérance publié par Nova Logistique",
        "type": "projet",
        "date": "2026-09",
    },
    "stale_signal": {
        "signal": "Recrutement de douze architectes cloud",
        "type": "recrutement",
        "date": "2024-03",
    },
}


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class ObjectiveBenchReport:
    variants_read: int = 0
    checks: list[Check] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        # Zéro variante lue ⇒ rien n'a été mesuré ⇒ jamais vert.
        return self.variants_read > 0 and all(check.passed for check in self.checks)


def build_variant(objective: str, scenario: dict[str, Any] = SCENARIO) -> dict[str, str]:
    """Le prompt complet et le bloc de cadrage pour UN objectif — même dossier, seul l'objectif varie."""
    contact = scenario["contact"]
    brief = derive_message_brief(
        contact=contact,
        relationship_state=None,
        angle="",
        parameters={"objective": objective},
    )
    prompt = build_user_prompt(
        contact=contact,
        raw_analysis={"companyName": scenario["company"]},
        profile={},
        recent_signals=[scenario["stale_signal"], scenario["fresh_signal"]],
        channel="email",
        context="",
        company_name=scenario["company"],
        brief=brief,
    )
    return {"objective": objective, "cta": brief["cta"], "framing": message_brief_block(brief), "prompt": prompt}


def check_distinct_framing(variants: list[dict[str, str]]) -> Check:
    twins = [(a["objective"], b["objective"]) for a, b in combinations(variants, 2) if a["framing"] == b["framing"]]
    return Check("distinct_framing", not twins, f"cadrages identiques : {twins}" if twins else "")


def check_anchors_kept(variants: list[dict[str, str]], scenario: dict[str, Any] = SCENARIO) -> Check:
    anchors = (scenario["company"], scenario["contact"]["title"], scenario["fresh_signal"]["signal"])
    lost = [(v["objective"], a) for v in variants for a in anchors if a not in v["prompt"]]
    return Check("anchors_kept", not lost, f"éléments perdus : {lost}" if lost else "")


def check_no_forced_meeting(variants: list[dict[str, str]]) -> Check:
    forced = [
        v["objective"] for v in variants if v["cta"] == "echange_court" and v["objective"] not in MEETING_BY_NATURE
    ]
    return Check("no_forced_meeting", not forced, f"rendez-vous imposé : {forced}" if forced else "")


def check_stale_never_recent(variants: list[dict[str, str]], scenario: dict[str, Any] = SCENARIO) -> Check:
    stale = scenario["stale_signal"]["signal"]
    leaked = []
    for v in variants:
        prompt = v["prompt"]
        recent_part = prompt.split("SIGNAUX ANCIENS")[0] if "SIGNAUX RÉCENTS" in prompt else ""
        if stale in recent_part:
            leaked.append(v["objective"])
    return Check("stale_never_recent", not leaked, f"signal ancien présenté comme récent : {leaked}" if leaked else "")


def run_bench(objectives: tuple[str, ...] = DEFAULT_OBJECTIVES) -> ObjectiveBenchReport:
    known = [o for o in objectives if o in MESSAGE_OBJECTIVES]
    variants = [build_variant(o) for o in known]
    report = ObjectiveBenchReport(variants_read=len(variants))
    if variants:
        report.checks = [
            check_distinct_framing(variants),
            check_anchors_kept(variants),
            check_no_forced_meeting(variants),
            check_stale_never_recent(variants),
        ]
    return report


def main() -> int:
    report = run_bench()
    print(f"variantes lues : {report.variants_read}")
    for check in report.checks:
        print(f"  {'OK ' if check.passed else 'NON'} {check.name} {check.detail}".rstrip())
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
