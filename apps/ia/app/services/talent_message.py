"""#4347 — la sortie du modèle pour un message à un consultant : acceptée telle quelle, ou REFUSÉE.

Jamais corrigée en silence : un texte avec un trou à compléter, un éditeur nommé, un vouvoiement ou un corps vide ne
part pas à l'écran — l'appelant dit « la rédaction a échoué » et le champ reste vide AVEC cette erreur.
"""

from __future__ import annotations

import re
from typing import Any

from app.prompts.bellum_chat_title import TITLE_FORBIDDEN_VENDORS

#: LinkedIn est un CANAL de ce message, pas un éditeur d'outil que le texte aurait à taire.
_VENDORS = tuple(name for name in TITLE_FORBIDDEN_VENDORS if name != "LinkedIn")
_PLACEHOLDER = re.compile(r"\[[^\]\n]{1,40}\]|\{\{|\}\}")
#: #4347.2 — le message au consultant TUTOIE : « vous / votre / vos » (et « seriez-vous ») sont refusés.
_VOUVOIEMENT = re.compile(r"\b(?:vous|votre|vos)\b|-vous\b", re.IGNORECASE)
#: #4347.2 — la formule de fin : ce qui la suit est au plus une signature.
_CLOSING = re.compile(
    r"^(?:à bientôt|a bientôt|bien à toi|à très vite|à plus|à plus tard|bonne journée|bonne semaine|cordialement|belle journée)\W*$",
    re.IGNORECASE,
)
_SIGNATURE_MAX = 40
_REPEAT_MIN = 20
_SUBJECT_MAX = 120
_BODY_MAX = 4000


def single_body(body: str) -> str:
    """#4347.2 — le message ne s'écrit qu'UNE fois : un paragraphe déjà dit est retiré, et après la formule de fin il ne
    reste qu'une signature courte. Les paragraphes courts (« Salut Paul, ») ne sont jamais jugés répétés."""
    seen: set[str] = set()
    kept: list[str] = []
    closed = False
    signed = False
    for paragraph in re.split(r"\n\s*\n", body.strip()):
        text = paragraph.strip()
        if not text:
            continue
        folded = " ".join(text.lower().split())
        if closed and (len(text) > _SIGNATURE_MAX or folded in seen or signed):
            continue  # après « À bientôt, » : au plus UNE signature, jamais une reprise du message
        if len(folded) >= _REPEAT_MIN and folded in seen:
            continue
        signed = signed or closed
        seen.add(folded)
        kept.append(text)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if lines and _CLOSING.match(lines[-1]):
            closed = True
    return "\n\n".join(kept)


def accept_draft(raw: Any, channel: str) -> dict[str, str | None] | None:
    if not isinstance(raw, dict):
        return None
    body = single_body(str(raw.get("body") or ""))
    if not body or len(body) > _BODY_MAX or _PLACEHOLDER.search(body):
        return None
    subject = str(raw.get("subject") or "").strip() if channel == "email" else ""
    if subject.lower() == "null":
        subject = ""
    if len(subject) > _SUBJECT_MAX or _PLACEHOLDER.search(subject):
        return None
    if _VOUVOIEMENT.search(subject) or _VOUVOIEMENT.search(body):
        return None
    lowered = f"{subject}\n{body}".lower()
    if any(vendor.lower() in lowered for vendor in _VENDORS):
        return None
    return {"subject": subject or None, "body": body}
