"""#5013 (recette prod 02/11) — « les comptes les plus faciles où entrer » : le texte de Laura disait
« les 20 comptes rendus sont en classe A » alors que les cartes montraient A, C, B.

Cause : le modèle écrit SA PROPRE carte ``account_ranking`` (``present & satisfied`` dans
``route_known_shapes`` : la porte ne la double jamais) dans l'ordre qu'il choisit et sans la classe ;
seul l'ordre trié de l'outil (``sorted_by == "access"``) et sa classe font foi, recopiés ici par NOM.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes, shape_read_from_tool
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks


def _tool_output() -> dict:
    return {
        "axes": ["Zone"],
        "sorted_by": "access",
        "items": [
            {"name": "ASSURANCES 2000", "access_class": "A", "access_label": "Ouvert probable", "why": ["Lille"]},
            {"name": "BIOGROUP PARIS OUEST", "access_class": "B", "access_label": "Ouvert par une entité", "why": ["Paris"]},
            {"name": "CANSSM", "access_class": "C", "access_label": "Semi-ouvert", "why": ["Paris"]},
            {"name": "FLOUE SAS", "why": ["Lyon"], "access_class_unmeasured": "classe d'accès non estimable"},
        ],
    }


def _model_reply(order: list[str]) -> str:
    block = {
        "type": "account_ranking",
        "axes": ["Zone"],
        "items": [{"name": n, "why": ["Recommandé"]} for n in order],
    }
    return "Voici.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"


def _items(out: str) -> list[dict]:
    blocks = [s.block for s in split_reply_blocks(out) if s.kind == "block" and s.block]
    return [i for b in blocks if b["type"] == "account_ranking" for i in b["items"]]


def _route(order: list[str], output: dict | None = None) -> list[dict]:
    read = shape_read_from_tool("run_account_search", output or _tool_output(), language="fr")
    assert read is not None
    out = route_known_shapes(
        _model_reply(order),
        [{"shape_read": read}],
        user_message="donne-moi les comptes les plus faciles où entrer par rapport à ce que je vends",
        language="fr",
    )
    return _items(out)


def test_la_carte_du_modele_suit_l_ordre_de_classe_de_l_outil() -> None:
    items = _route(["ASSURANCES 2000", "CANSSM", "BIOGROUP PARIS OUEST", "FLOUE SAS"])
    assert [i["name"] for i in items] == ["ASSURANCES 2000", "BIOGROUP PARIS OUEST", "CANSSM", "FLOUE SAS"]


def test_chaque_carte_dit_sa_classe_et_la_classe_non_estimable_reste_nommee() -> None:
    items = _route(["CANSSM", "FLOUE SAS", "ASSURANCES 2000"])
    assert [i["name"] for i in items] == ["ASSURANCES 2000", "CANSSM", "FLOUE SAS"]
    assert any("Classe d'accès A" in w for w in items[0]["why"])
    assert any("Classe d'accès C" in w for w in items[1]["why"])
    assert not any("Classe d'accès" in w and "non estimable" not in w for w in items[2]["why"])


def test_sans_tri_par_acces_l_ordre_du_modele_est_inchange() -> None:
    output = {k: v for k, v in _tool_output().items() if k != "sorted_by"}
    items = _route(["CANSSM", "ASSURANCES 2000"], output)
    assert [i["name"] for i in items] == ["CANSSM", "ASSURANCES 2000"]


# --- 5e tour (recette prod 02/11 18h50) -------------------------------------------------------------------


def _route_text(reply: str, output: dict) -> str:
    read = shape_read_from_tool("run_account_search", output, language="fr")
    assert read is not None
    return route_known_shapes(
        reply,
        [{"shape_read": read}],
        user_message="donne-moi les comptes les plus faciles où entrer par rapport à ce que je vends",
        language="fr",
    )


def test_la_classe_n_est_dite_qu_une_fois_meme_quand_le_modele_l_a_deja_ecrite() -> None:
    block = {
        "type": "account_ranking",
        "axes": ["Zone"],
        "items": [
            {"name": "ASSURANCES 2000", "why": ["Classe A — « Ouvert probable »", "Lille"]},
            {"name": "CANSSM", "why": ["classe C : semi-ouvert", "Paris"]},
        ],
    }
    reply = "Voici.\n\n```" + REPLY_BLOCK_FENCE + "\n" + json.dumps(block, ensure_ascii=False) + "\n```"
    items = _items(_route_text(reply, _tool_output()))
    for item in items:
        assert sum(1 for w in item["why"] if w.lower().startswith("classe")) == 1
    assert items[0]["why"][0] == "Classe d'accès A — Ouvert probable"
    assert items[1]["why"][0] == "Classe d'accès C — Semi-ouvert"


def test_le_decompte_ecrit_est_celui_des_cartes_montrees() -> None:
    output = {
        "axes": ["Zone"],
        "sorted_by": "access",
        "items": [{"name": f"A{i} SAS", "access_class": "A", "access_label": "Ouvert probable", "why": ["x"]} for i in range(9)]
        + [{"name": f"B{i} SAS", "access_class": "B", "access_label": "Ouvert par une entité", "why": ["x"]} for i in range(11)],
    }
    block = {
        "type": "account_ranking",
        "axes": ["Zone"],
        "items": [{"name": n, "why": ["Recommandé"]} for n in ("A0 SAS", "B0 SAS", "B1 SAS")],
    }
    reply = (
        "J'ai trouvé 20 comptes : 9 en classe A et 11 en classe B. Voici les plus accessibles.\n\n```"
        + REPLY_BLOCK_FENCE
        + "\n"
        + json.dumps(block, ensure_ascii=False)
        + "\n```"
    )
    out = _route_text(reply, output)
    text = " ".join(s.text for s in split_reply_blocks(out) if s.kind == "text")
    assert "9 en classe A" not in text and "11 en classe B" not in text
    assert "20" in text and "3" in text and "1 en A" in text and "2 en B" in text
