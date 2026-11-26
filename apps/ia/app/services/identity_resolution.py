"""Company Resolver — deterministic identity gate (retour Thales 2026-07-07).

The Pappers name search resolves a name to the top hit at name-similarity
≥ 0.55 (``pappers/search.py``). A homonym trading under an *identical* legal
name therefore passes: "THALES" (transports fluviaux de fret, 1-2 salariés,
Saint-Étienne-du-Vauvray) is accepted as the aerospace group. The registry firmo
then overwrites the web firmo in the header (``_merge_pappers``) and the SIREN
anchor inflates confidence to 100/100 — exactly the failure the client reported.

Name similarity can't catch this (the names ARE identical); the *firmographic*
contradiction can. ``assess_identity`` compares the resolved LEGAL entity against
the WEB-collected firmographics and, when they contradict, refuses to trust the
registry: the dossier switches to "mode groupe web" and the header/scoring stop
using registry data — the hard rule Théo asked for.

Deterministic, no LLM (same philosophy as confidence / entities / truth_status).
The anchor signal is a SIZE conflict (a big web presence resolving to a TPE
registry entity); a sector contradiction or a missing corporate graph corroborate
it. A size conflict is REQUIRED — a legally-anchored, appropriately-sized entity
is trusted even when the NAF label and the web sector wording don't overlap
(informatique vs cloud), to avoid false-positives on legitimate brand≠legal cases
(OVHcloud → OVH GROUPE SA).
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from app.services.text_norm import normalize_name

# A registry entity at/under this headcount is a TPE — implausible for a company
# with a substantial web footprint (covers the "1 ou 2 salariés" Thales homonym).
_SIZE_SMALL_MAX = 9
# Web headcount at/above this can't be a TPE → a size conflict when the registry
# entity is tiny.
_WEB_LARGE_MIN = 250
# Significant token length for the sector-overlap comparison (drops de / et / la).
_MIN_TOKEN_LEN = 4
# Sector tokens that are too generic to count as an overlap on their own.
_SECTOR_STOPWORDS = frozenset(
    {"autres", "activites", "services", "conseil", "gestion", "groupe", "france", "societe", "holding"}
)
# Registry headcount labels that denote a TPE even without a numeric max.
_TINY_LABEL_RE = re.compile(
    r"\b(0\s*salari|aucun\s*salari|1\s*ou\s*2|3\s*(?:a|à)\s*5|6\s*(?:a|à)\s*9)\b", re.IGNORECASE
)
_GROUP_HINT_RE = re.compile(r"\b(groupe|group|multinationale?|worldwide|mondial)\b", re.IGNORECASE)
_NUMBER_RUN_RE = re.compile(r"\d[\d\s. ]*")


class IdentityAssessment(BaseModel):
    """Verdict on whether the resolved legal entity IS the target group.

    - ``verified`` — registry entity matches the web footprint; trust the registry.
    - ``uncertain`` — one strong contradiction (size); registry is distrusted.
    - ``homonyme`` — a size conflict corroborated by sector/graph; a wrong SIREN.
    - ``no_registry`` — no registry resolved at all; web-only dossier.
    """

    status: str = "verified"  # verified | uncertain | homonyme | no_registry
    identity_confidence: float = Field(alias="identityConfidence", default=1.0, ge=0.0, le=1.0)
    use_registry_data: bool = Field(alias="useRegistryData", default=True)
    mode: str = "registre"  # registre | web_group
    reasons: list[str] = []

    model_config = {"populate_by_name": True}


def parse_employee_count(value: object) -> int | None:
    """First integer in a headcount string ("80 000" → 80000, "2 000 à 4 999
    salariés" → 2000), the int itself when already numeric, else ``None``."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    m = _NUMBER_RUN_RE.search(str(value or ""))
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group(0))
    return int(digits) if digits else None


def _sector_tokens(text: object) -> set[str]:
    return {
        t
        for t in re.split(r"[^a-z0-9]+", normalize_name(text))
        if len(t) >= _MIN_TOKEN_LEN and t not in _SECTOR_STOPWORDS
    }


# Coarse, CONFIDENTLY-DISTINCT sector families for homonym disambiguation
# (Théo p.10/homonyme). Same-domain synonyms map to the SAME family so a bare
# token mismatch ("informatique" vs "cloud") is NOT flagged — only a genuine
# cross-family split ("banque" vs "travaux d'installation électrique") is. Matched
# on the accent-stripped, lowercased blob; families ordered most-specific first.
_SECTOR_FAMILIES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("it", re.compile(r"informatiq|logiciel|numeriq|digital|\bcloud\b|\bdata\b|software|\bsaas\b|editeur de|programmation|infogeran|systeme.? d.? information|\besn\b|cybersecur")),
    ("btp", re.compile(r"travaux|batiment|\bbtp\b|construction|electricit|plomberi|genie civil|maconneri|couvertur|charpent|installation electriq|renovation")),
    ("finance", re.compile(r"banqu|assuranc|\bfinanc|\bcredit|investissement|mutuell|courtag|\bbourse|gestion de patrimoin|capital")),
    ("sante", re.compile(r"\bsante\b|medical|hopita|cliniq|pharmaceut|\bsoin|biolog medical")),
    ("energie", re.compile(r"\benergie|petrol|\bgaz\b|nucleair|raffineri|eolien|photovoltaiq|\bsolaire")),
    ("industrie", re.compile(r"industri|fabrication|\busine|manufactur|metallurg|chimiq|plasturg|aeronautiq|siderurg")),
    ("transport", re.compile(r"transport|logistiq|ferroviair|\baerien|maritim|\bfret\b|messageri|routier")),
    ("distribution", re.compile(r"grande distribution|commerce de detail|supermarch|hypermarch|\bretail\b|vente au detail")),
    ("immobilier", re.compile(r"immobili|foncier|promotion immobili|agence immobili")),
    ("agri", re.compile(r"agricol|\belevage|agroaliment|\bmoulin|minoteri|viticol|semouleri")),
    ("telecom", re.compile(r"telecom|operateur mobile|reseaux mobile")),
)


def _sector_family(text: object) -> str | None:
    """Map a sector label / description to a coarse family, or None when it's too
    generic to classify confidently (conseil, services, holding…)."""
    blob = normalize_name(text)
    if not blob.strip():
        return None
    for family, rx in _SECTOR_FAMILIES:
        if rx.search(blob):
            return family
    return None


def _registry_is_tiny(registry: dict) -> bool:
    reg_max = registry.get("headcount_max")
    if isinstance(reg_max, int) and reg_max <= _SIZE_SMALL_MAX:
        return True
    label = str(registry.get("headcount_label") or "")
    return bool(label) and bool(_TINY_LABEL_RE.search(label))


def _has_corporate_graph(web: dict) -> bool:
    """The web view shows a multi-entity group (subsidiaries / competitors)."""
    return int(web.get("subsidiaries_count") or 0) >= 3 or int(web.get("competitors_count") or 0) >= 3


def _web_is_substantial(web: dict) -> bool:
    emp = parse_employee_count(web.get("employees"))
    return (emp is not None and emp >= _WEB_LARGE_MIN) or _has_corporate_graph(web)


def _has_group_hint(web: dict) -> bool:
    if _has_corporate_graph(web):
        return True
    blob = f"{web.get('description') or ''} {web.get('sector') or ''}"
    return bool(_GROUP_HINT_RE.search(blob))


def assess_identity(
    *, target_name: str, web: dict, registry: dict | None
) -> IdentityAssessment:
    """Assess whether the resolved ``registry`` entity is really ``target_name``.

    ``web`` carries the web-collected firmographics (sector / employees / revenue
    / description + subsidiaries_count / competitors_count hints); ``registry`` is
    the Pappers/INSEE view (legal_name / naf_label / headcount_* / city /
    subsidiaries_count / branch_count). ``None`` registry → a web-only dossier.
    """
    if not registry:
        return IdentityAssessment(
            status="no_registry",
            identityConfidence=0.4,
            useRegistryData=False,
            mode="web_group",
            reasons=["Aucune donnée registre — dossier basé sur le web."],
        )

    size_conflict = _web_is_substantial(web) and _registry_is_tiny(registry)

    reg_naf = str(registry.get("naf_label") or "")
    web_sector_blob = f"{web.get('sector') or ''} {web.get('description') or ''}"

    # A legally-anchored entity of a plausible size is USUALLY trusted — but a
    # CROSS-FAMILY sector split still betrays a homonym even at a plausible size
    # (« Société Générale » → « Société Générale d'Électricité », un électricien
    # de taille correcte). Bare token overlap is too noisy for this (informatique
    # vs cloud), so we use coarse, confidently-distinct families: only a genuine
    # split (banque ≠ btp) distrusts the registry. Théo p.10 / homonyme.
    if not size_conflict:
        reg_family = _sector_family(reg_naf)
        web_family = _sector_family(web.get("sector"))
        if reg_family and web_family and reg_family != web_family:
            return IdentityAssessment(
                status="uncertain",
                identityConfidence=0.4,
                useRegistryData=False,
                mode="web_group",
                reasons=[
                    f"Secteur registre « {reg_naf} » ({reg_family}) sans rapport avec le secteur web "
                    f"« {str(web.get('sector') or '').strip()} » ({web_family}) — probable homonyme."
                ],
            )
        return IdentityAssessment(
            status="verified", identityConfidence=1.0, useRegistryData=True, mode="registre", reasons=[]
        )

    sector_conflict = bool(reg_naf) and bool(web_sector_blob.strip()) and not (
        _sector_tokens(reg_naf) & _sector_tokens(web_sector_blob)
    )
    graph_absence = (
        _has_group_hint(web)
        and int(registry.get("subsidiaries_count") or 0) == 0
        and int(registry.get("branch_count") or 0) <= 1
    )

    reasons: list[str] = []
    reg_size = registry.get("headcount_label") or registry.get("headcount_max")
    web_emp = parse_employee_count(web.get("employees"))
    reasons.append(
        f"Effectif registre ({reg_size}) incohérent avec la taille web"
        + (f" (~{web_emp:,} salariés)".replace(",", " ") if web_emp else " (groupe)")
    )
    if sector_conflict:
        reasons.append(
            f"Secteur registre « {reg_naf} » sans rapport avec le secteur web "
            f"« {str(web.get('sector') or '').strip()} »"
        )
    if graph_absence:
        reasons.append("Aucun graphe corporate au registre alors que le web décrit un groupe.")

    corroborated = sector_conflict or graph_absence
    status = "homonyme" if corroborated else "uncertain"
    confidence = 0.15 if corroborated else 0.5
    return IdentityAssessment(
        status=status,
        identityConfidence=confidence,
        useRegistryData=False,
        mode="web_group",
        reasons=reasons,
    )
