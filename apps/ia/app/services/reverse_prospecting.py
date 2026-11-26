"""Prospection inversée (Théo #5) — repérer les personnes ayant DÉJÀ été en
poste/mission chez la cible (consultants sortis de mission, ex-collaborateurs).
Ce sont des relais chauds : ils connaissent le groupe, sa gouvernance, ses pièges.

Déterministe, à partir de l'``employmentHistory`` Apollo (title/organization/current).
Un contact est "prospection inversée" s'il a un passage PASSÉ (non-current) chez la
cible, alors que son employeur ACTUEL est ailleurs.

⚠️ #1611.6 — CE CALCUL NE PEUT RIEN TROUVER DANS LE POOL DU DOSSIER, ET C'EST
STRUCTUREL : ce pool vient d'une recherche ancrée sur le NOM de la société, qui
désigne l'employeur COURANT. Tout le monde y travaille encore, donc la règle
ci-dessus écarte 100 % des lignes. Ce qui le NOURRIT est
``apollo.search_past_employees`` — la passe ancrée sur le DOMAINE seul, câblée
dans ``phase2_contacts._past_employer_seeds``. Elle a été promise par ce
docstring pendant des mois avant d'exister (vérifié le 11/09/2026) : le bloc
« Ce que Bellum observe dans les trajectoires » ne pouvait alors jamais
s'allumer, et rien ne le disait."""

from __future__ import annotations

from typing import Any

from app.services.text_norm import normalize_name


def _target_tokens(target_name: str) -> set[str]:
    return {t for t in normalize_name(target_name).split() if len(t) >= 4}


def is_reverse_prospect(contact: dict[str, Any], target_name: str) -> bool:
    """True if the contact worked at the target in the PAST but is elsewhere now."""
    ttokens = _target_tokens(target_name)
    if not ttokens:
        return False
    details = contact.get("apolloDetails") or contact.get("apollo_details") or {}
    history = details.get("employmentHistory") or details.get("employment_history") or []
    current_org = normalize_name(contact.get("entity") or details.get("organization") or "")
    # If the contact is CURRENTLY at the target, they're an insider, not reverse.
    if ttokens & set(current_org.split()):
        return False
    for item in history:
        if not isinstance(item, dict) or item.get("current"):
            continue
        org = normalize_name(item.get("organization") or "")
        if org and (ttokens & set(org.split())):
            return True
    return False


def find_reverse_prospects(contacts: list[Any], target_name: str) -> list[dict[str, Any]]:
    """Contacts who are former insiders of the target, tagged ``reverseProspect``.
    Empty when the pool holds only current employees — c'est pourquoi l'appelant
    y verse aussi les graines de ``apollo.search_past_employees`` (#1611.6)."""
    out: list[dict[str, Any]] = []
    for c in contacts or []:
        if isinstance(c, dict) and is_reverse_prospect(c, target_name):
            out.append({**c, "reverseProspect": True})
    return out
