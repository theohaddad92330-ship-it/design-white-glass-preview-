"""#4282 — le RADAR PAR TECHNOLOGIE (« radar SAP France »), construit UNE fois pour Laura et Découvrir.

Contrat commun : `packages/contracts/src/schemas/technology-radar.ts` (schéma `.strict()` de la
sortie) et sa fixture `fixtures/technology-radar.json`, relue par `tests/test_technology_radar.py`.
« Mêmes comptes, même ordre » (#4282.8/.10) ne repose pas sur deux tris alignés à la main : Laura
(`chat_tools.technology_radar`) et Découvrir (`POST /discover/technology-radar`) appellent CETTE
fonction et rendent sa sortie dans l'ordre où elle arrive.

Les sept blocs de l'issue, dans la sortie :
  1. missions plaçables → `accounts[*].missions` (poche `immediate`) — publieur, lieu, TJM SEULEMENT
     s'il est affiché, date, lien ; client masqué ⇒ la cible est le publieur (#4282.2), deux annonces
     d'un même programme = une ligne, un compte ;
  2. comptes chauds → poche `programs` : programme nommé par la preuve (appel d'offres ouvert) ;
  3. rang 2 → poche `rank_2` : le TITULAIRE d'un marché attribué (#4282.4), jamais un titulaire deviné ;
  4. besoins historiques → `historicalNeeds` (base commune, #4281.1) ;
  5. relais et prescripteurs → `prescribers`, fraîcheur datée ou « à revalider » (#4282.6) ;
  6. empreinte → `footprints`, libellée « profils observés » (#4282.7) — jamais des missions ouvertes ;
  7. trois poches → `accounts` déjà ordonnés (poche, puis rang).

Doctrine : aucune probabilité (un RANG), aucune source nommée dans la sortie, chaque preuve datée
(et liée quand un lien existe), aucune offre de stage, GA-37 (aucun prior sectoriel : seuls des
besoins OBSERVÉS entrent). La collecte publique (offres, appels d'offres, attributions, passe web
fraîche par le moteur déjà branché — aucune clé neuve, décision n°16) est mise en cache 30 jours par
technologie (#4282.11) ; sans clé, chaque collecteur est un no-op strict et le manque est NOMMÉ
dans `notEvaluated`.
"""

from __future__ import annotations

import asyncio
import logging
import re
import unicodedata
from datetime import UTC, date, datetime
from typing import Any

from app.services import provider_cache
from app.services.dataforge_needs import historical_needs
from app.services.intermediation import is_intermediated_employer
from app.services.internship_posting import is_internship_posting
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Miroir EXACT de `RADAR_TECHNOLOGIES` (technology-radar.ts) — vérifié contre la fixture partagée.
RADAR_TECHNOLOGIES: list[dict[str, Any]] = [
    {
        "code": "SAP",
        "label": "SAP",
        "aliases": [
            "sap",
            "s/4hana",
            "s4hana",
            "s/4",
            "sap ecc",
            "abap",
            "sap fiori",
            "sap hana",
            "successfactors",
            "sap ariba",
            "rise with sap",
            "bw/4hana",
        ],
    },
    {"code": "SALESFORCE", "label": "Salesforce", "aliases": ["salesforce", "sfdc", "sales cloud", "service cloud"]},
    {"code": "SERVICENOW", "label": "ServiceNow", "aliases": ["servicenow", "service now"]},
    {"code": "WORKDAY", "label": "Workday", "aliases": ["workday"]},
    {
        "code": "ORACLE_ERP",
        "label": "Oracle ERP",
        "aliases": [
            "oracle ebs",
            "oracle e-business suite",
            "oracle fusion",
            "jd edwards",
            "peoplesoft",
            "netsuite",
            "oracle erp",
        ],
    },
    {
        "code": "DYNAMICS",
        "label": "Microsoft Dynamics",
        "aliases": ["dynamics 365", "microsoft dynamics", "d365", "dynamics ax", "navision", "business central"],
    },
    {"code": "GUIDEWIRE", "label": "Guidewire", "aliases": ["guidewire"]},
    {"code": "MUREX", "label": "Murex", "aliases": ["murex"]},
    {"code": "PEGA", "label": "Pega", "aliases": ["pega", "pegasystems"]},
    {"code": "SNOWFLAKE", "label": "Snowflake", "aliases": ["snowflake"]},
    {"code": "DATABRICKS", "label": "Databricks", "aliases": ["databricks"]},
]
RADAR_POCKETS = ("immediate", "programs", "rank_2")

_CACHE_NAMESPACE = "technology_radar"
_FOOTPRINT_LIMIT = 15
_ACCOUNT_LIMIT = 30


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"\s+", " ", text).strip()


def _contains_word(haystack: str, needle: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?![a-z0-9])", haystack) is not None


def detect_radar_technologies(text: object) -> list[str]:
    folded = _fold(text)
    if not folded:
        return []
    return [t["code"] for t in RADAR_TECHNOLOGIES if any(_contains_word(folded, a) for a in t["aliases"])]


def resolve_radar_technology(value: object) -> dict | None:
    raw = re.sub(r"\s+", " ", str(value or "")).strip()
    if not raw:
        return None
    codes = detect_radar_technologies(raw)
    closed = next((t for t in RADAR_TECHNOLOGIES if codes and t["code"] == codes[0]), None)
    if closed:
        return {"kind": "closed", "code": closed["code"], "label": closed["label"]}
    return {"kind": "free", "code": None, "label": raw}


def _mentions(ref: dict, text: object) -> bool:
    if ref.get("code"):
        return ref["code"] in detect_radar_technologies(text)
    return _contains_word(_fold(text), _fold(ref.get("label")))


#: #4285.3 — « SAP » est aussi « services à la personne » : à côté d'un métier du soin ou du domicile, le mot n'est
#: pas la technologie. Seuls les sigles ambigus de la liste fermée y figurent (les autres alias sont univoques).
_AMBIGUOUS_ACRONYM_TRADES: dict[str, re.Pattern[str]] = {
    "SAP": re.compile(
        r"\b(?:infirmier|infirmiere|aide soignant\w*|auxiliaire|assistant\w* de vie|aide a domicile|aide menager\w*|"
        r"employe\w* de maison|garde d enfants?|menage|services? a la personne|accompagnant\w*|ehpad)\b"
    )
}


def _names_technology(ref: dict, title: str, publisher: str, city: object) -> bool:
    """#4285.3 — la technologie est-elle le MÉTIER de l'offre ? Réutilise la garde de la collecte par compétence
    (``offer_trade_text``, #4469 : ni le lieu ni la raison sociale de l'employeur ne disent un métier) au lieu d'en
    écrire une seconde (GA-26) ; l'intitulé passe côté « description », seul champ d'où elle ôte l'employeur."""
    from app.services.discover_skill_offers import offer_trade_text

    trade = offer_trade_text({"title": "", "description": title, "employer": publisher, "city": city})
    if not _mentions(ref, trade):
        return False
    noise = _AMBIGUOUS_ACRONYM_TRADES.get(ref.get("code") or "")
    return not (noise and noise.search(re.sub(r"[^a-z0-9]+", " ", trade)))


_TITLE_NOISE = re.compile(r"\((h/f|f/h|h/f/x|f/h/x)\)|\b(h/f|f/h|senior|junior|confirme|expert)\b")
_TJM = re.compile(r"(\d{3,4})\s*(?:€|eur(?:os?)?)\s*(?:ht\s*)?(?:/|par)\s*j", re.IGNORECASE)


def _program_key(title: str) -> str:
    return re.sub(r"[^a-z0-9/]+", " ", _TITLE_NOISE.sub(" ", _fold(title))).strip()


def _account_key(name: str) -> str:
    folded = re.sub(r"\b(sas|sa|sarl|sasu|group|groupe)\b", " ", _fold(name))
    return re.sub(r"[^a-z0-9]+", " ", folded).strip()


def _iso(value: object) -> str | None:
    raw = str(value or "").strip()[:10]
    try:
        return date.fromisoformat(raw).isoformat()
    except ValueError:
        return None


def _http(url: object) -> str | None:
    text = str(url or "").strip()
    return text if text.startswith(("http://", "https://")) else None


def _new_account(name: str) -> dict:
    return {
        "accountName": name,
        "siren": None,
        "pocket": "programs",
        "rank": 1,
        "program": None,
        "targetIsPublisher": False,
        "awardedTender": None,
        "missions": [],
        "proofs": [],
        "profiles": [],
        "toVerify": None,
    }


def build_technology_radar(
    ref: dict,
    *,
    offers: list[dict],
    tenders: list[dict],
    awards: list[dict],
    needs: list[dict],
    footprints: list[dict],
    not_evaluated: list[str],
    today: date,
) -> dict:
    """Pur : les entrées déjà collectées → la sortie du contrat, ordonnée."""
    accounts: dict[str, dict] = {}
    program_seen: dict[str, set[str]] = {}
    set_aside: set[tuple[str, str]] = set()

    def account(name: str) -> dict:
        key = _account_key(name)
        if key not in accounts:
            accounts[key] = _new_account(name.strip())
            program_seen[key] = set()
        return accounts[key]

    # 1. Offres : la cible est TOUJOURS le publieur nommé par l'annonce — jamais un client deviné.
    for row in sorted(offers, key=lambda r: str((r.get("signal") or {}).get("date") or ""), reverse=True):
        signal = row.get("signal") or {}
        publisher = str(row.get("name") or "").strip()
        title = re.sub(r"^Recrutement\s*[—-]\s*", "", str(signal.get("label") or "")).strip()
        published, url = _iso(signal.get("date")), _http(signal.get("url"))
        if not (publisher and title and published and url):
            continue  # un fait sans date ou sans lien n'entre pas
        if is_internship_posting(title) or not _mentions(ref, title):
            continue
        # #4285.3 — le mot est dans l'intitulé, mais est-ce la technologie ? Sinon écartée, et comptée (dite plus bas).
        if not _names_technology(ref, title, publisher, row.get("city")):
            set_aside.add((_account_key(publisher), _program_key(title)))
            continue
        acc = account(publisher)
        acc["siren"] = acc["siren"] or row.get("siren")
        acc["targetIsPublisher"] = acc["targetIsPublisher"] or is_intermediated_employer(name=publisher)
        acc["pocket"] = "immediate"
        key = _program_key(title)
        if key in program_seen[_account_key(publisher)]:
            continue  # même programme, même publieur : une seule ligne
        program_seen[_account_key(publisher)].add(key)
        tjm_match = _TJM.search(str(signal.get("detail") or "")) or _TJM.search(title)
        acc["missions"].append(
            {
                "title": title,
                "publisher": publisher,
                "location": row.get("city"),
                "tjmEur": float(tjm_match.group(1)) if tjm_match else None,
                "publishedAt": published,
                "url": url,
            }
        )
        acc["proofs"].append({"kind": "offer", "label": title, "date": published, "url": url})
        if title not in acc["profiles"]:
            acc["profiles"].append(title)

    # 2. Appels d'offres ouverts : l'acheteur, programme nommé par l'objet.
    for row in tenders:
        buyer, title, published = (
            str(row.get("buyer") or "").strip(),
            str(row.get("title") or "").strip(),
            _iso(row.get("publishedDate")),
        )
        if not (buyer and title and published) or not _mentions(ref, title):
            continue
        acc = account(buyer)
        acc["program"] = acc["program"] or title
        acc["proofs"].append({"kind": "tender_open", "label": title, "date": published, "url": _http(row.get("url"))})

    # 3. Marchés attribués : le TITULAIRE nommé devient la cible de rang 2 — sans titulaire, rien.
    for row in awards:
        winner, title, notified = (
            str(row.get("winner") or "").strip(),
            str(row.get("title") or "").strip(),
            _iso(row.get("notifiedDate")),
        )
        if not (winner and title and notified) or not _mentions(ref, title):
            continue
        acc = account(winner)
        buyer = str(row.get("buyer") or "").strip()
        acc["awardedTender"] = acc["awardedTender"] or (f"{title} ({buyer})" if buyer else title)
        if acc["pocket"] != "immediate" and not acc["program"]:
            acc["pocket"] = "rank_2"
        acc["proofs"].append({"kind": "tender_awarded", "label": title, "date": notified, "url": _http(row.get("url"))})

    def order(acc: dict) -> tuple:
        latest = max((p["date"] for p in acc["proofs"]), default="")
        return (RADAR_POCKETS.index(acc["pocket"]), -len(acc["proofs"]), _neg_date(latest), _fold(acc["accountName"]))

    ranked = sorted((a for a in accounts.values() if a["proofs"]), key=order)[:_ACCOUNT_LIMIT]
    for index, acc in enumerate(ranked, start=1):
        acc["rank"] = index
        acc["proofs"].sort(key=lambda p: p["date"], reverse=True)

    historical = [
        {
            "accountName": n["company"],
            "title": n["title"],
            "status": n.get("status") or "INCONNU",
            "date": n.get("date"),
            "tjmEur": n.get("tjm_eur"),
            "prescriberRole": (n.get("prescriber") or {}).get("role"),
        }
        for n in needs
        if n.get("company") and n.get("title")
    ]
    prescribers: list[dict] = []
    seen_prescribers: set[tuple[str, str]] = set()
    for n in needs:
        p = n.get("prescriber")
        if not (p and n.get("company")):
            continue
        key = (_fold(n["company"]), _fold(p.get("name") or p.get("role")))
        if key in seen_prescribers:
            continue
        seen_prescribers.add(key)
        prescribers.append(
            {"accountName": n["company"], "name": p.get("name"), "role": p.get("role"), "freshness": p["freshness"]}
        )

    prints = [
        {"accountName": str(f["company_key"]), "observedProfiles": int(f["persons"]), "label": "profils observés"}
        for f in sorted(footprints, key=lambda f: -int(f.get("persons") or 0))
        if f.get("company_key") and int(f.get("persons") or 0) > 0
    ][:_FOOTPRINT_LIMIT]

    if set_aside:
        # #4285.3 — le radar DIT ce qu'il a écarté (rien d'écarté : aucune ligne).
        count = len(set_aside)
        not_evaluated = [
            *not_evaluated,
            f"{count} {'offre écartée' if count == 1 else 'offres écartées'} : "
            f"« {ref['label']} » y est un mot de l'intitulé ou de l'employeur, pas la technologie",
        ]

    return {
        "technology": ref,
        "generatedAt": datetime.combine(today, datetime.min.time(), tzinfo=UTC).isoformat(),
        "accounts": ranked,
        "historicalNeeds": historical,
        "prescribers": prescribers,
        "footprints": prints,
        "notEvaluated": list(not_evaluated),
    }


def _neg_date(iso: str) -> tuple:
    """Tri « plus récent d'abord » sur une date ISO, sans la convertir."""
    return tuple(-ord(ch) for ch in iso)


# ── Collecte (I/O) ────────────────────────────────────────────────────────────


async def _collect_public(ref: dict) -> dict:
    """Offres + passe web + appels d'offres + attributions. Chaque collecteur en panne ou sans clé est
    NOMMÉ (sans nommer la source) dans `not_evaluated` ; `failed` quand AUCUN n'a répondu."""
    from app.services.data_sources import decp, france_travail, job_search, public_tenders

    label = ref["label"]
    collectors = {
        "offres d'emploi publiées": france_travail.list_hiring_companies(keywords=[label], since_days=30, limit=25),
        "passe web fraîche": job_search.list_hiring_companies_search(
            keywords=[label, "freelance"], since_days=30, limit=25
        ),
        "appels d'offres ouverts": public_tenders.public_tenders(label),
        "marchés attribués": decp.awarded_it_contracts(label),
    }
    results = await asyncio.gather(*collectors.values(), return_exceptions=True)
    out: dict[str, Any] = {"offers": [], "tenders": [], "awards": [], "not_evaluated": []}
    answered = 0
    for (name, _), result in zip(collectors.items(), results, strict=True):
        if isinstance(result, BaseException):
            logger.warning("Radar techno : collecteur « %s » indisponible : %s", name, result)
            out["not_evaluated"].append(f"{name} (indisponible)")
            continue
        answered += 1
        rows = [r for r in (result or []) if isinstance(r, dict)]
        if name == "appels d'offres ouverts":
            out["tenders"].extend(rows)
        elif name == "marchés attribués":
            out["awards"].extend(rows)
        else:
            out["offers"].extend(rows)
    out["failed"] = answered == 0
    return out


async def _read_footprints(ref: dict) -> list[dict]:
    """#4282.7 — l'empreinte observée (parcours passés citant la technologie)."""
    aliases = (
        next((t["aliases"] for t in RADAR_TECHNOLOGIES if t["code"] == ref.get("code")), None) or [_fold(ref["label"])]
    )[:10]
    try:
        res = await (
            get_supabase()
            .table("market_company_stack")
            .select("company_key, techno, persons")
            .in_("techno", aliases)
            .order("persons", ascending=False)
            .limit(_FOOTPRINT_LIMIT)
            .aexecute()
        )
    except Exception as exc:  # noqa: BLE001 — une empreinte indisponible ne casse pas le radar
        logger.warning("Radar techno : empreinte indisponible : %s", exc)
        return []
    return [r for r in (res.data or []) if isinstance(r, dict)]


async def technology_radar(technology: object, *, today: date | None = None) -> dict | None:
    """Le radar d'une technologie — `None` pour une saisie vide (rien à chercher)."""
    ref = resolve_radar_technology(technology)
    if ref is None:
        return None
    cache_key = ref["code"] or f"free:{_fold(ref['label'])}"
    collected = await provider_cache.get_json(_CACHE_NAMESPACE, cache_key)
    if not isinstance(collected, dict):
        collected = await _collect_public(ref)
        if not collected.get("failed"):
            await provider_cache.set_json(_CACHE_NAMESPACE, cache_key, collected, provider_cache.TTL_SIGNALS)
    not_evaluated = list(collected.get("not_evaluated") or [])
    if ref["code"]:
        needs = await historical_needs(technology_code=ref["code"], today=today)
    else:
        needs = []
        not_evaluated.append("besoins historiques (technologie hors de la liste du radar)")
    footprints = await _read_footprints(ref)
    return build_technology_radar(
        ref,
        offers=list(collected.get("offers") or []),
        tenders=list(collected.get("tenders") or []),
        awards=list(collected.get("awards") or []),
        needs=needs,
        footprints=footprints,
        not_evaluated=not_evaluated,
        today=today or date.today(),
    )


__all__ = [
    "RADAR_POCKETS",
    "RADAR_TECHNOLOGIES",
    "build_technology_radar",
    "detect_radar_technologies",
    "resolve_radar_technology",
    "technology_radar",
]
