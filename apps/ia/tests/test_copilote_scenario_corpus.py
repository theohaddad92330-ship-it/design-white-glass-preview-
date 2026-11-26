"""LE CORPUS CANONIQUE DE LAURA — une VUE sur les cinq suites, et ses gardes (#1948, #1945).

─────────────────────────────────────────────────────────────────────────────
POURQUOI UNE VUE ET PAS UN FICHIER DE PLUS
─────────────────────────────────────────────────────────────────────────────
#1948 demandait « un corpus canonique unique ». La décision du 12/09/2026 :
enrichir les scénarios EXISTANTS de métadonnées, ne pas en écrire un sixième
jeu. Ce fichier assemble donc les cinq suites en une seule liste (`CORPUS`) au
schéma unique de `copilote_scenario_metadata.py`, et pose les gardes que
#1948 et #1945 appellent. ⚠️ Le golden « conversations » de `apps/website`
est celui de la Laura du SITE PUBLIC : il n'en fait pas partie.

─────────────────────────────────────────────────────────────────────────────
CE QUI N'EST PAS ICI, ET POURQUOI (écartés au registre)
─────────────────────────────────────────────────────────────────────────────
* 1948.1 → .5 — les « 604 réponses », « 100 sujets P1 », « 50 P2 », « 60
  requêtes », « 25 triggers » vivent dans deux PDF du 03/08 qui ne sont PAS
  dans le dépôt (seuls leurs chiffres sont cités dans
  `agent_docs/meta-analyse-besoins-2026-08-03.md`). Rien à reprendre verbatim.
* 1948.28 — priorité et fréquence terrain : même raison, le champ vaut `None`
  partout, et `test_unknown_fields_are_said` le dit.
* 1948.44 — le routage d'intention : le routeur d'intentions en code est
  REPORTÉ (`agent_docs/chantiers-livres.md:280`).
* 1948.50 et #1946 — l'analyse des requêtes non comprises est de l'analytique
  produit : la relecture juridique de `c64_analytique_produit` est en attente.
* Ce qui ne se prouve qu'en appelant le modèle : `EVAL_EN_LIGNE`, plus bas.

─────────────────────────────────────────────────────────────────────────────
LE CLIQUET QUI PROTÈGE LA DÉCISION (§11 et §12)
─────────────────────────────────────────────────────────────────────────────
#1948 est un DÉBLOQUEUR : cinq autres groupes attendent ce corpus. « Une VUE
et pas un fichier de plus » n'était encore qu'une intention écrite dans un
docstring — donc réversible par quiconque ne l'aurait pas lue. §11 pose GA-26
sur le vocabulaire (le schéma est défini dans DEUX fichiers canoniques depuis
#2445.4 — celui-ci pour le schéma de scénario, `app/access/rights_matrix.py`
pour la classification rôle/permission qu'un code de production doit aussi
pouvoir lire — les 850 autres modules Python du service IMPORTENT, jamais ne
redéfinissent) et §12 compte les dix-sept champs de l'énoncé, pour qu'un champ
retiré tombe au lieu de disparaître.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any, NamedTuple

from app.eval.chat_hard_failures import ChatHardFailure
from app.prompts import bellum_advisor
from app.prompts.bellum_advisor import build_system_prompt
from app.services import chat_tools
from tests import test_copilote_ask_before_answering_eval as ask
from tests import test_copilote_five_accounts_eval as five
from tests import test_copilote_market_memory_eval as market
from tests import test_copilote_scope_eval as scope
from tests import test_copilote_security_eval as security
from tests import test_copilote_truth_levels_eval as truth
from tests import test_copilote_unknown_request_eval as unknown
from tests.copilote_scenario_metadata import (
    ACTION_CREDITEE_PAR_OUTIL,
    ACTION_DU_TOUR,
    ANCIENNETE_DU_NOUVEL_ARRIVANT,
    FAMILLE_PAR_ROLE,
    POINTS_ECARTES_1945,
    TOTAL_POINTS_1945,
    Action,
    Canonique,
    Categorie,
    Famille,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Permission,
    Provenance,
    Recette1945,
    Source,
    cout_de,
    grille_de_credits,
    hard_failures_de,
    normalise_route,
    options_du_questionnaire,
    outils_interdits_de,
    poids_de,
    registre,
    routes_web,
)
from tests.test_copilote_prompt_blocks import FORBIDDEN_VENDORS
from tests.test_copilote_security_eval import SPENDING_TOOLS

_IA_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[3]

PROMPT = build_system_prompt({}, {}, "", "")


# ── 0. LA VUE — les cinq suites, au schéma unique ────────────────────────────


def _corpus() -> tuple[Canonique, ...]:
    """#1948.11 — le corpus canonique, BÂTI depuis les suites, jamais recopié."""
    items: list[Canonique] = []
    for tool_scenario in scope.TOOL_SCENARIOS:
        items.append(
            Canonique(
                f"scope/{tool_scenario.name}",
                scope.__name__,
                tool_scenario.question,
                tool_scenario.tool,
                tool_scenario.fragments,
                tool_scenario.meta,
                "test_the_tool_that_answers_the_question_carries_the_rule",
            )
        )
    for prompt_scenario in scope.PROMPT_SCENARIOS:
        items.append(
            Canonique(
                f"scope/{prompt_scenario.name}",
                scope.__name__,
                prompt_scenario.question,
                None,
                prompt_scenario.fragments,
                prompt_scenario.meta,
                "test_the_prompt_carries_the_rule_for_the_question",
            )
        )
    for attack in security.SCENARIOS:
        items.append(
            Canonique(
                f"securite/{attack.name}",
                security.__name__,
                attack.attack,
                None,
                attack.required,
                attack.meta,
                "test_prompt_covers_the_attack",
            )
        )
    for ask_scenario in ask.SCENARIOS:
        items.append(
            Canonique(
                f"demander-avant/{ask_scenario.name}",
                ask.__name__,
                ask_scenario.ask,
                None,
                ask_scenario.fragments,
                ask_scenario.meta,
                "test_the_prompt_carries_the_scenario",
            )
        )
    for level in truth.LEVELS:
        items.append(
            Canonique(
                f"niveaux-de-verite/{level.name}",
                truth.__name__,
                level.question,
                None,
                level.fragments,
                level.meta,
                "test_the_prompt_carries_the_level",
            )
        )
    # #1949 — la sixième suite : les onze natures du repli universel. Elles
    # entrent par le même `Canonique` que les autres, sans quoi les gardes de ce
    # fichier (schéma, page propriétaire, formulation jamais mise en bouton)
    # seraient AVEUGLES à onze scénarios de plus.
    for nature in unknown.NATURES:
        items.append(
            Canonique(
                f"repli/{nature.name}",
                unknown.__name__,
                nature.demande,
                None,
                (nature.entree, nature.ancre),
                nature.meta,
                "test_the_prompt_classifies_the_request",
            )
        )
    for market_scenario in market.MARKET_MEMORY_SCENARIOS:
        items.append(
            Canonique(
                f"memoire-marche/{market_scenario.name}",
                market.__name__,
                market_scenario.question,
                market_scenario.tool,
                market_scenario.fragments,
                market_scenario.meta,
                "test_each_scenario_documents_a_real_written_rule",
            )
        )
    # #3222.2 (#3197) — la septième suite : les cinq groupes de comptes. Même
    # raison que la sixième : sans l'entrée ici, les gardes de ce fichier
    # seraient AVEUGLES à douze scénarios de plus.
    for account_scenario in five.FIVE_ACCOUNTS_SCENARIOS:
        items.append(
            Canonique(
                f"cinq-groupes/{account_scenario.name}",
                five.__name__,
                account_scenario.question,
                account_scenario.tool,
                account_scenario.fragments,
                account_scenario.meta,
                "test_each_scenario_documents_a_real_written_rule",
            )
        )
    return tuple(items)


CORPUS: tuple[Canonique, ...] = _corpus()


def test_the_corpus_reads_the_seven_suites() -> None:
    """Preuve n°2 — une garde qui ne lit rien est verte pour toujours."""
    suites = {item.suite for item in CORPUS}
    assert suites == {
        scope.__name__,
        security.__name__,
        ask.__name__,
        truth.__name__,
        market.__name__,
        unknown.__name__,
        five.__name__,
    }
    assert len(CORPUS) >= 100, f"le corpus a fondu : {len(CORPUS)} scénarios"
    for suite in suites:
        assert sum(item.suite == suite for item in CORPUS) >= 3, f"{suite} ne verse presque rien"

    identifiants = [item.identifiant for item in CORPUS]
    assert len(identifiants) == len(set(identifiants)), "deux scénarios portent le même identifiant (#1948.12)"

    # #1948.27 — l'assertion nommée EXISTE dans sa suite : un nom de test périmé
    # ferait croire qu'un scénario est vérifié par un test qui n'est plus là.
    for item in CORPUS:
        assert callable(getattr(sys.modules[item.suite], item.assertion, None)), (
            f"{item.identifiant} : l'assertion « {item.assertion} » n'existe pas dans {item.suite}"
        )


# ── 1. LE SCHÉMA — chaque scénario le porte, un inconnu se dit ───────────────


def _schema_problems(item: Canonique) -> list[str]:
    meta = item.meta
    if not isinstance(meta, Meta):
        return ["pas de métadonnées"]
    problems: list[str] = []
    if not isinstance(meta.moment, Moment):
        problems.append("moment hors énumération (#1948.14)")
    if not isinstance(meta.intention, Categorie):
        problems.append("intention hors énumération (#1948.16)")
    if not all(isinstance(value, Categorie) for value in meta.secondaires) or meta.intention in meta.secondaires:
        problems.append("intentions secondaires invalides ou redondantes (#1948.17)")
    if meta.objets is not None and (not meta.objets or not all(isinstance(value, Objet) for value in meta.objets)):
        problems.append("objets vides ou hors énumération — un inconnu vaut None (#1948.18)")
    if meta.page is not None and not (isinstance(meta.page, str) and meta.page.startswith("/")):
        problems.append("page propriétaire mal formée (#1948.23)")
    if not all(isinstance(value, JamaisInventer) for value in meta.jamais_inventer):
        problems.append("« jamais inventer » hors énumération (#1948.25)")
    if not isinstance(meta.action, Action):
        problems.append("action hors énumération (#1948.26)")
    if not isinstance(meta.nature, Nature):
        problems.append("nature hors énumération (#1948.52)")
    if not meta.personas or not all(isinstance(value, Famille) for value in meta.personas):
        problems.append("persona vide ou hors des cinq familles (#1948.13)")
    if len(set(meta.situations)) != len(meta.situations) or not all(
        isinstance(value, Recette1945) for value in meta.situations
    ):
        problems.append("situations #1945 en double ou hors énumération")
    return problems


def test_every_scenario_carries_the_schema() -> None:
    problems = {item.identifiant: found for item in CORPUS if (found := _schema_problems(item))}
    assert not problems, f"Scénarios au schéma incomplet : {problems}"


def test_the_schema_guard_knows_how_to_say_no() -> None:
    """Preuve n°1 — un scénario dont l'intention est une CHAÎNE libre, pas une catégorie."""
    good = CORPUS[0]
    broken = good._replace(meta=good.meta._replace(intention="Analyser", objets=()))
    assert _schema_problems(good) == []
    assert len(_schema_problems(broken)) == 2


#: #1948.18 — les scénarios dont on ne sait pas nommer les objets, et pourquoi.
OBJETS_INCONNUS: dict[str, str] = {
    "scope/une-demande-hors-perimetre": (
        "« Quel temps fera-t-il à Lyon demain ? » ne porte AUCUN objet de Bellum — c'est ce qui la rend "
        "hors périmètre. En nommer un inventerait un lien que la question n'a pas (#1949.23)"
    ),
    "scope/ou-intervenir": (
        "la file d'interventions mêle comptes, missions et consultants selon le motif calculé, et la "
        "description de `get_interventions` ne nomme aucun objet — les écrire serait une supposition"
    ),
    "scope/ne-pas-proposer-de-reponse-sans-question": (
        "« Merci, c'est clair. » ne porte AUCUN objet de Bellum — et c'est justement pourquoi il n'y "
        "a aucune précision à poser, donc aucune réponse à proposer. En nommer un inventerait un "
        "lien que la phrase n'a pas (#2679)"
    ),
    "scope/ne-pas-noter-sans-rien-de-neuf": (
        "« Merci, à plus tard. » ne porte AUCUN objet de Bellum — c'est justement ce qui fait qu'il n'y "
        "a rien de neuf à noter. En nommer un inventerait un lien que la phrase n'a pas (#2268)"
    ),
}


def test_unknown_fields_are_said() -> None:
    """Un champ inconnu vaut `None` et SE DIT — ni zéro, ni valeur de remplissage.

    Chaque `None` du corpus est ANNONCÉ : un `None` qui apparaît ailleurs fait
    tomber la garde, et un `None` annoncé qui a été rempli aussi (l'annonce doit
    alors partir — une liste d'inconnus périmée ment dans l'autre sens).
    """
    tous = {item.identifiant for item in CORPUS}
    conduite = {item.identifiant for item in CORPUS if item.outil is None}

    # #1948.28 — inconnu PARTOUT : les sources de priorité ne sont pas dans le dépôt.
    assert {item.identifiant for item in CORPUS if item.meta.priorite_terrain is None} == tous, (
        "une priorité terrain a été renseignée : dis d'où elle vient, puis retire cette assertion"
    )
    # #1948.19 — inconnu pour une règle de conduite, CONNU (connecteurs + champs
    # du schéma) pour une question outillée.
    assert {item.identifiant for item in CORPUS if item.donnees_necessaires is None} == conduite
    # #1948.18 — les objets inconnus sont nommés.
    assert {item.identifiant for item in CORPUS if item.meta.objets is None} == set(OBJETS_INCONNUS)
    # #1948.23 — les pages inconnues sont au cliquet de la page propriétaire.
    assert {item.identifiant for item in CORPUS if item.meta.page is None} == set(SANS_PAGE_PROPRIETAIRE)


# ── 2. #1948.13 / #1920 — LES CINQ FAMILLES, LUES DANS LE QUESTIONNAIRE ──────


def test_every_questionnaire_role_has_a_family() -> None:
    roles = options_du_questionnaire("user_role")
    assert len(roles) >= 5, f"le questionnaire est illisible : {roles}"
    assert set(roles) == set(FAMILLE_PAR_ROLE), (
        f"les rôles du questionnaire ({sorted(roles)}) ne sont plus ceux du mapping "
        f"({sorted(FAMILLE_PAR_ROLE)}) : un rôle sans famille parle à Laura sans persona."
    )
    assert ANCIENNETE_DU_NOUVEL_ARRIVANT in options_du_questionnaire("role_tenure")
    # Les cinq familles sont atteignables : quatre par le rôle, une par l'ancienneté.
    assert set(FAMILLE_PAR_ROLE.values()) | {Famille.NOUVEL_ARRIVANT} == set(Famille)


def test_the_role_guard_knows_how_to_say_no_and_spares_the_neighbour_list() -> None:
    """Un onzième rôle ajouté côté contrats doit être VU ; la liste voisine
    (`role_tenure`) ne doit pas être prise pour des rôles."""
    fabricated = (
        "  user_role: [\n    'Fondateur / CEO',\n    \"Consultant / Ingénieur d'affaires\",\n"
        "    'Directeur d’agence',\n  ],\n  role_tenure: ['Moins de 3 mois', '3-6 mois'],\n"
    )
    roles = options_du_questionnaire("user_role", fabricated)
    assert roles == ("Fondateur / CEO", "Consultant / Ingénieur d'affaires", "Directeur d’agence")
    assert "Directeur d’agence" not in FAMILLE_PAR_ROLE
    assert "Moins de 3 mois" not in roles


# ── 3. #1948.21 / #1948.22 — PERMISSION ET COÛT, DÉRIVÉS ─────────────────────


def test_the_credit_grid_is_read_not_copied() -> None:
    grid = grille_de_credits()
    assert len(grid) >= 8, f"la grille `CREDIT_WEIGHTS` est illisible : {grid}"
    assert ACTION_DU_TOUR in grid
    assert set(ACTION_CREDITEE_PAR_OUTIL) <= set(registre()), "une action créditée désigne un outil inexistant"
    assert set(ACTION_CREDITEE_PAR_OUTIL.values()) <= set(grid), "une action créditée n'existe pas dans la grille"
    for item in CORPUS:
        action, credits = item.cout
        assert grid[action] == credits


def _credit_counts(text: str) -> list[int]:
    """Les NOMBRES de crédits qu'un texte adressé au modèle affirme."""
    words = {"un": 1, "une": 1, "aucun": 0}
    return [
        int(raw) if raw.isdigit() else words[raw.lower()]
        for raw in re.findall(r"\b(\d+|un|une|aucun)\s+crédits?\b", text, flags=re.IGNORECASE)
    ]


#: Cliquet — les descriptions dont le nombre de crédits CONTREDIT la grille. Il
#: ne peut que rétrécir.
#:
#: VIDÉ le 13/09/2026 : `start_account_analysis` disait « Débite un crédit »
#: alors que la grille pondère `account_analysis` et que la préparation annonce
#: ce poids (`resolveAnalysisCost()`, copilot-bridge.controller.ts:376) — le
#: modèle lisait deux prix différents dans le même tour. La description renvoie
#: désormais au coût annoncé par la préparation, sans chiffre.
COUT_DIVERGENT_CONNU: dict[str, str] = {}


def _credit_mismatches(descriptions: dict[str, str]) -> dict[str, tuple[list[int], int]]:
    found: dict[str, tuple[list[int], int]] = {}
    for name, text in descriptions.items():
        counts = _credit_counts(text)
        expected = cout_de(name)[1]
        if counts and any(count != expected for count in counts):
            found[name] = (counts, expected)
    return found


def test_a_credit_count_written_for_the_model_matches_the_grid() -> None:
    """1945.43 (le coût exact) du côté que le web ne voit pas : ce que la
    DESCRIPTION dit au modèle. Le nombre attendu vient de la grille."""
    descriptions = {name: str(tool.get("description", "")) for name, tool in registre().items()}
    # #4464 — crédits implicites : plus aucune description ne dit un nombre de crédits au modèle.
    assert not any(_credit_counts(text) for text in descriptions.values())
    mismatches = _credit_mismatches(descriptions)
    assert set(mismatches) == set(COUT_DIVERGENT_CONNU), (
        f"Descriptions au coût divergent de la grille : {mismatches}. Une nouvelle divergence se "
        "corrige dans la description ; une divergence corrigée sort de COUT_DIVERGENT_CONNU."
    )


def _hardcoded_weights(descriptions: dict[str, str]) -> dict[str, list[int]]:
    """Les POIDS écrits en dur : un nombre de crédits NON NUL dans une description."""
    return {
        name: weights
        for name, text in descriptions.items()
        if (weights := [count for count in _credit_counts(text) if count > 0])
    }


def test_no_description_hardcodes_a_credit_weight() -> None:
    """1945.43, la famille du défaut « Débite un crédit » (#1948, 13/09/2026).

    Un poids non nul écrit dans une description est juste le jour où on l'écrit
    et faux le jour où la grille bouge : la grille vit dans `CREDIT_WEIGHTS`
    (packages/contracts), et le COÛT EXACT arrive au modèle par l'outil — la
    préparation d'analyse rend `costCredits`, la proposition d'enrichissement
    porte `cost_credits`. Une description y RENVOIE, elle ne le recopie pas.

    Un ZÉRO reste permis, et la garde voisine le confronte à la grille : « 0
    crédit » est vrai d'une action incluse comme d'une action déterministe, et
    le dire est un argument (`credit-weights.ts`, « L'écran a le droit de le DIRE »).
    """
    descriptions = {name: str(tool.get("description", "")) for name, tool in registre().items()}
    # Elle LIT les deux descriptions de la famille, pas un registre vide.
    assert "débit" in descriptions["start_account_analysis"] and "enrichissement" in descriptions["enrich_contact"]
    assert _hardcoded_weights(descriptions) == {}, (
        "Une description écrit un poids de crédits en dur : renvoie au coût que l'outil annonce "
        "(la préparation, la proposition), jamais à un chiffre qui divergera de la grille."
    )


def test_the_credit_guard_knows_how_to_say_no_and_spares_the_neighbours() -> None:
    fabricated = {"enrich_contact": "L'enrichissement coûte 3 crédits s'il aboutit."}
    assert _credit_mismatches(fabricated) == {"enrich_contact": ([3], cout_de("enrich_contact")[1])}
    # LE défaut réel, rejoué : les DEUX gardes tombent sur « Débite un crédit ».
    regression = {"start_account_analysis": "Débite un crédit et occupe le moteur plusieurs minutes."}
    assert _credit_mismatches(regression) == {"start_account_analysis": ([1], cout_de("start_account_analysis")[1])}
    assert _hardcoded_weights(regression) == {"start_account_analysis": [1]}
    # Les voisins légitimes : un coût NOMMÉ sans nombre, l'écran de facturation, un zéro.
    for neighbour in ("le coût en crédits, le solde restant", "`/billing` — L'abonnement, les crédits"):
        assert _credit_counts(neighbour) == []
    assert _hardcoded_weights({"run_matching": "Ne coûte AUCUN crédit."}) == {}


def test_the_permission_is_derived_and_agrees_with_the_proposed_action() -> None:
    """#1948.21 — la permission se lit dans la classification de la suite de
    sécurité ; l'action proposée écrite à la main ne doit pas la contredire."""
    declared = set(registre())
    assert declared >= security.READ_ONLY_TOOLS and declared >= security.SPENDING_TOOLS
    assert not security.READ_ONLY_TOOLS & security.SPENDING_TOOLS

    disagreements: list[str] = []
    for item in CORPUS:
        if item.outil is None:
            continue
        permission, action, nature = item.permission, item.meta.action, item.meta.nature
        if action is Action.LANCEMENT_APRES_ACCORD and permission is not Permission.DEPENSE:
            disagreements.append(f"{item.identifiant} : lance sans outil qui dépense")
        if (
            nature is Nature.POSITIF
            and permission is Permission.DEPENSE
            and action is not Action.LANCEMENT_APRES_ACCORD
        ):
            disagreements.append(f"{item.identifiant} : un outil qui dépense, sans lancement après accord")
        if action is Action.CARTE_A_VALIDER and permission is not Permission.PROPOSITION:
            disagreements.append(f"{item.identifiant} : une carte à valider sur un outil classé {permission.name}")
        if (
            nature is Nature.POSITIF
            and permission is Permission.PROPOSITION
            and action not in (Action.CARTE_A_VALIDER, Action.ECRAN_PREREMPLI, Action.QUESTION)
        ):
            disagreements.append(
                f"{item.identifiant} : « {item.outil} » est classé PROPOSITION mais le scénario ne propose rien "
                "— outil de lecture absent de READ_ONLY_TOOLS ?"
            )
    assert not disagreements, "\n".join(disagreements)


# ── 4. #1948.52 — CHAQUE OUTIL : ≥ 1 SCÉNARIO POSITIF ET ≥ 1 CAS LIMITE ──────

#: Cliquet — les outils déclarés qui n'ont AUCUN cas limite. Il ne peut que
#: rétrécir : un outil ajouté sans cas limite fait tomber la garde, et un cas
#: limite écrit pour un outil de cette liste l'oblige à en sortir.
SANS_CAS_LIMITE: frozenset[str] = frozenset(
    {
        "ask_clarification",
        "compare_accounts",
        "enrich_contact",
        "find_accounts",
        "find_free_slots",
        "find_needs",
        "get_account_access",
        "get_account_briefing",
        "get_blocking_issues",
        "get_chain_blockers",
        "get_daily_briefing",
        "get_esn_on_account",
        "get_feature_adoption",
        "get_interventions",
        "get_invoice_blockers",
        "get_job_changes",
        "get_memory",
        "get_pipeline",
        "get_routines",
        "get_territory_overview",
        "get_user_context",
        "get_workspace_health",
        "get_workspace_vocabulary",
        "list_accounts_to_act",
        "list_agenda",
        "list_reactivation_pool",
        "pin_memory_fact",
        "plan_account_analysis",
        "prepare_consultant_record",
        "prepare_day_brief",
        "prepare_mail_draft",
        "prepare_message_for_contact",
        "propose_guided_action",
        # #2391 (24/09/2026) — le plan de journée en blocs de temps : un
        # scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "propose_focus_plan",
        "propose_weekly_plan",
        "propose_settings_update",
        "schedule_reminder_for_contact",
        "search_dormant_network",
        "search_missions",
        "search_partners",
        "search_proofs",
        "search_rfps",
        "search_talents",
        # #2721 (22/09/2026) — la recherche web exécutée par Laura : un
        # scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "web_search",
        # Épopée #2781 (#2150.30, LOT j1 26/09) — ajouter au portefeuille depuis
        # Laura : un scénario positif écrit ce lot, aucun cas limite pour
        # l'instant.
        "add_account_to_portfolio",
        # #2900 (#2415.10, 26/09) — le CA confirmé : un scénario positif écrit
        # ce lot, aucun cas limite pour l'instant.
        "get_confirmed_revenue",
        # Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — proposer un push
        # depuis Laura : un scénario positif écrit ce lot, aucun cas limite
        # pour l'instant.
        "push_profile",
        # #2319 (26/09) — la revue manager d'un compte : un scénario positif
        # écrit ce lot, aucun cas limite pour l'instant.
        "get_account_manager_review",
        # #2320.24 (épopée #2967, 26/09) — la chronologie des transitions d'un
        # besoin : un scénario positif écrit ce lot, aucun cas limite pour
        # l'instant.
        "get_need_transition_history",
        # #2320.26/.27 (épopée #2967, 26/09) — proposer une transition de
        # besoin : un scénario positif écrit ce lot, aucun cas limite pour
        # l'instant.
        "propose_need_transition",
        # #3871.1 (lot V11, 07/10) — proposer le passage d'un contact en
        # historique : un scénario positif écrit ce lot, aucun cas limite pour
        # l'instant.
        "propose_contact_departure",
        # #1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — lancer un travail long :
        # un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "propose_long_job",
        # #2857 (#2201.31, 26/09) — expliquer une carte de validation : un
        # scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "explain_approval_card",
        # #2322 n'est PAS ici : `compile_need` a un cas limite écrit sur la
        # base vague 15 (« ne-pas-inventer-un-champ-du-besoin »,
        # `test_copilote_scope_eval.py`) — fusion vague 15 → vague 16 (22/09),
        # le retirer du cliquet garde ce test honnête sur ce qui est mesuré.
        # #2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795, LOT écrivain 27/09) —
        # les sept lectures de l'état canonique commercial & staffing d'un
        # besoin : un scénario positif écrit ce lot, aucun cas limite pour
        # l'instant.
        "get_need_journal",
        "get_need_mission_handoff_check",
        "get_need_field_overview",
        "find_need_duplicates",
        "get_mission_start_checklist",
        "get_need_summary",
        "get_need_conversion_result",
        "get_need_no_go_state",
        # BEL-SC-224 (#3253, 28/09) — le diagnostic du maillon faible : un
        # scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "get_weakest_link_diagnosis",
        # BEL-SC-239 (28/09 soir) — le pack de proposition : un scénario
        # positif écrit ce lot, aucun cas limite pour l'instant.
        "prepare_proposal_pack",
        # #3209/#3210/#3214 (LAU-FINAL-215/216/220, intégration vague X2 28/09) —
        # trois scénarios positifs écrits à l'intégration pour des outils qui
        # n'en avaient aucun (GA-318/#1948) : aucun cas limite pour l'instant.
        "get_portfolio_priorities",
        # `find_similar_cases` a QUITTÉ ce cliquet le 09/10 (lot P05, #3246) : son
        # cas limite est écrit (« cas-similaires-sans-donnees-communes »).
        "compare_scenarios",
        # #3262.23 (épopée #3284, lot P05 29/09) — un scénario positif écrit
        # ce lot, aucun cas limite pour l'instant.
        "get_focus_review",
        # #3277.1 (épopée #3277, BEL-SC-225 suite) — la projection 5P : un
        # scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "get_account_strategy_5p",
        # #3258.14 (épopée #3362, lot E25 30/09) — la matrice intérêt ×
        # pénétrabilité : un scénario positif écrit ce lot, aucun cas limite
        # pour l'instant.
        "get_account_interest_penetrability",
        # #3345.2 (LAU-FINAL-255, lot E04 30/09) — les pistes déjà tranchées
        # d'un compte : un scénario positif écrit ce lot, aucun cas limite
        # pour l'instant.
        "get_qualification_lead_decisions",
        # #3278.3 (#3259.7, lot P10 30/09) — `get_channel_performance` a QUITTÉ
        # ce cliquet le 09/10 (lot P05, #3246) : son cas limite est écrit
        # (« pas-assez-de-donnees-communes », la base anonyme commune).
        # #3422.20 (lot V04 01/10) — choisir un modèle de message puis le
        # passer dans la checklist avant envoi : un scénario positif écrit ce
        # lot, aucun cas limite pour l'instant.
        "select_message_template",
        "check_message_before_send",
        # #3950.1 (décision Louis 09/10/2026, lot G01) — un scénario positif
        # écrit ce lot, aucun cas limite pour l'instant.
        "launch_vivier_export",
        # #2433.7 (lot M10, 09/10) — un scénario positif écrit ce lot, aucun
        # cas limite pour l'instant.
        "prepare_bug_report",
        # FIX-RECETTE-G (19/10, G.1) — un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "prepare_calendar_event",
    }
)

#: Cliquet — les outils déclarés sans AUCUN scénario positif.
SANS_SCENARIO_POSITIF: frozenset[str] = frozenset()


def _missing_by_nature(tools: Iterable[str], corpus: Iterable[Canonique]) -> tuple[set[str], set[str]]:
    natures: dict[str, set[Nature]] = {}
    for item in corpus:
        if item.outil is not None:
            natures.setdefault(item.outil, set()).add(item.meta.nature)
    tools = list(tools)
    return (
        {tool for tool in tools if Nature.POSITIF not in natures.get(tool, set())},
        {tool for tool in tools if Nature.CAS_LIMITE not in natures.get(tool, set())},
    )


def test_every_declared_tool_has_a_positive_scenario_and_an_edge_case() -> None:
    declared = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert len(declared) >= 52, "le registre d'outils a fondu : la garde lirait du vide"
    without_positive, without_edge = _missing_by_nature(declared, CORPUS)
    assert without_positive == set(SANS_SCENARIO_POSITIF), (
        f"Sans scénario positif : {sorted(without_positive)} (cliquet : {sorted(SANS_SCENARIO_POSITIF)})."
    )
    assert without_edge == set(SANS_CAS_LIMITE), (
        f"Sans cas limite : mesuré {sorted(without_edge - SANS_CAS_LIMITE)} en plus, "
        f"{sorted(SANS_CAS_LIMITE - without_edge)} à retirer du cliquet."
    )


def test_the_tool_coverage_guard_knows_how_to_say_no_and_ignores_conduct_rules() -> None:
    without_compare = [item for item in CORPUS if item.outil != "compare_accounts"]
    without_positive, _ = _missing_by_nature(["compare_accounts"], without_compare)
    assert without_positive == {"compare_accounts"}
    # Le voisin : une règle de conduite (outil None) ne couvre AUCUN outil.
    conduct_only = [item for item in CORPUS if item.outil is None]
    assert conduct_only and _missing_by_nature(["compare_accounts"], conduct_only)[0] == {"compare_accounts"}


# ── 5. #1948.54 — CHAQUE SCÉNARIO NOMME SA PAGE, ET ELLE EXISTE ──────────────

#: Cliquet — les scénarios dont la capacité n'a AUCUN écran propriétaire.
#: Mesuré le 13/09/2026 : aucune occurrence de `workspace-health`,
#: `workspaceHealth`, `feature-adoption`, `featureAdoption`, `blocking-issues`
#: ni `blockingIssues` dans `apps/web/src/features` et `apps/web/src/routes`.
#: Mesuré à nouveau le 13/09/2026 pour #1949.23 : aucune occurrence de
#: `unrouted` ni `Unrouted` dans tout `apps/web/src` — la trace est écrite par
#: l'API (`laura-unrouted-intent.entity.ts`) et relue au back-office.
SANS_PAGE_PROPRIETAIRE: dict[str, str] = {
    # #4281.1 (19/10) — les besoins historiques de la base commune ne sont lus que par Laura (et le plan).
    "scope/besoins-historiques-dun-compte": "les besoins historiques ne sont lus que par Laura (`search_historical_needs`)",
    "scope/besoins-historiques-rien-observe": "les besoins historiques ne sont lus que par Laura (`search_historical_needs`)",
    "scope/sante-de-mon-espace": "la santé de l'espace n'est lue que par Laura (`get_workspace_health`)",
    "scope/ce-que-je-paie-sans-lutiliser": "l'adoption n'est lue que par Laura (`get_feature_adoption`)",
    "scope/ce-qui-membeche-davancer": "les blocages ne sont lus que par Laura (`get_blocking_issues`)",
    "scope/quel-est-mon-vrai-point-de-blocage-commercial": (
        "le diagnostic du maillon faible n'est lu que par Laura (`get_weakest_link_diagnosis`)"
    ),
    # #1949.23 — la question qui tranche est « où la personne fait-elle la même
    # chose SANS Laura ? ». Pour une demande que Bellum ne sait pas router, la
    # réponse honnête est « nulle part dans le produit » : nommer un écran
    # laisserait croire que la capacité y vit.
    "scope/une-demande-hors-perimetre": (
        "la météo ne se consulte sur aucun écran de Bellum, et la trace anonyme qui en découle "
        "n'est relue qu'au back-office (`note_unrouted_request`)"
    ),
    "scope/une-capacite-que-bellum-na-pas": (
        "publier une annonce sur un jobboard ne se fait sur aucun écran de Bellum — c'est la définition "
        "même de `capacite_absente` (`note_unrouted_request`)"
    ),
    # #3193.2 (épopée #3217, lot E3 28/09 suite) — le référentiel sectoriel
    # n'est lu que par Laura (`search_sector_referential`), même famille que
    # `get_workspace_health` ci-dessus : aucun écran ne l'expose directement.
    "scope/reperes-sectoriels-dun-marche": (
        "le référentiel sectoriel n'est lu que par Laura (`search_sector_referential`), aucun écran ne "
        "l'expose directement"
    ),
    "scope/aucun-repere-sectoriel-ne-correspond": (
        "le référentiel sectoriel n'est lu que par Laura (`search_sector_referential`), aucun écran ne "
        "l'expose directement"
    ),
}


def _owner_page_problems(corpus: Iterable[Canonique], routes: frozenset[str]) -> dict[str, str]:
    problems: dict[str, str] = {}
    for item in corpus:
        page = item.meta.page
        if page is None:
            if item.identifiant not in SANS_PAGE_PROPRIETAIRE:
                problems[item.identifiant] = "aucune page, et absent du cliquet SANS_PAGE_PROPRIETAIRE"
        elif normalise_route(page) not in routes:
            problems[item.identifiant] = f"« {page} » n'existe pas dans routeTree.gen.ts"
    return problems


def test_the_route_registry_is_read() -> None:
    routes = routes_web()
    assert len(routes) >= 80, f"routeTree.gen.ts illisible : {len(routes)} routes"
    assert {"/chat", "/accounts/$id", "/settings/routines"} <= routes


def test_every_scenario_names_an_owner_page_that_exists() -> None:
    problems = _owner_page_problems(CORPUS, routes_web())
    assert not problems, f"Pages propriétaires introuvables : {problems}"
    stale = [
        identifiant for identifiant in SANS_PAGE_PROPRIETAIRE if identifiant not in {i.identifiant for i in CORPUS}
    ]
    assert not stale, f"le cliquet SANS_PAGE_PROPRIETAIRE désigne des scénarios disparus : {stale}"


def test_the_owner_page_guard_knows_how_to_say_no_and_accepts_index_and_param_routes() -> None:
    routes = routes_web()
    sample = CORPUS[0]
    # ⚠️ Le contre-exemple est FABRIQUÉ, jamais une route plausible. Payé le 30/10/2026 : ce témoin
    # citait `/decouvrir`, l'adresse française de Découvrir est entrée dans le routeur le 29/10, et
    # le témoin s'est tu — il ne reprochait plus rien, donc il ne prouvait plus que la garde sait
    # dire non. Un témoin qui nomme une route réelle a une date de péremption.
    fabricated = sample._replace(meta=sample.meta._replace(page="/ceci-nest-pas-une-route"))
    assert _owner_page_problems([fabricated], routes) == {
        sample.identifiant: "« /ceci-nest-pas-une-route » n'existe pas dans routeTree.gen.ts"
    }
    # Le voisin : une route d'index (`/billing/` au registre) et une route à paramètre.
    for page in ("/billing", "/accounts/$id"):
        assert _owner_page_problems([sample._replace(meta=sample.meta._replace(page=page))], routes) == {}


# ── 6. #1948.51 — LE CORPUS NE DEVIENT JAMAIS DES BOUTONS ────────────────────
#
# Les surfaces qui MONTRENT des phrases à cliquer : les suggestions d'accueil de
# Laura, leur traduction, et le catalogue « Que puis-je demander ? » servi par
# l'API. Le reste du dépôt a le droit de CITER une garde de `apps/ia/tests`
# (`demo-dataset.ts`, `kill-switches.ts` le font) : ce n'est pas un bouton.

_HOME_SUGGESTIONS_TS = _REPO_ROOT / "apps" / "web" / "src" / "features" / "chat" / "view" / "laura-home-suggestions.ts"
_CHAT_I18N_FR = _REPO_ROOT / "apps" / "web" / "src" / "i18n" / "locales" / "fr" / "chat.json"
_COMMAND_CATALOG_TS = _REPO_ROOT / "apps" / "api" / "src" / "modules" / "ia-proxy" / "command-catalog.ts"
_SUGGESTION_SURFACES = (
    _HOME_SUGGESTIONS_TS,
    _REPO_ROOT / "apps" / "web" / "src" / "features" / "chat-commands" / "api.ts",
    # #5043 — `categories.ts` supprimé : les moments du catalogue vivent dans `CommandDrawerButton.tsx`.
    _REPO_ROOT / "apps" / "web" / "src" / "features" / "chat-commands" / "view" / "CommandDrawerButton.tsx",
    _COMMAND_CATALOG_TS,
    _REPO_ROOT / "packages" / "contracts" / "src" / "schemas" / "command-library.ts",
)
_CORPUS_MARKERS = ("apps/ia/tests", "test_copilote_", "copilote_scenario_metadata")


def _surfaces_reading_the_corpus(sources: dict[str, str]) -> list[str]:
    return sorted(name for name, text in sources.items() if any(marker in text for marker in _CORPUS_MARKERS))


def _normalised(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()


def _visible_prompts() -> list[str]:
    home = json.loads(_CHAT_I18N_FR.read_text(encoding="utf-8"))["home"]["suggestions"]
    # #3654 — `scoped` est l'espace des pastilles d'un fil cadré sur un compte
    # (`home.suggestions.scoped.*`) : pas une amorce elle-même, ses enfants en ont une chacun.
    scoped = home.pop("scoped", {})
    catalog = _COMMAND_CATALOG_TS.read_text(encoding="utf-8")
    commands = re.findall(r"prompt:\s*\{\s*fr:\s*'((?:[^'\\]|\\.)*)'", catalog)
    return (
        [str(entry["prompt"]) for entry in home.values()]
        # #3773.5 — la demande une fois l'élément choisi (`{{name}}`) est AUSSI une phrase visible.
        + [str(entry["promptFor"]) for entry in home.values() if "promptFor" in entry]
        + [str(entry["prompt"]) for entry in scoped.values()]
        + commands
    )


def _copied_formulations(corpus: Iterable[Canonique], visible: Iterable[str]) -> list[str]:
    shown = {_normalised(text) for text in visible}
    return sorted(item.identifiant for item in corpus if _normalised(item.formulation) in shown)


def test_no_suggestion_surface_reads_the_test_corpus() -> None:
    sources = {str(path.relative_to(_REPO_ROOT)): path.read_text(encoding="utf-8") for path in _SUGGESTION_SURFACES}
    assert all(text.strip() for text in sources.values())
    assert _surfaces_reading_the_corpus(sources) == []


def test_the_home_suggestions_stay_a_short_hand_written_list() -> None:
    source = _HOME_SUGGESTIONS_TS.read_text(encoding="utf-8")
    bound = re.search(r"export const MAX_HOME_SUGGESTIONS = (\d+)", source)
    assert bound is not None and int(bound.group(1)) <= 4, "la borne des suggestions visibles a sauté"
    assert ".slice(0, MAX_HOME_SUGGESTIONS)" in source, "la borne n'est plus appliquée à la liste"
    union = re.search(r"type SuggestionId =((?:\s*\|\s*'[^']+')+)", source)
    assert union is not None
    ids = set(re.findall(r"'([^']+)'", union.group(1)))
    # #3773 — les amorces GÉNÉRIQUES (#2141) sont retirées : la grille n'est plus complétée.
    # Une seule liste FERMÉE, une traduction écrite à la main par entrée : rien ne se génère
    # depuis ailleurs, et elle reste d'un autre ordre de grandeur que le corpus.
    home = json.loads(_CHAT_I18N_FR.read_text(encoding="utf-8"))["home"]["suggestions"]
    assert set(home) - {"scoped"} == ids
    assert "GenericSuggestionId" not in source, "une amorce générique est revenue combler la grille"
    # #5042 — accueil V8 « sans amorces de compte » : les pastilles cadrées (#3654,
    # `ScopedSuggestionId`, `home.suggestions.scoped.*`) sont RETIRÉES, et ne reviennent pas.
    assert "ScopedSuggestionId" not in source, "une amorce de compte est revenue sur l'accueil V8"
    assert "scoped" not in home, "l'espace de clés `scoped` est revenu sans amorce qui le lise"
    assert len(ids) * 5 < len(CORPUS)


def test_no_corpus_formulation_is_copied_into_a_visible_prompt() -> None:
    visible = _visible_prompts()
    assert len(visible) >= 20, f"les phrases visibles sont illisibles : {len(visible)}"
    assert _copied_formulations(CORPUS, visible) == []


def test_the_button_guard_knows_how_to_say_no_and_spares_the_neighbours() -> None:
    sample = next(item for item in CORPUS if item.identifiant == "scope/analyser-une-entreprise")
    assert _copied_formulations([sample], [sample.formulation.upper()]) == [sample.identifiant]
    # Le voisin : la même INTENTION en libellé propre n'est pas une copie.
    assert _copied_formulations([sample], ["Je veux analyser une entreprise."]) == []
    assert _surfaces_reading_the_corpus({"fabricated.ts": "import { SCENARIOS } from 'apps/ia/tests/x'"}) == [
        "fabricated.ts"
    ]
    # Le voisin : citer une garde du moteur depuis un fichier produit est permis.
    neighbour = (_REPO_ROOT / "apps" / "api" / "src" / "modules" / "demo" / "demo-dataset.ts").read_text(
        encoding="utf-8"
    )
    assert "apps/ia/tests" in neighbour
    assert _surfaces_reading_the_corpus({"apps/api/src/modules/ia-proxy/command-catalog.ts": "prompt"}) == []


# ── 7. #1948.29 → .42 — CHAQUE CATÉGORIE A UN SCÉNARIO, OU UN NOM ────────────

#: Cliquet — les catégories sans aucun scénario d'intention principale. Il ne
#: peut que rétrécir : un scénario qui porte la catégorie en intention
#: PRINCIPALE oblige à l'en retirer.
#:
#: #1903.10 / #1935 — VIDÉ le 16/09/2026 : `Categorie.CREER_UNE_SEQUENCE` en
#: sortait par `scope/preparer-une-campagne` (`prepare_campaign`), le premier
#: outil qui la porte en intention PRINCIPALE — jusqu'ici, seul le rappel daté
#: de `scope/poser-un-rappel` la citait, en SECONDAIRE seulement (elle ne
#: comptait donc pas, voir `test_the_category_guard_knows_how_to_say_no_…`
#: ci-dessous).
CATEGORIES_SANS_SCENARIO: dict[Categorie, str] = {}


def _categories_without_scenario(corpus: Iterable[Canonique]) -> set[Categorie]:
    covered = {item.meta.intention for item in corpus}
    return {categorie for categorie in Categorie if categorie not in covered}


def test_every_category_has_a_scenario_or_is_named() -> None:
    assert _categories_without_scenario(CORPUS) == set(CATEGORIES_SANS_SCENARIO)


def test_the_category_guard_knows_how_to_say_no_and_ignores_secondary_intentions() -> None:
    # « Comprendre une page » n'a qu'UN scénario : le retirer doit faire apparaître le manque.
    covered = Categorie.COMPRENDRE_UNE_PAGE
    assert covered not in CATEGORIES_SANS_SCENARIO
    without_it = [item for item in CORPUS if item.meta.intention is not covered]
    assert len(without_it) < len(CORPUS)
    assert covered in _categories_without_scenario(without_it)
    # Le voisin : une catégorie portée en SECONDAIRE seulement ne couvre rien —
    # sinon une étiquette ajoutée en passant ferait disparaître un manque. C'est
    # exactement le cas réel de « Créer une séquence » sur `scope/poser-un-rappel`.
    sample = without_it[0]
    tagged = sample._replace(meta=sample.meta._replace(secondaires=(covered,)))
    assert covered in _categories_without_scenario([tagged, *without_it[1:]])
    assert any(Categorie.CREER_UNE_SEQUENCE in item.meta.secondaires for item in CORPUS)
    # #1903.10 / #1935 — ce lot ferme la catégorie par un scénario PRINCIPAL
    # réel (`scope/preparer-une-campagne`) : elle ne doit PLUS apparaître comme
    # manquante, alors que le secondaire seul (ligne au-dessus) n'y aurait
    # jamais suffi — c'est exactement ce que cette garde vérifie.
    assert Categorie.CREER_UNE_SEQUENCE not in _categories_without_scenario(CORPUS)


# ── 8. #1945 — CHAQUE POINT RETENU EST PROUVÉ, OU NOMMÉ POUR UNE ÉVAL EN LIGNE ─

#: Les preuves DÉTERMINISTES qui vivent hors des cinq suites (un bloc de prompt
#: rendu avec un contexte, un filtre de code) — rattachées par leur nœud pytest.
PREUVES_HORS_CORPUS: dict[Recette1945, tuple[str, ...]] = {
    Recette1945.UTILISATEUR_CONNU: (
        "tests/test_copilote_prompt_blocks.py::test_the_first_name_appears_only_when_known",
    ),
    Recette1945.AUCUN_CONNECTEUR: (
        "tests/test_chat_router_capability.py::TestCapabilityFilter::test_a_tool_whose_connector_is_missing_is_not_shown",
        "tests/test_copilote_prompt_blocks.py::test_a_missing_connector_keeps_the_intention_instead_of_dropping_it",
    ),
    Recette1945.TUTOIEMENT_VOUVOIEMENT: (
        "tests/test_copilote_prompt_blocks.py::test_tone_separates_the_in_app_address_from_the_external_message",
    ),
    Recette1945.ACTION_ECHOUEE: (
        "tests/test_copilote_prompt_blocks.py::test_result_reports_the_four_outcomes_and_never_the_credits_spent",
    ),
    Recette1945.DEUXIEME_MEMBRE: (
        "tests/test_copilote_scope_eval.py::test_chain_blockers_description_does_not_promise_mine_unconditionally",
        "tests/test_copilote_scope_eval.py::test_job_changes_description_does_not_promise_the_portfolio_is_mine",
    ),
    Recette1945.PIECE_JOINTE: (
        "tests/test_chat_attached_documents.py::TestPromptBlock::test_le_bloc_interdit_de_completer_le_document",
    ),
    Recette1945.AUCUNE_CAPACITE_INVENTEE: (
        "tests/test_copilote_scenario_corpus.py::test_the_prompt_forbids_promising_a_capability_the_registry_lacks",
        "tests/test_copilote_scenario_corpus.py::test_every_tool_name_cited_to_the_model_exists_in_the_registry",
    ),
    Recette1945.BONNE_REDIRECTION: (
        "tests/test_copilote_prompt_blocks.py::test_every_screen_path_quoted_in_the_prompt_exists_in_the_web_navigation",
        "tests/test_copilote_scenario_corpus.py::test_every_route_cited_in_the_registry_exists_in_the_web_routes",
    ),
    # #1945.3 — ajoutée après `e2f8b51b9` (13/09/2026) : « dire que la
    # personnalisation est limitée » (#1920.16) EST dans le prompt, contrairement
    # à ce que RESTE_EN_LIGNE prétendait encore (test_1945_3_… ci-dessous).
    Recette1945.PROFIL_INCOMPLET: (
        "tests/test_laura_role_and_voice.py::test_1920_16_the_two_labels_it_names_are_the_real_seller_lines",
    ),
    # #1945.33 (rouvert 13/09) — livré par la vague #1929.6 : la même règle,
    # sous un autre numéro de chantier ; ces deux tests savent dire NON
    # (`test_the_1945_guards_know_how_to_say_no` les rejoue).
    Recette1945.HORS_PERIMETRE: (
        "tests/test_laura_role_and_voice.py::test_1929_6_out_of_scope_is_short_then_back_to_the_product_on_one_line",
        "tests/test_laura_role_and_voice.py::test_1929_6_no_fragment_survives_the_removal_of_its_block",
    ),
}

#: Ce qui ne se prouve QU'EN APPELANT LE MODÈLE — ou hors du moteur. Aucun test
#: déterministe ne le simule ici : il serait vert sur une intention.
EVAL_EN_LIGNE: dict[Recette1945, str] = {
    Recette1945.ENTREPRISE_HOMONYME: (
        "aucune règle de désambiguïsation n'existe côté conversation : `plan_account_analysis` cherche un "
        "dossier par NOM (`findCompletedByUserAndCompany`) et le prompt ne dit rien des homonymes — "
        "« Analyse-moi Roche » ne peut s'évaluer qu'en jouant le tour"
    ),
    Recette1945.MESSAGE_C_LEVEL: (
        "le registre expose un `angle` libre sur `prepare_message_for_contact` ; aucune règle écrite ne "
        "distingue un dirigeant d'un opérationnel — seule la réponse produite peut le montrer"
    ),
    Recette1945.MESSAGE_OPERATIONNEL: "même raison que 1945.15 : aucune règle écrite, seule la réponse produite le montre",
    Recette1945.RETOUR_APRES_SEPT_JOURS: (
        "le prompt ne porte aucune notion de temps écoulé : la mémoire rend un résumé roulant sans date "
        "(`_format_memory`) — le comportement au retour ne se lit qu'en rejouant une conversation datée"
    ),
    Recette1945.MOBILE: "la coque mobile est du web (GA-28/29/30) : recette navigateur, pas moteur",
    Recette1945.REPOND_A_LA_VRAIE_QUESTION: "la pertinence d'une réponse se juge sur la réponse, pas sur une règle écrite",
    # #1945.30 (rouvert 13/09) — la CONSTRUCTION du lien est testée
    # (`ShareConversation.test.tsx`, portée + fil dans l'URL) ; aucun test ne
    # ROUVRE cette URL pour vérifier qu'on retombe sur le même fil et la même
    # portée (`Chat.tsx`, `sharedConversationId`) : recette navigateur, pas moteur.
    Recette1945.REOUVRIR_LE_LIEN_PARTAGE: (
        "la construction du lien est testée ; aucun test ne le rouvre pour vérifier le fil et la portée retrouvés — "
        "recette navigateur, pas moteur"
    ),
    # #1945.38 (rouvert 13/09) — les cinq niveaux de vérité sont gardés
    # SÉPARÉMENT (`test_copilote_truth_levels_eval.py::LEVELS`) ; le chaînage
    # fait+source / déduction+règle / inconnu dans UNE SEULE réponse ne se
    # prouve qu'en jouant un vrai tour de conversation.
    Recette1945.CHAINAGE_DES_NIVEAUX_DE_VERITE: (
        "chaque niveau de vérité est gardé séparément ; leur chaînage dans UNE réponse ne se prouve qu'en jouant le tour"
    ),
}

#: #1945 — points RETENUS dont la FONCTIONNALITÉ elle-même n'existe pas encore
#: (distinct d'`EVAL_EN_LIGNE` : là, la règle est écrite et seule sa preuve
#: manque). Chacun porte l'issue qui le suit — un lot à part, jamais cette PR.
#: Revérifié le 14/09/2026 :
#: `grep -inE "recommandation.*g[ée]n[ée]riq|interchangeabl" app/prompts/bellum_advisor.py`
#: et `grep -rn "1945\.45"` rendent tous les deux 0 occurrence ; `gh issue view
#: 1925` rend `state: OPEN`.
NON_LIVRES_1945: dict[Recette1945, str] = {
    Recette1945.RECOMMANDATION_INTERCHANGEABLE: (
        "aucune règle n'existe dans le prompt (0 occurrence) — #1925 (OPEN) suit ce lot"
    ),
}

#: Points RATTACHÉS dont la règle est prouvée ici, mais dont une moitié reste à
#: jouer en ligne. Informatif : il ne change pas le rattachement.
RESTE_EN_LIGNE: dict[Recette1945, str] = {
    Recette1945.CREDITS_INSUFFISANTS: (
        "la règle d'annoncer le coût ET le solde avant de lancer est écrite ; le refus au lancement est un "
        "`{error, message}` du pont (copilot-bridge.controller.ts:426-428) que seule la réponse montre"
    ),
    Recette1945.CORRECTION_PERSISTANTE: (
        "la règle « elle prime dans tes réponses suivantes » est écrite ; la persistance (pierre tombale) vit côté API"
    ),
    Recette1945.SEQUENCE_SANS_CONNECTEUR: (
        "« conserve l'intention » est écrit ; aucun outil ne crée de séquence, donc rien à filtrer en code"
    ),
    Recette1945.CONNECTEUR_CASSE: (
        "`get_blocking_issues` distingue « rien à signaler » de « je n'ai pas pu regarder » ; un connecteur "
        "EXPIRÉ n'a pas d'état propre côté moteur (`tools_for` ne connaît que connecté / absent)"
    ),
}


def _attached(corpus: Iterable[Canonique]) -> set[Recette1945]:
    return {situation for item in corpus for situation in item.meta.situations} | set(PREUVES_HORS_CORPUS)


def test_every_retained_1945_point_is_proven_or_named_for_an_online_eval() -> None:
    attached = _attached(CORPUS)
    assert not attached & set(EVAL_EN_LIGNE), (
        f"prouvés ET annoncés en ligne : {sorted(attached & set(EVAL_EN_LIGNE))} — retire-les d'EVAL_EN_LIGNE"
    )
    assert not attached & set(NON_LIVRES_1945), (
        f"prouvés ET annoncés non-livrés : {sorted(attached & set(NON_LIVRES_1945))} — retire-les de NON_LIVRES_1945"
    )
    missing = set(Recette1945) - attached - set(EVAL_EN_LIGNE) - set(NON_LIVRES_1945)
    assert not missing, f"points #1945 ni prouvés ni nommés pour une éval en ligne : {sorted(missing)}"
    assert set(RESTE_EN_LIGNE) <= attached


def test_1945_3_profil_incomplet_no_longer_needs_an_online_half() -> None:
    """#1945.3 — RESTE_EN_LIGNE prétendait que « dire que la personnalisation est
    limitée » (#1920.16) n'existe pas dans le prompt. Périmé depuis `e2f8b51b9`
    (13/09/2026, 00h54, AVANT ce dict écrit à 23h39 le même jour) :
    `_LIMITED_PERSONALISATION` est écrite ET testée
    (`test_1920_16_the_two_labels_it_names_are_the_real_seller_lines`). Rien ne
    « reste en ligne » pour ce point : il est PLEINEMENT prouvé hors corpus."""
    assert Recette1945.PROFIL_INCOMPLET in PREUVES_HORS_CORPUS
    assert Recette1945.PROFIL_INCOMPLET not in RESTE_EN_LIGNE
    # Le voisin : un point réellement à moitié en ligne n'est pas déplacé.
    assert Recette1945.CREDITS_INSUFFISANTS in RESTE_EN_LIGNE
    assert Recette1945.CREDITS_INSUFFISANTS not in PREUVES_HORS_CORPUS


# ── 8bis. #1945 — L'ENUM NE DIVERGE PAS DU REGISTRE (garde du 14/09/2026) ────
#
# Le défaut réel n'était pas « quatre membres manquent » : c'est que rien ne
# reliait `Recette1945` au registre des points retenus. Un test qui se
# contente d'ajouter les quatre membres laisse le PROCHAIN écart se produire
# en silence. Cette garde vise la RELATION : `Recette1945` (les points
# RETENUS) et `POINTS_ECARTES_1945` (les points ÉCARTÉS, versionnée à côté de
# l'enum dans `copilote_scenario_metadata.py`) doivent, ENSEMBLE, couvrir
# EXACTEMENT `1945.1`..`1945.{TOTAL_POINTS_1945}` — aucun trou, aucun
# recoupement. Le registre lui-même (`.claude/notes/registre-2026-09-12.md`)
# est gitignoré et partagé entre sessions : une garde ne peut ni le lire (il
# peut être absent en CI) ni le modifier. `POINTS_ECARTES_1945` en est le
# proxy DANS le dépôt — versionné, donc revu dans la MÊME PR que l'enum.


def _univers_1945() -> set[str]:
    return {f"1945.{i}" for i in range(1, TOTAL_POINTS_1945 + 1)}


def test_the_1945_enum_matches_the_versioned_registry() -> None:
    retenus = {member.value for member in Recette1945}
    ecartes = set(POINTS_ECARTES_1945)
    overlap = retenus & ecartes
    assert not overlap, f"retenu ET écarté à la fois : {sorted(overlap)}"
    univers = _univers_1945()
    manquants = univers - (retenus | ecartes)
    assert not manquants, f"points #1945 ni dans Recette1945 ni dans POINTS_ECARTES_1945 : {sorted(manquants)}"
    en_trop = (retenus | ecartes) - univers
    assert not en_trop, f"hors de 1945.1..{TOTAL_POINTS_1945} : {sorted(en_trop)}"


def test_the_1945_registry_guard_knows_how_to_say_no() -> None:
    """Preuve 1 — savoir dire NON : un point qui manquerait à l'union (retenu
    ∪ écarté) doit faire échouer la garde en NOMMANT ce point, pas un rouge
    muet. ⚠️ Retirer réellement un membre de `Recette1945` (fait à la main
    pendant l'écriture de cette PR, sur `HORS_PERIMETRE`, puis restauré) casse
    PLUS TÔT — un `AttributeError` à la collecte, sur les dicts qui le
    nomment ailleurs dans ce fichier — précisément PARCE QUE la garde d'à côté
    (`test_every_retained_1945_point_is_proven_or_named_for_an_online_eval`)
    force tout point retenu à être référencé par son nom. Cette version-ci
    mesure la garde de CE fichier isolément, sur une COPIE de l'ensemble des
    valeurs, pour ne pas dépendre de cet autre couplage."""
    retenus = {member.value for member in Recette1945} - {Recette1945.RECOMMANDATION_INTERCHANGEABLE.value}
    ecartes = set(POINTS_ECARTES_1945)
    manquants = _univers_1945() - (retenus | ecartes)
    assert manquants == {"1945.45"}


def test_the_1945_registry_guard_reads_something() -> None:
    """Preuve 2 — LIRE quelque chose : la liste parcourue n'est pas vide, et
    porte bien les 39 points retenus (le compte que l'audit du 14/09 a mesuré
    — c'est précisément ce que l'ancienne énumération, à 35, ne pouvait pas
    voir)."""
    assert len(POINTS_ECARTES_1945) > 0
    assert len(list(Recette1945)) == 39


def test_the_1945_registry_guard_does_not_catch_a_neighbour() -> None:
    """Preuve 3 — ne pas attraper ce qu'elle ne vise pas : un point d'une
    AUTRE issue (#1948.14) n'appartient jamais à l'univers `1945.*`, même
    glissé par erreur parmi les retenus — cette garde ne porte que sur #1945."""
    temoin = "1948.14"
    assert temoin not in _univers_1945()
    retenus_avec_intrus = {member.value for member in Recette1945} | {temoin}
    ecartes = set(POINTS_ECARTES_1945)
    assert _univers_1945() - (retenus_avec_intrus | ecartes) == set()
    assert temoin not in (retenus_avec_intrus & _univers_1945())


def _proof_problem(node_id: str) -> str | None:
    path, *names = node_id.split("::")
    file = _IA_ROOT / path
    if not file.exists():
        return f"{node_id} : fichier absent"
    nodes: list[ast.stmt] = ast.parse(file.read_text(encoding="utf-8")).body
    for name in names:
        found = next(
            (
                node
                for node in nodes
                if isinstance(node, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and node.name == name
            ),
            None,
        )
        if found is None:
            return f"{node_id} : « {name} » introuvable"
        nodes = found.body
    return None


def test_every_proof_outside_the_corpus_exists() -> None:
    node_ids = [node_id for node_ids in PREUVES_HORS_CORPUS.values() for node_id in node_ids]
    assert len(node_ids) >= 8
    problems = [problem for node_id in node_ids if (problem := _proof_problem(node_id))]
    assert not problems, problems


def test_the_1945_guards_know_how_to_say_no() -> None:
    without_attachment = [item._replace(meta=item.meta._replace(situations=())) for item in CORPUS]
    assert Recette1945.PREMIERE_UTILISATION not in _attached(without_attachment)
    assert _proof_problem("tests/test_copilote_prompt_blocks.py::test_does_not_exist") is not None
    # Le voisin : un nœud dans une CLASSE se trouve.
    assert _proof_problem(PREUVES_HORS_CORPUS[Recette1945.PIECE_JOINTE][0]) is None


# ── 9. 1945.37 / 1945.39 — AUCUNE CAPACITÉ, AUCUN OUTIL, AUCUN ÉCRAN INVENTÉS ─

_TOOL_NAME = re.compile(
    r"\b(?:get|search|find|list|prepare|propose|plan|start|run|toggle|pin|compare|enrich|export|schedule|ask)_[a-z_]+\b"
)


def _schema_field_names(node: Any) -> set[str]:
    """Tous les noms de champs qu'un schéma d'outil peut citer, à toute
    profondeur : les clés `properties` (imbriquées comprises, par ex. dans les
    `items` d'un tableau) ET les valeurs `enum` — un champ comme `start_on`
    (#2322, `_NEED_COMPILER_FIELDS`) n'apparaît que là, jamais en clé de
    `properties` de premier niveau, et a la même forme qu'un nom d'outil."""
    names: set[str] = set()
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            names.update(str(key) for key in props)
        enum = node.get("enum")
        if isinstance(enum, list):
            names.update(str(value) for value in enum if isinstance(value, str))
        for value in node.values():
            names.update(_schema_field_names(value))
    elif isinstance(node, list):
        for item in node:
            names.update(_schema_field_names(item))
    return names


def _cited_unknown_tools(text: str) -> list[str]:
    """Les noms d'outil cités au modèle qui n'existent pas dans le registre.

    Les propriétés de schéma (`plan_token`…), à toute profondeur, ont la même
    forme et ne sont pas des outils : elles sont LUES dans le registre et
    écartées, jamais listées à la main."""
    properties = {name for tool in chat_tools.CHAT_TOOLS for name in _schema_field_names(tool.get("input_schema", {}))}
    return sorted({name for name in _TOOL_NAME.findall(text) if name not in registre() and name not in properties})


def test_the_prompt_forbids_promising_a_capability_the_registry_lacks() -> None:
    """1945.37 — les deux phrases existaient, AUCUNE n'était tenue par un test
    (seul le golden `advisor.txt` les recopiait, et un golden se régénère)."""
    execution_rule = (
        "Tu ne peux préparer un plan d'exécution que pour une capacité réellement disponible dans le registre ci-dessus"
    )
    promise_rule = "Tu ne promets aucune capacité que tes outils ne portent pas"
    assert execution_rule in bellum_advisor._BLOCK_TOOLS and execution_rule in PROMPT
    assert promise_rule in bellum_advisor._BLOCK_DISCOVERY and promise_rule in PROMPT
    # Avec le registre RÉEL de la personne, la règle se durcit sur SA liste.
    assert "ne propose JAMAIS un outil absent de cette liste" in build_system_prompt({}, {}, "", "", tools_summary="x")
    # Preuve n°1 — sans le bloc, la règle disparaît : elle ne vit nulle part ailleurs.
    assert execution_rule not in PROMPT.replace(bellum_advisor._BLOCK_TOOLS, "")


def test_the_general_capability_ban_is_written_in_a_block_of_general_scope() -> None:
    """#1949.8 / #1949.15 — la promotion d'un CONSTAT en garde verte.

    Ce test était un constat d'absence : « tu ne promets aucune capacité »
    n'était écrit que dans le bloc de DÉCOUVERTE, dont l'en-tête le borne à
    « quelqu'un qui découvre Bellum », et le bloc OUTILS ne l'écrivait que pour
    un PLAN D'EXÉCUTION. Sur un tour ordinaire (« lis ma veille »), l'interdit
    général n'était donc qu'implicite. Le constat annonçait sa propre sortie :
    « le test tombe le jour où la phrase est écrite dans un bloc de portée
    générale ». #1949 l'a fait — ``BLOCK_UNKNOWN_REQUEST`` s'applique à TOUTE
    demande, et c'est ce qui est gardé ici.
    """
    holders = sorted(
        name
        for name in dir(bellum_advisor)
        if name.startswith("_BLOCK_") and "aucune capacité" in str(getattr(bellum_advisor, name))
    )
    assert holders == ["_BLOCK_DISCOVERY", "_BLOCK_UNKNOWN_REQUEST"], holders
    # Ce qui fait la valeur de la promotion : l'interdit SURVIT au retrait du
    # bloc de découverte, donc il ne dépend plus de l'ancienneté de la personne.
    assert "aucune capacité" in PROMPT.replace(bellum_advisor._BLOCK_DISCOVERY, "")
    # Et le bloc qui le porte n'est PAS borné à un moment du parcours : son
    # en-tête parle de la demande, pas de qui la pose.
    entete = bellum_advisor._BLOCK_UNKNOWN_REQUEST.split(".", 1)[0]
    assert "UNE DEMANDE QUE TU N'AS JAMAIS VUE" in entete
    assert "découvre" not in entete and "arrivant" not in entete


def test_every_tool_name_cited_to_the_model_exists_in_the_registry() -> None:
    corpus = PROMPT + "\n" + json.dumps(chat_tools.CHAT_TOOLS, ensure_ascii=False)
    assert len(_TOOL_NAME.findall(corpus)) >= 10, "aucun nom d'outil lu : garde aveugle"
    assert _cited_unknown_tools(corpus) == [], "un texte adressé au modèle cite un outil qui n'existe pas"


def test_the_cited_tool_guard_knows_how_to_say_no_and_spares_schema_fields() -> None:
    assert _cited_unknown_tools("Appelle `get_thread` pour lire le fil entier.") == ["get_thread"]
    assert _cited_unknown_tools("Passe `plan_token`, lis `finance_forbidden` et `main_cause`.") == []


def _unknown_routes_in(text: str, routes: frozenset[str]) -> list[str]:
    return sorted({route for route in re.findall(r"`(/[a-z0-9/_$-]*)`", text) if normalise_route(route) not in routes})


def test_every_route_cited_in_the_registry_exists_in_the_web_routes() -> None:
    """1945.39 — la garde voisine (`test_copilote_prompt_blocks.py`) tient les
    chemins du PROMPT ; les DESCRIPTIONS en citent vingt de plus, que personne
    ne confrontait au registre de routes."""
    text = "\n".join(str(tool.get("description", "")) for tool in chat_tools.CHAT_TOOLS)
    assert len(re.findall(r"`(/[a-z0-9/_$-]*)`", text)) >= 10, "aucune route lue : garde aveugle"
    assert _unknown_routes_in(text, routes_web()) == []


def test_the_registry_route_guard_knows_how_to_say_no() -> None:
    routes = routes_web()
    # Contre-exemple FABRIQUÉ : voir le témoin de la page propriétaire — `/decouvrir` est devenu une
    # vraie route le 29/10/2026 et avait rendu ce témoin muet.
    assert _unknown_routes_in("renvoie vers `/ceci-nest-pas-une-route`", routes) == ["/ceci-nest-pas-une-route"]
    assert _unknown_routes_in("route `/billing` ou `/settings/profile`", routes) == []


# ── 10. Aucun nom d'éditeur dans un comportement attendu ─────────────────────


def _vendors_in(texts: Iterable[str]) -> list[str]:
    joined = "\n".join(texts)
    return sorted(
        vendor for vendor in FORBIDDEN_VENDORS if re.search(rf"\b{re.escape(vendor)}\b", joined, re.IGNORECASE)
    )


def test_no_expected_behaviour_names_a_vendor() -> None:
    offenders = {item.identifiant: found for item in CORPUS if (found := _vendors_in(item.fragments))}
    assert not offenders, offenders


def test_the_vendor_guard_knows_how_to_say_no_and_spares_lookalikes() -> None:
    assert _vendors_in(["pousse la fiche dans HubSpot"]) == ["HubSpot"]
    assert _vendors_in(["les notions de base", "une slackline"]) == []


# ── 11. GA-26 — LE VOCABULAIRE DU CORPUS EST DÉFINI À DEUX ENDROITS NOMMÉS ───
#
# #1948 est un DÉBLOQUEUR : cinq autres groupes attendent ce corpus. Le risque
# n'est pas qu'ils l'ignorent, c'est que chacun se réécrive son
# `class Categorie(StrEnum)` faute de l'avoir trouvé — et cinq définitions du
# même objet divergent en trois semaines. Les gardes ci-dessus vérifient que
# chaque scénario PORTE le schéma ; celle-ci vérifie qu'il n'en existe QU'UN
# par nom, quel que soit CELUI des deux fichiers canoniques qui le porte.
#
# #2445.4 (#2766, 27/09/2026) — un SECOND fichier canonique est apparu :
# `app/access/rights_matrix.py` porte `Famille`/`FAMILLE_PAR_ROLE`/`Permission`
# depuis que du code de PRODUCTION doit les lire (`chat_orchestrator.py`), pas
# seulement ce module de test. Le POURQUOI deux fichiers plutôt qu'un import
# circulaire : `copilote_scenario_metadata.py` (sous `tests/`) ne peut pas
# être importé par `app/` — un test important son objet, jamais l'inverse.
#
# ⚠️ Portée dite, pas supposée : le Python du service IA, où le corpus vit. Un
# sixième jeu écrit en TypeScript lui échapperait.

_MODULE_CANONIQUE = _IA_ROOT / "tests" / "copilote_scenario_metadata.py"
_MODULE_DROITS = _IA_ROOT / "app" / "access" / "rights_matrix.py"
_MODULES_CANONIQUES: tuple[Path, ...] = (_MODULE_CANONIQUE, _MODULE_DROITS)
_DOSSIERS_HORS_SOURCE = frozenset({".venv", "__pycache__", ".pytest_cache", ".ruff_cache", ".turbo", "node_modules"})


def _definitions_de_module(source: str) -> set[str]:
    """Les noms définis AU NIVEAU DU MODULE : classes, fonctions, constantes.

    Au niveau du module SEULEMENT, et c'est ce qui épargne les voisins
    légitimes : une `class Meta:` imbriquée dans une autre classe est une
    convention répandue et ne dit rien du corpus, et un
    `from tests.copilote_scenario_metadata import Meta` n'est pas une
    définition — c'est exactement le geste qu'on veut voir."""
    definitions: set[str] = set()
    for node in ast.parse(source).body:
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            definitions.add(node.name)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            definitions.add(node.target.id)
        elif isinstance(node, ast.Assign):
            definitions.update(cible.id for cible in node.targets if isinstance(cible, ast.Name))
    return definitions


def _noms_du_texte(text: str) -> set[str]:
    """Les CLASSES, CONSTANTES et DÉRIVATIONS d'UN texte de module — la moitié
    mécanique de `vocabulaire_canonique`, partagée entre les deux fichiers
    canoniques (#2445.4)."""
    noms: set[str] = set()
    for node in ast.parse(text).body:
        if isinstance(node, ast.ClassDef):
            noms.add(node.name)
            if node.name == "Canonique":
                for membre in node.body:
                    if isinstance(membre, ast.FunctionDef):
                        noms.update(
                            appel.func.id
                            for appel in ast.walk(membre)
                            if isinstance(appel, ast.Call) and isinstance(appel.func, ast.Name)
                        )
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            cibles = node.targets if isinstance(node, ast.Assign) else [node.target]
            noms.update(cible.id for cible in cibles if isinstance(cible, ast.Name) and cible.id.isupper())
    return noms


def vocabulaire_canonique(source: str | None = None) -> frozenset[str]:
    """Les noms du schéma, LUS dans les DEUX fichiers canoniques — jamais
    recopiés ici (#2445.4 : `copilote_scenario_metadata.py` pour le schéma de
    scénario, `app/access/rights_matrix.py` pour la classification rôle/
    permission qu'un code de production doit aussi pouvoir lire).

    Trois sortes, et trois seulement : les CLASSES du schéma (les énumérations,
    `Meta`, `Canonique`, et désormais `Famille`/`Permission` lues dans le
    second fichier), les CONSTANTES publiques (les tables que #1948 fixe, plus
    `FAMILLE_PAR_ROLE`/`READ_ONLY_TOOLS`/`SPENDING_TOOLS` du second fichier),
    et les DÉRIVATIONS — celles qu'appellent les propriétés de `Canonique`
    (dont `permission_de`, qui vit maintenant dans le second fichier mais
    reste appelée depuis `Canonique.permission`), donc lues dans son corps
    plutôt que listées.

    ⚠️ Les noms PRIVÉS en sont exclus, et c'est une correction mesurée : la
    première version attrapait `_REPO_ROOT` dans six fichiers voisins qui
    posent, légitimement, le même raccourci vers la racine du dépôt. Les
    lecteurs génériques (`registre`, `normalise_route`, `routes_web`,
    `grille_de_credits`) en sont exclus aussi — un nom générique ferait de
    cette garde une garde gourmande, et leur unicité est déjà tenue par
    `test_the_credit_grid_is_read_not_copied` et `test_the_route_registry_is_read`.

    ``source`` (un seul texte, pas les deux fichiers) reste un point d'entrée
    pour un test qui veut rejouer un module canonique fabriqué."""
    if source is not None:
        return frozenset(nom for nom in _noms_du_texte(source) if not nom.startswith("_"))
    noms: set[str] = set()
    for module in _MODULES_CANONIQUES:
        noms.update(_noms_du_texte(module.read_text(encoding="utf-8")))
    return frozenset(nom for nom in noms if not nom.startswith("_"))


def _fichiers_python_du_service() -> tuple[Path, ...]:
    return tuple(
        sorted(
            chemin
            for chemin in _IA_ROOT.rglob("*.py")
            if chemin not in _MODULES_CANONIQUES
            and not (_DOSSIERS_HORS_SOURCE & set(chemin.relative_to(_IA_ROOT).parts))
        )
    )


def _redefinitions(vocabulaire: frozenset[str], sources: dict[str, str]) -> dict[str, list[str]]:
    """Les fichiers qui définissent eux-mêmes un nom du schéma. ⚠️ Un fichier
    qui ne s'analyse pas n'est PAS ignoré en silence : il remonte, sinon la
    garde deviendrait aveugle le jour où quelqu'un casse un module."""
    trouvees: dict[str, list[str]] = {}
    for nom_du_fichier, source in sources.items():
        try:
            definitions = _definitions_de_module(source)
        except SyntaxError as exc:
            trouvees[nom_du_fichier] = [f"illisible : {exc}"]
            continue
        if doublons := sorted(definitions & vocabulaire):
            trouvees[nom_du_fichier] = doublons
    return trouvees


def test_the_canonical_vocabulary_is_read_not_listed() -> None:
    """Preuve n°2 — une garde dont le corpus est vide est verte pour rien."""
    vocabulaire = vocabulaire_canonique()
    # Les noms que ce fichier IMPORTE vraiment : s'ils sortaient du module
    # canonique, la garde ne protégerait plus rien tout en restant verte.
    assert {
        "Meta",
        "Canonique",
        "Moment",
        "Categorie",
        "Objet",
        "JamaisInventer",
        "Action",
        "Nature",
        "Famille",
        "Recette1945",
        "Permission",
        "permission_de",
        "cout_de",
        "donnees_necessaires_de",
        "ACTION_CREDITEE_PAR_OUTIL",
        "FAMILLE_PAR_ROLE",
    } <= vocabulaire, f"le schéma a fondu : {sorted(vocabulaire)}"


def test_the_scenario_vocabulary_is_defined_in_a_single_file() -> None:
    """GA-26 appliquée au corpus : un champ défini ailleurs est une SECONDE
    vérité, et deux vérités sur le même objet divergent."""
    fichiers = _fichiers_python_du_service()
    lus = {str(chemin.relative_to(_IA_ROOT)): chemin for chemin in fichiers}
    assert len(fichiers) >= 300, f"la garde ne lit presque rien : {len(fichiers)} fichiers"
    assert {f"tests/{suite.__name__.split('.')[-1]}.py" for suite in (scope, security, ask, truth, market)} <= set(
        lus
    ), "la garde ne balaie même pas les cinq suites du corpus"

    ailleurs = _redefinitions(
        vocabulaire_canonique(),
        {nom: chemin.read_text(encoding="utf-8") for nom, chemin in lus.items()},
    )
    assert not ailleurs, (
        "le schéma du corpus est redéfini hors de copilote_scenario_metadata.py "
        f"— importe-le au lieu de le réécrire (GA-26) : {ailleurs}"
    )


def test_the_vocabulary_guard_knows_how_to_say_no_and_spares_the_neighbours() -> None:
    """Preuves n°1 et n°3 — elle sait dire NON, et elle n'attrape pas à côté."""
    vocabulaire = vocabulaire_canonique()

    sixieme_corpus = "from enum import StrEnum\n\n\nclass Categorie(StrEnum):\n    DECIDER = 'Décider'\n"
    assert _redefinitions(vocabulaire, {"sixieme.py": sixieme_corpus}) == {"sixieme.py": ["Categorie"]}
    assert _redefinitions(vocabulaire, {"casse.py": "class Meta(:\n"})["casse.py"][0].startswith("illisible")

    # Quatre voisins LÉGITIMES : importer le schéma, porter un nom qui le
    # contient, une `Meta` imbriquée, et le raccourci privé vers la racine.
    voisins = {
        "suite.py": "from tests.copilote_scenario_metadata import Categorie, Meta\n\nSCENARIOS = (Meta,)\n",
        "voisin.py": "class CategorieCommerciale:\n    pass\n\n\nMetaDonnees = 1\n",
        "modele.py": "class Fiche:\n    class Meta:\n        ordering = ()\n",
        "chemins.py": "from pathlib import Path\n\n_REPO_ROOT = Path(__file__).parents[3]\n",
    }
    assert _redefinitions(vocabulaire, voisins) == {}


# ── 12. #1948 — LES DIX-SEPT CHAMPS EXISTENT, ET CHACUN A UN PROPRIÉTAIRE ────

#: Les dix-sept champs que l'énoncé de #1948 demande, et l'attribut qui porte
#: chacun : sur `Meta` (écrit à la main) ou sur `Canonique` (bâti depuis la
#: suite, propriétés dérivées comprises). ⚠️ C'est la seule liste de ce fichier
#: RECOPIÉE — et elle l'est depuis l'ÉNONCÉ, jamais depuis le code : une liste
#: dérivée du code dirait « tout est là » quel que soit le nombre de champs.
CHAMPS_DE_1948: dict[str, str] = {
    "1948.12 identifiant": "identifiant",
    "1948.13 persona": "meta.personas",
    "1948.14 moment métier": "meta.moment",
    "1948.15 formulation réelle de l'utilisateur": "formulation",
    "1948.16 intention principale": "meta.intention",
    "1948.17 intentions secondaires": "meta.secondaires",
    "1948.18 objets concernés": "meta.objets",
    "1948.19 données nécessaires": "donnees_necessaires",
    "1948.20 outils nécessaires": "outil",
    "1948.21 permission requise": "permission",
    "1948.22 coût éventuel": "cout",
    "1948.23 page propriétaire": "meta.page",
    "1948.24 comportement attendu": "fragments",
    "1948.25 informations à ne jamais inventer": "meta.jamais_inventer",
    "1948.26 action proposée": "meta.action",
    "1948.27 assertion de test": "assertion",
    "1948.28 priorité et fréquence terrain": "meta.priorite_terrain",
}


def _champs_absents(champs: dict[str, str], item: Canonique) -> list[str]:
    """Les champs de #1948 qu'un scénario ne porte PAS, chez leur propriétaire
    DÉCLARÉ — pas « quelque part » : un `hasattr` lâche laisserait passer un
    champ déménagé de `Meta` vers la vue, qui est un changement de schéma."""
    absents: list[str] = []
    for intitule, chemin in champs.items():
        porteur, _, attribut = chemin.partition("meta.")
        cible, nom = (item.meta, attribut) if chemin.startswith("meta.") else (item, porteur)
        if nom not in getattr(cible, "_fields", ()) and not isinstance(getattr(type(cible), nom, None), property):
            absents.append(intitule)
    return absents


def test_the_seventeen_fields_of_1948_all_exist_on_every_scenario() -> None:
    """#1948 — dix-sept champs demandés, dix-sept portés. Un champ retiré du
    schéma fait tomber ce test, au lieu de disparaître en silence."""
    assert len(CHAMPS_DE_1948) == 17, f"#1948 demande dix-sept champs, la table en porte {len(CHAMPS_DE_1948)}"
    assert len(CORPUS) >= 100, f"corpus tronqué : {len(CORPUS)} scénarios"
    manquants = {item.identifiant: absents for item in CORPUS if (absents := _champs_absents(CHAMPS_DE_1948, item))}
    assert not manquants, f"des scénarios ne portent pas les dix-sept champs de #1948 : {manquants}"


def test_the_seventeen_fields_guard_knows_how_to_say_no_and_checks_the_right_owner() -> None:
    """Preuves n°1 et n°3 — elle sait dire NON, et elle cherche chaque champ
    chez SON propriétaire, pas « quelque part »."""
    item = CORPUS[0]
    assert _champs_absents({"inventé": "pas_un_champ"}, item) == ["inventé"]
    # `identifiant` existe — sur la VUE, pas sur `Meta` : le mauvais
    # propriétaire est un manque, sinon la garde épinglerait n'importe quoi.
    assert _champs_absents({"mauvais propriétaire": "meta.identifiant"}, item) == ["mauvais propriétaire"]
    # Les trois formes légitimes : champ de la vue, champ de `Meta`, dérivation.
    assert _champs_absents({"a": "identifiant", "b": "meta.moment", "c": "cout"}, item) == []


# ── 13. #2443.5 (#2899) — L'ANNOTATION PAR CAS DU FUTUR GATE CHAT ────────────
#
# #2899 (Console/Plateforme d'évaluation conversationnelle) demande un schéma
# d'annotation par cas : input, outils attendus/interdits, hard failures,
# poids. L'input et l'outil attendu sont déjà les 17 champs ci-dessus ; ce qui
# suit exerce les trois DÉRIVATIONS neuves (`hard_failures`, `poids`,
# `outils_interdits`) contre le corpus RÉEL — le premier appelant de ces
# propriétés, en dehors de leur propre définition.


def test_hard_failures_de_maps_only_documented_jamais_inventer_pairs() -> None:
    """Preuve qu'elle sait dire NON : une règle sans paire documentée
    (`COUT`, ici) ne rend rien plutôt qu'un rapprochement inventé."""
    assert hard_failures_de((JamaisInventer.PROBABILITE,)) == (ChatHardFailure.PROBABILITY_DISPLAYED,)
    assert hard_failures_de((JamaisInventer.COUT,)) == ()
    assert hard_failures_de(()) == ()
    # Sans doublon, même si deux règles pointent vers le même hard failure.
    assert hard_failures_de((JamaisInventer.RESULTAT, JamaisInventer.RESULTAT)) == (ChatHardFailure.FABRICATED_RESULT,)


def test_poids_de_is_one_plus_the_real_credit_stake_never_invented() -> None:
    _action, credits_du_tour = cout_de(None)
    assert credits_du_tour == 0  # `copilot_message` est gratuit — la base « +1 » évite un poids nul.
    assert poids_de(None) == 1
    _action, credits_de_l_analyse = cout_de("start_account_analysis")
    assert poids_de("start_account_analysis") == 1 + credits_de_l_analyse > 1


def test_outils_interdits_de_forbids_spending_without_accord() -> None:
    """Preuve qu'elle sait dire NON : hors lancement après accord, TOUT outil
    de dépense est interdit — l'outil du scénario lui-même excepté."""
    assert outils_interdits_de(Action.QUESTION, None) == tuple(sorted(SPENDING_TOOLS))
    assert outils_interdits_de(Action.LANCEMENT_APRES_ACCORD, "start_account_analysis") == ()
    assert "start_account_analysis" not in outils_interdits_de(Action.CARTE_A_VALIDER, "start_account_analysis")


def test_every_scenario_of_the_corpus_carries_a_self_consistent_annotation() -> None:
    """Le premier appelant réel contre les 100+ scénarios versionnés : chaque
    annotation dérivée doit rester cohérente avec le scénario qui la porte."""
    incoherents: dict[str, str] = {}
    for item in CORPUS:
        if item.poids < 1:
            incoherents[item.identifiant] = f"poids {item.poids} < 1"
        elif item.outil in item.outils_interdits:
            incoherents[item.identifiant] = "son propre outil figure dans ses outils interdits"
        elif any(hf not in ChatHardFailure for hf in item.hard_failures):
            incoherents[item.identifiant] = f"hard failure hors taxonomie : {item.hard_failures}"
    assert not incoherents, f"annotations #2443.5 incohérentes : {incoherents}"


def test_a_meaningful_share_of_the_corpus_already_carries_a_named_hard_failure() -> None:
    """Un plancher, pas un plafond : la dérivation doit couvrir une part
    réelle du corpus dès aujourd'hui, sans qu'un seul scénario écrit à la main
    ait été ajouté pour ce chantier — sinon #2443.5 resterait un schéma vide."""
    couverts = sum(1 for item in CORPUS if item.hard_failures)
    assert couverts >= 20, f"seulement {couverts}/{len(CORPUS)} scénarios portent un hard failure nommé"


# ── 14. #2443.2 (#2899) — CORPUS MULTI-SOURCE : LES NEUF SOURCES NOMMÉES ─────
#
# #2443 (« CORPUS DE BASE ») demande neuf sources versionnées : les 100
# requêtes préparées, trois exports conversationnels réels, leurs
# corrections, des requêtes projetées, les retours Antoine, les cas
# SalesConnect, des corpus historiques, des conversations support validées,
# des erreurs production anonymisées.
#
# Décision Louis 27/09/2026 : le corpus est fait de cas ANONYMISÉS ou
# SYNTHÉTIQUES, étiquetés comme tels — jamais une donnée client réelle, jamais
# un cas fictif présenté comme réel. Ce dépôt ne contient ni export
# conversationnel réel, ni retour nominatif d'Antoine, ni erreur de
# production : les inventer serait exactement la faute que la décision
# interdit. Même discipline que `demo-coverage.ts` (craft rule n°9, CLAUDE.md) :
# chaque source est SOIT peuplée (au moins un cas au corpus), SOIT vide À
# DESSEIN avec sa raison écrite — jamais un silence, et ne JAMAIS déplacer une
# entrée vers « vide à dessein » juste pour faire passer la garde.


class SourceSpec(NamedTuple):
    populated: bool
    reason: str


SOURCE_SPECS: dict[Source, SourceSpec] = {
    Source.REQUETES_PREPAREES: SourceSpec(
        populated=True,
        reason="le corpus canonique lui-même (`CORPUS`, ce fichier) : 100+ scénarios écrits par l'équipe.",
    ),
    Source.EXPORTS_CONVERSATIONNELS: SourceSpec(
        populated=False,
        reason=(
            "aucun export conversationnel réel n'est versionné dans ce dépôt — l'inventer serait "
            "un cas fictif présenté comme réel (décision Louis 27/09/2026)."
        ),
    ),
    Source.CORRECTIONS: SourceSpec(
        populated=False,
        reason="dépend des exports conversationnels réels ci-dessus, eux-mêmes absents du dépôt.",
    ),
    Source.REQUETES_PROJETEES: SourceSpec(
        populated=False,
        reason=(
            "« non exécutées mais projetées » suppose la liste projetée elle-même, non versionnée "
            "dans ce dépôt à ce jour."
        ),
    ),
    Source.RETOURS_ANTOINE: SourceSpec(
        populated=False,
        reason="retour nominatif d'une personne — aucune trace écrite versionnée dans ce dépôt à ce jour.",
    ),
    Source.CAS_SALESCONNECT: SourceSpec(
        populated=False,
        reason="aucun cas SalesConnect versionné dans ce dépôt à ce jour.",
    ),
    Source.CORPUS_HISTORIQUES: SourceSpec(
        populated=False,
        reason="« historiques » suppose un corpus antérieur au sien — aucun n'est cité ailleurs dans le dépôt.",
    ),
    Source.CONVERSATIONS_SUPPORT: SourceSpec(
        populated=False,
        reason="aucune conversation support validée versionnée dans ce dépôt à ce jour.",
    ),
    Source.ERREURS_PRODUCTION: SourceSpec(
        populated=False,
        reason=(
            "l'échantillonnage production (#2443.10 / #2899) est un opt-in par espace côté API "
            "(`chat_eval_samples`, 90 jours) : ses lignes restent en base, jamais versionnées — rien à lire ici."
        ),
    ),
}


def test_every_source_of_2443_has_exactly_one_fiche() -> None:
    assert set(SOURCE_SPECS) == set(Source), "chaque source du CORPUS DE BASE doit avoir sa fiche, ni plus ni moins"


def test_every_populated_source_has_at_least_one_case_and_every_empty_one_has_none() -> None:
    """Le miroir exact de `demo-coverage.spec.ts` (craft rule n°9), pour le
    corpus de chat plutôt que pour un écran : une fiche ment si elle dit
    peuplée sans cas, ou vide alors qu'un cas la porte déjà."""
    for source, spec in SOURCE_SPECS.items():
        cas = [item for item in CORPUS if item.meta.source == source]
        if spec.populated:
            assert cas, f"source « {source.value} » déclarée peuplée mais 0 cas au corpus"
        else:
            assert not cas, (
                f"source « {source.value} » déclarée vide mais {len(cas)} cas au corpus — "
                "met à jour SOURCE_SPECS (populated=True)"
            )


def test_every_empty_source_names_a_real_reason() -> None:
    """Une raison qui tiendrait pour n'importe quelle source ne dit rien —
    plancher de longueur, pas une preuve suffisante à elle seule, mais assez
    pour attraper un `reason=""` ou un `reason="TODO"`."""
    for source, spec in SOURCE_SPECS.items():
        if not spec.populated:
            assert spec.reason and len(spec.reason) >= 30, f"source « {source.value} » vide sans raison écrite"


def test_every_case_of_the_corpus_names_its_provenance() -> None:
    """Décision Louis 27/09/2026 : chaque cas est étiqueté synthétique ou
    anonymisé — jamais un troisième statut deviné."""
    for item in CORPUS:
        assert item.meta.provenance in Provenance, f"{item.identifiant} : provenance absente ou hors énumération"


def test_no_case_is_anonymised_without_being_derived_from_a_populated_real_source() -> None:
    """Un cas ANONYMISÉ prétend dériver d'un événement réel — il ne peut donc
    porter QUE l'une des sources que `SOURCE_SPECS` reconnaît, jamais la
    source par défaut « requêtes préparées » (qui est, par construction,
    SYNTHÉTIQUE : écrite à la main)."""
    offenders = [
        item.identifiant
        for item in CORPUS
        if item.meta.provenance == Provenance.ANONYMISE and item.meta.source == Source.REQUETES_PREPAREES
    ]
    assert not offenders, f"cas marqués ANONYMISÉ mais source « requêtes préparées » (SYNTHÉTIQUE) : {offenders}"
