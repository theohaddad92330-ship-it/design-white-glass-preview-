"""Les objections curées atteignent enfin le prompt qui ANALYSE le compte.

Le défaut : `objection_library()` porte 33 objections travaillées (l'objection,
sa VRAIE signification, la réponse, la question miroir) et `objection_block()`
l'expose déjà, bornée et prête à injecter. Elle atteignait deux appelants —
`bellum_messages` (rédaction des messages) et `method_knowledge` (RAG du
copilote) — mais pas `bellum_strategy`, celui qui produit le dossier de
conquête (douleurs, angles, objections) lu par le commercial : ce prompt
citait cinq objections écrites en dur dans le schéma JSON envoyé au modèle
("budget, pas decideur, deja des partenaires, TJM trop eleve, full remote"),
recopiées à la main depuis la bibliothèque au lieu de l'appeler.

Ces tests relisent le TEXTE réellement envoyé au modèle (``build_user_prompt``),
pas un appel mocké — même famille que ``test_objection_block.py`` et
``test_protected_criteria_scoring.py``.
"""

from __future__ import annotations

from app.knowledge import objection_block, objection_library
from app.prompts import bellum_strategy

_ARGS = dict(
    target_company="ACME",
    brave_results="BRAVE_SAMPLE",
    scraped_content="SCRAPE_SAMPLE",
    pappers_data="PAPPERS_SAMPLE",
)


def _user_prompt() -> str:
    return bellum_strategy.build_user_prompt(**_ARGS)


def test_les_cinq_objections_figees_en_dur_ont_disparu():
    """Preuve directe du défaut, puis de son correctif : ces cinq exemples ne
    sont plus recopiés à la main dans le prompt d'analyse."""
    prompt = _user_prompt()
    assert "(budget, pas decideur, deja des partenaires, TJM trop eleve, full remote...)" not in prompt
    for figee in ("deja des partenaires", "TJM trop eleve", "full remote"):
        assert figee not in prompt, f"objection figee encore presente en dur : {figee!r}"


def test_le_prompt_porte_bien_le_bloc_objection_block_et_rien_dautre():
    """Le prompt appelle `objection_block()` -- il ne recopie pas la
    bibliothèque : le bloc injecté est un match EXACT de ce que la fonction
    rend, pas une réécriture locale."""
    prompt = _user_prompt()
    assert objection_block() in prompt


def test_le_bloc_porte_les_objections_du_cote_client_pas_le_recrutement():
    prompt = _user_prompt()
    client = [o for o in objection_library() if o.get("side") == "client"]
    consultant = [o for o in objection_library() if o.get("side") == "consultant"]
    assert client, "bibliotheque vide cote client -- le corpus n'est pas charge"
    assert client[0]["objection"] in prompt
    assert all(entry["objection"] not in prompt for entry in consultant), (
        "une objection cote recrutement (consultant) fuite dans un prompt de "
        "prospection de compte"
    )


def test_le_prompt_porte_la_vraie_signification_et_la_question_miroir_curees():
    prompt = _user_prompt()
    first = next(o for o in objection_library() if o.get("side") == "client")
    assert first["real_meaning"] in prompt
    assert first["mirror_question"] in prompt


def test_chaque_champ_injecte_vient_bien_de_la_bibliotheque_pas_dune_recopie():
    """Casse volontairement l'hypothèse : si le prompt écrivait son propre
    texte au lieu d'appeler `objection_block()`, ces chaînes n'y seraient pas."""
    prompt = _user_prompt()
    client = [o for o in objection_library() if o.get("side") == "client"][:6]
    for field in ("objection", "real_meaning", "mirror_question"):
        for entry in client:
            assert entry[field] in prompt


def test_le_schema_json_des_objections_garde_ses_quatre_champs():
    """Rule #5 du chantier : le format de sortie ne bouge pas -- les 4 clés du
    contrat `objections[]` restent dans le schéma envoyé au modèle."""
    prompt = _user_prompt()
    for key in ('"objection":', '"realConcern":', '"response":', '"mirrorQuestion":'):
        assert key in prompt


def test_la_directive_tight_schema_objections_reste_intacte():
    """Le lever `STRATEGY_SCHEMA=tight` (strategy_levers.TIGHT_SCHEMA_SUBSTITUTIONS)
    dépend de ce préfixe verbatim -- il doit survivre au branchement de la
    bibliothèque curée."""
    prompt = _user_prompt()
    assert '"(MIN 3, viser 4) OBJECTIONS PLAUSIBLES' in prompt


def test_le_prompt_reste_deterministe():
    assert _user_prompt() == _user_prompt()
