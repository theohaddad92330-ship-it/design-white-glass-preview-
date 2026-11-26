"""#3394.2 — garde de BLOCK_MISSING_INFO_PRIORITY (retour bêta 30/09/2026, #3394).

L'ordre de priorité entre plusieurs informations manquantes est une DONNÉE
gouvernée à UN seul endroit (GA-26) : `laura_missing_info_priority.py`. Cette
garde vérifie que les sept rangs sont bien dans le prompt assemblé, DANS
L'ORDRE EXACT donné par le retour, et qu'elle sait dire NON (le bloc retiré,
plus aucun rang ne doit rester détectable).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_ASK_FIRST, build_system_prompt
from app.prompts.laura_missing_info_priority import BLOCK_MISSING_INFO_PRIORITY

BARE = build_system_prompt({}, {}, "", "")

#: Les sept rangs, dans l'ordre EXACT du retour #3394.2. Chaque fragment porte
#: son numéro d'énumération : une phrase seule (« le périmètre ») revient
#: ailleurs dans le prompt pour des raisons sans rapport avec cet ordre — le
#: numéro accolé rend le fragment propre à CE bloc.
_ORDER: tuple[str, ...] = (
    "1) l'objectif",
    "2) le périmètre",
    "3) la relation existante",
    "4) le problème ou le déclencheur",
    "5) la capacité ou le profil disponible",
    "6) le cadre d'achat ou la marge",
    "7) le calendrier",
)


def test_the_seven_ranks_are_all_present() -> None:
    missing = [item for item in _ORDER if item not in BARE]
    assert not missing, f"rangs absents du prompt assemblé : {missing}"


def test_the_seven_ranks_appear_in_the_exact_order() -> None:
    positions = [BARE.index(item) for item in _ORDER]
    assert positions == sorted(positions), (
        "l'ordre des sept rangs n'est pas respecté dans le prompt assemblé — "
        f"positions trouvées : {positions}"
    )


def test_the_block_sits_right_after_ask_first_and_before_the_profile() -> None:
    """Segment INVARIANT (GA-293) : juste après le critère de #3394.1, avant
    tout ce qui varie par utilisateur (profil, compte, portefeuille)."""
    ask_first_pos = BARE.index("DEMANDER AVANT DE CHERCHER")
    priority_pos = BARE.index("QUAND PLUSIEURS INFORMATIONS MANQUENT")
    assert ask_first_pos < priority_pos < BARE.index("PROFIL ESN")
    assert _BLOCK_ASK_FIRST.strip()


def test_the_rule_never_lets_a_low_rank_jump_a_high_one() -> None:
    assert "ne passe jamais devant" in BLOCK_MISSING_INFO_PRIORITY


def test_the_block_is_never_empty() -> None:
    assert BLOCK_MISSING_INFO_PRIORITY.strip()


def test_the_guard_knows_how_to_say_no() -> None:
    """Anti-garde-borgne : le bloc retiré, plus aucun rang ne doit survivre
    ailleurs dans le prompt assemblé."""
    degraded = BARE.replace(BLOCK_MISSING_INFO_PRIORITY, "")
    assert BLOCK_MISSING_INFO_PRIORITY not in degraded
    survivors = [item for item in _ORDER if item in degraded]
    assert not survivors, f"rangs trouvés ailleurs que dans le bloc : {survivors}"
