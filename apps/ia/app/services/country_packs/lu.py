"""Country pack **Luxembourg (LU)** — RCS identity resolved through the **GLEIF** public
API, on its DOCUMENTED contract (#4016 L13a, décision Louis 11/10/2026).

⚠️ RENVERSEMENT DATÉ (11/10/2026) — ce pack était ``beta`` / DÉGRADÉ (zéro appel
réseau) faute d'endpoint libre « nom → RCS ». La décision de Louis active les
registres sur leur contrat DOCUMENTÉ, sans vérification sur instance réelle. La
source retenue n'est PAS l'API payante du LBR, c'est l'API publique de GLEIF
(``api.gleif.org/api/v1``, documentée, sans clé, données CC0) : chaque entité
luxembourgeoise titulaire d'un LEI y porte son numéro RCS (``registeredAs``) VALIDÉ
par l'autorité d'enregistrement ``RA000432`` (RCS Luxembourg). Ce qui reste vrai :

* la couverture est celle des titulaires d'un LEI (banques, assurances, fonds,
  sociétés opérationnelles de taille moyenne et plus) — une société sans LEI ne
  résout RIEN, et c'est dit (``None``), jamais deviné ;
* le contrat est ``documented`` (``contract`` sur la métadonnée ET sur l'entité) :
  l'écran pose un badge « contrat documenté, non vérifié », et rien de facturé ne
  repose dessus tant que la recette sur instance réelle n'est pas faite ;
* les offres d'emploi et les annonces RESA ne sont PAS portées par cette source :
  ``jobs``/``legalSignals`` restent vides plutôt qu'inventés.

Historique, conservé (texte d'avant le 11/10/2026) — mode **degraded (beta)** :

Registry map (VERIFIED 2026-07-16):

* Registry : **RCS** (Registre de Commerce et des Sociétés), operated by **LBR**
  (Luxembourg Business Registers) — ``lbr.lu``.
* Identifier pivot : the **numéro RCS** ``B<digits>`` (e.g. ``B19669``) + VAT
  ``LU########``. ``B`` is the prefix for commercial companies (the analogue of the
  French SIREN).
* Free on-screen search : ``lbr.lu`` lets anyone search by name / RCS / VAT and
  download filed documents (uncertified) for free — **but the search front-end is a
  JavaScript single-page app** (``/mjrcs-web-front/``), not a server-rendered form
  like the Belgian KBO portal, so it is NOT deterministically scrapeable.
* No free structured per-company API : LBR does **not** publish a free high-volume
  company-search API. Automated/API access to the RCS is **restricted and paid**
  (reported ~5 000 €/yr from Jan 2026, on request + volume declaration — secondary
  sources, to confirm on the official LBR tariff grid). See ``COMPLIANCE.md`` and
  ``agent_docs/international/rapport-initial.md``.
* Open data : the ``data.public.lu`` "Extrait du RCSL" dataset is a **one-off dump of
  PDF extracts (most recent ~2019)** — not a maintained structured feed.
* Legal notices : **RESA** (Recueil électronique des sociétés et associations), the
  official gazette run by LBR — the BODACC analogue, consultable on screen only.
* Beneficial owners : the **RBE** is **closed to the general public** (CJEU ruling;
  restricted to authorities / AML professionals / proven legitimate interest since
  Feb 2025) — do not count on it for the shareholding org chart.

**Consequence (BEFORE 11/10/2026) — this pack was ``beta`` / DEGRADED:** there is
NO free, structured, verifiable endpoint that resolves a company **name → RCS
number**. So ``registry_lookup`` and ``collect_signals`` make **zero network calls**
and return nothing (``None`` / empty) — **never a fabricated company** (CLAUDE.md
"JAMAIS de données fictives"). The pack's real, additive value is its **prompt
vocabulary + entity ontology** (RCS identifier, SOPARFI holding-vs-operating
filtering, trilingual FR/DE/LU messaging, RESA/RBE caveats), injected into the
research prompt exactly like the CH/BE packs. Wiring live resolution requires either
the paid LBR RCS API or a future free official endpoint — it then slots in behind the
same interface without touching the FR path.

No-op / graceful: the pack only ever runs when Luxembourg is the targeted country
(enforced by the registry — zero-flag policy, no env var). Even active, it makes
no network call in this beta mode.

RGPD: Luxembourg is an EU member — **full GDPR**, no cross-border transfer barrier.
The RCS/RBE access restriction is an *access* constraint, not a data-protection one.
Only public commercial-register identity data would be read once resolution is wired.
"""

from __future__ import annotations

import logging
import re

import httpx

from app.services.country_packs.base import (
    CountryPack,
    CountrySignals,
    RegistryEntity,
    empty_signals,
    note_registry_failure,
)
from app.services.rate_limiter import throttle

logger = logging.getLogger(__name__)

# Luxembourg RCS number: "B" + digits, e.g. B19669 / "B 19669". "B" = commercial
# company (the only entity type we target). Detected inside a free-text query with a
# left boundary so it never fires on a stray capital B in a company name.
_RCS_RE = re.compile(r"(?<![A-Za-z0-9])B\s?\d{1,7}(?![0-9])", re.IGNORECASE)


#: GLEIF public API — documented at https://www.gleif.org/en/lei-data/gleif-api (no key,
#: CC0 data, 60 requests/minute per user). JSON:API: ``filter[...]`` + ``page[size]``.
_GLEIF_RECORDS = "https://api.gleif.org/api/v1/lei-records"
#: The GLEIF registration-authority code of the Luxembourg RCS. Only a record whose
#: ``registeredAt.id`` is this code carries a REAL RCS number in ``registeredAs``.
_RA_LU_RCS = "RA000432"
_GLEIF_DETAIL = "https://search.gleif.org/#/record/"
_TIMEOUT_S = 10.0
_PAGE_SIZE = 10
#: ELF codes (ISO 20275) observed on Luxembourg records — only the two forms the
#: pack has SEEN on real data; any other code leaves ``legalForm`` absent rather
#: than guessed.
_ELF_LU = {"5GGB": "SA", "DVXS": "S.à r.l."}


def _is_rcs_number(value: str) -> bool:
    """True when ``value`` is (only) an RCS number ``B<1-7 digits>`` (space-tolerant)."""
    return re.fullmatch(r"B\s?\d{1,7}", (value or "").strip(), re.IGNORECASE) is not None


def _normalize_rcs(value: str) -> str:
    """Canonical RCS ``B19669`` from any spacing/case (``"B 19669"`` → ``"B19669"``).

    Only meaningful for an already-RCS-shaped value (guard with :func:`_is_rcs_number`);
    a plain name yields ``""`` (its digits are dropped, so no bogus ``B…`` is minted).
    """
    digits = re.sub(r"\D", "", value or "")
    return f"B{digits}" if digits and _is_rcs_number(value) else ""


def _format_rcs(value: str) -> str:
    """Display form of an RCS number — identical to the canonical :func:`_normalize_rcs`."""
    return _normalize_rcs(value)


class LuxembourgPack(CountryPack):
    """Luxembourg — RCS/LBR ontology + vocabulary; registry resolution through the
    GLEIF public API on its DOCUMENTED contract (#4016 L13a). See module docstring.
    """

    code = "LU"
    identifier_label = "numéro RCS"
    country_name = "Luxembourg"
    # Trilingual jurisdiction: FR (administration), DE, LU (luxembourgeois); EN dominates
    # in the finance/fund industry. FR is the safe business default for messaging.
    languages = ("fr", "de", "lb")
    registry_name = "RCS (Registre de Commerce et des Sociétés, LBR)"
    #: #4016 L13a — sorti de ``beta`` le 11/10/2026 (décision Louis).
    status = "live"
    #: …sur un contrat DOCUMENTÉ, pas encore vérifié sur instance réelle.
    contract = "documented"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "numéro RCS (B<digits>, ex. B19669) + n° TVA LU########",
            "legalForms": {
                "SA": "société anonyme",
                "S.à r.l. / Sàrl": "société à responsabilité limitée",
                "SCA": "société en commandite par actions",
                "SCS / SCSp": "société en commandite (simple / spéciale), fréquente en fonds",
                "SOPARFI": (
                    "société de participations financières — holding patrimoniale/"
                    "financière : très fréquente au LU, souvent une coquille SANS "
                    "activité opérationnelle → hors cible ESN (à filtrer)"
                ),
                "SICAV / SICAF / FCP": "véhicules de fonds d'investissement (hors cible ESN)",
            },
            "regionalAxis": "pays-ville unique (Luxembourg-Ville, Bertrange, Leudelange, Capellen…)",
            "note": (
                "Place financière : forte densité de holdings (SOPARFI) et de "
                "véhicules de fonds = beaucoup d'entités = coquilles patrimoniales, "
                "PAS des prospects ESN. Distinguer la holding financière de la société "
                "OPÉRATIONNELLE (banque, assurance, fonds, télécom/IT, industrie), "
                "comme le filtrage SCI/coquilles côté FR. Le PSF (professionnel du "
                "secteur financier) est un statut réglementé fréquent pour les ESN "
                "servant la finance (ex. 'PSF de support')."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Luxembourg",
            "registry": "RCS / LBR (Registre de Commerce et des Sociétés)",
            "identifier": "numéro RCS (B<digits>, ex. B19669)",
            "languages": ["fr", "de", "lb", "en"],
            "prompt_fragment": (
                "PAYS CIBLE : Luxembourg.\n"
                "- Registre officiel : RCS (Registre de Commerce et des Sociétés), géré "
                "par LBR (Luxembourg Business Registers). Identifiant entreprise : "
                "numéro RCS au format B suivi de chiffres (ex. B19669) ; n° TVA "
                "LU######## (8 chiffres).\n"
                "- ⚠️ Accès registre : recherche gratuite à l'écran sur lbr.lu, mais PAS "
                "d'API publique gratuite (accès automatisé RCS restreint/payant) — ne "
                "PAS inventer de numéro RCS ni de données registre non vérifiées.\n"
                "- Formes juridiques : SA, S.à r.l. (Sàrl), SCA, SCS/SCSp. Attention aux "
                "SOPARFI (holdings de participations financières) et véhicules de fonds "
                "(SICAV/FCP) : très nombreux, souvent des coquilles patrimoniales SANS "
                "activité opérationnelle → hors cible ESN. Cibler l'entité "
                "OPÉRATIONNELLE, distinguer holding vs opérationnel. Statut PSF "
                "(professionnel du secteur financier) fréquent pour les ESN servant la "
                "banque/assurance/fonds.\n"
                "- Comptes annuels : dépôts consultables (via LBR/RESA) mais accès "
                "structuré limité — citer si connu, jamais inventer de chiffres.\n"
                "- Annonces légales : RESA (Recueil électronique des sociétés et "
                "associations). Bénéficiaires effectifs (RBE) : fermé au grand public "
                "(ne pas s'appuyer dessus pour l'actionnariat).\n"
                "- Marché trilingue FR (administratif) / DE / luxembourgeois, EN dominant "
                "en finance/fonds : rédiger en français par défaut, l'anglais convient "
                "pour les cadres finance internationaux. Très forte densité "
                "décisionnaire (DSI banque/assurance/fonds) par km²."
            ),
        }

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        """Resolve a company name **or** an RCS number (``B<digits>``) through GLEIF.

        ``None`` when nothing resolves, when the record is not registered with the
        Luxembourg RCS authority, or on any HTTP error — never a fabricated RCS
        number. Empty query ⇒ zero network."""
        cleaned = (query or "").strip()
        if not cleaned:
            return None
        rows = await self._search(cleaned, client=client)
        return _best_entity(rows, cleaned)

    async def suggest(
        self, query: str, *, limit: int = 5, client: httpx.AsyncClient | None = None
    ) -> list[RegistryEntity]:
        cleaned = (query or "").strip()
        if not cleaned:
            return []
        rows = await self._search(cleaned, client=client)
        ordered = _rank(rows, cleaned)
        return ordered[: max(limit, 0)]

    async def _search(self, query: str, *, client: httpx.AsyncClient | None) -> list[RegistryEntity]:
        if _is_rcs_number(query):
            params = {
                "filter[entity.registeredAs]": _normalize_rcs(query),
                "filter[entity.registeredAt.id]": _RA_LU_RCS,
                "page[size]": str(_PAGE_SIZE),
            }
        else:
            params = {
                "filter[entity.legalName]": query,
                "filter[entity.legalAddress.country]": self.code,
                "page[size]": str(_PAGE_SIZE),
            }
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S, headers={"Accept": "application/vnd.api+json"})
        try:
            async with throttle("gleif"):
                resp = await http.get(_GLEIF_RECORDS, params=params)
            if not resp.is_success:
                note_registry_failure("gleif", f"recherche {query!r}", status=resp.status_code)
                return []
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("gleif", f"recherche {query!r}", exc=exc)
            return []
        finally:
            if owns:
                await http.aclose()
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(rows, list):
            return []
        return [entity for entity in (_parse_record(row) for row in rows) if entity is not None]

    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        """The resolved RCS identity only. GLEIF carries neither job offers nor RESA
        legal notices: ``jobs``/``legalSignals`` stay empty rather than invented."""
        out = empty_signals(self.code)
        anchor = (ident or "").strip() if ident and _is_rcs_number(ident) else (company or "").strip()
        if not anchor:
            return out
        out["registry"] = await self.registry_lookup(anchor, client=client)
        return out


def _parse_record(row: object) -> RegistryEntity | None:
    """One GLEIF ``lei-records`` item → :class:`RegistryEntity`, or ``None`` when it
    does not carry a REAL Luxembourg RCS number (other authority, no ``registeredAs``)."""
    if not isinstance(row, dict):
        return None
    attributes = row.get("attributes")
    entity = attributes.get("entity") if isinstance(attributes, dict) else None
    if not isinstance(entity, dict):
        return None
    registered_at = entity.get("registeredAt")
    authority = registered_at.get("id") if isinstance(registered_at, dict) else None
    rcs = _normalize_rcs(str(entity.get("registeredAs") or ""))
    if authority != _RA_LU_RCS or not rcs:
        return None
    legal_name = entity.get("legalName")
    name = str(legal_name.get("name") or "").strip() if isinstance(legal_name, dict) else ""
    if not name:
        return None
    lei = str((attributes or {}).get("lei") or row.get("id") or "").strip()
    out: RegistryEntity = {
        "source": "gleif",
        "country": "LU",
        "name": name,
        "registryId": rcs,
        "registryIdLabel": "numéro RCS",
        "status": str(entity.get("status") or "").strip().lower() or "unknown",
        "contract": "documented",
    }
    address = entity.get("legalAddress")
    if isinstance(address, dict) and str(address.get("city") or "").strip():
        out["seat"] = str(address.get("city")).strip()
    legal_form = entity.get("legalForm")
    form_id = legal_form.get("id") if isinstance(legal_form, dict) else None
    if isinstance(form_id, str) and form_id in _ELF_LU:
        out["legalForm"] = _ELF_LU[form_id]
    if lei:
        out["detailUrl"] = f"{_GLEIF_DETAIL}{lei}"
    return out


def _rank(rows: list[RegistryEntity], query: str) -> list[RegistryEntity]:
    """Active before inactive; within each, exact name > startswith > the rest (stable)."""
    q = query.strip().lower()

    def key(entity: RegistryEntity) -> tuple[int, int]:
        name = entity.get("name", "").lower()
        closeness = 0 if name == q else 1 if name.startswith(q) else 2
        return (0 if entity.get("status") == "active" else 1, closeness)

    return sorted(rows, key=key)


def _best_entity(rows: list[RegistryEntity], query: str) -> RegistryEntity | None:
    ranked = _rank(rows, query)
    return ranked[0] if ranked else None
