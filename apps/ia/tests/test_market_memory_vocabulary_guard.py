"""#1629.2 — la garde TRANSVERSE du vocabulaire de la mémoire marché.

Le vocabulaire (« observé », jamais « en place ») était déjà confirmé sur deux
textes isolés — la description de `search_market_memory`
(`test_copilote_prompt_blocks.py::test_search_market_memory_tool_description_avoids_current_state_wording`)
et le bloc « mémoire structurelle » du prompt copilote (`bellum_advisor.py`,
même fichier) — chacun avec SA PROPRE liste de mots interdits, légèrement
différente des deux autres (`test_discover_scoring_path_axis.py` en a une
troisième, pour l'evidence de l'axe CHEMIN). Rien ne tenait le vocabulaire sur
le RESTE du registre d'outils (`search_partners`, `get_territory_overview`,
`get_account_access`…) ni sur le 4ᵉ bloc du prompt d'analyse ajouté par #1590.

Ce fichier ne réécrit pas ces trois tests : il ajoute la garde qui balaie tout
le reste, à partir d'UNE seule liste (`market_memory_wording.py`), et se
détecte elle-même sur les surfaces qui n'existent pas encore.

⚠️ CE QUI N'EST PAS BALAYÉ TEL QUEL, ET POURQUOI — la découverte centrale de ce
lot : la description de `get_esn_on_account` et le prompt copilote
(`bellum_advisor.py`) CITENT délibérément des mots interdits, en exemple —
« elle SEULE autorise « est en place » » pour la source DÉCLARÉE côté
`get_esn_on_account`, « recrute » comme marqueur de question ACTUELLE dans la
RÈGLE TEMPORELLE du prompt copilote. Un balayage brut de ces DEUX textes
échouerait sur du texte CORRECT — exactement le défaut que le brief demande
d'éviter (« elle n'attrape pas ce qu'elle ne vise pas »). `bellum_advisor.py`
garde donc son test dédié, plus nuancé, déjà en place ; `get_esn_on_account`
reçoit ici un test SURGICAL qui isole la clause déclarée avant de balayer le
reste.
"""

from __future__ import annotations

from app.services import chat_tools
from app.services.market_memory_wording import (
    MARKET_MEMORY_FORBIDDEN_WORDING,
    market_memory_forbidden_hits,
    mentions_market_memory,
)


def _tool(name: str) -> dict:
    return next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)


# ── (a) La garde sait dire NON ───────────────────────────────────────────────


def test_the_guard_flags_a_forbidden_word_injected_into_a_market_memory_text() -> None:
    """Preuve directe : un texte qui PARLE de mémoire marché et qui affirme un
    fait actuel est détecté — indépendamment de tout texte réel du dépôt."""
    poisoned = "Cette observation structurelle confirme qu'ALTEN recrute sur ce compte."
    assert mentions_market_memory(poisoned)
    assert market_memory_forbidden_hits(poisoned) == ["recrute"]


def test_the_guard_stays_silent_on_a_clean_market_memory_text() -> None:
    clean = "Cette observation structurelle relie ALTEN à cet environnement — à qualifier."
    assert mentions_market_memory(clean)
    assert market_memory_forbidden_hits(clean) == []


# ── (b) La garde LIT quelque chose — le corpus n'est pas vide ────────────────


def _market_memory_tool_descriptions() -> dict[str, str]:
    """Les descriptions d'outils qui PARLENT de mémoire marché — la scope de
    la garde transverse, découverte par le TEXTE, jamais une liste de noms
    tenue à la main (c'est justement l'absence de cette liste qui laissait
    passer `search_partners`/`get_territory_overview` sans qu'on le remarque)."""
    return {
        tool["name"]: str(tool["description"])
        for tool in chat_tools.CHAT_TOOLS
        if mentions_market_memory(str(tool["description"]))
    }


def test_the_scanned_corpus_is_not_empty() -> None:
    matched = _market_memory_tool_descriptions()
    assert matched, "aucun outil ne parle de mémoire marché — la garde ne lirait rien"
    assert "search_market_memory" in matched
    assert "get_esn_on_account" in matched


def test_the_forbidden_wording_list_itself_is_not_empty() -> None:
    assert len(MARKET_MEMORY_FORBIDDEN_WORDING) >= 4


# ── Le balayage transverse, sur ce que le texte désigne lui-même ─────────────


def test_no_tool_description_matched_by_the_indicator_leaks_forbidden_wording() -> None:
    """`search_market_memory` — et tout FUTUR outil qui se mettrait à parler de
    mémoire marché — n'a AUCUN carve-out : zéro mot interdit, strictement.

    `get_esn_on_account` est le SEUL exclu ici : sa clause DÉCLARÉE énumère
    volontairement les mots que CETTE source autorise (voir le test dédié
    ci-dessous, qui balaie quand même le reste de son texte)."""
    for name, description in _market_memory_tool_descriptions().items():
        if name == "get_esn_on_account":
            continue
        hits = market_memory_forbidden_hits(description)
        assert hits == [], (name, hits)


def test_get_esn_on_account_only_permits_the_forbidden_words_in_its_declared_clause() -> None:
    """La clause « elle SEULE autorise… » nomme en toutes lettres ce qu'une
    déclaration humaine (source `declared`) a le droit d'affirmer — un fait de
    première main, pas une observation. Ce test isole CETTE clause et prouve
    deux choses : le reste du texte (observée / inférée) est propre, ET la
    clause retirée portait réellement les mots — sinon ce test ne prouverait
    rien sur le texte vivant."""
    description = str(_tool("get_esn_on_account")["description"])
    start = description.index("elle SEULE autorise")
    end = description.index(")", start) + 1
    declared_clause = description[start:end]
    remainder = description[:start] + description[end:]

    assert market_memory_forbidden_hits(remainder) == []
    # Témoin : la clause retirée portait bien des mots interdits — sinon
    # l'extraction ci-dessus serait un no-op qui ne testerait rien.
    assert market_memory_forbidden_hits(declared_clause) != []


# ── (c) La garde n'attrape pas ce qu'elle ne vise pas ────────────────────────


def test_territory_overview_hiring_signal_is_untouched_because_it_is_not_market_memory() -> None:
    """Témoin explicite demandé par le brief : « qui recrute le plus » décrit
    des OFFRES D'EMPLOI datées (un fait actuel, légitime), jamais une
    observation de mémoire marché. La garde doit s'en désintéresser
    ENTIÈREMENT — elle ne doit même pas ENTRER dans le corpus scanné."""
    description = str(_tool("get_territory_overview")["description"])
    assert "recrute" in description.lower()
    assert not mentions_market_memory(description)
    matched = _market_memory_tool_descriptions()
    assert "get_territory_overview" not in matched


def test_find_accounts_example_query_about_hiring_is_untouched() -> None:
    """Second témoin : un exemple de question utilisateur (« qui recrute des
    développeurs ») dans la description de `find_accounts` — un fait actuel
    sur des offres d'emploi, sans rapport avec la mémoire marché."""
    description = str(_tool("find_accounts")["description"])
    assert "recrute" in description.lower()
    assert not mentions_market_memory(description)


def test_account_access_incumbent_wording_is_untouched_because_it_is_a_public_tender_fact() -> None:
    """Troisième témoin : « titulaire en place » sur `get_account_access` décrit
    un marché public ATTRIBUÉ (DECP, un fait daté et sourcé), pas une
    observation de mémoire marché — la garde doit le laisser passer."""
    description = str(_tool("get_account_access")["description"])
    assert "en place" in description.lower()
    assert not mentions_market_memory(description)


def test_bellum_advisor_temporal_rule_keeps_its_own_dedicated_test() -> None:
    """Documente pourquoi le prompt copilote n'est PAS ajouté au balayage brut
    ci-dessus : sa RÈGLE TEMPORELLE cite « recrute » comme marqueur de question
    ACTUELLE (enseigner la distinction EXIGE le mot). Son vocabulaire reste
    gardé par `test_copilote_prompt_blocks.py`
    (`test_market_memory_is_structural_and_never_proves_a_current_state_alone`,
    `test_temporal_rule_requires_verification_for_a_current_question`), pas ici
    — un balayage brut de ce texte échouerait sur du contenu CORRECT."""
    from app.prompts.bellum_advisor import build_system_prompt

    bare = build_system_prompt({}, {}, "", "")
    assert mentions_market_memory(bare)
    assert "recrute" in bare.lower()
