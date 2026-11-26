"""Vérification d'UNE relation d'organigramme (annexe p22, « Vérifier une relation »).

Le graphe distingue les liens VÉRIFIÉS (pleins, sourcés, ≥ 90) des liens INFÉRÉS
(pointillés, ≤ 89). Un lien inféré reste une hypothèse tant que personne n'est
allé chercher la preuve. Ce module va la chercher, pour UN lien, à la demande.

Deux règles portent tout le fichier :

1. **Aucune hiérarchie n'est prononcée par un LLM.** Le spec l'interdit (p12 :
   « le LLM enrichit, mais ne doit pas décider seul de la hiérarchie ») et la
   formule p14 plafonne de toute façon une inférence LLM seule à 49. La décision
   est donc DÉTERMINISTE : elle lit ce qui est écrit dans les hits de recherche.

2. **Rien trouvé ⇒ rien changé.** L'absence de preuve n'est pas une preuve du
   contraire : on ne dégrade pas le lien, on répond « je ne sais pas » et
   l'appelant laisse l'edge tel quel.

Le grounding suit la table p10 :

    A — site officiel / organigramme / registre  → edge plein, ≥ 90
    B — LinkedIn actuel / communiqué / presse    → pointillé, 70-89
    C — titre seul, cooccurrence                 → aucun lien hiérarchique
"""

from __future__ import annotations

import re
import unicodedata
from typing import TypedDict

from app.services.assets import website_domain


class VerificationSource(TypedDict):
    """Une preuve, au format `OrgSource` du contrat partagé."""

    id: str
    kind: str
    ref: str
    grounding: str
    date: str


class RelationVerdict(TypedDict):
    """Ce que la vérification RÉPOND. `confidence: None` = aucune preuve trouvée,
    et l'appelant doit laisser l'edge inchangé plutôt que de le dégrader."""

    verified: bool
    confidence: int | None
    sources: list[VerificationSource]
    checked: bool


# Confiances des deux paliers de preuve, alignées sur les seuils p14. Un lien
# vérifié DOIT être ≥ 90 (invariant zod) ; un lien probable DOIT rester ≤ 89.
_CONFIDENCE_OFFICIAL = 92
_CONFIDENCE_SECONDARY = 78

_LINKEDIN_HOSTS = ("linkedin.com",)


def _fold(text: str) -> str:
    """Minuscules sans accents ni ponctuation superflue — « Claire Bassèt » et
    « CLAIRE BASSET » doivent se reconnaître, sinon une preuve réelle est ratée
    pour une cédille."""
    stripped = unicodedata.normalize("NFKD", str(text or ""))
    ascii_only = "".join(ch for ch in stripped if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", ascii_only.lower()).strip()


def build_verification_queries(
    *,
    company: str,
    from_name: str,
    to_name: str,
    website: str | None = None,
) -> list[str]:
    """Les recherches à lancer pour établir UN lien. Vide si l'un des deux noms
    manque : chercher « X rattaché à ? » ne prouverait rien sur ce lien-là."""
    left, right = str(from_name or "").strip(), str(to_name or "").strip()
    if not left or not right:
        return []

    label = str(company or "").strip()
    queries = [
        f'"{left}" "{right}" {label}'.strip(),
        f'"{left}" "{right}" organigramme {label}'.strip(),
    ]
    domain = website_domain(website)
    if domain:
        # La SEULE requête qui peut produire du grounding A : elle contraint la
        # réponse au site du compte lui-même.
        queries.append(f'site:{domain} "{left}" "{right}"')
    return queries


def _kind_and_grounding(url: str, domain: str | None) -> tuple[str, str]:
    """Nature de la source et son grounding, d'après le SEUL fait disponible :
    l'hôte qui la publie."""
    host = website_domain(url) or ""
    if domain and (host == domain or host.endswith(f".{domain}")):
        return "official_site", "A"
    if any(host == h or host.endswith(f".{h}") for h in _LINKEDIN_HOSTS):
        return "linkedin", "B"
    return "press", "B"


def verdict_from_hits(
    hits: list[dict],
    *,
    from_name: str,
    to_name: str,
    website: str | None,
    today: str,
) -> RelationVerdict:
    """Décide du sort d'un lien à partir des hits de recherche.

    Un hit ne compte QUE s'il nomme LES DEUX personnes : une page qui ne cite
    qu'un des deux ne dit rien du lien entre eux. La meilleure preuve gagne
    (officielle > secondaire) ; à défaut de preuve, on répond « rien trouvé ».
    """
    left, right = _fold(from_name), _fold(to_name)
    empty: RelationVerdict = {"verified": False, "confidence": None, "sources": [], "checked": True}
    if not left or not right:
        return empty

    domain = website_domain(website)
    best: tuple[str, VerificationSource] | None = None

    for index, hit in enumerate(hits or []):
        url = str((hit or {}).get("url") or "").strip()
        if not url:
            continue
        haystack = _fold(f"{(hit or {}).get('title') or ''} {(hit or {}).get('description') or ''}")
        if left not in haystack or right not in haystack:
            continue  # une seule des deux personnes : ne prouve rien sur CE lien

        kind, grounding = _kind_and_grounding(url, domain)
        source: VerificationSource = {
            "id": f"s-verify-{index}",
            "kind": kind,
            "ref": url,
            "grounding": grounding,
            # La date de la VÉRIFICATION : c'est ce qu'on sait dater honnêtement.
            # Le hit ne porte pas de date de publication fiable.
            "date": today,
        }
        if grounding == "A":
            return {
                "verified": True,
                "confidence": _CONFIDENCE_OFFICIAL,
                "sources": [source],
                "checked": True,
            }
        if best is None:
            best = (grounding, source)

    if best is None:
        return empty
    return {"verified": False, "confidence": _CONFIDENCE_SECONDARY, "sources": [best[1]], "checked": True}
