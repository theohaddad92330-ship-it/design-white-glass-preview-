"""#2069 — LES COMPTES RÉELS QUI ALIMENTENT LES SUGGESTIONS DE `/welcome`.

LE DÉFAUT CORRIGÉ
-----------------
Le prompt du Profiler disait « Privilégie des noms français bien connus
(CAC40/SBF120) » : une génération libre depuis la connaissance générale du
modèle, donc de la donnée fictive — un nom plausible, jamais un compte vérifié.
#2069 a retiré la consigne, et plus rien n'injectait de comptes réels : la liste
de `/welcome` sortait vide.

Ce module est la source de remplacement. Il lit la mémoire marché de l'espace —
le corpus des parcours professionnels réels, interrogeable PAR FILTRE
(`POST /internal/copilot/market/search` → `MarketMemoryService.searchByFilters`)
— et n'en rend que des noms d'entreprises qui y figurent DÉJÀ.

LE REPLI N'EST PAS D'INVENTER
-----------------------------
Sans source lisible, sans filtre, ou sans résultat, ce module rend zéro nom et le
DIT (`status`). `prompt_block` rend alors la chaîne VIDE : le prompt du Profiler
redevient byte-identique à celui qui ne connaît pas l'injection, et le champ
`first_analysis_suggestions` (`models/profile_context.py`) instruit déjà le
modèle de rendre une liste vide dans ce cas. Une en-tête vide (« Comptes
réels : ») serait pire que rien : c'est une invitation à la remplir.

CE QUI NE TRAVERSE PAS JUSQU'AU PROMPT
--------------------------------------
La même règle que `market_memory_angle.py` tient déjà pour le plan et les
messages, et pour la même raison : on retire le MOYEN, pas seulement la
permission. Du résultat de la mémoire marché, seuls sortent d'ici :

* le NOM de l'entreprise, verbatim ;
* les expertises que l'ESN a DÉCLARÉES elle-même et qui recoupent la pile
  observée du compte (`reinforced_expertises`).

N'en sortent JAMAIS : le nom d'une société de services observée (`esnObserved`),
un compte de parcours (`marketPaths`), une famille de rôles, une zone, un taux de
couverture (GA-259 : une couverture dit ce qu'on SAIT, jamais ce que le marché
FAIT), une probabilité (refusée six fois). Un prompt qui ne les reçoit pas ne
peut pas les écrire.

HORS PÉRIMÈTRE PAR CONSTRUCTION : on classe ici des ENTREPRISES, jamais des
personnes — aucun critère protégé (âge, genre, origine, nationalité, photo,
situation familiale, adresse) n'entre dans ce module, et la mémoire marché ne
rend de toute façon aucune identité de personne.
"""

from __future__ import annotations

import asyncio
import logging
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.services import bellum_api
from app.services.market_memory_angle import reinforced_expertises

if TYPE_CHECKING:  # pragma: no cover — annotation seulement
    # Importé SOUS `TYPE_CHECKING` : ce module lit un corpus, il ne dépend pas
    # des modèles de sortie du Profiler. `keep_sourced` ne fait que recopier la
    # suggestion qu'on lui passe.
    from app.models.profile_context import FirstAnalysisSuggestion as _Suggestion

logger = logging.getLogger(__name__)

#: Le plafond du contrat, aux DEUX bouts : `max_length=4` sur
#: `first_analysis_suggestions` (`models/profile_context.py`) et
#: `.max(4)` sur `firstAnalysisSuggestions`
#: (`packages/contracts/src/schemas/profile-context.ts`). En proposer douze au
#: modèle l'inviterait à en rendre douze, que le schéma refuserait ensuite.
MAX_SUGGESTIONS = 4

#: #2069 — le fan-out est BORNÉ : une expertise déclarée = une question au
#: corpus, trois au plus. Un profil qui déclare douze expertises ne déclenche pas
#: douze allers-retours avant le premier écran du produit.
MAX_QUERIES = 3

#: Ce que le pont accepte par filtre — miroir de `MARKET_SEARCH_FILTER_MAX_CHARS`
#: (`chat_tools.py`). Un filtre plus long est ÉCARTÉ, jamais tronqué : couper un
#: libellé change la question posée.
_FILTER_MAX_CHARS = 120

#: Le nombre d'entreprises demandé par question. Plus large que `MAX_SUGGESTIONS`
#: exprès : le dédoublonnage entre questions en retire, et une question qui ne
#: rend qu'une entreprise ne doit pas monopoliser la liste.
_PER_QUERY_LIMIT = 8


@dataclass(frozen=True)
class RealAccount:
    """UNE entreprise réelle, réduite à ce qui a le droit d'atteindre un prompt."""

    name: str
    reinforced_expertises: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RealAccountsRead:
    """Le résultat d'une lecture, avec son statut NOMMÉ.

    Les quatre « zéro nom » ne se ressemblent que de loin, et les confondre est
    exactement le défaut que ce lot corrige :

    * ``not_configured`` — le pont interne n'est pas branché ici ;
    * ``no_caller`` — aucune identité d'appelant, donc aucun cloisonnement
      possible : on ne balaie pas le corpus partagé au nom de personne ;
    * ``no_filter`` — le profil ne donne ni expertise ni zone, et une recherche
      sans filtre est refusée aux deux portes (ici et côté NestJS) ;
    * ``unavailable`` — on n'a pas pu LIRE. Ne se rend JAMAIS comme un corpus
      vide, qui se lirait « aucune entreprise ne correspond » ;
    * ``empty`` — on a lu, et le corpus ne rend rien pour ces filtres.
    """

    status: str
    companies: list[RealAccount] = field(default_factory=list)


def _fold(value: str) -> str:
    """Plie un nom pour le dédoublonnage INTRA-corpus.

    ⚠️ NFD puis retrait des diacritiques : `ILIKE` plie la casse, PAS les
    accents — « SOCIETE GENERALE » et « Société Générale » sont la même
    entreprise, et le corpus n'est pas normalisé de la même façon d'une ligne à
    l'autre.

    ⚠️ Ce pli ne sert QU'À dédoublonner deux lignes du MÊME référentiel, où le
    nom est bien la clé. Il ne joint jamais deux référentiels : « SG SOCIETE
    GENERALE » ne trouverait pas « SOCIETE GENERALE », sans jamais échouer.
    """
    folded = unicodedata.normalize("NFD", value)
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")
    return " ".join(folded.lower().split())


def _labels(values: object, *, limit: int) -> list[str]:
    """Les libellés non vides d'une réponse d'onboarding, bornés."""
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for value in values:
        if not isinstance(value, str):
            continue
        text = value.strip()
        # Un filtre hors bornes est ÉCARTÉ, jamais raccourci : le pont le
        # refuserait, et un 400 revient en `None`, qui se lit « le corpus n'a
        # pas répondu ».
        if not text or len(text) > _FILTER_MAX_CHARS:
            continue
        out.append(text)
        if len(out) >= limit:
            break
    return out


def _queries(answers: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Les questions à poser au corpus, dérivées des réponses d'onboarding.

    Une expertise déclarée = une question (`technology`), resserrée par la zone
    déclarée (`location`) quand il y en a une.

    ⚠️ `target_sectors` n'entre PAS : la recherche par filtre n'a pas d'axe
    secteur, et le rapprocher d'une technologie serait une jointure par libellé.
    `target_company_types` non plus : aucun barème « ETI = N personnes » n'existe
    dans ce dépôt, et en inventer un resserrerait la question en silence.
    """
    expertises = _labels(answers.get("expertise_areas"), limit=MAX_QUERIES)
    location = next(iter(_labels(answers.get("geo_zones"), limit=1)), None)

    if expertises:
        return [{"technology": expertise, "location": location} for expertise in expertises]
    if location:
        return [{"technology": None, "location": location}]
    return []


async def _ask(user_id: str, query: dict[str, Any]) -> dict[str, Any] | None:
    return await bellum_api.search_market_memory(
        user_id,
        technology=query["technology"],
        location=query["location"],
        limit=_PER_QUERY_LIMIT,
    )


def _accounts_of(result: object, expertises: list[object]) -> list[RealAccount] | None:
    """Les entreprises d'UNE réponse du pont, ou ``None`` si elle est illisible."""
    if not isinstance(result, dict) or result.get("status") != "ok":
        # `unavailable`, `None`, ou une forme qu'on ne reconnaît pas : on n'a pas
        # LU. Jamais rendu comme une liste vide.
        return None
    matches = result.get("matches")
    if not isinstance(matches, list):
        return None

    out: list[RealAccount] = []
    for row in matches:
        if not isinstance(row, dict):
            continue
        name = row.get("companyName")
        if not isinstance(name, str) or not name.strip():
            continue
        coverage = row.get("coverage") if isinstance(row.get("coverage"), dict) else {}
        # ⚠️ La pile observée arrive en `{"techno": ..., "persons": ...}` :
        # `label_of` ne connaît pas la clé `techno` et rendrait `None` pour
        # CHAQUE entrée — un appariement toujours vide, sans jamais échouer.
        stack = [
            entry.get("techno")
            for entry in (coverage.get("observedStack") or [])
            if isinstance(entry, dict) and isinstance(entry.get("techno"), str)
        ]
        out.append(RealAccount(name=name.strip(), reinforced_expertises=reinforced_expertises(stack, expertises)))
    return out


def _interleave(batches: list[list[RealAccount]]) -> list[RealAccount]:
    """Entrelace les réponses, tour par tour.

    ⚠️ LE DÉFAUT QUE CETTE FONCTION EXISTE POUR ÉVITER : N sources concaténées
    puis TRONQUÉES — la PREMIÈRE occupe toutes les places, et la diversité
    annoncée n'existe jamais. Ici la première entreprise de chaque question
    passe avant la deuxième de la première.

    Dédoublonne au passage : la même entreprise trouvée par deux expertises ne
    prend pas deux places.
    """
    seen: set[str] = set()
    out: list[RealAccount] = []
    depth = max((len(batch) for batch in batches), default=0)
    for index in range(depth):
        for batch in batches:
            if index >= len(batch):
                continue
            account = batch[index]
            key = _fold(account.name)
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(account)
            if len(out) >= MAX_SUGGESTIONS:
                return out
    return out


async def real_accounts_for(
    answers: Mapping[str, Any],
    *,
    user_id: str | None = None,
) -> RealAccountsRead:
    """#2069 — les comptes RÉELS proposés au Profiler, ou rien, et on le dit."""
    caller = user_id or answers.get("user_id")
    if not isinstance(caller, str) or not caller.strip():
        return RealAccountsRead(status="no_caller")
    if not bellum_api.is_configured():
        return RealAccountsRead(status="not_configured")

    queries = _queries(answers)
    if not queries:
        # Un filtre est OBLIGATOIRE — refusé ici AVANT tout appel réseau, comme
        # `chat_tools` le fait déjà, et refusé une seconde fois par NestJS.
        return RealAccountsRead(status="no_filter")

    expertises = list(_labels(answers.get("expertise_areas"), limit=50))
    # ⚠️ `return_exceptions=True` n'est pas décoratif : borner le fan-out ne
    # suffit pas, il faut le TOLÉRER. Une question qui lève emporterait les
    # autres, et la liste entière avec — un écran vide pour une seule panne.
    results = await asyncio.gather(
        *(_ask(caller.strip(), query) for query in queries),
        return_exceptions=True,
    )

    batches: list[list[RealAccount]] = []
    unreadable = 0
    # `strict=True` : `gather` rend exactement un résultat par question. Une
    # divergence serait un défaut de ce module, pas une ligne à ignorer.
    for query, result in zip(queries, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning(
                "welcome_account_suggestions: mémoire marché illisible (technologie=%s): %s",
                query["technology"],
                result,
            )
            unreadable += 1
            continue
        accounts = _accounts_of(result, expertises)
        if accounts is None:
            unreadable += 1
            continue
        batches.append(accounts)

    companies = _interleave(batches)
    if companies:
        return RealAccountsRead(status="ok", companies=companies)
    # Zéro nom : dire LEQUEL des deux. Tant qu'une question n'a pas pu être lue,
    # on ne peut pas affirmer que le corpus ne contient rien.
    return RealAccountsRead(status="unavailable" if unreadable else "empty")


def prompt_block(read: RealAccountsRead) -> str:
    """Le bloc à ajouter au prompt utilisateur du Profiler — ou la chaîne VIDE.

    ⚠️ VIDE veut dire VIDE : pas d'en-tête sans contenu, pas de « aucune
    entreprise trouvée ». Une en-tête qui attend une liste est une invitation à
    l'inventer, et le champ `first_analysis_suggestions` instruit déjà le modèle
    de rendre `[]` quand le contexte ne nomme personne.
    """
    if not read.companies:
        return ""

    lines = [
        "",
        "",
        "ENTREPRISES RÉELLES DISPONIBLES POUR `firstAnalysisSuggestions`",
        "Elles viennent de la mémoire de cet espace de travail : ce sont des entreprises "
        "existantes, déjà observées. Tu REPRENDS leur nom VERBATIM, tel qu'écrit ci-dessous. "
        "Tu n'en ajoutes pas, tu n'en déduis pas, tu n'en corriges pas l'orthographe. "
        "Si aucune ne convient, rends une liste vide.",
    ]
    for account in read.companies:
        if account.reinforced_expertises:
            lines.append(f"- {account.name} (recoupe tes expertises : {', '.join(account.reinforced_expertises)})")
        else:
            lines.append(f"- {account.name}")
    return "\n".join(lines)


def keep_sourced(
    suggestions: Sequence[_Suggestion],
    read: RealAccountsRead,
) -> list[_Suggestion]:
    """#2069.1 — les suggestions viennent d'une source, jamais du modèle.

    ⚠️ LE PROMPT N'EST PAS UNE GARDE. `prompt_block` écrit « Tu REPRENDS leur
    nom VERBATIM, tu n'en ajoutes pas » — et le 15/09/2026 `/welcome` servait
    en production « BNP Paribas · Stellantis · Airbus · LVMH », cliquables,
    chacun lançant une analyse, donc débitant un crédit sur un compte que rien
    ne dit pertinent. Une consigne obtient une obéissance ; « JAMAIS de donnée
    fictive » demande une garantie. Cette fonction est la garantie : ce qui
    n'est pas dans la source LUE ne sort pas.

    Trois conséquences assumées :

    * **La lecture impossible ne vaut pas permission.** Les cinq statuts sans
      nom (`unavailable`, `empty`, `no_caller`, `not_configured`, `no_filter`)
      rendent tous une liste vide : sans nom lu, aucun nom ne se prouve.
    * **L'orthographe de la SOURCE gagne.** Un clic ouvre
      `/search?company=<nom>` ; une graphie réécrite par le modèle lancerait
      l'analyse sur une chaîne que le résolveur ne retrouve pas.
    * **On filtre des NOMS, pas des phrases.** `sector` et `reason` restent ce
      que le modèle a écrit : leur rôle est d'expliquer un rapprochement avec
      l'ESN, pas de nommer une entreprise.
    """
    by_fold = {_fold(account.name): account.name for account in read.companies if account.name.strip()}
    if not by_fold:
        return []

    kept: list[_Suggestion] = []
    for suggestion in suggestions:
        sourced = by_fold.get(_fold(suggestion.company_name))
        if sourced is None:
            logger.warning(
                "welcome_account_suggestions: nom écarté, absent de la source lue (%r)",
                suggestion.company_name,
            )
            continue
        if sourced == suggestion.company_name:
            kept.append(suggestion)
        else:
            kept.append(suggestion.model_copy(update={"company_name": sourced}))
    return kept
