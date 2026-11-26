"""#1611.5 — LE POINT LE PLUS DÉLICAT DU LOT : un message généré avec de la
mémoire marché disponible ne doit JAMAIS contenir de compte de parcours, de nom
d'ESN observée, ni d'allusion à « ce qu'on sait de vous ».

L'interdit n'est pas tenu par une consigne de prompt (un modèle peut l'oublier),
il est tenu par la CHAÎNE D'APPELS : `reinforced_expertises` (déjà testée dans
`test_market_memory_angle.py`) ne rend que des libellés d'expertise déclarés par
l'ESN — jamais un nom d'ESN observée, un comptage de parcours, ou une famille de
rôles. Ce fichier prouve que `market_memory_angle_block` / `build_user_prompt`
n'ouvrent aucune seconde voie pour ces faits-là, et que l'interdiction ET le
repli (« Contexte intéressant mais insuffisant ») sont bien ÉCRITS dans le
prompt que le modèle reçoit.
"""

from __future__ import annotations

from app.prompts import bellum_messages
from app.services.market_memory_angle import reinforced_expertises

CONTACTS = [{"fullName": "Claire Dubois", "title": "DSI", "hierarchyLevel": "c_level"}]

#: Une charge utile RÉALISTE de `AccountMarketContext` — nom d'ESN et comptage
#: de parcours compris — telle qu'elle arriverait si quelqu'un branchait, par
#: erreur, la lecture brute au lieu de passer par `reinforced_expertises`.
RAW_MARKET_CONTEXT_WITH_LEAK_RISK = {
    "esn_observed_detail": [
        {"esnName": "Sopra Steria", "persons": 39, "certainty": "forte"},
        {"esnName": "Capgemini", "persons": 5, "certainty": "moyenne"},
    ],
    "observed_stack": ["java", "kubernetes", "data"],
    "role_families": [{"family": "Data / IA", "persons": 12}],
}


def _messages_prompt(market_memory_block: str = "") -> str:
    return bellum_messages.build_user_prompt(
        "ACME", "contexte compte", CONTACTS, market_memory_block=market_memory_block
    )


def test_sans_corroboration_le_bloc_est_vide() -> None:
    assert bellum_messages.market_memory_angle_block([]) == ""


def test_sans_bloc_marche_le_prompt_reste_byte_identique() -> None:
    baseline = bellum_messages.build_user_prompt("ACME", "contexte compte", CONTACTS)
    assert _messages_prompt("") == baseline


def test_le_bloc_porte_langle_et_linterdit_absolu() -> None:
    block = bellum_messages.market_memory_angle_block(["Data & Intelligence Artificielle"])
    assert "Data & Intelligence Artificielle" in block
    assert "JAMAIS" in block
    assert "Contexte intéressant mais insuffisant" in block
    assert "PAS une preuve d'intervention actuelle" in block


def test_le_verbatim_interdit_par_le_retour_napparait_jamais() -> None:
    # La phrase que le retour cite comme interdit absolu, et ses ingrédients
    # (un nombre de personnes + un mot d'ESN observée), ne doivent JAMAIS
    # apparaître dans ce que reçoit le modèle, même quand une corroboration
    # marché EXISTE pour ce compte.
    reinforced = reinforced_expertises(
        observed_stack=RAW_MARKET_CONTEXT_WITH_LEAK_RISK["observed_stack"],
        offers=["Data & Intelligence Artificielle"],
    )
    block = bellum_messages.market_memory_angle_block(reinforced)
    prompt = _messages_prompt(block)

    forbidden_phrase = "Nous savons que 39 freelances Java sont passés chez vous."
    assert forbidden_phrase not in prompt
    # Les INGRÉDIENTS de la fuite, un par un — même sans la phrase exacte, un
    # nom d'ESN observée ou un comptage de parcours n'a rien à faire ici.
    for esn_name in ("Sopra Steria", "Capgemini"):
        assert esn_name not in prompt
    assert "39" not in prompt
    # Seul l'angle (le libellé d'expertise déclaré) traverse.
    assert "Data & Intelligence Artificielle" in prompt


def test_sans_recoupement_le_bloc_reste_vide_meme_avec_un_contexte_riche() -> None:
    # `role_families` / `esn_observed_detail` ne sont PAS lus par
    # `reinforced_expertises` — seul `observed_stack` recoupé à `offers` compte.
    # Sans offre déclarée qui recoupe, aucun bloc.
    reinforced = reinforced_expertises(observed_stack=RAW_MARKET_CONTEXT_WITH_LEAK_RISK["observed_stack"], offers=[])
    assert reinforced == []
    assert bellum_messages.market_memory_angle_block(reinforced) == ""
