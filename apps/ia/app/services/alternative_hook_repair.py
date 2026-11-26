"""#3419 (recette prod nuit 08→09/10) — « Autres accroches » RÉPARÉ côté serveur.

La consigne (``alternative_hook_block``, ``bellum_outreach.py``) demande au modèle de
réécrire UNIQUEMENT l'ouverture et de reprendre le reste à l'identique, sans jamais
laisser un gabarit à crochets (``build_system_prompt`` : « jamais un template avec des
[crochets] à remplir »). Observé en recette : le modèle a réécrit le message ENTIER et
laissé des placeholders bruts (« [Prénom] [fonction] [coordonnées] »). Deux consignes
déjà écrites, non TENUES en code — ce module les tient, en repli déterministe, jamais en
second appel de modèle :

  * ``enforce_only_opening_changed`` — le premier paragraphe est celui du modèle, le
    reste redevient l'ORIGINAL mot pour mot, quoi que le modèle ait réécrit.
  * ``resolve_placeholders`` — un gabarit à crochets reconnu (prénom, fonction,
    coordonnées) devient la valeur RÉELLE déjà connue du contact ; non reconnu ou sans
    valeur connue, il disparaît — jamais laissé brut, jamais une valeur inventée.
"""

from __future__ import annotations

import re
import unicodedata

#: Un espace horizontal immédiatement collé au crochet est capturé AVEC lui : la
#: valeur réelle le restitue tel quel (aucun effet), un retrait l'emporte aussi
#: (jamais un double espace ou une virgule orpheline à la place du gabarit).
_PLACEHOLDER = re.compile(r"(?P<lead>[ \t]?)\[(?P<token>[^\[\]\n]{1,40})\](?P<trail>[ \t]?)")


def enforce_only_opening_changed(new_body: str, current_body: str) -> str:
    """Garde le premier paragraphe écrit par le modèle, restaure le reste à l'identique
    de ``current_body`` — la consigne ``alternative_hook_block`` tenue au bit près,
    même si le modèle a réécrit tout le message."""
    new_paragraphs = new_body.split("\n\n")
    current_paragraphs = current_body.split("\n\n")
    if not new_paragraphs or not new_paragraphs[0].strip():
        return current_body
    return "\n\n".join([new_paragraphs[0], *current_paragraphs[1:]])


def _normalize(token: str) -> str:
    text = unicodedata.normalize("NFD", token)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.strip().lower()

#: Synonymes reconnus (FR/EN, sans accent) → la clé des valeurs réelles passées à
#: `resolve_placeholders`. Un token hors de cette table est retiré sans tentative de
#: rapprochement (jamais deviné).
_SYNONYMS: dict[str, str] = {
    "prenom": "first_name",
    "first name": "first_name",
    "firstname": "first_name",
    "fonction": "role",
    "poste": "role",
    "titre": "role",
    "role": "role",
    "job title": "role",
    "coordonnees": "contact_info",
    "coordonnee": "contact_info",
    "contact": "contact_info",
    "email": "contact_info",
    "e-mail": "contact_info",
    "telephone": "contact_info",
    "phone": "contact_info",
}


def resolve_placeholders(body: str, *, first_name: str | None, role: str | None, email: str | None, phone: str | None) -> str:
    """Remplace un gabarit à crochets reconnu par la valeur RÉELLE déjà connue du
    contact ; retire le crochet (jamais laissé brut) quand le token n'est pas reconnu
    ou que la valeur manque — jamais une valeur inventée pour le combler."""
    contact_info = ", ".join(v for v in (email, phone) if v) or None
    values = {"first_name": first_name, "role": role, "contact_info": contact_info}

    def _replace(match: re.Match[str]) -> str:
        key = _SYNONYMS.get(_normalize(match.group("token")))
        value = values.get(key) if key else None
        lead, trail = match.group("lead"), match.group("trail")
        if value:
            # Valeur trouvée : les espaces capturés n'ont jamais été consommés.
            return f"{lead}{value}{trail}"
        # Retrait pur : un espace de chaque côté fusionnerait deux mots sans lui — UN
        # seul espace séparateur survit ; un seul côté espacé n'en laisse aucun (déjà isolé).
        return " " if lead and trail else ""

    out = _PLACEHOLDER.sub(_replace, body)
    # Une parenthèse vidée par un retrait ne reste pas affichée.
    out = re.sub(r"\(\s*\)", "", out)
    return out
