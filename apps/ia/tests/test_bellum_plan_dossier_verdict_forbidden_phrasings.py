"""#2304.28-.31 (épopée #2932, LAU-FINAL-045) — le verdict de compte
(``dossier_read``) bannit nommément les quatre généralités qui reviennent le
plus sur un verdict de compte : « compte à fort potentiel », « poursuivre les
échanges », « identifier les décideurs », « capitaliser sur les signaux ».

Une garde existait déjà pour ``why_for_your_esn`` seul (« raison
interchangeable... aucun gabarit »), mais aucune des quatre phrases n'y était
nommée littéralement, et aucun autre champ de ``dossier_read`` n'en héritait.
GA-26 : la LISTE des phrases bannies vit dans ``forbidden_phrasings`` (déjà la
source unique de six autres prompts) — ce fichier vérifie que la section
`evaluation` de ``bellum_plan`` l'IMPORTE réellement et rend les quatre
phrases dans son instruction, pas seulement un texte qui coïncide par hasard.
"""

from __future__ import annotations

from app.prompts.bellum_plan import build_subsection_user_prompt
from app.prompts.forbidden_phrasings import DOSSIER_VERDICT_FORBIDDEN_PHRASINGS


def _evaluation_prompt() -> str:
    return build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data=None)


def test_the_four_banned_phrasings_are_named() -> None:
    assert DOSSIER_VERDICT_FORBIDDEN_PHRASINGS == (
        "compte à fort potentiel",
        "poursuivre les échanges",
        "identifier les décideurs",
        "capitaliser sur les signaux",
    )


def test_bellum_plan_actually_imports_the_shared_module() -> None:
    import inspect

    from app.prompts import bellum_plan

    source = inspect.getsource(bellum_plan)
    assert "DOSSIER_VERDICT_FORBIDDEN_PHRASINGS" in source


def test_evaluation_prompt_names_every_banned_phrasing() -> None:
    prompt = _evaluation_prompt()
    missing = [phrase for phrase in DOSSIER_VERDICT_FORBIDDEN_PHRASINGS if phrase not in prompt]
    assert missing == []


def test_a_section_unrelated_to_the_verdict_is_not_flagged() -> None:
    # `quick_wins` n'écrit pas `dossier_read` : une garde qui bannirait ces
    # phrases PARTOUT attraperait n'importe quelle section, pas la bonne.
    prompt = build_subsection_user_prompt(company_name="Thales", section="quick_wins", profile_data=None)
    assert all(phrase not in prompt for phrase in DOSSIER_VERDICT_FORBIDDEN_PHRASINGS)
