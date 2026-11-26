"""LAU-FINAL-252 (#3342) — stratégie consultant sur le bench.

Demande initiale : « J'ai un consultant sur le bench. Ça serait quoi ta
stratégie ? Trouve-moi des pistes, besoins et clients. » Laura a rendu une
liste de besoins prétendument compatibles sans jamais répondre à la demande
de STRATÉGIE. Portée par `_BLOCK_CONSULTANT_BENCH_STRATEGY` dans
`build_system_prompt`."""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_CONSULTANT_BENCH_STRATEGY,
    build_system_prompt,
)


def test_never_a_bare_list_of_compatible_needs():
    """#3342.0 — jamais une simple liste de besoins compatibles."""
    assert "tu ne rends JAMAIS une simple liste de besoins compatibles" in _BLOCK_CONSULTANT_BENCH_STRATEGY


def test_quick_diagnostic_names_its_five_facets():
    """#3342.1 — le diagnostic rapide, cinq facettes."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "DIAGNOSTIC RAPIDE" in block
    for facet in (
        "ce que Bellum sait du consultant",
        "ce qu'il faut encore confirmer",
        "le niveau d'urgence",
        "le risque économique éventuel",
        "ta capacité actuelle de recherche",
    ):
        assert facet in block, f"facette absente : {facet!r}"


def test_four_terrains_named():
    """#3342.2 — les quatre terrains à travailler en parallèle."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "QUATRE TERRAINS" in block
    for terrain in (
        "besoins réellement ouverts",
        "signaux actuels à qualifier",
        "comptes historiquement compatibles",
        "partenaires ou ESN pouvant porter le profil",
    ):
        assert terrain in block, f"terrain absent : {terrain!r}"


def test_prioritisation_names_its_six_fields_per_lead():
    """#3342.3 — six champs par piste retenue."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "PRIORISATION" in block
    for field in (
        "pourquoi elle correspond",
        "son niveau de preuve",
        "sa voie d'accès",
        "la personne ou le rôle à contacter",
        "la première action",
        "ce qui doit être vérifié",
    ):
        assert field in block, f"champ absent : {field!r}"


def test_short_plan_and_stop_conditions():
    """#3342.4 / #3342.5 — plan court réaliste et conditions d'arrêt."""
    assert "PLAN COURT" in _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "CONDITIONS D'ARRÊT" in _BLOCK_CONSULTANT_BENCH_STRATEGY


def test_names_the_six_forbidden_reflexes():
    """#3342.6 — les six réflexes à ne plus appliquer."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    for reflex in (
        "réduire la demande à un matching avec les besoins déjà présents",
        "produire une liste sans ordre d'action",
        "oublier les partenaires",
        "oublier les anciens clients et relations",
        "ne pas dire qui contacter ni pourquoi",
        "attendre que l'utilisateur redemande séparément chaque étape",
    ):
        assert reflex in block, f"réflexe absent : {reflex!r}"


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "STRATÉGIE CONSULTANT SUR LE BENCH" in prompt


def test_3342_7_plan_court_and_stop_conditions_are_never_deferred():
    """Recette en prod du 30/09 (commit 4a18b099a2) : PARTIEL — le plan court
    (sprint) et les conditions d'arrêt absents de la PREMIÈRE réponse. Mesuré
    avant d'écrire : le bloc listait bien les cinq temps, mais rien n'empêchait
    la densité générale (`_BLOCK_FORMAT`, « commence court, déplie à la
    demande ») de les faire passer pour des détails secondaires repliés
    derrière « voir le détail ». Ce test verrouille l'exception explicite."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "TOUJOURS LIVRÉS ENSEMBLE, DANS LA PREMIÈRE RÉPONSE" in block
    assert "jamais reportés à un tour suivant" in block
    assert "cette demande vaut toujours DEEP" in block
    assert "PLAN COURT et CONDITIONS D'ARRÊT ne sont pas des détails secondaires" in block


def test_3342_8_a_later_request_in_the_same_thread_also_gets_all_five_temps():
    """#3342 (reste, D02 30/09) — recette prod : « Plan court et conditions
    d'arrêt présents au 1er tour. RESTE : report aux tours suivants non
    vérifié. » #3342.7 ne verrouillait que LA PREMIÈRE réponse d'une
    conversation ; rien n'empêchait `_BLOCK_FORMAT`/NIVEAU DE RÉPONSE (« ne
    pas répéter... déjà donnés au tour précédent ») de justifier un repli des
    temps 4/5 sur une DEUXIÈME demande de stratégie plus tard dans le même
    fil. Ce test verrouille l'exception explicite."""
    block = _BLOCK_CONSULTANT_BENCH_STRATEGY
    assert "MÊME PLUS TARD DANS LA MÊME CONVERSATION" in block
    assert "NOUVELLE demande de stratégie" in block
    assert "ne pas répéter une limite ou un pan du profil déjà donnés au tour précédent" in block
    assert "ne s'applique JAMAIS au gabarit en cinq temps lui-même" in block
