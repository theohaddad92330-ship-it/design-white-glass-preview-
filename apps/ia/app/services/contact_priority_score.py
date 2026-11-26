"""Deterministic Contact Priority Score /100 (03_BUSINESS_RULES §3).

The canonical answer to Théo's P1 ask — « un score de contact qui explique
POURQUOI ». Like the /25 account score (``account_score.py``) and the /20
perimeter score (``perimeter_score.py``), the barème is a RULE, not the model's
mood: the LLM supplies the qualitative inputs (role, title, angle match), this
module turns them into points **deterministically**, one criterion at a time,
each capped at its max AND tied to a proof (a real signal — role / perimeter /
title / source / angle) so the number can be justified line by line.

Canonical grid (03_BUSINESS_RULES §3 — Contact Priority Score, 100 points):

    | Critère                       | Points |
    |-------------------------------|--------|
    | Poids dans la décision        | 0-30   |
    | Proximité du périmètre        | 0-20   |
    | Niveau hiérarchique           | 0-15   |
    | Rôle face à ton offre       | 0-25   |
    | Fraîcheur du poste            | 0-10   |

    Lot 758 (31/10/2026) — « Accessibilité / source » (0-15) est sorti du score : la
    joignabilité est une pastille (:func:`contact_reachability`), l'offre passe de 10 à 25.

A criterion that can't be evaluated is marked ``evaluated: False`` and is excluded
from BOTH the numerator and the denominator — never an invented bonus, and never a
penalty either (``JAMAIS de donnée inventée``). Proximité + fit angle are the two
criteria that need ACCOUNT context (perimeter tier / recommended angles); without
it they used to score a "neutral middle" (10/20 + 5/10), which both invented a
value and cost a contact up to 15 points because information was MISSING. The total
is now read over the criteria we could actually evaluate. An absence that is a FACT
about the row (no reachable channel, undetermined role) still scores 0 and stays
evaluated — that is a real collected negative, not a knowledge gap.

``profileData`` makes the grid profile-aware (§9): a seller whose expertise is
cyber values a RSSI (technical) more than a generic ESN. Empty / no seller → the
profile-agnostic grid, so no score shifts unless a profile is actually supplied.

TypeScript mirror (the live display path): ``packages/contracts/src/schemas/
classified-data.ts::computeContactScoreBreakdown`` — same weights, same proofs.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.services.hierarchy_level import classify_hierarchy_level

# (key, FR label, max) — lot 758 (CONTACTS 4/6), arbitrage Louis 31/10/2026 : le score est
# un score de PERTINENCE — rôle face à l'offre de l'ESN, poids dans la décision, fraîcheur du
# poste —, axes nommés dessous. La CONTACTABILITÉ (e-mail, téléphone, profil, relation du
# compte) en SORT et devient une pastille (:func:`contact_reachability`) : avec elle, tout
# contact d'annuaire vérifié démarrait à 25/25 sur accès + fraîcheur et les scores
# s'entassaient entre 80 et 85 (appels Simon, Maeva, Janvier). Les 15 points libérés vont à
# l'offre (10 → 25). Jumeau exact de ``CONTACT_SCORE_CRITERIA`` (TS), qui garde la clé
# ``accessibility`` NOMMÉE dans la taxonomie (GA-08) et la déclare pastille.
CONTACT_SCORE_CRITERIA: tuple[tuple[str, str, int], ...] = (
    ("role", "Poids dans la décision", 30),
    ("proximity", "Proximité du périmètre", 20),
    ("seniority", "Niveau hiérarchique", 15),
    ("accessibility", "Joignable", 15),
    ("angle_fit", "Rôle face à ton offre", 25),
    ("freshness", "Fraîcheur du poste", 10),
)
#: Lot 758 — les critères qui se lisent en PASTILLE, jamais en points du score.
CONTACT_SCORE_PASTILLE_CRITERIA: frozenset[str] = frozenset({"accessibility"})
_SCORED_CRITERIA: tuple[tuple[str, str, int], ...] = tuple(
    c for c in CONTACT_SCORE_CRITERIA if c[0] not in CONTACT_SCORE_PASTILLE_CRITERIA
)
CONTACT_SCORE_MAX = sum(m for _, _, m in _SCORED_CRITERIA)  # 100
_CRITERION_MAX = {k: m for k, _, m in CONTACT_SCORE_CRITERIA}
_CRITERION_LABEL = {k: label for k, label, _ in CONTACT_SCORE_CRITERIA}

# Rôle décisionnel /30 — the buying power the deck MEDDIC role carries. Economic /
# sponsor own the budget/decision (cap); technical (DSI/CTO/RSSI) is the ESN's
# prime target; champion relays; user/influencer matter less; procurement is the
# achats gate; blocker least. An unlisted / unclassified role → 0.
_ROLE_POWER: dict[str, int] = {
    "economic": 30,
    "sponsor": 30,
    "technical": 28,
    "champion": 24,
    "user": 16,
    "influencer": 14,
    "procurement": 12,
    "purchasing": 12,
    "blocker": 8,
}
# Niveau hiérarchique /15 — the deck org tier (mirror of ``_TIER_SENIORITY`` TS).
# ``governance`` (L0 board) is top-tier like c_level: the seniority axis stays HONEST
# (a board seat IS high in the org). A board member is de-prioritised through its ROLE
# (governance → not economic → 0 role points), never by faking its rank low — keeping
# the org-structure axis and the buying-strategy axis cleanly separate (annexe p5).
_TIER_SENIORITY: dict[str, int] = {
    "governance": 15,
    "c_level": 15,
    "direction": 12,
    "achats": 8,  # fonction achats (L5) — séniorité comparable au management
    "management": 8,
    "expert": 5,
    "operationnel": 2,
}
# Fraîcheur/activité /10 — provenance freshness of the row.
_SOURCE_FRESHNESS: dict[str, int] = {
    "apollo": 10,
    "manual": 8,
    "pappers": 7,
    "brave_search": 5,
    "ia_reconstruction": 3,
}

_ROLE_LABEL: dict[str, str] = {
    "economic": "décideur économique",
    "sponsor": "sponsor",
    "technical": "décideur technique",
    "champion": "champion probable",
    "user": "utilisateur",
    "influencer": "prescripteur",
    "procurement": "achats / procurement",
    "purchasing": "achats / procurement",
    "blocker": "gatekeeper",
}
_HIER_LABEL: dict[str, str] = {
    "governance": "Gouvernance / Board",
    "c_level": "C-level / COMEX",
    "direction": "Direction",
    "management": "Management",
    "expert": "Expert / Senior",
    "operationnel": "Opérationnel",
    # Jamais rendu comme un palier : l'axe est déclaré NON ÉVALUÉ avant d'en
    # arriver là. Le libellé existe pour qu'un appelant qui contournerait
    # ``_seniority_points`` n'affiche pas la clé machine « unknown » à l'écran.
    "unknown": "Séniorité inconnue",
}
_SOURCE_LABEL: dict[str, str] = {
    "apollo": "Apollo (annuaire vérifié)",
    "manual": "saisie manuelle",
    "pappers": "registre public Pappers",
    "brave_search": "recherche web",
    "ia_reconstruction": "reconstruction IA",
}

# A seller-profile match lifts the role toward its /30 cap (Drive §9).
_ROLE_PRIORITY_BOOST = 6

# /100 bands — same split spirit as the /25 + /20 scores. haute ≥70, moyenne 45-69,
# faible <45. Keeps a contact's colour/bucket consistent with its explained score.
_HAUTE_MIN = 70
_MOYENNE_MIN = 45

# Generic theme words that don't discriminate a persona (mirror of the TS
# ``_ANGLE_STOPWORDS``) — dropped so only distinctive terms drive the angle match.
_ANGLE_STOPWORDS = frozenset(
    {
        "plateforme", "strategie", "compte", "groupe", "projet", "offre",
        "solution", "gestion", "systeme", "transformation", "digital",
        "digitale", "numerique", "metiers", "metier", "usine", "cross",
    }
)

# Theme→role table used ONLY to derive a seller's priority roles from its own
# declared expertise (never invented per contact). A cyber/data/cloud ESN
# prioritises the technical decider; a finance-led offer, the economic buyer.
_THEME_ROLE_HINTS: tuple[tuple[str, str], ...] = (
    ("cyber", "technical"),
    ("secur", "technical"),
    ("rssi", "technical"),
    ("data", "technical"),
    ("cloud", "technical"),
    ("infra", "technical"),
    ("devops", "technical"),
    ("reseau", "technical"),
    ("finance", "economic"),
    ("budget", "economic"),
    ("achat", "procurement"),
)


def _theme_tokens(text: str) -> set[str]:
    """Distinctive tokens of a free-text theme/title — mirror of the TS
    ``_angleTokens``: deaccent, split on non-alphanumerics, keep words ≥4 chars
    (non-stopword) OR short all-caps acronyms (SOC, SAP, RSSI)."""
    out: set[str] = set()
    deaccented = "".join(
        c for c in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(c)
    )
    for raw in re.split(r"[^a-zA-Z0-9]+", deaccented):
        if not raw:
            continue
        norm = raw.lower()
        if (len(norm) >= 4 and norm not in _ANGLE_STOPWORDS) or re.fullmatch(r"[A-Z0-9]{2,5}", raw):
            out.add(norm)
    return out


@dataclass(frozen=True)
class SellerContext:
    """Profile-derived scoring context (Drive §9). Empty → profile-agnostic grid."""

    priority_roles: frozenset[str] = frozenset()
    focus_themes: frozenset[str] = frozenset()
    #: État de relation AU NIVEAU DU COMPTE (SalesContext p6). p26 pèse
    #: « Accessibilité / relation » comme un facteur ÉLEVÉ : le même contact est
    #: matériellement plus atteignable chez un client actif que chez un inconnu.
    #: Vide/absent ⇒ grille historique, au point près.
    relationship_state: str = ""

    @property
    def is_empty(self) -> bool:
        return not self.priority_roles and not self.focus_themes and not self.relationship_state


def seller_context_from_profile(profile: Mapping[str, Any] | None) -> SellerContext:
    """Derive a :class:`SellerContext` from the ESN profile (Drive §9).

    ``focus_themes`` = distinctive tokens of the seller's declared expertise
    (``expertise_areas`` / ``focus_areas`` / ``sectors_priority``). ``priority_roles``
    = the decision roles those themes point to (``_THEME_ROLE_HINTS``). Purely
    derived from what the seller declared — never invented. A missing / empty
    profile → an empty context (neutral scoring)."""
    if not isinstance(profile, Mapping):
        return SellerContext()
    raw_bits: list[str] = []
    # Lot 758 — ``offers`` (l'offre DÉCLARÉE de l'ESN) nourrit « rôle face à votre offre »,
    # comme côté API (`contact-score-seller.ts`).
    for key in (
        "expertise_areas", "expertiseAreas", "focus_areas", "focusAreas",
        "sectors_priority", "sectorsPriority", "offers",
    ):
        val = profile.get(key)
        if isinstance(val, str):
            raw_bits.append(val)
        elif isinstance(val, (list, tuple)):
            raw_bits.extend(str(v) for v in val)
    # Nested analysis_parameters.focus_areas (ProfileContext shape).
    params = profile.get("analysis_parameters") or profile.get("analysisParameters")
    if isinstance(params, Mapping):
        fa = params.get("focus_areas") or params.get("focusAreas")
        if isinstance(fa, (list, tuple)):
            raw_bits.extend(str(v) for v in fa)
    themes: set[str] = set()
    for bit in raw_bits:
        themes |= _theme_tokens(bit)
    roles: set[str] = set()
    for token in themes:
        for needle, role in _THEME_ROLE_HINTS:
            if needle in token:
                roles.add(role)
    return SellerContext(priority_roles=frozenset(roles), focus_themes=frozenset(themes))


def _get(contact: Mapping[str, Any], *keys: str) -> Any:
    """First non-None value among ``keys`` (camelCase wire OR snake_case)."""
    for k in keys:
        v = contact.get(k)
        if v is not None:
            return v
    return None


def _role_points(contact: Mapping[str, Any], seller: SellerContext) -> tuple[int, str]:
    role = str(_get(contact, "role", "decisionRole", "decision_role") or "").strip().lower()
    base = _ROLE_POWER.get(role, 0)
    prioritised = base > 0 and role in seller.priority_roles
    points = min(30, base + _ROLE_PRIORITY_BOOST) if prioritised else base
    label = _ROLE_LABEL.get(role)
    if not label:
        return points, (f"rôle « {role} » non pondéré" if role else "rôle non déterminé")
    return points, (f"{label} · priorisé par votre profil" if points > base else label)


def _proximity_points(contact: Mapping[str, Any]) -> tuple[int, str, bool]:
    tier = str(_get(contact, "perimeterTier", "perimeter_tier") or "").strip().upper()
    if tier == "P1":
        return 20, "périmètre prioritaire (P1)", True
    if tier == "P2":
        return 14, "périmètre P2", True
    if tier == "SECONDAIRE":
        return 8, "périmètre secondaire", True
    rel = str(_get(contact, "entityRelevance", "entity_relevance") or "").strip().lower()
    if rel in ("out_of_sector", "noise"):
        return 0, "entité hors périmètre", True
    if rel == "operating":
        return 10, "entité opérante", True
    # No cartography for this contact's entity → nothing to evaluate.
    return 0, "périmètre non rattaché", False


def _seniority_points(contact: Mapping[str, Any]) -> tuple[int, str]:
    """Séniorité /15 — le palier org, tiré du titre.

    ⚠️ Sans titre exploitable, l'axe reste ÉVALUÉ et vaut 0, il ne sort PAS du
    dénominateur. C'est la distinction que le module tient partout ailleurs : une
    absence qui est un FAIT SUR LA LIGNE (aucun canal joignable, rôle indéterminé)
    est un zéro collecté ; une absence qui est un TROU DE CONNAISSANCE SUR LE
    COMPTE (pas de cartographie, pas d'angle) sort du calcul. « On n'a pas relevé
    le poste de cette personne » appartient à la première famille.

    Mesuré avant de trancher : en sortant l'axe du dénominateur, un contact SANS
    titre marquait 45 là où le même contact intitulé « Analyste » marquait 39 —
    ne pas connaître le métier de quelqu'un le faisait remonter dans la liste. Le
    dénominateur rétrécit plus vite que le numérateur, et le ratio grimpe.

    Ce qui change quand même, et c'est l'objet du correctif : le palier rendu vaut
    ``unknown`` et non ``operationnel``. Le score est le même ; la PREUVE affichée
    cesse d'affirmer un rang que personne n'a établi."""
    tier = classify_hierarchy_level(str(_get(contact, "title") or ""))
    if tier == "unknown":
        return 0, "titre inconnu — séniorité non établie"
    return _TIER_SENIORITY.get(tier, 2), _HIER_LABEL.get(tier, tier)


# Bonus d'accessibilité apporté par l'ÉTAT DE RELATION du compte (p6/p26). Une
# porte déjà ouverte est une accessibilité réelle, pas une supposition : chez un
# client actif on décroche son téléphone, chez un référé on cite le référent.
# `froid` ne donne rien — c'est la baseline historique.
_RELATION_ACCESS_BONUS: dict[str, tuple[int, str]] = {
    "client_actif": (4, "compte client — porte déjà ouverte"),
    "besoin_ouvert": (4, "besoin ouvert en cours sur le compte"),
    "refere": (3, "compte référé — introduction mobilisable"),
    "ancien_client": (3, "ancien client — relation à réactiver"),
    "rang2": (2, "présence en rang 2 sur le compte"),
    "linkedin": (2, "connexion LinkedIn acceptée sur le compte"),
    "connu": (1, "compte déjà connu"),
    "dormant": (1, "relation en sommeil, historique existant"),
    # #2371.4 — placements en cours avec cette ESN partenaire : porte ouverte.
    "partenaire_actif": (3, "partenaire actif — placements en cours"),
}


_REACHABILITY_PROOF: dict[str, str] = {
    "verified_email": "email vérifié",
    "email": "email disponible",
    "phone": "téléphone disponible",
    # La preuve est AFFICHÉE : elle nomme la capacité, pas l'éditeur (GA-44).
    "professional_profile": "profil sur un réseau professionnel",
}


def contact_reachability(contact: Mapping[str, Any], seller: SellerContext | None = None) -> dict[str, str] | None:
    """Lot 758 — la PASTILLE de joignabilité, jumeau de ``computeContactReachability`` (TS).

    Le meilleur canal connu (``verified_email`` > ``email`` > ``phone`` >
    ``professional_profile``) et sa preuve, enrichie de l'état de relation du compte
    (p6/p26 : une porte déjà ouverte est une accessibilité réelle). ``None`` quand aucun
    canal n'est connu — on n'affiche pas ce qu'on n'a pas. Ne pèse JAMAIS dans le score."""

    def has(key: str, *alts: str) -> bool:
        value = _get(contact, key, *alts)
        return isinstance(value, str) and bool(value.strip())

    if has("email") and _get(contact, "emailVerified", "email_verified"):
        kind = "verified_email"
    elif has("email"):
        kind = "email"
    elif has("phone"):
        kind = "phone"
    elif has("linkedinUrl", "linkedin_url"):
        kind = "professional_profile"
    else:
        return None
    proof = _REACHABILITY_PROOF[kind]
    _, why = _RELATION_ACCESS_BONUS.get((seller or SellerContext()).relationship_state, (0, ""))
    if why:
        proof = f"{proof} · {why}"
    return {"kind": kind, "proof": proof}


# Lot 758 — familles de métier ÉQUIVALENTES pour « rôle face à votre offre » (jumeau de
# ``_OFFER_TOKEN_FAMILIES``, `classified-data.ts`) : un RSSI ne partage aucun mot avec
# « cybersécurité ». Bornées et nommées : aucun rapprochement deviné au-delà.
_OFFER_TOKEN_FAMILIES: tuple[frozenset[str], ...] = (
    frozenset({"cyber", "cybersecurite", "securite", "rssi", "ciso", "soc"}),
    frozenset({"data", "donnees", "cdo", "bi"}),
    frozenset({"ia", "ai", "ml", "mlops"}),
)


def _expand_offer_tokens(tokens: set[str] | frozenset[str]) -> set[str]:
    out = set(tokens)
    for family in _OFFER_TOKEN_FAMILIES:
        if family & out:
            out |= family
    return out


def _angle_fit_points(contact: Mapping[str, Any], seller: SellerContext) -> tuple[int, str, bool]:
    """Rôle face à ton offre /25 (lot 758). Offre de l'ESN CONNUE + titre connu = un fait
    mesuré dans les deux sens : un titre qui ne la touche pas vaut 0, nommé « hors de votre
    offre », au lieu de sortir du dénominateur — sinon un chef de l'architecture lu sur trois
    axes pleins passait devant un Head of Data lu sur quatre pour une ESN data (Julien)."""
    angle_match = _get(contact, "angleMatch", "angle_match")
    if angle_match is True:
        return 25, "colle à l'angle recommandé", True
    if angle_match is not False and seller.focus_themes:
        title = str(_get(contact, "title") or "")
        if _expand_offer_tokens(_theme_tokens(title)) & _expand_offer_tokens(seller.focus_themes):
            return 25, "aligné à ton offre", True
        if not title.strip():
            return 0, "titre inconnu — rôle face à l'offre non établi", True
        return 0, "hors de ton offre", True
    if angle_match is False:
        return 0, "hors des angles recommandés", True
    # No recommended angle to match against → nothing to evaluate.
    return 0, "angle non évalué", False


def _freshness_points(contact: Mapping[str, Any]) -> tuple[int, str]:
    if _get(contact, "employerMismatch", "employer_mismatch"):
        return 1, "employeur obsolète (a quitté la cible)"
    src = str(_get(contact, "source") or "").strip().lower()
    return _SOURCE_FRESHNESS.get(src, 5), _SOURCE_LABEL.get(src, "source non précisée")


def contact_priority_breakdown(
    contact: Mapping[str, Any], seller: SellerContext | None = None
) -> list[dict[str, Any]]:
    """Explainable /100 breakdown: one entry per §3 criterion with its points,
    its cap and a proof tying the points to a real signal. Deterministic + pure."""
    s = seller or SellerContext()
    raw: dict[str, tuple[int, str] | tuple[int, str, bool]] = {
        "role": _role_points(contact, s),
        "proximity": _proximity_points(contact),
        "seniority": _seniority_points(contact),
        "angle_fit": _angle_fit_points(contact, s),
        "freshness": _freshness_points(contact),
    }
    out: list[dict[str, Any]] = []
    for key, label, cap in _SCORED_CRITERIA:
        entry = raw[key]
        points, proof = entry[0], entry[1]
        evaluated = entry[2] if len(entry) > 2 else True
        out.append(
            {
                "criterion": key,
                "label": label,
                "points": max(0, min(cap, points)),
                "max": cap,
                "proof": proof,
                "evaluated": evaluated,
            }
        )
    return out


# Fournisseurs qui constituent une preuve d'existence à eux seuls (annuaire
# vérifié, registre public, saisie humaine). Une recherche web ou une
# reconstruction IA n'en est pas une : elle propose un nom, elle ne le prouve pas.
_SELF_PROVING_SOURCES = frozenset({"apollo", "manual", "pappers"})


def has_weak_proof(contact: Mapping[str, Any]) -> bool:
    """La personne est-elle SANS preuve vérifiable ? (p26, facteur « Preuve /
    confiance : bloquant si faible »).

    Une preuve est soit un fournisseur qui atteste (annuaire, registre, saisie
    humaine), soit un identifiant que le commercial peut ouvrir lui-même (URL
    LinkedIn, e-mail). Sans aucun des deux, on tient un NOM, pas une personne —
    et un nom ne se rappelle pas au téléphone."""
    if str(_get(contact, "source") or "").strip().lower() in _SELF_PROVING_SOURCES:
        return False
    if _get(contact, "linkedinUrl", "linkedin_url"):
        return False
    if _get(contact, "email"):
        return False
    return True


def contact_priority_score(contact: Mapping[str, Any], seller: SellerContext | None = None) -> int:
    """Total /100 — Σ(points of the EVALUATED criteria) read over Σ(their caps).

    With full coverage the denominator is 100, so the score is literally Σ(points)
    and the number can never drift from its justification. With partial coverage it
    answers "of what we could measure, how good is this contact" instead of docking
    points for an account-level information gap.

    PLANCHER DE PREUVE (p26) — le tableau des facteurs donne à « Preuve /
    confiance » un poids qui n'est pas un nombre de points mais « BLOQUANT si
    faible ». C'est le seul de la grille dans ce cas, et pour une raison
    opérationnelle : un contact sans preuve peut être excellent sur les six autres
    facteurs (rôle parfait, périmètre pile dessus) et n'exister nulle part. Il
    sort donc de la bande « prioritaire maintenant » quel que soit son total,
    sans être supprimé — il redevient « à vérifier », ce que la p26 nomme
    explicitement en sortie. Le plancher ne peut que BAISSER."""
    breakdown = contact_priority_breakdown(contact, seller)
    evaluated = [item for item in breakdown if item["evaluated"]]
    denominator = sum(item["max"] for item in evaluated)
    if denominator == 0:
        return 0
    points = sum(item["points"] for item in evaluated)
    score = max(0, min(CONTACT_SCORE_MAX, round(points * 100 / denominator)))
    if has_weak_proof(contact):
        return min(score, _HAUTE_MIN - 1)
    return score


def contact_priority_coverage(
    breakdown: list[dict[str, Any]], contact: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """Denominator the /100 was read over + the criteria we had no context for.

    ``contact`` (optionnel) permet de DÉCLARER le plancher de preuve p26 quand il
    s'applique : sans lui, le score ne serait plus la somme de sa justification et
    l'écart serait invisible — exactement le défaut qu'on reproche au « joli
    chiffre Claude »."""
    evaluated = [item for item in breakdown if item["evaluated"]]
    out: dict[str, Any] = {
        "evaluatedMax": sum(item["max"] for item in evaluated),
        "points": sum(item["points"] for item in evaluated),
        "unevaluated": [item["criterion"] for item in breakdown if not item["evaluated"]],
    }
    if contact is not None and has_weak_proof(contact):
        out["proofFloor"] = _HAUTE_MIN - 1
        out["proofFloorReason"] = (
            "preuve insuffisante (ni annuaire vérifié, ni LinkedIn, ni e-mail) — "
            "p26 : « preuve / confiance : bloquant si faible »"
        )
    return out


def priority_band(score: int) -> str:
    """haute (≥70) / moyenne (45-69) / faible (<45) — the /100 band."""
    if score >= _HAUTE_MIN:
        return "haute"
    if score >= _MOYENNE_MIN:
        return "moyenne"
    return "faible"


# Split points that project the /100 onto the 1-5 tri bucket. Band-faithful to the
# /100 bands: haute (≥70) → 1-2, moyenne (45-69) → 3, faible (<45) → 4-5.
_RANK_1_MIN = 85  # top of haute
_RANK_2_MIN = _HAUTE_MIN  # 70 — rest of haute
_RANK_3_MIN = _MOYENNE_MIN  # 45 — moyenne
_RANK_4_MIN = 30  # upper faible (below → 5)


def priority_rank_from_score(score: int) -> int:
    """Project the canonical /100 onto the 1-5 ``priority`` bucket the live tri
    consumes (``EnrichedContact.priority``; ``phase4_plan`` sorts 1 = top decider … 5).

    So the RANKING is driven by the explained score, not the model's mood — the same
    rule the /25 account verdict already follows (``account_score.verdict_for_score``).
    Band-faithful to the /100 bands: haute ≥70 → 1-2, moyenne 45-69 → 3, faible <45 → 4-5.
    """
    s = max(0, min(CONTACT_SCORE_MAX, int(score)))
    if s >= _RANK_1_MIN:
        return 1
    if s >= _RANK_2_MIN:
        return 2
    if s >= _RANK_3_MIN:
        return 3
    if s >= _RANK_4_MIN:
        return 4
    return 5


def deterministic_priority(contact: Mapping[str, Any], seller: SellerContext | None = None) -> int:
    """The 1-5 tri priority derived DETERMINISTICALLY from the canonical /100
    (with the seller boost applied) — reconciles ``EnrichedContact.priority`` with the
    explained score instead of leaving it to the LLM's mood. Pure; degrades gracefully
    when perimeter / angle context is absent (the /100 reads over the criteria it can
    evaluate, see :func:`contact_priority_score`)."""
    return priority_rank_from_score(contact_priority_score(contact, seller))
