"""Les règles de DISCIPLINE commerciale, côté Python — et la garde qui les tient.

## Le trou que ce fichier ferme

Les onze règles de méthode gardées et les sept interdits sont distillés depuis des
mois dans ``packages/contracts/src/knowledge/method-delta.ts``. Ils étaient
écrits, testés — et sans **aucun appelant applicatif** : aucun prompt ne les
portait, le copilote ne les avait jamais vues. Ce module les porte côté Python
pour qu'elles deviennent une quatrième source du corpus citable
(``app/services/method_knowledge.py``), au même titre que les objections, les
playbooks sectoriels et le registre de règles métier.

## Ce que ce n'est PAS

Ce n'est pas un doublon de ``app/knowledge/business_rules.py`` : ce registre-là
porte dix règles de **SCORING** (``account_fit_score_25``, ``no_go_sectors``…).
Ici, ce sont onze règles de **DISCIPLINE commerciale**. Aucun recouvrement — et
le test ``test_aucun_recouvrement_avec_le_registre_de_scoring`` l'exige.

## La seconde vérité qu'on refuse de créer

« Le fil achats est distinct du fil métier » est DÉJÀ tenue par
``app/services/purchasing_thread.py`` (bloc ``THREAD ACHATS`` injecté dans le
prompt de plan par ``app/routers/phase4_plan.py``). Ce qui manquait était son
ÉNONCÉ, pas son application. La règle porte donc un ``applied_by`` qui POINTE
vers cette implémentation au lieu de la refaire, et
``test_un_applied_by_declare_existe_sur_le_disque`` fait rougir la CI si le
chemin disparaît — le motif de GA-38.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.knowledge.method_rules import METHOD_REFUSALS, METHOD_RULES

# ``app/knowledge/method_rules.py`` → parents[1] = tests/ → parents[1] de ce
# fichier-ci = apps/ia. Les ``applied_by`` sont relatifs à cette racine.
_IA_ROOT = Path(__file__).resolve().parents[1]


# ── La preuve que ces tests LISENT quelque chose ──────────────────────────────


def test_le_corpus_de_regles_nest_pas_vide() -> None:
    """Sans ces bornes, tout ce qui suit serait vrai par vacuité.

    Une liste vidée, tronquée ou renommée rendrait chaque ``for`` ci-dessous
    sans itération et chaque ``all()`` trivialement vrai. Ces deux comptes-là ne
    peuvent pas se vider sans qu'un test rougisse.
    """
    assert len(METHOD_RULES) == 11, f"onze règles gardées attendues, {len(METHOD_RULES)} trouvées"
    assert len(METHOD_REFUSALS) == 7, f"sept interdits attendus, {len(METHOD_REFUSALS)} trouvés"


def test_chaque_entree_porte_un_identifiant_et_un_enonce() -> None:
    for rule in METHOD_RULES + METHOD_REFUSALS:
        assert re.fullmatch(r"[a-z0-9_]+", rule.id), rule.id
        # Un énoncé est une PHRASE, pas une étiquette : la règle est écrite, pas
        # paraphrasée à chaque usage.
        assert len(rule.statement.strip()) > 20, rule.id
        assert rule.statement.strip().endswith("."), rule.id


def test_les_identifiants_sont_uniques() -> None:
    ids = [rule.id for rule in METHOD_RULES + METHOD_REFUSALS]
    assert len(ids) == len(set(ids)), sorted({i for i in ids if ids.count(i) > 1})


# ── Ce que la doctrine interdit d'écrire dans une règle ───────────────────────


def test_aucune_regle_gardee_ne_porte_de_nombre_fixe() -> None:
    """C'est le premier des sept refus — il vaut aussi pour ce fichier."""
    interdit = re.compile(r"\b\d+\s*(contacts?|messages?|appels?|jours?)\b")
    for rule in METHOD_RULES:
        assert not interdit.search(rule.statement), rule.id


def test_aucun_nom_dediteur_dans_un_enonce() -> None:
    """On nomme la CAPACITÉ, jamais l'éditeur — ces énoncés partent dans un prompt.

    C'est d'ailleurs le sixième refus, écrit en toutes lettres : « Le nom d'un
    fournisseur technique dans l'application. »
    """
    editeurs = (
        "linkedin", "hubspot", "salesforce", "pipedrive", "attio", "apollo",
        "gmail", "outlook", "notion", "slack", "anthropic", "openai",
    )
    for rule in METHOD_RULES + METHOD_REFUSALS:
        folded = rule.statement.lower()
        for nom in editeurs:
            assert nom not in folded, f"{rule.id} nomme « {nom} »"


def test_aucune_probabilite_dans_un_enonce() -> None:
    """Refusé six fois : pas de « chance de closing », pas de prévisionnel pondéré."""
    for rule in METHOD_RULES + METHOD_REFUSALS:
        folded = rule.statement.lower()
        for mot in ("probabilit", "chance de", "% de closing", "taux de conversion"):
            assert mot not in folded, f"{rule.id} porte « {mot} »"


# ── L'énoncé POINTE vers l'implémentation, il ne la refait pas ────────────────


def test_un_applied_by_declare_existe_sur_le_disque() -> None:
    """Le motif de GA-38 : un chemin déclaré doit exister.

    Sans ce test, un ``applied_by`` survivrait au déplacement du service qu'il
    désigne et l'énoncé recommencerait à flotter au-dessus de rien.
    """
    declares = [(r.id, p) for r in METHOD_RULES for p in r.applied_by]
    assert declares, "aucune règle ne pointe vers son implémentation — la garde ne lirait rien"
    for rule_id, chemin in declares:
        assert (_IA_ROOT / chemin).is_file(), f"{rule_id} → {chemin} introuvable"


def test_le_fil_achats_pointe_vers_le_service_qui_le_tient_deja() -> None:
    """La règle existait en CODE avant d'exister en TEXTE. On n'en fait pas deux.

    ``purchasing_thread.py`` construit déjà le fil achats à part du reste des
    signaux et l'injecte comme son propre bloc ``THREAD ACHATS``. Ce test exige
    que l'énoncé le DÉSIGNE plutôt que de rouvrir un second chemin.
    """
    regle = next(r for r in METHOD_RULES if "fil achats" in r.statement)
    assert "app/services/purchasing_thread.py" in regle.applied_by
    source = (_IA_ROOT / "app/services/purchasing_thread.py").read_text(encoding="utf-8")
    assert "THREAD ACHATS" in source, "le bloc que l'énoncé désigne a disparu du service"


def test_un_interdit_ne_declare_jamais_dimplementation() -> None:
    """Un interdit est une ABSENCE de code. Rien ne peut « l'appliquer »."""
    for refus in METHOD_REFUSALS:
        assert refus.applied_by == (), refus.id


# ── Ce n'est pas un doublon du registre de scoring ────────────────────────────


def test_aucun_recouvrement_avec_le_registre_de_scoring() -> None:
    """``business_rules.py`` porte du SCORING, ce module porte de la DISCIPLINE.

    Deux registres qui se recouvriraient rendraient la même règle citable sous
    deux titres, avec deux formulations qui divergeraient à la première retouche.
    """
    from app.knowledge.business_rules import all_rules

    scoring = {r.id for r in all_rules()}
    discipline = {r.id for r in METHOD_RULES + METHOD_REFUSALS}
    assert scoring, "le registre de scoring est vide — la comparaison ne prouverait rien"
    assert discipline & scoring == set()
