"""Assets visuels du dossier — logo entreprise cible (Théo : "récupérer logo").

Déterministe : on DÉRIVE l'URL du logo depuis le domaine du site (CDN logo public,
sans clé) — le front charge l'image, le backend ne fait aucun appel. Pas de donnée
inventée : sans domaine exploitable → None (le front retombe sur un placeholder).
La photo de profil des contacts vient déjà d'Apollo (photoUrl)."""

from __future__ import annotations

import re

# Logo CDN public sans clé — le front charge l'URL, retombe sur un placeholder
# si le logo n'existe pas (onerror). Aucun appel réseau côté backend.
_LOGO_CDN = "https://logo.clearbit.com/{domain}"


def website_domain(website: str | None) -> str | None:
    """Bare registrable domain from a website string ("https://www.vinci.com/fr"
    → "vinci.com"). None when there's no plausible domain."""
    s = str(website or "").strip().lower()
    if not s:
        return None
    s = re.sub(r"^https?://", "", s)
    s = s.split("/")[0].split("?")[0]
    s = re.sub(r"^www\.", "", s)
    s = s.strip(". ")
    return s if s and "." in s else None


def company_logo_url(website: str | None) -> str | None:
    """Company logo URL derived from the target website domain, or None."""
    domain = website_domain(website)
    return _LOGO_CDN.format(domain=domain) if domain else None
