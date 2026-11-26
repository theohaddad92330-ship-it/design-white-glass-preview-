"""Prestataire détecté par CRÉDIT DE SITE — #3095, call bêta Apricot Labs (24/09/2026).

> « Aller sur le site des boîtes, voir qui a fait le site, pour comprendre au
> maximum les prestataires du compte. »

Zéro nouveau fournisseur, zéro nouvelle clé, zéro appel réseau supplémentaire :
ce module relit les pages QUE LE RUN SCRAPE DÉJÀ (`ResearchBundle`), même
source que `official_directory.collect_official_directory`, et cherche une
mention de crédit ("Site conçu par X", "Powered by X"…) suivie d'un nom que le
référentiel ESN CONNAÎT (`known_esn_names`).

Sans preuve, une entrée n'apparaît PAS (doctrine « on n'affiche pas ce qu'on
n'a pas ») : un nom cité ailleurs sur la page sans marqueur de crédit à
proximité n'est qu'une mention, jamais un prestataire.

#4740 — la borne des 15 ESN du référentiel est LEVÉE, la preuve de crédit RESTE :
un prestataire hors référentiel est retenu parce que la page le crédite
EXPLICITEMENT (marqueur de crédit immédiatement suivi du nom). Jamais un nom
deviné depuis une URL, un client cité, une plateforme (« Powered by WordPress »
crédite un outil) ni un pronom (« réalisé par nos équipes »). Barème de
certitude inchangé (`esn_presence._certainty`) : un nom du référentiel porte
deux preuves (« forte »), un nom libre une seule (« moyenne »).

#4741 — ce que le prestataire FAIT (`qualification` : web / infra / applicatif /
tout) ne se dit que sur les mots de la ligne de crédit elle-même (« agence web »,
« hébergement »…). Rien d'autre n'est lu : pas le nom, pas le référentiel. Sans
preuve, `non_qualifie` — jamais rangé par défaut.

Cette tranche couvre le CRÉDIT TEXTUEL, déterministe et vérifiable ce soir.
L'énumération de sous-domaines / whois demanderait un nouveau fournisseur et un
budget réseau — hors de cette tranche (#3095, tranché sans Louis le 26/09/2026).

La sortie rejoint `raw_analysis.esnPresence` (voir `esn_presence.py`), lue en
aval par `AccountsService.seedDetectedPartners` puis rendue dans l'onglet
Partenaires — une ligne EXISTANTE étendue, jamais une seconde liste.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.knowledge import known_esn_names
from app.services.text_norm import normalize_name

# FR + EN — les formulations de crédit les plus courantes en pied de page.
# Normalisées comme le texte scanné (minuscules, sans accents).
_CREDIT_MARKERS = (
    "site concu par",
    "site realise par",
    "site developpe par",
    "site cree par",
    "developpe par",
    "realise par",
    "concu par",
    "powered by",
    "designed by",
    "developed by",
    "built by",
    "site by",
)

# La distance (en caractères, texte normalisé) entre le marqueur et le nom : une
# ligne de pied de page tient largement dedans ("© 2026 Acme — Site conçu par
# Capgemini"), un paragraphe entier séparant les deux ne le devrait pas.
_MAX_GAP = 40

# Plateformes / outils crédités en pied de page : « Powered by WordPress » dit
# quel outil fait tourner le site, pas qui l'a fait. Normalisés (sans accents).
_PLATFORMS = frozenset(
    {
        "wordpress",
        "wix",
        "shopify",
        "squarespace",
        "webflow",
        "elementor",
        "prestashop",
        "drupal",
        "joomla",
        "jimdo",
        "weebly",
        "godaddy",
        "hubspot",
        "google",
        "github",
        "vercel",
        "netlify",
        "cloudflare",
        "react",
        "next",
        "nextjs",
        "typo3",
        "magento",
        "woocommerce",
        "ghost",
        "strapi",
        "sitecore",
        "contentful",
        "ovh",
        "ovhcloud",
        "gandi",
        "ionos",
        "cookiebot",
        "tarteaucitron",
    }
)
# Premier mot qui n'est pas un nom : pronom, article, service interne.
_NOT_A_NAME = frozenset(
    {
        "nos",
        "notre",
        "nous",
        "le",
        "la",
        "les",
        "l",
        "un",
        "une",
        "des",
        "du",
        "de",
        "d",
        "et",
        "equipe",
        "equipes",
        "service",
        "services",
        "societe",
        "team",
        "our",
        "the",
        "we",
        "us",
        "internal",
        "interne",
        "direction",
        "dsi",
        "webmaster",
    }
)
_MAX_NAME_LEN = 60

_NAME_WORD = r"[A-Z0-9][^\s|•·,;:()\[\]<>/\"«»]*"
_FREE_CREDIT_RE = re.compile(
    r"(?i:(?P<marker>" + "|".join(re.escape(m) for m in _CREDIT_MARKERS) + r"))"
    r"[ \t]*[:\-–—]?[ \t]*\n?[ \t]*"
    r"(?i:(?:l'agence|la societe|l'equipe de)[ \t]+)?"
    r"(?P<name>" + _NAME_WORD + r"(?:[ \t]+[A-Z0-9&][^\s|•·,;:()\[\]<>/\"«»]*){0,3})"
)

# Mots d'activité lus SUR la ligne de crédit, après le nom (jamais ailleurs).
_ACTIVITY_WORDS: dict[str, tuple[str, ...]] = {
    "web": (
        "agence web",
        "agence digitale",
        "creation de site",
        "creation de sites",
        "web design",
        "webdesign",
        "developpement web",
        "web agency",
        "site internet",
        "sites internet",
    ),
    "infra": (
        "hebergement",
        "hebergeur",
        "infogerance",
        "infrastructure",
        "datacenter",
        "cybersecurite",
        "reseau",
        "cloud",
    ),
    "applicatif": (
        "developpement sur mesure",
        "developpement logiciel",
        "logiciel",
        "applicatif",
        "erp",
        "application metier",
        "applications metier",
    ),
}
_CREDIT_LINE_END_RE = re.compile(r"[|•·\n]")
_MAX_ACTIVITY_SPAN = 160
_MAX_PHRASE_LEN = 160
_HOST_RE = re.compile(r"^(?:https?:)?//([^/\s?#:]+)", re.IGNORECASE)
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_MD_LINK_URL_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]*)[^)]*\)")
_MD_EMPHASIS_RE = re.compile(r"[*_`]+")
_INLINE_SPACE_RE = re.compile(r"[ \t\xa0]+")


def _fold(text: str) -> str:
    """Accents retirés, casse CONSERVÉE (le nom libre se reconnaît à sa
    majuscule), liens et emphase markdown aplatis, lignes préservées."""
    raw = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in raw if not unicodedata.combining(c))
    stripped = _MD_LINK_RE.sub(r"\1", stripped)
    stripped = _MD_EMPHASIS_RE.sub("", stripped)
    return _INLINE_SPACE_RE.sub(" ", stripped)


def _qualify(folded_after_name: str) -> tuple[str, str | None]:
    """(qualification, mots-preuve) lus sur la ligne de crédit, après le nom."""
    segment = folded_after_name[:_MAX_ACTIVITY_SPAN]
    end = _CREDIT_LINE_END_RE.search(segment)
    if end:
        segment = segment[: end.start()]
    segment = segment.lower()
    found: dict[str, str] = {}
    for kind, words in _ACTIVITY_WORDS.items():
        hit = next((w for w in words if w in segment), None)
        if hit:
            found[kind] = hit
    if not found:
        return "non_qualifie", None
    kind = next(iter(found)) if len(found) == 1 else "tout"
    return kind, " · ".join(found.values())


def _credit_phrase(folded: str, start: int, end: int) -> str:
    """La PHRASE de crédit, telle que la page l'écrit (accents retirés, comme le texte scanné) : du début du marqueur (ou
    du nom) jusqu'à la fin de la ligne de crédit — jamais le pied de page entier."""
    start = max(0, min(start, len(folded)))
    tail = folded[end:]
    stop = _CREDIT_LINE_END_RE.search(tail)
    stop_at = stop.start() if stop else len(tail)
    phrase = (folded[start:end] + tail[:stop_at]).strip()
    phrase = re.sub(r"\s+", " ", phrase)
    return phrase[:_MAX_PHRASE_LEN].rstrip()


def _provider_host(links: list[tuple[str, str]], name: str, page_url: str) -> str | None:
    """Le site du prestataire, quand le nom crédité EST un lien vers lui.

    Un lien qui renvoie vers le site du compte lui-même n'identifie pas le
    prestataire : on ne le retient pas."""
    key = normalize_name(name)
    if not key:
        return None
    own = _host(page_url)
    for text, href in links:
        if normalize_name(text) != key:
            continue
        host = _host(href)
        if host and host != own:
            return host
    return None


def _host(url: str) -> str | None:
    match = _HOST_RE.match(url.strip())
    if not match:
        return None
    return match.group(1).lower().removeprefix("www.")


def _evidence(
    url: str,
    phrase: str,
    qualification: str,
    proof: str | None,
    provider_host: str | None = None,
) -> str:
    base = f"Crédit de site détecté sur {url} : « {phrase} »."
    if provider_host:
        base = f"{base} Site du prestataire : {provider_host}."
    if proof is None:
        # #4741 — « inconnue » se NOMME : la page ne dit pas ce que fait ce prestataire, et on ne le devine pas.
        return f"{base} Activité non établie : la page ne dit pas ce que fait ce prestataire."
    return f"{base} Activité déclarée sur la page : {qualification} (« {proof} »)."


def _clean_free_name(raw: str) -> str | None:
    name = raw.strip().rstrip(".-–—").strip()
    if not name or len(name) > _MAX_NAME_LEN:
        return None
    first = normalize_name(name.split()[0])
    if first in _PLATFORMS or first in _NOT_A_NAME:
        return None
    return name


def collect_site_credit_partners(
    pages: list[dict[str, Any]] | None,
    *,
    detected_at: str | None,
) -> list[dict[str, Any]]:
    """Balaye les pages déjà scrapées et rend les prestataires trouvés en crédit.

    ``pages`` = ``[{"url", "markdown"}]`` (les sources du ``ResearchBundle``).
    Une même ESN n'apparaît qu'une fois, sur la PREMIÈRE page qui la cite.
    """
    if not isinstance(pages, list):
        return []
    names = known_esn_names()

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        if not isinstance(page, dict):
            continue
        url = str(page.get("url") or "").strip()
        markdown = page.get("markdown")
        if not url or not isinstance(markdown, str) or not markdown.strip():
            continue
        folded = _fold(markdown)
        text = folded.lower()
        links = [(m.group(1), m.group(2)) for m in _MD_LINK_URL_RE.finditer(markdown)]

        for name in names:
            key = normalize_name(name)
            if not key or key in seen:
                continue
            name_re = re.escape(key)
            hit = None
            for m in _CREDIT_MARKERS:
                found = re.search(rf"{re.escape(m)}.{{0,{_MAX_GAP}}}{name_re}", text, re.DOTALL) or re.search(
                    rf"{name_re}.{{0,{_MAX_GAP}}}{re.escape(m)}", text, re.DOTALL
                )
                if found:
                    hit = (m, found.start(), found.end())
                    break
            if hit is None:
                continue
            _marker, start, end = hit
            seen.add(key)
            qualification, proof = _qualify(text[end:])
            out.append(
                {
                    "name": name,
                    # Deux preuves indépendantes convergent : un crédit TEXTUEL
                    # trouvé sur le site (pas une inférence du modèle) ET une
                    # société que le référentiel connaît — même barème que
                    # `esn_presence._certainty(has_evidence=True, is_known=True)`.
                    "certainty": "forte",
                    "scope": None,
                    "detectedAt": detected_at,
                    "evidence": _evidence(
                        url,
                        _credit_phrase(folded, start, end),
                        qualification,
                        proof,
                        _provider_host(links, name, url),
                    ),
                    "qualification": qualification,
                    "qualificationEvidence": proof,
                }
            )

        # #4740 — le prestataire HORS référentiel : crédité explicitement par la
        # page, une seule preuve (« moyenne »).
        for match in _FREE_CREDIT_RE.finditer(folded):
            free_name = _clean_free_name(match.group("name"))
            if free_name is None:
                continue
            key = normalize_name(free_name)
            if not key or any(re.search(rf"\b{re.escape(k)}\b", key) for k in seen):
                continue
            seen.add(key)
            qualification, proof = _qualify(folded[match.end() :])
            out.append(
                {
                    "name": free_name,
                    "certainty": "moyenne",
                    "scope": None,
                    "detectedAt": detected_at,
                    "evidence": _evidence(
                        url,
                        _credit_phrase(folded, match.start(), match.end()),
                        qualification,
                        proof,
                        _provider_host(links, free_name, url),
                    ),
                    "qualification": qualification,
                    "qualificationEvidence": proof,
                }
            )
    return out


__all__ = ["collect_site_credit_partners"]
