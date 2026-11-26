"""Deterministic buying-committee typing — Knowledge Pack v2 taxonomy.

Sourced from ``agent_docs/knowledge-pack-v2.md`` (the in-repo, versioned extract
of Théo's Drive pack): the canonical 8-role decision taxonomy + the Power/Interest
(Pouvoir/Intérêt) zone matrix. This module turns each contact of a dossier into a
member of the account's **comité d'achat** — its committee role plus a position on
the Power/Interest matrix — so the plan can target the right member (champions à
cultiver, décideurs à convaincre, relais terrain qui remontent la douleur…).

Design rules (from the pack + CLAUDE.md):

* **Sourced, not invented.** Roles come from the pack's canonical set; the
  Power/Interest coordinates and the 4-zone matrix come from the pack's
  "Accessibility / influence → zone matrix" section. Nothing here is guessed.
* **Deterministic.** A pure function of the job title (+ optional seniority /
  function), never asked to the LLM — always present, stable across runs, testable.
* **Never fabricate a role.** A title from which no role is deducible yields
  ``to_qualify`` (the pack's ``TO_VERIFY`` bucket), never an invented role.
* **Additive.** Reuses the existing deterministic classifiers
  (``decision_role`` / ``hierarchy_level``) — it does NOT change the per-contact
  ``role`` field, the buckets, or the ranking. The committee is a separate lens.

The canonical → committee-role map (pack §"Decision-role taxonomy"):

    ECONOMIC_BUYER  → economic_buyer   (budget : DSI/CTO/CDO/Dir. BU/Dir. financier…)
    TECHNICAL_BUYER → technical_buyer  (décision IT : DSI/CTO/RSSI/Head of Eng…)
    USER_BUYER      → user_buyer       (utilisateur : PO/PM/Tech Lead/dev/métier…)
    CHAMPION        → champion          (allié qui décide ET veut avancer)
    PROCUREMENT     → procurement       (acheteur / gate achats)
    INFLUENCER      → influencer        (prescripteur : architecte/expert…)
    BLOCKER         → blocker           (bloqueur — indices, pas un titre)
    TO_VERIFY       → to_qualify        (impossible à classer depuis le titre)
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Mapping
from typing import Any

from app.services.decision_role import is_governance, classify_decision_role, is_out_of_scope
from app.services.hierarchy_level import classify_hierarchy_level

# ── Scales ────────────────────────────────────────────────────────────────────
# Power (Pouvoir) and Interest (Intérêt) are integer 0..4 scales. The absolute
# max matters less than the high/low split that places a member on the matrix; a
# member with power/interest ≥ ``_HIGH_THRESHOLD`` sits on the "high" side of that
# axis (pack §"zone matrix").
POWER_MAX = 4
INTEREST_MAX = 4
_HIGH_THRESHOLD = 3

# ── Committee roles (canonical 8 + the to-qualify bucket) ─────────────────────
COMMITTEE_ROLES: tuple[str, ...] = (
    "economic_buyer",
    "technical_buyer",
    "user_buyer",
    "champion",
    "procurement",
    "influencer",
    "blocker",
    "to_qualify",
    # ── Familles ajoutées (#2791, LAU-FINAL-052) ──────────────────────────────
    # Cinq des familles du comité canonique qui ne matchaient AUCUN détecteur
    # existant (git grep vide sur RH/juridique/conformité/partenariat/programme
    # avant ce lot) : ajoutées en toute fin de la chaîne de classification, donc
    # sans changer un seul rôle déjà classé. Les cinq autres familles demandées
    # par l'épopée (owner du problème, finance distincte du décideur budget,
    # sécurité distincte du RSSI, direction de site, manager opérationnel)
    # chevauchent un détecteur EXISTANT et documenté — les y faire entrer est
    # une reclassification, pas un ajout, et reste hors de ce lot (voir le
    # commentaire de l'épopée #2791).
    "hr",
    "legal",
    "compliance",
    "partner",
    "program_management",
    # #3263 (BEL-SC-234, comité d'achat & multithreading) — sponsor métier :
    # backs the initiative politically/organizationally without holding the
    # budget (RULE: « ne pas confondre sponsor et décideur »). Distinct from
    # `economic_buyer`/`champion`. Last-resort detector — see
    # `classify_committee_role` step 7 — so no existing title is reclassified.
    "sponsor",
)

# The roles a healthy conquest committee needs covered (pack §"role coverage" /
# 03_BUSINESS_RULES §4). A gap here surfaces in ``missingRoles`` so the plan can
# recommend prospecting the missing seat.
CORE_COMMITTEE_ROLES: tuple[str, ...] = (
    "economic_buyer",
    "technical_buyer",
    "user_buyer",
    "champion",
    "procurement",
)

# #3263 (BEL-SC-234) — the seats tracked by the MULTITHREADING lens
# (`evaluate_multithreading`): the five core seats + sponsor. Deliberately NOT
# folded into ``CORE_COMMITTEE_ROLES`` — doing so would surface a new
# "missing seat" on every account that has none of the golden/demo fixtures
# updated for it (same reasoning that kept hr/legal/compliance/partner/
# program_management out of the core set in #2791).
MULTITHREADING_ROLES: tuple[str, ...] = CORE_COMMITTEE_ROLES + ("sponsor",)

# Human-readable FR label per role (dossier / prompt rendering).
ROLE_LABELS: dict[str, str] = {
    "economic_buyer": "Décideur budget",
    # ⚠️ « Décideur technique » et non « Décideur IT » (25/08). Le libellé part
    # dans le prompt du plan : chez une société qui vend de l'ingénierie
    # industrielle, un Responsable Méthodes s'y présentait « Décideur IT », ce qui
    # ramenait tout le raisonnement à un prisme informatique juste après qu'on ait
    # pris la peine de l'en sortir. Le mot neutre est VRAI des deux côtés — pour
    # une ESN informatique, le décideur technique EST la DSI, et son titre le dit.
    "technical_buyer": "Décideur technique",
    "user_buyer": "Utilisateur",
    "champion": "Champion",
    "procurement": "Acheteur",
    "influencer": "Prescripteur",
    "blocker": "Bloqueur",
    "to_qualify": "À qualifier",
    "hr": "RH",
    "legal": "Juridique",
    "compliance": "Conformité",
    "partner": "Partenaire",
    "program_management": "Direction de programme",
    "sponsor": "Sponsor métier",
}

# #2791 — recette écran 27/09 (ROCHE, pharma) : « comité d'achat » ne nommait
# que les 8 catégories génériques, jamais un rôle propre au SECTEUR — même
# sans contact qui le remplit encore. Distinct de `COMMITTEE_ROLES` : ceci ne
# classe personne (aucun titre, aucun contact) — ça nomme les sièges qu'un
# secteur CONNU impose de couvrir, sourcés du MÊME vocabulaire sectoriel que
# les motifs Automobile/Pharma déjà livrés dans `decision_role.py`
# (#2311.21/.22) plutôt qu'une seconde liste inventée. Un secteur non couvert
# ici rend une liste VIDE (jamais un nom deviné) — seuls Automobile et Pharma
# sont couverts, les mêmes deux que la recette a nommés.
SECTOR_COMMITTEE_SEATS: dict[str, tuple[str, ...]] = {
    "pharma": (
        "Affaires réglementaires",
        "Assurance qualité (QA)",
        "Pharmacovigilance",
    ),
    "automobile": (
        "Sécurité fonctionnelle / produit",
        "Direction de programme",
    ),
    # #2311.18 (lot V15 28/09) — même trou que pharma/automobile avant le lot
    # N8 : le pack Cyber classe déjà un titre existant (RSSI/CISO →
    # `technical_buyer` dans `decision_role.py` ; IAM/SOC → opérationnel,
    # GRC → conformité, tous deux dans ce fichier), mais ne nommait aucun
    # siège tant qu'aucun contact ne portait ce titre. Libellés repris tels
    # quels du vocabulaire déjà livré — aucune seconde liste inventée.
    "cyber": (
        "RSSI / Responsable sécurité",
        "Responsable IAM",
        "Responsable SOC",
        "GRC / Conformité SI",
    ),
    # #2311.20 — même correctif pour Environnement : HSE/EHS classent déjà un
    # contact existant (`decision_role.py`, pack industriel), ce siège n'était
    # simplement jamais NOMMÉ sans lui.
    "environnement": ("HSE / Sécurité industrielle",),
}

# Mot-clé (sous-chaîne, insensible à la casse/aux accents) → clé de
# `SECTOR_COMMITTEE_SEATS`. `account.sector` est un texte libre (DataForge/
# Pappers, ex. "Industrie pharmaceutique") — un mot-clé large plutôt qu'une
# égalité stricte, jamais un secteur entier deviné depuis autre chose.
_SECTOR_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("pharma", "pharma"),
    ("automob", "automobile"),
    ("cyber", "cyber"),
    ("environnement", "environnement"),
)


# ── Angle des MESSAGES, par rôle de comité (BEL-SC-235, #3264.22/.24/.27) ─────
# `bellum_messages.persona_lever_block` couvre déjà le levier de RÉDACTION par
# PALIER HIÉRARCHIQUE (decideur/gouvernance/direction/manager/acheteur/expert/
# operationnel). Trois des sept rôles du ticket n'ont AUCUN palier — champion
# et partenaire sont des positions RELATIONNELLES (pas un niveau dans
# l'organigramme), et « sponsor » (impact et coût du statu quo) est la lecture
# MESSAGE du même rôle canonique que `economic_buyer` porte déjà pour le plan
# (« Décideur budget ») — un rôle réutilisé, jamais un second inventé à côté.
# Les quatre autres rôles du ticket (utilisateur/technique/décideur/achats)
# restent couverts par le levier hiérarchique existant — ajouter ici les
# ferait juger sur DEUX classifications concurrentes du même contact.
MESSAGE_ANGLES: dict[str, str] = {
    "champion": "apprentissage et capacité d'action — ce qu'il peut apprendre et faire avancer en interne.",
    "economic_buyer": "impact et coût du statu quo — ce que ne pas agir coûte, en euros ou en risque.",
    "partner": "valeur mutuelle et règles — ce que l'échange apporte aux DEUX parties, et à quelles conditions.",
}


def committee_message_angle(committee_role: str) -> str | None:
    """L'angle de MESSAGE pour un rôle de comité, ou ``None`` s'il n'en a pas.

    ``None`` pour les quatre rôles déjà couverts par le levier hiérarchique
    (voir le commentaire de {@link MESSAGE_ANGLES}) : l'appelant garde alors le
    levier persona existant, sans une seconde consigne qui pourrait le
    contredire."""
    return MESSAGE_ANGLES.get(committee_role)


def sector_committee_seats(sector: str | None) -> tuple[str, ...]:
    """Les sièges du comité propres au secteur du compte — jamais un contact
    deviné, jamais un secteur non couvert nommé. `()` quand le secteur est
    absent ou ne matche aucun pack connu."""
    text = (sector or "").strip().lower()
    if not text:
        return ()
    for needle, key in _SECTOR_KEYWORDS:
        if needle in text:
            return SECTOR_COMMITTEE_SEATS[key]
    return ()


# #2311.24 — le niveau de preuve d'UN siège, jamais un chiffre : deux signaux
# déjà en main (WHO — nom complet ; WHAT — rôle résolu par le titre), croisés
# sans en deviner un troisième.
EVIDENCE_LABELS: dict[str, str] = {
    "named": "Nommé",
    "probable": "Probable",
    "to_research": "À rechercher",
    "unknown": "Inconnu",
}


def _evidence_level(has_name: bool, role_known: bool) -> str:
    if has_name and role_known:
        return "named"
    if has_name:
        return "probable"
    if role_known:
        return "to_research"
    return "unknown"


# ── Power/Interest matrix — the pack's 4 zones ────────────────────────────────
# Q1 Pouvoir↑ Intérêt↑ = CHAMPIONS       (decide AND want it — hebdo)
# Q2 Pouvoir↑ Intérêt↓ = À SATISFAIRE    (décideur/gate à convaincre — mensuel)
# Q3 Pouvoir↓ Intérêt↑ = RELAIS TERRAIN  (remonte la douleur, influence — bi-mensuel)
# Q4 Pouvoir↓ Intérêt↓ = MONITOR         (passif — trimestriel)
# + À QUALIFIER for a member whose role isn't deducible (no fabricated position).
QUADRANT_CHAMPIONS = "CHAMPIONS"
QUADRANT_TO_SATISFY = "À SATISFAIRE"
QUADRANT_FIELD_RELAY = "RELAIS TERRAIN"
QUADRANT_MONITOR = "MONITOR"
QUADRANT_TO_QUALIFY = "À QUALIFIER"

# Engagement playbook per quadrant — cadence + action. Mirrors the same pack lines
# as ``prioritization.ZONE_ENGAGEMENT`` (which applies them at the ENTITY level);
# here they ride on each committee MEMBER so the plan knows how often + how to
# touch each person.
_QUADRANT_PLAYBOOK: dict[str, dict[str, str]] = {
    QUADRANT_CHAMPIONS: {
        "cadence": "hebdomadaire",
        "action": "Allié qui décide ET veut avancer — engager directement, itérer chaque semaine.",
    },
    QUADRANT_TO_SATISFY: {
        "cadence": "mensuelle",
        "action": "Pouvoir fort, intérêt faible — convaincre sur les jalons/la valeur, ne pas sur-solliciter.",
    },
    QUADRANT_FIELD_RELAY: {
        "cadence": "bi-mensuelle",
        "action": "Accessible, intérêt réel — faire remonter les besoins et influencer les décideurs.",
    },
    QUADRANT_MONITOR: {
        "cadence": "trimestrielle",
        "action": "Faible pouvoir + faible intérêt — veille passive, réévaluer sur signal.",
    },
    QUADRANT_TO_QUALIFY: {
        "cadence": "à définir",
        "action": "Rôle non déductible du poste — qualifier avant d'engager.",
    },
}

# ── Role → base (power, interest) ─────────────────────────────────────────────
# Base coordinates BEFORE the seniority/function refinements below. Power = weight
# in the decision; Interest = topical proximity / desire for the solution. A
# decision-maker (economic/technical) has high power but neutral buying interest
# until qualified (they must be CONVINCED — À SATISFAIRE), whereas a champion is
# the one who both weighs in AND wants it (CHAMPIONS).
_ROLE_BASE: dict[str, tuple[int, int]] = {
    "economic_buyer": (4, 2),  # budget authority, outcome-focused → décideur à convaincre
    "technical_buyer": (4, 2),  # IT decision (DSI/CTO) → décideur à convaincre
    "champion": (3, 4),  # décide/pousse en interne ET veut avancer → champion à cultiver
    "procurement": (3, 1),  # achats gate — peut bloquer/valider, indifférent → à satisfaire
    "blocker": (3, 1),  # peut bloquer, intérêt négatif/nul → à neutraliser
    "user_buyer": (2, 4),  # utilisateur/métier — remonte la douleur → relais terrain
    "influencer": (1, 3),  # prescripteur — influence sans pouvoir formel → relais terrain
    "to_qualify": (0, 0),  # inconnu — aucune position fabriquée
    # ── Familles ajoutées (#2791) — gatekeepers secondaires (même logique que
    # « achats/RH sont des gatekeepers secondaires sauf preuve contraire »,
    # commentaire de decision_role.py) : pouvoir modéré, intérêt faible par
    # défaut → À SATISFAIRE une fois la séniorité prise en compte, jamais un
    # champion fabriqué.
    "hr": (2, 1),
    "legal": (2, 1),
    "compliance": (2, 1),
    # Un partenaire est collaboratif — plus proche de la démarche que les trois
    # gatekeepers ci-dessus — mais ne pèse pas sur LA décision d'achat de l'ESN.
    "partner": (2, 3),
    # Direction de programme — gouvernance de la prestation en cours, pouvoir
    # réel sur son périmètre sans être le décideur budget.
    "program_management": (3, 2),
    # #3263 — sponsor métier : pèse (soutien organisationnel/politique réel)
    # mais doit être convaincu/rassuré périodiquement, comme un décideur —
    # jamais un champion qui pousse au quotidien (interest < 3, donc jamais
    # CHAMPIONS ici, contrairement à "champion").
    "sponsor": (3, 2),
}

# ── Committee-specific title detectors (sourced from the pack's title rows) ────
# Achats / procurement FUNCTION → the committee's ACHETEUR seat. Broad on purpose:
# in the buying committee the achats person plays the procurement/gate role
# (pack PROCUREMENT: "IT Procurement, Vendor Manager, Resp. achats prestations,
# Supplier Manager"), whether director or manager. Checked BEFORE the generic
# decision-role classifier so a "Directeur des Achats" reads as acheteur here (the
# committee lens), even though ``decision_role`` routes it to ``economic``.
_PROCUREMENT_COMMITTEE_RE = re.compile(
    "|".join(
        (
            r"\bachats?\b",  # Directeur/Responsable/Chef des Achats
            r"\bacheteur",  # Acheteur / Acheteuse (IT, projets)
            r"\bprocurement\b",
            r"\bsourcing\b",
            r"vendor\s+manager",
            r"supplier\s+manager",
            r"category\s+manager",
            r"\bCPO\b",  # Chief Procurement Officer
        )
    ),
    re.IGNORECASE,
)

# Prescriber (prescripteur) — expert individual contributors who influence the
# choice without formal budget/decision power (pack INFLUENCER: "expert,
# architecte senior, responsable technique, lead domaine"). Deliberately does NOT
# include a bare "lead"/"tech lead" (the pack lists those under USER_BUYER).
_INFLUENCER_RE = re.compile(
    "|".join(
        (
            r"architect",  # Architecte / Architect / Solution Architect
            r"\bexpert",  # Expert / Expertise
            r"r[ée]f[ée]rent",  # Référent technique / fonctionnel
            r"principal\s+engineer",
            r"staff\s+engineer",
            r"responsable\s+techniqu",  # Responsable technique (sans signal IT-décideur)
        )
    ),
    re.IGNORECASE,
)

# Operational IT practitioner / delivery → the committee's UTILISATEUR seat (pack
# USER_BUYER: "Product Owner, Delivery/Project Manager, Tech Lead, Data Lead, Ops
# Manager, Resp. métier" + the ICs who use/work alongside the ESN's consultants).
_OPERATIONAL_USER_RE = re.compile(
    "|".join(
        (
            r"product\s+owner",
            r"\bPO\b",
            r"scrum\s+master",
            r"delivery\s+manager",
            r"project\s+manager",
            r"chef\s+de\s+projet",
            r"tech\s+lead",
            r"lead\s+(dev|data|technique|technical|d[ée]veloppe)",
            r"d[ée]veloppeu",
            r"\bdeveloper",
            r"\bdev\b",
            r"ing[ée]nieur",
            r"\bengineer\b",
            r"\bconsultant",
            r"\banalyste?\b",
            r"\banalyst\b",
            r"technicien",
            r"administrateur",
            r"\bdevops\b",
            r"\bSRE\b",
            r"data\s+(scientist|engineer|analyst)",
            r"ops\s+manager",
            r"responsable\s+(m[ée]tier|exploitation|production|applicati)",
            # #2311.18 — adaptation sectorielle Cyber : IAM (gestion des accès) et
            # SOC (centre opérationnel de sécurité) sont des praticiens OPÉRATIONNELS,
            # jamais un décideur — RSSI/CISO restent à `technical_buyer` (étape 3,
            # avant celle-ci). Un titre déjà classé par « analyste »/« ingénieur »/
            # « engineer » ci-dessus n'atteint jamais ce point : ces deux motifs ne
            # couvrent que l'acronyme SEUL (« Responsable IAM », « Manager SOC »),
            # qui tombait `to_qualify` avant ce lot.
            r"\bIAM\b",
            r"\bSOC\b",
        )
    ),
    re.IGNORECASE,
)

# ── Familles ajoutées (#2791, LAU-FINAL-052) — dernier recours uniquement ────
# Checked AFTER achats/décideur/prescripteur/opérationnel dans
# ``classify_committee_role`` : un titre qui matche déjà un détecteur existant
# n'atteint jamais ces motifs (aucune régression sur un rôle déjà classé).
_HR_RE = re.compile(
    "|".join(
        (
            r"\bDRH\b",
            r"ressources\s+humaines",
            r"human\s+resources",
            r"\bCHRO\b",
            r"\bHRBP\b",
            r"talent\s+acquisition",
        )
    ),
    re.IGNORECASE,
)
_LEGAL_RE = re.compile(
    "|".join(
        (
            r"\bjuridique\b",
            r"\bjuriste\b",
            r"general\s+counsel",
            r"legal\s+counsel",
        )
    ),
    re.IGNORECASE,
)
_COMPLIANCE_RE = re.compile(
    "|".join(
        (
            r"conformit[ée]",
            r"\bcompliance\b",
            r"\bDPO\b",
            r"protection\s+des\s+donn[ée]es",
            r"data\s+protection\s+officer",
            # #2311.18 — GRC (Gouvernance Risque Conformité) EST cette même famille
            # sous un autre nom. Vérifié avant d'écrire : ce motif n'est atteint
            # qu'en DERNIER recours (étape 6), après `_OPERATIONAL_USER_RE` — un
            # titre déjà classé « analyste »/« ingénieur » (« Analyste GRC ») garde
            # son rôle `user_buyer`, jamais reclassé ici.
            r"\bGRC\b",
        )
    ),
    re.IGNORECASE,
)
_PARTNER_RE = re.compile(
    "|".join(
        (
            r"\bpartenariats?\b",
            r"alliance\s+manager",
            r"channel\s+manager",
        )
    ),
    re.IGNORECASE,
)
_PROGRAM_MANAGEMENT_RE = re.compile(
    "|".join(
        (
            r"directeur[\w\sà-ÿ'’.&-]*programmes?\b",
            r"directrice[\w\sà-ÿ'’.&-]*programmes?\b",
            r"program\s+manager",
            r"\bPMO\b",
        )
    ),
    re.IGNORECASE,
)
# #3263 (BEL-SC-234) — sponsor métier. Vérifié avant d'écrire : « sponsor »
# n'apparaît dans AUCUN motif de `decision_role.py` ni de ce fichier — dernier
# recours uniquement (step 7 de `classify_committee_role`, après achats/
# décideur/prescripteur/opérationnel/RH/juridique/conformité/partenariat/
# programme), donc un titre déjà classé garde son rôle (ex. « Directeur
# Général, sponsor du programme » reste `champion`).
_SPONSOR_RE = re.compile(
    "|".join(
        (
            r"\bsponsor\b",
            r"parrain\s+du\s+projet",
        )
    ),
    re.IGNORECASE,
)

# Business families (contact ``family``) that sit close to the IT/tech topic — a
# member from one of these is closer to the pain, so their INTEREST gets a small
# bump (only for the two field roles, so it never flips a decider into CHAMPIONS).
_IT_PROXIMAL_FUNCTION_RE = re.compile(
    r"\b(it|infra|cyber|data|analytics|\bia\b|\bml\b|d[ée]veloppe|architecture|digital|num[ée]rique|tech)",
    re.IGNORECASE,
)

# Seniority (hierarchy level) → power delta. The base already encodes the typical
# power of a role; seniority refines it for roles that span levels (a C-level
# champion outweighs an operational one; a junior user has less pull).
_SENIORITY_POWER_DELTA: dict[str, int] = {
    "c_level": +1,
    "direction": 0,
    "management": 0,
    "expert": -1,
    "operationnel": -1,
}


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


def _quadrant_for(role: str, power: int, interest: int) -> str:
    """Place (power, interest) on the pack's 4-zone Power/Interest matrix. A
    ``to_qualify`` member has no fabricated position → ``À QUALIFIER``."""
    if role == "to_qualify":
        return QUADRANT_TO_QUALIFY
    high_power = power >= _HIGH_THRESHOLD
    high_interest = interest >= _HIGH_THRESHOLD
    if high_power and high_interest:
        return QUADRANT_CHAMPIONS
    if high_power:
        return QUADRANT_TO_SATISFY
    if high_interest:
        return QUADRANT_FIELD_RELAY
    return QUADRANT_MONITOR


def _profile(role: str, seniority: str | None, function: str | None) -> dict[str, Any]:
    """Build the ``{role, power, interest, quadrant}`` profile for a committee role,
    refined by seniority (power) and function (interest for field roles)."""
    power, interest = _ROLE_BASE[role]
    if seniority:
        power = _clamp(power + _SENIORITY_POWER_DELTA.get(seniority, 0), 0, POWER_MAX)
    # A field member (utilisateur/prescripteur) whose function is IT-proximal is
    # closer to the pain → a touch more topical interest. Restricted to those two
    # roles so an IT budget owner never gets nudged into the CHAMPIONS quadrant.
    if role in ("user_buyer", "influencer") and function and _IT_PROXIMAL_FUNCTION_RE.search(function):
        interest = _clamp(interest + 1, 0, INTEREST_MAX)
    return {"role": role, "power": power, "interest": interest, "quadrant": _quadrant_for(role, power, interest)}


def classify_committee_role(
    title: str | None,
    seniority: str | None = None,
    function: str | None = None,
    *,
    industrial: bool = False,
) -> dict[str, Any]:
    """Map a job title to a buying-committee profile — the Knowledge Pack v2 lens.

    Returns ``{"role", "power", "interest", "quadrant"}`` where ``role`` is one of
    :data:`COMMITTEE_ROLES`, ``power``/``interest`` are 0..4 integers and
    ``quadrant`` is the Power/Interest zone. Deterministic and title-first:

    1. intern/apprentice/trainee → ``to_qualify`` (never a decider);
    2. achats/procurement function → ``procurement`` (the committee's acheteur gate);
    3. the canonical ``decision_role`` classifier (technical/economic/user/champion);
    4. prescriber titles (architecte/expert/référent) → ``influencer``;
    5. operational IT/delivery titles (dev/PO/PM/tech lead/consultant…) → ``user_buyer``;
    6. hr/legal/compliance/partner/program_management families (#2791);
    7. sponsor métier (#3263, BEL-SC-234) — backs the initiative, never the budget;
    8. anything else → ``to_qualify`` (never a fabricated role).

    ``seniority`` (a hierarchy level; auto-derived from the title when omitted)
    refines power; ``function`` (the contact's business family) refines interest
    for the field roles. Neither can invent a role — the role is title-derived.
    """
    t = (title or "").strip()
    seniority = seniority or (classify_hierarchy_level(t) if t else None)
    if not t or is_out_of_scope(t):
        return _profile("to_qualify", seniority, function)
    # Gouvernance (membre du conseil d'administration / de surveillance) : un
    # sponsor lointain, jamais un utilisateur opérationnel accessible. Sans ce
    # garde, « Administrateur » (titre d'un membre du board) matchait le
    # détecteur UTILISATEUR — les administrateurs de TF1 sortaient tous en
    # « relais terrain accessible, cadence bi-mensuelle », contredisant le plan
    # qui les écarte (restitution TF1 p23/p34). À qualifier avant d'engager. Un
    # administrateur SYSTÈME (gov=False) n'est PAS concerné : il reste utilisateur.
    if is_governance(t):
        return _profile("to_qualify", seniority, function)
    # 2. Achats / procurement seat — committee lens (before the generic classifier).
    if _PROCUREMENT_COMMITTEE_RE.search(t):
        return _profile("procurement", seniority, function)
    # 3. Canonical decision role (IT decider / budget / business line / top exec).
    # ``industrial`` — la chaîne de décision industrielle (BE, méthodes, qualité,
    # maintenance, automatisme, HSE) existait et était testée depuis le 24/08, mais
    # ce site d'appel ne la passait pas : chez un vendeur industriel, un directeur
    # d'usine ressortait ``user_buyer`` — relais terrain à relancer — au lieu de
    # ``technical_buyer``, c'est-à-dire la personne qui décide. Le défaut ``False``
    # garde le comité byte-identique pour une ESN informatique.
    dr = classify_decision_role(t, industrial=industrial)
    _dr_to_committee = {
        "technical": "technical_buyer",
        "economic": "economic_buyer",
        "procurement": "procurement",
        "user": "user_buyer",
        "champion": "champion",
    }
    if dr in _dr_to_committee:
        return _profile(_dr_to_committee[dr], seniority, function)
    # 4. Prescriber (expert IC that influences without power).
    if _INFLUENCER_RE.search(t):
        return _profile("influencer", seniority, function)
    # 5. Operational practitioner / delivery → utilisateur.
    if _OPERATIONAL_USER_RE.search(t):
        return _profile("user_buyer", seniority, function)
    # 6. Familles ajoutées (#2791) — dernier recours, jamais avant les cinq
    # détecteurs ci-dessus (aucune régression sur un titre déjà classé).
    if _HR_RE.search(t):
        return _profile("hr", seniority, function)
    if _LEGAL_RE.search(t):
        return _profile("legal", seniority, function)
    if _COMPLIANCE_RE.search(t):
        return _profile("compliance", seniority, function)
    if _PARTNER_RE.search(t):
        return _profile("partner", seniority, function)
    if _PROGRAM_MANAGEMENT_RE.search(t):
        return _profile("program_management", seniority, function)
    # 7. Sponsor métier (#3263) — dernier recours, jamais avant les détecteurs
    # ci-dessus (aucune régression sur un titre déjà classé).
    if _SPONSOR_RE.search(t):
        return _profile("sponsor", seniority, function)
    # 8. Not deducible from the title → à qualifier (never fabricate).
    return _profile("to_qualify", seniority, function)


def _has_full_name(name: str) -> bool:
    """Un nom exploitable porte au moins deux mots (prénom + nom). « Jose » ou
    « Jean-Pierre » n'identifient personne dans un annuaire d'entreprise."""
    return len([part for part in name.split() if part]) >= 2


def _member_from_contact(contact: Mapping[str, Any], *, industrial: bool = False) -> dict[str, Any] | None:
    """Turn one classified contact into a committee member, or ``None`` when the
    contact carries neither a name nor a title (nothing to place)."""
    name = str(contact.get("fullName") or contact.get("full_name") or "").strip()
    title = str(contact.get("title") or "").strip()
    if not name and not title:
        return None
    seniority = str(contact.get("hierarchyLevel") or contact.get("hierarchy_level") or "").strip() or None
    function = str(contact.get("family") or "").strip() or None
    prof = classify_committee_role(title, seniority, function, industrial=industrial)
    # Identité incomplète (prénom seul) : on ne peut ni retrouver la personne ni
    # lui écrire, donc pas de rôle engageable. « Jose », Senior Project Manager,
    # siégeait au comité comme relais terrain à relancer toutes les deux
    # semaines. La machine d'états (restitution p22) est claire : l'identité
    # n'est VÉRIFIÉE qu'avec un nom complet. Un siège SANS nom du tout est un
    # rôle à pourvoir, pas une personne : son titre continue de décider.
    if name and not _has_full_name(name):
        prof = _profile("to_qualify", seniority, function)
    # Blocker fallback: a blocker is an INDICE, not a title (pack §"BLOCKER"), so
    # the title-only classifier can't emit it. When the title yields nothing but a
    # prior stage already tagged the contact ``blocker``, honour that existing
    # classification (never invented here) rather than losing the signal.
    if prof["role"] == "to_qualify":
        prior = str(contact.get("role") or "").strip().lower()
        if prior == "blocker":
            prof = _profile("blocker", seniority, function)
    playbook = _QUADRANT_PLAYBOOK[prof["quadrant"]]
    # #2311.24 — sur les DEUX signaux déjà en main, jamais un troisième deviné :
    # `_has_full_name` revérifié ici plutôt que déduit du `to_qualify` posé plus
    # haut, qui confond « nom incomplet » et « titre non classable » alors que
    # ce niveau doit les distinguer.
    has_name = bool(name) and _has_full_name(name)
    role_known = prof["role"] != "to_qualify"
    evidence_level = _evidence_level(has_name, role_known)
    # #3263.20 — reparentage : `contact["source"]` est déjà lu par
    # `org_graph_assembler.py` (`_get(contact, "source")`) sur ce MÊME dict ;
    # jamais une seconde collecte. La taxonomie fermée (apollo/pappers/manual…)
    # voyage telle quelle — c'est au rendu (web) de la redire dans un libellé
    # neutre (`contactSourceLabel`), jamais ici un nom de fournisseur inventé.
    source = str(contact.get("source") or "").strip() or None
    return {
        "fullName": name,
        "title": title,
        "entity": str(contact.get("entity") or "").strip(),
        "committeeRole": prof["role"],
        "roleLabel": ROLE_LABELS[prof["role"]],
        "power": prof["power"],
        "interest": prof["interest"],
        "quadrant": prof["quadrant"],
        "cadence": playbook["cadence"],
        "engagementAction": playbook["action"],
        "evidenceLevel": evidence_level,
        "evidenceLevelLabel": EVIDENCE_LABELS[evidence_level],
        "source": source,
    }


def _committee_summary(role_coverage: Mapping[str, int], missing_roles: list[str], member_count: int) -> str:
    """One-line FR summary of the committee for the dossier header."""
    if member_count == 0:
        return "Aucun contact exploitable — comité d'achat à constituer."
    present = [
        f"{count} {ROLE_LABELS[role].lower()}{'s' if count > 1 else ''}"
        for role, count in ((r, role_coverage.get(r, 0)) for r in CORE_COMMITTEE_ROLES)
        if count
    ]
    head = "Comité d'achat : " + (", ".join(present) if present else "aucun rôle clé identifié")
    if missing_roles:
        gaps = ", ".join(ROLE_LABELS[r].lower() for r in missing_roles)
        return f"{head}. Sièges à couvrir : {gaps}."
    return f"{head}. Tous les rôles clés sont couverts."


def assemble_buying_committee(contacts: object, *, industrial: bool = False) -> dict[str, Any]:
    """Assemble the account's buying committee from the classified contacts.

    Each contact becomes a member typed with its committee role + Power/Interest
    position; members are grouped by matrix quadrant, role coverage is counted and
    the missing core seats are surfaced. Pure + deterministic — a compact structure
    injected into ``raw_analysis`` (via the org graph) and rendered into the plan
    prompt so recommendations target the right member.

    Returns ``{members, byQuadrant, roleCoverage, missingRoles, summary}``.
    """
    items = [c for c in contacts if isinstance(c, Mapping)] if contacts else []
    members: list[dict[str, Any]] = []
    for c in items:
        member = _member_from_contact(c, industrial=industrial)
        if member is not None:
            members.append(member)

    by_quadrant: dict[str, list[str]] = {}
    for m in members:
        by_quadrant.setdefault(m["quadrant"], []).append(m["fullName"] or m["title"])

    role_coverage = dict(Counter(m["committeeRole"] for m in members))
    missing_roles = [r for r in CORE_COMMITTEE_ROLES if role_coverage.get(r, 0) == 0]

    return {
        "members": members,
        "byQuadrant": by_quadrant,
        "roleCoverage": role_coverage,
        "missingRoles": missing_roles,
        "summary": _committee_summary(role_coverage, missing_roles, len(members)),
    }


def evaluate_multithreading(committee: Mapping[str, Any]) -> dict[str, Any]:
    """#3263 (BEL-SC-234) — évalue le multithreading d'un comité déjà assemblé :
    quels fils (:data:`MULTITHREADING_ROLES`) sont couverts par une personne
    NOMMÉE, lesquels manquent, et si le compte dépend d'une seule personne.

    Une ÉVALUATION, pas une seconde classification : relit uniquement
    ``committee["members"]`` (produit par :func:`assemble_buying_committee`) et
    le niveau de preuve déjà posé (#2311.24, ``evidenceLevel``) — un fil n'est
    « couvert » qu'avec un WHO connu (nom complet), jamais un rôle résolu sans
    personne rattachée (un siège « à pourvoir » reste un manque).

    ``overreliance`` nomme la personne quand un seul membre nommé porte tout le
    comité alors que le compte a plusieurs contacts — jamais quand il n'y a
    qu'un contact au total (rien à répartir).

    Returns ``{coveredThreads, missingThreads, overreliance}``.
    """
    members = [m for m in (committee.get("members") or []) if isinstance(m, Mapping)]
    named = [m for m in members if m.get("evidenceLevel") == "named"]

    covered_roles = {m["committeeRole"] for m in named}
    covered_threads = [r for r in MULTITHREADING_ROLES if r in covered_roles]
    missing_threads = [r for r in MULTITHREADING_ROLES if r not in covered_roles]

    overreliance: dict[str, Any] | None = None
    named_people = {m["fullName"] for m in named if m.get("fullName")}
    if len(named_people) == 1 and len(members) > 1:
        solo_name = next(iter(named_people))
        solo_roles = [m["committeeRole"] for m in named if m.get("fullName") == solo_name]
        overreliance = {"fullName": solo_name, "roles": solo_roles}

    return {
        "coveredThreads": covered_threads,
        "missingThreads": missing_threads,
        "overreliance": overreliance,
    }


# ── #3263.27 (épopée #3282) — ORDRE D'APPROCHE ───────────────────────────────
# Séquence les membres NOMMÉS du comité, distinct d'`opening_movement.py` qui
# séquence des NIVEAUX hiérarchiques (pas des personnes) pour la route
# commerciale (#3278). Relit le MÊME comité déjà assemblé et le MÊME ordre de
# quadrant que `committee_prompt_block` (jamais un second calcul, GA-26) — un
# membre NOMMÉ au quadrant CHAMPIONS (ou prioritaire selon l'objectif) se
# présente avant un DÉCIDEUR À CONVAINCRE, qui se présente avant un RELAIS
# TERRAIN, qui se présente avant un MONITOR. À égalité de quadrant, le pouvoir
# le plus fort départage. Un siège « à pourvoir » (jamais nommé) ne se séquence
# pas : il se COUVRE (#3263.42), il ne s'approche pas.
def approach_order(committee: Mapping[str, Any], objective: str | None = None) -> list[dict[str, Any]]:
    """#3263.27 — l'ordre dans lequel approcher les membres NOMMÉS du comité.

    Chaque entrée nomme la personne, son rôle de comité et le quadrant qui
    justifie sa place. Vide quand aucun membre n'est nommé (jamais une
    séquence inventée sur des sièges à pourvoir).
    """
    members = [m for m in (committee.get("members") or []) if isinstance(m, Mapping)]
    named = [m for m in members if m.get("evidenceLevel") == "named"]
    order = _quadrant_order_for(objective)
    rank_of_quadrant = {quadrant: i for i, quadrant in enumerate(order)}
    ranked = sorted(
        named,
        key=lambda m: (rank_of_quadrant.get(m.get("quadrant"), len(order)), -int(m.get("power") or 0)),
    )
    return [
        {"fullName": m["fullName"], "committeeRole": m.get("committeeRole"), "quadrant": m.get("quadrant")}
        for m in ranked
    ]


# Label + order the quadrants appear in the prompt block (priority of engagement).
_QUADRANT_LABELS: dict[str, str] = {
    QUADRANT_CHAMPIONS: "CHAMPIONS (à cultiver, hebdo)",
    QUADRANT_TO_SATISFY: "DÉCIDEURS À CONVAINCRE (à satisfaire, mensuel)",
    QUADRANT_FIELD_RELAY: "RELAIS TERRAIN (remontent la douleur, bi-mensuel)",
    QUADRANT_MONITOR: "MONITOR (veille, trimestriel)",
}
_DEFAULT_QUADRANT_ORDER: tuple[str, ...] = (
    QUADRANT_CHAMPIONS,
    QUADRANT_TO_SATISFY,
    QUADRANT_FIELD_RELAY,
    QUADRANT_MONITOR,
)

# #2311.23 — le comité change selon l'OBJECTIF commercial actif du tour
# (comprendre/ouvrir/vendre — le même vocabulaire que
# `orgRecommendedStepSchema.objective`, packages/contracts, jamais un concept
# inventé pour ce lot). ORDRE seulement (doctrine c76, `CLAUDE.md` :
# « le rôle change l'ORDRE, jamais le CONTENU ») : aucun membre n'entre ou ne
# sort selon l'objectif, seule la PRIORITÉ de lecture des quadrants change.
# « vendre » mène par les décideurs à convaincre (closing) ; « comprendre »
# par le relais terrain (contexte/douleur, avant tout décideur) ; « ouvrir »
# et tout objectif absent/non reconnu gardent l'ordre HISTORIQUE
# (byte-identique — aucun appelant existant, `phase4_plan.py`, n'en fournit).
_OBJECTIVE_QUADRANT_ORDER: dict[str, tuple[str, ...]] = {
    "comprendre": (QUADRANT_FIELD_RELAY, QUADRANT_CHAMPIONS, QUADRANT_TO_SATISFY, QUADRANT_MONITOR),
    "vendre": (QUADRANT_TO_SATISFY, QUADRANT_CHAMPIONS, QUADRANT_FIELD_RELAY, QUADRANT_MONITOR),
}


def _quadrant_order_for(objective: str | None) -> tuple[str, ...]:
    return _OBJECTIVE_QUADRANT_ORDER.get((objective or "").strip().lower(), _DEFAULT_QUADRANT_ORDER)


def committee_prompt_block(committee: Mapping[str, Any], objective: str | None = None) -> str:
    """Render a compact, prompt-injectable FR block of the buying committee for the
    plan (so each action/message targets the right member). Empty string when there
    is no exploitable member — never a fabricated committee.

    ``objective`` — #2311.23 — reorders which quadrant leads (never adds/removes
    a member): ``None``/``"ouvrir"``/unrecognized keep the historical order.
    """
    members = [m for m in (committee.get("members") or []) if isinstance(m, Mapping)]
    if not members:
        return ""
    lines = ["## COMITÉ D'ACHAT (matrice Pouvoir/Intérêt — cible chaque membre selon son quadrant)"]
    for quadrant in _quadrant_order_for(objective):
        label = _QUADRANT_LABELS[quadrant]
        picked = [m for m in members if m.get("quadrant") == quadrant]
        if not picked:
            continue
        who = ", ".join(
            f"{m.get('fullName') or m.get('title')} ({m.get('roleLabel')}"
            + (f" — {m.get('title')}" if m.get("fullName") and m.get("title") else "")
            + ")"
            for m in picked[:6]
        )
        lines.append(f"- {label} : {who}")
    missing = [r for r in (committee.get("missingRoles") or []) if r in ROLE_LABELS]
    if missing:
        lines.append("- Sièges à couvrir (prospecter) : " + ", ".join(ROLE_LABELS[r].lower() for r in missing))
    lines.append(
        "→ Adresse chaque action/message au bon membre : décideurs pour le budget/la validation, "
        "champions pour pousser en interne, relais terrain pour faire remonter la douleur."
    )
    return "\n".join(lines)
