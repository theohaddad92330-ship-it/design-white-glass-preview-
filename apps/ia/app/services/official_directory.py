"""Annuaire officiel — les dirigeants NOMMÉS sur le site du compte.

Pourquoi ce module existe (audit `agent_docs/audit-org-mapping-2026-07-22.md`,
§1.1) : l'assembleur ne crée qu'UNE source par personne, et la formule de confiance
p14 plafonne alors à 70/100 — le seuil « vérifié » étant 90, la vue n°1 de
l'organigramme est **structurellement vide**. Il ne manque pas du câblage : il
manque une SECONDE source, de nature différente, officielle et datable.

La page « équipe / gouvernance / direction » du site du compte est cette source :
elle est publiée par l'organisation elle-même (grounding A, p10), elle nomme des
rattachements que le registre ignore (un DSI n'est pas un mandataire social), et
le produit la scrape DÉJÀ — ce module lit les pages déjà payées par le run
(``ResearchBundle``), sans nouveau fournisseur, sans nouvelle clé, sans appel
réseau supplémentaire.

Trois règles, non négociables :

1. **Zéro donnée inventée.** Une personne n'est retenue que si son nom ET sa
   fonction sont écrits textuellement sur la page. Aucune hiérarchie n'est déduite
   de l'ordre d'affichage, de la taille des photos ou de la position dans le DOM :
   ce module ne produit JAMAIS de lien N+1, seulement « cette personne est
   présentée comme <fonction> par l'organisation elle-même ».
2. **Provenance réelle.** Chaque extraction porte l'URL exacte de la page et la
   date de collecte — sans elles, la source ne vaut pas ses +30 (elle n'est ni
   citable ni datable).
3. **Échec gracieux.** Site inconnu, page absente, scrape en échec, markdown
   illisible ⇒ liste vide. Aucune exception ne remonte, le run est inchangé.

Déterministe, pur, sans I/O ni LLM (un LLM ici plafonnerait de toute façon la
preuve à 49, cf. ``org_confidence.LLM_ONLY_CEILING``).
"""

from __future__ import annotations

import re
from typing import Any

from app.services.assets import website_domain

# Nombre maximum de personnes retenues par page. Un annuaire de 500 profils ne
# doit pas gonfler le dossier : les pages de direction utiles en tiennent quelques
# dizaines, au-delà c'est un listing salariés (bruit pour un organigramme).
MAX_PEOPLE_PER_PAGE = 60

# ── Quelles pages sont des pages « qui dirige » ───────────────────────────────
# Mots-clés d'URL, FR + EN. Volontairement resserré sur le vocabulaire qui annonce
# des PERSONNES : une page « à propos » ou « histoire » n'en nomme pas forcément.
_TEAM_URL_KEYWORDS = (
    "organigramme",
    "gouvernance",
    "governance",
    "comite-de-direction",
    "comite-executif",
    "comite-direction",
    "comex",
    "codir",
    "directoire",
    "conseil-administration",
    "conseil-d-administration",
    "board",
    "leadership",
    "management-team",
    "executive-team",
    "our-team",
    "the-team",
    "meet-the-team",
    "notre-equipe",
    "nos-equipes",
    "equipe",
    "team",
    "direction",
    "dirigeants",
    "management",
    "who-we-are",
    "qui-sommes-nous",
)

# Pages à écarter même quand un mot-clé matche (une page « management de la
# qualité » ou « direction artistique produit » n'est pas un organigramme).
# #4743 — l'exclusion des mentions légales est CONSERVÉE : elles nomment un
# représentant légal / directeur de publication, pas un organigramme. Leur lot est lu
# par la collecte (firecrawl), mais jamais promu en annuaire de direction.
_TEAM_URL_ANTI_KEYWORDS = (
    "mentions-legales",
    "mention-legale",
    "mentions_legales",
    "mentionslegales",
    "informations-legales",
    "information-legale",
    "legal-notice",
    "legal/notice",
    "legal-information",
    "impressum",
    "privacy",
    "cookie",
    "cgv",
    "cgu",
    "recrutement",
    "carriere",
    "careers",
    "job",
    "offre",
)

# ── Le vocabulaire des fonctions dirigeantes ─────────────────────────────────
# ANCRÉ EN DÉBUT DE LIBELLÉ : c'est le garde-fou de précision. « Directeur
# Général » est une fonction ; « Contactez notre Direction Générale » est une
# phrase. Sans l'ancre, toute phrase citant un titre fabriquerait un dirigeant.
#
# NB : volontairement distinct de ``hierarchy_level`` — celui-ci répond « quel
# niveau ? » sur un titre DÉJÀ connu, celui-là répond « cette ligne est-elle un
# libellé de fonction ? ». Les deux vocabulaires se recouvrent sans se confondre
# (un « Gérant » ou un « Fondateur » est un dirigeant sans être un tier L0-L4).
_TITLE_START_RE = re.compile(
    r"^(?:"
    r"direct(?:eur|rice)s?|"
    r"pr[ée]sident(?:e)?|"
    r"vice[-\s]?pr[ée]sident(?:e)?|"
    r"p-?dg|dg[ad]?|dsi|rssi|daf|drh|dpo|cto|cio|ceo|cfo|coo|cmo|cdo|ciso|vp|"
    r"chief\b|head\s+of\b|"
    r"responsable|chef\s+de\b|"
    r"secr[ée]taire\s+g[ée]n[ée]ral(?:e)?|"
    r"g[ée]rant(?:e)?|"
    r"administrat(?:eur|rice)|"
    r"membre\s+d[ue]\b|"
    r"co[-\s]?fondat(?:eur|rice)|fondat(?:eur|rice)|"
    r"founder|co[-\s]?founder|"
    r"managing\s+director|general\s+manager|"
    r"manager\b|"
    r"partner\b|associ[ée]\b"
    r")",
    re.IGNORECASE,
)

# Mots qui trahissent une raison sociale / un service, jamais un patronyme.
_ORG_STOPWORDS = frozenset(
    {
        "groupe", "group", "holding", "sa", "sas", "sasu", "sarl", "sci", "gie", "spa",
        "inc", "ltd", "llc", "gmbh", "corp", "corporation", "company", "cie",
        "industries", "industrie", "technologies", "technologie", "solutions", "systems",
        "services", "service", "conseil", "consulting", "partners", "associates",
        "société", "societe", "association", "fondation", "fédération", "federation",
        "comité", "comite", "direction", "département", "departement",
        "agence", "banque", "assurance", "france", "international", "europe", "global",
        "digital", "innovation", "immobilier", "capital", "invest", "investissement",
        "copyright", "tous", "droits", "mentions", "politique", "contact", "newsletter",
    }
)

# Particules autorisées en minuscules à l'intérieur d'un nom.
_NAME_PARTICLES = frozenset(
    {"de", "du", "des", "le", "la", "les", "van", "von", "der", "den", "di", "da",
     "do", "dos", "el", "al", "bin", "ben", "mac", "mc", "saint", "sainte"}
)

_NAME_TOKEN_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.\-]*$")

# Séparateurs « nom <sep> fonction » d'une ligne de carte / de liste. Le tiret
# simple exige des espaces autour, sinon « Jean-Pierre Martin » se couperait en deux.
_SEPARATOR_RE = re.compile(r"\s*[—–|·•]\s*|\s+[-–]\s+|\s*:\s*|,\s+")

_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MD_DECORATION_RE = re.compile(r"[*_`~]+")
_MD_PREFIX_RE = re.compile(r"^\s*(?:#{1,6}\s*|[-*+>]\s+|\|\s*)+")
_DIGIT_RE = re.compile(r"\d")


def is_team_page(url: str | None, title: str | None = None) -> bool:
    """La page annonce-t-elle des PERSONNES (équipe / gouvernance / direction) ?

    Lecture de l'URL (et, à défaut de mot-clé dans l'URL, du titre de la page) —
    le même vocabulaire que ``firecrawl.HIGH_VALUE_KEYWORDS`` utilise déjà pour
    prioriser ces pages au scrape. Aucun réseau."""
    haystack = f"{url or ''}".lower()
    if not haystack:
        return False
    if any(bad in haystack for bad in _TEAM_URL_ANTI_KEYWORDS):
        return False
    if any(kw in haystack for kw in _TEAM_URL_KEYWORDS):
        return True
    label = f"{title or ''}".lower()
    return bool(label) and any(kw in label.replace(" ", "-") for kw in _TEAM_URL_KEYWORDS)


def _clean_line(raw: str) -> str:
    """Une ligne de markdown débarrassée de sa décoration, PAS de son texte.

    Les liens sont déroulés vers leur libellé (``[Luc Petit](/equipe/luc)`` →
    ``Luc Petit``) : le nom reste celui écrit sur la page."""
    line = _MD_IMAGE_RE.sub(" ", raw)
    line = _MD_LINK_RE.sub(r"\1", line)
    line = _MD_PREFIX_RE.sub("", line)
    line = _MD_DECORATION_RE.sub("", line)
    line = line.replace("|", " | ")
    return " ".join(line.split()).strip(" |")


def _looks_like_title(text: str) -> bool:
    """Le libellé EST une fonction dirigeante écrite telle quelle."""
    label = text.strip().rstrip(".;")
    if not label or len(label) > 120 or _DIGIT_RE.search(label):
        return False
    if len(label.split()) > 10:
        return False
    return bool(_TITLE_START_RE.match(label))


def _looks_like_person_name(text: str) -> bool:
    """Le libellé EST un patronyme : 2 à 4 mots capitalisés, aucun mot de raison
    sociale, aucune fonction. Conservateur par construction — un faux négatif
    coûte une corroboration, un faux positif fabriquerait un dirigeant."""
    name = text.strip().strip(",;:")
    if not name or len(name) > 60 or _DIGIT_RE.search(name):
        return False
    if _TITLE_START_RE.match(name):  # une fonction n'est pas un nom
        return False
    tokens = name.split()
    if not (2 <= len(tokens) <= 4):
        return False
    capitalised = 0
    for token in tokens:
        if not _NAME_TOKEN_RE.match(token):
            return False
        lowered = token.lower().strip(".'’-")
        if lowered in _ORG_STOPWORDS:
            return False
        if token[0].isupper():
            capitalised += 1
        elif lowered not in _NAME_PARTICLES:
            return False
    return capitalised >= 2


def _pair(left: str, right: str) -> tuple[str, str] | None:
    """(nom, fonction) quel que soit l'ordre d'écriture sur la page, ou None."""
    if _looks_like_person_name(left) and _looks_like_title(right):
        return left.strip().strip(",;:"), right.strip().rstrip(".;")
    if _looks_like_title(left) and _looks_like_person_name(right):
        return right.strip().strip(",;:"), left.strip().rstrip(".;")
    return None


def _pair_from_line(line: str) -> tuple[str, str] | None:
    """« Paul Durand — Directeur Financier », « Directrice Générale : Claire
    Moreau », « Jean Dupont, Directeur Général, a rejoint le groupe en 2010 »…

    La ligne est découpée sur ses séparateurs et seuls les segments ADJACENTS
    sont appariés : c'est ce qui permet de lire une phrase de biographie sans
    accepter n'importe quelle paire distante de la même ligne. Le premier couple
    valide gagne."""
    segments = [seg.strip() for seg in _SEPARATOR_RE.split(line) if seg and seg.strip()]
    for left, right in zip(segments, segments[1:], strict=False):
        found = _pair(left, right)
        if found:
            return found
    return None


def person_and_title(text: str | None) -> tuple[str, str] | None:
    """« Prénom Nom — Fonction » → ``(nom, fonction)``, sinon ``None``.

    Le même appariement que celui qui lit une page « équipe », rendu public
    pour un usage qui n'a rien à voir avec le scrape : reconnaître qu'une
    PERSONNE a été ingérée là où on attendait une organisation
    (``entity_type.classify_entity_type``).

    Recette live du 29/08/2026 : la cartographie du compte ROCHE portait
    « Wafaa Mamilli — Chief Digital Technology Officer » parmi ses entités, et
    l'écran de couverture comptait cette personne dans son dénominateur.

    ⚠️ Il faut un patronyme ET une fonction, ADJACENTS. Un patronyme NU ne
    suffit pas : « Michel Bras » est une raison sociale autant qu'un nom, et
    écarter une filiale réelle coûte plus cher que laisser passer une personne
    — le faux positif fait disparaître une cible commerciale, le faux négatif
    laisse une ligne de trop qu'un humain peut corriger.

    Déterministe, pur, sans I/O — comme le reste du module.
    """
    line = _clean_line(str(text or ""))
    if not line:
        return None
    return _pair_from_line(line)


def extract_officials(
    markdown: str | None,
    *,
    url: str,
    collected_at: str,
) -> list[dict[str, Any]]:
    """Les personnes NOMMÉES avec leur fonction sur une page, avec provenance.

    Deux formes couvrent l'écrasante majorité des pages de direction réelles :
    le couple sur une ligne (« Nom — Fonction », « Fonction : Nom ») et la carte
    (le nom en titre, la fonction sur la ligne suivante). Tout le reste est
    ignoré : mieux vaut une personne non corroborée qu'une personne inventée.

    Retourne des dicts ``{fullName, title, url, collectedAt}`` — jamais d'exception.
    """
    text = markdown if isinstance(markdown, str) else ""
    if not text.strip() or not url:
        return []

    lines = [_clean_line(raw) for raw in text.splitlines()]
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    pending_name: str | None = None
    pending_at = -10

    def _record(name: str, title: str) -> None:
        key = " ".join(name.lower().split())
        if key in seen:
            return
        seen.add(key)
        found.append({"fullName": name, "title": title, "url": url, "collectedAt": collected_at})

    for index, line in enumerate(lines):
        if not line:
            continue
        if len(found) >= MAX_PEOPLE_PER_PAGE:
            break

        pair = _pair_from_line(line)
        if pair:
            _record(*pair)
            pending_name = None
            continue

        # Carte : le nom seul, puis la fonction seule sur une ligne proche. La
        # fenêtre (2 lignes) est celle du rendu markdown d'une carte ; au-delà,
        # rien ne dit que les deux libellés parlent de la même personne.
        if _looks_like_person_name(line):
            pending_name, pending_at = line.strip(), index
            continue
        if pending_name and _looks_like_title(line) and index - pending_at <= 2:
            _record(pending_name, line.strip().rstrip(".;"))
            pending_name = None

    return found


def _same_site(page_url: str, domain: str) -> bool:
    """La page est-elle publiée par le compte lui-même ? Le sous-domaine compte
    (``corporate.acme.fr``), un site tiers non (``annuaire.com/acme``) : toute la
    valeur de la preuve tient à son ÉDITEUR."""
    host = website_domain(page_url)
    return bool(host) and (host == domain or host.endswith(f".{domain}"))


def collect_official_directory(
    pages: list[dict[str, Any]] | None,
    *,
    website: str | None,
    collected_at: str,
) -> list[dict[str, Any]]:
    """Balaye les pages DÉJÀ scrapées du run et rend l'annuaire officiel du compte.

    ``pages`` = ``[{"url", "markdown", "title"}]`` (les sources du
    ``ResearchBundle``). Seules sont lues les pages du site du compte ET dont
    l'URL annonce des personnes. Site inconnu ⇒ liste vide : sans domaine de
    référence, impossible de distinguer une page officielle d'un annuaire tiers,
    et une preuve dont on ne connaît pas l'éditeur ne vaut pas grounding A.
    """
    domain = website_domain(website)
    if not domain or not isinstance(pages, list):
        return []

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for page in pages:
        if not isinstance(page, dict):
            continue
        url = str(page.get("url") or "")
        if not url or not _same_site(url, domain) or not is_team_page(url, page.get("title")):
            continue
        for person in extract_officials(page.get("markdown"), url=url, collected_at=collected_at):
            key = " ".join(str(person["fullName"]).lower().split())
            if key in seen:
                continue
            seen.add(key)
            out.append(person)
        if len(out) >= MAX_PEOPLE_PER_PAGE:
            return out[:MAX_PEOPLE_PER_PAGE]
    return out


__all__ = ["collect_official_directory", "extract_officials", "is_team_page"]
