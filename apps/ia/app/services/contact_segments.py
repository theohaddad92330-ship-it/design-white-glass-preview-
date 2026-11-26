"""Rerun ciblé par FAMILLE et par NIVEAU (annexe organigramme §6, phase 5).

Le commercial voit une zone blanche (« Cyber × N-1 : personne ») et veut chercher
CETTE case, pas rejouer le dossier. ``resolve_segment_scope`` traduit le couple
(famille, niveau) du ``ContactScope`` en scope Apollo réutilisable par le ré-run
existant (endpoint ``enrich-contacts``) : titres et/ou séniorités.

Le vocabulaire est celui DÉJÀ affiché au commercial — familles de la matrice de
couverture (``coverage.service.ts``) et niveaux du contrat ``OrgGraph`` (L0-L5)
ou de la matrice (c_level / n1 / n2). Déterministe, aucun LLM. Une famille
inconnue retombe sur le mot-clé brut (comme un thème inconnu) : jamais un échec,
jamais un élargissement silencieux.
"""

from __future__ import annotations

import unicodedata
from typing import Any

# Les 3 bandes de titres. Les niveaux L0-L5 du contrat OrgGraph se projettent
# dessus : la matrice de couverture (et donc les titres métier réels) ne connaît
# que C-Level / N-1 / N-2.
_LEVEL_TITLE_BAND: dict[str, str] = {
    "l0": "c_level",  # gouvernance / board
    "l1": "c_level",  # exécutif (DG/DSI/CTO…)
    "l2": "n1",  # direction (VP / Directeur / Head of)
    "l3": "n2",  # management (Manager / Lead / Responsable)
    "l4": "n2",  # expert / opérationnel
    "l5": "n2",  # achats / contrôle — axe parallèle, même bande de titres
    "c_level": "c_level",
    "n1": "n1",
    "n2": "n2",
}

# Niveau → ``person_seniorities`` Apollo (valeurs réelles de l'API : owner,
# founder, c_suite, partner, vp, head, director, manager, senior, entry, intern).
# Utilisé quand AUCUNE famille n'est demandée : on cherche alors toute la strate.
_LEVEL_SENIORITIES: dict[str, list[str]] = {
    "l0": ["owner", "founder", "partner"],
    "l1": ["c_suite"],
    "l2": ["vp", "director", "head"],
    "l3": ["manager"],
    "l4": ["senior", "entry"],
    "l5": ["director", "manager"],
    "c_level": ["c_suite", "owner", "founder"],
    "n1": ["vp", "director", "head"],
    "n2": ["manager", "senior"],
}

# Familles canoniques — MIROIR de ``FAMILY_DEFS`` (apps/api coverage.service.ts) :
# mêmes clés, mêmes alias, mêmes titres par niveau (enrichis de quelques variantes
# pour qu'Apollo, qui matche le titre, ait plusieurs formulations à tester).
_FAMILY_PRESETS: list[dict[str, Any]] = [
    {
        "key": "it",
        "aliases": {"it", "dsi", "si", "informatique", "informationtechnology"},
        "titles": {
            "c_level": ["DSI", "CIO", "Directeur des Systèmes d'Information"],
            "n1": ["Directeur des SI", "Adjoint au DSI", "Head of IT"],
            "n2": ["Responsable SI", "IT Manager"],
        },
    },
    {
        "key": "cyber",
        "aliases": {"cyber", "cybersecurite", "securite", "security", "rssi", "ciso", "ssi"},
        "titles": {
            "c_level": ["CISO", "RSSI Groupe"],
            "n1": ["RSSI", "Directeur Cybersécurité", "Head of Security"],
            "n2": ["Responsable SSI", "Analyste sécurité", "SOC Manager"],
        },
    },
    {
        "key": "data",
        "aliases": {"data", "donnees", "analytics", "bi", "datascience"},
        "titles": {
            "c_level": ["Chief Data Officer"],
            "n1": ["Head of Data", "Directeur Data"],
            "n2": ["Data Lead", "Data Manager", "Responsable Data"],
        },
    },
    {
        # #2635.1 — vocabulaire figé (ia/ai/ml) : Head of AI, VP AI, MLOps et
        # FDE (Forward Deployed Engineer) n'y tombaient pas — miroir TS.
        "key": "ia",
        "aliases": {"ia", "ai", "ml", "machinelearning", "genai", "mlops", "fde", "forwarddeployedengineer"},
        "titles": {
            "c_level": ["Chief AI Officer"],
            "n1": ["Directeur Data & IA", "Head of AI", "VP AI"],
            "n2": ["Lead ML", "Responsable IA", "MLOps Engineer", "Forward Deployed Engineer"],
        },
    },
    {
        "key": "infra",
        "aliases": {"infra", "infrastructure", "cloud", "ops", "reseau", "sre", "network"},
        "titles": {
            "c_level": ["CTO Infrastructure"],
            "n1": ["Directeur Infrastructure", "Directeur Cloud", "Head of Cloud"],
            "n2": ["Responsable Infrastructure", "SRE Lead", "DevOps Manager"],
        },
    },
    {
        "key": "dev",
        "aliases": {"dev", "developpement", "development", "engineering", "software", "etudes"},
        "titles": {
            "c_level": ["CTO"],
            "n1": ["VP Engineering", "Directeur Technique"],
            "n2": ["Engineering Manager", "Tech Lead"],
        },
    },
    {
        "key": "finance",
        "aliases": {"finance", "financier", "daf", "comptabilite", "gestion"},
        "titles": {
            "c_level": ["DAF", "CFO"],
            "n1": ["Directeur Financier", "Directeur du Contrôle de gestion"],
            "n2": ["Responsable financier", "Contrôleur de gestion"],
        },
    },
    {
        "key": "achat",
        "aliases": {"achat", "achats", "procurement", "purchasing", "sourcing", "vendor"},
        "titles": {
            "c_level": ["Directeur Achats Groupe"],
            "n1": ["Directeur des Achats IT", "Vendor Manager"],
            "n2": ["Acheteur IT", "Category Manager IT"],
        },
    },
    {
        "key": "pmo",
        "aliases": {"pmo", "projet", "project", "delivery", "programme"},
        "titles": {
            "c_level": ["Directeur de programme"],
            "n1": ["Head of PMO", "Directeur de projets"],
            "n2": ["Chef de projet", "PMO"],
        },
    },
    {
        "key": "clevel",
        "aliases": {"clevel", "clevels", "direction", "directiongenerale", "comex", "codir", "executive", "csuite"},
        "titles": {
            "c_level": ["Directeur Général", "PDG"],
            "n1": ["Directeur Général Adjoint"],
            "n2": ["Directeur de cabinet"],
        },
    },
    {
        "key": "rh",
        "aliases": {"rh", "hr", "ressourceshumaines", "talent", "recrutement", "recruitment"},
        "titles": {
            "c_level": ["DRH"],
            "n1": ["Directeur des Ressources Humaines"],
            "n2": ["Responsable recrutement tech"],
        },
    },
]

_BAND_ORDER = ("c_level", "n1", "n2")


def role_families() -> list[str]:
    """Les familles de rôles terrain, NOMMÉES (#2314.5).

    ``_FAMILY_PRESETS`` n'était qu'une table de résolution interne à
    ``resolve_segment_scope`` — jamais un vocabulaire qu'un appelant pouvait
    lister. Réutilisé par le playbook d'ouverture compte froid (#2314.1,
    ``cold_account_playbook.py``) pour nommer les équipes qu'on peut cibler."""
    return [f["key"] for f in _FAMILY_PRESETS]


def _key(raw: object) -> str:
    """Clé de comparaison : déaccentué, minuscule, sans séparateur — mêmes règles
    que le ``norm`` de la matrice de couverture côté API (« C-Level » == « clevel »)."""
    text = unicodedata.normalize("NFKD", str(raw or ""))
    stripped = "".join(c for c in text if not unicodedata.combining(c))
    return "".join(c for c in stripped.lower() if c.isalnum())


def _find_family(family: str) -> dict[str, Any] | None:
    key = _key(family)
    if not key:
        return None
    for preset in _FAMILY_PRESETS:
        if key == preset["key"] or key in preset["aliases"]:
            return preset
    return None


# Séparateurs des libellés COMPOSÉS. Les zones blanches de l'organigramme ne
# portent pas les clés de la matrice : elles portent ce que le classifieur a
# écrit (« Cloud / Infrastructure / HPC », « Data / IA / Cloud »).
_TOKEN_SEPARATORS = str.maketrans({c: " " for c in "/,;&+|·-–—()[]"})


def _find_families(family: str) -> list[dict[str, Any]]:
    """Les familles nommées par un libellé, dans SON ordre.

    Le libellé ENTIER d'abord — c'est le comportement historique et il doit
    rester intact (« Ressources humaines » → ``rh``). À défaut seulement, chacun
    de ses mots : sans ce repli, « Cloud / Infrastructure / HPC » ne matchait
    rien et partait tel quel en ``person_titles`` Apollo — une chaîne que
    personne ne porte comme titre, donc une recherche ciblée qui ne ramenait
    rien. Aucun mot reconnu ⇒ liste vide ⇒ l'appelant garde le mot-clé brut.
    """
    whole = _find_family(family)
    if whole:
        return [whole]
    found: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for token in family.translate(_TOKEN_SEPARATORS).split():
        preset = _find_family(token)
        if preset and preset["key"] not in seen_keys:
            seen_keys.add(preset["key"])
            found.append(preset)
    return found


def _level_key(level: str) -> str:
    """Normalise un niveau vers les clés du produit. ``L2``/``l2`` → ``l2``,
    ``C-Level``/``c_suite`` → ``c_level``. Inconnu → ``""`` (ignoré)."""
    key = _key(level)
    if key in {"clevel", "csuite", "clevels"}:
        return "c_level"
    if key in _LEVEL_TITLE_BAND:  # l0…l5, n1, n2 (« N-1 » se normalise en « n1 »)
        return key
    return ""


def resolve_segment_scope(family: str | None, level: str | None) -> dict[str, Any]:
    """(famille, niveau) → ``{"titles": [...], "seniorities": [...]}``.

    Quatre cas, tous déterministes :

    * famille + niveau → les titres RÉELS de cette case de la matrice. Aucune
      séniorité : Apollo ANDe titres et bandes, les combiner viderait le résultat
      alors que le titre porte déjà le niveau.
    * famille seule → tous les titres de la famille, du C-Level au N-2.
    * niveau seul → la bande de séniorités Apollo correspondante (recherche large
      sur toute la strate, sans filtre de titre).
    * libellé composé (« Cloud / Infrastructure / HPC ») → l'union des familles
      qu'il NOMME, dans son ordre. C'est la forme réelle des zones blanches de
      l'organigramme, que le seul match plein-libellé ne voyait pas.
    * famille inconnue → le libellé brut en mot-clé de titre (comme un thème
      inconnu) : on cherche quand même, on n'élargit jamais en silence.

    Rien de demandé ⇒ listes vides ⇒ l'appelant garde son comportement d'avant.
    """
    scope: dict[str, Any] = {"titles": [], "seniorities": []}
    fam_raw = (family or "").strip()
    lvl = _level_key(level or "")
    presets = _find_families(fam_raw) if fam_raw else []

    if presets:
        band = _LEVEL_TITLE_BAND.get(lvl) if lvl else None
        bands = (band,) if band else _BAND_ORDER
        # Un libellé qui nomme plusieurs métiers les cherche TOUS : Apollo ORe les
        # titres, n'en garder qu'un perdrait les autres sans rien gagner.
        seen: set[str] = set()
        for preset in presets:
            for b in bands:
                for title in preset["titles"][b]:
                    if title not in seen:
                        seen.add(title)
                        scope["titles"].append(title)
        return scope

    if fam_raw:
        # Famille non reconnue : mot-clé brut. Le niveau ne peut pas se traduire en
        # titres (on n'a pas les titres de cette famille) — il reste implicite.
        scope["titles"] = [fam_raw]
        return scope

    if lvl:
        scope["seniorities"] = list(_LEVEL_SENIORITIES[lvl])

    return scope
