"""#3244/#3186 (reste, recette prod 30/09) — `rank_position_block` /
`nearshore_cost_block` / `employment_model_block` (#3244) etaient deja
branches dans `bellum_strategy.py` mais AUCUN appelant ne les rendait dans
`bellum_advisor.py` — le prompt qui porte `_BLOCK_ACCOUNT_PENETRATION_
STRATEGY` (PREMIERE/DEUXIEME PORTE, ROUTES POSSIBLES). Une ESN rang2 pouvait
donc se voir router vers un acces direct au sponsor : la contrainte etait
CALCULEE, jamais LUE par la conversation ou elle s'applique. Meme discipline
que ``test_strategy_rank_position.py`` : la VALEUR doit changer le texte
envoye au modele, pas seulement exister quelque part.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt

_RANG2 = {"service_types": ["Sous-traitance rang 2"]}
_NEARSHORE = {"staffingModes": ["Nearshore"]}
_CDI = {"staffingModel": "Uniquement des CDI internes"}


class TestPenetrationStrategyVoitLeProfilDeStaffing:
    def test_non_declare_ne_change_rien(self) -> None:
        # GA-18/GA-19 — non mesure n'est pas une valeur : prompt inchange.
        prompt = build_system_prompt({}, {}, "", "")
        assert "POSITION DANS LA CHAINE" not in prompt
        assert "MODE DE DELIVERY" not in prompt
        assert "MODELE D'EMPLOI" not in prompt

    def test_rang2_atteint_le_prompt_qui_porte_premiere_deuxieme_porte(self) -> None:
        prompt = build_system_prompt(_RANG2, {}, "", "")
        assert "POSITION DANS LA CHAINE" in prompt
        assert "rang 2" in prompt.lower()
        # Le gabarit STRATEGIE DE PENETRATION est dans le MEME prompt (Laura
        # lit le systeme entier avant de repondre, l'ordre des segments ne
        # sert que le cache Anthropic) : l'instruction invariante ci-dessous
        # force le croisement des deux.
        assert "STRATÉGIE DE PÉNÉTRATION D'UN COMPTE" in prompt
        assert "ESN PEUT RÉELLEMENT TENIR" in prompt

    def test_nearshore_atteint_le_prompt(self) -> None:
        prompt = build_system_prompt(_NEARSHORE, {}, "", "")
        assert "MODE DE DELIVERY" in prompt
        assert "nearshore" in prompt.lower()

    def test_modele_d_emploi_atteint_le_prompt(self) -> None:
        prompt = build_system_prompt(_CDI, {}, "", "")
        assert "MODELE D'EMPLOI" in prompt
        assert "cdi" in prompt.lower()

    def test_l_instruction_invariante_est_identique_quel_que_soit_le_profil(self) -> None:
        # L'INVARIANT (segment 1, prefixe de cache partage par tous les
        # utilisateurs) ne varie jamais avec le profil : seule la ligne PROFIL
        # ESN (segment 2) change. Une meme phrase pour tous, jamais un
        # gabarit reecrit par profil (romprait le cache Anthropic partage).
        directive = "ESN PEUT RÉELLEMENT TENIR"
        prompt_vide = build_system_prompt({}, {}, "", "")
        prompt_rang2 = build_system_prompt(_RANG2, {}, "", "")
        assert directive in prompt_vide
        assert directive in prompt_rang2

        def _sentence(prompt: str) -> str:
            start = prompt.index(directive)
            return prompt[start : start + 300].split("\n")[0]

        assert _sentence(prompt_vide) == _sentence(prompt_rang2)
