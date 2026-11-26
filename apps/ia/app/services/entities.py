"""Entity relevance — deterministic noise filter for the subsidiary dump.

The Pappers corporate graph returns *every* legally-linked entity — for a group
like Société Générale that's ~100 nodes, most of them SCI (sociétés civiles
immobilières), holdings and internal GIE that a salesperson can't sell IT
services to. The deck calls this "le compte à filtrer" — strip the legal noise
before the cartography so only operating entities surface.

Computed, never asked to the LLM (same philosophy as B3/B4). Graph nodes carry
only ``name`` + ``siren`` (no NAF), so classification is name-based — which is
exactly what the noise is: SCI / IMMOBILIER / HOLDING / GIE vehicles whose
legal name gives them away. ``subsidiaries`` is preserved intact (the entities
are legally real, and B3 cites their SIREN); we add a filtered *view* and an
honest count of what was dropped and why.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence

from app.config.knowledge_config import get_config

from .it_entity import is_it_entity
from .text_norm import normalize_name

# Ordered noise rules. Each: (key, compiled regex on the legal name, reason).
# Matched case-insensitively on the raw name.
_NOISE_RULES: list[tuple[str, re.Pattern[str], str]] = [
    ("sci", re.compile(r"\bS\.?\s?C\.?\s?I\b", re.IGNORECASE), "SCI (société civile immobilière)"),
    ("societe_civile", re.compile(r"\bSOCI[EÉ]T[EÉ]\s+CIVILE\b", re.IGNORECASE), "société civile"),
    ("real_estate", re.compile(r"\b(IMMOBILI\w*|FONCI[EÈ]RE?|SCPI|PATRIMOINE)\b", re.IGNORECASE), "immobilier"),
    ("holding", re.compile(r"\b(HOLDINGS?|PARTICIPATIONS?|G[EÉ]RANCE)\b", re.IGNORECASE), "holding / participations"),
    # Investment / asset-management vehicles — non-sellable, distinct legal names
    # (kept conservative + name-only: finance NAF 64.xx stays operating by design).
    ("invest_vehicle", re.compile(r"\b(SOPARFI|ASSET\s+MANAGEMENT|SOCI[EÉ]T[EÉ]\s+DE\s+GESTION|SICAV|FCP|FCPR)\b", re.IGNORECASE), "véhicule d'investissement"),
    ("gie", re.compile(r"\bGIE\b", re.IGNORECASE), "GIE (groupement interne)"),
]

# ── SPV / financing-securitisation vehicles (Théo : sortir les SPV du scope) ───
# Special-purpose vehicles a group spins up to issue debt / securitise receivables
# ("2009 KOALA FINANCE", FCT compartments, EMTN / medium-term-note issuers). They
# carry a SIREN so they pollute the ~98-node corporate graph, but an ESN can NEVER
# sell IT services to them. Conservative, distinctive patterns ONLY — must not
# catch an operating finance arm: "Société Générale SFH" (covered-bond issuer) and
# "…SECURITIES SERVICES" stay operating by design (existing tests lock this).
_SPV_RE = re.compile(
    r"^\s*(?:19|20)\d{2}\b.*\b(?:FINANCE|FINANCEMENT|FUNDING|CAPITAL|NOTES?)\b"  # "2009 KOALA FINANCE"
    r"|\bFC[TC]\b"  # FCT / FCC — fonds commun de titrisation / de créances
    r"|TITRISATION|SECURITI[SZ]ATION"
    r"|\bCOMPARTIMENT\b"
    r"|\bEMTN\b|MEDIUM[-\s]TERM\s+NOTES?"
    r"|\bMSN\b"  # medium-term-note issuer codes (Théo : « MSN numbers »)
    r"|\bSPV\b|SPECIAL\s+PURPOSE",
    re.IGNORECASE,
)

# ── Cédée / divested — sold off, out of the group's perimeter whatever the sector.
_DIVESTED_RE = re.compile(
    r"\bc[ée]d[ée]e?\b|\bcession\b|\bvendue?\b|\banciennement\b|\bancienne?\s+filiale\b"
    r"|\bex[-\s]filiale\b|\bd[ée]sinvesti",
    re.IGNORECASE,
)

# ── Out-of-sector config ──────────────────────────────────────────────────────
# An entity whose real business is BTP / agriculture / agro is not, on its own, a
# target for an IT-services ESN — it must be kept & labelled, but never get a full
# commercial play (Matteo's "SGTM / les moulins du Togo" pépin). BUT this is only
# noise when it's OFF the target group's own core business: for a bank (SG) a BTP
# sub like SGTM is off-core → out_of_sector; for a construction group (VINCI) its
# BTP arm (VINCI Construction) IS the core business → operating. So the gate is
# TARGET-AWARE: ``derive_in_scope_families`` spares the families the target group
# itself belongs to. The IT signal (is_it_entity / IT NAF) overrides — but only
# for an IT-services ESN (Drive #9 p4: the override is gated on ``it_esn``).
# Finance vehicles (NAF 64.xx) are deliberately LEFT operating — whether a bank
# subsidiary is in-scope depends on the ESN, a Théo decision.
#
# Each family: (key, registry NAF division prefixes, name/text regex, reason).
# NAF prefixes: 41/42/43 = construction ; 10/11 = alim & boissons ; 01-03 = agri.
_OUT_OF_SECTOR_FAMILIES: list[tuple[str, tuple[str, ...], re.Pattern[str], str]] = [
    (
        "btp",
        ("41", "42", "43"),
        re.compile(r"\b(TRAVAUX|B[ÂA]TIMENT|BTP|CONSTRUCTION|G[EÉ]NIE\s+CIVIL)\b", re.IGNORECASE),
        "BTP / travaux",
    ),
    (
        "agro",
        ("10", "11"),
        re.compile(r"\b(MOULINS?|MINOTERIE|SEMOULERIE)\b", re.IGNORECASE),
        "agroalimentaire / meunerie",
    ),
    (
        "agri",
        ("01", "02", "03"),
        re.compile(r"\b(AGRICOLE|EXPLOITATION\s+AGRICOLE|[ÉE]LEVAGE)\b", re.IGNORECASE),
        "agriculture",
    ),
]
_IT_NAF_PREFIXES: tuple[str, ...] = ("62", "6311")

_MIN_NAME_LEN = 2

# ── Geographic gate ───────────────────────────────────────────────────────────
# Théo restitution (p.6): "Le user profile France doit filtrer ou pénaliser
# l'international sauf override explicite." A foreign — chiefly African / Maghreb —
# subsidiary of a French group (Société Générale Côte d'Ivoire, SGTM au Maroc) is
# off-perimeter for a France-scoped ESN: keep & label it, but never a play. Matched
# on the ACCENT-STRIPPED lowercased name (see ``_norm``). Country/region markers
# ONLY — never the bare word "international", which a French entity may carry.
_FOREIGN_RE = re.compile(
    r"\b("
    r"maroc|marocaine?|algerie|algerienne?|tunisie|tunisienne?|"
    r"senegal|senegalaise?|ivoire|ivoirienne?|cameroun|camerounaise?|"
    r"gabon|gabonaise?|congo|congolaise?|mali|malienne?|burkina|benin|togo|togolaise?|"
    r"guinee|guineenne?|madagascar|malgache|mauritanie|niger|nigerienne?|tchad|"
    r"afrique|africaine?|african|africa|west africa"
    r")\b"
)

# When the ESN profile declares a scope beyond France, foreign entities are NOT
# auto-excluded ("sauf override explicite"). Neighbours like Belgique/Suisse are
# left in-scope by default (too likely served by a French ESN) — the gate targets
# the clear far-scope case Théo flagged (Afrique / Maghreb).
_INTERNATIONAL_MARKERS = re.compile(
    r"\b(international|internationale?|monde|mondial|global|worldwide|emea|europe|"
    r"europeenne?|afrique|maghreb|multi ?pays)\b"
)


def derive_allow_international(geo_zone: object) -> bool:
    """True when the ESN's declared geography goes beyond France, so foreign
    entities keep their normal relevance instead of the geographic exclusion.
    Empty / "France entière" → False (filter international). Théo: override explicite."""
    return bool(_INTERNATIONAL_MARKERS.search(normalize_name(geo_zone)))


# Relevance values (subsidiaries schema enum + entitiesExhaustive annotation).
RELEVANCE_OPERATING = "operating"
RELEVANCE_NOISE = "noise"
RELEVANCE_OUT_OF_SECTOR = "out_of_sector"

# ── Entity qualification type (Théo restitution p.6) ──────────────────────────
# "Chaque entité doit porter un type : BU, marque, filiale stratégique, SPV,
# cédée, homonyme, bruit. Par défaut, affiche uniquement les entités actionnables
# […] mets SPV/holdings/homonymes/cédées dans un onglet secondaire." The relevance
# gate above answers "sellable or not"; the *type* is the human-readable badge the
# cartography shows. Values mirror the contracts ``entityTypeSchema`` so web/api
# don't drift (the first ones are actionable, the last four are the secondary tab).
ENTITY_TYPE_OPERATIONAL = "operational"  # generic in-scope operating entity (BU/filiale)
ENTITY_TYPE_STRATEGIC = "filiale_strategique"  # IT/digital arm — the prime ESN target
ENTITY_TYPE_SPV = "SPV"  # véhicule de financement / titrisation — non-sellable
ENTITY_TYPE_DIVESTED = "cedee"  # entité cédée — sortie du périmètre du groupe
ENTITY_TYPE_HOMONYM = "homonyme"  # même nom, secteur sans rapport — probable homonyme
ENTITY_TYPE_NOISE = "bruit"  # SCI / holding / GIE / hors-scope — pas une cible

# Types that put an entity in the secondary "Autres entités" tab (non-actionable).
_NON_ACTIONABLE_TYPES: frozenset[str] = frozenset(
    {ENTITY_TYPE_SPV, ENTITY_TYPE_DIVESTED, ENTITY_TYPE_HOMONYM, ENTITY_TYPE_NOISE}
)


def _naf_matches(naf: str | None, prefixes: tuple[str, ...]) -> bool:
    code = (naf or "").strip().replace(".", "").replace(" ", "")
    return bool(code) and code.startswith(prefixes)


_norm = normalize_name


def derive_no_go_keywords(no_go_sectors: Sequence[object] | None) -> frozenset[str]:
    """Distinctive keywords from the ESN's declared no-go sectors (A2 / §9, Théo).
    "Grande distribution" → {distribution}; "Assurance" → {assurance}; "BTP" → {btp}.
    Threshold + stopwords live in the knowledge config (niveau 1, override-able).
    Empty when the profile declares none → the gate stays profile-neutral."""
    cfg = get_config().no_go
    stop = set(cfg.stopwords)
    kws: set[str] = set()
    for sector in no_go_sectors or []:
        for tok in _norm(sector).split():
            if len(tok) >= cfg.min_keyword_len and tok not in stop:
                kws.add(tok)
    return frozenset(kws)


def _no_go_hit(name: str, no_go_keywords: frozenset[str]) -> str | None:
    """The no-go keyword matching this entity name, or None. Matches a whole token
    or its singular/plural counterpart ("Assurances" ↔ no-go "assurance", and
    "Banques" ↔ "banque") — NOT a loose prefix, so "banque" never hits "Banquette"."""
    if not no_go_keywords:
        return None
    for tok in _norm(name).split():
        for kw in no_go_keywords:
            if tok == kw or tok == kw + "s" or kw == tok + "s":
                return kw
    return None


# A group whose CORE business is a family has SEVERAL entities in it (VINCI: 5
# BTP-named subs); a bank with one stray BTP sub (SGTM) has exactly 1. This count
# is the discriminator — NOT a free-text keyword hit, which a bank's objet social
# ("financement de la construction") would wrongly trigger (red-team regression).
_IN_SCOPE_MIN_ENTITIES = 2


def derive_in_scope_families(naf: str | None = None, entity_names: Sequence[object] | None = None) -> frozenset[str]:
    """Which out-of-sector families are actually the TARGET group's own core
    business — so :func:`classify_entity_relevance` spares its operating arms.

    Signal, in order of authority:
    - the target's registry NAF division (authoritative when the target itself
      operates in that division), and
    - ≥ ``_IN_SCOPE_MIN_ENTITIES`` of its subsidiaries/entities NAMED in that
      family (a construction group has many BTP-named subs; a bank with a single
      stray BTP sub does not).

    Deliberately NOT derived from the free-text sector/objet-social/LLM
    description: a bank whose objet social says "financement de la construction"
    would otherwise spare its BTP subs — re-opening the SGTM / "moulins du Togo"
    regression this gate exists to prevent.
    """
    names = [str(n or "") for n in (entity_names or [])]
    fams: set[str] = set()
    for key, prefixes, rx, _reason in _OUT_OF_SECTOR_FAMILIES:
        if _naf_matches(naf, prefixes) or sum(1 for n in names if rx.search(n)) >= _IN_SCOPE_MIN_ENTITIES:
            fams.add(key)
    return frozenset(fams)


def is_foreign_entity(name: str | None) -> bool:
    """Ce nom désigne-t-il une entité hors du périmètre France ?

    Exposé plutôt que dupliqué : le typage d'entité (§24) a besoin de la même
    réponse que la classification de pertinence, et deux motifs parallèles
    finiraient par diverger — l'un dirait « hors périmètre », l'autre
    « filiale opérationnelle », sur la même ligne.
    """
    return bool(_FOREIGN_RE.search(_norm((name or "").strip())))


def classify_entity_relevance(
    name: str | None,
    naf: str | None = None,
    *,
    in_scope_families: frozenset[str] = frozenset(),
    no_go_keywords: frozenset[str] = frozenset(),
    allow_international: bool = False,
    it_esn: bool = True,
) -> tuple[str, str]:
    """Relevance of an entity for the ESN, from its legal name + NAF.

    Returns ``(relevance, reason)`` where relevance is one of
    ``operating`` / ``noise`` / ``out_of_sector``:
    - ``operating`` — a sellable target (default, and forced for an IT/digital arm
      when the ESN itself is IT-services).
    - ``noise`` — a legal vehicle (SCI / holding / GIE) an ESN can't sell to.
    - ``out_of_sector`` — real company but off the target group's core sector
      (a BTP / agri / agro entity under an unrelated parent): keep & label, but
      no commercial play.

    ``in_scope_families`` are the out-of-sector families that ARE the target
    group's own core business (see :func:`derive_in_scope_families`) — entities
    in those families are spared the exclusion.

    Dé-silo (Drive #9 phase 4): the IT signal (``is_it_entity`` or NAF 62.0x /
    63.11) is the highest-risk lever — it force-keeps an entity as prime relevance
    against every noise / out-of-sector / no-go rule below. That thumb only makes
    sense when the ESN itself sells IT, so it is gated on ``it_esn``:
    - ``it_esn=True``  (IT-services ESN, or NO profile at the call site) → the
      override fires exactly as before → byte-identical historical behaviour;
    - ``it_esn=False`` (a genuinely non-IT ESN) → the IT-NAF/name override is
      withheld, so a "GIE Informatique" reads as GIE noise for a non-IT ESN
      instead of being force-kept. The factual IT tag is untouched — only the
      relevance *override* is gated. ``it_esn`` defaults ``True`` so every
      existing caller (and the IT/no-profile path) stays unchanged.
    """
    cleaned = (name or "").strip()
    if len(cleaned) < _MIN_NAME_LEN:
        return RELEVANCE_NOISE, "nom vide ou illisible"
    # Cédée / divested (Théo p.6): a sold-off entity has left the group's perimeter
    # — no play, whatever its sector or IT signal. Checked FIRST so an "ex-filiale
    # Digital" is out even though its name would otherwise read as an IT arm.
    if _DIVESTED_RE.search(cleaned):
        return RELEVANCE_OUT_OF_SECTOR, "entité cédée (hors périmètre du groupe)"
    # SPV / véhicule de financement (Théo p.6): "2009 KOALA FINANCE", FCT
    # compartments, EMTN issuers — legally real (a SIREN) but never a target. Killed
    # BEFORE the IT/operating fall-through the plain noise rules can't reach (they
    # only know SCI / holding / GIE), so the ~98-node SG graph stops surfacing SPVs.
    if _SPV_RE.search(cleaned):
        return RELEVANCE_NOISE, "SPV / véhicule de financement (titrisation)"
    # Geographic gate (Théo p.6): a foreign entity (Afrique / Maghreb) is off the
    # perimeter of a France-scoped ESN — checked BEFORE the IT override so even a
    # foreign IT arm is excluded unless the profile declares an international scope.
    if not allow_international and _FOREIGN_RE.search(_norm(cleaned)):
        return RELEVANCE_OUT_OF_SECTOR, "hors périmètre géographique (international)"
    # IT arm — the prime ESN target — overrides every exclusion rule, but ONLY
    # for an IT-services ESN (or a profile-less call). A non-IT ESN doesn't get
    # its target's IT subsidiary force-kept over noise/out-of-sector (Drive #9 p4).
    if it_esn and (is_it_entity(cleaned) or _naf_matches(naf, _IT_NAF_PREFIXES)):
        return RELEVANCE_OPERATING, ""
    # Profile no-go sector (A2, Théo §9): the ESN declared it never sells here →
    # keep & label the entity, but no play. Profile-driven, so it wins over the
    # target-aware family rules below. Empty keyword set → this is a no-op.
    hit = _no_go_hit(cleaned, no_go_keywords)
    if hit:
        return RELEVANCE_OUT_OF_SECTOR, f"hors périmètre profil (no-go : {hit})"
    # Wrong sector: NAF is authoritative when present, else fall back to the name.
    # Families that ARE the target group's core business are spared.
    for key, prefixes, rx, reason in _OUT_OF_SECTOR_FAMILIES:
        if key in in_scope_families:
            continue
        if _naf_matches(naf, prefixes):
            return RELEVANCE_OUT_OF_SECTOR, f"hors secteur (NAF {naf})"
        if rx.search(cleaned):
            return RELEVANCE_OUT_OF_SECTOR, f"hors secteur ({reason})"
    # Legal-vehicle noise (SCI / holding / GIE).
    for _key, rx, reason in _NOISE_RULES:
        if rx.search(cleaned):
            return RELEVANCE_NOISE, reason
    return RELEVANCE_OPERATING, ""


def classify_subsidiary(
    name: str | None,
    in_scope_families: frozenset[str] = frozenset(),
    no_go_keywords: frozenset[str] = frozenset(),
    allow_international: bool = False,
    *,
    it_esn: bool = True,
) -> tuple[str, str]:
    """Name-only relevance for a Pappers corporate-graph node (no NAF available).

    Thin wrapper over :func:`classify_entity_relevance` — the graph nodes carry
    only ``name`` + ``siren``. ``it_esn`` (default ``True``) gates the IT-name
    relevance override for the ESN's domain (Drive #9 p4)."""
    return classify_entity_relevance(
        name,
        naf=None,
        in_scope_families=in_scope_families,
        no_go_keywords=no_go_keywords,
        allow_international=allow_international,
        it_esn=it_esn,
    )


def gets_play(relevance: str) -> bool:
    """True when an entity is worth a full commercial play — only ``operating``.
    Noise & out-of-sector entities are kept and labelled, but never get contacts,
    angles, a 30/60/90 plan or messages generated for them."""
    return relevance == RELEVANCE_OPERATING


def classify_entity_type(
    name: str | None,
    *,
    relevance: str,
    relevance_reason: str = "",
    is_it_entity_flag: bool = False,
    structural_type: str | None = None,
    it_esn: bool = True,
) -> tuple[str, bool]:
    """Qualify an entity with a *type* + an ``actionable`` flag (Théo p.6).

    Returns ``(type, actionable)`` where ``type`` is one of the report's buckets
    (mirrors contracts ``entityTypeSchema``): the actionable set — a structural
    label (``BU`` / ``filiale`` / ``direction`` …) or ``operational`` /
    ``filiale_strategique`` — vs the secondary-tab set ``SPV`` / ``cedee`` /
    ``homonyme`` / ``bruit``. ``actionable`` is ``True`` only for the first set.

    Fully deterministic + explainable — no LLM guess. Ordered so the strongest,
    most specific exclusion wins, then the relevance gate, then operating:

    1. ``cedee`` — cession / divested markers in the name or the gate's reason.
    2. ``SPV`` — a financing / securitisation vehicle name ("2009 KOALA FINANCE").
    3. ``bruit`` — a legal-vehicle *noise* relevance (SCI / holding / GIE).
    4. ``homonyme`` / ``bruit`` — ``out_of_sector``: a cross-sector-family entity
       carrying the group name reads as a homonym; a geo / no-go exclusion is
       off-scope noise for this seller.
    5. ``filiale_strategique`` — a domestic IT / digital arm (the prime target),
       *for an IT-services ESN* (``it_esn``). Dé-silo (Drive #9 phase 3): a non-IT
       ESN doesn't crown the target's IT arm — it keeps its structural / operational
       badge (still actionable, just not flagged the #1 target). ``it_esn`` defaults
       ``True`` so IT-ESN and profile-less callers are byte-identical.
    6. ``operational`` (or the LLM's structural label) — a plain operating entity.
    """
    cleaned = (name or "").strip()
    reason = relevance_reason or ""
    if _DIVESTED_RE.search(cleaned) or _DIVESTED_RE.search(reason):
        return ENTITY_TYPE_DIVESTED, False
    if _SPV_RE.search(cleaned):
        return ENTITY_TYPE_SPV, False
    if relevance == RELEVANCE_NOISE:
        return ENTITY_TYPE_NOISE, False
    if relevance == RELEVANCE_OUT_OF_SECTOR:
        # "hors secteur (…)" = the entity's sector family contradicts the group's
        # → probable homonym (Théo p.10). Geo / no-go exclusions are just off-scope.
        if "hors secteur" in reason:
            return ENTITY_TYPE_HOMONYM, False
        return ENTITY_TYPE_NOISE, False
    # Operating & in-scope → actionable. An IT / digital arm is the prime target
    # → surface it as a strategic subsidiary (IT-services ESN only); otherwise keep
    # the LLM's structural label (BU / direction / groupe …), defaulting to operational.
    if it_esn and (is_it_entity_flag or is_it_entity(cleaned)):
        return ENTITY_TYPE_STRATEGIC, True
    st = (structural_type or "").strip()
    if st and st not in _NON_ACTIONABLE_TYPES:
        return st, True
    return ENTITY_TYPE_OPERATIONAL, True


def in_scope_entities(entities: Iterable[Mapping[str, object]] | None) -> list[dict]:
    """Keep only entities worth downstream work (organigramme / contacts / plays).

    Drops entries the relevance gate marked out-of-scope (``getsPlay`` explicitly
    False) so noise / out-of-sector / foreign BUs — SGTM, Société Générale Côte
    d'Ivoire, SPVs — never seed the classifier's organigramme nor a play (Théo:
    "SGTM/Côte d'Ivoire/Afrique = mauvais scope"). An entry WITHOUT a ``getsPlay``
    key is kept (benefit of the doubt — mirrors phase-4's ``_entity_gets_play``:
    an unclassifiable entity is labelled, never silently dropped)."""
    return [dict(e) for e in (entities or []) if isinstance(e, Mapping) and e.get("getsPlay") is not False]


def annotate_entity_relevance(
    entity: Mapping[str, object],
    in_scope_families: frozenset[str] = frozenset(),
    no_go_keywords: frozenset[str] = frozenset(),
    allow_international: bool = False,
    *,
    it_esn: bool = True,
) -> dict:
    """Tag a single ``entitiesExhaustive`` entry with ``relevance`` /
    ``relevanceReason`` / ``getsPlay`` (non-destructive). An upstream ``isItEntity``
    (set by INSEE NAF enrichment) is a hard operating override — but, like the
    name/NAF override inside :func:`classify_entity_relevance`, it is gated on
    ``it_esn`` (Drive #9 phase 4): it force-keeps the IT arm ONLY for an
    IT-services ESN (or a profile-less call). ``in_scope_families`` spares the
    target group's own core sector (see :func:`derive_in_scope_families`) ;
    ``no_go_keywords`` demotes an entity in a sector the ESN declared no-go (A2).
    ``it_esn`` (default ``True``) gates the IT relevance override AND the
    ``filiale_strategique`` badge — a non-IT ESN's IT arm keeps its ordinary
    relevance (computed on its own merits, no IT thumb) and its structural badge.
    IT-services and profile-less callers stay byte-identical."""
    base = dict(entity)
    _it_flag = base.get("isItEntity") is True
    if _it_flag and it_esn:
        relevance, reason = RELEVANCE_OPERATING, ""
    else:
        naf = base.get("nafCode") or base.get("naf")
        relevance, reason = classify_entity_relevance(
            _name_of(entity),
            str(naf) if naf else None,
            in_scope_families=in_scope_families,
            no_go_keywords=no_go_keywords,
            allow_international=allow_international,
            it_esn=it_esn,
        )
    # Qualification type + actionable flag (Théo p.6) — the badge + the default
    # filter the cartography uses to keep SPV / cédées / homonymes in a 2nd tab.
    entity_type, actionable = classify_entity_type(
        _name_of(entity),
        relevance=relevance,
        relevance_reason=reason,
        is_it_entity_flag=_it_flag,
        structural_type=base.get("type"),
        it_esn=it_esn,
    )
    return {
        **base,
        "relevance": relevance,
        "relevanceReason": reason,
        "getsPlay": gets_play(relevance),
        "type": entity_type,
        "actionable": actionable,
    }


def _name_of(sub: object) -> str | None:
    if isinstance(sub, Mapping):
        return sub.get("name")
    return getattr(sub, "name", None)


# ── Entity parent tree (annexe organigramme p6 : « construire le compte avant les
#    personnes ») ─────────────────────────────────────────────────────────────
# The org graph needs Groupe→Filiale→BU. Pappers' company-to-company edges are
# undocumented id-pairs whose DIRECTION is unknown (see pappers/cartographie.py) —
# so we NEVER guess it. parentId is inferred DETERMINISTICALLY from the structural
# TYPE hierarchy + name-containment, explainable and never fabricated. The Phase
# 2/3 OrgGraph resolver, with real ids + sourced edges, supersedes this.

# Structural depth per type. Only these participate in the tree; qualifier / geo /
# overlay types (SPV / cedee / homonyme / bruit / site / programme) get no parent
# and are never a parent (a site is geo — « jamais parent par défaut », p6).
_ENTITY_TREE_RANK: dict[str, int] = {
    "groupe": 0,
    "filiale": 1,
    "filiale_strategique": 1,
    "marque": 1,
    "operational": 1,  # generic in-scope operating entity — a subsidiary of the group
    "bu": 2,
    "business unit": 2,
    "direction": 2,
    "departement": 3,
    "equipe": 3,
}

# Brand-noise tokens dropped before the name test — a shared "groupe" / "france" is
# not a parent signal.
_TREE_STOPWORDS: frozenset[str] = frozenset(
    {"groupe", "group", "sa", "sas", "sasu", "sarl", "holding", "france", "international", "corp", "compagnie", "cie"}
)


def _tree_rank(entity: Mapping[str, object]) -> int | None:
    return _ENTITY_TREE_RANK.get(str(entity.get("type") or "").strip().lower())


def _brand_tokens(name: object) -> frozenset[str]:
    text = name if isinstance(name, str) else ""
    return frozenset(t for t in _norm(text).split() if t and t not in _TREE_STOPWORDS)


def assign_entity_parents(entities: Sequence[Mapping[str, object]] | None) -> list[dict]:
    """Stamp each entity with a deterministic ``parentId`` (annexe organigramme p6).

    ``parentId`` references the parent's ``name`` (this model's identity key; the
    Phase 2/3 resolver maps names → real ids). Rules, in order, never guessing a
    Pappers edge direction:
      1. Only structural types (groupe / filiale / bu / …) are placed; a root
         (``groupe``) gets ``parentId = None``.
      2. Parent = the nearest higher tier sharing a distinctive brand token
         (``"TF1 Pub"`` → ``"TF1 Groupe"``). Closest tier wins, then strongest overlap.
      3. A tier-1 subsidiary with no name link falls back to the SINGLE group root
         (an account has one root); otherwise ``parentId`` stays ``None`` — an honest
         "unknown parent", not a guess.
    Cycles are impossible (a parent is always strictly higher tier). Pure +
    deterministic; entries without a structural type are returned untouched.
    """
    items = [dict(e) for e in (entities or []) if isinstance(e, Mapping)]
    ranked = [(i, _tree_rank(e)) for i, e in enumerate(items)]
    roots = [i for i, r in ranked if r == 0]
    sole_root_name = items[roots[0]].get("name") if len(roots) == 1 else None

    for idx, r in ranked:
        e = items[idx]
        if r is None:
            continue  # not a structural node — no parent, and not a candidate parent
        if r == 0:
            e["parentId"] = None
            continue
        my_name = e.get("name")
        my_tokens = _brand_tokens(my_name)
        best: tuple[int, int] | None = None  # (parentRank, overlap)
        best_name: object = None
        for j, rj in ranked:
            if j == idx or rj is None or rj >= r:
                continue
            cand_name = items[j].get("name")
            if cand_name == my_name:  # never self-parent a same-named entity
                continue
            overlap = len(my_tokens & _brand_tokens(cand_name))
            if overlap == 0:
                continue
            key = (rj, overlap)
            if best is None or key > best:
                best, best_name = key, cand_name
        if best is not None:
            e["parentId"] = best_name
        elif r == 1 and sole_root_name is not None:
            e["parentId"] = sole_root_name  # lone subsidiary → the single group root
        else:
            e["parentId"] = None
    return items


def _name_tokens(name: object) -> frozenset[str]:
    return _brand_tokens(re.sub(r"[^\w\s]", " ", _norm(name)))


def merge_web_subsidiaries(registry: Sequence[object], web: Sequence[object]) -> list[dict]:
    """#4327 — le registre PUIS ce que le web nomme et qu'il ne porte pas.

    Le graphe du registre ne voit ni la filiale indirecte, ni la marque dont le
    nom commercial diffère de la raison sociale (« Fortuneo » pour FORTUNEO
    BANQUE). Une filiale nommée par le web reste donc, sauf si le registre la
    porte déjà (jetons de marque inclus l'un dans l'autre). Jamais de SIREN
    inventé : une entrée du web porte ``siren: None`` et ``source: "web"``.
    """

    def _as_dict(item: object) -> dict:
        if isinstance(item, Mapping):
            return dict(item)
        if isinstance(item, str):
            return {"name": item}
        name = getattr(item, "name", None)
        return {"name": name} if name else {}

    kept = [_as_dict(item) for item in registry]
    known = [_name_tokens(item.get("name")) for item in kept]
    for item in web:
        entry = _as_dict(item)
        tokens = _name_tokens(entry.get("name"))
        if not tokens or any(t and (tokens <= t or t <= tokens) for t in known):
            continue
        known.append(tokens)
        row = {"name": entry["name"], "siren": entry.get("siren"), "source": "web"}
        # #4327.2 — D'OÙ vient le lien déduit : la page qui nomme la filiale, seulement si l'analyse l'a donnée.
        source_url = str(entry.get("source_url") or "").strip()
        if source_url:
            row["source_url"] = source_url
        kept.append(row)
    return kept


def partition_subsidiaries(
    subsidiaries: Sequence[Mapping[str, object]],
    in_scope_families: frozenset[str] = frozenset(),
    no_go_keywords: frozenset[str] = frozenset(),
    allow_international: bool = False,
    *,
    it_esn: bool = True,
) -> dict:
    """Split the subsidiary list into operating vs noise.

    Returns ``{meaningful, annotated, summary}``:
    - ``meaningful`` — operating entities only (the sellable cartography).
    - ``annotated`` — every input subsidiary with ``relevance`` +
      ``relevanceReason`` added (non-destructive; preserves all fields).
    - ``summary`` — ``total`` / ``meaningful`` / ``filtered`` counts +
      ``filteredReasons`` breakdown.

    ``in_scope_families`` spares the target group's own core sector (see
    :func:`derive_in_scope_families`) so a construction group's BTP arms stay
    operating. ``it_esn`` (default ``True``) gates only the ``filiale_strategique``
    badge for the ESN's domain (Drive #9 phase 3 — see :func:`classify_entity_type`).
    """
    annotated: list[dict] = []
    meaningful: list[dict] = []
    reasons: dict[str, int] = {}

    for sub in subsidiaries:
        name = _name_of(sub)
        base = dict(sub) if isinstance(sub, Mapping) else {"name": name}
        relevance, reason = classify_subsidiary(name, in_scope_families, no_go_keywords, allow_international, it_esn=it_esn)
        _it = is_it_entity(name)
        entity_type, actionable = classify_entity_type(
            name,
            relevance=relevance,
            relevance_reason=reason,
            is_it_entity_flag=_it,
            structural_type=base.get("type"),
            it_esn=it_esn,
        )
        item = {
            **base,
            "relevance": relevance,
            "relevanceReason": reason,
            "isItEntity": _it,
            "type": entity_type,
            "actionable": actionable,
        }
        annotated.append(item)
        if relevance == "operating":
            meaningful.append(item)
        else:
            reasons[reason] = reasons.get(reason, 0) + 1

    total = len(annotated)
    return {
        "meaningful": meaningful,
        "annotated": annotated,
        "summary": {
            "total": total,
            "meaningful": len(meaningful),
            "filtered": total - len(meaningful),
            "filteredReasons": reasons,
        },
    }
