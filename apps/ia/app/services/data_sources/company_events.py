"""Événements d'entreprise OFFICIELS et DATÉS, par SIREN (#3921).

Source unique : l'API Recherche d'entreprises (data.gouv, gratuite, sans clé).

CONTRAT VÉRIFIÉ LE 08/10/2026 par `curl` (SIREN 552032534) — seuls les champs
observés sont utilisés :
- `/search?q=<siren>` → unité légale : `siren`, `nom_complet`, `dirigeants[]`
  (nom, prenoms, qualite… AUCUNE date de nomination), `tranche_effectif_salarie` +
  `annee_tranche_effectif_salarie` (une ANNÉE, pas de date ni d'historique),
  `matching_etablissements` VIDE quand `q` est un SIREN.
- `/search?q=<nom>&limite_matching_etablissements=100` → `matching_etablissements[]`
  avec `siret`, `date_creation` (AAAA-MM-JJ), `etat_administratif` (A/F),
  `est_siege`, `libelle_commune`, `adresse`.
- Plafond documenté : 7 requêtes/s par IP ; on en fait deux par analyse, derrière
  le seau partagé `recherche_entreprises`.

CONSÉQUENCES (contrat vérifié ou rien) :
- `new_establishment` : un établissement OUVERT dont `date_creation` tombe dans la
  fenêtre. Daté par la source, sinon écarté.
- `executive_change` et `headcount_change` ne sont PAS émis : aucune date de
  nomination ni aucun historique d'effectif n'existe dans la réponse, et comparer
  deux instantanés serait inventer. L'API Sirene INSEE (périodes) les porterait,
  mais sa réponse n'a pas pu être observée (clé absente hors production).
- Rattachement par SIREN exclusivement : le nom ne sert que de texte de requête
  pour obtenir la liste des établissements, et la réponse n'est retenue que si son
  `siren` est EXACTEMENT celui demandé (jamais un homonyme).

Frontière c79 : API officielle, user-agent honnête, débit modéré, aucun contournement.
Toute erreur → `[]` + `record_degradation`.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

SOURCE_NAME = "recherche-entreprises"
_BASE = "https://recherche-entreprises.api.gouv.fr/search"
_TIMEOUT_S = 8.0
_USER_AGENT = "bellum-ia/1.0 (+https://bellum-ai.com)"
_MAX_ETABLISSEMENTS = "100"
_TTL_S = provider_cache.TTL_SIGNALS


def _enabled() -> bool:
    return os.environ.get("COMPANY_EVENTS_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")


def _parse_day(raw: object) -> date | None:
    if not isinstance(raw, str) or len(raw) < 10:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


async def _first_result(http: httpx.AsyncClient, params: dict[str, str]) -> dict | None:
    async with throttle("recherche_entreprises"):
        resp = await http.get(_BASE, params=params, headers={"User-Agent": _USER_AGENT})
    if resp.status_code == 429:
        back_off_provider("recherche_entreprises", retry_after_header(resp))
    resp.raise_for_status()
    payload = resp.json()
    results = payload.get("results") if isinstance(payload, dict) else None
    if isinstance(results, list) and results and isinstance(results[0], dict):
        return results[0]
    return None


def _establishment_events(unit: dict, siren: str, since: date, today: date) -> list[dict]:
    out: list[dict] = []
    for e in unit.get("matching_etablissements") or []:
        if not isinstance(e, dict) or e.get("etat_administratif") != "A":
            continue
        day = _parse_day(e.get("date_creation"))
        if day is None or day < since or day > today:
            continue
        siret = str(e.get("siret") or "")
        if not siret.startswith(siren):
            continue
        commune = str(e.get("libelle_commune") or "").strip()
        label = "Nouvel établissement" + (f" — {commune}" if commune else "")
        if e.get("est_siege"):
            label += " (siège)"
        out.append(
            {
                "type": "new_establishment",
                "date": day.isoformat(),
                "label": label,
                "source": SOURCE_NAME,
                "url": f"https://annuaire-entreprises.data.gouv.fr/etablissement/{siret}",
            }
        )
    return out


async def _company_events_uncached(siren: str, since_days: int, client: httpx.AsyncClient | None) -> list[dict]:
    http = client if client is not None else get_shared_client("recherche_entreprises", timeout=_TIMEOUT_S)
    try:
        identity = await _first_result(http, {"q": siren, "page": "1", "per_page": "1"})
        if not identity or str(identity.get("siren") or "") != siren:
            return []
        name = str(identity.get("nom_complet") or identity.get("nom_raison_sociale") or "").strip()
        if not name:
            return []
        listing = await _first_result(
            http,
            {"q": name, "page": "1", "per_page": "1", "limite_matching_etablissements": _MAX_ETABLISSEMENTS},
        )
    except Exception as exc:  # noqa: BLE001 — a free source must never break research
        logger.warning("company_events lookup failed for %r: %s", siren, exc)
        record_degradation(get_correlation_id(), source="company_events", reason=str(exc))
        return []
    # Rattachement par SIREN : un homonyme (autre SIREN) n'est jamais retenu.
    if not listing or str(listing.get("siren") or "") != siren:
        return []
    today = date.today()
    events = _establishment_events(listing, siren, today - timedelta(days=since_days), today)
    events.sort(key=lambda ev: ev["date"], reverse=True)
    return events


#: Lot 762 : « pas de limite » — la fenêtre par défaut couvre tout l'historique du registre.
_ALL_HISTORY_DAYS = 36_500


async def company_events(siren: str, *, since_days: int = _ALL_HISTORY_DAYS, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Événements officiels datés et récents d'un SIREN, du plus récent au plus ancien.

    `[]` sans réseau quand le SIREN est absent/invalide ou le réglage coupé."""
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(s) != 9 or not _enabled():
        return []
    return await provider_cache.cached_json(
        "company_events",
        f"{s}:{since_days}",
        lambda: _company_events_uncached(s, since_days, client),
        ttl=_TTL_S,
    )


# #3921.1 — le libellé LISIBLE de la source (jamais le slug technique, jamais un de NOS fournisseurs).
_SIGNAL_SOURCE_LABEL = "Registre officiel des entreprises (Sirene)"


def merge_company_event_signals(recent_signals: object, events: object) -> list[dict]:
    """Ajoute les événements officiels aux ``recentSignals`` — le seul chemin par lequel
    ils atteignent la veille, Mes cibles et Laura (``companyEvents`` n'avait aucun lecteur).

    Un événement SANS date de registre, SANS lien annuaire ou SANS libellé est écarté :
    jamais une date ni un lien inventés. Un lien déjà porté par un signal n'est pas ajouté
    deux fois. ``source_kind="official"`` nomme le genre de la preuve."""
    out = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    seen = {str(s.get("url") or "") for s in out if s.get("url")}
    for ev in events if isinstance(events, list) else []:
        if not isinstance(ev, dict):
            continue
        label = str(ev.get("label") or "").strip()
        day = str(ev.get("date") or "").strip()
        url = str(ev.get("url") or "").strip()
        if not label or not day or not url.lower().startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "signal": label,
                "source": _SIGNAL_SOURCE_LABEL,
                "type": "expansion",
                "date": day,
                "url": url,
                "source_kind": "official",
            }
        )
    return out
