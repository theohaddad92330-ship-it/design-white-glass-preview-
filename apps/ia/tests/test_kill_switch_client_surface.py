"""La SEULE surface client livrée pour un interrupteur d'arrêt — et pourquoi.

Le critère retenu : **une surface client ne se livre que là où le produit MENT
sans elle.** Sur les vingt-trois interrupteurs, un seul fait dire au produit
quelque chose de faux à l'utilisateur, dans la seconde, sans détour :

``CHAT_TOOLS_DISABLED`` coupe les outils du copilote — mais l'invite système
continue de LUI décrire ses outils (``tools_summary``, résolu côté NestJS depuis
le registre d'outils). Laura est donc informée qu'elle peut agir alors que
l'orchestrateur n'est même pas importé : elle annonce une action, et rien ne
part. Ce n'est pas une capacité silencieusement absente, c'est une promesse
tenue par personne.

La réparation est UNE ligne dans un objet qui existe déjà — « ce qui n'a pas été
consulté » — et elle répare les deux moitiés du mensonge d'un coup :
  · le MODÈLE l'apprend (cette liste est injectée dans l'invite système), donc
    il cesse de promettre ;
  · l'UTILISATEUR le lit (``ContextDisclosure`` la rend depuis toujours), donc
    une réponse sans action ne se lit plus « Bellum ne sait pas faire ».

⚠️ Elle dit « momentanément coupées », jamais « une erreur s'est produite » : un
interrupteur posé est une DÉCISION d'exploitation, et les deux phrases appellent
des gestes opposés chez qui les lit.
"""

from __future__ import annotations

import pytest

from app.prompts.context_transparency import build_context_transparency

BASE = {
    "profile_data": {"esn_name": "Acme"},
    "account_data": {"company_name": "Cible SA"},
    "contacts_summary": "",
    "plan_summary": "",
    "knowledge_docs": [],
}


def _transparency(**overrides: object) -> dict:
    return build_context_transparency(**{**BASE, **overrides})  # type: ignore[arg-type]


def test_par_defaut_rien_nannonce_une_capacite_coupee() -> None:
    """Le cas nominal : aucune ligne ne parle du copilote.

    Témoin positif — la liste n'est pas vide pour autant, sinon l'absence
    ci-dessous ne prouverait rien.
    """
    context = _transparency()
    assert context["not_consulted"], "la liste doit porter ses lignes habituelles"
    assert not any("coupé" in line.lower() for line in context["not_consulted"])


def test_les_actions_coupees_sont_nommees_a_lutilisateur() -> None:
    context = _transparency(copilot_tools_enabled=False)
    lines = context["not_consulted"]
    matching = [line for line in lines if "action" in line.lower()]
    assert matching, f"aucune ligne ne nomme les actions coupées : {lines}"
    line = matching[0]

    # Une DÉCISION, pas une panne : le vocabulaire de l'erreur est proscrit.
    assert "coupé" in line.lower()
    for interdit in ("erreur", "panne", "échec", "indisponible"):
        assert interdit not in line.lower(), f"« {interdit} » fait lire une décision comme un incident"

    # ⚠️ Jamais un nom de variable ni un nom d'éditeur (GA-85, doctrine).
    assert "_DISABLED" not in line
    assert "DISABLED" not in line.upper()


def test_la_ligne_na_aucune_action_a_proposer() -> None:
    """Rien qu'un CLIC ne résout : ce n'est pas à l'utilisateur de rallumer.

    Les lignes actionnables portent un bouton (« connecter un CRM »…). Proposer
    ici une action serait envoyer quelqu'un se cogner à une porte qui n'est pas
    la sienne.
    """
    context = _transparency(copilot_tools_enabled=False)
    actionable = {entry["label"] for entry in context["not_consulted_actions"]}
    coupees = [line for line in context["not_consulted"] if "coupé" in line.lower()]
    assert coupees
    for line in coupees:
        assert line not in actionable


def test_lentree_est_absente_quand_les_outils_tournent() -> None:
    assert not any(
        "coupé" in line.lower() for line in _transparency(copilot_tools_enabled=True)["not_consulted"]
    )


@pytest.mark.parametrize("crm_connected", [True, False])
def test_lentree_sajoute_sans_rien_retirer(crm_connected: bool) -> None:
    """Additive : elle ne remplace aucune ligne existante, dans les deux états.

    Une transparence qui perdrait une ligne en en gagnant une serait un
    régression silencieuse — c'est le motif « un normaliseur avale les champs
    neufs », à l'envers.
    """
    avant = _transparency(crm_connected=crm_connected)["not_consulted"]
    apres = _transparency(crm_connected=crm_connected, copilot_tools_enabled=False)["not_consulted"]
    assert set(avant).issubset(set(apres))
    assert len(apres) == len(avant) + 1
