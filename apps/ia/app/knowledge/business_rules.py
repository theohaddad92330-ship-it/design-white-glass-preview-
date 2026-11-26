"""Registre déclaratif des règles métier canoniques du Drive (roadmap §14 / §17
P1 : « les règles du Drive ne sont pas assez appliquées dans les prompts et
agents. DoD : chaque règle critique a un statut : spécifiée, codée, testée,
activée »).

Les règles métier (grilles de scoring /25, /20, /100, exclusions, fraîcheur…)
vivent aujourd'hui DISPERSÉES : dans les services déterministes
(``account_score``, ``perimeter_score``, ``score_axes``, ``signal_freshness``,
``entities``, ``source_quality``, ``group_relationship``), dans la config
knowledge (``app/config/knowledge_config.py``) et dans les prompts
(``bellum_facts``, ``bellum_strategy``, ``bellum_plan``). Aucun endroit ne dit
QUELLES règles existent, où elles s'appliquent et si elles sont réellement
testées / actives.

Ce module est ce registre. Il n'IMPLÉMENTE pas les règles (elles restent chez
leurs propriétaires) — il les RECENSE et les TRACE :

* un ``status`` sur l'échelle de maturité ``specified → coded → tested → active`` ;
* ``applied_in`` : où la règle est réellement appliquée (service / prompt / phase) ;
* ``test_ref`` : le(s) test(s) qui PROUVE(nt) qu'elle est appliquée.

Garde-fou anti-dérive (``tests/test_business_rules.py``) : une règle marquée
``tested`` ou ``active`` DOIT porter un ``test_ref`` qui existe réellement — on ne
peut pas « activer » une règle sans test associé. Une règle ``specified`` (évoquée
dans le Drive mais pas encore codée) ne réclame ni code ni test — elle rend le GAP
visible plutôt que de le taire.

Seul ce qui existe RÉELLEMENT dans le code / les prompts est recensé : aucune
règle métier n'est inventée. Une règle simplement évoquée (le Drive en parle,
pas le code) est marquée ``specified`` sans contenu fabriqué.

Comme le prompt registry (Théo p.15), le registre expose un *fingerprint*
déterministe stampé dans les métadonnées du run (``_api_metrics.business_rules``,
à côté de ``prompt_versions``) : un dossier est auditable seulement si l'on sait
QUELLES règles (et dans quelle version) l'ont produit.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from enum import StrEnum

REGISTRY_VERSION = "v1"


class RuleStatus(StrEnum):
    """Échelle de maturité d'une règle métier (DoD roadmap §14)."""

    SPECIFIED = "specified"  # écrite dans le Drive, pas encore codée
    CODED = "coded"  # implémentée, sans test de non-régression dédié
    TESTED = "tested"  # implémentée ET couverte par un test
    ACTIVE = "active"  # testée ET câblée dans un run live (chemin par défaut)


# Position sur l'échelle — une règle à un statut donné implique tous ceux d'en
# dessous (``active`` ⇒ testée ⇒ codée).
_ORDER: dict[RuleStatus, int] = {
    RuleStatus.SPECIFIED: 0,
    RuleStatus.CODED: 1,
    RuleStatus.TESTED: 2,
    RuleStatus.ACTIVE: 3,
}


def _at_least(status: RuleStatus, floor: RuleStatus) -> bool:
    return _ORDER[status] >= _ORDER[floor]


@dataclass(frozen=True)
class BusinessRule:
    """Une règle métier canonique recensée (pas implémentée ici)."""

    id: str
    """La clé de tableau. **Interne** : elle sert à retrouver la règle
    (``get_rule``), à la tracer dans l'empreinte d'un run et à la citer dans un
    test. Elle ne s'affiche JAMAIS — voir ``label``."""

    label: str
    """Le NOM de la règle, en français, tel qu'un commercial peut le lire.

    Il existe parce que l'identifiant a fui : le corpus citable du copilote
    (``app/services/method_knowledge.py``) titrait chaque fragment avec
    ``rule.id``, si bien que le panneau « sources » du chat affichait « Règle
    métier « contact_fit_score_100 » » et que le modèle recopiait la clé dans sa
    réponse. Une règle a un nom lisible ; son identifiant reste dedans. Gardé
    par ``tests/test_citable_titles_carry_no_internal_id.py``."""

    description: str
    source: str  # référence Drive (ex. "03_BUSINESS_RULES §1")
    status: RuleStatus
    applied_in: tuple[str, ...] = ()  # modules / prompts / phases qui l'appliquent
    test_ref: tuple[str, ...] = ()  # fonctions de test (tests/test_business_rules.py)

    @property
    def requires_test(self) -> bool:
        """Une règle ``tested``/``active`` doit porter un test qui la couvre."""
        return _at_least(self.status, RuleStatus.TESTED)

    @property
    def is_implemented(self) -> bool:
        """``coded`` et au-dessus = réellement dans le code (pas seulement le Drive)."""
        return _at_least(self.status, RuleStatus.CODED)

    def fingerprint(self) -> str:
        """Hash court (12 hex) de la déclaration — bouge dès qu'un champ change
        (statut, description, périmètre d'application, test). Trace la version de
        la règle par run, comme ``prompt_registry`` trace la version d'un prompt."""
        payload = "|".join(
            (
                self.id,
                # Le libellé entre dans l'empreinte parce qu'il entre dans le
                # CONTEXTE du modèle (titre du fragment citable) : le renommer
                # change ce que le copilote a lu, donc ce qui a façonné le run.
                self.label,
                self.description,
                self.source,
                self.status.value,
                ",".join(self.applied_in),
                ",".join(self.test_ref),
            )
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


# ── Le registre ──────────────────────────────────────────────────────────────
# Recense UNIQUEMENT ce qui existe réellement dans le code / les prompts (vérifié
# module par module). Les ``test_ref`` pointent vers des tests de
# ``tests/test_business_rules.py`` qui prouvent l'application effective de la règle.
BUSINESS_RULES: tuple[BusinessRule, ...] = (
    # ── Grilles de scoring canoniques (03_BUSINESS_RULES) ────────────────────
    BusinessRule(
        id="account_fit_score_25",
        label="Score de compte sur 25 points",
        description=(
            "Account Fit Score /25 : 5 axes × 5 pts (fit, timing, accessibilité, "
            "concurrence, capacité) ; verdict déterministe GO 20-25 / PRUDENT 14-19 "
            "/ STOP <14 / EXPLORER (potentiel mais données manquantes) recalculé "
            "depuis la somme des axes (pas le total inventé par le LLM)."
        ),
        source="Annexe Méthodologie Sales ESN p25 (fait foi au-dessus du Drive)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/account_score.py",
            "app/routers/phase4_plan.py",
            "app/prompts/bellum_plan.py",
        ),
        test_ref=("test_account_fit_score_25_bands",),
    ),
    BusinessRule(
        id="account_verdict_quality_cap",
        label="Plafond de verdict quand le dossier est jugé inexploitable",
        description=(
            "Gate qualité G6 : un dossier jugé inexploitable ne peut pas afficher "
            "un verdict confiant. hallucination → score /25 plafonné à 19 (au plus "
            "PRUDENT) ; trop_faible → plafonné à 13 + verdict EXPLORER (données "
            "manquantes, potentiel à confirmer) sinon STOP. Le cap ne fait que "
            "BAISSER un score, jamais le monter."
        ),
        source="Théo restitution §6/§7 (gate G6 — dégradation si incohérence)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/account_score.py",
            "app/routers/phase4_plan.py",
        ),
        test_ref=("test_quality_gate_caps_verdict",),
    ),
    BusinessRule(
        id="perimeter_fit_score_20",
        label="Score de périmètre sur 20 points",
        description=(
            "Perimeter Fit Score /20 : 5 axes × 4 pts par entité/périmètre ; "
            "tiers P1 ≥14 / P2 10-13 / secondaire <10 ; on ne pousse que les 2-4 "
            "périmètres les plus actionnables, jamais « le groupe »."
        ),
        source="03_BUSINESS_RULES §2 (Perimeter Fit Score — 20 points)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/perimeter_score.py",
            "app/routers/phase1_research.py",
        ),
        test_ref=("test_perimeter_fit_score_20_tiers",),
    ),
    BusinessRule(
        id="commercial_score_100",
        label="Score commercial sur 100 points",
        description=(
            "Score commercial /100 fidèle aux bandes du verdict (GO ≥70, PRUDENT "
            "50-69) : projection band-faithful du /25 (un simple score/25×100 "
            "dériverait — 19/25 PRUDENT donnerait 76, lu comme GO). Chaque facteur "
            "du score est relié à une preuve (signal/source/contact/profil/règle)."
        ),
        source="Théo P1 (Score commercial ET confiance) + 03_BUSINESS_RULES §1",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/score_axes.py",
            "app/routers/phase4_plan.py",
        ),
        test_ref=("test_commercial_score_100_band_faithful",),
    ),
    # ── Exclusions / garde-fous de qualification ─────────────────────────────
    BusinessRule(
        id="no_go_sectors",
        label="Secteurs déclarés no-go par l'ESN",
        description=(
            "Secteurs no-go déclarés par l'ESN : une entité dont le nom matche un "
            "mot-clé no-go déclaré est écartée des recommandations. Seuil de "
            "longueur + stopwords en config knowledge (override-able). Injecté "
            "aussi dans le prompt stratégie."
        ),
        source="Drive §7 (NO-GO) / §9 (secteurs no-go déclarés)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/config/knowledge_config.py",
            "app/services/entities.py",
            "app/prompts/bellum_strategy.py",
        ),
        test_ref=("test_no_go_excludes_declared_sector",),
    ),
    BusinessRule(
        id="forbidden_as_fact",
        label="Données interdites comme faits",
        description=(
            "Données interdites comme faits : budget/enveloppe exact, décideur "
            "final, fournisseur en place, date de fin de contrat, intention "
            "d'achat, effectifs IT précis… à formuler en HYPOTHÈSE à vérifier, "
            "jamais affirmées sans source citée."
        ),
        source="Drive §8 (DONNÉES INTERDITES comme faits)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/prompts/bellum_facts.py",
            "app/prompts/bellum_strategy.py",
        ),
        test_ref=("test_forbidden_as_fact_in_prompts",),
    ),
    BusinessRule(
        id="weak_source_exclusion",
        label="Exclusion des sources faibles",
        description=(
            "Sources faibles / reconstruites par l'IA (``ia_reconstruction``) "
            "écartées des recommandations : un play / un message ne doit pas "
            "s'appuyer dessus tant qu'une vraie source existe. Liste en config "
            "knowledge (override-able)."
        ),
        source="Théo #2 / F2 (éviter les sources faibles dans les recos)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/config/knowledge_config.py",
            "app/services/source_quality.py",
            "app/routers/phase4_plan.py",
        ),
        test_ref=("test_weak_source_excluded",),
    ),
    BusinessRule(
        id="signal_freshness_24m",
        label="Fraîcheur des signaux — 24 mois maximum",
        description=(
            "Fraîcheur des signaux : un signal commercial de plus de ~24 mois "
            "(730 j) est un ARCHIVE, pas un déclencheur à relancer. Un signal non "
            "daté reste ``undated`` (jamais supposé courant)."
        ),
        source="Théo restitution p.7/p.12 (signal 24 mois max, sinon archive)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/signal_freshness.py",
            "app/routers/phase1_research.py",
        ),
        test_ref=("test_signal_older_than_24m_is_archive",),
    ),
    BusinessRule(
        id="group_insider_detection",
        label="Détection d'une position d'insider dans le groupe",
        description=(
            "Détection insider groupe (logique Axians) : match du nom de l'ESN sur "
            "les entités de la cible ; un nom générique (data, cloud, group…) exige "
            "un match EXACT et un nom trop court ne matche pas — évite les faux "
            "positifs. Seuils en config knowledge (override-able)."
        ),
        source="Drive (relation de groupe / insider — cas Axians)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/config/knowledge_config.py",
            "app/services/group_relationship.py",
            "app/routers/phase4_plan.py",
        ),
        test_ref=("test_insider_detection_generic_needs_exact",),
    ),
    # ── Grille contact /100 (03_BUSINESS_RULES §3) — gap historique tranché + actif ─
    BusinessRule(
        id="contact_fit_score_100",
        label="Score de priorité d'un contact sur 100 points",
        description=(
            "Contact Priority Score /100 : 6 critères pondérés au point près — rôle "
            "décisionnel /30 · proximité du périmètre /20 · niveau hiérarchique /15 · "
            "accessibilité (source/canal) /15 · fit avec l'angle /10 · fraîcheur/"
            "activité /10. Déterministe (score = Σ des critères), band-faithful "
            "(haute ≥70 / moyenne 45-69 / faible <45), chaque critère relié à une "
            "preuve (rôle/périmètre/titre/source/angle). profileData influe le barème "
            "(§9 : ESN cyber → RSSI mieux scoré). Critère non-évaluable = 0 (jamais "
            "de bonus inventé). Miroir TS live : packages/contracts "
            "computeContactScoreBreakdown."
        ),
        source="03_BUSINESS_RULES §3 (Contact Priority Score — 100 points)",
        status=RuleStatus.ACTIVE,
        applied_in=(
            "app/services/contact_priority_score.py",
            "packages/contracts/src/schemas/classified-data.ts",
        ),
        test_ref=("test_contact_priority_score_100_grid",),
    ),
)


# ── Accès / requêtes ─────────────────────────────────────────────────────────
def all_rules() -> tuple[BusinessRule, ...]:
    return BUSINESS_RULES


def get_rule(rule_id: str) -> BusinessRule | None:
    return next((r for r in BUSINESS_RULES if r.id == rule_id), None)


def rules_at_status(status: RuleStatus) -> list[BusinessRule]:
    return [r for r in BUSINESS_RULES if r.status == status]


def rules_requiring_tests() -> list[BusinessRule]:
    """Les règles dont le statut impose un test (``tested`` / ``active``)."""
    return [r for r in BUSINESS_RULES if r.requires_test]


def active_rule_ids() -> list[str]:
    """Les règles réellement appliquées dans un run live (triées, déterministe)."""
    return sorted(r.id for r in BUSINESS_RULES if r.status == RuleStatus.ACTIVE)


def status_counts() -> dict[str, int]:
    """Nombre de règles par statut (tous les statuts présents, même à 0)."""
    counts = {s.value: 0 for s in RuleStatus}
    for r in BUSINESS_RULES:
        counts[r.status.value] += 1
    return counts


def business_rules_status() -> dict[str, object]:
    """Résumé lisible du registre : version, comptes par statut et ids par statut.

    C'est le « statut global lisible » du garde-fou anti-dérive — un coup d'œil
    dit combien de règles sont spécifiées / codées / testées / actives et
    lesquelles."""
    by_status: dict[str, list[str]] = {s.value: [] for s in RuleStatus}
    for r in BUSINESS_RULES:
        by_status[r.status.value].append(r.id)
    for ids in by_status.values():
        ids.sort()
    return {
        "version": REGISTRY_VERSION,
        "total": len(BUSINESS_RULES),
        "counts": status_counts(),
        "by_status": by_status,
    }


# ── Fingerprint / stamp par run (comme le prompt registry, Théo p.15) ────────
_HASH_LEN = 12


def business_rules_fingerprint() -> dict[str, str]:
    """Chaque règle → hash court de sa déclaration. Mirroir de
    ``prompt_registry_fingerprint`` : trace, par run, quelles règles (et dans
    quelle version) ont façonné le dossier. Déterministe."""
    return {r.id: r.fingerprint() for r in BUSINESS_RULES}


def business_rules_registry_version() -> str:
    """Un hash combiné unique sur tout le registre — bouge dès qu'une règle (ou
    son statut) change. Marqueur « le set de règles a-t-il dérivé ? » entre runs."""
    fingerprint = business_rules_fingerprint()
    combined = "\n".join(f"{rid}:{digest}" for rid, digest in sorted(fingerprint.items()))
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()[:_HASH_LEN]


def business_rules_run_stamp() -> dict[str, object]:
    """L'objet stampé dans ``_api_metrics.business_rules`` d'un run, à côté de
    ``prompt_versions``. Compact + lisible : la version du registre, les règles
    ACTIVES qui ont façonné ce run, le résumé par statut et le fingerprint par
    règle (provenance / détection de dérive). Additif et déterministe."""
    return {
        "version": business_rules_registry_version(),
        "active": active_rule_ids(),
        "counts": status_counts(),
        "fingerprint": business_rules_fingerprint(),
    }


# ── Auto-cohérence du registre (garde-fou, consommé par les tests) ───────────
def validate_registry() -> list[str]:
    """Retourne la liste des incohérences du registre (vide = OK). Garde-fou :

    * ids uniques et non vides ;
    * un ``label`` non vide, et DIFFÉRENT de l'id : sans lui, le corpus citable
      retomberait sur la clé de tableau et l'identifiant s'afficherait à l'écran
      (c'est exactement ce qui s'était produit) ;
    * une règle ``tested``/``active`` DOIT porter au moins un ``test_ref`` ;
    * une règle ``active`` DOIT déclarer où elle s'applique (``applied_in``) ;
    * une règle ``specified`` NE doit revendiquer ni code ni test (gap honnête).
    """
    problems: list[str] = []
    seen: set[str] = set()
    for r in BUSINESS_RULES:
        if not r.id:
            problems.append("règle sans id")
            continue
        if r.id in seen:
            problems.append(f"id dupliqué : {r.id}")
        seen.add(r.id)
        if not r.label.strip():
            problems.append(f"{r.id} n'a pas de libellé lisible")
        elif r.label.strip() == r.id:
            problems.append(f"{r.id} a pour libellé son propre identifiant")
        if r.requires_test and not r.test_ref:
            problems.append(f"{r.id} est '{r.status.value}' sans test_ref")
        if r.status == RuleStatus.ACTIVE and not r.applied_in:
            problems.append(f"{r.id} est 'active' sans applied_in")
        if r.status == RuleStatus.SPECIFIED and (r.applied_in or r.test_ref):
            problems.append(
                f"{r.id} est 'specified' mais revendique applied_in/test_ref"
            )
    return problems
