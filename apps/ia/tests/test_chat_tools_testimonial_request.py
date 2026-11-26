"""#2424.8 — BellumAI peut préparer une demande de témoignage.

`chat_tools.py` n'avait AUCUN outil touchant aux témoignages (recherche du
23/09 sur "testimonial" : zéro résultat). Le geste existe déjà — un brouillon
d'email ordinaire (`prepare_mail_draft`) — mais rien ne dit au modèle que
c'est le bon outil pour CE cas, donc rien ne garantit qu'il le propose quand
on le lui demande. Le fondement (aucun champ n'écrit un témoignage à la
place du client) reste gardé par #2424.9, ailleurs.
"""

from app.services import chat_tools


def test_prepare_mail_draft_names_the_testimonial_request_use_case() -> None:
    description = chat_tools.PREPARE_MAIL_DRAFT_TOOL["description"].lower()
    assert "témoignage" in description


def test_prepare_mail_draft_still_never_writes_the_testimonial_itself() -> None:
    """Le brouillon reste un email ordinaire : aucun champ ne permet de
    déposer une citation ou un accord à la place du client — la demande se
    prépare, le témoignage lui-même reste au client d'écrire (#2424.9)."""
    schema = chat_tools.PREPARE_MAIL_DRAFT_TOOL["input_schema"]["properties"]
    assert "quote" not in schema
    assert "testimonial" not in schema
