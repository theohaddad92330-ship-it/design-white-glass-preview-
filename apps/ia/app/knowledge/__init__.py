"""Curated ESN domain knowledge, harvested from the old ``data/`` RAG seed.

The former ``apps/ia/data/`` folder held rich France-specific ESN intel (sector
playbooks, competitor battlecards, objection scripts) but NOTHING loaded it — it
was orphaned pre-refactor data with a broken (non-recursive, no-embeddings) RAG
ingest. We kept the qualitative, stable knowledge (decision chains, entry
strategies, regulations, how-to-compete, TJM ranges, objection responses) and
DROPPED the stale quantitative tables (company revenue / headcount / budgets),
which the live pipeline already pulls fresh from Pappers / INSEE / Brave and
which violate the "no fictional data" rule.

This module loads the curated JSON and exposes COMPACT, prompt-injectable blocks
so the strategy/plan phases get sector- and competitor-grounded — deterministic,
no extra LLM call. Blocks are intentionally tight to keep the input-token cost of
injection low.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent


@lru_cache(maxsize=1)
def _sectors() -> dict[str, dict]:
    return json.loads((_DIR / "sector_playbooks.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _competitors() -> list[dict]:
    return json.loads((_DIR / "competitor_intel.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _esn_positioning() -> list[dict]:
    """The big-ESN positioning pack (Drive #11): the 7 majors a commercial ESN
    bumps into (Capgemini, Sopra Steria, Atos, Alten, Devoteam, CGI, Accenture),
    each with a crisp entry angle ("X est en place sur … mais faible sur … — on
    entre par …") and the curated sector keys where they're strong."""
    return json.loads((_DIR / "esn_competitor_positioning.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _sector_regulations() -> dict[str, list]:
    """Sector → regulation map (Drive #14): banque→DORA, santé→HDS, +NIS2/RGPD
    cross-sector, each with a compliance/buy-signal sales angle."""
    return json.loads((_DIR / "sector_regulations.json").read_text(encoding="utf-8"))


def sector_playbooks() -> dict[str, dict]:
    """Les 9 playbooks sectoriels curatés, en lecture publique — pour qu'un autre
    module (ex. les chunks « méthode » cités par le copilote) consomme la MÊME
    source que les blocs de prompt, sans dupliquer la méthode ni toucher au cache."""
    return _sectors()


def knowledge_assets_summary() -> dict:
    """Structured inventory of the curated business knowledge (battlecards ESN,
    playbooks sectoriels, bibliothèque d'objections) for the operator dashboard —
    « tout dans le knowledge ». Counts + entry keys so the manager sees what the
    pipeline knows without opening the JSON files."""
    sectors = _sectors()
    return {
        "competitor_intel": {
            "count": len(_competitors()),
            "names": [c.get("name") for c in _competitors()],
            "fields": sorted({k for c in _competitors() for k in c}),
        },
        "sector_playbooks": {
            "count": len(sectors),
            "sectors": list(sectors.keys()),
        },
        "objection_library": {
            "count": len(objection_library()),
            "objections": [o.get("objection") for o in objection_library()],
        },
        "esn_competitor_positioning": {
            "count": len(_esn_positioning()),
            "names": [c.get("name") for c in _esn_positioning()],
        },
        "sector_regulations": {
            "count": len(_sector_regulations()),
            "sectors": list(_sector_regulations().keys()),
        },
    }


def known_esn_names() -> list[str]:
    """Les noms curatés du référentiel, dans l'ordre du fichier — pour un
    consommateur qui doit les PARCOURIR (ex. `site_credit_partners`, #3095)
    plutôt qu'un match exact par nom (`known_esn_intel`). Une seule lecture de
    `_competitors()`, jamais une seconde recopie de la liste."""
    return [c.get("name") for c in _competitors() if c.get("name")]


@lru_cache(maxsize=1)
def esn_reference_names() -> list[str]:
    """#4814.1 — le référentiel NOMINATIF des ESN connues (les 477 noms du produit + `added`), à côté des 15
    fiches concurrents. « Clients finaux » ne retirait que ces 15 : KLANIK (NAF d'ingénierie) restait client."""
    data = json.loads((_DIR / "esn_reference_names.json").read_text(encoding="utf-8"))
    return [str(n) for n in (*data.get("seed", []), *data.get("added", [])) if n]


def known_esn_intel(name: str | None) -> dict | None:
    """Curated battlecard for a known French ESN (case/accent-insensitive exact
    match on the curated name), else ``None``. Feeds the "ESN déjà présentes"
    section: an ESN found in the list is a HIGH-confidence real competitor (not a
    scrape false positive) and carries how-to-compete + weaknesses + TJM."""
    from app.services.text_norm import normalize_name

    key = normalize_name(name)
    if not key:
        return None
    for c in _competitors():
        if normalize_name(c.get("name")) == key:
            return c
    return None


@lru_cache(maxsize=1)
def objection_library() -> list[dict]:
    """The 20 scripted ESN objections (objection / real_meaning / response /
    mirror_question / per-persona variations). Available for a battlecard or
    message-framing injection."""
    return json.loads((_DIR / "objection_library.json").read_text(encoding="utf-8"))


#: Combien d'objections un prompt de rédaction porte par défaut.
#:
#: Six, pas trente-trois. Un prompt qui porte tout le catalogue dépense son
#: attention à le lire, et le modèle finit par répondre à une objection que
#: personne n'a formulée. L'ordre du fichier EST la sélection : la bibliothèque
#: est curée, les plus fréquentes viennent en premier.
_OBJECTION_BLOCK_DEFAULT_LIMIT = 6


def objection_block(*, limit: int = _OBJECTION_BLOCK_DEFAULT_LIMIT, side: str = "client") -> str:
    """Les objections curées les plus fréquentes, prêtes à coller dans un prompt.

    ─────────────────────────────────────────────────────────────────────────
    LE DÉFAUT QUE CE BLOC FERME
    ─────────────────────────────────────────────────────────────────────────
    ``objection_library()`` porte 33 objections travaillées — l'objection, sa
    VRAIE signification, la réponse, la question miroir. Elle n'atteignait qu'un
    prompt : celui du copilote, par les chunks de méthode. Les prompts qui
    ÉCRIVENT redemandaient au modèle de produire les siennes ; ``bellum_strategy``
    en cite même cinq entre parenthèses, cinq objections qui sont DANS la
    bibliothèque, recopiées à la main. Deux listes non reliées, dont une seule
    est maintenue.

    ⚠️ On donne l'objection, sa signification et la question MIROIR — pas la
    réponse rédigée. Un message n'est pas un script de traitement d'objection :
    ce qu'on veut, c'est qu'il n'aille pas se planter dans celle qui vient. Coller
    la réponse ferait écrire des messages qui répondent à une objection que
    l'interlocuteur n'a pas encore faite.

    ``side`` : ``client`` (prospection d'un compte) ou ``consultant``
    (prospection inversée, on recrute). Les mélanger ferait écrire un message de
    recrutement à un DSI. ``limit=0`` ⇒ bloc vide ⇒ prompt byte-identique.
    """
    if limit <= 0:
        return ""
    entries = [o for o in objection_library() if o.get("side") == side][:limit]
    if not entries:
        return ""
    lines = [
        "OBJECTIONS LES PLUS FRÉQUENTES — ce que tu dois ÉVITER DE DÉCLENCHER, pas traiter dans le message :",
    ]
    for entry in entries:
        lines.append(
            f"- « {entry.get('objection', '')} » — ce qu'elle veut vraiment dire : "
            f"{entry.get('real_meaning', '')} · question miroir : {entry.get('mirror_question', '')}"
        )
    return "\n".join(lines)


# Free-text → one of the 9 curated keys, by keyword. First match wins; order
# matters (specific before broad). The pipeline's ``sector`` field is often a raw
# INSEE/NAF activity label ("Autres intermédiations monétaires", "Crédit-bail",
# "Activités des sièges sociaux") that names the LEGAL activity, not the business
# sector — so match against the businessDescription too (see ``sector_playbook_block``)
# and include the NAF wordings here as fallbacks.
_SECTOR_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    (
        "banque",
        (
            "banqu",
            "bancaire",
            "crédit mutuel",
            "credit mutuel",
            "intermédiation",
            "intermediation",
            "monétaire",
            "monetaire",
            "crédit-bail",
            "credit-bail",
            "établissement de crédit",
            "etablissement de credit",
            "moyens de paiement",
            "gestion d'actifs",
        ),
    ),
    ("assurance", ("assur", "mutuelle santé", "prévoyance", "prevoyance", "réassur", "reassur")),
    (
        "sante",
        (
            "santé",
            "sante",
            "pharma",
            "hôpital",
            "hopital",
            "hospital",
            "médic",
            "medic",
            "biotech",
            "clinique",
            "e-santé",
            "dispositif médical",
        ),
    ),
    (
        "energie",
        (
            "énergie",
            "energie",
            "utilities",
            "pétrol",
            "petrol",
            "gaz",
            "électric",
            "electric",
            "nucléaire",
            "nucleaire",
            "renouvelable",
            "eaux",
        ),
    ),
    ("telecom", ("télécom", "telecom", "opérateur télé", "fibre", "réseau mobile", "télécommunication")),
    (
        "transport",
        ("transport", "logistique", "ferroviaire", "aérien", "aerien", "mobilité", "mobilite", "fret", "supply chain"),
    ),
    (
        "industrie",
        (
            "industr",
            "manufactur",
            "usine",
            "automobile",
            "aéronaut",
            "aeronaut",
            "chimie",
            "sidérur",
            "agroaliment",
            "cosmétique",
            "cosmetique",
            "biens de consommation",
            "construction",
            "btp",
        ),
    ),
    (
        "retail",
        (
            "retail",
            "distribution",
            "commerce de détail",
            "commerce de detail",
            "grande distribution",
            "e-commerce",
            "ecommerce",
            "luxe",
            "prêt-à-porter",
        ),
    ),
    (
        "public",
        (
            "secteur public",
            "administration publique",
            "collectivité",
            "collectivite",
            "ministère",
            "ministere",
            "établissement public",
            "etablissement public",
        ),
    ),
]


def match_sector(raw: str | None) -> str | None:
    """Map free text (research ``sector`` + ``businessDescription``) to a curated
    playbook key, or None. Case-insensitive keyword match; specific before broad."""
    t = (raw or "").lower()
    if not t:
        return None
    for key, needles in _SECTOR_KEYWORDS:
        if any(n in t for n in needles):
            return key
    return None


def sector_playbook_block(raw_sector: str | None) -> str:
    """A compact, prompt-injectable sector block (decision chain, entry strategy,
    regulations, dos/donts, budget timing) when the target's sector matches one of
    the 9 curated playbooks; empty string otherwise. Deterministic ESN intel to
    ground the plays — NOT company facts (those come live from the sources)."""
    key = match_sector(raw_sector)
    if not key:
        return ""
    p = _sectors().get(key, {})
    if not p:
        return ""
    lines = [f"## PLAYBOOK SECTEUR — {key.upper()} (intel ESN, à croiser avec les faits du compte)"]
    if p.get("typical_decision_chain"):
        lines.append(f"- Chaîne de décision type : {p['typical_decision_chain']}")
    if p.get("entry_strategy"):
        lines.append(f"- Stratégie d'entrée : {p['entry_strategy']}")
    if p.get("pitch_angle"):
        lines.append(f"- Angle de pitch : {p['pitch_angle']}")
    regs = p.get("regulations") or []
    if regs:
        lines.append(f"- Réglementations clés : {', '.join(regs[:5])}")
    if p.get("budget_cycles"):
        lines.append(f"- Cycles budgétaires : {p['budget_cycles']}")
    dd = p.get("dos_and_donts") or {}
    if dd.get("do"):
        lines.append(f"- À FAIRE : {' ; '.join(dd['do'][:3])}")
    if dd.get("dont"):
        lines.append(f"- À ÉVITER : {' ; '.join(dd['dont'][:3])}")
    return "\n".join(lines)


def competitor_intel_block(names: list[str] | None) -> str:
    """Battlecard block for the known ESN competitors that appear in ``names``
    (matched case-insensitively against the target's detected competitors). Adds
    how-to-compete + TJM range + weaknesses — net-new intel the pipeline doesn't
    generate. Empty when no known competitor matches."""
    if not names:
        return ""
    wanted = {n.lower().strip() for n in names if n}
    hits = [c for c in _competitors() if (c.get("name") or "").lower() in wanted]
    if not hits:
        return ""
    lines = ["## CONCURRENTS ESN EN PLACE — battlecard (comment se différencier)"]
    for c in hits[:4]:
        parts = [f"**{c.get('name')}**"]
        if c.get("how_to_compete"):
            parts.append(f"se différencier : {c['how_to_compete']}")
        weaknesses = c.get("weaknesses") or []
        if weaknesses:
            parts.append(f"faiblesses exploitables : {'; '.join(weaknesses[:2])}")
        if c.get("tjm_range"):
            parts.append(f"TJM indicatif : {c['tjm_range']}")
        lines.append("- " + " — ".join(parts))
    return "\n".join(lines)


def esn_positioning_block(raw_sector: str | None, detected_competitors: list[str] | None = None) -> str:
    """Prompt-injectable positioning angles vs the big ESN competitors (Drive #11).

    ADDITIVE, deterministic (no LLM). Prioritises ESNs already detected at the
    account, then the majors strong in the account's matched sector; falls back to
    the general pack when the sector is unknown — so the plan can always reference
    a competitor and an entry angle ("X est en place sur … mais faible sur … — on
    entre par …"). Complements ``competitor_intel_block`` (which needs a detected
    name) by giving a sector-driven, always-available angle."""
    entries = _esn_positioning()
    key = match_sector(raw_sector)
    detected = {n.lower().strip() for n in (detected_competitors or []) if n}

    def _rank(c: dict) -> tuple:
        name = (c.get("name") or "").lower()
        is_detected = any(name in d or d in name for d in detected) if detected else False
        in_sector = bool(key and key in (c.get("sectors") or []))
        # detected first, then sector-strong, then the rest (stable order otherwise).
        return (0 if is_detected else 1, 0 if in_sector else 1)

    ranked = sorted(entries, key=_rank)
    # When a sector matches, keep detected + sector-strong; else the general pack.
    if key:
        picked = [
            c
            for c in ranked
            if (key in (c.get("sectors") or []))
            or any((c.get("name") or "").lower() in d or d in (c.get("name") or "").lower() for d in detected)
        ]
        if not picked:
            picked = ranked
    else:
        picked = ranked
    picked = picked[:5]
    if not picked:
        return ""
    lines = ["## POSITIONNEMENT vs GRANDES ESN — angles d'entrée (intel concurrentielle)"]
    for c in picked:
        angle = c.get("positioning_angle") or ""
        if angle:
            lines.append(f"- **{c.get('name')}** — {angle}")
    return "\n".join(lines)


def regulatory_awareness_block(raw_sector: str | None) -> str:
    """Prompt-injectable sector → regulation compliance angles (Drive #14).

    ADDITIVE, deterministic. Injects the sector-specific regulations when the
    sector matches (e.g. banque→DORA, santé→HDS) PLUS the cross-sector ones
    (NIS2, RGPD) that apply to almost any account — each framed as a buy-signal /
    entry angle so the plan can propose a compliance play."""
    regs = _sector_regulations()
    key = match_sector(raw_sector)
    picked: list[dict] = []
    if key and regs.get(key):
        picked.extend(regs[key][:2])
    picked.extend((regs.get("_cross_sector") or [])[:2])
    if not picked:
        return ""
    lines = ["## VEILLE RÉGLEMENTAIRE — angles conformité (signal d'achat)"]
    for r in picked:
        seg = [f"**{r.get('regulation')}**"]
        if r.get("scope"):
            seg.append(r["scope"])
        if r.get("status"):
            seg.append(r["status"])
        if r.get("sales_angle"):
            # sales_angle already carries its own framing ("Signal d'achat…",
            # "Angle d'entrée…") — append as-is to avoid a doubled label.
            seg.append(r["sales_angle"])
        lines.append("- " + " | ".join(seg))
    return "\n".join(lines)
