"""Le portefeuille d'offre atteint les prompts — et son lexique s'y applique.

Addendum Stelya §17-18. Deux choses sont vérifiées ici, et la seconde est celle
qui compte : qu'un espace SANS portefeuille produise des prompts byte-identiques
(tous les espaces existants sont dans ce cas), et qu'un espace qui en a un voie
ses secteurs, sa politique de site et ses termes interdits arriver au modèle.
"""

from __future__ import annotations

from typing import Any

from app.prompts import bellum_contacts, bellum_facts, bellum_signals, bellum_strategy
from app.services.portfolio_context import portfolio_context_block
from app.services.seller_context import esn_row_to_profile_data

_STELYA_ROW = {
    "esn_name": "Stelya",
    "expertise_areas": ["Bureau d'études", "Méthodes"],
    "offer_domains": ["MECHANICAL_ENGINEERING", "INDUSTRIALIZATION_METHODS"],
    "offer_portfolio": {
        "version": 1,
        "company_type": None,
        "target_application_sectors": ["nuclear", "rail", "automotive"],
        "target_site": {"types": ["usine", "bureau d’études"], "min_headcount": 100},
        "target_geographies": ["AURA", "PACA"],
        "preferred_buyer_role_families": [],
        "secondary_gatekeeper_role_families": [],
        "preferred_terms": ["société de conseil en ingénierie", "intervention sur site"],
        "forbidden_terms": ["ESN", "régie", "cabinet"],
        "privacy": {"feedback_reuse": "tenant_private"},
    },
}


def test_row_without_portfolio_carries_no_context() -> None:
    """Aucun portefeuille = aucune clé ajoutée. C'est ce qui garantit que les
    espaces existants gardent des prompts byte-identiques."""
    profile = esn_row_to_profile_data({"esn_name": "ACME", "offer_domains": []})
    assert "offerPortfolioContext" not in profile


def test_empty_portfolio_object_is_not_a_context() -> None:
    """Un portefeuille enregistré mais VIDE ne dit rien : rendre un bloc
    « secteurs visés : (aucun) » ferait lire une contrainte là où il n'y en a
    pas."""
    profile = esn_row_to_profile_data(
        {
            "esn_name": "ACME",
            "offer_portfolio": {"target_application_sectors": [], "target_site": {"types": []}},
        }
    )
    assert "offerPortfolioContext" not in profile


def test_portfolio_reaches_profile_data() -> None:
    profile = esn_row_to_profile_data(_STELYA_ROW)
    context = profile["offerPortfolioContext"]
    # Les secteurs voyagent en LIBELLÉS français : c'est ce que le modèle lit.
    assert context["applicationSectors"] == ["Nucléaire", "Ferroviaire", "Automobile"]
    assert context["siteTypes"] == ["usine", "bureau d’études"]
    assert context["siteMinHeadcount"] == 100
    assert context["forbiddenTerms"] == ["ESN", "régie", "cabinet"]


def test_zero_headcount_is_absent_never_zero() -> None:
    """`null` (aucun seuil) et `0` ne disent pas la même chose — et le second
    se lirait « je vise les sites de zéro personne »."""
    row = {**_STELYA_ROW, "offer_portfolio": {**_STELYA_ROW["offer_portfolio"], "target_site": {"types": [], "min_headcount": None}}}
    context = esn_row_to_profile_data(row)["offerPortfolioContext"]
    assert "siteMinHeadcount" not in context


def test_block_is_empty_without_context() -> None:
    assert portfolio_context_block({}) == ""
    assert portfolio_context_block({"offerPortfolioContext": {}}) == ""


def test_block_names_the_forbidden_terms_and_their_replacement() -> None:
    block = portfolio_context_block(esn_row_to_profile_data(_STELYA_ROW))
    assert "ESN" in block
    assert "société de conseil en ingénierie" in block
    # Le seuil de site est une PRÉFÉRENCE d'espace, et le bloc le dit — sinon un
    # modèle l'appliquerait comme une règle et écarterait un site de 80.
    assert "préférence" in block.lower()


def test_system_prompts_carry_the_portfolio_block() -> None:
    profile = esn_row_to_profile_data(_STELYA_ROW)
    for builder in (bellum_facts, bellum_signals, bellum_strategy, bellum_contacts):
        rendered = builder.build_system_prompt(profile)
        assert "PORTEFEUILLE" in rendered
        assert "Nucléaire" in rendered


def test_system_prompts_unchanged_without_portfolio() -> None:
    """La non-régression, mesurée : le même profil sans portefeuille rend
    exactement le prompt d'avant."""
    without = {k: v for k, v in _STELYA_ROW.items() if k != "offer_portfolio"}
    rendered = bellum_facts.build_system_prompt(esn_row_to_profile_data(without))
    assert "PORTEFEUILLE" not in rendered


def test_copilot_receives_the_same_lens_and_lexicon() -> None:
    """Le copilote lisait le profil en texte brut et AUCUNE lentille de domaine :
    il raisonnait en IT par défaut pendant que le pipeline raisonnait dans le
    domaine du vendeur — deux réponses possibles à la même question selon
    l'écran."""
    from app.prompts import bellum_advisor

    profile = esn_row_to_profile_data(_STELYA_ROW)
    rendered = bellum_advisor.build_system_prompt(profile, {}, "", "")
    assert "PORTEFEUILLE" in rendered
    # Le lexique de l'espace atteint le copilote : c'est lui qui écrit les
    # messages que le commercial envoie.
    assert "ESN" in rendered and "société de conseil en ingénierie" in rendered
    # Et la lentille industrielle, pas la lentille IT.
    assert "INGÉNIERIE INDUSTRIELLE" in rendered


def test_copilot_prompt_unchanged_without_portfolio_or_domain() -> None:
    from app.prompts import bellum_advisor

    rendered = bellum_advisor.build_system_prompt({"companyName": "ACME"}, {}, "", "")
    # Les BLOCS de portefeuille, pas le mot : la règle statique « GROUPE HORS PORTEFEUILLE » (#3247.r40)
    # parle d'un groupe absent du portefeuille, elle n'en apporte aucun.
    assert "PORTEFEUILLE D'OFFRE" not in rendered
    assert "PORTEFEUILLE DE COMPTES" not in rendered
    assert "DOMAINE D'OFFRE" not in rendered


# ── D17 — le lexique STRUCTURÉ (les objets du produit, nommés par l'équipe) ───


def _row_with_lexicon(lexicon: Any) -> dict[str, Any]:
    return {
        **_STELYA_ROW,
        "offer_portfolio": {**_STELYA_ROW["offer_portfolio"], "lexicon": lexicon},
    }


def test_no_structured_lexicon_leaves_the_context_untouched() -> None:
    """Un espace sans lexique structuré ne gagne AUCUNE clé — c'est le no-op
    strict qui garantit que les prompts existants sont byte-identiques."""
    context = esn_row_to_profile_data(_STELYA_ROW)["offerPortfolioContext"]
    assert "lexiconTerms" not in context


def test_structured_lexicon_reaches_the_prompt_with_the_word_it_replaces() -> None:
    """Deux listes plates ne peuvent pas dire ce qu'un mot REMPLACE : « Poste »
    seul ne dit pas qu'il remplace « Besoin ». Le lexique structuré, si — et
    c'est précisément ce qui manquait pour que l'INTERFACE puisse renommer."""
    profile = esn_row_to_profile_data(
        _row_with_lexicon(
            {
                "overrides": [
                    {"concept": "need", "locale": "fr", "one": "Poste", "other": "Postes"},
                    {"concept": "talent_pool", "locale": "fr", "one": "Banc", "other": "Bancs"},
                ]
            }
        )
    )
    assert profile["offerPortfolioContext"]["lexiconTerms"] == [
        {"default": "Besoin", "term": "Poste"},
        {"default": "Vivier", "term": "Banc"},
    ]
    block = portfolio_context_block(profile)
    assert "« Besoin » se dit « Poste »" in block
    assert "« Vivier » se dit « Banc »" in block


def test_english_overrides_do_not_reach_the_french_prompt() -> None:
    """Les prompts sont écrits en français ; mélanger deux langues dans la même
    consigne produirait un modèle qui hésite. La surcharge anglaise reste vraie
    pour l'INTERFACE, qui la lit dans sa propre langue."""
    row = _row_with_lexicon({"overrides": [{"concept": "need", "locale": "en", "one": "Role", "other": "Roles"}]})
    assert "lexiconTerms" not in esn_row_to_profile_data(row)["offerPortfolioContext"]


def test_a_broken_lexicon_never_breaks_an_analysis() -> None:
    """Une forme abîmée dégrade vers « aucune surcharge » — un réglage illisible
    ne doit pas faire tomber toutes les analyses de l'espace."""
    for broken in ("n'importe quoi", {"overrides": "pas une liste"}, {"overrides": [None, 42]}, {}):
        context = esn_row_to_profile_data(_row_with_lexicon(broken))["offerPortfolioContext"]
        assert "lexiconTerms" not in context


def test_laura_speaks_the_words_the_screen_shows() -> None:
    """Laura (D82) doit employer le mot que l'écran AFFICHE : sans cela elle
    écrirait « ton besoin » à quelqu'un dont la navigation dit « Postes ». C'est
    la moitié « voix » du lexique, en accord avec la moitié « libellés »."""
    from app.prompts import bellum_advisor

    profile = esn_row_to_profile_data(
        _row_with_lexicon({"overrides": [{"concept": "need", "locale": "fr", "one": "Poste", "other": "Postes"}]})
    )
    rendered = bellum_advisor.build_system_prompt(profile, {}, "", "")
    assert "« Besoin » se dit « Poste »" in rendered
