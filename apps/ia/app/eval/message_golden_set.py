"""Le golden set de messages (#2947, #2204.78 — critère de recette #5 de l'issue
source : « Golden set de messages SalesConnect »).

#2204.78 était bloqué depuis le lot initial du 24/09 : un corpus RÉEL de
messages SalesConnect n'existe pas dans ce dépôt, et la doctrine interdit d'en
inventer un (« jamais de donnée fictive » présentée comme un fait réel).
Tranché (lot R25, 08/10) : une fixture ANONYMISÉE de vingt cas plutôt qu'un
corpus réel absent — aucune entreprise, aucun contact, aucun signal réels,
chaque cas porte ``_synthetic: True``.

Même patron que ``message_objectives.py`` (#3695), scalé à vingt cas au lieu
d'un seul scénario décliné : PUR, DÉTERMINISTE, HERMÉTIQUE — aucun appel
modèle, aucune base. Il ne juge pas la PROSE rédigée par le modèle (ça
demande un rejeu, voir ``app.eval.bench``) ; il mesure ce que le moteur
construit RÉELLEMENT avant d'appeler le modèle, sur vingt combinaisons
objectif × persona × canal × relation, choisies pour couvrir large plutôt que
pour se répéter :

  - ``all_anchors_kept`` : chaque cas garde dans son prompt le nom du compte
    et le titre du contact — le dossier ne se perd jamais en changeant de cas ;
  - ``never_identical_for_fifty`` : #2204 CONTRÔLE QUALITÉ rejette un message
    « identique pour cinquante personnes » — sur vingt cas DÉLIBÉRÉMENT
    distincts (persona, objectif ou canal différents), aucune paire de prompts
    construits n'est strictement identique ;
  - ``declared_relation_caution_present`` : les cas qui déclarent une relation
    à risque (#2204.35, « consultant présenté »/« ex-prestataire ») portent
    bien la ligne de prudence correspondante — jamais silencieuse ;
  - ``every_persona_reaches_a_case`` : les sept personas de
    ``app.knowledge.persona.PERSONAS`` sont chacun couverts par au moins un
    cas — vingt cas qui ignoreraient un persona ne le « testeraient » pas.

Lancer : ``python -m app.eval.message_golden_set`` (code de sortie 1 si échec).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any

from app.knowledge.persona import PERSONAS, contact_persona
from app.prompts.bellum_outreach import build_user_prompt
from app.services.message_brief import derive_message_brief

# ─────────────────────────────────────────────────────────────────────────────
# LES VINGT CAS — anonymisés, `_synthetic: True`. Aucune entreprise, aucun
# contact, aucun signal réels : les noms sont des placeholders de test, le
# secteur et le signal sont génériques, jamais empruntés à un compte du dépôt.
# ─────────────────────────────────────────────────────────────────────────────
MESSAGE_GOLDEN_SET: tuple[dict[str, Any], ...] = (
    {
        "slug": "g01-decideur-ouverture-email-froid",
        "company": "Golden Corp 01",
        "contact": {"fullName": "Contact Golden 01", "title": "Directrice Générale"},
        "objective": "ouverture_compte",
        "channel": "email",
        "relationship_state": "froid",
        "signal": "Golden Corp 01 annonce un projet de refonte de son système d'information",
    },
    {
        "slug": "g02-gouvernance-valider-linkedin-froid",
        "company": "Golden Corp 02",
        "contact": {"fullName": "Contact Golden 02", "title": "Présidente du conseil d'administration"},
        "objective": "demande_information",
        "channel": "linkedin",
        "relationship_state": "froid",
        "signal": "Golden Corp 02 publie son rapport annuel de gouvernance des risques",
    },
    {
        "slug": "g03-direction-relance-email-connu",
        "company": "Golden Corp 03",
        "contact": {"fullName": "Contact Golden 03", "title": "Directrice Régionale"},
        "objective": "relance",
        "channel": "email",
        "relationship_state": "connu",
        "signal": "Golden Corp 03 ouvre une nouvelle agence régionale",
    },
    {
        "slug": "g04-manager-suivi-rdv-email-client-actif",
        "company": "Golden Corp 04",
        "contact": {"fullName": "Contact Golden 04", "title": "Manager d'équipe support"},
        "objective": "suivi_rendez_vous",
        "channel": "email",
        "relationship_state": "client_actif",
        "signal": "Golden Corp 04 a lancé un nouveau canal de support client",
    },
    {
        "slug": "g05-acheteur-renouvellement-email-client-actif",
        "company": "Golden Corp 05",
        "contact": {"fullName": "Contact Golden 05", "title": "Responsable des Achats"},
        "objective": "renouvellement",
        "channel": "email",
        "relationship_state": "client_actif",
        "signal": "Golden Corp 05 renégocie ses contrats fournisseurs ce trimestre",
    },
    {
        "slug": "g06-expert-positionnement-linkedin-froid",
        "company": "Golden Corp 06",
        "contact": {"fullName": "Contact Golden 06", "title": "Architecte technique senior"},
        "objective": "positionnement_expertise",
        "channel": "linkedin",
        "relationship_state": "froid",
        "signal": "Golden Corp 06 migre son infrastructure vers le cloud",
    },
    {
        "slug": "g07-operationnel-demande-info-linkedin-froid",
        "company": "Golden Corp 07",
        "contact": {"fullName": "Contact Golden 07", "title": "Développeuse backend"},
        "objective": "demande_information",
        "channel": "linkedin",
        "relationship_state": "froid",
        "signal": "Golden Corp 07 recrute une équipe backend de dix personnes",
    },
    {
        "slug": "g08-decideur-partenariat-email-rang2",
        "company": "Golden Corp 08",
        "contact": {"fullName": "Contact Golden 08", "title": "Directeur Général"},
        "objective": "partenariat",
        "channel": "email",
        "relationship_state": "rang2",
        "signal": "Golden Corp 08 répond à un appel d'offres en groupement",
    },
    {
        "slug": "g09-direction-reprise-relation-email-ancien-client",
        "company": "Golden Corp 09",
        "contact": {"fullName": "Contact Golden 09", "title": "Directrice des Opérations"},
        "objective": "reprise_relation",
        "channel": "email",
        "relationship_state": "ancien_client",
        "signal": "Golden Corp 09 relance un programme de transformation interrompu l'an dernier",
    },
    {
        "slug": "g10-manager-nurturing-linkedin-dormant",
        "company": "Golden Corp 10",
        "contact": {"fullName": "Contact Golden 10", "title": "Chef de projet"},
        "objective": "nurturing",
        "channel": "linkedin",
        "relationship_state": "dormant",
        "signal": "Golden Corp 10 publie un retour d'expérience sur son dernier projet",
    },
    {
        "slug": "g11-acheteur-suivi-document-email-besoin-ouvert",
        "company": "Golden Corp 11",
        "contact": {"fullName": "Contact Golden 11", "title": "Responsable des Achats IT"},
        "objective": "suivi_document",
        "channel": "email",
        "relationship_state": "besoin_ouvert",
        "signal": "Golden Corp 11 a ouvert un besoin de prestation chiffré",
    },
    {
        "slug": "g12-expert-proposer-profil-email-besoin-ouvert",
        "company": "Golden Corp 12",
        "contact": {"fullName": "Contact Golden 12", "title": "Référente technique"},
        "objective": "proposer_profil",
        "channel": "email",
        "relationship_state": "besoin_ouvert",
        "signal": "Golden Corp 12 cherche un renfort technique sur un projet en cours",
    },
    {
        "slug": "g13-operationnel-ouverture-appel-froid",
        "company": "Golden Corp 13",
        "contact": {"fullName": "Contact Golden 13", "title": "Technicienne support"},
        "objective": "ouverture_compte",
        "channel": "call",
        "relationship_state": "froid",
        "signal": "Golden Corp 13 déploie un nouvel outil de ticketing",
    },
    {
        "slug": "g14-gouvernance-relance-email-connu",
        "company": "Golden Corp 14",
        "contact": {"fullName": "Contact Golden 14", "title": "Secrétaire générale"},
        "objective": "relance",
        "channel": "email",
        "relationship_state": "connu",
        "signal": "Golden Corp 14 publie sa feuille de route de conformité",
    },
    {
        "slug": "g15-direction-introduction-linkedin-refere",
        "company": "Golden Corp 15",
        "contact": {"fullName": "Contact Golden 15", "title": "Directrice Commerciale"},
        "objective": "introduction",
        "channel": "linkedin",
        "relationship_state": "refere",
        "signal": "Golden Corp 15 structure une nouvelle direction commerciale",
    },
    {
        "slug": "g16-manager-demande-info-email-linkedin-tiede",
        "company": "Golden Corp 16",
        "contact": {"fullName": "Contact Golden 16", "title": "Responsable d'équipe produit"},
        "objective": "demande_information",
        "channel": "email",
        "relationship_state": "linkedin",
        "signal": "Golden Corp 16 lance un nouveau produit interne",
    },
    {
        "slug": "g17-acheteur-ouverture-recommandation-froid",
        "company": "Golden Corp 17",
        "contact": {"fullName": "Contact Golden 17", "title": "Directeur des Achats"},
        "objective": "ouverture_compte",
        "channel": "recommendation",
        "relationship_state": "froid",
        "signal": "Golden Corp 17 revoit son panel de fournisseurs cette année",
        # #2204.35 — relation déclarée à risque : la caution doit atteindre ce cas.
        "declared_person_company_relation": "contractor_historical",
    },
    {
        "slug": "g18-expert-positionnement-appel-froid",
        "company": "Golden Corp 18",
        "contact": {"fullName": "Contact Golden 18", "title": "Experte sécurité"},
        "objective": "positionnement_expertise",
        "channel": "phone",
        "relationship_state": "froid",
        "signal": "Golden Corp 18 a subi un incident de sécurité rendu public",
        "declared_person_company_relation": "consultant_presented",
    },
    {
        "slug": "g19-operationnel-nurturing-email-dormant",
        "company": "Golden Corp 19",
        "contact": {"fullName": "Contact Golden 19", "title": "Ingénieure data"},
        "objective": "nurturing",
        "channel": "email",
        "relationship_state": "dormant",
        "signal": "Golden Corp 19 recrute sur un projet data de grande ampleur",
    },
    {
        "slug": "g20-decideur-valider-contexte-email-besoin-ouvert",
        "company": "Golden Corp 20",
        "contact": {"fullName": "Contact Golden 20", "title": "Directeur Général"},
        "objective": "demande_information",
        "channel": "email",
        "relationship_state": "besoin_ouvert",
        "signal": "Golden Corp 20 a ouvert un besoin stratégique sur son comité de direction",
        "declared_person_company_relation": "employee_former",
    },
)


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class GoldenSetReport:
    cases_read: int = 0
    checks: list[Check] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        # Zéro cas lu ⇒ rien n'a été mesuré ⇒ jamais vert — même garde que
        # `message_objectives.ObjectiveBenchReport`.
        return self.cases_read > 0 and all(check.passed for check in self.checks)


def build_case(case: dict[str, Any]) -> dict[str, Any]:
    """Le prompt réellement construit pour UN cas — même moteur que la production
    (`bellum_outreach.build_user_prompt`), aucune donnée inventée en plus du cas."""
    contact = {**case["contact"], "declared_person_company_relation": case.get("declared_person_company_relation")}
    brief = derive_message_brief(
        contact=contact,
        relationship_state=case["relationship_state"],
        angle="",
        parameters={"objective": case["objective"]},
    )
    prompt = build_user_prompt(
        contact=contact,
        raw_analysis={"companyName": case["company"]},
        profile={},
        recent_signals=[{"signal": case["signal"], "type": "projet", "date": "2026-09"}],
        channel=case["channel"],
        context="",
        company_name=case["company"],
        relationship_state=case["relationship_state"],
        brief=brief,
    )
    return {
        "slug": case["slug"],
        "company": case["company"],
        "contact_title": case["contact"]["title"],
        "persona": contact_persona(contact),
        "declared_person_company_relation": case.get("declared_person_company_relation"),
        "prompt": prompt,
    }


def check_all_anchors_kept(built: list[dict[str, Any]]) -> Check:
    lost = [
        (b["slug"], anchor)
        for b in built
        for anchor in (b["company"], b["contact_title"])
        if anchor not in b["prompt"]
    ]
    return Check("all_anchors_kept", not lost, f"ancrage perdu : {lost}" if lost else "")


def check_never_identical_for_fifty(built: list[dict[str, Any]]) -> Check:
    twins = [(a["slug"], b["slug"]) for a, b in combinations(built, 2) if a["prompt"] == b["prompt"]]
    return Check(
        "never_identical_for_fifty",
        not twins,
        f"prompts identiques entre deux cas distincts : {twins}" if twins else "",
    )


def check_declared_relation_caution_present(built: list[dict[str, Any]]) -> Check:
    missing = [
        b["slug"]
        for b in built
        if b["declared_person_company_relation"] and "RELATION PERSONNE" not in b["prompt"]
    ]
    return Check(
        "declared_relation_caution_present",
        not missing,
        f"relation déclarée sans ligne de prudence : {missing}" if missing else "",
    )


def check_every_persona_reaches_a_case(built: list[dict[str, Any]]) -> Check:
    covered = {b["persona"] for b in built if b["persona"]}
    missing = [p for p in PERSONAS if p not in covered]
    return Check("every_persona_reaches_a_case", not missing, f"persona jamais couvert : {missing}" if missing else "")


def run_golden_set(cases: tuple[dict[str, Any], ...] = MESSAGE_GOLDEN_SET) -> GoldenSetReport:
    built = [build_case(c) for c in cases]
    report = GoldenSetReport(cases_read=len(built))
    if built:
        report.checks = [
            check_all_anchors_kept(built),
            check_never_identical_for_fifty(built),
            check_declared_relation_caution_present(built),
            check_every_persona_reaches_a_case(built),
        ]
    return report


def main() -> int:
    report = run_golden_set()
    print(f"cas lus : {report.cases_read}")
    for check in report.checks:
        print(f"  {'OK ' if check.passed else 'NON'} {check.name} {check.detail}".rstrip())
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
