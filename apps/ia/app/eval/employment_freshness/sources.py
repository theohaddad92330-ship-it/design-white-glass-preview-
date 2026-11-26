"""Les sources candidates — adaptateurs LECTURE SEULE sur les clients déjà livrés, plus le catalogue de ce qui ne l'est pas.

Rien n'est branché au produit : un adaptateur appelle le client existant, traduit sa réponse en ``Observation``, c'est tout.
Sans clé = no-op STRICT : ``configured()`` est faux, ``observe`` n'est jamais appelé, zéro réseau.
Une source dont le contrat de champ « poste » n'est pas vérifié n'a PAS d'adaptateur : elle figure au catalogue,
``BLOCKED`` avec sa raison (« un contrat d'API non vérifiable ne se devine pas »).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

from app.eval.employment_freshness.protocol import (
    UNKNOWN,
    Observation,
    TruthCase,
    observe_from_history,
    observe_from_snapshot,
)


class SourceAdapter(Protocol):
    name: str
    env_key: str
    cost_provider: str  # suffixe de PROVIDER_UNIT_COST_<X> (registre de coûts D19) — un réglage, un seul endroit

    def configured(self) -> bool: ...

    async def observe(self, case: TruthCase) -> Observation: ...


def _env_set(key: str) -> bool:
    return bool(os.environ.get(key, "").strip())


@dataclass(frozen=True)
class Candidate:
    """Une ligne du catalogue : ce qu'on sait de la source, lu dans agent_docs/env-reference.md — jamais deviné."""

    name: str
    env_key: str
    adapter: bool
    blocked_reason: str | None = None


# Catalogue : sources dont une clé est déjà décrite dans agent_docs/env-reference.md (noms de clés SEULEMENT).
CANDIDATES: tuple[Candidate, ...] = (
    Candidate(
        "apollo_search", "APOLLO_API_KEY", True
    ),  # tier gratuit, c'est la relecture en place (employment-recheck)
    Candidate("apollo_match", "APOLLO_API_KEY", True),  # People-Match payant : parcours daté
    Candidate("salesql", "SALESQL_API_KEY", True),  # instantané title / organization_name, contrat vérifié
    Candidate(
        "dropcontact",
        "DROPCONTACT_API_KEY",
        False,
        "client TypeScript côté API (dropcontact.client.ts, champs `job`/`company`) : hors de ce script Python — à mesurer via un script API si Louis le retient",
    ),
    Candidate("lusha", "LUSHA_API_KEY", False, "champ « poste » du contrat Person v2 non vérifié dans le dépôt"),
    Candidate("kaspr", "KASPR_API_KEY", False, "contrat NON vérifiable (documentation derrière un compte client)"),
    Candidate(
        "fullenrich",
        "FULLENRICH_API_KEY",
        False,
        "contrat public mais enrich_fields = coordonnées seulement, pas de poste",
    ),
    Candidate("hunter", "HUNTER_API_KEY", False, "Email Finder : une adresse, pas un poste"),
)


class ApolloSearchSource:
    """La relecture EN PLACE (`searchPeopleByName`, tier gratuit) : c'est la ligne de base à battre."""

    name = "apollo_search"
    env_key = "APOLLO_API_KEY"
    cost_provider = "apollo"

    def configured(self) -> bool:
        return _env_set(self.env_key)

    async def observe(self, case: TruthCase) -> Observation:
        from app.services import apollo

        full_name = case.handle.get("full_name", "").strip()
        apollo_id = case.handle.get("apollo_id", "").strip()
        if not full_name or not apollo_id:
            return UNKNOWN  # jamais un homonyme : sans identifiant d'annuaire, on ne choisit pas
        hits, _status = await apollo.search_people_by_name(
            full_name=full_name, organization_name=case.employer_ref, max_results=20
        )
        hit = next((h for h in hits if h.id == apollo_id), None)
        if hit is None:
            return Observation(state="unknown", units=0.0)
        state = observe_from_history(hit.employment_history, case.employer_ref)
        if state == "unknown":
            state = observe_from_snapshot(hit.organization_name, case.employer_ref)
        return Observation(state=state, employer=hit.organization_name or None, units=0.0)


class ApolloMatchSource:
    name = "apollo_match"
    env_key = "APOLLO_API_KEY"
    cost_provider = "apollo"

    def configured(self) -> bool:
        return _env_set(self.env_key)

    async def observe(self, case: TruthCase) -> Observation:
        from app.services import apollo

        h = case.handle
        if not any(h.get(k) for k in ("apollo_id", "linkedin_url")):
            return UNKNOWN
        result = await apollo.enrich_person(
            apollo_id=h.get("apollo_id") or None, linkedin_url=h.get("linkedin_url") or None
        )
        if not result.matched:
            return Observation(state="unknown", units=0.0)  # un miss ne débite rien
        history = [e.model_dump() for e in result.employment_history]
        state = observe_from_history(history, case.employer_ref)
        if state == "unknown":
            state = observe_from_snapshot(result.organization_name, case.employer_ref)
        return Observation(state=state, employer=result.organization_name, units=1.0)


class SalesQLSource:
    name = "salesql"
    env_key = "SALESQL_API_KEY"
    cost_provider = "salesql"

    def configured(self) -> bool:
        return _env_set(self.env_key)

    async def observe(self, case: TruthCase) -> Observation:
        from app.services import salesql

        url = case.handle.get("linkedin_url", "").strip()
        if not url:
            return UNKNOWN
        result = await salesql.enrich_person(linkedin_url=url)
        if not result.matched:
            return Observation(state="unknown", units=0.0)
        # Un instantané sans date : « employeur actuel » seulement. Units = 1 par résolution (à confirmer au compte).
        return Observation(
            state=observe_from_snapshot(result.organization_name, case.employer_ref),
            employer=result.organization_name,
            units=1.0,
        )


def build_adapters() -> list[SourceAdapter]:
    return [ApolloSearchSource(), ApolloMatchSource(), SalesQLSource()]
