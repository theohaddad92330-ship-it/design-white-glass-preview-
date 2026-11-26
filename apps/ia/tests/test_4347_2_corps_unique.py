"""#4347.2 (recette prod 23/10) — brouillon e-mail d'un consultant : le corps était DUPLIQUÉ, un paragraphe répété
après « À bientôt, ». La cause est la sortie du modèle (le prompt ne l'interdit pas, `accept_draft` laisse passer) :
le corps accepté ne dit le message qu'UNE fois — un paragraphe répété est retiré, rien après la formule de fin
qu'une signature courte."""

from __future__ import annotations

from app.prompts.bellum_talent_message import build_system_prompt
from app.services.talent_message import accept_draft

_PARAGRAPH = "J'ai une mission React chez Acme qui démarre en novembre et ton profil colle bien."


def _body(*parts: str) -> dict:
    return {"subject": "Mission React", "body": "\n\n".join(parts)}


def test_un_paragraphe_repete_apres_la_formule_de_fin_est_retire() -> None:
    raw = _body("Salut Paul,", _PARAGRAPH, "Serais-tu dispo pour un échange ?", "À bientôt,", _PARAGRAPH)

    draft = accept_draft(raw, "email")

    assert draft is not None
    assert draft["body"].count(_PARAGRAPH) == 1
    assert draft["body"].endswith("À bientôt,")


def test_tout_le_message_repete_ne_reste_qu_une_fois() -> None:
    once = ["Salut Paul,", _PARAGRAPH, "À bientôt,"]
    draft = accept_draft(_body(*once, *once), "email")

    assert draft is not None
    assert draft["body"] == "\n\n".join(once)


def test_une_signature_courte_apres_la_formule_de_fin_reste() -> None:
    draft = accept_draft(_body("Salut Paul,", _PARAGRAPH, "À bientôt,", "Louis"), "email")

    assert draft is not None
    assert draft["body"].endswith("À bientôt,\n\nLouis")


def test_un_corps_sans_repetition_est_rendu_tel_quel() -> None:
    raw = _body("Salut Paul,", _PARAGRAPH, "À bientôt,")
    draft = accept_draft(raw, "email")
    assert draft is not None and draft["body"] == raw["body"]


def test_le_prompt_dit_que_le_message_s_ecrit_une_seule_fois() -> None:
    assert "UNE seule fois" in build_system_prompt()
