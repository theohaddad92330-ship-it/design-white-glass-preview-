from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_serializer

from app.services.account_qualification import qualify_candidate
from app.services.actor_typology import ActorType, classify_actor_type
from app.services.company_filters import (
    CompanyDiscoveryFilters,
    DegradeReason,
    degraded_entry,
    headcount_label,
    open_tranche_floor,
    parse_headcount_label,
)
from app.services.country_packs import get_active_pack, normalize_country, suggest_registry_entities
from app.services.country_packs.base import RegistryEntity
from app.services.data_sources import recherche_entreprises
from app.services.data_sources.recherche_entreprises import fetch_company, list_companies
from app.services.esn_candidate_ranking import is_esn_naf, naf_family_label, order_esn_suggestions
from app.services.esn_prefill import naf_label_for_code, prefill_esn_profile
from app.services.group_head_confirm import confirm_group_head
from app.services.homonym_disambiguation import (
    GENERIC_ALONE,
    is_shell_like_row,
    order_prospect_suggestions,
    trailing_sigle,
)
from app.services.insee_sirene import unite_legale_by_siren
from app.services.pappers import (
    PappersNoResultError,
    PappersParsingError,
    PappersUnavailableError,
    get_company,
    search_companies_filtered,
    search_company_suggestions,
)
from app.services.pappers.discovery import pappers_can_answer_geography, to_pappers_search_params
from app.services.pappers.models import CompanySearchHit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["Companies"])


class CompanySuggestion(BaseModel):
    name: str
    # French registry pivot. Empty for a foreign suggestion (no SIREN abroad —
    # never fabricated); the national identifier travels in ``registry_id``.
    siren: str = ""
    city: str = ""
    sector: str = ""
    # Provenance registre pour le scoring hybride "comptes similaires" (addendum
    # Théo) : dept/région dérivés du code postal + tranche d'effectifs. Optionnels
    # — absents quand Pappers ne les expose pas (aucune donnée inventée).
    postal_code: str | None = None
    employees_min: int | None = None
    employees_max: int | None = None
    # #3092 — la date de création registre, DÉJÀ portée par `CompanySearchHit`
    # (`app/services/pappers/models.py`, comme pour Découvrir dans
    # `pappers/discovery.py:158`) mais jamais projetée ici : sans elle,
    # `similar-scoring.ts` ne pouvait distinguer une jeune structure d'une TPE
    # vieille de vingt ans — les deux recoupaient la même tranche d'effectifs
    # « Startups & Scale-ups » (1-250). Absente quand Pappers ne la publie pas
    # (aucune date inventée) ; jamais utilisée pour EXCLURE, seulement pour
    # NOMMER l'âge quand il confirme un critère (GA-18/GA-19).
    creation_date: str | None = None
    # Identité cross-border (dédup internationale #494) — renseignés UNIQUEMENT
    # pour une suggestion étrangère résolue par un country pack. ``None`` sur le
    # chemin FR ⇒ forme de la suggestion française inchangée.
    #
    # ⚠️ Casse : ces deux champs sortent en **camelCase** sur le fil
    # (``serialization_alias``), comme partout ailleurs sur le wire IA→NestJS
    # pour l'identité registre — ``_registry_identity_overlay`` (phase1_research)
    # émet déjà ``registryId``/``registryCountry``, que ``accounts.service.ts``
    # lit pour persister ``accounts.registry_id``. Le contrat TS
    # (``companySuggestionSchema``) les déclare donc en camelCase, et le proxy
    # NestJS transmet l'objet suggestion tel quel : un nom snake_case ici
    # arrivait ``undefined`` dans le navigateur.
    #
    # Les champs voisins (``postal_code``, ``employees_min``/``max``) restent
    # DÉLIBÉRÉMENT en snake_case : ils sont déjà consommés sous ce nom, en
    # particulier par ``similar-scoring.ts`` côté API. Pas d'``alias_generator``
    # global ici — il les re-caserait et casserait ce qui marche.
    #
    # ``serialization_alias`` (et non ``alias``) : seule la sérialisation change,
    # la construction par nom de champ (``registry_id=…`` plus bas) reste valide.
    country: str | None = None
    registry_id: str | None = Field(default=None, serialization_alias="registryId")
    registry_id_label: str | None = Field(default=None, serialization_alias="registryIdLabel")
    # Cohérence NAF vue à travers la lentille ESN — renseigné UNIQUEMENT sous
    # ``lens=esn`` (onboarding « quelle est VOTRE ESN ? »). Absent (None) sur le
    # chemin générique : un compte prospecté n'est pas une ESN, l'y signaler
    # n'aurait aucun sens. Tri-état, comme partout : False = le registre
    # contredit, None = on ne sait pas.
    #
    # Pas d'alias : le contrat TS déclare ce champ en `is_esn_naf`, comme
    # `postal_code` / `employees_min`. Les deux côtés disent la même chose —
    # c'est la divergence de casse qui avait fait perdre `registryId`.
    is_esn_naf: bool | None = None
    # #2265.14 — MÊME jugement que Découvrir (`discover_signals.py`), sur le
    # MÊME couple nom/NAF déjà résolu ici (aucun second appel réseau). Booléen
    # strict, jamais `None` : `classify_actor_type` répond toujours, y compris
    # « non classé » — l'absence de preuve n'est pas l'absence du champ.
    is_intermediary: bool = False
    # Les DEUX faits qui départagent deux homonymes, et que la ligne ne portait
    # pas (30/08/2026). Sous « ROCHE », les cinq lignes affichaient la même
    # phrase — « 5 des résultats portent le nom "ROCHE". » — qui n'aide à choisir
    # entre aucune d'elles. L'effectif publié et la catégorie, si.
    #
    # Ce sont des valeurs PUBLIÉES par le registre, jamais dérivées : le libellé
    # de tranche INSEE (« 500 à 999 salariés ») et la catégorie d'entreprise
    # (TPE / PME / ETI / GE). Absents quand le registre écrit `NN` ou ne dit
    # rien — « non mesuré » n'est pas « 0 salarié », et un champ vide se lit,
    # là où un zéro se croit.
    #
    # Snake_case comme leurs voisins `postal_code` / `employees_min` /
    # `is_esn_naf` : le contrat TS les déclare sous ce nom.
    headcount_label: str | None = None
    size_class: str | None = None
    # #2162.9 — la raison sociale PUBLIÉE, distincte du nom affiché (souvent le
    # nom commercial). ``None`` quand le registre n'en publie qu'un seul, ou sur
    # le chemin country-pack (pas d'équivalent Pappers ``denomination`` là-bas).
    legal_name: str | None = None
    # #2162.14 — statut administratif PUBLIÉ. ``False`` = le registre marque
    # l'entité cessée (``entreprise_cessee``) ; ``True`` = active. ``None`` sur
    # le chemin country-pack, qui ne publie pas ce fait sous cette forme — un
    # statut absent ne se devine jamais.
    is_active: bool | None = None


class CompanySearchResponse(BaseModel):
    success: bool = True
    suggestions: list[CompanySuggestion] = []
    # #1099 : renseigné UNIQUEMENT quand la recherche exacte n'a rien donné et
    # qu'on a rendu le résultat d'une requête PLUS COURTE. L'écran le dit ; sans
    # ce champ il ferait passer une autre recherche pour celle qui a été
    # demandée. `None` sur le chemin nominal ⇒ réponse inchangée.
    broadened_from: str | None = Field(default=None, serialization_alias="broadenedFrom")
    # #1107/#1109 : la source n'a pas RÉPONDU — ce qui n'est pas « rien trouvé ».
    # Le registre soft-failait à `[]` et l'écran en concluait « Aucune entreprise
    # trouvée », c'est-à-dire l'inverse de ce qui s'était passé. `None` sur le
    # chemin nominal ⇒ réponse inchangée.
    source_unavailable: bool = Field(default=False, serialization_alias="sourceUnavailable")

    @model_serializer
    def _omit_absent_broadening(self) -> dict[str, Any]:
        """La clé n'apparaît sur le fil que lorsqu'il y a quelque chose à dire.

        Émettre `broadenedFrom: null` sur chaque réponse ferait changer le corps
        de TOUTES les recherches pour une information qui ne concerne qu'un cas
        limite — et la garde de contrat partagé (`company-suggestions.ia.json`)
        le refuse, à juste titre : le chemin nominal doit rester byte-identique.
        """
        body: dict[str, Any] = {
            "success": self.success,
            "suggestions": [s.model_dump(by_alias=True) for s in self.suggestions],
        }
        if self.broadened_from:
            body["broadenedFrom"] = self.broadened_from
        if self.source_unavailable:
            body["sourceUnavailable"] = True
        return body


def qualified_suggestions(hits: list) -> list:
    """Retire d'une liste de hits registre ce qui n'est pas une organisation.

    #1084 — « Étrange le résultat pour une mutuelle KLESIA. J'aurai aimé voir
    AG2R, Malakoff, MGEN ». Les comptes du même secteur remontaient deux
    entrepreneurs individuels : le registre répondait exactement à la question
    NAF posée, et personne ne lui demandait s'il s'agissait d'organisations.

    La règle n'est pas réécrite ici : c'est ``qualify_candidate``, celle de
    l'écran Découvrir, avec ses codes d'exclusion stables. Elle n'avait qu'un
    appelant, et ce chemin-ci passait à côté.

    UN seul retrait : le verdict ``excluded`` — une exclusion PROUVÉE (personne
    physique, groupement sans personnalité morale, entité cessée, doublon).

    ⚠️ Le doute ``person_like_name`` n'en fait DÉLIBÉRÉMENT pas partie, et le
    test qui l'a montré vaut d'être lu : l'heuristique de nom range « MALAKOFF
    HUMANIS » et « AG2R LA MONDIALE » parmi les personnes — deux ou trois mots,
    aucune forme sociale — c'est-à-dire exactement les comptes que le testeur
    demandait à voir. Le module le dit de lui-même : « c'est un INDICE, jamais
    une preuve ». Écarter dessus rendrait ce retour PIRE, pas meilleur.

    Une microstructure, une association, un GIE restent proposés : « il exclut
    peu, et seulement sur preuve ».
    """
    kept: list = []
    seen: list[str] = []
    for hit in hits:
        candidate = {
            "name": hit.legal_name or hit.denomination or "",
            "siren": hit.siren,
            "legalCategory": hit.legal_category,
            "ceased": hit.has_ceased,
            "department": hit.department,
        }
        verdict = qualify_candidate(candidate, seen_sirens=seen)
        if verdict.get("verdict") == "excluded":
            continue
        if hit.siren:
            seen.append(hit.siren)
        kept.append(hit)
    return kept


def _to_response(q: str, hits: list) -> CompanySearchResponse:
    return CompanySearchResponse(
        suggestions=[
            CompanySuggestion(
                name=hit.legal_name or hit.denomination or q,
                siren=hit.siren,
                city=hit.city or "",
                sector=hit.naf_label or "",
                postal_code=hit.postal_code,
                # #3434 — la tranche OUVERTE (« 10 000 salariés et plus ») n'a pas
                # de `effectif_min` côté Pappers : son plancher publié voyage quand même.
                employees_min=hit.headcount_min if hit.headcount_min is not None else open_tranche_floor(hit.headcount_label),
                employees_max=hit.headcount_max,
                headcount_label=hit.headcount_label,
                creation_date=hit.creation_date,
                # #2162.9 — `denomination` (la dénomination sociale registre) ne
                # part que si elle DIFFÈRE du nom déjà choisi ci-dessus : un
                # fait redondant n'aide à rien distinguer.
                legal_name=(
                    hit.denomination
                    if hit.denomination and hit.denomination != (hit.legal_name or hit.denomination or q)
                    else None
                ),
                # #2162.14 — `has_ceased` (`entreprise_cessee`) était déjà parsé
                # sur le hit Pappers mais n'avait aucun appelant sur `/search`.
                is_active=not hit.has_ceased,
                # #2265.14 — même jugement pur que `_registry_candidates_to_response`,
                # sur le NAF Pappers déjà résolu par ce hit.
                is_intermediary=classify_actor_type(naf=hit.naf_code, name=hit.legal_name or hit.denomination or q)
                in (ActorType.CABINET_RECRUTEMENT, ActorType.PLATEFORME_INTERMEDIATION),
            )
            for hit in hits
        ]
    )


def _registry_to_response(entities: list[RegistryEntity]) -> CompanySearchResponse:
    """Map country-pack :class:`RegistryEntity` results → autocomplete suggestions.

    ``siren`` stays empty (no French identifier abroad); the national pivot goes
    to ``registry_id`` with its human label, and ``city`` reuses the registered
    seat so the dropdown row reads the same as the French one. Only fields the
    registry actually filled are surfaced — never a fabricated value.
    """
    return CompanySearchResponse(
        suggestions=[
            CompanySuggestion(
                name=e.get("name") or "",
                siren="",
                city=e.get("seat") or "",
                sector=e.get("legalForm") or "",
                country=e.get("country") or None,
                registry_id=e.get("registryId") or None,
                registry_id_label=e.get("registryIdLabel") or None,
            )
            for e in entities
            if e.get("name")
        ]
    )


def _registry_candidates_to_response(
    candidates: list[dict], *, esn_lens: bool = False, limit: int | None = None
) -> CompanySearchResponse:
    """Map free-registry candidates (``recherche_entreprises._candidate``) →
    autocomplete suggestions.

    Administratively ceased entities are dropped: proposing a dead shell as
    « votre entreprise » is worse than proposing nothing. ``postal_code`` and the
    headcount bounds stay ``None`` — this source exposes a department and an INSEE
    bracket, not those values, and we never fabricate a field to fill a shape.

    ``sector`` falls back to decoding the NAF code, then to its DIVISION label:
    this registry often returns the code without its label (constaté sur Kicklox
    comme sur Capgemini), and a dropdown row with no sector is exactly the one a
    user cannot tell apart from a namesake SCI.

    ``esn_lens`` only adds the NAF-coherence flag; it never removes a row.

    ⚠️ ``limit`` se coupe ICI et pas sur les lignes registre en amont : une entité
    RADIÉE est retirée par la compréhension ci-dessous, et la couper avant lui
    aurait fait occuper un rang par une ligne qui n'est jamais rendue. Mesuré au
    premier essai : deux candidats dont une coquille radiée, `limit=1` — la
    coquille prenait la place et l'écran ne rendait RIEN.
    """
    rows = [
        CompanySuggestion(
            name=c.get("name") or "",
            siren=str(c.get("siren") or ""),
            city=c.get("city") or "",
            sector=(
                c.get("nafLabel")
                or naf_label_for_code(c.get("nafCode"))
                or naf_family_label(c.get("nafCode"))
                or ""
            ),
            is_esn_naf=is_esn_naf(c.get("nafCode")) if esn_lens else None,
            # #2265.14 — même geste que la ligne au-dessus : un jugement PUR sur
            # le nom + NAF déjà résolus par ce même candidat, pas gated sur
            # `esn_lens` (contrairement à `is_esn_naf`) — un intermédiaire n'est
            # pas moins un intermédiaire vu depuis l'onboarding « votre ESN ? ».
            is_intermediary=classify_actor_type(naf=c.get("nafCode"), name=c.get("name"))
            in (ActorType.CABINET_RECRUTEMENT, ActorType.PLATEFORME_INTERMEDIATION),
            # Les faits qui départagent deux homonymes. `headcount_label`
            # DÉCODE une nomenclature publique (le code de tranche INSEE),
            # il n'estime rien : `NN` → `None`, jamais « 0 salarié ».
            headcount_label=headcount_label(c.get("headcountTranche")),
            # #3434 — plancher de la tranche ouverte « 10 000 salariés et plus ».
            employees_min=open_tranche_floor(headcount_label(c.get("headcountTranche"))),
            size_class=(str(c.get("sizeClass")).strip() or None) if c.get("sizeClass") else None,
            # #2162.14 — une entité cessée est déjà EXCLUE par le filtre
            # ci-dessous : ce qui reste est toujours actif.
            is_active=True,
        )
        for c in candidates
        if c.get("name") and c.get("isActive", True)
    ]
    return CompanySearchResponse(suggestions=rows if limit is None else rows[:limit])


#: Mots qui ne DÉSIGNENT personne une fois seuls. « Groupe Renault » réduit à
#: « Groupe » rendrait des centaines de sociétés sans rapport, et l'utilisateur
#: croirait qu'on lui propose des homonymes de ce qu'il a tapé.
_GENERIC_ALONE = GENERIC_ALONE


def _fold(token: str) -> str:
    """Minuscules sans accents : « Sociéte » et « SOCIETE » sont le même mot."""
    return unicodedata.normalize("NFD", token).encode("ascii", "ignore").decode().lower()


def narrowed_query(q: str) -> str | None:
    """La même recherche, amputée de son dernier mot — ou ``None``.

    #1099 — « Bedrock Streaming » n'existe pas au registre : la société y est
    inscrite « BEDROCK (M6 DIGITAL DISTRIBUTION) ». Le registre cherche sur la
    RAISON SOCIALE, donc un mot de marque absent de celle-ci ramène zéro, et
    l'écran conclut « Aucune entreprise trouvée » — ce qui se lit « cette
    entreprise n'existe pas ».

    Le repli marque→raison sociale existait déjà pour un nom d'UN mot
    (« Kicklox » → LINNAEUS). Il manquait celui de plusieurs mots.

    Deux bornes, et ce sont elles qui rendent la règle tenable :

    * on ne coupe qu'**une** fois — une cascade finirait par ne garder que le
      premier mot, et « Société Générale de Banque » deviendrait « Société » ;
    * on ne coupe **pas** si ce qui reste ne désigne plus personne. Mieux vaut
      ne rien proposer que proposer n'importe qui.
    """
    tokens = q.split()
    if len(tokens) < 2:
        return None
    kept = tokens[:-1]
    if all(_fold(token) in _GENERIC_ALONE for token in kept):
        return None
    return " ".join(kept)


#: Combien de lignes le registre doit rendre pour qu'un CLASSEMENT ait un sens.
#:
#: Le « 5 » que l'écran affichait n'était pas seulement un plafond d'affichage :
#: il voyageait jusqu'à ``per_page=5`` sur la source. Le bassin à classer ÉTAIT
#: la liste affichée, donc il n'y avait rien à classer. On dissocie les deux — on
#: récupère un bassin, on en affiche ``limit``.
#:
#: Dix et non vingt-cinq (le maximum d'une page gouv.fr) : mesuré, le rappel par
#: taille suffit à faire remonter la bonne société dans ses dix premières lignes,
#: et chaque ligne du corps réel pèse ~4 ko sur une requête qui repart à chaque
#: pause de frappe.
REGISTRY_SUGGESTION_POOL = 10


async def _registry_suggestions(q: str, limit: int) -> tuple[list[dict], bool]:
    """Candidats du registre libre, et si la source a RÉPONDU.

    Soft-fail toujours — une autocomplétion ne rend jamais un 5xx — mais le
    second membre du couple dit la différence entre « le registre ne connaît
    personne de ce nom » et « le registre n'a pas répondu » (#1107/#1109). Les
    deux produisaient la même liste vide, et l'écran tranchait pour la première.

    ``strict=True`` est la même bascule que le résolveur d'identité : sans elle,
    un 429 du registre se lit « cette entreprise n'existe pas ».

    ``staffed_recall=True`` (30/08/2026) : la source est une recherche PLEIN
    TEXTE dont le tri ignore la taille, et sur un nom porté par des milliers
    d'entités elle n'en montre jamais la plus grosse. Le rappel pose la MÊME
    question une seconde fois, restreinte aux tranches d'effectif de dix salariés
    et plus, et l'union est classée. C'est ce qui rend « ROCHE » capable de
    proposer le laboratoire ; sans lui, aucun classement ne peut le trouver — il
    n'est dans aucune des vingt-cinq premières lignes que la source rend.
    """
    try:
        rows = await recherche_entreprises.search_companies(
            q, limit=max(limit, REGISTRY_SUGGESTION_POOL), strict=True, staffed_recall=True
        )
        return rows, False
    except Exception as exc:  # noqa: BLE001 — l'autocomplétion dégrade, elle ne casse pas
        logger.warning("recherche-entreprises autocomplete fallback failed for %r: %s", q, exc)
        return [], True


def _siren_from_query(q: str) -> str | None:
    """#4410 — le SIREN que la saisie désigne, ou ``None`` si c'est un nom.

    Neuf chiffres, espaces admis ; un SIRET (quatorze chiffres) se ramène à ses
    neuf premiers. Toute autre saisie — un nom qui contient des chiffres compris
    — reste un nom.
    """
    cleaned = (q or "").strip()
    if not cleaned or not all(ch.isdigit() or ch.isspace() for ch in cleaned):
        return None
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if len(digits) == 9:
        return digits
    if len(digits) == 14:
        return digits[:9]
    return None


def _profile_to_hit(profile: Any) -> CompanySearchHit:
    head = profile.headquarters
    return CompanySearchHit(
        siren=profile.siren,
        nom_entreprise=profile.legal_name,
        city=head.city,
        code_postal=head.postal_code,
        libelle_code_naf=profile.naf_label or head.naf_label,
        code_naf=profile.naf_code or head.naf_code,
        effectif_min=profile.headcount_min,
        effectif_max=profile.headcount_max,
        effectif=profile.headcount_label,
        date_creation=profile.creation_date,
        entreprise_cessee=profile.has_ceased,
        forme_juridique=profile.legal_form,
    )


def _order_hits(q: str, hits: list[CompanySearchHit]) -> list[CompanySearchHit]:
    """#4409 — ``order_prospect_suggestions`` appliqué aux hits Pappers.

    Les hits sont projetés en lignes de registre (nom, effectif chiffré), triés
    par le MÊME barème, puis rendus dans l'ordre obtenu. Aucune ligne n'est
    retirée.
    """
    rows = [
        {
            "name": hit.legal_name or hit.denomination or "",
            "legalName": hit.denomination or "",
            "siren": hit.siren,
            "headcount": hit.headcount_min,
            # #4409.1 — Pappers ne publie parfois que le LIBELLÉ (« Entre 3 et 5 salariés »).
            "headcountLabel": hit.headcount_label,
            "nafCode": hit.naf_code,
            "nafLabel": hit.naf_label,
            "isActive": not hit.has_ceased,
            "_i": i,
        }
        for i, hit in enumerate(hits)
    ]
    return [hits[row["_i"]] for row in order_prospect_suggestions(q, rows)]


_TYPED_SIGLE_RE = re.compile(r"[A-Z0-9]{2,6}")


def _typed_sigle(q: str) -> str | None:
    """#4409 — le sigle TAPÉ en tête d'une saisie de plusieurs mots, en capitales (« OGF service funéraire » →
    « OGF »). Une saisie qui n'est QUE le sigle n'en a pas besoin : c'est déjà la question posée."""
    words = q.split()
    if len(words) < 2:
        return None
    head = words[0].strip(".,;:()")
    if not _TYPED_SIGLE_RE.fullmatch(head) or head.isdigit() or head.lower() in GENERIC_ALONE:
        return None
    return head


async def _recall_hits_by_sigle(q: str, hits: list[CompanySearchHit], limit: int) -> list[CompanySearchHit]:
    """#4409.1/.2 — chemin de la source facturée : le sigle tapé, ou celui qu'une holding sans salarié publie
    (« … (OGF) »), est relu UNE fois (cache 24 h) ; les nouvelles lignes s'ajoutent, fusion par SIREN, rien n'est
    retiré. Le barème unique (``_order_hits``) trie ensuite le tout : la tête de groupe passe devant."""
    sigle = _typed_sigle(q) or next(
        (
            found
            for hit in hits
            if parse_headcount_label(hit.headcount_label) == 0
            and (found := trailing_sigle(hit.legal_name) or trailing_sigle(hit.denomination))
        ),
        None,
    )
    if not sigle or sigle.lower() == q.strip().lower():
        return hits
    try:
        extra = await search_company_suggestions(sigle, limit=limit)
    except Exception as exc:  # noqa: BLE001 — un rappel en échec laisse la page telle quelle
        logger.info("#4409 — rappel par sigle indisponible (%s)", type(exc).__name__)
        return hits
    seen = {hit.siren for hit in hits}
    merged = [*hits, *(hit for hit in extra or [] if hit.siren and hit.siren not in seen)]
    # #4409.1/.2 — recette prod 26/10 : la page de cinq que la source facturée rend pour le sigle ne
    # contient pas la tête de groupe ; le registre libre (sans clé, sans crédit) la rend. Même
    # question, même fusion par SIREN, additive : le barème unique décide ensuite du rang.
    registry_rows, _down = await _registry_suggestions(sigle, limit)
    seen.update(hit.siren for hit in merged)
    for row in registry_rows:
        siren = str(row.get("siren") or "")
        if siren and siren not in seen and row.get("name") and row.get("isActive", True):
            seen.add(siren)
            merged.append(_registry_row_to_hit(row))
    return merged


def _registry_row_to_hit(row: dict) -> CompanySearchHit:
    """Une ligne du registre libre projetée en hit : seuls les faits publiés voyagent."""
    label = headcount_label(row.get("headcountTranche"))
    return CompanySearchHit(
        siren=str(row.get("siren")),
        nom_entreprise=row.get("name"),
        denomination=row.get("legalName") or None,
        city=row.get("city") or None,
        libelle_code_naf=row.get("nafLabel") or None,
        code_naf=row.get("nafCode") or None,
        effectif=label,
        effectif_min=parse_headcount_label(label),
    )


async def _recall_group_by_sigle(q: str, rows: list[dict], limit: int) -> list[dict]:
    """#4409.2 — la tête de la liste est une holding : on cherche la tête de groupe.

    Une holding porte le nom EXACT tapé (« OPERATEUR ET GESTIONNAIRE FUNERAIRE
    (…) (OGF) ») et peut être seule dans la page que le registre rend pour une
    saisie longue, alors que le groupe vit sous son sigle. Le sigle publié entre
    parenthèses est le fait registre qui les relie : une seule question de plus,
    posée seulement quand la meilleure ligne est une coquille, et ADDITIVE —
    rien n'est retiré, la fusion dédoublonne par SIREN.
    """
    ordered = order_prospect_suggestions(q, rows)
    # #4409.2 — la coquille n'est pas forcément en tête : un homonyme de descriptif
    # peut la précéder. On prend la 1re coquille de la liste qui porte un sigle.
    # #4409.1 — recette prod 25/10 : le sigle TAPÉ en tête de saisie vaut le sigle publié, même
    # quand la page ne contient ni coquille ni tête de groupe (comme sur la source facturée).
    sigle = _typed_sigle(q) or next(
        (
            s
            for row in ordered
            if is_shell_like_row(row) and (s := trailing_sigle(row.get("name")))
        ),
        None,
    )
    if not sigle or sigle.lower() == q.strip().lower():
        return rows
    extra, _down = await _registry_suggestions(sigle, limit)
    return recherche_entreprises.merge_registry_pages(rows, extra)


async def _siren_response(siren: str, *, limit: int, esn_lens: bool) -> CompanySearchResponse:
    """#4410 — exactement l'entité de ce SIREN, jamais un homonyme par nom.

    Fiche Pappers par SIREN si la clé répond, sinon le registre libre, qui
    résout un SIREN tel quel. Une ligne du registre dont le SIREN n'est pas celui
    demandé est écartée : SIREN inconnu ⇒ liste vide.
    """
    try:
        profile = await get_company(siren, include_graph=False)
    except Exception as exc:  # noqa: BLE001 — pas de clé / quota / SIREN inconnu : le registre prend le relais
        logger.info("fiche Pappers indisponible pour %s (%s) — registre libre", siren, exc)
    else:
        return _to_response(siren, [_profile_to_hit(profile)])
    rows, registry_down = await _registry_suggestions(siren, limit)
    exact = [r for r in rows if str(r.get("siren") or "").strip() == siren][:1]
    response = _registry_candidates_to_response(exact, esn_lens=esn_lens, limit=1)
    if not response.suggestions and registry_down:
        response.source_unavailable = True
    return response


@router.get("/search", response_model=CompanySearchResponse)
async def search_companies(
    q: str = Query(..., min_length=2, description="Free-text query, min 2 chars"),
    limit: int = Query(1, ge=1, le=20),
    country: str | None = Query(
        None,
        description="Target market (FR default). A non-FR market (US/CA/CH/BE/LU) "
        "delegates autocomplete to the matching country pack.",
    ),
    lens: str | None = Query(
        None,
        description="Ranking lens. Absent/`generic` = registry order (prospect "
        "search). `esn` = rank by ESN plausibility — onboarding « votre ESN ? ».",
    ),
) -> CompanySearchResponse:
    """Autocomplete companies for the target market.

    * FR (default / absent) → Pappers, then the free registry as a fallback when
      Pappers finds nothing (see below).
    * A registered non-FR market → the country pack's public-registry resolution
      (SEC EDGAR US, CBR/MRAS CA, Zefix CH, KBO BE, GLEIF LU — documented contract
      since 11/10/2026). A market with no suggestion source (CH without creds, a LU
      company without an LEI) resolves to an empty list — the UI then
      falls back to "launch with the exact name".

    The `lens` parameter scopes the ESN-centric ranking to where it makes sense.
    The prospect-account autocomplete (`accounts.service.ts`) hits this SAME
    endpoint, and a prospect is precisely NOT an IT services company — penalising
    a non-IT NAF there would be absurd. Absent/`generic` is therefore
    byte-identical to the historical behaviour; only the onboarding screen opts in.

    Soft-fails to an empty list on any provider error — keeps the typing
    experience snappy even if the upstream registry is misbehaving, and never
    fabricates a suggestion.
    """
    code = normalize_country(country)
    esn_lens = (lens or "").strip().lower() == "esn"
    # A REGISTERED non-FR market delegates to its country pack; FR (default) and
    # any unknown code degrade to the recherche-entreprises path — the safe
    # French default, byte-identical to before this feature.
    if get_active_pack(code) is not None:
        entities = await suggest_registry_entities(code, q, limit=limit)
        return _registry_to_response(entities)
    # #4410 — un SIREN (ou un SIRET) se traite AVANT toute recherche par nom.
    siren = _siren_from_query(q)
    if siren:
        return await _siren_response(siren, limit=limit, esn_lens=esn_lens)
    hits = await search_company_suggestions(q, limit=limit)
    if hits:
        # #4409 — UN seul chemin d'ordre pour les deux sources : le barème des
        # homonymes (taille, tête opérationnelle) s'applique aussi à Pappers.
        # #4409.1/.2 — RÉFUTÉ en prod le 23/10 : le rappel par sigle n'existait que sur le
        # chemin registre ; ici la page de 5 n'avait pas la tête de groupe à trier.
        hits = await _recall_hits_by_sigle(q, hits, limit)
        return _to_response(q, _order_hits(q, hits)[:limit])
    # Pappers matches on the RAISON SOCIALE, so a company whose brand differs
    # from it returns nothing (« Kicklox » → LINNAEUS : dropdown vide, alors que
    # c'est la porte d'entrée de l'onboarding). The free registry indexes the
    # brand and finds it. Strictly ADDITIVE: this only runs when Pappers came
    # back empty, so a non-empty Pappers result is byte-identical to before.
    #
    # This is ALSO the path that runs permanently in prod while the Pappers key
    # is out of credits — i.e. the one whose top hits are SCIs and garages.
    rows, registry_down = await _registry_suggestions(q, limit)
    if rows:
        # DEUX lentilles, et elles ne disent pas la même chose. L'onboarding
        # demande « quelle est VOTRE ESN ? » : là c'est la cohérence NAF qui
        # prime. Le sélecteur d'analyse cherche un PROSPECT : là c'est la taille,
        # et le barème est celui qui tourne depuis des mois sur le chemin
        # d'analyse (« quel THALES est mon prospect ? ») — il existait, il était
        # juste, et ce chemin-ci ne l'appelait pas.
        #
        # Aucune des deux ne SUPPRIME de ligne : sur `/discover` on écarte
        # l'homonymie non tranchée parce qu'on explore un volume ; ici
        # l'utilisateur cherche une société précise et doit pouvoir la choisir.
        if esn_lens:
            rows = order_esn_suggestions(q, rows)
        else:
            # #4409.2 — le tri s'applique APRÈS la fusion des sources, en UNE fonction.
            rows = await _recall_group_by_sigle(q, rows, limit)
            rows = order_prospect_suggestions(q, rows)
        return _registry_candidates_to_response(rows, esn_lens=esn_lens, limit=limit)

    # #1099 : le registre cherche sur la RAISON SOCIALE, donc une marque de
    # plusieurs mots (« Bedrock Streaming » pour « BEDROCK (M6 DIGITAL
    # DISTRIBUTION) ») ne ramène rien et l'écran conclut que l'entreprise
    # n'existe pas. Un SEUL élargissement, borné par `narrowed_query`, et
    # seulement quand tout le reste a rendu vide — le chemin nominal est donc
    # byte-identique.
    narrowed = narrowed_query(q)
    if not narrowed:
        empty = _registry_candidates_to_response([], esn_lens=esn_lens)
        # #1107/#1109 : une liste vide parce que la source est tombée n'est PAS
        # « aucune entreprise trouvée ». On le DIT plutôt que de laisser l'écran
        # affirmer que l'entreprise n'existe pas.
        empty.source_unavailable = registry_down
        return empty
    rows, narrowed_down = await _registry_suggestions(narrowed, limit)
    # Même classement que le chemin nominal, sur la requête RÉELLEMENT servie —
    # classer sur ce que l'utilisateur a tapé noterait des noms contre un terme
    # qui n'a rien rendu.
    rows = order_esn_suggestions(narrowed, rows) if esn_lens else order_prospect_suggestions(narrowed, rows)
    response = _registry_candidates_to_response(rows, esn_lens=esn_lens, limit=limit)
    if not rows and (registry_down or narrowed_down):
        response.source_unavailable = True
    # L'élargissement se DIT : sans ça, l'utilisateur croit qu'on a trouvé ce
    # qu'il a tapé, alors qu'on lui montre le résultat d'une autre recherche.
    if response.suggestions:
        response.broadened_from = narrowed
    return response


def _build_filters(**kwargs: Any) -> CompanyDiscoveryFilters:
    """Validate query-string criteria, turning a bad value into a 422 instead of
    the 500 a raw ``ValidationError`` would produce inside a handler."""
    try:
        return CompanyDiscoveryFilters(**kwargs)
    except ValidationError as exc:
        # ``include_context=False`` strips the raw ValueError pydantic attaches —
        # it is not JSON-serializable and would turn the 422 into a 500.
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_url=False, include_context=False, include_input=False),
        ) from exc


@router.get("/registry")
async def registry_record(name: str = "") -> dict:
    """La fiche de REGISTRE d'une entreprise — gratuite, sans clé, sans crédit.

    ─────────────────────────────────────────────────────────────────────────
    POURQUOI CETTE PORTE EXISTE
    ─────────────────────────────────────────────────────────────────────────
    L'écran Territoire nommait des dizaines d'entreprises qui recrutent, en
    texte mort : pas de lien, pas d'identité, rien à ouvrir. La seule façon
    d'en savoir plus était de lancer une analyse complète — 8 crédits, par
    entreprise, pour explorer un territoire qui en compte quarante.

    Arbitrage de Louis (04/09/2026) : un clic ouvre d'abord ce que le REGISTRE
    PUBLIC dit gratuitement — SIREN, adresse, effectif, NAF, forme juridique,
    date de création, dirigeants — et l'analyse reste un geste séparé, décidé.
    On voit beaucoup, on ne paie que si on veut le dossier.

    ⚠️ Rien n'est inventé ici : `fetch_company` rend `None` quand le registre
    ne répond pas ou ne connaît pas ce nom, et l'écran le DIT. Un « profil
    vide » et un « registre muet » ne mènent pas à la même décision.

    ⚠️ Cette lecture est mise en cache 30 jours (`TTL_FIRMO`) et partage le
    seau de débit du registre avec les autres appels : ouvrir dix fiches d'un
    territoire ne coûte pas dix appels réseau au deuxième passage.
    """
    cleaned = " ".join(str(name or "").split())
    if len(cleaned) < 2:
        return {"company": None, "reason": "empty_query"}
    record = await fetch_company(cleaned)
    # `None` reste `None` : c'est le registre qui n'a rien, et l'écran doit
    # pouvoir dire lequel des deux — « pas trouvé » ou « pas pu regarder ».
    return {"company": record, "reason": None if record else "not_found"}


@router.get("/discover", response_model=CompanySearchResponse)
async def discover_companies(
    q: str = Query(..., min_length=2, description="Sector/activity seed, min 2 chars"),
    limit: int = Query(5, ge=1, le=20),
    naf_code: str | None = Query(
        None, description="Optional NAF/APE code (e.g. 62.01Z) to restrict to same-sector companies"
    ),
    # Registry criteria (Découvrir v2). ALL optional — omitting them keeps the
    # request byte-identical to the pre-v2 behaviour. This GET exposes the
    # criteria that read well in a querystring; the full surface (capital,
    # corporate purpose, registry publications, cursor pagination) lives on the
    # POST variant below, where ~20 optional criteria belong in a body rather
    # than in a URL.
    naf_section: str | None = Query(None, description="NAF section letter A-U"),
    department: str | None = Query(None, description="Department code, e.g. 69, 2A, 971"),
    region: str | None = Query(None),
    postal_code: str | None = Query(None),
    headcount_tranche_min: str | None = Query(None, description="INSEE tranche code, e.g. 32"),
    headcount_tranche_max: str | None = Query(None),
    creation_date_min: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    creation_date_max: str | None = Query(None, description="ISO date YYYY-MM-DD"),
    revenue_min: int | None = Query(None, ge=0),
    revenue_max: int | None = Query(None, ge=0),
    legal_category: str | None = Query(None),
    on_headquarters_only: bool | None = Query(None),
) -> CompanySearchResponse:
    """Broader public-company discovery for sidebar suggestions.

    When ``naf_code`` is given (Théo p.41 : comptes similaires par NAF), the
    Pappers search is restricted to that registry code so the results are
    genuinely same-sector, not just a fuzzy text match on the activity label.
    The other criteria narrow the same search (« NAF 62.02 × département 69 ×
    effectif 250-499 × créée après 2015 ») and are all optional.
    """
    filters = _build_filters(
        naf_code=naf_code,
        naf_section=naf_section,
        department=department,
        region=region,
        postal_code=postal_code,
        headcount_tranche_min=headcount_tranche_min,
        headcount_tranche_max=headcount_tranche_max,
        creation_date_min=creation_date_min,
        creation_date_max=creation_date_max,
        revenue_min=revenue_min,
        revenue_max=revenue_max,
        legal_category=legal_category,
        on_headquarters_only=on_headquarters_only,
    )
    params = to_pappers_search_params(filters)
    params.precision = "approximative"
    # #1084 : on demande PLUS que `limit` parce que la qualification en retire.
    # Sans cette marge, écarter deux entrepreneurs individuels sur six rendait
    # quatre suggestions au lieu de six — le rail se vidait au lieu de se
    # nettoyer. Borné pour ne pas transformer une suggestion en balayage.
    over_fetch = min(limit * 3, 30)
    hits = await search_company_suggestions(q, limit=over_fetch, filters=params)
    return _to_response(q, qualified_suggestions(hits)[:limit])


# ── Registry list-building (Découvrir v2) ────────────────────────────────────


class DiscoveredCompany(BaseModel):
    """Registry half of ``DiscoverCandidate`` (agent_docs/discover-v2-contract.md).

    Purely factual — the score, the signals and the LLM angle are added by the
    Discover core downstream. A candidate always carries a resolved SIREN.
    """

    source: str
    name: str
    siren: str
    nafCode: str | None = None  # noqa: N815 — camelCase is the cross-service contract
    sector: str | None = None
    city: str | None = None
    department: str | None = None
    headcountRange: str | None = None  # noqa: N815
    creationDate: str | None = None  # noqa: N815


class DegradedSource(BaseModel):
    source: str
    reason: str


class CompanyDiscoveryRequest(BaseModel):
    filters: CompanyDiscoveryFilters = Field(default_factory=CompanyDiscoveryFilters)
    limit: int = Field(default=25, ge=1, le=100)


class CompanyDiscoveryResponse(BaseModel):
    companies: list[DiscoveredCompany] = []
    # The normalized criteria actually applied — the caller echoes them in
    # ``DiscoverResponse.query`` so the UI can show what was really searched.
    query: dict[str, Any] = {}
    # « source HS = dit, jamais masqué » — never a silent fallback.
    degraded: list[DegradedSource] = []


@router.post("/discover", response_model=CompanyDiscoveryResponse)
async def discover_companies_by_criteria(body: CompanyDiscoveryRequest) -> CompanyDiscoveryResponse:
    """List companies FROM the registry criteria — no LLM, no invented row.

    POST rather than GET: the registry filter surface is ~20 optional criteria
    (activity, geography, size, age, capital, registry publications, cursor)
    which no longer reads as a querystring, and it will keep growing. The GET
    above stays as-is for the existing autocomplete callers.

    Waterfall ordered by what the criteria actually REQUIRE, not by habit:

    * criteria the keyless gouv.fr registry expresses in full (activité, géo,
      taille, âge — see ``recherche_entreprises.covers_filters``) go there FIRST.
      Both sources read the same SIRENE/RNE data and return the same row shape,
      so paying Pappers per call for an answer the free source gives identically
      is pure cost. Pappers still backs it up if the free source finds nothing;
    * criteria only Pappers carries (chiffre d'affaires, capital, catégorie
      juridique, objet social, publications au registre) keep Pappers FIRST —
      the free registry has no such fields and substituting a broader result set
      would answer a question nobody asked.

    Either way the other source is the fallback, and whatever degraded is
    reported, never masked. Each row states its ``source``.
    """
    degraded: list[dict[str, str]] = []

    # ⚠️ Une maille que Pappers ne sait PAS exprimer ferme son repli.
    # `commune_code` et le cercle (`lat`/`long`/`radius`) n'ont pas d'équivalent
    # vérifié chez Pappers, et ses paramètres typés les refusent : l'appeler
    # quand même rendrait le DÉPARTEMENT sous l'étiquette « à 12 km de
    # Toulouse ». Une liste vide qui dit pourquoi vaut mieux qu'une liste pleine
    # qui répond à une autre question.
    pappers_geo_ok = pappers_can_answer_geography(body.filters)

    if recherche_entreprises.covers_filters(body.filters):
        rows = await list_companies(body.filters, body.limit, degraded=degraded)
        if not rows and pappers_geo_ok:
            # The free registry is empty-handed or down — Pappers is worth its
            # credit here, since the alternative is an empty screen.
            rows = await search_companies_filtered(body.filters, body.limit, degraded=degraded)
        elif not rows:
            degraded.append(
                degraded_entry(
                    "pappers",
                    DegradeReason.UNSUPPORTED_FILTERS,
                    fields=[f for f in ("commune_code", "radius_km") if getattr(body.filters, f) is not None],
                )
            )
    else:
        rows = await search_companies_filtered(body.filters, body.limit, degraded=degraded) if pappers_geo_ok else []
        if not rows and degraded:
            # Pappers is unavailable, not merely empty-handed → try the keyless
            # registry, accepting that it cannot honour every criterion (it says so
            # itself via ``unsupported_filters``).
            rows = await list_companies(body.filters, body.limit, degraded=degraded)

    return CompanyDiscoveryResponse(
        companies=[DiscoveredCompany.model_validate(r) for r in rows],
        query=body.filters.model_dump(exclude_none=True),
        degraded=[DegradedSource.model_validate(d) for d in degraded],
    )

# ── Préremplissage du profil ESN (onboarding) ────────────────────────────────


class PrefilledField(BaseModel):
    """Une réponse préremplie + la provenance que l'UI doit afficher.

    Miroir de ``prefilledFieldSchema`` (``@bellum/contracts``) — les noms de
    champs sont identiques des deux côtés.
    """

    value: str | list[str]
    confidence: str
    source: str
    rationale: str | None = None
    #: #2028.8 — la date à laquelle la source a observé cette valeur (ISO),
    #: quand la source la porte (Pappers : ``dernier_traitement``). Le
    #: registre gratuit et l'inférence LLM n'en ont aucune : `None`, jamais
    #: une date devinée.
    as_of: str | None = None

    @model_serializer
    def _serialize(self) -> dict:
        """``rationale`` est OPTIONNEL côté contrat TS (``.optional()``, qui
        refuse ``null``) : la clé est omise plutôt qu'émise à ``null``.
        ``as_of`` est ``.nullable().default(null)`` côté contrat : la clé est
        TOUJOURS émise, `null` compris — c'est cette valeur-là que le badge
        (#2028.2) lit pour afficher « date inconnue »."""
        out: dict = {"value": self.value, "confidence": self.confidence, "source": self.source, "as_of": self.as_of}
        if self.rationale:
            out["rationale"] = self.rationale
        return out


class PrefillCompany(BaseModel):
    """Identité registre résolue pour le nom tapé — l'en-tête « match »."""

    name: str
    #: #2015.3 — raison sociale ET nom commercial, quand le registre les
    #: distingue. ``name`` garde son rôle historique. ``None`` sur les deux :
    #: jamais une raison sociale devinée depuis ``name``.
    legal_name: str | None = None
    commercial_name: str | None = None
    siren: str | None = None
    city: str | None = None
    #: #2015.5 — le pays du siège. ``None`` sans donnée registre : jamais
    #: "France" deviné.
    country: str | None = None
    naf_code: str | None = None
    naf_label: str | None = None
    #: ``True`` NAF informatique, ``False`` NAF incohérent avec une ESN (l'UI
    #: alerte), ``None`` code absent (l'UI se tait — « on ne sait pas » n'est pas
    #: « ce n'est pas une ESN »).
    is_esn_naf: bool | None = None
    website: str | None = None
    headcount_label: str | None = None
    #: #2015.8 — tri-état ASSUMÉ, comme ``is_esn_naf`` : ``False`` = registre
    #: dit l'entreprise cessée, ``True`` = active, ``None`` = aucune donnée
    #: de registre pour le dire.
    is_active: bool | None = None


class PrefillCandidate(BaseModel):
    """Une entité registre homonyme, avec ses éléments discriminants.

    Miroir de ``prefillCandidateSchema`` (``@bellum/contracts``). Tout champ que
    le registre n'a pas donné reste absent — on n'étoffe jamais une ligne pour
    qu'elle ait l'air complète.
    """

    siren: str
    name: str
    city: str | None = None
    department: str | None = None
    naf_code: str | None = None
    naf_label: str | None = None
    is_esn_naf: bool | None = None
    headcount_label: str | None = None
    establishment_count: int | None = None
    creation_date: str | None = None
    score: float = 0.0


class EsnPrefillRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    # Verrouille le match quand l'utilisateur a choisi une suggestion
    # d'autocomplétion — évite la résolution nom → SIREN et son risque d'homonyme.
    siren: str | None = None
    # #2640.1 — l'e-mail du commercial connecté (jamais saisi par lui ici : posé
    # server-side par l'API NestJS depuis sa session). Un domaine PRO départage
    # le site retenu parmi les hits web ; un domaine générique (gmail.com…) est
    # ignoré — voir ``pick_website``.
    email: str | None = None
    # Catalogue FERMÉ des valeurs autorisées par champ, envoyé par l'API NestJS
    # depuis ``@bellum/contracts`` (ESN_ANSWER_OPTIONS). Volontairement NON
    # dupliqué côté Python : aucune dérive TS/Python possible. Un champ absent
    # de ce catalogue ne peut pas être prérempli.
    options: dict[str, list[str]] = Field(default_factory=dict)


class EsnPrefillResponse(BaseModel):
    # False quand aucun registre ne connaît le nom — l'UI garde le questionnaire
    # manuel et n'affiche AUCUNE erreur (taper un nom inconnu est normal).
    # False AUSSI quand ``ambiguous`` : rien n'a été prérempli, exprès.
    matched: bool = False
    company: PrefillCompany | None = None
    # Uniquement les clés que le pipeline a pu fonder. Clé absente = « à compléter ».
    fields: dict[str, PrefilledField] = {}
    # Les entités registre homonymes, classées. Quand ``ambiguous`` est vrai,
    # c'est à l'utilisateur de choisir : l'UI affiche la liste et rappelle
    # l'entité choisie en repostant son SIREN.
    candidates: list[PrefillCandidate] = []
    ambiguous: bool = False


@router.post("/prefill", response_model=EsnPrefillResponse)
async def prefill_esn(req: EsnPrefillRequest) -> EsnPrefillResponse:
    """Préremplit le questionnaire d'onboarding à partir du seul nom de l'ESN.

    Sources publiques en parallèle (registre gratuit, Pappers, web, stack du
    site) ; les champs factuels sont dérivés sans LLM, les champs interprétatifs
    par un unique appel Haiku contraint au catalogue ``options`` puis revalidés
    contre lui. **Jamais de donnée fictive** : un champ que rien ne fonde est
    absent de ``fields``.

    Soft-fail total — une source morte, une clé absente ou une erreur inattendue
    rendent ``{matched: false, company: null, fields: {}}`` plutôt qu'un 5xx :
    l'onboarding doit toujours pouvoir continuer à la main.
    """
    try:
        result = await prefill_esn_profile(req.name, siren=req.siren, email=req.email, options=req.options)
    except Exception as exc:  # noqa: BLE001 — le préremplissage ne doit jamais bloquer l'onboarding
        logger.warning("ESN prefill failed for %r: %s", req.name, exc)
        return EsnPrefillResponse()
    return EsnPrefillResponse.model_validate(result)


class GroupAffiliationResponse(BaseModel):
    """#2165.24 / #2166.3 / #2165.16 — forme camelCase pour l'API NestJS."""

    role: str
    head_siren: str = Field(serialization_alias="headSiren")
    head_name: str | None = Field(default=None, serialization_alias="headName")

    model_config = ConfigDict(populate_by_name=True)


class AccountJobOffersRequest(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    #: Le métier cherché ; vide = tous métiers.
    term: str = Field(default="", max_length=80)
    #: Le site et le SIREN du compte : boards ATS, pages carrières, APEC et sources payantes s'y ancrent.
    website: str | None = Field(default=None, max_length=300)
    siren: str | None = Field(default=None, max_length=14)


class AccountJobOffersResponse(BaseModel):
    offers: list[dict[str, Any]]
    #: ``False`` : la source n'a pas été interrogée (clé absente, quota du jour) — jamais « aucune offre ».
    searched: bool


@router.post("/job-offers", response_model=AccountJobOffersResponse)
async def account_job_offers(body: AccountJobOffersRequest) -> AccountJobOffersResponse:
    """Louis 30/10 — les offres d'un compte pour un métier nommé sur sa fiche, au plus 50 (montrées 5 par 5)."""
    from app.services.data_sources.job_aggregators import account_offer_search

    result = await account_offer_search(body.company, body.term, website=body.website, siren=body.siren)
    return AccountJobOffersResponse(offers=result["offers"], searched=result["searched"])


class GroupPerimeterEntityResponse(BaseModel):
    """Lot 757 — une entité du périmètre (forme camelCase du contrat ``groupPerimeterEntitySchema``)."""

    siren: str
    name: str
    role: str
    headcountLabel: str | None = None  # noqa: N815 — forme du contrat partagé
    city: str | None = None
    region: str | None = None
    isActive: bool | None = None  # noqa: N815


class GroupPerimeterResponse(BaseModel):
    rootSiren: str  # noqa: N815
    headSiren: str | None = None  # noqa: N815
    entities: list[GroupPerimeterEntityResponse]
    truncated: bool


@router.get("/{siren}/group-perimeter", response_model=GroupPerimeterResponse | None)
async def group_perimeter(siren: str = Path(pattern=r"^\d{9}$")) -> GroupPerimeterResponse | None:
    """Lot 757 (arbitrage Louis 31/10) — le groupe et ses filiales, pour le sélecteur de périmètre de
    l'analyse : taille, siège, région lus au registre. ``null`` quand la fiche est illisible (sans clé,
    SIREN inconnu, source en panne) — jamais un 5xx, jamais un groupe deviné."""
    from app.services.group_perimeter import build_group_perimeter

    result = await build_group_perimeter(siren)
    return GroupPerimeterResponse.model_validate(result) if result else None


@router.get("/{siren}/group-affiliation", response_model=GroupAffiliationResponse | None)
async def group_affiliation(siren: str) -> GroupAffiliationResponse | None:
    """#2165.24 / #2166.3 / #2165.16 — le rôle capitalistique (``groupe`` /
    ``filiale``) d'une entreprise et l'identité de sa tête de groupe, dérivés
    de la cartographie Pappers (`extract_group_affiliation`).

    Cache GLOBAL partagé avec l'analyse complète (`pappers.get_company`,
    clé SIREN) : la plupart des appels — tout compte déjà analysé — ne
    dépensent AUCUN crédit Pappers supplémentaire.

    `null` sans clé Pappers, SIREN inconnu du registre, panne source, ou
    graphe sans lien capitalistique exploitable — jamais un rôle deviné.
    """
    try:
        profile = await get_company(siren, include_graph=True)
    except PappersNoResultError:
        return None
    except (PappersUnavailableError, PappersParsingError, ValueError) as exc:
        logger.warning("Group affiliation lookup failed for %s: %s", siren, exc)
        return None
    affiliation = profile.group_affiliation
    if affiliation is None:
        return None
    # #3917 — le nom de la tête est confirmé par le registre avant tout rattachement au groupe ; registre
    # muet ou en panne → l'affiliation de Pappers reste telle quelle (jamais un 5xx).
    if affiliation.role == "filiale":
        try:
            registry = await unite_legale_by_siren(affiliation.head_siren)
        except Exception as exc:  # noqa: BLE001 — la confirmation ne doit jamais casser la lecture
            logger.warning("Group head registry check failed for %s: %s", affiliation.head_siren, exc)
            registry = None
        confirmed = confirm_group_head(affiliation, registry)
        if confirmed is None:
            return None
        affiliation = confirmed
    return GroupAffiliationResponse(
        role=affiliation.role, head_siren=affiliation.head_siren, head_name=affiliation.head_name
    )
