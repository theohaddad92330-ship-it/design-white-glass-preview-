"""Parité du filtre « un nom d'ESN est une société, pas une phrase » —
TS (lecture, source de vérité) ↔ Python (producteur, copie embarquée).

#1799 / #1818 — le défaut corrigé par ce fichier : deux implémentations du
MÊME filtre, dans deux langages, qui avaient divergé. Le producteur écrivait
en base des lignes que la lecture filtrait déjà — la table restait fausse, et
tout autre lecteur qui n'applique pas le même filtre les voit.

``apps/api/src/modules/partner-pipeline/esn-on-accounts-merge.ts`` est la
source de vérité (LECTURE SEULE depuis ce lot) ; ``app/services/esn_presence.py``
en porte la copie embarquée — le service IA n'a pas le paquet ``@bellum/api``
à l'exécution. Même discipline que ``test_consulting_domains_parity.py`` et
``test_buyer_role_families_parity.py`` : ce test lit le fichier TS et compare
RÈGLE PAR RÈGLE, plutôt que de faire confiance à une recopie manuelle — deux
recopies divergent, c'est exactement le défaut d'origine.

⚠️ Historique de ce fichier, pour qui le relit après un futur rebase : la
PREMIÈRE version (10/09/2026) couvrait 8 règles regex + `MAX_NAME_WORDS`, à ce
moment le seul état committé côté TS. La PR #1841 (fusionnée le 10/09/2026,
commit `d2acd1fb4`) a élargi `MULTI_ENTITY_RE` (le « / » n'exige plus ses
espaces) et ajouté `COMMA_LIST_RE` + `DASH_CERTAINTY_CLAUSE_RE` (10 règles).
Le lot 7 (branche `feat/lot7`, commit `9ec1dd8da`) a ajouté trois règles de
plus — `LOWERCASE_START_MULTIWORD_RE`, `GENERIC_HEAD_NOUN_RE`, `AMPERSAND_RE`
(13 règles au total). Ce fichier a rougi tout seul aux DEUX rebases —
exactement ce pour quoi il a été écrit. Ne PAS assouplir ce test si le TS
change encore : le porter à jour, comme ici.

⚠️ Une seule exception à la parité TEXTUELLE, documentée et ISOLÉE dans
`_TEXT_ONLY_EXEMPT` : `LOWERCASE_START_MULTIWORD_RE` (``/^\\p{Ll}\\S*\\s/u``) —
Python `re` ne supporte pas l'échappement de propriété Unicode `\\p{}` (réservé
au paquet tiers `regex`, hors périmètre). Elle reste dans `_ALL_RULE_NAMES`
(comptée, son ABSENCE d'un côté ferait toujours échouer le test) et sa parité
se prouve PAR COMPORTEMENT (le corpus transcrit de `esn-on-accounts-merge.spec.ts`,
witness « coconsult »), pas par égalité de texte.

Ce que ce fichier prouve, dans cet ordre :

 1. il LIT quelque chose (13 règles regex + `MAX_NAME_WORDS` extraites du TS,
    477 noms extraits du référentiel ESN — jamais zéro) ;
 2. le TEXTE de 12 des 13 regex Python est IDENTIQUE au texte TS, règle par
    règle — pas seulement leur effet sur quelques exemples — et la 13e
    (l'exception documentée) est quand même COMPTÉE, pas oubliée ;
 3. les 477 raisons sociales réelles du référentiel ESN
    (`esn-directory/esn-seed-names.ts`) survivent TOUTES au filtre Python,
    dans le bon ORDRE (nettoyage de décoration AVANT test de plausibilité —
    sept d'entre elles portent une parenthèse et un test qui inverserait
    l'ordre les rejetterait à tort), AUCUNE n'y porte de virgule, les noms
    « Groupe … » n'y tombent PAS sur `GENERIC_HEAD_NOUN_RE`, et les 8 raisons
    sociales portant un « & » restent chacune SEULE dans son groupe une fois
    dédupliquées — les mêmes faits que les témoins TS établissent dans
    `esn-on-accounts-merge.spec.ts` ;
 4. la garde sait dire NON : une regex falsifiée et un nom falsifié sont bien
    détectés par les comparaisons ci-dessus.

Il tourne en CI (monorepo présent) et se saute proprement dans une image de
déploiement Railway (les fichiers TS sont absents — l'image IA n'embarque pas
`apps/api`).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import esn_presence

_TS_MERGE_REL = Path("apps/api/src/modules/partner-pipeline/esn-on-accounts-merge.ts")
_TS_SEED_REL = Path("apps/api/src/modules/esn-directory/esn-seed-names.ts")

# Nom de la règle TS → attribut du module Python qui en est la copie.
# `LOWERCASE_START_MULTIWORD_RE` y figure : son ABSENCE d'un côté doit rester
# détectée (`test_le_corpus_ts_nest_pas_vide`, l'égalité d'ensembles dans
# `test_python_regex_text_mirrors_ts_source_rule_by_rule`) — seule sa
# comparaison TEXTUELLE est exemptée, voir `_TEXT_ONLY_EXEMPT`.
_ALL_RULE_NAMES = (
    "CERTAINTY_PAREN_RE",
    "SHORT_PAREN_RE",
    "CERTAINTY_SUFFIX_RE",
    "CERTAINTY_BARE_SUFFIX_RE",
    "CERTAINTY_PREFIX_RE",
    "ANY_PAREN_RE",
    "MULTI_ENTITY_RE",
    "COMMA_LIST_RE",
    "NEGATION_RE",
    "DASH_CERTAINTY_CLAUSE_RE",
    "LOWERCASE_START_MULTIWORD_RE",
    "GENERIC_HEAD_NOUN_RE",
    "AMPERSAND_RE",
)

#: Règles dont le TEXTE n'est PAS comparé caractère pour caractère — chacune
#: doit porter sa raison ici, jamais silencieusement.
_TEXT_ONLY_EXEMPT = {
    # `/^\p{Ll}\S*\s/u` — `\p{}` (propriété Unicode) n'existe pas dans `re`
    # standard. `esn_presence._starts_with_lowercase_and_a_second_word` en
    # est l'équivalent SÉMANTIQUE (`unicodedata.category(c) == "Ll"`), prouvé
    # par comportement plus bas, pas par égalité de texte.
    "LOWERCASE_START_MULTIWORD_RE",
}
_TEXT_PARITY_RULE_NAMES = tuple(name for name in _ALL_RULE_NAMES if name not in _TEXT_ONLY_EXEMPT)


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _strip_comments(source: str) -> str:
    """Retire les commentaires AVANT extraction (leçon GA-08) : ce fichier TS
    cite « probable », des parenthèses et des exemples de noms dans ses
    commentaires — un extracteur naïf les lirait comme des valeurs."""
    without_block = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"//.*$", "", without_block, flags=re.MULTILINE)


def _ts_merge_source() -> str:
    source_path = _monorepo_file(_TS_MERGE_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    return _strip_comments(source_path.read_text(encoding="utf-8"))


def _ts_rules(source: str) -> dict[str, tuple[str, str]]:
    """``const NAME_RE = /PATTERN/flags`` → {NAME_RE: (pattern, flags)}.

    Deux subtilités du littéral regex JS, prises en compte pour ne PAS
    produire de faux rouge sur un texte pourtant identique :

    - la déclaration peut être coupée sur deux lignes (``const NAME_RE =``
      puis ``/…/flags`` — cas de `DASH_CERTAINTY_CLAUSE_RE`) : `=\\s*/` plutôt
      que `= /` ;
    - un caractère de classe (`[/|]`) n'a PAS besoin d'échapper le « / » —
      seul le délimiteur du littéral l'impose ailleurs dans le corps. Le
      bloc de classe est donc reconnu comme une unité (`\\[(?:[^\\]\\\\]|\\\\.)*\\]`)
      où « / » circule librement, plutôt que de couper l'extraction dessus.
    """
    pattern = re.compile(r"const (\w+_RE) =\s*/((?:\[(?:[^\]\\]|\\.)*\]|\\.|[^/\\\n])*)/([a-z]*)")
    # `\/` (échappement du délimiteur, hors classe) redevient `/` : ce n'est
    # jamais une différence de PATTERN, seulement une contrainte du littéral
    # JS que le texte Python n'a pas.
    return {name: (body.replace("\\/", "/"), flags) for name, body, flags in pattern.findall(source)}


def _ts_max_name_words(source: str) -> int:
    match = re.search(r"const MAX_NAME_WORDS = (\d+)", source)
    assert match, "déclaration `MAX_NAME_WORDS` introuvable — le fichier a été renommé ou déplacé"
    return int(match.group(1))


def _ts_seed_names() -> tuple[str, ...]:
    source_path = _monorepo_file(_TS_SEED_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    return tuple(re.findall(r"\{ name: '((?:[^'\\]|\\.)*)', source: '\w+' \}", source))


def _python_rule(name: str) -> re.Pattern[str]:
    return getattr(esn_presence, f"_{name}")


# ── 1. la garde LIT quelque chose ────────────────────────────────────────────


def test_le_corpus_ts_nest_pas_vide():
    source = _ts_merge_source()
    rules = _ts_rules(source)
    assert len(rules) == 13, f"13 règles regex attendues côté TS, {len(rules)} extraites : {sorted(rules)}"
    assert _ts_max_name_words(source) == 6
    names = _ts_seed_names()
    assert len(names) == 477, f"477 noms attendus au référentiel ESN, {len(names)} extraits"


# ── 2. le texte de chaque regex est identique, règle par règle ──────────────


def test_python_regex_text_mirrors_ts_source_rule_by_rule():
    ts_rules = _ts_rules(_ts_merge_source())
    # L'ÉGALITÉ D'ENSEMBLES porte sur les 13 — `LOWERCASE_START_MULTIWORD_RE`
    # comprise. Son absence côté Python (un attribut `_LOWERCASE_START_MULTIWORD_RE`
    # qui n'existerait pas) resterait invisible si on ne comparait QUE
    # `_TEXT_PARITY_RULE_NAMES` : c'est le rôle de cette ligne, pas de la
    # boucle de comparaison textuelle plus bas.
    assert set(ts_rules) == set(_ALL_RULE_NAMES), (
        "le jeu de règles a changé côté TS sans suivre côté Python — "
        f"TS: {sorted(ts_rules)} / Python attendu: {sorted(_ALL_RULE_NAMES)}"
    )
    divergences = {}
    for name in _TEXT_PARITY_RULE_NAMES:
        ts_body, ts_flags = ts_rules[name]
        python_re = _python_rule(name)
        ts_ignorecase = "i" in ts_flags
        python_ignorecase = bool(python_re.flags & re.IGNORECASE)
        if python_re.pattern != ts_body or python_ignorecase != ts_ignorecase:
            divergences[name] = {
                "ts": (ts_body, ts_ignorecase),
                "python": (python_re.pattern, python_ignorecase),
            }
    assert divergences == {}, divergences


def test_lowercase_start_multiword_exemption_is_the_only_one_and_still_exists_on_both_sides():
    """La garde ne peut pas laisser l'exemption grossir en silence : un seul
    nom y figure, et les DEUX côtés qu'elle esquive doivent quand même
    exister (sinon l'exemption masquerait une règle disparue plutôt qu'une
    limite connue du module `re`)."""
    assert _TEXT_ONLY_EXEMPT == {"LOWERCASE_START_MULTIWORD_RE"}
    ts_rules = _ts_rules(_ts_merge_source())
    assert "LOWERCASE_START_MULTIWORD_RE" in ts_rules
    assert hasattr(esn_presence, "_starts_with_lowercase_and_a_second_word")


def test_max_name_words_mirrors_ts_source():
    assert esn_presence._MAX_NAME_WORDS == _ts_max_name_words(_ts_merge_source())


# ── 3. les 477 raisons sociales réelles survivent TOUTES ────────────────────


def test_all_477_esn_directory_names_survive_the_python_filter():
    """Le témoin exigé par la doctrine, côté Python : aucune des 477 raisons
    sociales réelles du référentiel ESN ne doit tomber sous une garde trop
    gourmande. L'ORDRE compte — le nettoyage de décoration tourne AVANT le
    test de plausibilité, exactement comme dans `build_esn_presence`."""
    names = _ts_seed_names()
    rejected = []
    for name in names:
        cleaned = esn_presence._strip_certainty_decoration(name)
        if not cleaned or not esn_presence._looks_like_a_company_name(cleaned):
            rejected.append(name)
    assert rejected == [], f"{len(rejected)}/{len(names)} raisons sociales réelles écartées à tort : {rejected}"


def test_seven_parenthesized_seed_names_need_the_strip_before_plausibility_order():
    """Piège déjà trouvé côté TS aujourd'hui, à ne pas refaire : appeler la
    plausibilité sur le nom BRUT rejette à tort les sept entrées du
    référentiel qui portent une parenthèse. Ce test échoue si quelqu'un
    inverse l'ordre dans `build_esn_presence`."""
    names = [n for n in _ts_seed_names() if "(" in n]
    assert len(names) == 7, f"7 noms parenthésés attendus au référentiel, {len(names)} trouvés : {names}"
    wrongly_rejected_without_strip = [n for n in names if not esn_presence._looks_like_a_company_name(n)]
    assert wrongly_rejected_without_strip == names, (
        "ces noms devraient tous être rejetés SANS le nettoyage préalable — "
        "sinon ce témoin ne teste plus le piège qu'il prétend couvrir"
    )
    survives_with_strip = [
        n
        for n in names
        if esn_presence._looks_like_a_company_name(esn_presence._strip_certainty_decoration(n))
    ]
    assert survives_with_strip == names


def test_none_of_the_477_seed_names_carry_a_comma():
    """Le même fait que le témoin TS établit dans `esn-on-accounts-merge.spec.ts` :
    `COMMA_LIST_RE` est structurelle (n'importe quelle virgule), donc si une
    des 477 raisons sociales en portait une réellement, elle devrait quand
    même survivre — ce n'est pas le cas ici, aucune des 477 n'en a. Ce test
    répond à la question posée par la consigne plutôt que de l'affirmer à
    part : c'est une information sur le RÉFÉRENTIEL, pas sur la règle."""
    with_comma = [n for n in _ts_seed_names() if "," in n]
    assert with_comma == []


def test_coconsult_is_a_real_seed_name_stylised_in_lowercase_and_survives():
    """« coconsult » est la RAISON pour laquelle `LOWERCASE_START_MULTIWORD_RE`
    porte sur la PHRASE (minuscule ET plusieurs mots), jamais sur la casse
    d'un mot seul. Sans ce témoin, rien ne prouverait que cette vraie ESN du
    référentiel est bien celle qui a motivé la nuance côté TS."""
    names = _ts_seed_names()
    assert "coconsult" in names, "le référentiel a changé — ce nom n'y est plus, le témoin ne teste plus rien"
    assert esn_presence._looks_like_a_company_name(esn_presence._strip_certainty_decoration("coconsult")) is True


def test_groupe_prefixed_seed_names_do_not_fall_on_the_generic_head_noun_rule():
    """`GENERIC_HEAD_NOUN_RE` EXCLUT délibérément « Groupe » — voir le
    docblock TS. Ce témoin lit les noms « Groupe … » RÉELS du référentiel
    (pas inventés) et prouve qu'aucun n'est écarté.

    ⚠️ Piège d'ORDRE (déjà trouvé une fois sur les 7 noms parenthésés, ne pas
    le refaire ici) : `_strip_certainty_decoration` tourne AVANT la
    plausibilité — « Groupe SII (SII) » porte une parenthèse COURTE (un
    second nom, pas une phrase) que le nettoyage retire ; la juger sur sa
    forme brute la rejetterait à tort via `ANY_PAREN_RE`, pour une raison
    qui n'a rien à voir avec `GENERIC_HEAD_NOUN_RE`.
    """
    groupe_names = [n for n in _ts_seed_names() if n.lower().startswith("groupe ")]
    assert len(groupe_names) >= 3, f"au moins 3 noms « Groupe … » attendus au référentiel, trouvés : {groupe_names}"
    rejected = [
        n for n in groupe_names if not esn_presence._looks_like_a_company_name(esn_presence._strip_certainty_decoration(n))
    ]
    assert rejected == []


def test_the_eight_ampersand_seed_names_each_stay_alone_in_their_own_group():
    """Le témoin à l'échelle POUR CETTE RÈGLE-CI précisément (même esprit que
    le « 455 groupes avant, 455 après » du commit TS) : le repli « & » → « et »
    ne doit faire fusionner AUCUNE paire de raisons sociales distinctes.
    Adapté à la structure Python (`build_esn_presence` ne porte pas de
    compte `accounts` — une seule entrée par compétiteur détecté dans UN
    run) : chacun des 8 noms doit ressortir, TEL QUEL, de son propre passage."""
    names = _ts_seed_names()
    ampersand_names = [n for n in names if "&" in n]
    assert len(ampersand_names) == 8, f"8 raisons sociales avec « & » attendues, {len(ampersand_names)} trouvées"
    out = esn_presence.build_esn_presence([{"name": n} for n in ampersand_names])
    assert sorted(e["name"] for e in out) == sorted(ampersand_names), (
        "le repli « & » → « et » a fait fusionner au moins deux de ces huit raisons sociales entre elles"
    )


def test_ampersand_fold_merges_the_same_entity_measured_twice():
    """Reproduction directe du cas mesuré en production le 10/09/2026 :
    « Crédit Agricole Technologies & Services » et « … et Services » sont la
    MÊME entité. `dedup_by_name` (Python) est plus faible que `marketMatchKey`
    (TS) — il ne retire pas les mots de structure — donc le repli local suffit
    ICI à lui seul à les rapprocher, sans transformer `text_norm.normalize_name`."""
    out = esn_presence.build_esn_presence(
        [
            {"name": "Crédit Agricole Technologies & Services"},
            {"name": "Crédit Agricole Technologies et Services"},
        ]
    )
    assert len(out) == 1


def test_ampersand_fold_does_not_merge_elsan_and_elsan_services():
    """TÉMOIN — rappel explicite du docblock de `mergeEsnByMatchKey` côté TS,
    rejoué ici : le repli « & » → « et » n'a rien à voir avec ce rapprochement,
    et ne doit pas le faire dériver. Deux entités qui diffèrent d'un mot
    restent deux entités."""
    out = esn_presence.build_esn_presence([{"name": "ELSAN"}, {"name": "ELSAN Services"}])
    assert len(out) == 2


# ── 4. la garde sait dire NON ────────────────────────────────────────────────


def test_a_falsified_python_pattern_would_be_caught():
    """Casse volontairement ce que la parité protège : sans ce test, rien ne
    prouverait que la comparaison ci-dessus REGARDE le texte des regex — elle
    passerait aussi si les deux côtés étaient vides ou ignorés."""
    ts_rules = _ts_rules(_ts_merge_source())
    falsified = dict(ts_rules)
    falsified["ANY_PAREN_RE"] = ("this-is-not-the-real-pattern", "")
    divergences = {
        name
        for name in _TEXT_PARITY_RULE_NAMES
        if falsified[name][0] != _python_rule(name).pattern
        or ("i" in falsified[name][1]) != bool(_python_rule(name).flags & re.IGNORECASE)
    }
    assert divergences == {"ANY_PAREN_RE"}


def test_a_falsified_seed_name_would_be_caught_by_the_477_witness():
    """Même preuve pour le témoin des 477 : une entrée mêlée qui NE devrait
    PAS survivre (une liste séparée par des virgules, comme mesuré en
    production sur `/accounts/partners` le 10/09/2026 — « Capgemini,
    Accenture, Sopra Steria, Atos ») doit être détectée par la même boucle
    que `test_all_477_esn_directory_names_survive_the_python_filter`."""
    falsified_names = (*_ts_seed_names(), "Capgemini, Accenture, Sopra Steria, Atos")
    rejected = [
        n
        for n in falsified_names
        if not esn_presence._looks_like_a_company_name(esn_presence._strip_certainty_decoration(n))
    ]
    assert rejected == ["Capgemini, Accenture, Sopra Steria, Atos"]
