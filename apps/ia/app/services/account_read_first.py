"""#2547 / #2533 (recette prod du 07/10, démo Ludovic & François) — Laura lit
la FICHE avant de répondre, et ne recadre pas une demande déjà cadrée.

Trois constats, une même cause — Laura répondait sur ce qu'elle croyait savoir,
pas sur ce que l'espace contenait :

1. « Quels signaux commerciaux récents chez Arquus ? » → « un signal apparu il
   y a moins de 7 jours », sans nature, date ni source, alors que la fiche
   Arquus en affichait dix, dont « Defence Procurement International ».
2. « Qui dois-je contacter à la DSI de UNEO ? » → « pas de fiche DSI
   vérifiée », alors que la fiche listait la Directrice des Systèmes
   d'information avec un e-mail vérifié.
3. « Trouve-moi des entreprises industrielles en Bourgogne-Franche-Comté avec
   des signaux, et 10 personnes à appeler par entreprise » → une question de
   cadrage (quels signaux ?), puis un classement SANS les listes de dix
   personnes, et « Région : 27 ».

Même geste que ``explicit_question_first`` (#3393) : un outil disponible gagne
sur une consigne, donc la clarification est RETIRÉE quand la demande nomme
déjà zone + type + livrable ; la consigne du tour dit QUEL outil lire d'abord.
Ce module ne lit que la FORME de la demande — aucune devinette d'intention —
et sait dire NON (une question générale n'est pas une question de compte).

Décisions tranchées (brief du 07/10) : un signal cité porte TOUJOURS nature +
date + source ; un contact existant de la fonction demandée est donné avec nom,
fonction et coordonnée EN CLAIR ; sans contact connu, on le DIT et on propose
la recherche de contacts en annonçant son coût, jamais un nom inventé ; « tous
les signaux » par défaut, dit en une ligne ; un code de région ou de
département s'écrit en toutes lettres.
"""

from __future__ import annotations

import re
import unicodedata

from app.services.discover_request_reading import _REGIONS
from app.services.geo_labels import department_label, region_label

#: Plafond « N personnes par entreprise » — celui du pont `account/contacts`.
PER_COMPANY_MAX = 10


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text or "")
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()


# ── 1. Une question qui vise UN compte nommé ─────────────────────────────────

_SIGNALS_ABOUT = re.compile(
    r"\bsignaux?\b[^?\n]{0,60}?\b(?:chez|sur|pour|de|du|d['’])\s*[A-ZÀ-Ý0-9]",
)
_CONTACT_VERB = re.compile(
    r"\b(?:contacter|appeler|joindre|approcher|cibler|[ée]crire)\b",
    re.IGNORECASE,
)
_WHO = re.compile(r"\b(?:qui|quelle\s+personne|quel\s+contact)\b", re.IGNORECASE)
_FUNCTION_AT = re.compile(
    r"\b(?:à|a|au|aux)\s+(?:la\s+|le\s+|l['’]\s*|les\s+)?(?P<function>[\wÀ-ÿ'’ -]{2,50}?)\s+"
    r"(?:de|du|des|d['’]|chez)\s*(?P<company>[A-ZÀ-Ý0-9][\w&'’.-]*(?:\s+[A-ZÀ-Ý0-9][\w&'’.-]*){0,4})",
)
#: Une demande de LISTE de comptes n'est pas une question sur UN compte.
_LIST_WORDS = re.compile(r"\b(?:entreprises|soci[ée]t[ée]s|comptes|PME|ETI|prospects|trouve[\s-]+moi)\b", re.IGNORECASE)


def is_account_signals_question(message: str | None) -> bool:
    text = (message or "").strip()
    if not text or _LIST_WORDS.search(text):
        return False
    return bool(_SIGNALS_ABOUT.search(text))


def requested_contact_function(message: str | None) -> str | None:
    """« Qui dois-je contacter à la DSI de UNEO ? » → « DSI » ; sinon ``None``."""
    text = (message or "").strip()
    if not text or _LIST_WORDS.search(text) or not _WHO.search(text) or not _CONTACT_VERB.search(text):
        return None
    match = _FUNCTION_AT.search(text)
    if not match:
        return None
    function = match.group("function").strip(" '’-")
    return function or None


def account_signals_note() -> str:
    return (
        "\n\nCETTE QUESTION VISE LES SIGNAUX D'UN COMPTE NOMMÉ (#2547) : avant de répondre, tu lis "
        "SA fiche — résous le compte dans l'espace (`search_workspace_accounts`), puis lis ses "
        "signaux avec `get_account_preflight` (`known_sections.current_signals` : les MÊMES que "
        "la fiche, champs `type`, `signal`, `date`, `source`). Chaque signal cité porte TOUJOURS sa NATURE, sa DATE "
        "et sa SOURCE (« Appel d'offres — 02/10/2026 — Registre public »). Un signal sans date ou "
        "sans source ne se présente jamais comme récent. Tu ne dis jamais « un signal apparu "
        "récemment » sans le nommer. Compte absent de l'espace : dis-le en une phrase."
    )


def account_contact_function_note(function: str) -> str:
    return (
        f"\n\nCETTE QUESTION VISE UNE FONCTION SUR UN COMPTE NOMMÉ (#2533) : « {function} ». Avant "
        "de répondre, tu lis SA fiche — résous le compte (`search_workspace_accounts`), puis "
        f"`get_account_contacts` avec `function` = « {function} » (pas de question de "
        "clarification : l'outil t'est retiré). Chaque contact rendu se donne avec son NOM "
        "COMPLET, sa FONCTION et sa coordonnée EN CLAIR (e-mail, téléphone), et « e-mail vérifié » "
        "quand `email_verified` vaut true. Jamais « aucune fiche vérifiée » devant un contact que "
        "l'outil rend. `function_not_found` : dis qu'aucun contact de cette fonction n'est connu, "
        "puis propose la recherche de contacts en annonçant son coût — jamais un nom inventé."
    )


# ── 1b. Une demande de PERSONNES chez une entreprise NOMMÉE, sans « qui » ────
#
# #3859 (recette prod 08/10) : « Trouve-moi 5 décideurs IT chez Kiabi » —
# `requested_contact_function` ne se déclenche que sur la forme « qui dois-je
# contacter » ; cette forme impérative (« trouve-moi N <fonction> chez X »)
# n'avait aucun détecteur, donc aucune consigne de tour. Résultat observé :
# Laura répond « il faut élargir la recherche » — comme si c'était un geste à
# faire soi-même ailleurs — au lieu de LANCER elle-même la recherche de
# personnes (doctrine c84 : une recherche demandée en langage naturel part
# directement, sans carte à valider).
_PEOPLE_AT_COMPANY_WORD = r"(?:d[ée]cideurs?|d[ée]cisionnaires?|interlocuteurs?|contacts?|personnes)"
#: Mêmes mots que ``_NUMBER_WORDS`` (section 2) — redits ici car ce bloc les précède dans le fichier.
_COUNT_WORDS = ("deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix")
_PEOPLE_AT_COMPANY = re.compile(
    rf"\b(?:\d{{1,2}}|{'|'.join(_COUNT_WORDS)})\s+{_PEOPLE_AT_COMPANY_WORD}\b"
    r"(?:\s+(?P<function>[A-Za-zÀ-ÿ]+))?"
    r"[^?.\n]{0,30}?\b(?:chez|de|du|des|d['’])\s*"
    r"(?P<company>[A-ZÀ-Ý0-9][\w&'’.-]*(?:\s+[A-ZÀ-Ý0-9][\w&'’.-]*){0,4})",
    re.IGNORECASE,
)


def requested_contacts_at_named_company(message: str | None) -> tuple[str, str | None] | None:
    """« Trouve-moi 5 décideurs IT chez Kiabi » → ("Kiabi", "IT") ; sinon ``None``."""
    text = (message or "").strip()
    if not text:
        return None
    match = _PEOPLE_AT_COMPANY.search(text)
    if not match:
        return None
    company = (match.group("company") or "").strip(" '’-")
    if not company:
        return None
    function = match.group("function")
    function = function.strip(" '’-") if function else None
    return company, function


def contacts_at_named_company_note(company: str, function: str | None) -> str:
    function_clause = f" (fonction visée : « {function} »)" if function else ""
    return (
        f"\n\nCETTE DEMANDE VISE DES CONTACTS CHEZ UNE ENTREPRISE NOMMÉE (#3859) : « {company} »"
        f"{function_clause}. Résous-la d'abord dans l'espace (`search_workspace_accounts`). Si elle "
        "y est déjà ET que `get_account_contacts` rend la fonction demandée, réponds avec ces "
        "contacts EN CLAIR. Sinon — compte absent de l'espace, ou `function_not_found` — NE DEMANDE "
        "JAMAIS à l'utilisateur d'élargir SA recherche : c'est TOI qui la lances, dans le MÊME tour, "
        "sans confirmation intermédiaire entre l'entreprise et les contacts — `plan_account_analysis` "
        "puis `start_account_analysis` (doctrine c84 : une recherche demandée en langage naturel part "
        "directement, sans carte à valider). Si cet outil de recherche/enrichissement n'est "
        "réellement pas disponible (clé absente, fournisseur en panne), dis-le avec la VRAIE raison — "
        "jamais une invitation à élargir SA recherche, comme si c'était un geste que l'utilisateur "
        "devait faire lui-même ailleurs."
    )


# ── 1c. Une demande de PERSONNES par EXPERTISE chez une entreprise NOMMÉE,
#        sans « qui » ET sans nombre ──────────────────────────────────────────
#
# #4058/#4057 (recette R8a, prod 429335a9c8, 14/10) : « Donne-moi les
# interlocuteurs cyber GRC de EDF, secteur énergie » — ni
# `requested_contact_function` (exige « qui dois-je contacter »), ni
# `requested_contacts_at_named_company` (exige un NOMBRE, « 5 décideurs IT »)
# ne reconnaissent cette troisième forme, la plus naturelle pour une demande
# par EXPERTISE plutôt que par fonction unique ou par compte de prospection.
# Résultat observé : aucune consigne de tour, Laura répond « pas de fiche
# EDF » ou « aucun interlocuteur cyber » sans avoir lu les contacts déjà en
# base (le RSSI listé dans « Contacts proches » de la fiche EDF).
_EXPERTISE_PEOPLE_AT_COMPANY = re.compile(
    rf"\b(?:les|des|quels?\s+sont\s+les|donne[\s-]+moi\s+les|trouve[\s-]+moi\s+les)\s+"
    rf"{_PEOPLE_AT_COMPANY_WORD}\b"
    r"(?:\s+(?P<expertise>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{0,40}?))?"
    r"\s+(?:chez|de|du|des|d['’])\s+"
    r"(?P<company>[A-ZÀ-Ý0-9][\w&'’.-]*(?:\s+[A-ZÀ-Ý0-9][\w&'’.-]*){0,4})",
    re.IGNORECASE,
)


def requested_people_by_expertise_at_company(message: str | None) -> tuple[str, str | None] | None:
    """« Donne-moi les interlocuteurs cyber GRC de EDF » → ("EDF", "cyber GRC") ; sinon ``None``."""
    text = (message or "").strip()
    if not text:
        return None
    match = _EXPERTISE_PEOPLE_AT_COMPANY.search(text)
    if not match:
        return None
    company = (match.group("company") or "").strip(" '’-")
    if not company:
        return None
    expertise = match.group("expertise")
    expertise = expertise.strip(" '’-") if expertise else None
    return company, expertise


def expertise_people_at_company_note(company: str, expertise: str | None) -> str:
    expertise_clause = f" sur l'expertise « {expertise} »" if expertise else ""
    return (
        f"\n\nCETTE DEMANDE VISE DES INTERLOCUTEURS CHEZ UNE ENTREPRISE NOMMÉE (#4058/#4057) : « {company} »"
        f"{expertise_clause}. Résous-la d'abord dans l'espace (`search_workspace_accounts`). Si elle y "
        "est déjà, lis SES contacts CONNUS en premier (`get_account_contacts`, `function` = l'expertise "
        "ou le rôle cherché) AVANT de dire qu'aucun interlocuteur n'est connu : un contact déjà en base "
        "sur cette expertise (RSSI, DSI…) se donne EN CLAIR — nom, fonction, coordonnée — jamais ignoré "
        "au profit d'une recherche externe. Seulement si `function_not_found` (aucun contact connu sur "
        "cette expertise), propose `propose_people_search` dans le MÊME tour, avec `expertise` DISTINCTE "
        "de `sector`/`scope` (#4058 : un secteur ne remplace jamais l'expertise cherchée) — jamais une "
        "invitation à élargir SA recherche comme un geste que l'utilisateur devrait faire lui-même "
        "ailleurs, et jamais un lien ou un texte qui ne déclenche aucune carte réelle. Compte absent de "
        "l'espace : dis-le, puis lance directement `plan_account_analysis`/`start_account_analysis` "
        "(doctrine c84) — jamais « pas de fiche » sans avoir d'abord cherché le compte dans l'espace."
    )


# ── 2. Une demande déjà CADRÉE : zone + type + livrable ──────────────────────

_REGION_PHRASES = tuple(" ".join(words) for words, _code, _label in _REGIONS)
_ZONE_WORDS = re.compile(r"\b(?:r[ée]gion|d[ée]partement|autour de|pr[èe]s de)\b", re.IGNORECASE)
_TYPE_WORDS = re.compile(
    r"\b(?:entreprises?|soci[ée]t[ée]s?|comptes?|PME|ETI|industriel\w*|groupes?|usines?|sites?)\b",
    re.IGNORECASE,
)
_NUMBER_WORDS = {"deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10}
_PEOPLE = r"(?:personnes|contacts|interlocuteurs|d[ée]cideurs|noms)"
_PER_COMPANY = re.compile(
    rf"\b(?P<n>\d{{1,2}}|{'|'.join(_NUMBER_WORDS)})\s+{_PEOPLE}\b[^?.\n]{{0,40}}?"
    r"\b(?:par|pour\s+chaque)\s+(?:entreprise|soci[ée]t[ée]|compte|bo[iî]te)",
    re.IGNORECASE,
)
_DELIVERABLE = re.compile(rf"\b(?:{_PEOPLE}|liste|à appeler|a appeler)\b", re.IGNORECASE)


def _names_a_zone(text: str) -> bool:
    folded = f" {_fold(text)} "
    if any(f" {phrase} " in folded for phrase in _REGION_PHRASES):
        return True
    return bool(_ZONE_WORDS.search(text))


def per_company_count(message: str | None) -> int | None:
    """« 10 personnes à appeler par entreprise » → 10 ; borné à ``PER_COMPANY_MAX``."""
    match = _PER_COMPANY.search(message or "")
    if not match:
        return None
    raw = match.group("n").lower()
    count = int(raw) if raw.isdigit() else _NUMBER_WORDS.get(raw)
    if not count:
        return None
    return min(count, PER_COMPANY_MAX)


def is_framed_prospecting_request(message: str | None) -> bool:
    """La demande nomme une ZONE, un TYPE d'entreprise et un LIVRABLE : rien à cadrer."""
    text = (message or "").strip()
    if not text:
        return False
    return _names_a_zone(text) and bool(_TYPE_WORDS.search(text)) and bool(_DELIVERABLE.search(text))


def framed_prospecting_note(message: str | None) -> str:
    count = per_company_count(message)
    people = (
        f"\n- Pour CHAQUE entreprise retenue, liste jusqu'à {count} contacts CONNUS (`get_account_contacts` "
        f"avec `limit` = {count}) : nom complet, fonction, coordonnées EN CLAIR. Une entreprise sans "
        "contact connu : dis-le sur sa ligne, et propose la recherche de contacts sans parler de "
        "coût — jamais un nom inventé, jamais « pas encore constitué » sans ce geste."
        if count
        else ""
    )
    capped = (
        f" (plafonné à {PER_COMPANY_MAX} par entreprise — dis-le)"
        if count == PER_COMPANY_MAX and _asked_more_than_cap(message)
        else ""
    )
    return (
        "\n\nCETTE DEMANDE EST DÉJÀ CADRÉE (#2547) — elle nomme une zone, un type d'entreprise et un "
        "livrable. Tu ne poses AUCUNE question de cadrage (l'outil de clarification t'est retiré) :"
        "\n- Signaux : TOUS les types par défaut. Dis-le en UNE ligne en tête (« J'ai pris tous les "
        "types de signaux. »), sans demander lesquels."
        f"{people}{capped}"
        "\n- Une région ou un département s'écrit en toutes lettres (« Bourgogne-Franche-Comté », "
        "« Côte-d'Or (21) »), jamais son code seul."
    )


def _asked_more_than_cap(message: str | None) -> bool:
    match = _PER_COMPANY.search(message or "")
    return bool(match and match.group("n").isdigit() and int(match.group("n")) > PER_COMPANY_MAX)


# ── 2 bis. NOUVELLES entreprises dans une VILLE nommée : le geste vers Découvrir ─────────

#: #3876.5 (lot Q02) — « ESN à Marseille » : un type d'entreprise, puis une ville en majuscule initiale.
#: Le trou entre les deux n'a AUCUNE majuscule (« l'ESN Sopra à Marseille » vise un compte nommé).
_CITY_SEARCH = re.compile(
    r"(?i:\b(?:ESN|SSII|PME|ETI|start-?ups?|entreprises?|soci[ée]t[ée]s?|[ée]diteurs?|agences?|cabinets?)\b)"
    r"[^?.\nA-ZÉÈÀÂÎÔÛ]{0,60}?"
    r"(?i:\b(?:[àa]|sur|dans|autour\s+de|pr[èe]s\s+de|proche\s+de)\s+)"
    r"(?P<city>[A-ZÉÈÀÂÎÔÛ][\wéèêëàâîïôûüç'’]+(?:-[\wéèêëàâîïôûüç]+)*)"
)
_OWN_WORKSPACE = re.compile(r"(?i)\b(?:mes|mon|ma|nos|notre|priorise\w*|class\w+)\b")


def city_company_search_city(message: str | None) -> str | None:
    """La ville d'une demande de NOUVELLES entreprises (« ESN à Marseille »), ou ``None``. Une demande
    sur l'espace (« mes ESN à Marseille ») ou sur un compte nommé n'est pas ce geste."""
    text = (message or "").strip()
    if not text or _OWN_WORKSPACE.search(text):
        return None
    match = _CITY_SEARCH.search(text)
    return match.group("city") if match else None


def city_company_search_note(city: str) -> str:
    return (
        f"\n\nCETTE DEMANDE CHERCHE DE NOUVELLES ENTREPRISES DANS UNE VILLE NOMMÉE (#3876.5) : « {city} ». "
        "Tu n'as AUCUNE question de cadrage à poser (l'outil de clarification t'est retiré) : appelle "
        f"`find_accounts` avec `city` = « {city} » (la commune elle-même, jamais son département) et les "
        "secteurs demandés. Le clic sur la carte « Action à valider » ouvre Découvrir pré-rempli, champ "
        "« Ville » inclus. Ne parle d'aucun coût, sans citer "
        "d'entreprise : tant que la recherche n'est pas lancée, tu n'en as vu aucune."
    )


# ── 3. En sortie : jamais un code INSEE brut ─────────────────────────────────

_REGION_CODE = re.compile(r"\b(?P<label>R[ée]gion)(?P<sep>\s*:\s*|\s+)(?P<code>\d{2})\b(?!\s*\()")
_DEPARTMENT_CODE = re.compile(r"\b(?P<label>D[ée]partement)(?P<sep>\s*:\s*|\s+)(?P<code>\d{2,3}|2A|2B)\b(?!\s*\()")


def name_geo_codes(reply: str) -> str:
    """« Région : 27 » → « Région : Bourgogne-Franche-Comté » ; un code inconnu reste tel quel.

    Rendu à l'octet quand rien ne correspond. Ne touche pas un code déjà
    accompagné de son libellé (« Département : Côte-d'Or (21) »).
    """
    if not reply:
        return reply

    def _region(match: re.Match[str]) -> str:
        return f"{match.group('label')}{match.group('sep')}{region_label(match.group('code'))}"

    def _department(match: re.Match[str]) -> str:
        return f"{match.group('label')}{match.group('sep')}{department_label(match.group('code'))}"

    return _DEPARTMENT_CODE.sub(_department, _REGION_CODE.sub(_region, reply))
