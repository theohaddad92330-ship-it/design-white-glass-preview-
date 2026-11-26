"""#2899 (#2443.7) — LE GATE CI DÉDIÉ AU CHAT, DISTINCT DU GATE DOSSIER.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
``app.eval.gate`` (le gate DOSSIER) rejoue le banc de qualité des dossiers
d'analyse (huit métriques déterministes, ``baseline.json``) quand la surface
prompts change — mais SA surface (``apps/ia/app/prompts/`` en entier, plus
quelques modules de scoring) couvre ``bellum_advisor.py`` en bloc avec tous
les autres prompts, et SON bench ne rejoue jamais les sept suites
déterministes du chat ni ne mesure la couverture des hard failures (#2899).
Sept suites (``test_copilote_*_eval.py``) bloquaient déjà le pytest CI
(rouge = CI rouge, confirmé par cinq lots précédents), mais AUCUNE n'était
un GATE DÉDIÉ avec une baseline versionnée — c'est le trou que ce module
comble : « le script ``eval:gate`` doit devenir la porte commune » (LAU-FINAL-157)
pour le CHAT spécifiquement, avec sa PROPRE surface, plus étroite et plus
précise que celle du gate dossier.

Deux enforcements, dans l'ordre :

1. **Les suites déterministes du chat restent vertes.** Rejouées ici
   explicitement (pas seulement « quelque part dans le pytest CI ») — un
   gate qui ne rejoue rien à son propre nom ne peut jamais dire QUEL
   changement l'a fait échouer.
2. **La couverture des hard failures ne régresse jamais.** ``Canonique.
   hard_failures`` (#2443.5) dérive, pour chaque scénario canonique du
   corpus, les ``ChatHardFailure`` (#2899/#2443.6) que sa règle
   ``jamais_inventer`` garde déjà. La baseline committée
   (``chat_gate_baseline.json``) fige l'ensemble couvert AUJOURD'HUI ; ce
   gate échoue si un changement en retire un — jamais un score moyen qui
   masquerait une régression P0 (même philosophie que le gate dossier).
   ⚠️ Cette couverture n'est PAS « tout ce que le dépôt teste » : elle ne lit
   QUE l'annotation dérivée du corpus. ``VENDOR_NAMED``, par exemple, est
   gardé ailleurs (``test_copilote_prompt_blocks.py``,
   ``test_no_vendor_name_reaches_the_system_prompt``) et n'entre jamais dans
   ``Canonique.hard_failures`` (aucune règle ``JamaisInventer`` ne s'y
   rapproche directement) — ce gate ne prétend pas le mesurer, et ne doit
   jamais être lu comme substituant les gardes dédiées.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche)
─────────────────────────────────────────────────────────────────────────────
Le canary (cohortes internes, démo, shadow mode) et l'échantillonnage
production anonymisé (#2443.9/.10) restent absents — aucune infrastructure de
trafic réel ou de rollout progressif n'existe pour les porter, et en
inventer une pour ce lot serait la façade que la doctrine interdit. Le
tableau de pilotage par version (#2443.11) dépend lui-même du canary. Ce
module ne les simule pas.

Usage (depuis ``apps/ia``)::

    python -m app.eval.chat_gate                     # diff vs origin/main, skip ou gate
    python -m app.eval.chat_gate --base origin/main   # base explicite
    python -m app.eval.chat_gate --force              # rejoue sans détection de diff
    python -m app.eval.chat_gate --update-baseline    # fige la couverture actuelle

Ou depuis la racine du dépôt : ``pnpm eval:gate:chat``.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.eval.chat_corpus_sources import load_prepared_requests_corpus
from app.eval.gate import DEFAULT_BASE_REF, REPO_ROOT, changed_files_vs

#: La surface CHAT — des FICHIERS précis (pas de préfixe de dossier comme le
#: gate dossier) : chacun change soit le comportement conversationnel de
#: Laura, soit l'annotation qui garde ce comportement. ⚠️ Volontairement
#: DISJOINTE de `apps/ia/app/prompts/` en bloc (le gate dossier la couvre
#: déjà pour `bellum_advisor.py`) — ce gate ajoute ce que le gate dossier ne
#: rejoue jamais : les suites du CHAT et la couverture des hard failures.
CHAT_PROMPT_SURFACE: tuple[str, ...] = (
    "apps/ia/app/prompts/bellum_advisor.py",
    "apps/ia/app/services/laura_router.py",
    "apps/ia/app/services/chat_tools.py",
    "apps/ia/app/services/chat_orchestrator.py",
    "apps/ia/app/services/chat_model_routing.py",
    "apps/ia/app/services/chat_turn_plan.py",
    "apps/ia/app/services/chat_content_guards.py",
    "apps/ia/app/services/commercial_verifier.py",
    "apps/ia/app/eval/chat_hard_failures.py",
    "apps/ia/app/eval/chat_corpus_sources.py",
    "apps/ia/tests/copilote_scenario_metadata.py",
    # #3443.4 — modifier le dialogue golden rejoue le gate.
    "apps/ia/tests/test_dialogue_golden_3443.py",
    # #3422 — le jeu de tests métier de référence : modifier un profil ou son
    # comportement attendu rejoue le gate.
    "apps/ia/tests/business_reference_set.py",
    # #2547 / #2533 (recette prod 07/10) — lire la fiche avant de répondre.
    "apps/ia/app/services/account_read_first.py",
    "apps/ia/app/services/compilers/account_preflight.py",
    # #3219 (#190.2 côté contact) — la description du contrôle avant action d'un contact.
    "apps/ia/app/services/compilers/contact_preflight.py",
)

#: Les suites déterministes du chat — sept eval + le corpus canonique, la
#: garde de vocabulaire, la garde de contenu et le socle du routeur. Chemins
#: relatifs à ``apps/ia`` (arguments pytest).
CHAT_EVAL_SUITES: tuple[str, ...] = (
    "tests/test_copilote_scope_eval.py",
    "tests/test_copilote_security_eval.py",
    "tests/test_copilote_ask_before_answering_eval.py",
    "tests/test_copilote_truth_levels_eval.py",
    "tests/test_copilote_market_memory_eval.py",
    # #3222.2 (#3197) — le corpus des cinq groupes de comptes.
    "tests/test_copilote_five_accounts_eval.py",
    "tests/test_copilote_unknown_request_eval.py",
    "tests/test_copilote_verdict_card_eval.py",
    # #3335, #3336, #3337, #3338, #3339 (30/09) — cinq gardes de prompt
    # ajoutées par un lot précédent (commit bfd71f3) sans jamais entrer dans
    # cette liste : jusqu'ici bloquantes pour le pytest CI complet, mais pas
    # pour CE gate dédié (baseline versionnée, rejeu explicite sur diff de la
    # surface chat). test_every_copilote_eval_suite_is_gated (test_chat_gate.py)
    # échoue si une future suite test_copilote_*_eval.py est de nouveau oubliée
    # ici. laura_data_unknown / laura_source_priority avaient le même trou,
    # antérieur à ce lot — corrigé au passage par la même garde.
    "tests/test_copilote_need_freshness_eval.py",
    "tests/test_copilote_per_item_provenance_eval.py",
    "tests/test_copilote_association_coherence_eval.py",
    "tests/test_copilote_opportunity_vocabulary_eval.py",
    "tests/test_copilote_search_scope_exclusion_eval.py",
    "tests/test_copilote_data_unknown_eval.py",
    "tests/test_copilote_source_priority_eval.py",
    "tests/test_copilote_scenario_corpus.py",
    "tests/test_copilote_prompt_blocks.py",
    "tests/test_chat_hard_failures.py",
    "tests/test_chat_content_guards.py",
    "tests/test_commercial_verifier.py",
    "tests/test_chat_corpus_sources.py",
    "tests/test_laura_router.py",
    "tests/test_chat_turn_plan.py",
    # #3221, #206.9 — comparaison avec méthode / sans méthode / générique :
    # une décision plus précise, jamais seulement davantage de texte.
    "tests/test_chat_method_decisiveness.py",
    # #3221, #206.3/#206.4 — les seize packs méthode nommés et leur schéma.
    "tests/test_method_packs.py",
    # #3391.5 (retour bêta 30/09, LOT C06) — garde de prompt pour les
    # garde-fous de recommandation de Laura.
    "tests/test_copilote_recommendation_guardrails_eval.py",
    # #3396 — matrice de comportement selon les données et outils disponibles.
    "tests/test_copilote_data_availability_matrix_eval.py",
    # #3443.4 (tranché sans Louis, 03/10) — le dialogue d'appel à froid « Martin »
    # (Responsable Data) est un cas REJOUÉ par ce gate, sans appel de modèle : le
    # texte verbatim et ses cinq objectifs structurels (refus repris, aucun
    # rendez-vous forcé, cadre achat respecté, refus accueilli, dernière action
    # proportionnée) sont verrouillés par un fichier qui sait dire NON.
    "tests/test_dialogue_golden_3443.py",
    # #3422 — les vingt-et-un profils métier de référence et leurs preuves.
    "tests/test_business_reference_set.py",
    # #3390.10/.11 — la méthode retenue par le moteur serveur entre dans le prompt.
    "tests/test_commercial_method_prompt.py",
    # #2547 / #2533 (recette prod 07/10, démo Ludovic & François) — Arquus
    # (signaux datés et sourcés), UNEO (la DSI en clair), BFC (zone + type +
    # livrable sans recadrage, N contacts par entreprise, région nommée).
    "tests/test_account_read_first.py",
    "tests/test_chat_account_contacts_tool.py",
    "tests/test_geo_labels.py",
    # #4464 — crédits implicites : Laura ne dit jamais un coût, un solde ni un crédit (prompts,
    # descriptions d'outils, résultats lus par le modèle) — un « crédit » qui revient fait échouer la porte.
    "tests/test_laura_no_money_4464.py",
)

BASELINE_PATH = Path(__file__).resolve().parent / "chat_gate_baseline.json"


def is_chat_surface_path(path: str) -> bool:
    """True quand ``path`` (relatif à la racine du dépôt, format git) est un
    des fichiers de la surface chat."""
    return path.replace("\\", "/") in CHAT_PROMPT_SURFACE


def chat_surface_changes(files: list[str]) -> list[str]:
    """Le sous-ensemble de ``files`` sur la surface chat, trié."""
    return sorted({f for f in files if is_chat_surface_path(f)})


def _run_suites() -> int:
    """Les suites déterministes du chat, en sous-processus pytest — hermétique
    (fixtures et corpus committés, aucun appel réseau ni Claude)."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", *CHAT_EVAL_SUITES],
        cwd=REPO_ROOT / "apps" / "ia",
    )
    return result.returncode


def _hard_failure_coverage() -> tuple[int, frozenset[str]]:
    """Combien de scénarios canoniques, et quels ``ChatHardFailure`` leur
    annotation dérivée (#2443.5) couvre. ``load_prepared_requests_corpus``
    (chargement PAR CHEMIN, GA-193 : jamais un ``from tests...`` dans
    ``app/**``) reste aussi léger que l'ancien import tardif — rien n'est payé
    tant qu'aucun gate ne tourne réellement (même discipline que
    ``gate._run_bench``)."""
    corpus = load_prepared_requests_corpus()
    covered: set[str] = set()
    for item in corpus:
        covered.update(failure.value for failure in item.hard_failures)
    return len(corpus), frozenset(covered)


def _load_baseline(baseline_path: Path | None = None) -> dict[str, Any]:
    path = baseline_path or BASELINE_PATH
    return json.loads(path.read_text(encoding="utf-8"))


def check_hard_failure_coverage(baseline_path: Path | None = None) -> tuple[bool, str]:
    """``(ok, message)`` — ``ok`` est faux si la couverture RÉGRESSE vs la
    baseline committée (un hard failure qui perd son dernier scénario) ou si
    le corpus a fondu. Une couverture qui AUGMENTE ne fait jamais échouer :
    seule une régression P0 masquée est le risque que ce gate refuse."""
    count, covered = _hard_failure_coverage()
    baseline = _load_baseline(baseline_path)
    baseline_covered = set(baseline["covered_hard_failures"])
    lost = sorted(baseline_covered - covered)
    if lost:
        return False, (
            f"RÉGRESSION — plus aucun scénario canonique ne couvre : {lost} (baseline : {sorted(baseline_covered)})"
        )
    if count < baseline["corpus_scenario_count"]:
        return False, f"le corpus a fondu : {count} scénarios (baseline : {baseline['corpus_scenario_count']})"
    return True, f"couverture OK — {len(covered)} hard failure(s) couvert(s), {count} scénarios canoniques"


def update_baseline(baseline_path: Path | None = None) -> None:
    """Fige la couverture ACTUELLE — jamais pour masquer une régression,
    seulement après un changement INTENTIONNEL de l'annotation ou du corpus."""
    count, covered = _hard_failure_coverage()
    path = baseline_path or BASELINE_PATH
    data = _load_baseline(path)
    data["covered_hard_failures"] = sorted(covered)
    data["corpus_scenario_count"] = count
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run_gate(
    base_ref: str = DEFAULT_BASE_REF,
    *,
    force: bool = False,
    changed: list[str] | None = None,
    baseline_path: Path | None = None,
) -> int:
    """Code de sortie : 0 = skip ou gate vert, 1 = suite rouge ou régression."""
    if not force:
        if changed is None:
            changed = changed_files_vs(base_ref)
        if changed is None:
            print(
                "chat eval gate: git indisponible — impossible de prouver que la surface chat "
                "est inchangée → bench fail-safe (hermétique, quelques secondes)"
            )
        else:
            hits = chat_surface_changes(changed)
            if not hits:
                print(f"chat eval gate: SKIP — aucun fichier de la surface chat modifié vs {base_ref}")
                return 0
            print(f"chat eval gate: surface chat modifiée vs {base_ref} ({len(hits)} fichier(s)):")
            for f in hits:
                print(f"  - {f}")
    else:
        print("chat eval gate: --force → bench sans détection de diff")

    print(f"chat eval gate: replay de {len(CHAT_EVAL_SUITES)} suite(s) déterministe(s) chat (offline)…")
    suite_rc = _run_suites()
    if suite_rc != 0:
        print("chat eval gate: ÉCHEC — au moins une suite déterministe chat est rouge")
        return 1

    ok, message = check_hard_failure_coverage(baseline_path=baseline_path)
    print(f"chat eval gate: {message}")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description=(
            "Gate CI dédié au chat — rejoue les suites déterministes du chat et vérifie la "
            "couverture des hard failures quand la surface chat a changé vs la base."
        )
    )
    p.add_argument("--base", default=DEFAULT_BASE_REF, help=f"Base git ref (défaut : {DEFAULT_BASE_REF}).")
    p.add_argument("--force", action="store_true", help="Rejoue le bench sans détection de diff.")
    p.add_argument(
        "--update-baseline",
        action="store_true",
        help="Fige la couverture ACTUELLE comme nouvelle baseline (après un changement intentionnel).",
    )
    args: Any = p.parse_args(argv)
    if args.update_baseline:
        update_baseline()
        print(f"chat eval gate: baseline mise à jour → {BASELINE_PATH}")
        return 0
    return run_gate(args.base, force=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
