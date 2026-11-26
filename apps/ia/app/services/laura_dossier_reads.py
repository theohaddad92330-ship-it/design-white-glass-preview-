"""LOT (15/10) DATA-B — « Laura voit tout ce qu'on a déjà ».

Des faits calculés, stockés et affichés par l'écran Compte sans aucun appelant côté chat (le défaut du
dépôt : du code juste que personne n'appelle) : technologies, ESN en place, signaux budgétaires, hypothèses
qualifiées, réglementations, programmes, sites, firmographie, faits publics en cache, organigramme.

Ce module ne fait QUE projeter, en BORNÉ, ce que le dossier porte déjà :
  · aucune lecture externe — les seules lectures sont le compte (Supabase), le pont interne NestJS et le
    cache COMMUN (``public_facts.peek_fact`` / ``provider_cache.peek_json``, jamais un appel fournisseur) ;
  · une absence ne fait AUCUNE ligne dans une liste, jamais « 0 » (garde GA-18) ;
  · chaque fait garde sa date et sa source INTERNE telles que le dossier les porte ;
  · nos fournisseurs ne se nomment jamais (``_clean_text`` retire leur nom de tout texte relayé).
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

_TEXT_LIMIT = 300
_LONG_TEXT_LIMIT = 1200

# Le nom d'un fournisseur de collecte ne voyage jamais vers le modèle (doctrine « nos fournisseurs ne se
# nomment jamais »). Un texte qui en cite un est relayé sans le nom, jamais supprimé en entier.
_PROVIDER_WORDS = re.compile(
    r"\b(adzuna|jooble|theirstack|fantastic(?:\.jobs)?|mantiks|apollo|pappers|brave|firecrawl|dropcontact|"
    r"salesql|hunter|dataforge)\b",
    re.IGNORECASE,
)

# Les rangs de la hiérarchie de confiance (`AccountIntelligenceSource`) en mots que l'utilisateur lit.
SOURCE_LABELS: dict[str, str] = {
    "human_correction": "correction humaine",
    "current_data": "donnée courante du dossier",
    "registry_identity": "registre officiel",
    "connected_tools": "outils branchés",
    "dataforge": "base commune Bellum",
    "public_sources": "sources publiques",
    "market_memory": "mémoire marché",
    "inference": "déduction",
}


def _camel(snake: str) -> str:
    head, *tail = snake.split("_")
    return head + "".join(part.capitalize() for part in tail)


def pick(raw: Mapping[str, Any] | None, snake: str) -> Any:
    """La valeur d'une clé du dossier, qu'elle soit écrite en snake_case (démo, anciens dossiers) ou en
    camelCase (pipeline) — la première non vide."""
    if not isinstance(raw, Mapping):
        return None
    for key in (snake, _camel(snake)):
        value = raw.get(key)
        if value not in (None, "", [], {}):
            return value
    return None


def _clean_text(value: Any, limit: int = _TEXT_LIMIT) -> str | None:
    if not isinstance(value, str):
        return None
    text = _PROVIDER_WORDS.sub("", value)
    text = re.sub(r"\s+", " ", text).strip(" ·-–—,;")
    if not text:
        return None
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _scalar(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        # Un effectif, un montant ou un compte à 0 est une ABSENCE de mesure, jamais un fait (garde GA-18).
        return value if value > 0 else None
    return _clean_text(value)


def project_items(
    value: Any, keys: Sequence[str], *, limit: int, text_limit: int = _TEXT_LIMIT
) -> tuple[list[Any], int]:
    """Une liste du dossier, BORNÉE : ``(éléments, total)``. Un élément texte reste un texte ; un élément
    structuré ne garde que les clés de ``keys`` (dans leurs deux écritures) qui portent une valeur. Un
    élément vide ne fait aucune ligne."""
    if not isinstance(value, list):
        return [], 0
    projected: list[Any] = []
    for item in value:
        if isinstance(item, str):
            text = _clean_text(item, text_limit)
            if text:
                projected.append(text)
        elif isinstance(item, Mapping):
            row: dict[str, Any] = {}
            for key in keys:
                raw = pick(item, key)
                if isinstance(raw, list):
                    texts = [t for t in (_clean_text(v, text_limit) for v in raw[:3]) if t]
                    if texts:
                        row[key] = texts
                else:
                    scalar = _scalar(raw)
                    if scalar not in (None, ""):
                        row[key] = scalar
            if row:
                projected.append(row)
    return projected[:limit], len(projected)


def _provenance(field: Mapping[str, Any]) -> dict[str, Any]:
    """La source (en mots) et la date d'un champ résolu par la hiérarchie de confiance."""
    provenance = field.get("provenance") if isinstance(field.get("provenance"), Mapping) else {}
    out: dict[str, Any] = {}
    source = provenance.get("source")
    if isinstance(source, str) and source:
        out["source"] = SOURCE_LABELS.get(source, "source interne")
    observed_at = provenance.get("observedAt")
    if isinstance(observed_at, str) and observed_at:
        out["observed_at"] = observed_at
    return out


def _known(field: Any) -> Mapping[str, Any] | None:
    return field if isinstance(field, Mapping) and field.get("state") == "known" else None


def intelligence_block(raw: Mapping[str, Any] | None, context: Mapping[str, Any] | None) -> dict[str, Any]:
    """POINT 1 — ce que le dossier sait du compte au-delà du verdict et des douleurs.

    ``raw`` = ``accounts.raw_analysis`` ; ``context`` = la façade de confiance NestJS
    (``bellum_api.account_intelligence_context``) ou ``None`` (pont éteint : on ne dit rien de plus).
    Présent-seulement : une rubrique sans donnée n'apparaît pas."""
    out: dict[str, Any] = {}
    context = context if isinstance(context, Mapping) else {}

    resolved_names: set[str] = set()
    technologies = _known(context.get("technologies"))
    if technologies and isinstance(technologies.get("value"), list):
        items, _ = project_items(technologies["value"], ("name", "usage"), limit=15)
        if items:
            out["technologies"] = {"items": items, **_provenance(technologies)}
            resolved_names = {str(i["name"]).lower() for i in items if isinstance(i, dict) and "name" in i}
    for key in ("technology_stack", "detected_tech_stack"):
        items, total = project_items(pick(raw, key), ("name", "category", "usage"), limit=15)
        items = [i for i in items if str(i.get("name") if isinstance(i, dict) else i).lower() not in resolved_names]
        if items:
            out[key] = items

    incumbents = _known(context.get("incumbentEsn"))
    if incumbents and isinstance(incumbents.get("value"), list):
        items, _ = project_items(
            incumbents["value"], ("name", "contract_type", "strengths", "weaknesses"), limit=5, text_limit=200
        )
        if items:
            out["incumbents"] = {"items": items, **_provenance(incumbents)}

    for key, fields, limit in (
        (
            "budget_signals",
            ("signal", "title", "description", "type", "amount", "timeframe", "date", "source", "sales_implication", "impact", "freshness"),
            6,
        ),
        ("qualified_hypotheses", ("hypothesis", "confidence", "esn_angle", "first_action", "based_on_signals"), 5),
        ("regulations", ("name", "regulation", "title", "impact", "it_impact", "deadline", "date", "description", "source"), 6),
        ("program_names", ("name", "entity", "budget", "description", "objective", "scope", "horizon"), 8),
    ):
        items, _ = project_items(pick(raw, key), fields, limit=limit)
        if items:
            out[key] = items

    sites, total_sites = project_items(
        pick(raw, "sites_france"), ("city", "name", "type", "region", "postal_code", "is_headquarters"), limit=10
    )
    if sites:
        out["sites_france"] = sites
        if total_sites > len(sites):
            out["sites_france_total"] = total_sites

    implications = pick(raw, "it_implications_for_esn")
    if isinstance(implications, list):
        parts = [t for t in (_clean_text(v, 400) for v in implications[:4]) if t]
        text: str | None = " · ".join(parts) if parts else None
    else:
        text = _clean_text(implications, _LONG_TEXT_LIMIT)
    if text:
        out["it_implications_for_esn"] = text
    return out


# ── POINT 3 — firmographie ────────────────────────────────────────────────────────────────────────

_FIRMO_SCALARS: tuple[tuple[str, str], ...] = (
    ("estimatedNumEmployees", "headcount_estimate"),
    ("foundedYear", "founded_year"),
    ("industry", "industry"),
    ("annualRevenuePrinted", "annual_revenue"),
    ("totalFundingPrinted", "total_funding"),
    ("latestFundingStage", "latest_funding_stage"),
    ("latestFundingRoundDate", "latest_funding_round_date"),
    ("parentOrganization", "parent_organization"),
    ("retailLocationCount", "location_count"),
    ("city", "city"),
    ("country", "country"),
)


def firmographics_block(account: Mapping[str, Any]) -> dict[str, Any]:
    """POINT 3 — la firmographie déjà collectée : ``accounts.apollo_enrichment`` (effectif, financement,
    structure), ``raw_analysis.detectedTechStack``, ``githubSignals``, et les filiales du dossier. Rien
    n'est calculé ni deviné — une croissance qu'aucune source ne donne n'est jamais déduite."""
    raw = account.get("raw_analysis") if isinstance(account.get("raw_analysis"), Mapping) else {}
    out: dict[str, Any] = {}

    enrichment = account.get("apollo_enrichment") or pick(raw, "apollo_enrichment")
    if isinstance(enrichment, Mapping):
        firmo: dict[str, Any] = {}
        for wire, name in _FIRMO_SCALARS:
            scalar = _scalar(enrichment.get(wire))
            if scalar not in (None, ""):
                firmo[name] = scalar
        departments = enrichment.get("departmentalHeadCount")
        if isinstance(departments, Mapping):
            counts = {
                str(k): v for k, v in departments.items() if isinstance(v, int) and not isinstance(v, bool) and v > 0
            }
            if counts:
                firmo["headcount_by_department"] = dict(sorted(counts.items(), key=lambda kv: -kv[1])[:8])
        for wire, name in (("technologies", "technologies"), ("keywords", "keywords")):
            values = [t for t in (_clean_text(v, 80) for v in (enrichment.get(wire) or [])[:15]) if t]
            if values:
                firmo[name] = values
        description = _clean_text(enrichment.get("shortDescription"), 400)
        if description:
            firmo["description"] = description
        if firmo:
            out["firmographics"] = firmo

    headcount = _clean_text(pick(raw, "employees"), 120)
    if headcount:
        out["headcount_band"] = headcount

    detected, total = project_items(pick(raw, "detected_tech_stack"), ("name", "category", "usage"), limit=20)
    if detected:
        out["detected_tech_stack"] = detected
        if total > len(detected):
            out["detected_tech_stack_total"] = total

    github = pick(raw, "github_signals")
    if isinstance(github, Mapping):
        signals: dict[str, Any] = {}
        for key in ("org", "public_repos", "active_recent_repos", "last_activity"):
            scalar = _scalar(pick(github, key))
            if scalar not in (None, ""):
                signals[key] = scalar
        languages = [t for t in (_clean_text(v, 40) for v in (pick(github, "top_languages") or [])[:6]) if t]
        if languages:
            signals["top_languages"] = languages
        if signals:
            out["github_signals"] = signals

    subsidiaries, total_subs = project_items(
        pick(raw, "subsidiaries"), ("name", "siren", "activity", "city"), limit=10, text_limit=120
    )
    if subsidiaries:
        out["subsidiaries"] = subsidiaries
        if total_subs > len(subsidiaries):
            out["subsidiaries_total"] = total_subs
    return out


# ── POINT 2 — faits publics du cache commun ───────────────────────────────────────────────────────

_FACT_KEYS: dict[str, tuple[str, ...]] = {
    "jobs": ("title", "location", "date", "published_at", "contract", "company", "technologies"),
    "tenders": ("title", "buyer", "deadline", "date", "amount", "type", "reference", "description"),
    "legal": ("title", "type", "date", "tribunal", "description", "summary"),
    "news": ("title", "date", "published_at", "summary", "snippet", "source"),
}
_FACT_LIMIT = 8


def project_fact_rows(nature: str, rows: list[dict]) -> tuple[list[Any], int]:
    """Les lignes d'UN fait public, bornées. Pour les offres, la ``source`` (le nom d'un fournisseur de
    collecte) n'est jamais relayée."""
    return project_items(rows, _FACT_KEYS.get(nature, ("title", "date")), limit=_FACT_LIMIT, text_limit=200)


# ── POINT 4 — registre (cache 30 j) ───────────────────────────────────────────────────────────────


def registry_block(profile: Mapping[str, Any] | None) -> dict[str, Any]:
    """Le profil de registre déjà rangé dans le cache 30 j (``CompanyProfile.model_dump``) : dirigeants
    (nom + fonction), filiales, sociétés mères, rattachement de groupe. Jamais les bénéficiaires effectifs
    ni une date de naissance. ``None`` / profil vide ⇒ ``{}``."""
    if not isinstance(profile, Mapping):
        return {}
    out: dict[str, Any] = {}
    legal_name = _clean_text(profile.get("legal_name"), 120)
    if legal_name:
        out["legal_name"] = legal_name
    executives: list[dict[str, str]] = []
    for person in (profile.get("c_level") or profile.get("executives") or [])[:10]:
        if not isinstance(person, Mapping):
            continue
        name = " ".join(p for p in (person.get("first_name"), person.get("last_name")) if isinstance(p, str) and p)
        role = _clean_text(person.get("role"), 80)
        if name:
            executives.append({"name": name, **({"role": role} if role else {})})
    if executives:
        out["executives"] = executives
    for key in ("subsidiaries", "parent_companies"):
        names = [
            n
            for n in (_clean_text(c.get("name"), 100) for c in (profile.get(key) or []) if isinstance(c, Mapping))
            if n
        ]
        if names:
            out[key] = names[:10]
            if len(names) > 10:
                out[f"{key}_total"] = len(names)
    affiliation = profile.get("group_affiliation")
    if isinstance(affiliation, Mapping) and affiliation.get("role") in ("groupe", "filiale"):
        head = _clean_text(affiliation.get("head_name"), 100)
        out["group_affiliation"] = {"role": affiliation["role"], **({"head_name": head} if head else {})}
    headcount = _clean_text(profile.get("headcount_label"), 80)
    if headcount:
        out["headcount_label"] = headcount
    updated = _clean_text(profile.get("last_updated"), 40)
    if updated:
        out["registry_updated_at"] = updated
    return out
