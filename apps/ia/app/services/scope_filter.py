"""Le cadrage restreint ce qu'on recommande (recette finale §18, §34 — P0-07).

Le rapport montre un chemin d'accès recommandé qui place, pour une ESN française,
« Yiming L. — Chief Data Officer, Société Générale China » et « Valentine A. —
Managing Director, Americas » dans les quatre premières actions. Le commercial a
pourtant déclaré la France, et la stratégie retenue est bottom-up. Deux
contradictions dans la même carte.

Ce module ne cherche pas à deviner : il applique le cadrage que l'utilisateur a
SAISI. C'est important, parce que la tentation serait de « corriger » le
classement du modèle avec des heuristiques — ce qui rend le résultat impossible
à expliquer. Ici, chaque exclusion se justifie par une case que quelqu'un a
cochée, et se dit avec ses mots.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence

from app.services.run_cadrage import run_role_terms

#: Les niveaux hiérarchiques du §18, du plus haut au plus bas.
HIERARCHY_LEVELS = ("c_level", "n1", "n2", "operational")

#: Titres qui signent chaque niveau. Volontairement courts : un titre est un
#: indice, pas une preuve, et une liste trop bavarde produit des faux positifs
#: qui écartent le bon interlocuteur.
_LEVEL_PATTERNS: dict[str, re.Pattern[str]] = {
    "c_level": re.compile(
        r"\b(c[ée]o|cto|cio|cfo|coo|cdo|ciso|cmo|chro|cdao|"
        r"pr[ée]sident|directeur\s+g[ée]n[ée]ral|group\s+chief|chief\s+\w+\s+officer|"
        r"board\s+member|administrateur)\b",
        re.IGNORECASE,
    ),
    "n1": re.compile(
        r"\b(managing\s+director|directeur\s+(?!g[ée]n[ée]ral)\w+|"
        r"head\s+of|vp\b|vice[- ]president|executive\s+director|"
        r"directrice\s+(?!g[ée]n[ée]rale)\w+)\b",
        re.IGNORECASE,
    ),
    "n2": re.compile(
        r"\b(responsable|manager|program\s+director|domain\s+lead|"
        r"chef\s+de\s+(projet|service)|team\s+lead|principal)\b",
        re.IGNORECASE,
    ),
    "operational": re.compile(
        r"\b(ing[ée]nieur|developer|d[ée]veloppeur|architecte?|consultant|"
        r"analyst[e]?|expert|sp[ée]cialiste|product\s+owner|scrum)\b",
        re.IGNORECASE,
    ),
}

#: Pays et régions qui sortent d'un cadrage France. Reprend le vocabulaire déjà
#: utilisé par le typage d'entité — un contact « Société Générale China » et une
#: entité « SG China » doivent être écartés par la même lecture.
_NON_FRANCE_RE = re.compile(
    r"\b(china|chine|americas?|am[ée]rique|usa|united\s+states|canada|brazil|br[ée]sil|"
    r"india|inde|japan|japon|singapore|singapour|hong\s?kong|dubai|"
    r"africa|afrique|maghreb|maroc|tunisie|alg[ée]rie|senegal|s[ée]n[ée]gal|"
    r"asia|asie|pacific|pacifique|middle\s+east|moyen[- ]orient|"
    # #3742 — zones et pays que les titres de grands groupes écrivent tels quels
    # (« CFO India », « VP Pacific », « Cairo Hub ») : mesuré chez Schneider le 10/10.
    r"apac|apj|latam|mena|anz|cairo|caire|egypt|[ée]gypte|oceania|oc[ée]anie|gcc|asean|"
    r"australia|australie|mexico|mexique|turkey|turquie|israel|ukraine|russia|russie)\b",
    re.IGNORECASE,
)

#: Ce qui est EUROPÉEN mais pas français : sort d'un cadrage France, reste sous Europe.
_EUROPE_RE = re.compile(
    r"\b(uk|united\s+kingdom|london|londres|germany|allemagne|"
    r"spain|espagne|italy|italie|belgium|belgique|netherlands|pays[- ]bas|"
    r"luxembourg|suisse|switzerland|poland|pologne|portugal|ireland|irlande|"
    r"sweden|su[èe]de|norway|norv[èe]ge|denmark|danemark|finland|finlande|"
    r"romania|roumanie|greece|gr[èe]ce|hungary|hongrie|"
    # #4044 — pays et villes écrits dans la langue du pays (même liste que `geo-perimeter.ts`).
    r"deutschland|espa[ñn]a|italia|nederland|belgi[ëe]|[öo]sterreich|schweiz|polska|sverige|norge|danmark|suomi|"
    r"frankfurt|berlin|munich|m[üu]nchen|hamburg|cologne|k[öo]ln|d[üu]sseldorf|stuttgart|madrid|barcelona|"
    r"barcelone|valencia|sevilla|bilbao|milan|milano|roma|torino|amsterdam|rotterdam|brussels|bruxelles|"
    r"brussel|z[üu]rich|geneva|gen[èe]ve|lausanne|vienna|wien|lisbon|lisbonne|lisboa|dublin|warsaw|varsovie|"
    r"warszawa|stockholm|copenhagen|copenhague|oslo|helsinki|prague|praha|budapest|bucharest|bucarest|athens|"
    r"ath[èe]nes|"
    # #3742 — sous-régions : « VP Nordics », « CDO CEE », « BeNe / Baltics ».
    r"nordics?|baltics?|bene|benelux|cee|dach|iberia|ib[ée]rie|scandinavia|scandinavie|"
    # Filiales étrangères connues d'un groupe français (Auchan → Alcampo, Espagne).
    r"alcampo)\b",
    re.IGNORECASE,
)

#: « Europe » / « EMEA » : un rôle qui couvre la France. Gardé sous France (décision
#: Louis 10/10, #3742) ; compte comme européen sous le périmètre Europe.
_EUROPE_WIDE_RE = re.compile(r"\b(europe|emea)\b", re.IGNORECASE)
_FRANCE_RE = re.compile(r"\b(france|fran[çc]ais(e)?|french)\b", re.IGNORECASE)


def detect_level(title: str | None) -> str | None:
    """Le niveau hiérarchique que ce titre suggère, ou ``None``.

    Testé du plus haut au plus bas : « Managing Director — Head of Infrastructure »
    est un N-1, pas un N-2, et lire les motifs dans l'autre sens le rangerait
    parmi les responsables.
    """
    text = (title or "").strip()
    if not text:
        return None
    for level in HIERARCHY_LEVELS:
        if _LEVEL_PATTERNS[level].search(text):
            return level
    return None


def matches_geo(text: str | None, geo_perimeter: str | None, geo_areas: Sequence[str] | None = None) -> bool:
    """Ce libellé (titre, entité, localisation) tient-il dans la zone demandée ?

    ``None`` / ``international`` / ``world`` (#2163.9) ⇒ tout passe : sans
    cadrage, on ne restreint rien, et c'est la règle qui garantit qu'une
    absence d'option laisse le comportement inchangé. `world` est la même
    absence de restriction que `international`, nommée pour un commercial qui
    pense en « périmètre planétaire » plutôt qu'en « hors zone connue ».
    """
    if geo_perimeter in (None, "international", "world"):
        return True
    blob = (text or "").strip()
    if not blob:
        # Un libellé vide n'est pas une preuve d'être hors zone. On le garde :
        # écarter par manque d'information ferait disparaître des contacts
        # parfaitement français dont le titre ne mentionne aucun pays.
        return True
    if geo_perimeter == "city":
        # #2163.12 — granularité VILLE : un nom de ville, pas un pays/continent.
        # `geo_areas` porte le(s) nom(s) saisis (même champ générique que
        # `region`/`country`) ; aucun n'est saisi ⇒ rien à comparer, donc rien
        # à restreindre — même garde que `world`/`international` : un axe
        # incomplet ne fait jamais pire qu'aucun axe.
        cities = [str(area).strip().lower() for area in (geo_areas or []) if str(area).strip()]
        if not cities:
            return True
        return any(city in blob.lower() for city in cities)
    if geo_perimeter == "europe":
        return (
            not _NON_FRANCE_RE.search(blob)
            or bool(_EUROPE_RE.search(blob))
            or bool(_EUROPE_WIDE_RE.search(blob))
        )
    # `france` et `region` : toute mention d'un ailleurs suffit à écarter, SAUF si
    # le libellé nomme aussi la France (« Head of France & Nordics ») — #3742.
    # « Europe »/« EMEA » ne sont pas un ailleurs : ils couvrent la France.
    if _FRANCE_RE.search(blob):
        return True
    return not _NON_FRANCE_RE.search(blob) and not _EUROPE_RE.search(blob)


def filter_recommended_path(
    people: Sequence[Mapping[str, object]],
    scope: Mapping[str, object] | None,
) -> tuple[list[dict], list[dict]]:
    """Sépare le chemin recommandé en ``(retenus, écartés)``.

    Rendre les deux listes, et pas seulement la première, est le point qui
    compte : le §22 exige un bloc « ce que Bellum écarte ». Un contact retiré
    sans motif se lit comme une donnée manquante ; retiré AVEC son motif, il
    devient une décision que le commercial peut contredire.
    """
    if not scope:
        return [dict(p) for p in people], []

    geo = scope.get("geo_perimeter")
    geo_areas = scope.get("geo_areas")
    levels = scope.get("hierarchy_levels")
    level_order = [str(lv) for lv in levels] if isinstance(levels, (list, tuple)) and levels else []
    # Cadrage analyse (15/10) — les postes à placer se lisent en TERMES d'intitulé
    # (`business_family_terms`, résolus par le contrat), plus en libellé de famille :
    # « Data / IA » n'apparaît dans aucun titre, « data » oui.
    role_terms = run_role_terms(scope)

    kept: list[dict] = []
    dropped: list[dict] = []
    for raw in people:
        person = dict(raw)
        blob = " ".join(
            str(person.get(key) or "")
            for key in ("title", "role", "entity", "company", "location", "persona")
        )

        areas = geo_areas if isinstance(geo_areas, (list, tuple)) else None
        # #4432.4 — un cadrage ZONE (région(s), département(s)) : le LIEU de la fiche décide. Dans la
        # zone → en tête ; lieu connu hors zone → écarté, nommé « hors zone » ; lieu absent → gardé, après.
        wanted = zone_departments(areas) if geo == "region" and areas else frozenset()
        if wanted:
            located = place_departments(" ".join(str(person.get(k) or "") for k in ("location", "city")))
            if located and not (located & wanted):
                person["excludedReason"] = f"hors zone ({', '.join(str(a) for a in areas)})"
                dropped.append(person)
                continue
            person["_geoRank"] = 0 if located & wanted else 1
        if not matches_geo(blob, geo if isinstance(geo, str) else None, areas):
            # #3820 — un cadrage VILLE/SITE se nomme « hors site », avec la
            # ville demandée : un siège hors zone n'exclut qu'un INDIVIDU
            # dont le libellé dit explicitement un AUTRE lieu, et la raison
            # le dit précisément plutôt qu'un générique « périmètre ».
            if geo == "city" and areas:
                person["excludedReason"] = f"hors site ({', '.join(str(a) for a in areas)})"
            else:
                person["excludedReason"] = "hors du périmètre géographique demandé"
            dropped.append(person)
            continue

        title = str(person.get("title") or person.get("role") or "")
        level = detect_level(title) if (level_order or role_terms) else None
        if role_terms:
            person_terms_match = _role_terms_match(blob, role_terms)
            # Un OPÉRATIONNEL d'un autre métier (l'« ingénieure data » quand on
            # place du cyber) est un pair du poste, pas un acheteur : il sort,
            # avec son motif. Un décideur reste — c'est lui qui achète, quel que
            # soit le mot de son titre — et un titre non reconnu reste aussi.
            if not person_terms_match and level == "operational":
                person["excludedReason"] = "hors des postes à placer"
                dropped.append(person)
                continue
            person["_roleRank"] = 0 if person_terms_match else 1

        if level_order:
            # Le niveau de contact CLASSE (décision 15/10), il ne retire plus :
            # l'ordre choisi est la priorité, un niveau non choisi ou non
            # détecté vient après — jamais caché.
            person["_levelRank"] = level_order.index(level) if level in level_order else len(level_order)

        if geo == "city" and areas:
            # KEVIN-FIX K.10 — le cadrage ville/site ORDONNE : le contact dont le lieu DIT la ville demandée
            # passe d'abord ; celui dont le lieu n'est pas dit reste (jamais « hors site » sans preuve).
            wanted = [str(a).strip().lower() for a in areas if str(a).strip()]
            person["_geoRank"] = 0 if any(city in blob.lower() for city in wanted) else 1

        kept.append(person)

    if role_terms or level_order or any("_geoRank" in p for p in kept):
        kept.sort(key=lambda p: (p.get("_geoRank", 0), p.get("_roleRank", 0), p.get("_levelRank", 0)))
        for person in kept:
            person.pop("_geoRank", None)
            person.pop("_roleRank", None)
            person.pop("_levelRank", None)

    return kept, dropped


def _role_terms_match(blob: str, terms: Sequence[str]) -> bool:
    folded = _fold(blob)
    return any(re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", folded) for t in terms)


def _place_fold(text: str) -> str:
    """Minuscules, sans accents, ponctuation et tirets en espaces : « Île-de-France » → « ile de france »."""
    plain = unicodedata.normalize("NFD", text or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", plain.lower())).strip()


def _zone_tables() -> tuple[dict[str, frozenset[str]], dict[str, frozenset[str]]]:
    """(libellé de région plié → départements, libellé de département plié → {code}), depuis les
    tables déjà tenues (`discover_request_reading._REGIONS`, `geo_labels`) — GA-26, aucune copie."""
    from app.services.discover_request_reading import _REGIONS
    from app.services.geo_labels import _DEPARTMENT_LABELS, region_departments

    regions = {" ".join(words): region_departments(code) for words, code, _label in _REGIONS}
    departments = {_place_fold(name): frozenset({code}) for code, name in _DEPARTMENT_LABELS.items()}
    return regions, departments


def zone_departments(geo_areas: Sequence[str] | None) -> frozenset[str]:
    """#4432.4 — les codes département d'une zone de cadrage (« Occitanie », « Haute-Garonne », « 31 »).
    Un libellé inconnu ne se devine pas : il n'ajoute rien."""
    from app.services.geo_labels import CITY_DEPARTMENTS

    regions, departments = _zone_tables()
    codes: set[str] = set()
    for area in geo_areas or []:
        key = _place_fold(str(area))
        if re.fullmatch(r"\d{2}|2a|2b|97\d", key):
            codes.add(key.upper())
        codes |= regions.get(key, frozenset()) | departments.get(key, frozenset())
        codes |= set(CITY_DEPARTMENTS.get(key, ()))
    return frozenset(codes)


def place_departments(location: str) -> frozenset[str]:
    """#4432.4 — les départements qu'une LOCALISATION nomme (région, département, grande ville, code
    postal). Lue sur le lieu seul, jamais sur un titre (« Directeur Nord » n'est pas le Nord)."""
    from app.services.geo_labels import CITY_DEPARTMENTS

    folded = f" {_place_fold(location)} "
    if not folded.strip():
        return frozenset()
    regions, departments = _zone_tables()
    found: set[str] = set()
    for table in (regions, departments, {k: frozenset(v) for k, v in CITY_DEPARTMENTS.items()}):
        for key, codes in table.items():
            if f" {key} " in folded:
                found |= codes
    for postal in re.findall(r"(?<!\d)(\d{5})(?!\d)", folded):
        found.add(postal[:3] if postal.startswith("97") else postal[:2])
    return frozenset(found)


def _fold(text: str) -> str:
    plain = unicodedata.normalize("NFD", text or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#+.]+", " ", plain.lower())).strip()


def summarize_exclusions(dropped: Iterable[Mapping[str, object]]) -> list[str]:
    """Les motifs d'exclusion, dédupliqués, dans l'ordre d'apparition — de quoi
    écrire « ce que Bellum écarte » sans répéter quinze fois la même phrase."""
    seen: list[str] = []
    for person in dropped:
        reason = str(person.get("excludedReason") or "").strip()
        if reason and reason not in seen:
            seen.append(reason)
    return seen
