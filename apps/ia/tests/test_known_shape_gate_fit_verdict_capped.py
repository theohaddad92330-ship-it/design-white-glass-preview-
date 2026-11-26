"""#3866.1 (BEL-LAU-1008-015, recette prod 08/10, 2e passe) — « L'adresse, l'ancienneté
ou l'existence juridique d'une société ne suffisent pas à la recommander. »

Recette KO : « Trouve des comptes pour une offre Data/BI » puis « go » rendait un texte
honnête (« Data/BI n'a pas été appliqué comme filtre ») mais classait quand même SG
« Recommandé », avec pour seule raison le siège, l'effectif et l'ancienneté — aucun
élément métier réel. ``commercial_fit_note`` (posé par l'outil) n'était qu'une CONSIGNE
au modèle, jamais une vérification structurelle qui aurait retiré le niveau.

Ce test prouve que ``route_known_shapes`` RABAISSE désormais, dans la carte écrite par le
modèle lui-même, tout compte classé ``priority`` sans ``why_now`` (l'élément réel qui
justifierait l'adéquation) dès que l'outil a posé ``commercial_fit_note`` — et que le
rabaissement se NOMME (``not_evaluated``), jamais silencieux.

#3866 (reste, lot I02 07/10) — le lot V11 n'avait pas vérifié le même défaut sur
``account_map``/``get_portfolio_priorities``/``find_accounts_for_talent`` (les autres
cartes ``account_ranking``). Audit de ce lot (``git grep commercial_fit_note
app/services/chat_tools.py`` : UN SEUL appelant, celui de ``run_account_search``) :

``shape_read_from_tool`` est déjà générique (``_SHAPE_TOOLS``, un seul registre pour les
trois outils) — la porte n'a PAS besoin d'être étendue, elle lirait déjà
``commercial_fit_note`` sur n'importe lequel des trois s'il le posait. Le défaut de #3866
est spécifique à un tour d'horizon FROID sur le registre public (secteur/zone/effectif
SANS lien avec la demande) : ``get_portfolio_priorities`` catégorise des comptes DÉJÀ au
portefeuille par une règle métier structurée (besoins ouverts, relance en retard —
``derivePortfolioPriorities``, jamais démographique) et ``find_accounts_for_talent``
exclut explicitement (``unlinked``, ``talent_accounts.py:100-102``) tout compte dont
AUCUNE compétence de la fiche n'est demandée — aucun des deux ne peut produire un
compte « prioritaire » sans élément réel, donc ``commercial_fit_note`` n'a rien à y
corriger. Les deux tests ci-dessous le PROUVENT sur une sortie réaliste de chaque
outil, pour que toute régression qui introduirait un chemin purement démographique sur
l'un d'eux échoue ici plutôt que de rester un « non vérifié » permanent.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks


def _tool_output(**extra: object) -> dict:
    return {
        "axes": ["Secteur demandé"],
        "items": [{"name": "SOCIETE GENERALE", "why": ["Siège Paris, 10 000+ salariés"]}],
        "commercial_fit_note": (
            "Ces critères (secteur, zone, effectif...) ont SÉLECTIONNÉ les comptes ci-dessus ; "
            "ils ne prouvent pas qu'un compte précis correspond à une demande métier donnée."
        ),
        **extra,
    }


def _model_written_reply(*, why_now: str | None = None) -> str:
    item: dict[str, object] = {"name": "Société Générale", "why": ["Siège Paris, 10 000+ salariés"], "level": "priority"}
    if why_now:
        item["why_now"] = why_now
    block = {"type": "account_ranking", "axes": ["Secteur demandé"], "items": [item]}
    return "Data/BI n'a pas été appliqué comme filtre.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(
        block, ensure_ascii=False
    ) + "\n```"


def test_a_priority_account_without_a_real_signal_is_capped_to_to_qualify() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    assert read is not None
    assert read["commercial_fit_unverified"] is True

    out = route_known_shapes(
        _model_written_reply(),
        [{"shape_read": read}],
        user_message="Trouve des comptes pour une offre Data/BI",
        language="fr",
    )

    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    assert len(blocks) == 1, "la porte ne double jamais la carte écrite par le modèle"
    assert blocks[0]["items"][0]["level"] == "to_qualify"
    assert any("aucun élément métier vérifié" in line.lower() for line in blocks[0]["not_evaluated"])


def test_a_real_signal_why_now_is_never_capped() -> None:
    read = shape_read_from_tool("run_account_search", _tool_output(), language="fr")
    out = route_known_shapes(
        _model_written_reply(why_now="Appel d'offres Data/BI publié le 02/10 sur leur portail achats."),
        [{"shape_read": read}],
        user_message="Trouve des comptes pour une offre Data/BI",
        language="fr",
    )
    blocks = [seg.block for seg in split_reply_blocks(out) if seg.kind == "block" and seg.block]
    assert blocks[0]["items"][0]["level"] == "priority"
    assert "not_evaluated" not in blocks[0]


def test_without_commercial_fit_note_the_reply_is_byte_identical() -> None:
    output = {"axes": ["Secteur"], "items": [{"name": "Société Générale", "why": ["Siège Paris"]}]}
    read = shape_read_from_tool("run_account_search", output, language="fr")
    assert read is not None
    assert read["commercial_fit_unverified"] is False
    reply = _model_written_reply()
    out = route_known_shapes(reply, [{"shape_read": read}], user_message="Trouve des comptes", language="fr")
    assert out == reply


# ── #3866 (reste) — les deux autres outils à carte ``account_ranking`` ne posent JAMAIS
# ``commercial_fit_note`` sur une sortie réaliste : chaque compte y porte déjà un élément
# réel (règle métier du portefeuille, ou compétence croisée), jamais une sélection
# purement démographique. La porte (générique, ``_SHAPE_TOOLS``) n'a donc rien à corriger
# ici — ces tests le prouvent plutôt que de le supposer.


def test_get_portfolio_priorities_never_sets_commercial_fit_unverified() -> None:
    output = {
        "now": [{"companyName": "Arquus", "reason": "Besoin ouvert sans réponse depuis 12 jours."}],
        "toVerify": [{"companyName": "BFC", "reason": "Dernier échange il y a 90 jours."}],
        "toWatch": [],
        "notNow": [],
    }
    read = shape_read_from_tool("get_portfolio_priorities", output, language="fr")
    assert read is not None
    assert read["commercial_fit_unverified"] is False


def test_find_accounts_for_talent_never_sets_commercial_fit_unverified() -> None:
    output = {
        "status": "ok",
        "consultant": {"id": "c-1", "name": "Jeanne Dupont"},
        "accounts": [
            {
                "name": "Capgemini",
                "department": "69",
                "matched_skills": ["Java", "Spring"],
                "why": ["Compétences de la fiche demandées sur le 69 : Java, Spring."],
            }
        ],
    }
    read = shape_read_from_tool("find_accounts_for_talent", output, language="fr")
    assert read is not None
    assert read["commercial_fit_unverified"] is False
