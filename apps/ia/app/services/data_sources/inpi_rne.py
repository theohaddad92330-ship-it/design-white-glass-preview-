"""INPI — Registre National des Entreprises (RNE) API.

Free (account on data.inpi.fr). Adds what the other registries don't expose:
the **bénéficiaires effectifs** (ultimate beneficial owners) of a SIREN — useful
to understand who really controls a target. Login (username/password → token),
then fetch the company. No-op (empty) without credentials; degrades on any error.

The RNE company payload is deeply + variably nested, so the beneficial-owner
extraction walks the structure defensively rather than assuming a fixed path.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_BASE = "https://registre-national-entreprises.inpi.fr/api"
_TIMEOUT_S = 12.0
# #3921 — SANS User-Agent le RNE répond 403 (vérifié par appel réel le 16/10/2026) :
# les bénéficiaires effectifs n'étaient jamais collectés, en silence.
_USER_AGENT = "bellum-ia/1.0 (+https://bellum-ai.com)"
_BASE_HEADERS = {"User-Agent": _USER_AGENT, "Accept": "application/json"}


def _creds() -> tuple[str, str]:
    return os.environ.get("INPI_USERNAME", ""), os.environ.get("INPI_PASSWORD", "")


def _walk_beneficiaires(node: Any, out: list[dict], depth: int = 0) -> None:
    """Defensively collect beneficial-owner entries anywhere in the RNE tree."""
    if depth > 8 or len(out) >= 25:
        return
    if isinstance(node, dict):
        if "beneficiairesEffectifs" in node and isinstance(node["beneficiairesEffectifs"], list):
            for b in node["beneficiairesEffectifs"]:
                if not isinstance(b, dict):
                    continue
                ident = (b.get("beneficiaire") or {}).get("descriptionPersonne") or {}
                name = " ".join(str(x) for x in (ident.get("prenoms") or [None])[:1] + [ident.get("nom")] if x).strip()
                modalites = b.get("modaliteControle") or {}
                out.append(
                    {
                        "name": name or "Bénéficiaire",
                        "detentionPart": modalites.get("detentionPartTotale") or modalites.get("pourcentageParts"),
                        "detentionVote": modalites.get("detentionVoteTotale"),
                    }
                )
        for v in node.values():
            _walk_beneficiaires(v, out, depth + 1)
    elif isinstance(node, list):
        for v in node:
            _walk_beneficiaires(v, out, depth + 1)


async def _token(http: httpx.AsyncClient, username: str, password: str) -> str | None:
    try:
        # ``inpi: 30 rpm / 3 concurrent`` était déclaré et orphelin. Le login est
        # rejoué à chaque lookup : il consomme le quota comme le reste.
        async with throttle("inpi"):
            resp = await http.post(
                f"{_BASE}/sso/login",
                json={"username": username, "password": password},
                headers=_BASE_HEADERS,
            )
        if resp.status_code == 429:
            back_off_provider("inpi", retry_after_header(resp))
        resp.raise_for_status()
        return str(resp.json().get("token") or "") or None
    except Exception as exc:  # noqa: BLE001
        logger.warning("INPI login failed: %s", exc)
        record_degradation(get_correlation_id(), source="inpi", reason=f"login: {exc}")
        return None


async def beneficial_owners(siren: str, *, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Ultimate beneficial owners (bénéficiaires effectifs) of a SIREN from the
    RNE. Empty without credentials or on any error."""
    username, password = _creds()
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if not username or not password or len(s) != 9:
        return []

    http = client if client is not None else get_shared_client("inpi_rne", timeout=_TIMEOUT_S)
    try:
        token = await _token(http, username, password)
        if not token:
            return []
        async with throttle("inpi"):
            resp = await http.get(
                f"{_BASE}/companies/{s}", headers={**_BASE_HEADERS, "Authorization": f"Bearer {token}"}
            )
        if resp.status_code == 429:
            back_off_provider("inpi", retry_after_header(resp))
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a source must never break research
        logger.warning("INPI company fetch failed for %r: %s", s, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="inpi", reason=str(exc))
        return []

    out: list[dict] = []
    _walk_beneficiaires(payload, out)
    return out


# ─── #3921.9 — les événements du registre (RNE) ───────────────────────────────
#
# CONTRAT VÉRIFIÉ le 16/10/2026 par appel réel (Thales). Seuls les champs observés sont lus :
# ``formality.historique[]`` (codeEvenement, dateEffet?, dateIntegration, numeroLiasse),
# ``personneMorale.autresEtablissements[]`` (descriptionEtablissement.siret / dateEffetFermeture,
# adresse.commune, activites[].dateDebut), ``composition.pouvoirs[]`` (actif, representantId,
# individu.descriptionPersonne.nom / prenoms / role).
#
# MINIMISATION (doctrine) : du dirigeant on garde nom, prénoms, rôle, date d'effet. La date de
# naissance et l'adresse du domicile ne sont JAMAIS lues, donc jamais stockées ni journalisées ;
# la charge brute du registre n'est pas mise en cache (seuls les événements, minimisés, le sont).
# ``nombreRepresentantsActifs`` n'est pas un effectif : aucun ``headcount_change`` n'est émis.

_EXECUTIVE_CODE = "35M"
_MAX_EVENTS = 50


def _day(raw: object) -> date | None:
    if not isinstance(raw, str) or len(raw) < 10:
        return None
    try:
        return datetime.strptime(raw[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _in_window(day: date | None, since: date, today: date) -> bool:
    return day is not None and since <= day <= today


def _person_label(individu: object) -> tuple[str, str] | None:
    """(nom complet, rôle) — rien d'autre de la personne n'est lu."""
    desc = individu.get("descriptionPersonne") if isinstance(individu, dict) else None
    if not isinstance(desc, dict):
        return None
    prenoms = " ".join(str(p).strip() for p in (desc.get("prenoms") or [])[:3] if str(p).strip())
    nom = str(desc.get("nom") or "").strip()
    full = " ".join(x for x in (prenoms, nom) if x)
    if not full:
        return None
    role = desc.get("role")
    return full, role.strip() if isinstance(role, str) else ""


def _etab_url(siret: str) -> str:
    return f"https://annuaire-entreprises.data.gouv.fr/etablissement/{siret}"


def events_from_payload(payload: object, siren: str, *, today: date, since_days: int) -> list[dict]:
    """Événements datés du registre pour ``siren``, du plus récent au plus ancien.

    Un événement sans date lisible, futur, hors fenêtre ou d'un autre SIREN est écarté."""
    if not isinstance(payload, dict) or str(payload.get("siren") or "") != siren:
        return []
    formality = payload.get("formality") if isinstance(payload.get("formality"), dict) else {}
    morale = (
        ((formality.get("content") or {}).get("personneMorale")) if isinstance(formality.get("content"), dict) else None
    )
    morale = morale if isinstance(morale, dict) else {}
    since = today - timedelta(days=since_days)
    annuaire_dirigeants = f"https://annuaire-entreprises.data.gouv.fr/dirigeants/{siren}"
    events: list[dict] = []

    # Dirigeants : un pouvoir daté (``dateEffet``) dit QUI ; un 35M seul dit QUE ça a changé.
    named_days: set[str] = set()
    composition = morale.get("composition") if isinstance(morale.get("composition"), dict) else {}
    for pouvoir in composition.get("pouvoirs") or []:
        if not isinstance(pouvoir, dict):
            continue
        day = _day(pouvoir.get("dateEffet"))
        person = _person_label(pouvoir.get("individu"))
        if not _in_window(day, since, today) or person is None:
            continue
        name, role = person
        active = pouvoir.get("actif") is True
        label = ("Nomination" if active else "Fin de fonction") + f" — {name}" + (f" ({role})" if role else "")
        iso = day.isoformat()  # type: ignore[union-attr]
        named_days.add(iso)
        events.append(
            {
                "ref": f"pouvoir:{pouvoir.get('representantId') or name}:{'a' if active else 'i'}:{iso}",
                "kind": "executive_change",
                "date": iso,
                "label": label,
                "url": f"{annuaire_dirigeants}#evt-{iso}",
            }
        )
    for entry in formality.get("historique") or []:
        if not isinstance(entry, dict) or entry.get("codeEvenement") != _EXECUTIVE_CODE:
            continue
        day = _day(entry.get("dateEffet")) or _day(entry.get("dateIntegration"))
        if not _in_window(day, since, today) or day.isoformat() in named_days:  # type: ignore[union-attr]
            continue
        iso = day.isoformat()  # type: ignore[union-attr]
        events.append(
            {
                "ref": f"hist:{entry.get('numeroLiasse') or iso}:{_EXECUTIVE_CODE}",
                "kind": "executive_change",
                "date": iso,
                "label": "Changement de dirigeant",
                "url": f"{annuaire_dirigeants}#evt-{iso}",
            }
        )

    # Établissements : ouverture = plus ancienne date de début d'activité ; fermeture = dateEffetFermeture.
    for etab in morale.get("autresEtablissements") or []:
        if not isinstance(etab, dict):
            continue
        desc = etab.get("descriptionEtablissement") if isinstance(etab.get("descriptionEtablissement"), dict) else {}
        siret = str(desc.get("siret") or "")
        if not (len(siret) == 14 and siret.startswith(siren)):
            continue
        commune = (
            str((etab.get("adresse") or {}).get("commune") or "").strip()
            if isinstance(etab.get("adresse"), dict)
            else ""
        )
        suffix = f" — {commune}" if commune else ""
        starts = [
            d for d in (_day(a.get("dateDebut")) for a in etab.get("activites") or [] if isinstance(a, dict)) if d
        ]
        opened = min(starts) if starts else None
        closed = _day(desc.get("dateEffetFermeture"))
        if _in_window(opened, since, today) and not closed:
            events.append(
                {
                    "ref": siret,  # même identité que la lecture Sirene : un site n'est qu'un fait
                    "kind": "new_establishment",
                    "date": opened.isoformat(),  # type: ignore[union-attr]
                    "label": f"Nouvel établissement{suffix}",
                    "url": _etab_url(siret),
                }
            )
        if _in_window(closed, since, today):
            events.append(
                {
                    "ref": f"closure:{siret}",
                    "kind": "establishment_closure",
                    "date": closed.isoformat(),  # type: ignore[union-attr]
                    "label": f"Fermeture d'établissement{suffix}",
                    "url": f"{_etab_url(siret)}#fermeture-{closed.isoformat()}",  # type: ignore[union-attr]
                }
            )
    events.sort(key=lambda ev: ev["date"], reverse=True)
    return events[:_MAX_EVENTS]


async def _company_payload(siren: str, client: httpx.AsyncClient | None = None) -> dict:
    """La fiche RNE brute. LÈVE sur toute panne : un événement ne se déduit jamais d'un vide qui cache une erreur."""
    username, password = _creds()
    http = client if client is not None else get_shared_client("inpi_rne", timeout=_TIMEOUT_S)
    token = await _token(http, username, password)
    if not token:
        raise RuntimeError("INPI RNE login failed")
    async with throttle("inpi"):
        resp = await http.get(
            f"{_BASE}/companies/{siren}", headers={**_BASE_HEADERS, "Authorization": f"Bearer {token}"}
        )
    if resp.status_code == 429:
        back_off_provider("inpi", retry_after_header(resp))
    resp.raise_for_status()
    payload = resp.json()
    if not isinstance(payload, dict):
        raise RuntimeError("INPI RNE payload is not an object")
    return payload


def rne_configured() -> bool:
    username, password = _creds()
    return bool(username and password)


async def rne_events(siren: str, *, since_days: int = 730, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Événements datés du registre pour un SIREN. ``[]`` sans identifiants (zéro appel) ;
    LÈVE sur une panne (l'appelant la nomme). Cache commun 30 j, clé = SIREN."""
    s = "".join(ch for ch in str(siren or "") if ch.isdigit())
    if len(s) != 9 or not rne_configured():
        return []

    async def _fetch() -> list[dict]:
        payload = await _company_payload(s, client)
        return events_from_payload(payload, s, today=date.today(), since_days=since_days)

    return await provider_cache.cached_json("inpi_rne_events", s, _fetch, ttl=provider_cache.TTL_FIRMO)
