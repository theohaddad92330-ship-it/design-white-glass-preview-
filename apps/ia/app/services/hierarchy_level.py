"""Deterministic title → hierarchy level (the deck's org tiers, L0-L4).

The mapping doc ranks each contact on the ladder — Gouvernance/Board · C-Level/COMEX ·
Direction · Management · Expert/Senior · Opérationnel — a different axis from the
decision role (economic/technical/…) and from ``influenceLevel``. Like ``decision_role``
it is a pure function of the job title, computed, never asked to the LLM, so it
is always present and stable. Heuristic by nature: ordering is most-senior-first
and the first matching tier wins (a "Senior Manager" reads as management, not
expert).

``governance`` (L0) is the annexe organigramme's structural fix (p2/p7): a board /
administrateur / conseil sits ABOVE the executive committee but is a distant sponsor,
rarely the door — it must NOT be conflated with the C-level executives (L1) who run
the company. Kept a NARROW signal so an executive "Président du Directoire" / "PDG" /
bare "Président" stays c_level and an IT "Administrateur systèmes" stays operational.
"""

from __future__ import annotations

import re
import unicodedata

from app.services.protected_criteria import names_a_protected_criterion

# 6 tiers, most senior first (L0 governance … L4 operationnel). Keys are emitted values.
# 7 tiers, most senior first. ``achats`` (L5 dans le contrat) est l'axe PARALLÈLE
# achats/contrôle de la p7 : un "Directeur des Achats" n'est pas sur la ligne
# managériale, il tient la fonction achats. Rangé après c_level (un CISO reste
# exécutif) mais AVANT direction (sinon "Directeur des Achats" lirait "direction").
#
# ``unknown`` est en FIN de tuple et n'est PAS un palier : c'est l'absence de
# palier. Un contact sans titre exploitable retombait sur ``operationnel``,
# c'est-à-dire une valeur AFFIRMÉE à la place d'une absence — exactement ce que
# « non mesuré n'est pas mesuré à zéro » interdit, et la valeur existait déjà
# côté contrat TypeScript (``contactDecisionLevelSchema``) sans jamais être
# produite ici. La distinction porte : « opérationnel » est un rang, sur lequel
# on décide de ne pas écrire en premier ; « inconnu » est une question ouverte,
# sur laquelle on va chercher le titre.
HIERARCHY_LEVELS = (
    "governance",
    "c_level",
    "achats",
    "direction",
    "management",
    "expert",
    "operationnel",
    "unknown",
)

# Un titre EXPLOITABLE porte au moins une lettre. « — », « ? », « n/a » ou une
# suite de ponctuation ne se classent pas : ils ne disent rien.
_HAS_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)

# L0 Gouvernance — board / administrateur / conseil. Checked BEFORE c_level so a
# "Président du conseil d'administration" reads as governance, not an executive.
# Deliberately narrow (see module docstring): an executive president / PDG / member
# of the *executive* board stays c_level; an IT "Administrateur systèmes" stays ops.
_GOVERNANCE_RE = re.compile(
    "|".join(
        (
            r"conseil\s+d['’]?\s*administration",
            r"conseil\s+de\s+surveillance",
            r"pr[ée]sident[e]?\s+du\s+conseil",
            r"\bboard\s+member\b",
            r"member\s+of\s+the\s+board\b",
            r"\bboard\s+of\s+directors\b",
            r"non[-\s]?ex[ée]cutive?\s+director",
            r"\bchair(man|woman)\b",
            r"\bcenseur\b",
            # "Administrateur/trice" as a corporate mandate — NOT the IT sysadmin
            # compounds (Administrateur système / réseau / sécurité / BdD / cloud…).
            r"\badministrat(?:eur|rice)\b(?!\s*(?:syst|r[ée]seau|infra|s[ée]cur|base|donn[ée]es|bdd|cloud|windows|linux|unix|office|salesforce|sap|azure|m365|\bAD\b|\bit\b))",
        )
    ),
    re.IGNORECASE,
)

# C-Level / COMEX / CODIR — top executives who sit on the executive committee.
_C_LEVEL_RE = re.compile(
    "|".join(
        (
            r"\bC[EFTIOMD]O\b",  # CEO/CFO/CTO/CIO/COO/CMO/CDO
            r"\bCISO\b",
            r"chief\s+[\w\sà-ÿ'’.&-]*officer",
            r"\bP-?DG\b",
            r"\bDGA?\b",
            r"directeur\s+g[ée]n[ée]ral",
            r"directrice\s+g[ée]n[ée]rale",
            r"pr[ée]sident",
            r"managing\s+director",
            r"\bVP\b",
            r"vice[-\s]?pr[ée]sident",
            r"member?\s+of\s+the\s+(executive|management)\s+board",
            r"com(ex|it[ée]\s+ex[ée]cutif|it[ée]\s+de\s+direction)",
            # NB: bare "partner" is intentionally excluded — "HR Business Partner"
            # would false-positive; "Directeur Associé" (FR managing partner) is
            # already caught by the directeur rule + this associé.
            r"directeur\s+associ[ée]",
            r"directrice\s+associ[ée]",
        )
    ),
    re.IGNORECASE,
)

# Achats / contrôle — la fonction achats/procurement/vendor et le contrôle de
# gestion / juridique achats (L5, axe parallèle p7). Vérifié AVANT direction pour
# qu'un "Directeur des Achats" y atterrisse plutôt qu'en direction. La sécurité
# n'y est PAS : un CISO/RSSI est déjà capté en c_level/direction (exécutif).
_ACHATS_RE = re.compile(
    "|".join(
        (
            r"\bachats?\b",
            r"\bprocurement\b",
            r"\bpurchasing\b",
            r"vendor\s+manage",
            r"\bsourcing\b",
            r"contr[ôo]le\s+de\s+gestion",
        )
    ),
    re.IGNORECASE,
)

# Direction — directors / heads of a function (report to the COMEX).
_DIRECTION_RE = re.compile(
    "|".join(
        (
            r"direct(?:eur|rice)\b",
            r"\bdirector\b",
            r"head\s+of\b",
            r"\bDSI\b",
            r"\bRSSI\b",
            r"\bDAF\b",
            r"\bDRH\b",
        )
    ),
    re.IGNORECASE,
)

# Management — managers / team leads / heads of a squad.
_MANAGEMENT_RE = re.compile(
    "|".join(
        (
            r"\bmanager\b",
            r"responsable\b",
            r"chef\s+de\b",
            r"team\s+lead",
            r"\blead\b",
            r"\bprincipal\b",
            r"superviseur",
        )
    ),
    re.IGNORECASE,
)

# Expert / Senior — individual contributors with seniority.
_EXPERT_RE = re.compile(
    "|".join(
        (
            r"\bsenior\b",
            r"\bexpert",
            r"architecte",
            r"\barchitect\b",
            r"\bstaff\b",
            r"r[ée]f[ée]rent",
            r"\bsr\.?\b",
        )
    ),
    re.IGNORECASE,
)


def classify_hierarchy_level(title: str | None) -> str:
    """Return one of ``HIERARCHY_LEVELS``.

    Order is most-senior-first: Governance wins over C-Level (a "Président du conseil"
    is a board seat, not the operating chief), C-Level over Direction (a "Directeur
    Général" is C-level), Direction over Management, etc.

    ⚠️ Deux absences à ne pas confondre.

    - **Aucun titre exploitable** (vide, ou sans une seule lettre) → ``unknown``.
      On ne SAIT pas où cette personne se situe, et l'écrire ``operationnel``
      affirmait un rang que rien n'établit.
    - **Un titre présent qu'aucune règle ne reconnaît** → ``operationnel``. Ce
      n'est pas une absence : « Développeur », « Chargé de mission », « Analyste »
      ne déclenchent volontairement aucune règle de séniorité parce que le rang
      opérationnel EST leur rang. Les basculer en ``unknown`` viderait le palier
      le plus peuplé du produit et ferait passer une classification juste pour
      un trou de donnée."""
    t = (title or "").strip()
    if not t or not _HAS_LETTER_RE.search(t):
        return "unknown"
    if _GOVERNANCE_RE.search(t):
        return "governance"
    if _C_LEVEL_RE.search(t):
        return "c_level"
    if _ACHATS_RE.search(t):
        return "achats"
    if _DIRECTION_RE.search(t):
        return "direction"
    if _MANAGEMENT_RE.search(t):
        return "management"
    if _EXPERT_RE.search(t):
        return "expert"
    return "operationnel"


# ── #4750 — les intitulés de postes que le commercial tape lui-même ──────────

#: Groupes de VARIANTES connues d'un même poste (FR/EN, abréviation). Un intitulé saisi qui tombe dans un
#: groupe est élargi à tout le groupe : l'utilisateur ne les énumère pas. Écrit en clair, pas en regex —
#: la liste se relit et se complète à la main.
_TITLE_VARIANT_GROUPS: tuple[tuple[str, ...], ...] = (
    ("Product Owner", "PO", "Product Manager", "Chef de produit", "Responsable produit", "Chef de produit digital"),
    ("Scrum Master", "Agile Coach", "Coach agile"),
    ("Chef de projet", "Project Manager", "Responsable de projet", "Directeur de projet"),
    ("Chef de projet IT", "Chef de projet informatique", "IT Project Manager"),
    ("Tech Lead", "Lead Developer", "Lead développeur", "Responsable technique"),
    ("Data Engineer", "Ingénieur data", "Ingénieur données"),
    ("Data Scientist", "Ingénieur machine learning", "ML Engineer"),
    ("DSI", "Directeur des systèmes d'information", "CIO", "Responsable informatique"),
    ("CTO", "Directeur technique", "VP Engineering"),
    ("RSSI", "Responsable sécurité des systèmes d'information", "CISO"),
    ("Responsable des achats", "Acheteur", "Directeur des achats", "Head of Procurement"),
    ("UX Designer", "Product Designer", "UI Designer", "Designer produit"),
)



def _fold_title(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower().replace("’", "'")
    return " ".join(re.sub(r"[^a-z0-9']+", " ", text).split())


def expand_job_titles(titles: list[str]) -> list[str]:
    """Les intitulés saisis tels quels (en premier), puis leurs variantes connues, sans doublon.

    « Tout s'élargit, Laura AGIT » : l'élargissement se fait sans demander. Un intitulé hors groupe reste
    seul. Une saisie vide ou portant un critère protégé est écartée.
    """
    out: list[str] = []
    seen: set[str] = set()

    def _add(title: str) -> None:
        key = _fold_title(title)
        if key and key not in seen:
            seen.add(key)
            out.append(title.strip())

    cleaned = [t for t in titles if t and t.strip() and not names_a_protected_criterion(_fold_title(t))]
    for title in cleaned:
        _add(title)
    for title in cleaned:
        key = _fold_title(title)
        for group in _TITLE_VARIANT_GROUPS:
            if any(_fold_title(member) == key for member in group):
                for member in group:
                    _add(member)
    return out


def title_matches_wanted(title: str | None, wanted: list[str]) -> bool:
    """Un intitulé d'offre ou de contact recouvre-t-il l'un des intitulés cherchés, variantes comprises ?

    Mots entiers, jamais une sous-chaîne (« PO » ne rencontre pas « portefeuille »). Sans intitulé : non.
    """
    folded = f" {_fold_title(title or '')} "
    if not folded.strip():
        return False
    return any(f" {_fold_title(variant)} " in folded for variant in expand_job_titles(wanted))


# #4733 — le recrutement d'un dirigeant (COO, CFO et fonctions de même rang) est un signal fort.
# Reconnu à l'INTITULÉ de l'offre seulement : un intitulé muet ne devine rien. Les « assistant de »,
# « adjoint », « stagiaire » ou « responsable paie » ne sont pas la fonction de direction elle-même.
_EXECUTIVE_ROLE_RE = re.compile(
    "|".join(
        (
            r"\bCOO\b",
            r"\bCFO\b",
            r"\bDAF\b",
            r"chief\s+(operating|financial)\s+officer",
            r"direct(?:eur|rice)\s+(des\s+op[ée]rations|financi(?:er|[èe]re)|administratif(?:ve)?\s+et\s+financi(?:er|[èe]re))",
            r"direct(?:eur|rice)\s+(g[ée]n[ée]ral(?:e)?\s+adjoint(?:e)?\s+)?(des\s+)?op[ée]rations",
            r"head\s+of\s+(operations|finance)",
        )
    ),
    re.IGNORECASE,
)
_EXECUTIVE_ROLE_EXCLUDED_RE = re.compile(
    r"assistant|adjoint(?!\s+(?:des\s+op|financ))|stagiaire|alternan|apprenti|comptable|paie|contr[ôo]leur"
    # « CFO » = courants faibles chez un électricien : un technicien n'est pas un dirigeant.
    r"|technicien|[ée]lectricien|courants?\s+faibles?",
    re.IGNORECASE,
)


def is_executive_recruitment_title(title: str | None) -> bool:
    """``True`` quand l'intitulé d'une offre vise un COO / CFO / DAF ou une fonction de même rang."""
    t = (title or "").strip()
    if not t or _EXECUTIVE_ROLE_EXCLUDED_RE.search(t):
        return False
    return bool(_EXECUTIVE_ROLE_RE.search(t))
