"""BEL-SC-239 (#3268) — le closing dans /chat, pratiqué naturellement.

Le ticket est explicite : cinq étapes SUGGÉRÉES, jamais un script obligatoire,
et Bellum ne doit ni créer de pression artificielle ni inventer une urgence
(le NO-GO du ticket, mot pour mot). Ce test verrouille que le bloc porte les
cinq étapes, dit qu'elles ne sont pas un ordre imposé, dit qu'il s'adapte
(stade/relation/risque/objections/urgence/style), et refuse toute urgence
inventée — et qu'il ne NOMME jamais la méthode (règle 12 de l'instruction
commune #3249).
"""

from __future__ import annotations

from app.prompts.laura_closing_support import build_closing_support_block


def test_le_bloc_porte_les_cinq_etapes_suggerees() -> None:
    block = build_closing_support_block()
    for step in ("vérifier les acquis", "résumer le", "nommer les risques", "une ou deux options", "la décision"):
        assert step in block


def test_le_bloc_dit_que_ce_n_est_pas_un_script_impose() -> None:
    block = build_closing_support_block()
    assert "jamais un ordre obligatoire" in block or "jamais un script imposé" in block


def test_le_bloc_liste_les_cinq_axes_d_adaptation() -> None:
    block = build_closing_support_block()
    for axis in ("stade", "relation", "risque", "objections", "urgence", "style"):
        assert axis in block.lower()


def test_le_bloc_refuse_la_pression_artificielle_et_l_urgence_inventee() -> None:
    """Le NO-GO du ticket, mot pour mot : Bellum ne crée pas de pression
    artificielle et n'invente pas d'urgence."""
    block = build_closing_support_block()
    assert "pression artificielle" in block
    assert "urgence inventée" in block or "jamais supposée" in block


def test_le_bloc_ne_nomme_jamais_salesconnect() -> None:
    """Règle 12 de l'instruction commune #3249 : Laura applique la méthode
    naturellement, elle ne la récite pas et ne la nomme pas."""
    block = build_closing_support_block()
    assert "salesconnect" not in block.lower()
    assert "bible" not in block.lower()


def test_le_bloc_cable_la_prochaine_etape_vers_une_proposition() -> None:
    """#3301 (reste de #3268) : la prochaine étape identifiée en closing se
    propose via `propose_opportunity_update` (champ `next_step`, porte
    d'approbation existante) — jamais une écriture directe, jamais un nouvel
    objet Action concurrent."""
    block = build_closing_support_block()
    assert "propose_opportunity_update" in block
    assert "next_step" in block


def test_le_bloc_dit_que_ca_reste_une_proposition_jamais_une_ecriture() -> None:
    block = build_closing_support_block()
    assert "propose" in block.lower()
    assert "jamais une écriture directe" in block or "jamais directement" in block
