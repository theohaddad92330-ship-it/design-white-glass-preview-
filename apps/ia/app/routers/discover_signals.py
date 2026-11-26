"""`POST /discover/signals` — prospection INVERSÉE : du signal frais au compte.

Découvrir v1 demandait « quelles entreprises ressemblent à mon ICP » et laissait
un LLM inventer la réponse. Ici on retourne la question : **qui BOUGE en ce
moment sur mon territoire**, d'après trois registres publics datés :

- **BOAMP** — appels d'offres IT OUVERTS : un acheteur avec un budget MAINTENANT ;
- **DECP** — marchés IT ATTRIBUÉS : le même budget, plus le NOM du titulaire,
  donc le concurrent en place et l'angle rang-2 ;
- **France Travail** — offres IT publiées : un compte qui ouvre des postes data
  a un projet qui démarre.

Les trois sources tournent EN PARALLÈLE, sont dédoublonnées (SIREN sinon nom
normalisé), leurs signaux fusionnés par entreprise, et le tout est trié du signal
le plus frais au plus ancien : la fraîcheur EST la valeur produit.

#2616.1 — le bucket « comptes qui recrutent » lit désormais DEUX registres, pas
un seul : **APEC** (cadres IT — chefs de projet, architectes, managers, que
France Travail ne classe pas toujours dans son domaine dédié) s'ajoute EN
PARALLÈLE à France Travail, sans devenir une quatrième source sélectionnable —
c'est un élargissement du signal « hiring », pas une nouvelle catégorie.

Contrat `agent_docs/discover-v2-contract.md`, appliqué à la lettre :

- **aucun SIREN inventé** — les sources donnent souvent un nom sans SIREN ; il est
  résolu par le résolveur registre EXISTANT (``resolve_company_identity``, libre,
  déterministe, sans clé). Non résolu ou homonymie non tranchée → le candidat est
  ÉCARTÉ et compté dans ``degraded`` ;
- **aucune source HS masquée** — pas de clé, quota, HTTP 5xx : la source ne
  contribue rien ET apparaît dans ``degraded`` avec sa raison ;
- **aucune troncature muette** — la résolution SIREN est BORNÉE (en nombre et en
  temps : voir ``MAX_RESOLUTIONS`` / ``RESOLUTION_BUDGET_S``, dont la valeur est
  justifiée par une mesure, pas par un chiffre rond). Ce que la borne laisse de
  côté n'a pas été jugé : ces entreprises sortent dans ``coverage.notExamined``,
  strictement séparées de celles qui ont été examinées PUIS rejetées. « Détectée
  mais non regardée » et « regardée et écartée » sont deux affirmations
  différentes, et l'écran ne doit jamais les additionner.

Le **score est calculé ici**, par le scoreur déterministe partagé avec le chemin
registre (:mod:`app.services.discover_scoring`) — aucun LLM, aucun aléa, chaque
point rattaché à un facteur nommé portant sa preuve. Ce routeur se contentait
d'un placeholder neutre (``score = 0``) en déléguant à « la couche scoring » :
personne ne le renseignait en aval, et l'écran affichait donc **0/100 pour
chaque entreprise trouvée**.

Ce chemin ne mesure pas tout, et il le DIT : les sources de signal ne publient
pas de date de création, et sans profil ESN ni critère d'écran certains blocs du
barème n'ont rien à comparer. Ces blocs sortent dans ``scoreUnmeasured`` et leur
plafond quitte ``scoreMax`` — « non mesuré » n'est pas « mesuré à zéro ». Seul
l'angle commercial reste produit en aval par le LLM.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, SerializerFunctionWrapHandler, field_validator, model_serializer

from app.middleware.log_redaction import redact_secrets
from app.services.site_geography import geography_from_signals
from app.services.account_qualification import is_public_employer
from app.services.actor_typology import (
    ActorType,
    actor_fields,
    matches_end_client,
)
from app.services.cancel import run_or_cancel
from app.services.company_archetype import is_known_esn_name
from app.services.company_filters import (
    SIREN_AMBIGUOUS_REASON,
    SIREN_NOT_EXAMINED_REASON,
    SIREN_UNREACHABLE_REASON,
    UNKNOWN_SECTOR_REASON,
    degrade_kind,
    headcount_label,
    public_administration_mismatch,
)
from app.services.contract_model import job_kind, observe_contract_model, signal_contract_type
from app.services.data_sources.apec import list_hiring_companies_apec
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.bodacc_capital import list_capital_increase_companies
from app.services.data_sources.bodacc_takeover import list_takeover_companies
from app.services.data_sources.decp import list_award_buyers
from app.services.data_sources.france_travail import list_hiring_companies
from app.services.data_sources.job_platforms import JOB_PLATFORM_LABELS
from app.services.data_sources.job_search import list_hiring_companies_search
from app.services.data_sources.public_tenders import list_tender_buyers
from app.services.data_sources.registry_lookup import identity_by_siren
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.data_sources.territory_query import normalize_department
from app.services.data_sources.wttj import it_job_signals_wttj, list_hiring_companies_wttj
from app.services.delivery_fit import classify_delivery_fit, classify_delivery_fit_axes
from app.services.discover_harvest_paging import harvest_pages
from app.services.discover_hiring_scope import account_out_of_trade
from app.services.discover_scoring import score_candidate
from app.services.discover_signal_grid import arrange_signals, candidate_rank_key
from app.services.discover_single_flight import single_flight
from app.services.domain_market_filters import market_pack_for_profile
from app.services.esn_candidate_ranking import naf_family_label, naf_label_for_code
from app.services.esn_naf import EntityType, entity_type_flags, matches_entity_type
from app.services.free_text_facts import read_offer_title
from app.services.geo_labels import CITY_DEPARTMENTS
from app.services.hiring_aggregation import aggregate_replacement_signals, aggregate_team_growth
from app.services.hiring_signal import classify_hiring_signal
from app.services.homonym_disambiguation import ScoredCandidate, tranche_to_employees
from app.services.intermediation import intermediary_kind, intermediated_note, is_temp_agency
from app.services.job_context import derive_replacement_signal, derive_reporting_line, derive_team
from app.services.naf_sections import matches_sectors, requested_sectors, unknown_sectors
from app.services.offer_pertinence import sort_signals_by_trade
from app.services.offer_requester import derive_offer_requester
from app.services.profile_sector_orientation import profile_sector_naf_prefixes
from app.services.provider_mention import derive_third_party_provider_mention
from app.services.rate_limiter import wait_deadline
from app.services.remote_policy import derive_remote_policy
from app.services.research.homonym import resolve_company_identity
from app.services.seniority import derive_seniority
from app.services.signal_freshness import classify_signal_freshness
from app.services.signal_neighbours import (
    SIGNAL_WIDEN_BELOW,
    SOURCE_OF_SIGNAL_TYPE,
    qualified_hiring,
    requested_labels,
    should_widen,
    widening_step,
)
from app.services.space_reserve import cut_with_space_reserve
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discover", tags=["Discover"])

SourceName = Literal["tender", "award", "hiring", "capital", "deal"]
#: Les sources interrogées quand rien n'est coché.
ALL_SOURCES: tuple[SourceName, ...] = ("tender", "award", "hiring")
#: #3941.5 (Louis 17/10) — l'augmentation de capital (BODACC B) est un CRITÈRE qui se COCHE : n'importe quelle
#: société en publie une, ce n'est pas un signal d'ESN par défaut. Absente de ``ALL_SOURCES``, donc de la
#: recherche sans sélection ; présente dès que l'appelant la demande.
OPT_IN_SOURCES: tuple[SourceName, ...] = ("capital", "deal")  # #4732.1 — « Rachat ou fusion » se coche aussi
KNOWN_SOURCES: tuple[SourceName, ...] = (*ALL_SOURCES, *OPT_IN_SOURCES)

# Libellé humain par source — celui qui part dans ``degraded`` et ``sources``.
SOURCE_LABELS: dict[str, str] = {"tender": "BOAMP", "award": "DECP", "hiring": "France Travail", "capital": "BODACC", "deal": "BODACC"}

# Le registre est libre mais on ne le martèle pas : les résolutions SIREN partent
# par petites vagues concurrentes.
_RESOLVE_CONCURRENCY = 6

# ── La borne de résolution, et pourquoi elle vaut ce qu'elle vaut ───────────
#
# L'ancienne valeur (120) n'était pas une borne, c'était un plafond décoratif :
# elle dépassait de loin ce que l'étape pouvait matériellement finir.
#
# Mesuré sur le limiteur RÉEL (`recherche_entreprises` : 50 rpm, 5 concurrents),
# avec la latence médiane RÉELLE du résolveur (313 ms sur 8 appels live) :
#
#     résolutions │ bucket plein │ bucket vidé
#     ────────────┼──────────────┼─────────────
#         120     │     85,2 s   │    144,0 s
#          60     │     13,2 s   │     72,0 s
#          40     │      2,5 s   │     48,0 s
#          30     │      1,9 s   │     36,0 s
#          25     │      1,6 s   │     30,0 s
#
# Le « bucket vidé » est le cas de PROD, pas le pire cas théorique : DECP dépense
# ~81 appels registre (`names_by_siren`, résolution des titulaires) sur le MÊME
# bucket pendant la moisson, AVANT que la résolution ne commence. La colonne de
# gauche décrit un worker qui vient de démarrer ; celle de droite, tout le reste
# du temps.
#
# En face, l'API NestJS coupe à 45 s sans retry :
#     `DISCOVER_CALL_OPTS = { maxAttempts: 1, timeoutMs: 45_000 }`
#
# Donc à 120 l'étape ne pouvait pas finir — dans AUCUNE des deux colonnes. Ce
# n'était pas un écran lent, c'était un écran coupé : l'appel expirait et le
# travail déjà fait partait à la poubelle avec lui.
#
# Deux bornes, parce qu'il y a deux ressources distinctes à protéger :
#
#   * MAX_RESOLUTIONS borne le COÛT (le budget registre est partagé avec les
#     analyses ; le brûler ici, c'est le retirer d'ailleurs) ;
#   * RESOLUTION_BUDGET_S borne le DÉLAI. C'est la borne qui porte réellement,
#     parce que le débit — pas le nombre — est ce qui varie en prod. Un nombre
#     fixe est juste sur un bucket plein et faux sur un bucket vidé ; un budget
#     temps est juste dans les deux cas et s'auto-règle.
#
# #4796 — le couperet n'est plus 45 s : arbitrage du 28/10/2026, « Découvrir, UN
# run long (2 min+), rien en arrière-plan ». Le total annoncé est sous les 2 min :
# HARVEST_BUDGET_S (90) + RESOLUTION_BUDGET_S (25) = 115 s, plus scoring et
# corroboration des seuls comptes affichés. L'API NestJS porte le même budget
# (`DISCOVER_SIGNALS_CALL_OPTS`). Ce qui n'est pas résolu N'EST PAS PERDU EN
# SILENCE : c'est compté dans `coverage.notExamined` et rappelé dans `degraded`.
#
# MAX_RESOLUTIONS = 60 (était 40) : lu sur la table ci-dessus, 60 résolutions
# tiennent en 13,2 s sur un bucket plein — la moitié des 25 s —, et la table dit
# où ça casse (120 → 85 s). C'est BORNÉ parce que le registre est partagé avec les
# analyses ; ça ne dépend PAS de la taille d'équipe (le palier gouverne
# l'AFFICHAGE, jamais la collecte : `c76_role_reordonne_jamais_ne_filtre`). Sur un
# bucket vidé, c'est RESOLUTION_BUDGET_S qui coupe — et le reste se reprend par
# `resolveOffset` (« Voir plus »), jamais « illimité ».
MAX_RESOLUTIONS = 60
RESOLUTION_BUDGET_S = 25.0

# ── La MOISSON a aussi son budget, pas seulement la résolution ──────────────
#
# DECP nomme ses titulaires (les concurrents en place, jusqu'à ``per_source``
# ≈ 50-100 SIREN via ``names_by_siren``) PENDANT la moisson, sur le MÊME
# bucket ``recherche_entreprises`` que la résolution ci-dessus — et sans
# AUCUNE borne de temps. Sous un registre contentieux (le bucket déjà entamé
# par une réplique voisine, ou simplement un fournisseur lent), cette étape
# pouvait à elle seule dépasser les 45 s du proxy — avant même que la
# résolution des candidats ne commence.
#
# Même mécanisme que RESOLUTION_BUDGET_S (``wait_deadline``, #2521, déjà
# éprouvé côté ``/discover/registry``) : toute attente d'un jeton registre
# pendant la moisson échoue vite plutôt que de dormir au-delà du budget. Les
# deux budgets sont INDÉPENDANTS et s'additionnent.
#
# #4796 — 90 s (était 15 s). 15 s contredisait l'arbitrage du 28/10/2026 « UN run
# long, rien en arrière-plan » : il ne laissait de place qu'à UNE page par source
# (mesuré normal d'une page : 0,9-13,5 s). 90 s laisse la pagination des sources
# gratuites (``HARVEST_MAX_PAGES`` pages) finir, et 90 + 25 = 115 s tient sous les
# 2 min annoncées. La pagination s'arrête d'elle-même plus tôt (page incomplète).
HARVEST_BUDGET_S = 90.0
# #4796 — lignes demandées par page et par source : la PLUS GRANDE page qu'une source sert (France
# Travail 150 ; APEC, BOAMP, DECP 100 — chacune se borne à la sienne). Ce n'est plus `limit * 2` :
# le palier d'équipe gouverne l'AFFICHAGE, jamais la COLLECTE (doctrine `c76`). Les fournisseurs
# payants et le moteur de recherche n'y passent pas, et BODACC garde sa page unique.
HARVEST_ROWS_PER_PAGE = 150
# #4796 — plafond DUR de pages par (source, département) : 4 pages = 600 offres France Travail, 400
# annonces APEC / AO BOAMP / marchés DECP. Mesuré : une page France Travail ≈ 1 s sous son limiteur
# (1 req/s), donc 4 pages × une zone de 5 départements = 20 s, très en deçà de HARVEST_BUDGET_S.
HARVEST_MAX_PAGES = 4


class DiscoverSignalsRequest(BaseModel):
    """Critères de la recherche par signal. Tout est optionnel sauf le bon sens :
    sans département on balaie la France entière."""

    department: str | None = None
    #: LUD.2 — une RÉGION (code INSEE : AURA=84, BFC=27, PACA=93) ou une VILLE (Lyon → 69) : la
    #: moisson couvre ses départements. Un département explicite garde le chemin d'avant.
    region: str | None = None
    city: str | None = None
    sinceDays: int = Field(default=90, ge=1, le=1095)
    #: La recherche par TECHNOLOGIE — « j'ai des consultants de cette stack ».
    #:
    #: ⚠️ L'écran envoie une CHAÎNE (champ de saisie libre : « java spring »),
    #: le chemin interne une LISTE. Les deux sont acceptés et normalisés ici,
    #: parce que refuser la chaîne transformerait un champ jusqu'ici inerte en
    #: 422 le jour où on débranche son transport — et parce qu'itérer une chaîne
    #: découperait « java » en ['j','a','v','a'], en silence.
    #:
    #: Le champ n'atteignait pas ce routeur : il n'était pas déclaré au schéma
    #: partagé (`discoverSignalsRequestSchema`) qui sert de DTO à la route, et
    #: zod retire les clés inconnues. Le critère mourait entre l'écran et l'API.
    keywords: list[str] = Field(default_factory=list)
    #: #4067 (reste) — les SIREN sur lesquels l'ESPACE ACTIF détient un fait (historique, affaires
    #: CRM). Posé par l'API, jamais un client ; sert UNIQUEMENT à ne pas couper ces comptes à
    #: ``limit`` avant que l'API ne mêle leurs faits au rang.
    spaceSirens: list[str] = Field(default_factory=list)

    @field_validator("keywords", mode="before")
    @classmethod
    def _accept_a_plain_string(cls, value: object) -> object:
        """Une chaîne libre devient une liste de termes ; le reste passe tel quel."""
        if isinstance(value, str):
            return [part for part in (p.strip() for p in value.replace(",", " ").split()) if part]
        return value

    sources: list[SourceName] = Field(default_factory=list)
    #: #4016 L7 — Découvrir sans palier : « Voir plus » relance jusqu'à 200 (miroir
    #: de `DISCOVER_MAX_LIMIT`, contrat partagé). Borne technique, pas un palier.
    limit: int = Field(default=25, ge=1, le=200)
    #: Reprise progressive : combien d'entreprises DÉJÀ examinées lors des appels
    #: précédents il faut sauter. La moisson est refaite (3 requêtes, ~1 s) et
    #: retriée par fraîcheur — un ordre déterministe — donc la page suivante est
    #: bien la SUITE, sans état serveur ni re-résolution de ce qui l'a déjà été.
    resolveOffset: int = Field(default=0, ge=0, le=1000)
    #: Le RETOURNEMENT (tome 4 §20.1) : la même moisson d'offres lit un marché
    #: CLIENT ou un marché ESN selon qui a publié. Le filtre s'applique APRÈS la
    #: résolution registre — les sources d'offres ne rendent ni SIREN ni NAF, et
    #: le tome se trompe en le croyant gratuit.
    entityType: EntityType = "all"
    #: Les SECTEURS cochés au rail — appliqués sur le NAF **résolu**, comme
    #: `entityType` et pour la même raison : les sources de signal ne rendent ni
    #: SIREN ni NAF.
    #:
    #: Ils n'étaient lus NULLE PART ici (zéro occurrence de `sector`), et le
    #: front ne les sérialisait même pas : l'utilisateur cochait « Industrie »
    #: dans un rail commun aux deux modes, et il ne se passait rien — sans note,
    #: sans entrée `degraded`. C'est le retour du 31/08, « des entreprises qui
    #: n'ont rien à voir avec ce qu'il cherchait dans les filtres ».
    sectors: list[str] = Field(default_factory=list)
    #: #2616.1 — le CDI distinguable, filtrable. Vide = rien ne filtre (même
    #: convention que `sectors`) ; #5000 : `"CDI"`, `"CDD"`, `"INTERIM"` (l'intérim
    #: n'est plus compté freelance) et `"FREELANCE"` — une liste, pas un booléen.
    contractTypes: list[Literal["CDI", "CDD", "INTERIM", "FREELANCE"]] = Field(default_factory=list)
    #: #3096 — call bêta Apricot Labs (24/09/2026) : cibler les comptes dont le
    #: recrutement dit EXPLICITEMENT sa politique de télétravail. Même
    #: convention que `contractTypes` (vide = rien ne filtre) ; `indifferent`
    #: est une préférence de CANDIDAT, jamais une politique d'employeur — donc
    #: absent des valeurs filtrables (voir `remote_policy.py`).
    remotePolicies: list[Literal["sur_site", "hybride", "full_remote"]] = Field(default_factory=list)
    #: #3097 — cibler les comptes par séniorité RECHERCHÉE (l'offre le dit
    #: explicitement, ou son niveau d'expérience affiché tranche par seuil,
    #: voir `seniority.py`). Même convention que `remotePolicies`.
    seniorities: list[Literal["junior", "confirme", "senior"]] = Field(default_factory=list)
    #: #3226 (#3203.6) — PERSONNALISATION : une ESN nearshore doit pouvoir
    #: cibler les comptes compatibles avec du delivery externe, et reculer
    #: les comptes qui l'excluent explicitement. Filtre sur `DiscoverSignal.
    #: deliveryFit` (la distinction binaire déjà câblée, #3203), même
    #: convention que `remotePolicies` (vide = rien ne filtre).
    deliveryFitFilter: list[Literal["compatible", "potentially_compatible", "unknown", "incompatible"]] = Field(
        default_factory=list
    )
    # Profil ESN résolu SERVER-SIDE par l'API (même source qu'Analysis / Chat /
    # `/discover/registry`). Il était envoyé par `IaClient.discoverSignals` mais
    # pas déclaré ici : pydantic l'ignorait en silence, donc les blocs secteur et
    # effectif du barème n'avaient jamais de critère auquel se comparer.
    profile_data: dict = Field(default_factory=dict)
    #: #3757 (reste) — les SIREN que CET espace a déclarés comme partenaires
    #: (`partner_relations`, résolu par l'API, jamais recalculé ici, GA-26).
    #: Un candidat dont le SIREN y figure est un fait DÉCLARÉ, pas une
    #: hypothèse NAF — `classify_actor_type(is_declared_partner=…)` le classe
    #: `PARTENAIRE` plutôt que `ESN`/`ESN_CONCURRENTE`. Vide = comportement
    #: inchangé, aucun candidat n'est un partenaire déclaré.
    declaredPartnerSirens: list[str] = Field(default_factory=list)
    #: #4437 (Louis 21/10) — le geste « revenir au strict » : aucun palier voisin, même sur un signal maigre.
    strictSignal: bool = False


class DiscoverSignal(BaseModel):
    type: str
    label: str
    date: str  # ISO — obligatoire, c'est le « pourquoi maintenant »
    url: str | None = None
    detail: str | None = None
    #: Offre publiée par un cabinet de recrutement POUR UN CLIENT (tome 2 §13).
    #: Le signal est conservé — le commercial peut vouloir travailler le cabinet
    #: — mais il ne dit rien du besoin de l'employeur affiché, donc il ne compte
    #: pas dans le score.
    intermediated: bool = False
    #: #2616.2 — l'employeur qui RECRUTE est-il un organisme public (catégorie
    #: juridique INSEE 7xxx) ? Seulement posé sur un signal ``hiring`` — une
    #: administration qui achète (BOAMP/DECP) se nomme déjà comme telle, cette
    #: question ne leur apporte rien de plus. ``None`` = catégorie juridique
    #: non résolue (SIREN pas encore trouvé) — jamais deviné.
    publicEmployer: bool | None = None
    #: #2616.1 — le CDI distinguable, jamais un libellé brut : ``"CDI"`` quand la
    #: source porte un code natif VÉRIFIÉ qui s'y résout (même table que
    #: `contract_model.job_kind`, GA-26 — un réglage vit à un seul endroit),
    #: sinon ``None`` — « non observé », jamais deviné (ex. APEC, dont le code
    #: interne n'est pas lisible, ou une offre trouvée par recherche publique).
    #: Seulement posé sur un signal ``hiring``.
    contractType: str | None = None
    #: #3096 — la politique de télétravail, seulement quand le TEXTE de
    #: l'offre (``label``/``detail``) la dit explicitement (`remote_policy.py`).
    #: ``None`` = non évalué, jamais deviné d'un silence. Seulement posé sur un
    #: signal ``hiring``, même restriction que `contractType`.
    remoteWorkPolicy: str | None = None
    #: #3097 — la séniorité recherchée, seulement quand le titre ou le niveau
    #: d'expérience affiché la dit (`seniority.py`). `None` = non évalué,
    #: jamais deviné. Seulement posé sur un signal `hiring`.
    seniority: str | None = None
    #: #3097 — le libellé de salaire/TJM TEL QUE LA SOURCE L'AFFICHE (France
    #: Travail `salaire.libelle`) — jamais estimé, jamais posé quand la
    #: source ne l'affiche pas. Seulement sur un signal `hiring`.
    salaryLabel: str | None = None
    #: #3204 — la catégorie COMMERCIALE de l'offre (`hiring_signal.py`) :
    #: `internal_hiring`/`contracting`/`staffing_signal`/`skill_demand_signal`/
    #: `agency_posting`. Toujours posée sur un signal `hiring` (le classifieur
    #: est total — un code non vérifié rend `skill_demand_signal`, jamais un
    #: silence). `None` sur les autres types de signal.
    hiringSignalClass: str | None = None
    #: #3203 (extension #3226/#3203.8) — le delivery fit EXTERNE du compte
    #: (`delivery_fit.py`), DISTINCT de `remoteWorkPolicy` ci-dessus qui lit
    #: la politique de télétravail des SALARIÉS : les deux ne se déduisent
    #: jamais l'un de l'autre. `"unknown"` par défaut (jamais `"compatible"`
    #: deviné d'un simple mot « remote ») sur un signal `hiring` OU `tender`
    #: (un avis de marché public peut aussi exclure explicitement le delivery
    #: externe) ; `None` = non applicable (hors `hiring`/`tender`).
    deliveryFit: str | None = None
    #: #3226 (#3203.4/.5, étendu #3203.8) — les TREIZE axes du delivery fit,
    #: ÉVALUÉS SÉPARÉMENT (`delivery_fit.classify_delivery_fit_axes`),
    #: DISTINCT de `deliveryFit` ci-dessus (une distinction binaire
    #: acceptation/refus, inchangée) : `deliveryFit` ne recompose PAS ces axes
    #: (les deux répondent à des questions différentes du texte, voir le
    #: docblock de `delivery_fit.py`). `None` hors `hiring`/`tender` ; sur ces
    #: deux, toujours les treize clés (`unknown` = non évalué, jamais omis).
    deliveryFitAxes: dict[str, str] | None = None
    #: #3204.2 (épopée #3238) — les technologies EXPLICITEMENT nommées
    #: (`tech_stack.py`). Liste vide = aucune forme du catalogue reconnue,
    #: jamais une pile devinée d'un intitulé générique.
    technologies: list[str] = Field(default_factory=list)
    #: #3204.2 (épopée #3238) — la famille métier du TITRE (`job_family.py`).
    #: `None` = titre muet sur la famille, jamais une famille par défaut.
    jobFamily: str | None = None
    #: #3204.2 (épopée #3238) — le nom de l'équipe, seulement quand un
    #: marqueur explicite l'introduit (`job_context.derive_team`). `None`
    #: sinon.
    team: str | None = None
    #: #3204.2 (épopée #3238) — la fonction de rattachement hiérarchique,
    #: seulement quand un marqueur explicite l'introduit
    #: (`job_context.derive_reporting_line`). `None` sinon — RÈGLE de la
    #: spec : un intitulé ne suffit pas à identifier le décideur.
    reportsTo: str | None = None
    #: #3204.2 (épopée #3238) — l'offre est-elle encore ouverte ? Réutilise
    #: la MÊME fenêtre de fraîcheur que le type « recrutement »
    #: (`signal_freshness.py`, GA-26 — un réglage vit à un seul endroit) :
    #: `True` dans la fenêtre, `False` au-delà (probablement pourvue ou
    #: retirée — RÈGLE de la spec : « une offre retirée ne reste pas un
    #: signal actuel »), `None` quand la date n'est pas exploitable. Seulement
    #: posé sur un signal `hiring`.
    stillOpen: bool | None = None
    #: #3204.2 (épopée #3238) — combien d'AUTRES offres de la MÊME famille
    #: métier ce même employeur a publié dans cette moisson (0 = offre
    #: isolée). Compté seulement sur `hiring`, jamais deviné hors des lignes
    #: réellement moissonnées.
    similarOfferCount: int | None = None
    #: #3205.1 (épopée #3239) — un prestataire TIERS explicitement mentionné
    #: (« en partenariat avec X », `provider_mention.py`). `None` = aucun
    #: marqueur de partenariat dans le texte, jamais un nom deviné. Seulement
    #: posé sur un signal `hiring`.
    thirdPartyProviderMention: str | None = None
    #: #3204.2 (épopée #3238, reste) — la ville EXACTE du site qui a publié
    #: CE signal, telle que la source l'affiche pour CETTE ligne — DISTINCTE
    #: du nom déjà résolu pour l'entreprise (qui peut être multi-sites) :
    #: l'entité précise que la spec demande, sans jamais deviner une filiale
    #: d'un texte libre. `None` = la source ne publie pas de ville pour cette
    #: ligne, jamais devinée de la ville du groupe.
    siteCity: str | None = None
    #: #3204.7 (épopée #3238, reste) — `True` seulement quand LE TEXTE de
    #: CETTE offre nomme explicitement un départ/une succession
    #: (`job_context.derive_replacement_signal`). `False` par défaut — jamais
    #: deviné d'une récurrence d'offres (`REPLACEMENT_SIGNAL` dans
    #: `aggregatedSignals` sur `DiscoverCandidate` cite l'offre qui le porte).
    #: Seulement posé sur un signal `hiring`.
    replacementSignal: bool = False
    #: #4182 (EX-12) — « qui demande ce profil ? » : l'auteur de l'annonce (RH / cabinet) DISTINCT du
    #: manager possible, l'équipe, l'entité (le site de l'offre), un statut étayé / à identifier avec la
    #: méthode de qualification, et ``openFreelanceMission: False`` (une annonce RH n'est jamais une
    #: mission freelance ouverte). Voir `offer_requester.py`. Seulement posé sur un signal ``hiring``.
    requester: dict[str, Any] | None = None
    #: #4115 — la tranche que la grille (`discover_signal_grid.py`) range ce
    #: signal : ``"strong"`` (5 au plus par carte) ou ``"context"`` (10 au plus).
    #: ``None`` = non passé par la grille. Un RANG, jamais une probabilité.
    tier: str | None = None


def _space_sirens(req: DiscoverSignalsRequest) -> frozenset[str]:
    """Les SIREN valides transmis par l'API (jamais un SIRET tronqué, jamais un nom)."""
    return frozenset(siren for siren in (_digits9(raw) for raw in req.spaceSirens) if siren)


def _cut_signals_with_space_reserve(
    ranked: list[DiscoverCandidate], limit: int, space_sirens: frozenset[str]
) -> list[DiscoverCandidate]:
    """#4067 (reste) — la coupe à ``limit`` du mode Signaux, avec la réserve d'espace."""
    return cut_with_space_reserve(
        ranked, limit, space_sirens, siren_of=lambda c: c.siren, is_excluded=lambda _c: False
    )


class DiscoverSource(BaseModel):
    name: str
    url: str | None = None
    fetchedAt: str


class DiscoverCandidate(BaseModel):
    # Registre — factuel, jamais inventé.
    name: str
    siren: str
    nafCode: str | None = None
    sector: str | None = None
    city: str | None = None
    department: str | None = None
    headcountRange: str | None = None
    creationDate: str | None = None
    #: #5008.1 — la base de la zone (siège / implantation) ; absente sans preuve.
    geography: dict | None = None
    # Calculé — déterministe, explicable, sans LLM (`discover_scoring`).
    # `None` = aucun critère n'était évaluable ; l'UI écrit alors « score
    # indisponible » au lieu d'un 0 qui aurait l'air mesuré.
    score: float | None = None
    #: Dénominateur RÉEL : plafonds des seuls blocs qu'on a pu mesurer.
    scoreMax: int = 0
    #: Blocs du barème sans donnée — dits, jamais comptés comme des zéros.
    scoreUnmeasured: list[str] = Field(default_factory=list)
    scoreFactors: list[dict] = Field(default_factory=list)
    #: Second axe du contrat : à quel point la donnée sous-jacente est sûre.
    dataConfidence: int | None = None
    #: Le SECOND nombre (tome 1 §6.4) — {score, max, unmeasured[], factors[]}.
    #: Il vit à part et n'entre dans aucune somme : c'est ce qui l'empêche
    #: structurellement de se fondre dans le score d'intérêt.
    addressability: dict | None = None
    signals: list[DiscoverSignal] = Field(default_factory=list)
    #: #4284.26 — ses seules offres sont hors des métiers de l'espace : gardé, rangé plus bas, l'écran le dit.
    outOfTrade: bool = False
    # Suggéré — produit par le LLM en aval, jamais ici.
    angle: str | None = None
    suggestedRoles: list[dict] = Field(default_factory=list)
    # État portefeuille — résolu côté API (NestJS), défaut neutre ici.
    #: Le NAF peut désigner une ESN comme un cabinet qui n'en est pas un
    #: (70.22Z, 62.09Z). La ligne apparaît alors dans les DEUX lectures et le
    #: dit, au lieu d'être rangée d'un côté au hasard.
    nafAmbiguous: bool = False
    #: #2265.1/.3 — la typologie unifiée (`actor_typology.py`), calculée sur les
    #: MÊMES preuves que `nafAmbiguous`/`intermediated` juste au-dessus (GA-26,
    #: aucun second calcul). `NON_CLASSE` tant qu'aucun signal ne tranche —
    #: jamais un type deviné. Capacité backend : aucun écran ne l'affiche
    #: encore (même profil que #2424.4/.6).
    actorType: str = ActorType.NON_CLASSE.value
    #: #2265.14 — LE SEUL signal stable pour un badge écran : `actorType`
    #: porte la PROSE française (`ActorType.value`), pas traduisible côté
    #: client sans deviner un mapping. `isIntermediary` nomme le seul jugement
    #: qu'un badge doit prendre aujourd'hui — « ce candidat n'est pas le
    #: client final, c'est un cabinet ou une plateforme qui publie POUR un
    #: tiers » — dérivé du MÊME classement qu'`actorType` (GA-26, aucun
    #: second calcul).
    isIntermediary: bool = False
    #: #3757 — « une ESN n'est pas un client final » : `true` pour une ESN (ou une
    #: ESN du référentiel), jamais pour un NAF ambigu (il garde `nafAmbiguous`).
    #: Dérivé du MÊME classement qu'`actorType` (GA-26) ; l'écran la nomme
    #: concurrente ou partenaire rang 2 potentiel, et le tri la range APRÈS les
    #: clients finaux — l'ordre change, jamais le contenu.
    isEsnPeer: bool = False
    #: #3757 (reste) — distingue, ligne par ligne, « concurrente » (hypothèse
    #: NAF, `isEsnPeer`) de « partenaire de rang 2 » (fait DÉCLARÉ par cet
    #: espace, `declaredPartnerSirens`). `true` ⇒ `isEsnPeer` est TOUJOURS
    #: `false` : `classify_actor_type` rend un seul type par candidat
    #: (`PARTENAIRE` prime sur le NAF, voir son ordre de preuves), jamais les
    #: deux badges à la fois.
    isDeclaredPartner: bool = False
    #: #4746.2 (lot P) — la pastille d'« Autres acteurs » (`esn`, `recruiter`, `interim`, `partner`, `adsite`), dérivée du
    #: MÊME classement qu'`actorType` (GA-26) ; absente pour un client final ou un acteur non prouvé.
    actorKind: str | None = None
    #: Lot T — la preuve d'une ESN reconnue hors NAF (``referential`` / ``offers``) ; ``None`` sinon.
    esnRecognition: str | None = None
    portfolioState: str = "new"
    accountId: str | None = None
    sources: list[DiscoverSource] = Field(default_factory=list)
    #: #2291.2 — le modèle de contrat OBSERVÉ (`contract_model.py`), lu sur les
    #: offres ET les avis BOAMP DÉJÀ moissonnés de cet employeur. Trois états,
    #: comme le contrat partagé : clé ABSENTE = ni offres ni avis BOAMP lus
    #: (trouvé par un marché ATTRIBUÉ DECP seulement) ; ``None`` = lus, rien
    #: d'attribuable ; objet = observation.
    contractModel: dict | None = None
    #: #3204.6/.7 (épopée #3238) — AGRÉGATION : au moins deux offres `hiring`
    #: de la MÊME famille métier, toutes deux `internal_hiring`/
    #: `staffing_signal` (`hiring_aggregation.py`). Liste vide = aucune
    #: famille n'atteint le seuil — jamais une croissance devinée sur une
    #: offre isolée.
    aggregatedSignals: list[dict] = Field(default_factory=list)
    #: #4437 (Louis 21/10) — posé SEULEMENT sur un compte ajouté par le palier voisin d'un signal maigre :
    #: ``{"axis": "signal", "requested": [...], "via": <type de fait>}``. Absent sur un compte exact.
    widenedFrom: dict | None = None

    @model_serializer(mode="wrap")
    def _omit_unread_contract_model(self, handler: SerializerFunctionWrapHandler) -> dict:
        # #2291.2 — jamais posé = jamais cherché : la clé ne sort pas, plutôt
        # qu'un ``null`` qui affirmerait « cherché, non observé ».
        data = handler(self)
        if "contractModel" not in self.model_fields_set:
            data.pop("contractModel", None)
        if self.widenedFrom is None:
            data.pop("widenedFrom", None)
        return data


class DegradedSource(BaseModel):
    source: str
    #: #2469 — un IDENTIFIANT STABLE (``siren_ambiguous``, ``network_error``…),
    #: jamais une phrase française : le texte visible vit dans le catalogue i18n
    #: du web, qui seul sait l'accorder et le traduire. Un client a lu ici
    #: « 1 entreprise(s) non vérifiée(s) … écartée(s) » — trois défauts d'un coup.
    #: Seule exception assumée, le chemin ``except`` du routeur, qui rend le
    #: message d'exception BRUT : une cause qu'on ignore ne se traduit pas.
    #: Garde : ``tests/test_degraded_reason_is_machine_readable.py``.
    reason: str
    count: int | None = None
    #: Les VALEURS que la raison désigne, quand elle en désigne — les libellés de
    #: secteur non reconnus, par exemple. Le web les recompose dans sa phrase.
    fields: list[str] | None = None
    #: Nature de l'entrée, pour que l'UI la CADRE sans lire la prose française :
    #: ``not-examined`` (borne de couverture — pas une panne), ``ambiguous``
    #: (verdict rendu sur la donnée), ``unreachable`` (panne réelle). Absent =
    #: source HS classique, comme avant.
    #:
    #: L'entrée ``not-examined`` reste DANS ``degraded`` en plus de ``coverage``,
    #: délibérément : un client qui ne connaît pas encore ``coverage`` doit
    #: quand même voir qu'il manque des entreprises. Perdre l'information en
    #: silence serait pire que la cadrer imparfaitement.
    kind: str | None = None


class DiscoverCoverage(BaseModel):
    """Ce que la liste a VRAIMENT couvert — le contraire d'un chiffre de résultats
    présenté comme un chiffre de marché.

    #631 a corrigé une panne de rate-limit rendue à l'écran comme « homonymie non
    tranchée » : un fait d'infra déguisé en fait de marché. Tronquer en silence
    est la même faute dans un autre costume — « 3 résultats » quand 117
    entreprises n'ont jamais été regardées.

    D'où quatre compteurs qui ne se recouvrent pas, et dont la somme est un
    invariant testé (``resolved + rejected* + notExamined == candidatesFound``) :

    - ``resolved`` — examinée, un SIREN réel trouvé ;
    - ``rejectedAmbiguous`` — EXAMINÉE puis rejetée : plusieurs entités portent ce
      nom, aucune ne domine. Un verdict rendu sur la donnée ;
    - ``rejectedUnreachable`` — EXAMINÉE, registre muet. Un verdict sur NOTRE
      infra, pas sur l'entreprise ;
    - ``notExamined`` — **jamais regardée**. Aucun verdict n'a été rendu. La
      ranger avec les rejets serait affirmer un jugement qu'on n'a pas porté.
    """

    #: Entreprises distinctes sorties de la moisson (après regroupement).
    candidatesFound: int = 0
    #: Combien on a réellement tenté de résoudre.
    resolutionsAttempted: int = 0
    resolved: int = 0
    rejectedAmbiguous: int = 0
    rejectedUnreachable: int = 0
    #: Moissonnées, jamais examinées. JAMAIS « écartées ».
    notExamined: int = 0
    #: #4319.2 — les NOMS des entreprises détectées mais non identifiées (jamais examinées + homonymes + registre
    #: muet), plafonnés : « je veux voir la liste ». Vide = aucune ligne côté écran.
    notIdentifiedNames: list[str] = Field(default_factory=list)
    #: Ce qui a arrêté la résolution : ``complete`` (tout examiné),
    #: ``max-resolutions`` (borne de coût) ou ``time-budget`` (borne de délai).
    stoppedOn: str = "complete"
    #: Décalage appliqué (reprise progressive).
    resolveOffset: int = 0
    #: Reste-t-il des entreprises non examinées ? C'est ce qui autorise l'UI à
    #: proposer « en examiner davantage » — et à ne PAS le proposer sinon.
    hasMore: bool = False
    #: Entreprises résolues puis écartées PAR LE FILTRE de nature (client / ESN).
    #: Comptées à part : ce n'est ni un rejet de donnée ni une borne, c'est un
    #: choix de l'utilisateur, et le taire ferait croire que le territoire est
    #: plus pauvre qu'il ne l'est.
    filteredByEntityType: int = 0
    #: Entreprises résolues puis écartées PAR LE FILTRE de secteur. Même raison
    #: que ci-dessus, et un cas de plus qu'il faut compter : une entreprise dont
    #: le NAF est illisible est écartée quand un secteur est demandé (on ne peut
    #: pas affirmer qu'elle en est), et ce retrait-là doit se voir.
    filteredBySector: int = 0
    #: #2616.1 — entreprises résolues puis écartées par le filtre CDI. Même
    #: raison que `filteredBySector` : un choix de l'utilisateur, jamais tu.
    filteredByContractType: int = 0
    #: #3096 — entreprises résolues puis écartées par le filtre de politique de
    #: télétravail. Même raison que `filteredByContractType`.
    filteredByRemotePolicy: int = 0
    #: #3097 — entreprises résolues puis écartées par le filtre de séniorité.
    #: Même raison que `filteredByRemotePolicy`.
    filteredBySeniority: int = 0
    #: #3226 (#3203.6) — entreprises résolues puis écartées par le filtre de
    #: delivery fit. Même raison que `filteredBySeniority`.
    filteredByDeliveryFit: int = 0


class DiscoverSignalsResponse(BaseModel):
    candidates: list[DiscoverCandidate] = Field(default_factory=list)
    query: dict = Field(default_factory=dict)
    degraded: list[DegradedSource] = Field(default_factory=list)
    coverage: DiscoverCoverage = Field(default_factory=DiscoverCoverage)
    #: #4437 — le palier voisin d'un recrutement qualifié maigre : ``{requested, added, via}`` (ou
    #: ``skipped``). Absent quand rien n'a été élargi — jamais un « 0 ajouté » sur une recherche non élargie.
    widening: dict | None = None


# ── agrégation ─────────────────────────────────────────────────────────────


class _Group:
    """Une entreprise en cours de construction : son identité brute + ses signaux."""

    __slots__ = ("name", "siren", "department", "city", "signals", "sources", "freshest", "job_rows", "tender_rows")

    def __init__(self, name: str) -> None:
        self.name = name
        self.siren: str | None = None
        self.department: str | None = None
        self.city: str | None = None
        self.signals: list[dict] = []
        self.sources: list[dict] = []
        self.freshest: str = ""
        #: #2291.2 — les offres LUES de cet employeur (date + code natif de
        #: contrat), pour observer son modèle de contrat sans appel de plus.
        self.job_rows: list[dict] = []
        #: #2291.2 (lot R, 19/09/2026) — les avis BOAMP LUS où cet employeur
        #: est l'ACHETEUR (date + texte de l'objet), même règle de lecture que
        #: le mode registre (`contract_model.py::_public_contracts`).
        self.tender_rows: list[dict] = []

    def absorb(self, row: dict, source_key: str, fetched_at: str) -> None:
        signal = row.get("signal") or {}
        date = str(signal.get("date") or "")
        if not date:
            return  # date obligatoire (contrat) — un signal sans date n'en est pas un
        self.siren = self.siren or _digits9(row.get("siren"))
        self.department = self.department or (row.get("department") or None)
        self.city = self.city or (row.get("city") or None)
        # #2616.1 — le CDI distinguable : lu sur la MÊME table que
        # `contract_model.job_kind` (GA-26), jamais dupliquée ; posé seulement
        # sur un signal `hiring`, jamais deviné (`None` quand la source ne
        # porte pas de code vérifié — APEC, recherche publique…).
        # #3204 — la MÊME table vérifiée que `contract_type` ci-dessous,
        # calculée une seule fois : `job_kind(row)` sert au CDI distinguable
        # ET à la catégorie commerciale (GA-26 — un réglage vit à un seul
        # endroit). `None` hors `hiring`.
        job_kind_value = job_kind(row) if source_key == "hiring" else None
        # #4999 / #5000 — CDI, CDD, intérim (à part) ou freelance, lu sur le code natif de la source
        # (jamais le texte libre), par la MÊME table que `job_kind`.
        contract_type = signal_contract_type(row) if source_key == "hiring" else None
        # #3096 — même restriction que `contract_type` juste au-dessus : posé
        # seulement sur un signal `hiring`, et seulement quand le texte de
        # l'offre le dit explicitement (`derive_remote_policy` rend `None`
        # sinon, jamais `sur_site` par défaut).
        remote_policy = (
            derive_remote_policy(signal.get("label"), signal.get("detail")) if source_key == "hiring" else None
        )
        # #3097 — même restriction : posé seulement sur `hiring`. Le titre
        # prime ; `experienceLabel` (France Travail, absent des autres
        # sources) ne tranche que quand le titre est muet sur la séniorité.
        seniority = (
            derive_seniority(signal.get("label"), row.get("experienceLabel")) if source_key == "hiring" else None
        )
        # #3097 — jamais un TJM estimé : le libellé PASSE, tel que la source
        # l'affiche (`row.get("salaryLabel")`, absent ⇒ `None`), aucune
        # dérivation ici.
        salary_label = row.get("salaryLabel") if source_key == "hiring" else None
        # #3204 — la catégorie commerciale de l'offre, TOUJOURS posée sur un
        # signal `hiring` (le classifieur est total, voir `hiring_signal.py`).
        # `intermediated` n'est connu qu'APRÈS `absorb` (résolution du nom
        # registre, plus bas dans ce fichier) : recalculée là-bas, jamais ici.
        hiring_signal_class = classify_hiring_signal(job_kind_value) if source_key == "hiring" else None
        # #3203 (extension #3226/#3203.8) — le delivery fit EXTERNE, DISTINCT
        # de `remote_policy` ci-dessus (voir le docblock de `delivery_fit.py`) :
        # même texte lu, question différente. Posé sur `hiring` ET `tender` —
        # un avis de marché public peut aussi porter une mention explicite
        # (« intervention sur site exclusivement »), même texte-source que le
        # LABEL déjà lu par `tender_rows` ci-dessous (#2291.2). Les autres
        # champs de cette fonction (`remote_policy`/`seniority`/`salary_label`/
        # `contract_type`) restent `hiring`-seulement : des concepts propres à
        # une offre d'EMPLOI, sans équivalent sur un marché public.
        delivery_fit = (
            classify_delivery_fit(signal.get("label"), signal.get("detail"))
            if source_key in ("hiring", "tender")
            else None
        )
        # #3237 (reste de #3203.4 — « source et fraîcheur ») : calculée pour
        # hiring ET tender, MÊME fenêtre que `still_open` ci-dessous pour
        # hiring (GA-26, jamais un second calcul de date) — le type de signal
        # change seulement la fenêtre d'archive (`signal_freshness.py`).
        signal_freshness = (
            classify_signal_freshness(date, signal_type="recrutement" if source_key == "hiring" else "appel_offres")
            if source_key in ("hiring", "tender")
            else None
        )
        # #3226 (#3203.4, étendu #3203.8) — les treize axes, sur le MÊME texte.
        # Distinct de `delivery_fit` juste au-dessus (voir le docblock de
        # `delivery_fit.py` — les deux ne se recomposent jamais l'un l'autre).
        delivery_fit_axes = (
            classify_delivery_fit_axes(signal.get("label"), signal.get("detail"), freshness=signal_freshness)
            if source_key in ("hiring", "tender")
            else None
        )
        # #3204.2 (épopée #3238) — EXTRACTION, les champs manquants de la
        # spec (famille métier, technologies, équipe, rattachement, statut
        # encore ouvert). Tous seulement posés sur `hiring`, même restriction
        # que les champs ci-dessus.
        # #4437.5 — un intitulé LIBRE porte aussi sa compétence et sa famille (rattachement lu avec l'offre compris).
        technologies, job_family = (
            read_offer_title(signal.get("label"), signal.get("detail"), [], row.get("attached"))
            if source_key == "hiring"
            else ([], None)
        )
        team = derive_team(signal.get("label"), signal.get("detail")) if source_key == "hiring" else None
        reports_to = (
            derive_reporting_line(signal.get("label"), signal.get("detail")) if source_key == "hiring" else None
        )
        # #3205.1 (épopée #3239) — un prestataire TIERS mentionné dans le
        # texte de l'offre (« en partenariat avec X »), jamais l'employeur
        # lui-même (déjà résolu par le registre, plus bas dans ce fichier).
        third_party_provider_mention = (
            derive_third_party_provider_mention(signal.get("label"), signal.get("detail"))
            if source_key == "hiring"
            else None
        )
        # #3204.7 (épopée #3238, reste) — REPLACEMENT_SIGNAL : `True`
        # seulement quand LE TEXTE de CETTE offre nomme explicitement un
        # départ/une succession (`job_context.py`) — jamais deviné d'une
        # récurrence d'offres (voir `hiring_aggregation.py`).
        replacement_signal = (
            derive_replacement_signal(signal.get("label"), signal.get("detail")) if source_key == "hiring" else False
        )
        # #3204.2 (épopée #3238, reste) — ENTITÉ PRÉCISE, au-delà du nom déjà
        # résolu : la ville EXACTE que CETTE ligne porte, jamais celle du
        # premier signal absorbé par le groupe (``self.city`` ci-dessus, qui
        # reste la ville du GROUPE). Un employeur multi-sites (même SIREN)
        # publie des offres dans des villes différentes sans que le nom
        # résolu du groupe ne les distingue — fait BRUT de la source, jamais
        # deviné d'un texte libre (la voie écartée dans le lot précédent).
        site_city = str(row.get("city")).strip() or None if row.get("city") else None
        # RÈGLE : « une offre retirée ne reste pas un signal actuel ». Même
        # fenêtre de fraîcheur que `signal_freshness` pour le type
        # « recrutement » (GA-26) : au-delà, l'offre est probablement pourvue
        # ou désindexée, jamais présentée comme un signal actuel. `None` sur
        # une date non exploitable — « non mesuré » n'est jamais affirmé.
        still_open: bool | None = None
        if source_key == "hiring" and signal_freshness is not None:
            still_open = {"current": True, "archive": False, "undated": None}[signal_freshness]
        self.signals.append(
            {
                "type": str(signal.get("type") or source_key),
                "label": str(signal.get("label") or ""),
                "date": date,
                "url": signal.get("url") or None,
                "detail": signal.get("detail") or None,
                "contractType": contract_type,
                "deliveryFit": delivery_fit,
                "deliveryFitAxes": delivery_fit_axes,
                "remoteWorkPolicy": remote_policy,
                "seniority": seniority,
                "salaryLabel": salary_label,
                "hiringSignalClass": hiring_signal_class,
                "technologies": technologies,
                "jobFamily": job_family,
                "team": team,
                "reportsTo": reports_to,
                "stillOpen": still_open,
                "thirdPartyProviderMention": third_party_provider_mention,
                "siteCity": site_city,
                "replacementSignal": replacement_signal,
                # #4182 — de l'offre RH à l'équipe demandeuse, avec la preuve (le texte de l'offre).
                "requester": (
                    derive_offer_requester(
                        signal.get("label"),
                        signal.get("detail"),
                        team=team,
                        reports_to=reports_to,
                        site_city=site_city,
                        job_family=job_family,
                    )
                    if source_key == "hiring"
                    else None
                ),
            }
        )
        # #2616.1 — un ROW peut porter SA PROPRE attribution (``sourceLabel``,
        # ex. « APEC ») quand plusieurs connecteurs alimentent le MÊME bucket
        # logique (``hiring``) : le libellé par défaut du bucket
        # (``SOURCE_LABELS``) resterait sinon toujours « France Travail »,
        # même pour une ligne qu'elle n'a pas produite.
        self.sources.append(
            {
                "name": row.get("sourceLabel") or SOURCE_LABELS.get(source_key, source_key),
                "url": signal.get("url") or None,
                "fetchedAt": fetched_at,
            }
        )
        self.freshest = max(self.freshest, date)
        if source_key == "hiring":
            self.job_rows.append({"date": date, "contractCode": row.get("contractCode")})
        elif source_key == "tender":
            # #2291.2 (lot R) — le texte porteur du mode est le LABEL du signal
            # (« AO IT publié — {objet} ») : la source ne publie pas l'objet à
            # part. Le préfixe fixe ne matche jamais les tournures régie/forfait.
            self.tender_rows.append({"date": date, "title": str(signal.get("label") or "")})

    def stamp_similar_offer_counts(self) -> None:
        """#3204.2 (épopée #3238) — EXTRACTION, « récurrence des offres
        similaires ». Compte, PAR famille métier, combien d'AUTRES signaux
        `hiring` de ce même employeur partagent la même famille — 0 quand
        l'offre est isolée ou que sa famille n'a pas pu être classée
        (`jobFamily` absent ⇒ jamais comptée, une famille inconnue ne peut pas
        prouver une récurrence). Appelé une seule fois, après que TOUTES les
        sources ont été absorbées (y compris un `merge` inter-lots) — compter
        pendant l'absorption sous-compterait les offres encore à venir."""
        families = [s.get("jobFamily") for s in self.signals if s.get("type") == "hiring" and s.get("jobFamily")]
        for signal in self.signals:
            if signal.get("type") != "hiring":
                continue
            family = signal.get("jobFamily")
            signal["similarOfferCount"] = (families.count(family) - 1) if family else 0

    def merge(self, other: _Group) -> None:
        self.siren = self.siren or other.siren
        self.department = self.department or other.department
        self.city = self.city or other.city
        self.signals.extend(other.signals)
        self.sources.extend(other.sources)
        self.freshest = max(self.freshest, other.freshest)
        self.job_rows.extend(other.job_rows)
        self.tender_rows.extend(other.tender_rows)


def _naf_matches_prefixes(naf_code: str | None, prefixes: list[str]) -> bool:
    """#2489.3 — même convention que `esn_naf.py` : comparaison sur les
    CHIFFRES seuls, sans point ni casse (le registre écrit « 3030 », la table
    des secteurs écrit « 30.30Z »)."""
    digits = "".join(ch for ch in str(naf_code or "") if ch.isdigit())
    return bool(digits) and any(digits.startswith(prefix) for prefix in prefixes)


def _digits9(value: object) -> str | None:
    """SIREN à 9 chiffres depuis un SIREN/SIRET. None si l'identifiant est trop
    court — on ne complète jamais un identifiant partiel."""
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[:9] if len(digits) >= 9 else None


def _group_key(row: dict) -> str | None:
    """Clé de regroupement : SIREN si la source le porte, sinon nom normalisé."""
    siren = _digits9(row.get("siren"))
    if siren:
        return f"siren:{siren}"
    name = normalize_name(str(row.get("name") or ""))
    return f"name:{name}" if name else None


def _group_rows(harvest: list[tuple[str, list[dict]]]) -> list[_Group]:
    fetched_at = datetime.now(UTC).isoformat()
    groups: dict[str, _Group] = {}
    for source_key, rows in harvest:
        for row in rows or []:
            # DECP ne publie que des SIRET : une ligne sans nom mais avec un
            # identifiant registre est parfaitement exploitable (le nom est
            # résolu ensuite). Sans NI nom NI SIREN, il n'y a rien à prospecter.
            if not isinstance(row, dict):
                continue
            key = _group_key(row)
            if not key:
                continue
            group = groups.get(key)
            if group is None:
                group = groups[key] = _Group(str(row.get("name") or "").strip())
            group.absorb(row, source_key, fetched_at)
    return [g for g in groups.values() if g.signals]


def _facts_from_scored(candidate: ScoredCandidate) -> dict:
    return {
        "name": candidate.name,
        "nafCode": candidate.naf_code,
        "nafLabel": candidate.naf_label,
        "city": candidate.city,
        "department": candidate.department,
        "headcount": candidate.headcount,
        "sizeClass": candidate.size_class,
        # Les trois entrées de la barrière d'achat (tome 3) : la catégorie INSEE,
        # le nombre d'établissements et la date de création. Elles étaient déjà
        # résolues et jetées ici — le scoreur ne les voyait pas.
        "establishmentCount": candidate.establishment_count,
        "headcountTranche": candidate.headcount_tranche,
        "creationDate": candidate.creation_date,
        # #2616.2 — sans cette ligne, un candidat résolu par NOM (BOAMP,
        # France Travail, APEC) ne portait JAMAIS de catégorie juridique :
        # `is_public_employer` restait `None` même pour une commune.
        "legalCategory": candidate.legal_category,
    }


def _facts_from_registry_row(row: dict) -> dict:
    return {
        "name": str(row.get("name") or "").strip(),
        "nafCode": row.get("nafCode"),
        "nafLabel": row.get("nafLabel"),
        "city": row.get("city"),
        "department": row.get("department"),
        "headcount": tranche_to_employees(row.get("headcountTranche")),
        "sizeClass": row.get("sizeClass"),
        "establishmentCount": row.get("establishmentCount"),
        "headcountTranche": row.get("headcountTranche"),
        "creationDate": row.get("creationDate"),
        # #2616.2 — voir la même note sur `_facts_from_scored` ci-dessus.
        "legalCategory": row.get("legalCategory"),
    }


def _headcount_range(facts: dict | None) -> str | None:
    """#3814.2 — recette prod 08/10 : le tri « Taille (effectif) » n'était pas
    monotone (4 999 avant 10 000+). Cause racine : ce libellé était FABRIQUÉ
    (`f"{employees}+ salariés"`) à partir du plancher de la tranche — sans
    séparateur de milliers (« 2000 » au lieu de « 2 000 ») et avec un « + »
    posé à TOUTE tranche, y compris une tranche FERMÉE (« 2 000 à 4 999 »
    rendue comme « 2000+ », donc lue OUVERTE). Le libellé CANONIQUE de la
    tranche (même table que `insee_sirene.py`/`company_filters.py` partout
    ailleurs) ne se fabrique pas : il se LIT sur le code déjà porté par
    `facts["headcountTranche"]`.
    """
    if not facts:
        return None
    label = headcount_label(facts.get("headcountTranche"))
    if label:
        return label
    return facts.get("sizeClass") or None


async def _resolve_identity_with_one_retry(name: str):
    """DISCOVER-ID (18/10) — UNE relance quand le registre est resté muet (verdict `none`, ou exception).

    Le registre public plafonne à 7 req/s par IP : six résolutions en parallèle prenaient des 429 en rafale,
    chacun devenait `none` → `unreachable` → entreprise écartée sans seconde chance (« 1 résultat sur 26 »).
    La relance passe derrière le recul partagé (`_back_off_from`), donc elle attend la fenêtre suivante ; le
    budget de résolution (`wait_deadline`) la coupe si le registre est vraiment tombé. Une homonymie
    (`ambiguous`) est un fait sur la donnée : jamais relancée. Une seule relance — pas de boucle."""
    try:
        first = await resolve_company_identity(name)
    except Exception:  # noqa: BLE001 — même contrat que l'appelant : le registre ne casse pas le run
        return await resolve_company_identity(name)
    if first.status == "none" and not _digits9(first.selected_siren):
        return await resolve_company_identity(name)
    return first


#: #4319.2 — plafond de la liste montrée : au-delà, l'écran dit combien d'autres (le compte reste exact).
MAX_NOT_IDENTIFIED_NAMES = 50


def _not_identified_names(unidentified: list[tuple[str, str]], beyond_budget: list[_Group]) -> list[str]:
    """Les noms (sans doublon, ordre d'apparition) des entreprises détectées mais non identifiées."""
    names: list[str] = []
    for name in [n for _, n in unidentified] + [g.name for g in beyond_budget]:
        clean = str(name or "").strip()
        if clean and clean not in names:
            names.append(clean)
    return names[:MAX_NOT_IDENTIFIED_NAMES]


async def _resolve_groups(
    groups: list[_Group],
    unidentified: list[tuple[str, str]] | None = None,
) -> tuple[list[tuple[_Group, str, dict | None]], dict[str, int]]:
    """Attache un SIREN RÉEL et une identité registre à chaque groupe.
    Retourne (résolus, {cause d'écart: compte}). ``unidentified`` (optionnel) reçoit, pour chaque écart,
    ``(cause, nom)`` : #4319.2, l'écran montre la liste et pas seulement le compte.

    Les écarts sont comptés PAR CAUSE, parce que les deux causes réelles n'ont
    rien à voir et appellent des réactions opposées :

    - ``ambiguous`` — plusieurs entités crédibles portent ce nom et aucune ne
      domine. C'est un fait sur la donnée : on n'invente pas de SIREN ;
    - ``unreachable`` — le registre n'a rien répondu (panne, quota, 429). On ne
      sait pas, ce qui n'est pas la même chose que « c'est ambigu ». Le message
      les confondait, et un écran quasi vide s'expliquait alors par une
      homonymie imaginaire au lieu d'une source à réparer.

    Deux chemins, selon ce que la source a donné :

    - **La source porte déjà un identifiant registre** (DECP publie le SIRET de
      l'acheteur) : c'est un fait, pas une hypothèse. On fait un lookup EXACT
      par SIREN pour obtenir la raison sociale — sans quoi l'UI afficherait un
      SIRET. Aucune désambiguïsation n'a lieu d'être.
    - **La source ne porte qu'un nom** (BOAMP, France Travail) : le résolveur
      mono-entreprise existant (``resolve_company_identity`` →
      recherche-entreprises + scoring déterministe) tranche. Une homonymie non
      tranchée ne sélectionne AUCUN SIREN : le groupe est écarté, jamais deviné.
    """
    semaphore = asyncio.Semaphore(_RESOLVE_CONCURRENCY)
    deadline = time.monotonic() + max(0.0, RESOLUTION_BUDGET_S)

    async def _one(group: _Group) -> tuple[_Group, str | None, dict | None, str | None]:
        async with semaphore:
            # Le budget est vérifié APRÈS le sémaphore, donc juste avant de
            # partir sur le réseau : une tâche qui a passé sa vie en file
            # d'attente ne doit pas dépenser un jeton registre pour un résultat
            # qui arrivera après le couperet de l'API. Elle se déclare non
            # tentée — ce qui est la vérité — et sera comptée comme telle.
            if time.monotonic() >= deadline:
                return group, None, None, "not-attempted"
            try:
                if group.siren:
                    row = await identity_by_siren(group.siren)
                    facts = _facts_from_registry_row(row) if row else None
                    # Le SIREN est factuel (publié par le registre des marchés) ;
                    # il suffit à condition d'avoir un nom, du registre ou de la source.
                    if not (facts and facts.get("name")) and not group.name:
                        return group, None, None, "unreachable"
                    return group, group.siren, facts, None
                resolution = await _resolve_identity_with_one_retry(group.name)
            except Exception as exc:  # noqa: BLE001 — le registre ne doit jamais casser le run
                logger.warning("Discover signals: SIREN resolution failed for %r: %s", group.name, exc)
                return group, None, None, "unreachable"
        siren = _digits9(resolution.selected_siren)
        if not siren:
            # `none` = le registre n'a rendu aucun candidat (source muette ou en
            # panne) ; `ambiguous` = il en a rendu plusieurs sans dominant.
            return group, None, None, "ambiguous" if resolution.status == "ambiguous" else "unreachable"
        scored = next((c for c in resolution.candidates if _digits9(c.siren) == siren), None)
        # #3901.t — le MÊME filtre d'employeur que le chemin par compte (lot Y07,
        # `public_administration_mismatch`) : une offre de « Mairie de Still »
        # résolue sur la société privée STILL est un homonyme commune/entreprise,
        # écarté comme une homonymie non tranchée — jamais attribué. L'entité
        # résolue reste gardée quand le registre la dit publique (catégorie 7xxx).
        if (
            scored is not None
            and public_administration_mismatch(group.name, scored.name)
            and is_public_employer(scored.legal_category) is not True
        ):
            return group, None, None, "ambiguous"
        return group, siren, _facts_from_scored(scored) if scored else None, None

    resolved: list[tuple[_Group, str, dict | None]] = []
    dropped: dict[str, int] = {}
    # #2521 (suite) — sans ceci, un `_one()` déjà lancé pouvait dormir jusqu'au
    # `MAX_WAIT` du fournisseur (30 s par défaut) en attendant un jeton
    # registre, bien au-delà de `RESOLUTION_BUDGET_S` : la pré-vérification
    # ci-dessus ne protège que les tâches qui n'ont pas encore démarré.
    with wait_deadline(deadline):
        gathered = await asyncio.gather(*(_one(g) for g in groups))
    for group, siren, facts, cause in gathered:
        if siren:
            resolved.append((group, siren, facts))
        elif cause:
            dropped[cause] = dropped.get(cause, 0) + 1
            if unidentified is not None:
                unidentified.append((cause, group.name))
    return resolved, dropped


def _build_candidates(
    resolved: list[tuple[_Group, str, dict | None]],
    *,
    filters: dict,
    profile: dict,
    degraded: list[DegradedSource],
) -> list[DiscoverCandidate]:
    """Fusionne les groupes qui pointent vers la MÊME entité légale, puis rend
    des candidats contrat-conformes triés du signal le plus frais au plus ancien.

    Chaque candidat est SCORÉ par le scoreur déterministe partagé avec le chemin
    registre — sur les signaux datés qu'il porte (le bloc le plus lourd du
    barème, et la raison d'être de cet écran), les faits registre rendus par le
    résolveur, le département demandé et le profil ESN. Ce qui n'est pas
    mesurable est déclaré tel quel plutôt que noté zéro.
    """
    merged: dict[str, tuple[_Group, dict | None]] = {}
    for group, siren, facts in resolved:
        existing = merged.get(siren)
        if existing is None:
            merged[siren] = (group, facts)
            continue
        existing[0].merge(group)
        if existing[1] is None and facts is not None:
            merged[siren] = (existing[0], facts)

    candidates: list[DiscoverCandidate] = []
    for siren, (group, facts) in merged.items():
        # #3204.2 (épopée #3238) — recompté APRÈS la fusion par SIREN
        # ci-dessus : compter avant sous-compterait les offres d'un groupe
        # nommé différemment (ex. APEC) qui pointe vers la MÊME entité légale.
        group.stamp_similar_offer_counts()
        signals = sorted(group.signals, key=lambda s: s["date"], reverse=True)
        seen: set[tuple[str, str]] = set()
        sources: list[DiscoverSource] = []
        for src in group.sources:
            key = (src["name"], str(src.get("url") or ""))
            if key in seen:
                continue
            seen.add(key)
            sources.append(DiscoverSource(**src))
        facts = facts or {}
        # Le piège du cabinet de recrutement (tome 2 §13) — et son pendant
        # plateforme (#2265.4/#2265.9) : les plus gros publieurs d'offres IT de
        # France sont des intermédiaires, cabinet OU plateforme de mise en
        # relation (Collective.work, Malt…). Le NAF rendu par le résolveur
        # tranche l'axe cabinet — aucun appel réseau de plus — et le nom ne
        # sert que si le registre n'a rien dit ou ne concerne pas cet axe.
        kind = intermediary_kind(name=(facts.get("name") or group.name), naf=facts.get("nafCode"))
        # Recette 21/10 B.6 (S.14, règle Louis 09/10 : signaux de recrutement = secteur de l'ESN) — une agence
        # d'INTÉRIM (78.20Z ou nom reconnu) n'est pas un compte qui recrute : ses offres sont des missions pour des
        # tiers, hors métier. Elle ne fait aucune ligne (le cabinet de recrutement, lui, reste marqué ci-dessous).
        if is_temp_agency(name=(facts.get("name") or group.name), naf=facts.get("nafCode")) and any(
            s.get("type") == "hiring" for s in signals
        ):
            signals = [s for s in signals if s.get("type") != "hiring"]
            if not signals:
                continue
        intermediated = kind is not None
        if intermediated:
            for signal in signals:
                if signal.get("type") != "hiring":
                    continue
                signal["intermediated"] = True
                # #3204 — un signal intermédié écrase toute autre catégorie
                # commerciale (voir `hiring_signal.classify_hiring_signal`) :
                # il ne dit rien du besoin de l'employeur nommé.
                signal["hiringSignalClass"] = classify_hiring_signal(None, intermediated=True)
                note = intermediated_note(kind)
                detail = str(signal.get("detail") or "").strip()
                signal["detail"] = f"{detail} · {note}" if detail else note
                # #4182 — l'auteur d'une offre intermédiée est un cabinet, pas l'employeur affiché.
                signal["requester"] = derive_offer_requester(
                    signal.get("label"),
                    signal.get("detail"),
                    team=signal.get("team"),
                    reports_to=signal.get("reportsTo"),
                    site_city=signal.get("siteCity"),
                    job_family=signal.get("jobFamily"),
                    intermediated=True,
                )
        # #2616.2 — distinguer les employeurs PUBLICS d'un signal de
        # recrutement (jamais les signaux tender/award : un acheteur BOAMP/
        # DECP se nomme déjà comme public). `None` tant que la catégorie
        # juridique n'est pas résolue — jamais deviné (GA-18/GA-19).
        public_employer = is_public_employer(facts.get("legalCategory"))
        if public_employer is not None:
            for signal in signals:
                if signal.get("type") == "hiring":
                    signal["publicEmployer"] = public_employer
        # #4115 — LA GRILLE, à l'appelant réel : rejet par type (stage, bruit,
        # type inconnu), un fait repris = une ligne, ordre adéquation ›
        # fraîcheur › force, plafond 5 forts + 10 contexte. Placée AVANT le
        # score : un signal rejeté ne doit pas marquer de points. Un compte dont
        # plus aucun signal ne survit n'est pas une ligne (« une absence ne
        # fait aucune ligne »).
        # #3901.p (Louis 16/10) — une offre hors des métiers de l'ESN n'est pas un signal : un compte sans autre signal sort.
        in_scope, _ = sort_signals_by_trade(signals, profile, caller="signals", discover_rule=True)
        # #4284.26 (décision 22, Louis 19/10) — RENVERSE « un compte sans autre signal sort » : un compte dont
        # il ne restait QUE des offres hors métier n'est JAMAIS écarté ; il reste, plus bas, marqué `outOfTrade`.
        naf_code = facts.get("nafCode")
        # #4284.26 (recette 21/10, L3) — le SECTEUR du compte dit aussi « hors métier » (même prédicat que le
        # registre) : seulement s'il ne lui reste aucune offre dans le métier — un compte hors secteur qui recrute
        # dans le métier de l'ESN reste ordinaire.
        sector_out = (
            bool(in_scope)
            and not any(s.get("type") == "hiring" for s in in_scope)
            and account_out_of_trade(naf_code, profile)
        )
        out_of_trade = (not in_scope and bool(signals)) or sector_out
        signals = arrange_signals(in_scope)
        if not signals and not out_of_trade:
            continue
        # #3907 — même filet que le registre (`discover._registry_row`) : à
        # défaut du libellé donné par la source résolue, on décode le code NAF
        # via la nomenclature publique plutôt que de laisser l'écran afficher
        # un code brut illisible. Jamais un libellé fabriqué ; un code hors
        # table laisse `sector` vide.
        sector = facts.get("nafLabel") or naf_label_for_code(naf_code) or naf_family_label(naf_code)
        company = {
            "name": (facts.get("name") or group.name),
            "siren": siren,
            "nafCode": naf_code,
            "sector": sector,
            "city": (facts.get("city") or group.city),
            "department": (facts.get("department") or group.department),
            "headcountRange": _headcount_range(facts),
            # Entrées de la barrière d'achat — le libellé d'effectif ne suffit
            # pas : « 250+ salariés » se lit 250 alors que le CODE de tranche
            # dit 5 000 à 9 999.
            "sizeClass": facts.get("sizeClass"),
            "headcountTranche": facts.get("headcountTranche"),
            "establishmentCount": facts.get("establishmentCount"),
            # Les sources de signal ne publient pas la date de création, et le
            # résolveur ne la remonte pas : le bloc ancienneté sera déclaré non
            # mesuré. On préfère le dire que rendre un « 0 sur 5 ».
            "creationDate": None,
        }
        scored = score_candidate(
            company,
            profile=profile,
            filters=filters,
            # Un signal intermédié est AFFICHÉ mais ne compte pas : il dit le
            # besoin du client du cabinet, jamais celui du cabinet. Le laisser
            # scorer ferait remonter les intermédiaires en tête de liste — ce
            # sont eux qui publient le plus d'offres IT du pays.
            signals=[s for s in signals if not s.get("intermediated")],
            # `data_confidence` retire 10 points PAR entrée de `degraded` : une
            # source en panne rend les faits moins sûrs, ce qui est juste. Mais
            # la borne de couverture n'est pas une panne — ne pas avoir REGARDÉ
            # 86 autres entreprises ne dit rien sur la qualité des faits de
            # celle-ci. L'inclure ferait dire au badge de confiance quelque
            # chose de faux sur des données parfaitement saines.
            degraded=[d.model_dump() for d in degraded if d.kind != "not-examined"],
        )
        # #2291.2 — le modèle de contrat OBSERVÉ, sur les offres ET les avis
        # BOAMP déjà lus de cet employeur. Elles lui sont ATTRIBUÉES par
        # construction (France Travail nomme l'employeur, BOAMP nomme
        # l'acheteur, le résolveur les a rattachés à ce SIREN) : d'où
        # ``company`` posé au nom du candidat pour les deux.
        #
        # #2291.2 (lot R) — l'exclusion « cabinet de recrutement » ne porte
        # QUE sur les offres d'emploi (elles parlent pour ses clients) :
        # ses propres avis de marché, s'il en a, restent lus normalement — un
        # cabinet peut être, par ailleurs, un acheteur public réel.
        observation: dict[str, Any] = {}
        if group.job_rows or group.tender_rows:
            job_rows = None if intermediated else [{**row, "company": company["name"]} for row in group.job_rows]
            tender_rows = [
                {"title": row["title"], "buyer": company["name"], "publishedDate": row["date"]}
                for row in group.tender_rows
            ]
            observation["contractModel"] = observe_contract_model(company["name"], job_rows, tender_rows)
        candidates.append(
            DiscoverCandidate(
                **company,
                **observation,
                geography=geography_from_signals(
                    company["city"], company["department"], filters.get("department"), signals
                ),
                score=scored["score"],
                scoreMax=scored["scoreMax"],
                scoreUnmeasured=scored["unmeasured"],
                scoreFactors=scored["factors"],
                dataConfidence=scored["dataConfidence"],
                addressability=scored["addressability"],
                signals=[DiscoverSignal(**s) for s in signals],
                outOfTrade=out_of_trade,
                sources=sources,
                # #3204.7 (épopée #3238) — les deux règles d'agrégation ne
                # partagent aucun seuil (voir le docblock de
                # `hiring_aggregation.py`) : TEAM_GROWTH_SIGNAL exige au
                # moins deux offres de la même famille, REPLACEMENT_SIGNAL
                # se contente d'UNE offre dont le texte le nomme.
                aggregatedSignals=[*aggregate_team_growth(signals), *aggregate_replacement_signals(signals)],
            )
        )

    # #4115 — adéquation › deux sources indépendantes › fraîcheur › force,
    # comparateur lexicographique pur (stable : à clé égale, l'ordre d'entrée tient).
    candidates.sort(key=lambda c: candidate_rank_key(s.model_dump() for s in c.signals))
    # #4284.26 — les comptes hors métier passent APRÈS tous les autres (tri stable : leur ordre relatif tient).
    candidates.sort(key=lambda c: c.outOfTrade)
    return candidates


# ── #2616.1 : WTTJ et les ATS boards CORROBORENT un candidat déjà trouvé ────
#
# Libellé humain des plateformes de corroboration — jamais un fournisseur À
# NOUS (GA-44) : ce sont les outils que l'entreprise CIBLE utilise pour
# publier ses offres, au même titre que « France Travail » ou « APEC ».
# Valeur absente de cette table = plateforme non reconnue → jamais devinée.
# GA-26 — table PARTAGÉE avec `job_search.py` (`job_platforms.py`), plus
# large qu'avant (Teamtailor/SmartRecruiters/Welcomekit) : une seule table de
# vérité, pas une copie qui aurait divergé au premier ajout.
_JOB_PLATFORM_LABELS = JOB_PLATFORM_LABELS

# Borne DÉDIÉE à la corroboration, distincte de HARVEST_BUDGET_S/RESOLUTION_BUDGET_S
# (15 s + 25 s = 40 s déjà consommés sous le couperet de 45 s du proxy NestJS).
# Volontairement courte : WTTJ est un no-op instantané sans clé, et un ATS
# board répond en un aller-retour HTTP (404 = cas le plus fréquent). Un jeton
# de débit qui ne tiendrait pas dans ce qui reste échoue vite (`wait_deadline`)
# plutôt que de manger la marge restante.
CORROBORATION_BUDGET_S = 4.0


async def _corroborate_hiring_platforms(candidates: list[DiscoverCandidate]) -> None:
    """France Travail et APEC balaient un TERRITOIRE ; WTTJ (`it_job_signals_wttj`)
    et les ATS boards (`it_job_signals_ats`, Greenhouse/Lever) sont ANCRÉES sur
    un nom d'entreprise — les mêmes fonctions que l'analyse de compte
    (``phase1_research.py`` :770,1085). Elles ne savent donc pas découvrir un
    compte de plus : elles CORROBORENT ceux que France Travail/APEC ont déjà
    remontés, une fois leur nom REGISTRE connu — « plusieurs plateformes »
    (#2616) devient vrai sur le MÊME candidat, jamais un cinquième bucket.

    Scoping délibéré, à deux niveaux :
    - seuls les candidats déjà porteurs d'un signal ``hiring`` sont
      corroborés (un compte trouvé par BOAMP/DECP seul n'a rien à corroborer
      ici) ;
    - seuls les candidats qui seront réellement AFFICHÉS (post-filtre,
      ``req.limit``) le sont — corroborer toute la fenêtre de résolution
      (jusqu'à 40, voir MAX_RESOLUTIONS) gaspillerait des appels sur des
      lignes que l'écran ne montre jamais.
    """
    fetched_at = datetime.now(UTC).isoformat()

    async def _one(candidate: DiscoverCandidate) -> None:
        hiring_signals = [s for s in candidate.signals if s.type == "hiring"]
        if not hiring_signals:
            return
        results = await asyncio.gather(
            it_job_signals_wttj(candidate.name, limit=5),
            it_job_signals_ats(candidate.name, limit=5),
            return_exceptions=True,
        )
        public_employer = next((s.publicEmployer for s in hiring_signals if s.publicEmployer is not None), None)
        intermediated = any(s.intermediated for s in hiring_signals)
        seen = {(s.name, str(s.url or "")) for s in candidate.sources}
        new_signals: list[DiscoverSignal] = []
        new_sources: list[DiscoverSource] = []
        for result in results:
            if isinstance(result, BaseException):
                logger.warning("Discover signals: corroboration failed for %r: %s", candidate.name, result)
                continue
            for job in result or []:
                if not isinstance(job, dict):
                    continue
                date = str(job.get("date") or "")
                if not date:
                    continue  # date obligatoire — même contrat que `_Group.absorb`
                platform = _JOB_PLATFORM_LABELS.get(str(job.get("source") or ""))
                if not platform:
                    continue  # plateforme non reconnue — jamais devinée
                title = job.get("title")
                url = job.get("url") or None
                # #3901.w — « IT » ne se fige pas côté IA : le secteur se décide à l'affichage.
                label = f"Recrutement — {title}" if title else "Recrutement"
                detail = job.get("contractType") or None
                # #2616.1 — même table que `_Group.absorb`/`job_kind` : WTTJ/ATS
                # rendent un libellé brut (``"CDI"`` ou un dict localisé déjà
                # nettoyé côté source), jamais lu comme distinguable jusqu'ici
                # sur ce chemin.
                jk = job_kind({"contractType": job.get("contractType")})
                new_signals.append(
                    DiscoverSignal(
                        type="hiring",
                        label=label,
                        date=date,
                        url=url,
                        detail=detail,
                        intermediated=intermediated,
                        publicEmployer=public_employer,
                        contractType=signal_contract_type({"contractType": job.get("contractType")}),
                        # #3204 — même classifieur total que `_Group.absorb`,
                        # sur ce chemin de corroboration aussi.
                        hiringSignalClass=classify_hiring_signal(jk, intermediated=intermediated),
                        # #3203 — même classifieur ; WTTJ/ATS ne portent pas de
                        # texte carrière ici, donc `unknown` dans l'immense
                        # majorité des cas, jamais deviné `compatible`.
                        deliveryFit=classify_delivery_fit(label, detail),
                    )
                )
                key = (platform, str(url or ""))
                if key not in seen:
                    seen.add(key)
                    new_sources.append(DiscoverSource(name=platform, url=url, fetchedAt=fetched_at))
        if not new_signals:
            return
        # #4115 — la même grille que `_build_candidates` : une offre de stage
        # corroborée par WTTJ/ATS ne rentre pas, le plafond 5+10 tient.
        candidate.signals = [
            DiscoverSignal(**s) for s in arrange_signals(s.model_dump() for s in [*candidate.signals, *new_signals])
        ]
        candidate.sources = [*candidate.sources, *new_sources]

    with wait_deadline(time.monotonic() + CORROBORATION_BUDGET_S):
        await asyncio.gather(*(_one(c) for c in candidates))


#: LUD.2 — les villes dont on sait la couverture départementale. Une ville absente d'ici ne devine rien.
#: LUD.2 — parallélisme BORNÉ d'une moisson multi-départements (les sources ont chacune leur limiteur).
_ZONE_FANOUT = 4


def signal_zone_departments(department: str | None, region: str | None, city: str | None) -> list[str]:
    """LUD.2 — les départements que la zone demandée couvre, ou ``[]`` (aucune zone / zone inconnue).

    Un département explicite l'emporte et ne s'élargit jamais ; sinon la région (code INSEE), sinon la
    ville connue. Jamais une zone devinée : un code ou un nom inconnu rend ``[]``.
    """
    from app.services.geo_labels import region_departments

    dept = "".join(ch for ch in (department or "") if ch.isalnum()).upper()[:3]
    if dept:
        return [dept]
    if (region or "").strip():
        return sorted(region_departments(region or ""))
    key = " ".join((city or "").strip().lower().split())
    return list(CITY_DEPARTMENTS.get(key, ()))


def _spread(make, departments: list[str], gate: asyncio.Semaphore):
    """LUD.2 — une source lue département par département (parallélisme borné par ``gate``), rangées réunies.

    Une panne partielle ne prive pas des départements qui ont répondu ; si TOUS échouent, la première
    erreur remonte (jamais un vide qui cache une panne). Le dédoublonnage par SIREN est celui de
    ``_group_rows``.
    """

    async def _one(dept: str):
        async with gate:
            return await make(dept)

    async def _run() -> list[dict]:
        results = await asyncio.gather(*(_one(d) for d in departments), return_exceptions=True)
        failures = [r for r in results if isinstance(r, BaseException)]
        for failure in failures:
            if isinstance(failure, asyncio.CancelledError):
                raise failure
        if failures and len(failures) == len(results):
            raise failures[0]
        return [row for r in results if not isinstance(r, BaseException) for row in r]

    return _run()


@router.post("/signals", response_model=DiscoverSignalsResponse)
async def discover_signals(req: DiscoverSignalsRequest, request: Request = None) -> DiscoverSignalsResponse:  # type: ignore[assignment]
    """Liste les comptes qui BOUGENT : AO ouverts, marchés attribués, recrutements."""
    # #4284.13 (#3901.14) — deux recherches identiques et simultanées partagent UN travail (pas un cache) :
    # elles se disputaient le même bucket registre (40 résolutions chacune) et finissaient toutes deux en « délai atteint ».
    work = single_flight(req, lambda: _discover_signals_once(req))
    # #4490.2 — « Arrêter » : la déconnexion du client coupe le travail, aucune étape payante après l'arrêt.
    return await (work if request is None else run_or_cancel(request, work))


#: #4437 — le palier voisin ne part que s'il reste ce temps avant le couperet de l'API (45 s, sans retry).
WIDEN_DEADLINE_S = 40.0
_WIDEN_MIN_S = 5.0


async def _discover_signals_once(req: DiscoverSignalsRequest) -> DiscoverSignalsResponse:
    """#4284.13 (#4045.12) — la recherche, et sa DURÉE : « /discover charge plus de 60 s » se mesure, elle ne s'estime pas."""
    started = time.monotonic()
    candidates = 0
    try:
        response = await _discover_signals_widened(req, started)
        candidates = len(response.candidates)
        return response
    finally:
        # Trois nombres seulement (comme `discover registry_calls=…`, #4363.1) : ni critère, ni nom, ni fournisseur.
        logger.info("discover signals duration_ms=%d candidates=%d", round((time.monotonic() - started) * 1000), candidates)


async def _discover_signals_widened(req: DiscoverSignalsRequest, started: float) -> DiscoverSignalsResponse:
    """#4437 — la recherche EXACTE, puis, si le signal demandé ramène peu, UN palier voisin (``signal_neighbours``)."""
    exact = await _discover_signals_exact(req)
    keywords = list(exact.query.get("keywords") or [])
    selected = list(exact.query.get("sources") or [])
    asked = qualified_hiring(selected, keywords)
    if req.resolveOffset or not should_widen(len(exact.candidates), requested=asked, strict=req.strictSignal):
        return exact
    step = widening_step(selected, keywords)
    if step is None:
        return exact
    requested = requested_labels(selected, keywords)
    remaining = WIDEN_DEADLINE_S - (time.monotonic() - started)
    if remaining < _WIDEN_MIN_S:
        exact.widening = {"requested": requested, "added": 0, "skipped": "time_budget"}
        return exact
    wider = req.model_copy(
        update={
            "sources": list(step.sources),
            "keywords": [] if step.drop_keywords else req.keywords,
            "limit": max(1, SIGNAL_WIDEN_BELOW - len(exact.candidates)),
        }
    )
    try:
        neighbour = await asyncio.wait_for(_discover_signals_exact(wider), timeout=remaining)
    except TimeoutError:
        exact.widening = {"requested": requested, "added": 0, "skipped": "time_budget"}
        return exact
    known = {c.siren for c in exact.candidates}
    added: list[DiscoverCandidate] = []
    for candidate in neighbour.candidates:
        if candidate.siren in known:
            continue
        kinds = [SOURCE_OF_SIGNAL_TYPE.get(s.type, s.type) for s in sorted(candidate.signals, key=lambda s: s.date, reverse=True)]
        via = next((k for k in kinds if k in step.sources), step.sources[0])
        candidate.widenedFrom = {"axis": "signal", "requested": requested, "via": via}
        added.append(candidate)
        known.add(candidate.siren)
    exact.candidates = [*exact.candidates, *added]
    exact.widening = {"requested": requested, "added": len(added), "via": list(step.sources)}
    for entry in neighbour.degraded:
        if entry not in exact.degraded:
            exact.degraded.append(entry)
    return exact


async def _discover_signals_exact(req: DiscoverSignalsRequest) -> DiscoverSignalsResponse:
    department = "".join(ch for ch in (req.department or "") if ch.isalnum()).upper()[:3] or None
    # LUD.2 — une région / une ville se couvre par ses départements ; un département seul : chemin d'avant.
    zone = signal_zone_departments(department, req.region, req.city)
    multi_zone = department is None and len(zone) > 0
    keywords = [k for k in (str(k or "").strip().lower() for k in req.keywords) if k]
    selected: list[SourceName] = list(req.sources) if req.sources else list(ALL_SOURCES)
    # Ordre stable, sans doublon — c'est ce que ``query`` renvoie à l'UI.
    selected = [s for s in KNOWN_SOURCES if s in selected]

    # Secteurs normalisés une fois, ici : c'est ce qui est FILTRÉ et ce qui est
    # RENDU dans `query`. Deux normalisations divergeraient, et l'écran croirait
    # avoir appliqué un critère que le filtre n'a pas vu.
    sectors = requested_sectors(req.sectors)
    # Un libellé de secteur absent de la table ne filtre RIEN — vider la liste
    # en silence serait le pire des deux échecs possibles — mais il est DIT.
    # Sans ça, l'écran croirait son critère appliqué alors qu'il est ignoré.
    unknown = unknown_sectors(req.sectors)

    query = {
        "department": department,
        "sinceDays": req.sinceDays,
        "keywords": keywords,
        "sources": selected,
        "limit": req.limit,
        "entityType": req.entityType,
        # RENDU même vide : l'écran doit pouvoir VÉRIFIER que son critère a été
        # appliqué, et c'est exactement ce qui manquait — rien ne partait, donc
        # rien ne revenait, donc rien ne pouvait le signaler.
        "sectors": sectors,
        # #2616.1 — même raison que `sectors` ci-dessus.
        "contractTypes": list(req.contractTypes),
        # #3096 — même raison.
        "remotePolicies": list(req.remotePolicies),
        # #3097 — même raison.
        "seniorities": list(req.seniorities),
        # #3226 (#3203.6) — même raison.
        "deliveryFitFilter": list(req.deliveryFitFilter),
    }

    # #4796 — la collecte ne regarde PLUS `req.limit` : le palier d'équipe gouverne l'affichage (coupe
    # finale), jamais ce qu'on va chercher. `HARVEST_ROWS_PER_PAGE` : la page la plus grande d'une source.
    per_source = HARVEST_ROWS_PER_PAGE
    harvest_deadline = time.monotonic() + HARVEST_BUDGET_S

    def _paged(label: str, dept: str | None, call):
        """Une source GRATUITE lue page après page (``discover_harvest_paging``) : ``call(offset, stats, first)``."""

        async def _page(offset: int, stats: dict[str, int]) -> list[dict]:
            return await call(offset, stats, offset == 0)

        async def _read() -> list[dict]:
            harvested = await harvest_pages(
                _page,
                page_rows=per_source,
                max_pages=HARVEST_MAX_PAGES,
                deadline=harvest_deadline,
                label=f"{label}:{dept or 'FR'}",
            )
            return harvested.rows

        return _read()

    # LUD.1 — les marchés suivent le pack de l'espace ; sans pack, le tri IT d'avant.
    market_pack = market_pack_for_profile(req.profile_data)
    market_kw = {"pack": market_pack} if market_pack else {}  # espace IT : l'appel d'avant, sans argument de plus
    zone_gate = asyncio.Semaphore(_ZONE_FANOUT)

    def _over_zone(make):
        # LUD.2 — `make(dept)` rend la lecture d'UN département ; hors zone multi, l'appel d'avant.
        if multi_zone:
            return _spread(make, zone, zone_gate)
        return make(department)

    runners: dict[SourceName, object] = {
        "tender": lambda: _over_zone(
            lambda d: _paged(
                "BOAMP",
                d,
                lambda off, st, _first: list_tender_buyers(
                    d, req.sinceDays, per_source, offset=off, page_stats=st, **market_kw
                ),
            )
        ),
        "award": lambda: _over_zone(
            lambda d: _paged(
                "DECP",
                d,
                lambda off, st, first: list_award_buyers(
                    d, req.sinceDays, per_source, offset=off, page_stats=st, name_vendors=first, **market_kw
                ),
            )
        ),
        "hiring": lambda: _over_zone(
            lambda d: _paged(
                "France Travail",
                d,
                lambda off, st, _first: list_hiring_companies(
                    d, keywords, req.sinceDays, per_source, profile=req.profile_data, offset=off, page_stats=st
                ),
            )
        ),
        # #3941.5 — BODACC B « augmentation de capital » : gratuit, sans clé, SIREN porté par l'annonce.
        "capital": lambda: _over_zone(lambda d: list_capital_increase_companies(d, req.sinceDays, per_source)),
        # #4732.1 — BODACC vente / fusion : même mécanique que le capital, signal « Rachat ou fusion ».
        "deal": lambda: _over_zone(lambda d: list_takeover_companies(d, req.sinceDays, per_source)),
    }

    # Les trois sources EN PARALLÈLE — une source lente ou HS n'attend pas les
    # autres. `wait_deadline` borne aussi ce qui se passe SOUS chaque source :
    # DECP nomme ses titulaires (`names_by_siren`) sur le registre PENDANT la
    # moisson, sur le même bucket que la résolution qui suit (`HARVEST_BUDGET_S`).
    #
    # #2616.1 — « comptes qui recrutent » lu sur TROIS registres publics, pas
    # un seul : APEC (cadres IT) et WTTJ s'ajoutent EN PARALLÈLE dans le bucket
    # `hiring` existant, jamais une quatrième/cinquième source sélectionnable —
    # `selected` (donc `query.sources`, ce que l'écran affiche comme critère
    # appliqué) ne change pas. `harvest_keys` porte "hiring" plusieurs fois
    # quand il est demandé : chaque résultat est traité INDÉPENDAMMENT
    # ci-dessous, donc une panne France Travail (clé absente) reste visible
    # dans `degraded` (aucune source HS masquée) même quand APEC ou WTTJ, elles,
    # ont livré des lignes — et réciproquement, une panne APEC ou WTTJ (jamais
    # levée en pratique : voir `list_hiring_companies_apec`/`_wttj`, gracieuses
    # par construction) ne prive jamais des lignes déjà collectées par les
    # autres sources du bucket.
    #
    # WTTJ (ATS Greenhouse/Lever exclu, voir `data_sources/ats_boards.py` :
    # « LA RÈGLE QUI PORTE CE MODULE — L'ATTRIBUTION » — un board ne s'atteint
    # QUE depuis une entreprise déjà connue + son domaine, jamais depuis un
    # territoire/mots-clés ; deviner un slug depuis un département inventerait
    # une attribution, ce que le module s'interdit lui-même).
    harvest_keys: list[SourceName] = list(selected)
    harvest_coros = [runners[s]() for s in selected]
    if "hiring" in selected:
        harvest_keys.append("hiring")
        # #3901 — le PROFIL (domaine d'offre, métiers placés) décide de la pertinence des offres.
        harvest_coros.append(
            _over_zone(
                lambda d: _paged(
                    "APEC",
                    d,
                    lambda off, st, _first: list_hiring_companies_apec(
                        d, keywords, req.sinceDays, per_source, profile=req.profile_data, offset=off, page_stats=st
                    ),
                )
            )
        )
        harvest_keys.append("hiring")
        harvest_coros.append(
            _over_zone(lambda d: list_hiring_companies_wttj(d, keywords, req.sinceDays, per_source, profile=req.profile_data))
        )
        # #2616.1 (23/09/2026) — WTTJ (ci-dessus) reste un no-op tant que
        # l'opérateur n'a pas d'accès partenaire Algolia (ça n'arrivera pas
        # vite, voir `wttj.py`) : cette QUATRIÈME contribution passe par le
        # MOTEUR DE RECHERCHE déjà branché (`job_search.py`, waterfall
        # Serper/Tavily/Brave) — résultats PUBLICS de recherche sur Welcome to
        # the Jungle et les ATS publics, jamais l'index privé WTTJ. Même
        # contrat gracieux que APEC/WTTJ (jamais d'exception typée).
        harvest_keys.append("hiring")
        harvest_coros.append(
            _over_zone(lambda d: list_hiring_companies_search(d, keywords, req.sinceDays, per_source, profile=req.profile_data))
        )

    with wait_deadline(harvest_deadline):
        results = await asyncio.gather(*harvest_coros, return_exceptions=True)

    degraded: list[DegradedSource] = []
    if unknown:
        # #2469 — la raison est une clé, les libellés voyagent à part : le web
        # écrit « Secteur non reconnu, donc NON appliqué : … », accordé et traduit.
        degraded.append(
            DegradedSource(
                source="discover",
                reason=UNKNOWN_SECTOR_REASON,
                count=len(unknown),
                fields=list(unknown),
            )
        )
    harvest: list[tuple[str, list[dict]]] = []
    for source_key, result in zip(harvest_keys, results, strict=True):
        label = SOURCE_LABELS[source_key]
        if isinstance(result, SignalSourceUnavailable):
            degraded.append(DegradedSource(source=result.source or label, reason=result.reason))
        elif isinstance(result, BaseException):
            # #4617 — jamais `str(exc)` NU : il peut recopier l'URL et sa clé. Mais le message
            # reste LISIBLE : « ValueError » seul ne dit rien à l'écran (garde #4518
            # `test_unexpected_source_error_is_reported_too`). Le masquage est celui du dépôt,
            # au seul endroit qui le porte (`redact_secrets`, GA-26).
            reason = redact_secrets(" ".join(str(result).split()))[:200] or result.__class__.__name__
            logger.warning("Discover signals: source %s failed: %s", label, reason)
            degraded.append(DegradedSource(source=label, reason=reason))
        else:
            harvest.append((source_key, list(result)))

    groups = _group_rows(harvest)
    if multi_zone:
        # LUD.2 — aucun résultat hors zone : un groupe dont le département connu sort de la zone tombe.
        zone_set = set(zone)
        groups = [g for g in groups if not g.department or normalize_department(g.department) in zone_set]
    # ORDRE DE RÉSOLUTION — du signal le plus frais au plus ancien.
    #
    # Ce n'est pas un tri par défaut, c'est le seul ordre honnête disponible ICI.
    # Le tri « par score » serait circulaire : le score a besoin des faits
    # registre (NAF, effectif, zone) que la résolution est précisément en train
    # de produire. Avant résolution on ne dispose que de ce que les sources
    # publient — et la date en est le champ porteur, celui que cet écran vend
    # (« la fraîcheur EST la valeur produit », docstring du module).
    #
    # Conséquence assumée : quand la borne mord, ce qui tombe est le signal le
    # plus ANCIEN, jamais « ce qui est arrivé en dernier dans la liste ». Une
    # troncature d'ordre d'arrivée aurait été arbitraire ; celle-ci est un choix
    # produit défendable, et l'utilisateur peut demander la suite.
    groups.sort(key=lambda g: g.freshest, reverse=True)
    candidates_found = len(groups)

    offset = min(req.resolveOffset, candidates_found)
    # #4796 — borne de COÛT fixe : le palier d'équipe (`req.limit`) ne la règle plus. Résoudre 20
    # comptes pour en couper 10 cachait les 40 suivants à un commercial « 1-3 personnes » ; la page
    # affichée est coupée plus bas, ce qui est résolu mais pas montré reste dans la page suivante.
    window = groups[offset : offset + MAX_RESOLUTIONS]
    unidentified: list[tuple[str, str]] = []
    resolved, dropped = await _resolve_groups(window, unidentified)

    # Non examinées = jamais tentées. Trois provenances, une seule signification :
    # aucun verdict n'a été rendu sur ces entreprises.
    #   - avant la fenêtre (déjà vues par un appel précédent : pas « non examinées »)
    #   - au-delà de la borne de coût
    #   - abandonnées par la borne de délai (comptées dans `dropped`)
    not_attempted = dropped.pop("not-attempted", 0)
    beyond_budget = max(0, candidates_found - offset - len(window))
    not_examined = beyond_budget + not_attempted
    attempted = len(window) - not_attempted
    if not_attempted:
        stopped_on = "time-budget"
    elif beyond_budget:
        stopped_on = "max-resolutions"
    else:
        stopped_on = "complete"

    # #2469 — TROIS CLÉS, TROIS CHIFFRES, ZÉRO PHRASE. Les trois phrases qui
    # vivaient ici sont parties telles quelles dans `discover.json` (FR et EN),
    # sous `degraded.reason.siren_*`, avec de vrais pluriels. Leur SENS n'a pas
    # bougé d'un iota, et chacune reste porteuse :
    #   · « écartée(s), aucun SIREN inventé » — la doctrine « jamais de donnée
    #     fictive », et ce que le commercial doit pouvoir répéter ;
    #   · « Panne de source, pas un problème de données » — la leçon de #631 :
    #     un fait d'infra déguisé en fait de marché ;
    #   · « détectée(s) mais NON EXAMINÉE(S) » — formulation SOUS SURVEILLANCE
    #     DE TEST : ni « écartée », ni « homonymie ». Ces entreprises n'ont pas
    #     été jugées, elles n'ont pas été regardées ; les ranger avec les rejets
    #     afficherait un verdict jamais rendu (#649).
    # La nature (`kind`) se DÉDUIT de la raison — un réglage, un seul endroit.
    if dropped.get("ambiguous"):
        degraded.append(
            DegradedSource(
                source="siren-resolution",
                reason=SIREN_AMBIGUOUS_REASON,
                count=dropped["ambiguous"],
                kind=degrade_kind(SIREN_AMBIGUOUS_REASON),
            )
        )
    if dropped.get("unreachable"):
        degraded.append(
            DegradedSource(
                source="siren-resolution",
                reason=SIREN_UNREACHABLE_REASON,
                count=dropped["unreachable"],
                kind=degrade_kind(SIREN_UNREACHABLE_REASON),
            )
        )
    if not_examined:
        degraded.append(
            DegradedSource(
                source="siren-resolution",
                reason=SIREN_NOT_EXAMINED_REASON,
                count=not_examined,
                kind=degrade_kind(SIREN_NOT_EXAMINED_REASON),
            )
        )

    # Le scoreur raisonne sur les critères DEMANDÉS à l'écran (le vocabulaire de
    # l'utilisateur), pas sur leur traduction interne — même règle que
    # `/discover/registry`. Le mode Signaux n'expose que la zone.
    score_filters = {"department": department} if department else {}
    built = _build_candidates(resolved, filters=score_filters, profile=req.profile_data, degraded=degraded)
    # #3757 (reste) — normalisé UNE fois, hors boucle : même fonction que la
    # résolution registre (`_digits9`), pour que « déclaré » et « résolu »
    # lisent le SIREN de la même façon des deux côtés.
    declared_sirens = {s for s in (_digits9(siren) for siren in req.declaredPartnerSirens) if s}
    for candidate in built:
        candidate.nafAmbiguous = bool(entity_type_flags(candidate.nafCode)["nafAmbiguous"])
        # #2265.1/.3 · #4746.2 · #4814 — UNE fonction partagée avec `/discover/registry` (GA-26) : aucun second
        # appel réseau. Un fait DÉCLARÉ par l'espace (#3757) prime sur l'hypothèse NAF.
        fields = actor_fields(
            naf=candidate.nafCode,
            name=candidate.name,
            is_declared_partner=_digits9(candidate.siren) in declared_sirens,
            siren=candidate.siren,
        )
        candidate.esnRecognition = fields["esnRecognition"]  # type: ignore[assignment]
        candidate.isEsnPeer = bool(fields["isEsnPeer"])
        candidate.isDeclaredPartner = bool(fields["isDeclaredPartner"])
        candidate.actorType = str(fields["actorType"])
        candidate.actorKind = fields["actorKind"]  # type: ignore[assignment]
        candidate.isIntermediary = bool(fields["isIntermediary"])
    # #2265.7 — un fournisseur de données (Pappers, Kompass…) n'est JAMAIS un
    # prospect : aucune ligne dans la liste, jamais une ligne « vide » (doctrine
    # « dans une liste, une absence ne fait aucune ligne »).
    built = [c for c in built if c.actorType != ActorType.SOURCE_DE_DONNEES.value]
    # #4746 — « clients finaux » retire aussi ce que le NAF seul ne voit pas (ESN connue par son nom,
    # plateforme de freelance) ; la lecture « ESN » reconnaît la même ESN par son nom : le rang 2 voulu
    # (#4285.3) reste atteignable, seul le choix de l'utilisateur change ce qu'il lit.
    def _kept(c: DiscoverCandidate) -> bool:
        known_esn = is_known_esn_name(c.name)
        if req.entityType == "client":
            return matches_entity_type(c.nafCode, "client") and matches_end_client(
                ActorType(c.actorType), is_known_esn=known_esn
            )
        if req.entityType == "esn" and known_esn:
            return True
        return matches_entity_type(c.nafCode, req.entityType)

    kept = [c for c in built if _kept(c)]
    filtered_out = len(built) - len(kept)
    # Le SECTEUR, appliqué au même endroit et pour la même raison que le type
    # d'entité : sur le NAF RÉSOLU, parce que les sources de signal ne rendent
    # ni SIREN ni NAF. Compté à part — ce n'est ni un rejet de donnée ni une
    # borne, c'est un choix de l'utilisateur.
    after_sector = [c for c in kept if matches_sectors(c.nafCode, sectors)]
    filtered_by_sector = len(kept) - len(after_sector)

    # #2489.3 — sans secteur COCHÉ, la liste ne doit toujours RIEN retirer
    # (`filteredBySector` reste à 0 ci-dessus) : BOAMP et DECP sont des
    # registres de COMMANDE PUBLIQUE, et une recherche non orientée y est donc
    # surtout des acheteurs publics, quel que soit le métier de l'ESN. Quand le
    # PROFIL nomme des secteurs, les candidats qui y répondent remontent — un
    # tri STABLE qui garde l'ordre de fraîcheur au sein de chaque groupe,
    # jamais un filtre.
    if not sectors:
        profile_prefixes = profile_sector_naf_prefixes(req.profile_data)
        if profile_prefixes:
            after_sector = sorted(after_sector, key=lambda c: not _naf_matches_prefixes(c.nafCode, profile_prefixes))

    # #3757.1 — une ESN (Accenture, Sopra…) n'est pas un client final : elle passe APRÈS les
    # clients finaux. Tri STABLE (la fraîcheur est gardée au sein de chaque groupe), appliqué
    # avant la troncature : un rôle change l'ORDRE, jamais le CONTENU.
    after_sector = sorted(after_sector, key=lambda c: c.isEsnPeer)

    # #2616.1 — le CDI distinguable, filtrable : même emplacement et même
    # raison que le secteur ci-dessus (compté à part, jamais retiré en
    # silence). Appliqué sur les signaux `hiring` déjà collectés — AVANT la
    # corroboration WTTJ/ATS (elle n'enrichit que des candidats déjà retenus
    # ici, jamais n'en fait remonter un nouveau).
    if req.contractTypes:
        wanted = set(req.contractTypes)
        after_contract = [
            c for c in after_sector if any(s.type == "hiring" and s.contractType in wanted for s in c.signals)
        ]
    else:
        after_contract = after_sector
    filtered_by_contract_type = len(after_sector) - len(after_contract)

    # #3096 — même emplacement, même raison que le filtre CDI ci-dessus : un
    # choix de l'utilisateur, compté à part, jamais un retrait silencieux.
    if req.remotePolicies:
        wanted_remote = set(req.remotePolicies)
        after_remote = [
            c
            for c in after_contract
            if any(s.type == "hiring" and s.remoteWorkPolicy in wanted_remote for s in c.signals)
        ]
    else:
        after_remote = after_contract
    filtered_by_remote_policy = len(after_contract) - len(after_remote)

    # #3097 — même emplacement, même raison.
    if req.seniorities:
        wanted_seniority = set(req.seniorities)
        after_seniority = [
            c for c in after_remote if any(s.type == "hiring" and s.seniority in wanted_seniority for s in c.signals)
        ]
    else:
        after_seniority = after_remote
    filtered_by_seniority = len(after_remote) - len(after_seniority)

    # #3226 (#3203.6, étendu #3203.8) — même emplacement, même raison : un
    # choix de l'utilisateur, compté à part, jamais un retrait silencieux.
    # `hiring` ET `tender` — voir `deliveryFit` posé sur les deux dans
    # `_Group.absorb`.
    if req.deliveryFitFilter:
        wanted_delivery_fit = set(req.deliveryFitFilter)
        after_delivery_fit = [
            c
            for c in after_seniority
            if any(s.type in ("hiring", "tender") and s.deliveryFit in wanted_delivery_fit for s in c.signals)
        ]
    else:
        after_delivery_fit = after_seniority
    filtered_by_delivery_fit = len(after_seniority) - len(after_delivery_fit)

    # #4067 (reste) — la coupe fait place aux comptes que l'espace connaît (comme le registre).
    candidates = _cut_signals_with_space_reserve(after_delivery_fit, req.limit, _space_sirens(req))
    if "hiring" in selected and candidates:
        # #2616.1 — corroboration APRÈS le filtre : seuls les candidats
        # réellement affichés paient le coût réseau de WTTJ/ATS.
        await _corroborate_hiring_platforms(candidates)
    coverage = DiscoverCoverage(
        candidatesFound=candidates_found,
        resolutionsAttempted=attempted,
        resolved=len(resolved),
        rejectedAmbiguous=dropped.get("ambiguous", 0),
        rejectedUnreachable=dropped.get("unreachable", 0),
        notExamined=not_examined,
        notIdentifiedNames=_not_identified_names(unidentified, groups[offset + len(window) :]),
        stoppedOn=stopped_on,
        resolveOffset=offset,
        hasMore=not_examined > 0,
        filteredByEntityType=filtered_out,
        filteredBySector=filtered_by_sector,
        filteredByContractType=filtered_by_contract_type,
        filteredByRemotePolicy=filtered_by_remote_policy,
        filteredBySeniority=filtered_by_seniority,
        filteredByDeliveryFit=filtered_by_delivery_fit,
    )
    if not_examined:
        # Trace opérateur : c'est le chiffre qui dit si la borne est bien réglée.
        logger.info(
            "discover_signals bounded: found=%d attempted=%d not_examined=%d stopped_on=%s",
            candidates_found,
            attempted,
            not_examined,
            stopped_on,
        )
    return DiscoverSignalsResponse(candidates=candidates, query=query, degraded=degraded, coverage=coverage)
