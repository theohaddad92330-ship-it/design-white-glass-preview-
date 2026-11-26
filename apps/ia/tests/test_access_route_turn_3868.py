"""#3868 (BEL-LAU-1008-017, bêta 08/10) — comparer les voies d'accès sans mélanger client final,
partenaire commercial, titulaire de marché et centrale d'achat, ni inventer de référencement."""

from __future__ import annotations

from app.prompts.access_route_turn import access_route_comparison_turn_block


def test_unrelated_message_yields_no_block() -> None:
    assert access_route_comparison_turn_block("Quel est le SIREN de Thales ?") == ""


def test_access_route_comparison_distinguishes_the_four_ways_in() -> None:
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "VOIE DIRECTE" in block
    assert "VOIE PARTENAIRE" in block
    # VU (recette prod 09/10, lot H05) — « titulaire de marché » n'avait aucun bloc dédié, seulement
    # une mention dans la phrase d'intro : Laura ne la nommait jamais dans sa réponse réelle.
    assert "TITULAIRE DE MARCHÉ" in block
    assert "CENTRALE D'ACHAT OU DISPOSITIF DE PORTAGE COMMERCIAL" in block
    assert "jamais par le seul vocabulaire" in block


def test_answer_shape_names_each_route_never_a_single_sentence() -> None:
    # #3868 (recette NB 10/10) — « Compare les voies d'accès » rendait UNE phrase
    # (« comparables, aucune ne prouve… »), 0 des 4 voies nommées : la forme se pose.
    fr = access_route_comparison_turn_block("Compare les voies d'accès pour le compte SG")
    assert "FORME OBLIGATOIRE" in fr
    assert "UNE rubrique par voie" in fr
    assert "Jamais une phrase de synthèse unique" in fr
    assert "non établie" in fr
    en = access_route_comparison_turn_block("Compare the access route options", english=True)
    assert "MANDATORY SHAPE" in en
    assert "ONE section per route" in en


def test_titulaire_de_marche_is_distinguished_from_a_partner_or_a_framework() -> None:
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "distincte d'un simple partenaire ou d'une centrale d'achat" in block
    assert "n'est pas titulaire du marché ACTUEL tant que sa date et son périmètre ne sont pas reconfirmés" in block


def test_centrale_d_achat_requires_verification_not_a_blanket_authorization() -> None:
    block = access_route_comparison_turn_block("On peut passer par une centrale d'achat ?")
    assert "ne devient PAS une autorisation générale" in block
    assert "CE compte" in block and "CE périmètre" in block and "CETTE prestation" in block


def test_partner_is_never_presented_as_referenced_without_proof() -> None:
    block = access_route_comparison_turn_block("Quelle voie pour entrer chez eux : direct ou partenaire ?")
    assert "ne prouve ni un référencement actuel ni une volonté de sous-traiter" in block
    assert "JAMAIS un partenaire comme référencé sans cette preuve" in block


def test_no_margin_computed_from_an_invented_rate() -> None:
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "Aucun calcul de marge ne repose sur un taux inventé" in block


def test_access_correction_is_carried_into_strategy_and_actions() -> None:
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "reprise dans la stratégie ET dans les actions qui en découlent" in block


def test_esn_exclusion_is_a_conversational_check_never_a_fabricated_field() -> None:
    """Aucun champ structuré « ESN exclues » n'existe dans la base (vérifié) : le respect de
    l'exclusion se lit dans la conversation, jamais dans un paramètre inventé par ce module."""
    import inspect

    assert "excluded_esn" not in inspect.signature(access_route_comparison_turn_block).parameters
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "exclu les ESN plus haut dans cette conversation" in block


def test_a_failed_access_read_still_gets_a_best_effort_classification() -> None:
    """VU (recette prod 09/10, lot H05) — Laura répondait « je ne peux pas classer fermement les
    trois voies » dès que la lecture détaillée de l'accès échouait, au lieu de classer avec ce
    qu'elle savait déjà (ESN observées, mémoire marché, notes)."""
    block = access_route_comparison_turn_block("Compare les voies d'accès possibles pour ce compte")
    assert "tu classes QUAND MÊME avec ce que tu sais déjà par ailleurs" in block
    assert "tu ne te replies JAMAIS sur un refus de classer toutes les voies" in block


def test_english_variant_never_mixes_languages() -> None:
    block = access_route_comparison_turn_block("Compare the access routes for this account", english=True)
    assert "ACCESS ROUTE COMPARISON" in block
    assert "VOIE DIRECTE" not in block
    assert "never present a partner as referenced without that proof" in block
    assert "CONTRACT HOLDER (titulaire de marché)" in block
    assert "you still classify with whatever else you already know" in block
