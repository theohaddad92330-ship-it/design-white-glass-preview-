"""Corpus de non-régression multi-persona — golden set (#2070 / #2085).

# 2070 / #2085 — POURQUOI UN SEUL CORPUS, ET PAS DEUX
------------------------------------------------------
#2070 (« corpus de non-régression multi-persona, 15 cas ») et #2085 (« rejouer
les quinze audits de référence ») demandent le même artefact : un jeu de
référence pour l'onboarding (`OnboardingAnswers` → `ProfileContext`, le seul
« audit » que le service IA produit pour une ESN, par opposition à l'audit
d'une entreprise CIBLE). Traitées séparément, deux corpus auraient divergé.
Celui-ci répond aux deux issues.

CE QUI EST REJOUÉ, ET COMMENT (offline, hermétique — comme `app/eval/gate.py`)
-------------------------------------------------------------------------
`ProfilerAgent` appelle Claude : son résultat n'est pas reproductible sans
réseau ni clé API, et cette suite n'en pose aucune (`EMBEDDING_API_KEY` inclus
— jamais posée ici). Comme le golden set voisin de `app/eval/` (fixtures
d'analyse committées, rejouées par des métriques déterministes, JAMAIS
d'appel Claude en CI), ce corpus committe 16 RÉFÉRENCES (`answers` +
`referenceProfile`, hand-authored) et les REJOUE à travers des vérifications
déterministes : validité de schéma contre le VRAI code (`OnboardingAnswers`,
`ProfileContext`, importés en lecture seule — jamais copiés), et la doctrine
du CLAUDE.md. Ce n'est pas un remplacement du golden set `app/eval/`
(company research) : ce corpus couvre le PROFILER, périmètre non couvert au
14/09/2026 (`grep -rn "golden" apps/ia/app apps/ia/tests` ne rendait rien côté
onboarding avant ce lot).

MAPPAGE DU VOCABULAIRE DE L'ISSUE VERS DES CHAMPS RÉELS
--------------------------------------------------------
#2070 demande, par cas : « réponses ; audit attendu ; contradictions ;
priorités ; interdits ; configuration produit ; limites. » Un retour est un
SYMPTÔME, pas une spécification, même à l'impératif — donc pas de champ JSON
littéral « interdits » recopié 16 fois : les interdits sont UNIVERSELS
(doctrine CLAUDE.md), pas persona-spécifiques, et vivent ici, une fois :

* réponses              → `answers` (valide contre le VRAI `OnboardingAnswers`)
* audit attendu          → `referenceProfile` (valide contre le VRAI `ProfileContext`)
* priorités               → `referenceProfile.idealAccountProfile.sectorsPriority`
                            + `coachingInsights` (champs RÉELS du schéma, pas dupliqués)
* configuration produit  → `referenceProfile.analysisParameters`
                            + `referenceProfile.idealAccountProfile` (idem)
* interdits              → contrôles doctrine ci-dessous, appliqués aux 16 cas :
                            aucune probabilité (c26), aucun critère protégé (c58),
                            aucun nom de fournisseur, aucune suggestion d'entreprise
                            non résolue, aucun secteur inventé, KPI réalistes.
* contradictions / limites → champs `contradictions` / `limits` du fixture :
                            le SEUL vocabulaire de l'issue qui n'a pas d'équivalent
                            dans `ProfileContext` (le schéma n'a pas de détecteur de
                            contradiction dans les réponses) ; annotation humaine du
                            cas de référence, pas une valeur que le guard recalcule.

Ce que #2085 demande d'assertions GOLDEN et où ça atterrit ici :
* « aucune donnée inventée »                → toutes les vérifications ci-dessous
* « aucune suggestion d'entreprise non résolue » → firstAnalysisSuggestions == []
* « inconnues préservées »                  → sectorsPriority ⊆ target_sectors
* « plan réaliste »                         → KPI dans la plage documentée par archétype
* « version traçable »                      → champ `_source` obligatoire et non vide
* « pas de génération multiple »            → `id` unique par cas (pas de doublon)
* « unités comparables »                    → NON couvert ici : c'est `bellum_compare`
  (comparaison d'entreprises), un endpoint distinct du profiler. Forcer cette
  assertion dans ce corpus serait lire une spécification dans un symptôme.

CE QUI EXISTE DÉJÀ ET N'EST PAS REDOUBLÉ
------------------------------------------
`pnpm eval:gate` (`app/eval/gate.py`, job « Eval gate (golden set) » de la CI)
gate déjà le golden set de RECHERCHE D'ENTREPRISE (thales/doctolib/decathlon/
société-générale/sncf) sur 8 métriques déterministes. Ce fichier ne touche à
rien de ce système : périmètre distinct (profiler, pas research), aucun import
partagé, aucune modification de `app/eval/` ni de la configuration CI.

TROIS PREUVES, EXPLICITEMENT
------------------------------
1. SAIT DIRE NON : `test_guard_catches_*` — chaque détecteur est appelé sur une
   copie volontairement cassée et DOIT lever/échouer.
2. LIT QUELQUE CHOSE : `test_corpus_is_not_empty` — un corpus vide ne peut pas
   faire échouer les tests paramétrés qui suivent (silencieusement 0 cas).
3. N'ATTRAPE PAS CE QU'ELLE NE VISE PAS : `test_legitimate_*` — un taux de
   conversion en `%`, le mot « score », « city »/« country » (granularité license
   par la doctrine) restent verts.

Espèces de garde borgne déjà payées dans ce dépôt, évitées ici : `re.search`
sans le drapeau `g` (donc pas de piège stateful) ; le détecteur de critères
protégés lit les CLÉS JSON BRUTES avant tout parsing Pydantic — parser d'abord
aurait laissé passer une clé interdite que Pydantic ignore silencieusement
(`extra` non `forbid` sur `_CamelModel`, cf. mémoire « pydantic avale le champ
ajouté au prompt ») ; aucune liste découpée sans retirer un commentaire (JSON
n'a pas de commentaires, donc pas de risque ici).
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.models.profile_context import (
    PARTNERS_PER_MONTH_BY_ARCHETYPE,
    EsnArchetype,
    ProfileContext,
    ProfileContradiction,
)
from app.routers.profiler import OnboardingAnswers
from app.services.protected_criteria import PROTECTED_CRITERIA
from tests.test_copilote_prompt_blocks import FORBIDDEN_VENDORS

_HERE = Path(__file__).resolve().parent
_FIXTURES_DIR = _HERE / "fixtures" / "golden_multi_persona"

# Les 15 personas nommées par #2070, verbatim (mots-clés, comparaison insensible
# à la casse). Alchimmy (#16) est une fixture nommée à part — voir #2070 :
# « Inclure Alchimmy comme fixture spécifique, jamais comme template universel. »
_REQUIRED_PERSONA_KEYWORDS: tuple[str, ...] = (
    "technicien",
    "fondateur commercial solo",
    "bu d'un grand groupe",
    "agence régionale",
    "esn généraliste",
    "niche cyber",
    "modèle freelance",
    "cabinet de recrutement",
    "activité rang 2",
    "secteur public",
    "esn sans crm",
    "esn mature avec plusieurs commerciaux",
    "nouveau directeur d'agence",
    "gros vivier",
    "pipeline",
)

# c26_probabilite — reprend le vocabulaire interdit par le docstring RÉEL de
# `BellumPhrases.score_context` / `WelcomeSummary.scoring_personalization`
# (app/models/profile_context.py) et lui donne l'exécution qui manquait :
# ce docstring lui-même note, verbatim, que « le schéma ne l'interdisait
# nulle part » avant l'incident du 14/09 sur /welcome.
_PROBABILITY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"probabilit", re.IGNORECASE),
    re.compile(r"chances? de sign", re.IGNORECASE),
    re.compile(r"%\s*de\s*r[ée]ussite", re.IGNORECASE),
    re.compile(r"pourcentage de r[ée]ussite", re.IGNORECASE),
    re.compile(r"pr[ée]visionnel pond[ée]r[ée]", re.IGNORECASE),
)


def _fixture_files() -> list[Path]:
    return sorted(_FIXTURES_DIR.glob("*.json"))


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_all() -> list[dict[str, Any]]:
    return [_load(p) for p in _fixture_files()]


def _iter_strings(node: Any):
    """Parcourt récursivement les VALEURS string d'un JSON — jamais les clés.

    Les clés du schéma (`braveQueriesCount`, `firecrawlPagesCount`…) embarquent
    elles-mêmes des noms de fournisseur réels (Brave, Firecrawl) : ce sont des
    identifiants internes, jamais un texte affiché. Un détecteur qui scannerait
    le JSON brut attraperait ce qu'il ne vise pas — la clé, pas le contenu
    montré à l'écran ou au modèle.
    """
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _iter_strings(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_strings(item)


def find_probability_language(payload: Any) -> list[str]:
    hits: list[str] = []
    for s in _iter_strings(payload):
        if any(pattern.search(s) for pattern in _PROBABILITY_PATTERNS):
            hits.append(s)
    return hits


def find_vendor_names(payload: Any) -> list[str]:
    hits: list[str] = []
    for s in _iter_strings(payload):
        for vendor in FORBIDDEN_VENDORS:
            if re.search(rf"\b{re.escape(vendor)}\b", s, flags=re.IGNORECASE):
                hits.append(vendor)
    return sorted(set(hits))


def find_protected_criteria_keys(payload: Any) -> list[str]:
    """Scan des CLÉS JSON BRUTES, avant tout parsing Pydantic.

    Un `_CamelModel` sans `extra="forbid"` ignore silencieusement une clé
    inconnue : parser d'abord puis inspecter le modèle validé laisserait
    passer une clé protégée injectée dans la fixture sans qu'aucun test ne
    la voie jamais.
    """
    hits: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in PROTECTED_CRITERIA:
                    hits.add(key)
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    return sorted(hits)


# Bornes documentées dans app/models/profile_context.py, KpiTargets ×
# EsnArchetype : « accounts_per_month … soloHunter: 5-10 … boutiqueExpert:
# 10-20 … midMarketChallenger: 20-40 … scaleUp: 40-80 … enterprisePlayer:
# 60-120. » Le docstring l'ÉNONCE ; cette table lui donne un test.
_KPI_RANGE_PER_ARCHETYPE: dict[str, tuple[int, int]] = {
    "soloHunter": (5, 10),
    "boutiqueExpert": (10, 20),
    "midMarketChallenger": (20, 40),
    "scaleUp": (40, 80),
    "enterprisePlayer": (60, 120),
}

# #2067.2 — la cible partenaires suit l'archétype. Contrairement à la table
# ci-dessus, celle des partenaires n'est PAS recopiée : elle est IMPORTÉE du
# modèle (`PARTNERS_PER_MONTH_BY_ARCHETYPE`), qui rend lui-même ses plages dans
# la description envoyée au modèle. Une plage vit à UN endroit (GA-26).
_QUESTIONNAIRE_TS = (
    _HERE.parents[2] / "packages" / "contracts" / "src" / "schemas" / "profile-questionnaire.ts"
)
_PARTNER_COUNT_UNKNOWN = "Je ne sais pas"


def _partner_count_bands_declarees() -> tuple[str, ...]:
    """Les bandes de `PARTNER_COUNT_BANDS` qui sont un nombre DÉCLARÉ.

    Lues dans le TS, jamais recopiées : « Je ne sais pas » en est retiré — ce
    n'est pas un nombre, c'est l'absence de mesure.
    """

    texte = _QUESTIONNAIRE_TS.read_text(encoding="utf-8")
    match = re.search(r"PARTNER_COUNT_BANDS = \[(.*?)\]", texte, flags=re.DOTALL)
    assert match is not None, f"PARTNER_COUNT_BANDS introuvable dans {_QUESTIONNAIRE_TS}"
    bandes = tuple(simple or double for simple, double in re.findall(r"'([^']*)'|\"([^\"]*)\"", match.group(1)))
    return tuple(bande for bande in bandes if bande != _PARTNER_COUNT_UNKNOWN)


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 2 — la garde LIT quelque chose : un corpus vide rend chaque test
# paramétré ci-dessous vert pour toujours (0 cas exécuté = 0 échec).
# ─────────────────────────────────────────────────────────────────────────


def test_corpus_is_not_empty():
    files = _fixture_files()
    # 17 depuis #2070.16 : les 15 personas, la fixture nommée, et l'espace vide.
    assert len(files) >= 17, (
        f"Corpus vide ou tronqué ({len(files)} fichier(s)) sous {_FIXTURES_DIR} — "
        "une garde qui parcourt une liste vide est verte pour toujours."
    )


def test_corpus_covers_the_fifteen_required_personas():
    personas = [c["persona"].lower() for c in _load_all()]
    missing = [kw for kw in _REQUIRED_PERSONA_KEYWORDS if not any(kw in p for p in personas)]
    assert missing == [], f"Personas #2070 non couvertes par le corpus: {missing}"


def test_case_ids_are_unique_no_multiple_generation():
    # #2085 GOLDEN « pas de génération multiple » : un cas de référence = UN id.
    cases = _load_all()
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), f"Identifiants dupliqués: {ids}"


def test_corpus_covers_both_sides_of_the_partners_target():
    # #2067.2 — sans un cas de CHAQUE côté, le test paramétré au-dessus serait
    # vert pour toujours : un corpus où personne ne déclare de partenaires ne
    # vérifie jamais la plage, et un corpus où tout le monde en déclare ne
    # vérifie jamais l'absence. Les deux moitiés de la règle doivent exister.
    bandes = _partner_count_bands_declarees()
    assert bandes, "PARTNER_COUNT_BANDS lu vide — la garde ne lit plus le questionnaire."
    cases = _load_all()
    avec = [c["id"] for c in cases if c["referenceProfile"]["coachingInsights"]["kpiTargets"].get("partnersPerMonth")]
    sans = [
        c["id"]
        for c in cases
        if c["referenceProfile"]["coachingInsights"]["kpiTargets"].get("partnersPerMonth") is None
    ]
    assert avec, "aucun cas avec cible partenaires : la plage par archétype n'est jamais exécutée."
    assert sans, "aucun cas sans cible partenaires : l'absence n'est jamais exécutée."

    # L'ABSENCE PARLANTE : un cas doit avoir une porte partenaire ET répondre
    # « Je ne sais pas » — c'est là que le chiffre inventé apparaîtrait.
    ignorants = [
        c["id"] for c in cases if c["answers"].get("partners_regular_count") == _PARTNER_COUNT_UNKNOWN
    ]
    assert ignorants, "aucun cas « Je ne sais pas » : le cas qui produit une absence n'est pas couvert."


def test_alchimmy_is_present_exactly_once_as_a_named_fixture():
    cases = _load_all()
    alchimmy = [c for c in cases if c["answers"].get("esn_name") == "Alchimmy"]
    assert len(alchimmy) == 1, (
        f"#2070 — Alchimmy doit apparaître comme UNE fixture spécifique nommée, trouvé {len(alchimmy)}."
    )


def test_alchimmy_is_not_reused_as_a_universal_template():
    cases = _load_all()
    alchimmy = next(c for c in cases if c["answers"].get("esn_name") == "Alchimmy")
    for other in cases:
        if other["id"] == alchimmy["id"]:
            continue
        assert other["answers"] != alchimmy["answers"], (
            f"{other['id']} reprend les réponses d'Alchimmy telles quelles — #2070 : "
            "« jamais comme template universel »."
        )
        assert other["referenceProfile"] != alchimmy["referenceProfile"]


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_fixture_id_matches_filename(path: Path):
    assert _load(path)["id"] == path.stem


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_fixture_has_required_top_level_keys(path: Path):
    data = _load(path)
    # `personaKind` (#2070.23) : un cas dit s'il est FICTIF ou s'il nomme une
    # entreprise RÉELLE — sans quoi rien n'empêche des faits fabriqués d'être
    # attribués à quelqu'un qui existe.
    for key in (
        "id",
        "persona",
        "personaKind",
        "_source",
        "answers",
        "referenceProfile",
        "contradictions",
        "limits",
    ):
        assert key in data, f"{path.name} — clé manquante: {key}"
    # #2085 GOLDEN « version traçable ».
    assert data["_source"].strip(), f"{path.name} — cas non traçable (_source vide)"


# ─────────────────────────────────────────────────────────────────────────
# Validité de schéma contre le VRAI code, en lecture seule — un changement de
# forme de `OnboardingAnswers` ou `ProfileContext` fait rougir ce corpus.
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_answers_parse_as_real_onboarding_answers(path: Path):
    OnboardingAnswers.model_validate(_load(path)["answers"])


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_reference_profile_parses_as_real_profile_context(path: Path):
    ProfileContext.model_validate(_load(path)["referenceProfile"])


# #2085.29 — il manquait un test qui valide la SORTIE RÉELLE du champ
# `contradiction` (`ProfileContradiction`, singulier — #2088.34) sur un cas
# qui en porte une DÉLIBÉRÉMENT, pas seulement le texte du prompt
# (`test_profiler_prompt_doctrine.py`) ni le champ `contradictions` (pluriel,
# une annotation humaine du cas de référence, cf. docstring de ce module).
# `test_reference_profile_parses_as_real_profile_context` ci-dessus rejoue
# déjà `ProfileContext` (donc `contradiction` s'il est présent), mais AUCUN
# des 19 cas ne le portait avant ce lot : la branche n'était jamais exercée.
# `11-esn-sans-crm` en porte une désormais, entre deux réponses RÉELLES du
# fixture (positioning « généraliste » vs une seule expertise déclarée).
_CONTRADICTION_FIXTURE = _FIXTURES_DIR / "11-esn-sans-crm.json"


def test_the_contradiction_field_parses_as_real_profile_contradiction():
    contradiction = _load(_CONTRADICTION_FIXTURE)["referenceProfile"].get("contradiction")
    assert contradiction is not None, "11-esn-sans-crm doit porter une tension délibérée à valider"
    parsed = ProfileContradiction.model_validate(contradiction)
    assert parsed.statement
    assert parsed.reasoning


def test_guard_catches_a_contradiction_missing_its_reasoning():
    # Doctrine #2088.34 : `statement` ET `reasoning` sont OBLIGATOIRES
    # ENSEMBLE — jamais une tension sans la raison qui la rend consultable.
    broken = deepcopy(_load(_CONTRADICTION_FIXTURE)["referenceProfile"]["contradiction"])
    del broken["reasoning"]
    with pytest.raises(ValidationError):
        ProfileContradiction.model_validate(broken)


# ─────────────────────────────────────────────────────────────────────────
# Interdits (doctrine CLAUDE.md) — appliqués UNIFORMÉMENT aux 16 cas, une
# seule fois, plutôt que dupliqués dans chaque fixture.
# ─────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_no_probability_language_in_reference_profile(path: Path):
    hits = find_probability_language(_load(path)["referenceProfile"])
    assert hits == [], f"{path.name} — langage de probabilité détecté: {hits}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_no_vendor_name_in_reference_profile_or_answers(path: Path):
    data = _load(path)
    hits = find_vendor_names(data["referenceProfile"]) + find_vendor_names(data["answers"])
    assert hits == [], f"{path.name} — nom de fournisseur détecté: {hits}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_no_protected_criteria_key_in_answers_or_reference_profile(path: Path):
    data = _load(path)
    hits = find_protected_criteria_keys(data["answers"]) + find_protected_criteria_keys(data["referenceProfile"])
    assert hits == [], f"{path.name} — critère(s) protégé(s) détecté(s): {hits}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_first_analysis_suggestions_stay_empty_never_invented(path: Path):
    # #2085 GOLDEN « aucune suggestion d'entreprise non résolue ». Le
    # questionnaire d'onboarding (OnboardingAnswers) ne transmet AUCUN compte
    # réel : la liste ne peut donc être QUE vide (doctrine c58/#2069, voir le
    # docstring réel de `first_analysis_suggestions`) — la remplir serait la
    # preuve d'une invention.
    suggestions = _load(path)["referenceProfile"]["welcomeSummary"]["firstAnalysisSuggestions"]
    assert suggestions == [], f"{path.name} — suggestion(s) d'entreprise non résolue(s): {suggestions}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_sectors_priority_never_invents_a_sector(path: Path):
    # #2085 GOLDEN « inconnues préservées » / « aucune donnée inventée ».
    data = _load(path)
    # `.get(... ) or []` : un espace vide N'A PAS la clé — `OnboardingAnswers`
    # la fait défaut à `[]`. L'indexation directe faisait lever un KeyError au
    # lieu de vérifier la règle, ce qui est le genre de rouge qu'on finit par
    # contourner en retirant le cas gênant du corpus.
    target_sectors = set(data["answers"].get("target_sectors") or [])
    sectors_priority = data["referenceProfile"]["idealAccountProfile"]["sectorsPriority"]
    invented = [s for s in sectors_priority if s not in target_sectors]
    assert invented == [], f"{path.name} — secteur(s) priorisé(s) absent(s) des réponses: {invented}"


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_kpi_targets_stay_within_the_documented_range_per_archetype(path: Path):
    # #2085 GOLDEN « plan réaliste ». La plage est déjà écrite en prose dans le
    # docstring de `KpiTargets.accounts_per_month` — cette assertion l'exécute.
    data = _load(path)
    archetype = data["referenceProfile"]["esnArchetype"]
    accounts_per_month = data["referenceProfile"]["coachingInsights"]["kpiTargets"]["accountsPerMonth"]
    low, high = _KPI_RANGE_PER_ARCHETYPE[archetype]
    assert low <= accounts_per_month <= high, (
        f"{path.name} — accountsPerMonth={accounts_per_month} hors de la plage documentée "
        f"[{low}-{high}] pour l'archétype {archetype}."
    )


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_partners_target_follows_the_archetype_or_stays_absent(path: Path):
    # #2067.2 — la cible partenaires suit l'archétype. La règle, en un test :
    # sans base DÉCLARÉE (`partners_regular_count` absent, « Je ne sais pas »,
    # ou hors catalogue), la cible est ABSENTE — jamais 0, jamais devinée
    # (doctrine « non mesuré n'est jamais zéro », gardes GA-18 / GA-19). Avec
    # une base déclarée, elle tombe dans la plage de l'archétype.
    data = _load(path)
    archetype = data["referenceProfile"]["esnArchetype"]
    targets = data["referenceProfile"]["coachingInsights"]["kpiTargets"]
    target = targets.get("partnersPerMonth")
    declared = data["answers"].get("partners_regular_count")

    if declared not in _partner_count_bands_declarees():
        assert target is None, (
            f"{path.name} — partnersPerMonth={target!r} alors que la base partenaires n'est pas "
            f"déclarée (partners_regular_count={declared!r}) : une cible non établie s'OMET."
        )
        return

    low, high = PARTNERS_PER_MONTH_BY_ARCHETYPE[archetype]
    assert isinstance(target, int) and not isinstance(target, bool), (
        f"{path.name} — base partenaires déclarée ({declared!r}) mais aucune cible chiffrée."
    )
    assert low <= target <= high, (
        f"{path.name} — partnersPerMonth={target} hors de la plage [{low}-{high}] "
        f"pour l'archétype {archetype}."
    )


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 1 — la garde SAIT DIRE NON : chaque détecteur, appelé sur une copie
# volontairement cassée d'un cas valide, DOIT rougir.
# ─────────────────────────────────────────────────────────────────────────


def _a_valid_case() -> dict[str, Any]:
    return deepcopy(_load_all()[0])


def test_guard_catches_injected_probability_language():
    case = _a_valid_case()
    case["referenceProfile"]["bellumPhrases"]["scoreContext"] = (
        "Ce compte a 80% de probabilité de signer dans les 3 mois."
    )
    assert find_probability_language(case["referenceProfile"]) != []


def test_guard_catches_injected_vendor_name():
    case = _a_valid_case()
    case["referenceProfile"]["bellumPhrases"]["welcome"] += " Propulsé par Anthropic Claude."
    assert find_vendor_names(case["referenceProfile"]) != []


def test_guard_catches_injected_protected_criteria_key():
    case = _a_valid_case()
    case["answers"]["photo_url"] = "https://example.test/photo.jpg"
    assert find_protected_criteria_keys(case["answers"]) != []


def test_guard_catches_invented_first_analysis_suggestion():
    case = _a_valid_case()
    case["referenceProfile"]["welcomeSummary"]["firstAnalysisSuggestions"] = [
        {"companyName": "Decathlon", "sector": "Retail", "reason": "inventé pour le test"}
    ]
    assert case["referenceProfile"]["welcomeSummary"]["firstAnalysisSuggestions"] != []


def test_guard_catches_invented_sector_in_priority():
    case = _a_valid_case()
    case["referenceProfile"]["idealAccountProfile"]["sectorsPriority"] = ["Un secteur jamais coché"]
    target_sectors = set(case["answers"]["target_sectors"])
    invented = [
        s for s in case["referenceProfile"]["idealAccountProfile"]["sectorsPriority"] if s not in target_sectors
    ]
    assert invented != []


def test_guard_catches_kpi_target_out_of_documented_range():
    case = _a_valid_case()
    case["referenceProfile"]["esnArchetype"] = "soloHunter"
    case["referenceProfile"]["coachingInsights"]["kpiTargets"]["accountsPerMonth"] = 999
    low, high = _KPI_RANGE_PER_ARCHETYPE["soloHunter"]
    accounts_per_month = case["referenceProfile"]["coachingInsights"]["kpiTargets"]["accountsPerMonth"]
    assert not (low <= accounts_per_month <= high)


def test_guard_catches_schema_drift_on_reference_profile():
    # Preuve que la validation porte sur le VRAI `ProfileContext`, pas une
    # copie locale : un champ requis manquant doit lever, aujourd'hui.
    case = _a_valid_case()
    del case["referenceProfile"]["esnArchetype"]
    with pytest.raises(ValidationError):
        ProfileContext.model_validate(case["referenceProfile"])


def test_guard_catches_schema_drift_on_answers():
    case = _a_valid_case()
    case["answers"]["expertise_areas"] = "pas une liste"
    with pytest.raises(ValidationError):
        OnboardingAnswers.model_validate(case["answers"])


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 3 — la garde N'ATTRAPE PAS ce qu'elle ne vise pas : témoins de cas
# légitimes voisins, qui doivent rester verts.
# ─────────────────────────────────────────────────────────────────────────


def test_legitimate_conversion_rate_percentage_is_not_flagged_as_probability():
    # `kpiTargets.conversionRateTarget` porte légitimement un "%" (ex: "15-25%")
    # — un taux cible mesuré, pas une probabilité de closing présentée comme
    # une chance.
    payload = {"conversionRateTarget": "15-25%"}
    assert find_probability_language(payload) == []


def test_legitimate_score_vocabulary_is_not_flagged_as_probability():
    # Le vocabulaire de doctrine lui-même (« axes », « raisons », « chiffre »)
    # ne doit jamais déclencher le détecteur — sinon la garde interdirait la
    # phrase même qu'elle est censée imposer.
    payload = {"scoreContext": "Le score se justifie par ses axes et ses raisons, jamais par un chiffre unique."}
    assert find_probability_language(payload) == []


def test_legitimate_esn_vocabulary_is_not_flagged_as_vendor_name():
    # Le mot « Cloud » (composant de la vraie option « Cloud & Infrastructure
    # (AWS, Azure, GCP, Hosting) ») ne doit pas déclencher sur « Claude » — un
    # `\b…\b` mal posé confondrait les deux.
    payload = {"text": "Spécialiste Cloud & Infrastructure (AWS, Azure, GCP, Hosting)."}
    assert find_vendor_names(payload) == []


def test_legitimate_city_and_country_fields_are_not_protected_criteria():
    # city / country restent HORS de PROTECTED_CRITERIA (doctrine — plus
    # grossier que le code postal, voir le docstring réel du module). Témoin
    # direct de la non-sur-capture : `address` reste interdit, pas eux.
    payload = {"city": "Paris", "country": "France"}
    assert find_protected_criteria_keys(payload) == []


# ═════════════════════════════════════════════════════════════════════════
# CE QUE LE CORPUS NE PROUVAIT PAS ENCORE (#2070.1-.15, .16, .18, .22, .23)
# ─────────────────────────────────────────────────────────────────────────
# Les seize cas ci-dessus SONT divers, tracés et annotés — mais rien ne le
# gardait, et une garde protège une règle, elle ne l'invente pas :
#
# * La DIVERSITÉ n'était comparée qu'à Alchimmy. Seize cas qui se ressemblent
#   ne détectent rien, et c'est exactement ce qu'un refactor produit : on
#   aligne les fixtures « pour la lisibilité » et le corpus devient un seul
#   cas répété seize fois, toujours vert.
# * L'ESPACE VIDE — premier jour, questionnaire non rempli — n'était couvert
#   par AUCUN cas. C'est pourtant LE cas qui prouve « non mesuré n'est jamais
#   0 » : gardée sur seize cas qui ont tous leur donnée, la règle n'est
#   jamais exercée.
# * `contradictions` et `limits` étaient des champs MORTS : exigés PRÉSENTS
#   (`key in data`), jamais LUS. `[]` et `[""]` passaient. C'est le défaut le
#   plus fréquent de ce dépôt — du texte juste que personne n'appelle.
# * Rien ne distinguait un persona FICTIF d'une vraie entreprise. Le défaut a
#   déjà été payé ici : des fixtures « golden » attribuaient des faits
#   fabriqués à de vraies entreprises. Un persona est fictif et se NOMME
#   comme tel, ou il ne porte que des faits vérifiables.
# ═════════════════════════════════════════════════════════════════════════


#: #2070.23 — deux valeurs, et deux seulement. Un cas FICTIF n'engage
#: personne ; un cas RÉEL engage l'entreprise qu'il nomme, donc ses faits
#: doivent être traçables jusqu'à leur source.
_PERSONA_KINDS: tuple[str, ...] = ("fictif", "reel")

#: Les champs de `OnboardingAnswers` dont le DÉFAUT de schéma (`""` / `[]`)
#: veut dire « non mesuré » — jamais « zéro ». Un espace vide les a tous à
#: leur défaut ; c'est ce qui le définit, structurellement, plutôt qu'un
#: libellé de persona qu'un renommage emporterait.
_MEASURABLE_ANSWER_FIELDS: tuple[str, ...] = (
    "esn_name",
    "consultant_size",
    "sales_team_size",
    "expertise_areas",
    "positioning",
    "staffing_model",
    "target_sectors",
    "target_company_types",
    "geo_zones",
    "main_sales_pain",
)

#: Les axes sur lesquels deux ESN diffèrent RÉELLEMENT, et le nombre de
#: valeurs distinctes MESURÉ sur le corpus au moment où cette garde est
#: écrite. Le seuil est posé à la valeur mesurée, pas en dessous : perdre une
#: valeur fait rougir, ce qui est le seul moyen qu'un corpus ne s'aplatisse
#: pas cas après cas. `nearshoreCompetitive` manque à dessein aux postures —
#: le docstring RÉEL de `SellingPosture` le dit : « réservé aux ESN qui
#: insistent sur prix/proximité — rare en Temps 1, ne pas forcer ».
_REQUIRED_AXIS_SPREAD: dict[str, int] = {
    "esnArchetype": 5,
    "sellingPosture": 4,
    "consultant_size": 5,
    "staffing_model": 4,
    "geo_zones": 8,
    "accountSize": 4,
    "entryStrategy": 4,
}


def find_zero_numbers(reference_profile: Any) -> list[str]:
    """Chemins des nombres VALANT ZÉRO dans un profil de référence.

    « Si cette valeur est absente, « 0 » est-il VRAI ? » Pour un objectif de
    comptes par mois, une cadence ou un budget de recherche, la réponse est
    non : un espace vide n'a pas un objectif de zéro compte, il n'a pas
    encore d'objectif mesuré — et le schéma impose alors sa borne
    conservatrice documentée, jamais un zéro.

    ⚠️ `isinstance(False, int)` est VRAI en Python : le booléen est écarté
    EXPLICITEMENT, sinon la garde rapporterait `False` comme un zéro et
    attraperait ce qu'elle ne vise pas. Témoin :
    `test_legitimate_false_boolean_is_not_flagged_as_a_zero`.
    """
    hits: list[str] = []

    def walk(node: Any, path: str) -> None:
        if isinstance(node, bool):
            return
        if isinstance(node, (int, float)):
            if node == 0:
                hits.append(path)
            return
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for index, item in enumerate(node):
                walk(item, f"{path}[{index}]")

    walk(reference_profile, "referenceProfile")
    return hits


def unmeasured_answer_fields(answers: dict[str, Any]) -> list[str]:
    """Les champs laissés à leur défaut de schéma — « non mesuré », pas « 0 »."""
    return [field for field in _MEASURABLE_ANSWER_FIELDS if not answers.get(field)]


def empty_workspace_cases(cases: list[dict[str, Any]]) -> list[str]:
    """Les cas dont AUCUN champ mesurable n'est renseigné — le premier jour."""
    return [
        case["id"]
        for case in cases
        if len(unmeasured_answer_fields(case["answers"])) == len(_MEASURABLE_ANSWER_FIELDS)
    ]


def duplicated_answer_cases(cases: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Les paires de cas qui portent EXACTEMENT les mêmes réponses.

    `user_id` est retiré de la comparaison : il est dérivé de l'identifiant du
    cas, donc toujours distinct — le laisser rendrait la garde borgne, deux
    cas parfaitement identiques passant pour différents.
    """
    seen: dict[str, str] = {}
    duplicates: list[tuple[str, str]] = []
    for case in cases:
        answers = {k: v for k, v in case["answers"].items() if k != "user_id"}
        key = json.dumps(answers, sort_keys=True, ensure_ascii=False)
        if key in seen:
            duplicates.append((seen[key], case["id"]))
        else:
            seen[key] = case["id"]
    return duplicates


def axis_spread(cases: list[dict[str, Any]]) -> dict[str, int]:
    """Nombre de valeurs DISTINCTES portées par le corpus, axe par axe."""
    spread: dict[str, set[str]] = {axis: set() for axis in _REQUIRED_AXIS_SPREAD}
    for case in cases:
        answers, profile = case["answers"], case["referenceProfile"]
        spread["esnArchetype"].add(profile["esnArchetype"])
        spread["sellingPosture"].add(profile["sellingPosture"])
        spread["accountSize"].add(profile["idealAccountProfile"]["size"])
        spread["entryStrategy"].add(profile["idealAccountProfile"]["entryStrategy"])
        # Un champ à son défaut est un « non mesuré » : il ne COMPTE pas comme
        # une valeur d'axe (sinon l'espace vide gonflerait la diversité).
        for axis in ("consultant_size", "staffing_model"):
            if answers.get(axis):
                spread[axis].add(answers[axis])
        spread["geo_zones"].update(answers.get("geo_zones") or [])
    return {axis: len(values) for axis, values in spread.items()}


def undeclared_persona_kinds(cases: list[dict[str, Any]]) -> list[str]:
    """Les cas qui ne DISENT pas si leur ESN est fictive ou réelle."""
    return [case["id"] for case in cases if case.get("personaKind") not in _PERSONA_KINDS]


def empty_annotations(case: dict[str, Any]) -> list[str]:
    """Les annotations humaines vides — un champ présent mais muet.

    Une limite ou une contradiction est une PHRASE écrite par quelqu'un. Le
    tableau `contradictions` PEUT être vide (tous les cas n'en portent pas),
    mais une ENTRÉE vide ou d'un mot est un champ mort déguisé en champ
    rempli. Le plancher est à 20 caractères : « RAS » et « aucune » n'y
    passent pas, une phrase courte oui.
    """
    muted: list[str] = []
    for field in ("contradictions", "limits"):
        entries = case.get(field)
        if not isinstance(entries, list):
            muted.append(f"{field}: n'est pas une liste")
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, str) or len(entry.strip()) < 20:
                muted.append(f"{field}[{index}]")
    if not case.get("limits"):
        muted.append("limits: aucune limite nommée — un cas de référence en a toujours au moins une")
    return muted


# ── #2070.1-.15 — le corpus couvre des ESN RÉELLEMENT différentes ────────


def test_no_two_cases_carry_the_same_answers():
    duplicates = duplicated_answer_cases(_load_all())
    assert duplicates == [], (
        f"Cas aux réponses identiques: {duplicates} — un corpus où les cas se "
        "ressemblent ne détecte rien."
    )


def test_corpus_spans_the_axes_on_which_two_esn_really_differ():
    spread = axis_spread(_load_all())
    too_narrow = {
        axis: (spread[axis], minimum)
        for axis, minimum in _REQUIRED_AXIS_SPREAD.items()
        if spread[axis] < minimum
    }
    assert too_narrow == {}, (
        f"Axes appauvris (mesuré, attendu): {too_narrow} — taille, maturité, "
        "territoire et modèle de staffing sont ce qui sépare deux ESN."
    )


def test_every_archetype_of_the_real_enum_is_represented():
    # La table d'axes ci-dessus porte un NOMBRE ; celle-ci lit le VRAI enum,
    # pour qu'une sixième valeur ajoutée au code arrive sans cas de référence
    # et le fasse savoir.
    covered = {case["referenceProfile"]["esnArchetype"] for case in _load_all()}
    missing = sorted({archetype.value for archetype in EsnArchetype} - covered)
    assert missing == [], f"Archétype(s) sans cas de référence: {missing}"


# ── #2070.16 + doctrine « non mesuré n'est jamais 0 » ────────────────────


def test_corpus_contains_an_empty_workspace_case():
    found = empty_workspace_cases(_load_all())
    assert found, (
        "Aucun cas « espace vide » (tous les champs mesurables à leur défaut). "
        "Sans lui, « non mesuré n'est jamais 0 » n'est gardé que sur des cas "
        "qui ont tous leur donnée — donc jamais exercé."
    )


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_no_absent_answer_is_rendered_as_a_zero(path: Path):
    zeros = find_zero_numbers(_load(path)["referenceProfile"])
    assert zeros == [], (
        f"{path.name} — valeur(s) à 0 dans le profil de référence: {zeros}. "
        "Question : si cette valeur est absente, « 0 » est-il VRAI ?"
    )


def _the_empty_workspace_case() -> dict[str, Any]:
    cases = _load_all()
    empty_ids = empty_workspace_cases(cases)
    return next(case for case in cases if case["id"] in empty_ids)


def test_the_empty_workspace_case_invents_nothing():
    profile = _the_empty_workspace_case()["referenceProfile"]
    assert profile["idealAccountProfile"]["sectorsPriority"] == []
    assert profile["analysisParameters"]["focusAreas"] == []
    assert profile["welcomeSummary"]["firstAnalysisSuggestions"] == []


#: Marqueurs d'ABSENCE : une phrase qui en porte un nomme ce qui manque au lieu
#: d'affirmer quelque chose sur l'ESN.
_ABSENCE_MARKERS: tuple[str, ...] = ("aucun", "aucune", "pas encore", "non renseign", "n'a pas été")


def test_the_empty_workspace_case_never_claims_a_differentiator_it_cannot_know():
    """⚠️ Un DÉFAUT de schéma nommé, pas un choix de ce corpus.

    `MessagingStyle.differentiation_points` porte `min_length=3`
    (app/models/profile_context.py:226) alors que sa source DOCUMENTÉE est
    « expertise_areas + positioning + target_sectors » — les trois vides pour
    un espace vide. Le dépôt a pourtant déjà écrit la règle deux cents lignes
    plus bas, en retirant le `min_length` de `first_analysis_suggestions`
    (#2069, lignes 439-440) : « Un `min_length` sur un champ dont la source est
    absente du contexte EST la consigne d'inventer. »

    Tant que la contrainte tient, ce cas ne PEUT pas rendre une liste vide. Il
    rend trois phrases qui NOMMENT l'absence, et cette garde vérifie qu'aucune
    n'est une affirmation sur une ESN dont on ne sait rien. Le jour où le
    `min_length` tombe, ce test rougit et la fixture revient à `[]`.
    """
    points = _the_empty_workspace_case()["referenceProfile"]["messagingStyle"]["differentiationPoints"]
    claims = [p for p in points if not any(marker in p.lower() for marker in _ABSENCE_MARKERS)]
    assert claims == [], (
        f"Différenciateur(s) AFFIRMÉ(S) sur un espace vide: {claims} — "
        "un min_length sur un champ sans source EST la consigne d'inventer."
    )


def test_the_empty_workspace_case_names_what_it_could_not_evaluate():
    # Doctrine : ce qui n'a pas pu être évalué est NOMMÉ. Un récapitulatif qui
    # affirmerait un profil sans aucune réponse serait une invention polie.
    recap = _the_empty_workspace_case()["referenceProfile"]["welcomeSummary"]["profileRecap"].lower()
    assert any(marker in recap for marker in ("pas encore", "non renseign", "aucune réponse")), (
        f"Le récapitulatif de l'espace vide ne nomme pas ce qui manque: {recap!r}"
    )


# ── #2070.23 — aucune donnée inventée sous un vrai nom ───────────────────


def test_every_case_declares_whether_its_esn_is_fictional_or_real():
    undeclared = undeclared_persona_kinds(_load_all())
    assert undeclared == [], (
        f"Cas sans `personaKind` parmi {_PERSONA_KINDS}: {undeclared}. Un persona est "
        "fictif et se NOMME comme tel, ou il ne porte que des faits vérifiables."
    )


def test_a_case_that_names_a_real_esn_traces_where_its_facts_come_from():
    real_cases = [case for case in _load_all() if case.get("personaKind") == "reel"]
    assert real_cases, "Témoin sans objet : aucun cas réel dans le corpus."
    for case in real_cases:
        assert case["answers"].get("esn_name"), f"{case['id']} — cas réel sans entreprise nommée"
        assert case["answers"]["esn_name"].lower() in case["_source"].lower(), (
            f"{case['id']} — l'entreprise RÉELLE nommée n'apparaît pas dans `_source` : "
            "des faits fabriqués sous un vrai nom sont un défaut déjà payé ici."
        )


def test_a_fictional_case_never_borrows_the_name_of_a_real_one():
    cases = _load_all()
    real_names = {
        case["answers"]["esn_name"].lower() for case in cases if case.get("personaKind") == "reel"
    }
    borrowed = [
        case["id"]
        for case in cases
        if case.get("personaKind") == "fictif"
        and case["answers"].get("esn_name", "").lower() in real_names
    ]
    assert borrowed == [], f"Cas fictif portant le nom d'une entreprise réelle: {borrowed}"


# ── #2070.18 / .22 — contradictions et limites sont LUES, pas rangées ────


@pytest.mark.parametrize("path", _fixture_files(), ids=lambda p: p.stem)
def test_annotations_are_written_sentences_never_empty_placeholders(path: Path):
    muted = empty_annotations(_load(path))
    assert muted == [], f"{path.name} — annotation(s) muette(s): {muted}"


def test_the_case_without_crm_names_that_contradiction():
    # #2070.11 : le cas « ESN sans CRM » ne vaut que si l'absence d'outil est
    # ÉCRITE comme la contradiction à ne pas franchir. Sans cette assertion, le
    # champ `contradictions` pouvait rester `[]` et le cas ne gardait plus rien.
    case = next(c for c in _load_all() if "sans crm" in c["persona"].lower())
    named = [entry for entry in case["contradictions"] if "crm" in entry.lower()]
    assert named, f"{case['id']} — l'absence de CRM n'est pas nommée dans `contradictions`"


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 1 (suite) — chaque détecteur AJOUTÉ ci-dessus sait dire NON.
# ─────────────────────────────────────────────────────────────────────────


def test_guard_catches_a_corpus_where_every_case_is_the_same():
    cases = _load_all()
    flattened = deepcopy(cases)
    for index, case in enumerate(flattened):
        case["answers"] = deepcopy(cases[0]["answers"])
        case["answers"]["user_id"] = f"golden-{index}"
        case["referenceProfile"] = deepcopy(cases[0]["referenceProfile"])
    assert duplicated_answer_cases(flattened) != []
    narrowed = axis_spread(flattened)
    assert any(narrowed[axis] < minimum for axis, minimum in _REQUIRED_AXIS_SPREAD.items())


def test_guard_catches_an_absent_answer_rendered_as_zero():
    profile = deepcopy(_a_valid_case()["referenceProfile"])
    profile["coachingInsights"]["kpiTargets"]["accountsPerMonth"] = 0
    assert find_zero_numbers(profile) == [
        "referenceProfile.coachingInsights.kpiTargets.accountsPerMonth"
    ]


def test_guard_catches_a_zero_buried_in_a_list():
    profile = deepcopy(_a_valid_case()["referenceProfile"])
    profile["analysisParameters"]["focusAreas"] = ["Cloud & Infrastructure", 0]
    assert find_zero_numbers(profile) == ["referenceProfile.analysisParameters.focusAreas[1]"]


def test_guard_catches_an_undeclared_persona_kind():
    case = _a_valid_case()
    case.pop("personaKind", None)
    assert undeclared_persona_kinds([case]) == [case["id"]]
    case["personaKind"] = "inconnu"
    assert undeclared_persona_kinds([case]) == [case["id"]]


def test_guard_catches_an_empty_annotation():
    case = _a_valid_case()
    case["limits"] = ["RAS"]
    assert "limits[0]" in empty_annotations(case)
    case["limits"] = []
    assert any(muted.startswith("limits:") for muted in empty_annotations(case))


def test_guard_catches_a_corpus_that_lost_its_empty_workspace_case():
    filled = deepcopy(_load_all())
    for case in filled:
        answers = case["answers"]
        answers["consultant_size"] = answers.get("consultant_size") or "10-30"
        answers["esn_name"] = answers.get("esn_name") or "Une ESN"
        answers["main_sales_pain"] = answers.get("main_sales_pain") or "Je ne sais pas par où commencer"
        answers["positioning"] = answers.get("positioning") or "Généraliste"
        answers["staffing_model"] = answers.get("staffing_model") or "Uniquement des CDI internes"
        answers["sales_team_size"] = answers.get("sales_team_size") or "2-3 personnes"
        for list_field in ("expertise_areas", "target_sectors", "target_company_types", "geo_zones"):
            answers[list_field] = answers.get(list_field) or ["Cloud & Infrastructure"]
    assert empty_workspace_cases(filled) == []


# ─────────────────────────────────────────────────────────────────────────
# PREUVE 3 (suite) — les détecteurs ajoutés n'attrapent pas leurs voisins.
# ─────────────────────────────────────────────────────────────────────────


def test_legitimate_false_boolean_is_not_flagged_as_a_zero():
    # `isinstance(False, int)` est VRAI : sans l'exclusion explicite, ce témoin
    # rougirait. C'est le piège que la garde doit éviter, pas celui qu'elle vise.
    assert find_zero_numbers({"analysisParameters": {"enabled": False}}) == []


def test_legitimate_non_zero_small_number_is_not_flagged_as_a_zero():
    assert find_zero_numbers({"coachingInsights": {"kpiTargets": {"accountsPerMonth": 1}}}) == []


def test_legitimate_string_zero_inside_a_range_label_is_not_flagged():
    # « 15-25% » et « 200-500 » contiennent des chiffres : ce sont des LIBELLÉS,
    # pas des mesures. Un détecteur qui lirait les chaînes les attraperait.
    assert find_zero_numbers({"kpiTargets": {"conversionRateTarget": "10-20%"}}) == []


def test_legitimate_two_cases_sharing_a_city_are_not_duplicates():
    cases = _load_all()
    parisians = [c for c in cases if "Paris & Île-de-France" in c["answers"].get("geo_zones", [])]
    assert len(parisians) >= 2, "Témoin sans objet : aucun couple de cas ne partage Paris."
    assert duplicated_answer_cases(parisians) == []


def test_legitimate_case_without_contradiction_is_not_a_muted_annotation():
    # Tous les cas ne portent pas de contradiction : `[]` est une réponse, pas
    # un champ mort. Seule une ENTRÉE vide l'est.
    case = _a_valid_case()
    case["contradictions"] = []
    assert [muted for muted in empty_annotations(case) if muted.startswith("contradictions")] == []


def test_legitimate_partially_filled_case_is_not_an_empty_workspace():
    case = _a_valid_case()
    case["answers"] = {"user_id": "u", "esn_name": "Une ESN", "consultant_size": "10-30"}
    assert empty_workspace_cases([case]) == []
