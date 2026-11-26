"""La dynamique territoriale (tome 4, partie F) — huit indicateurs.

La question de Théo, telle qu'elle a été posée : « comment est-ce qu'on peut
connaître les dynamiques des ESN sur chaque ville, sur chaque territoire ».

Le retournement du §20.1 porte la moitié de la valeur : **une même moisson
d'offres lit deux marchés**. Les entreprises qui recrutent et qui ne sont pas
des ESN sont des CLIENTS à prospecter ; celles qui en sont sont des ESN qui
DÉBORDENT, donc des partenaires à appeler cette semaine.

Trois règles de construction, toutes des règles d'honnêteté :

1. **Chaque bloc porte son état.** Une source en panne rend son bloc
   `unavailable` avec sa raison ; les quatre autres s'affichent. Un écran qui
   tombe entier parce que DECP n'a pas répondu ne dit pas ce qu'il sait.
2. **Un indicateur non calculable le DIT.** La densité concurrentielle demande
   l'emploi IT du département, qu'aucune source publique gratuite ne donne :
   elle rend `null` avec sa raison, jamais un chiffre approché.
3. **« Ce que je ne sais pas » n'est jamais vide.** C'est le bloc qui empêche de
   lire une liste courte comme un territoire pauvre.
"""

from __future__ import annotations

import asyncio
import logging
import unicodedata
from collections import Counter
from typing import Any

from app.services import provider_cache
from app.services.data_sources.decp import list_award_buyers
from app.services.data_sources.france_travail import list_hiring_companies
from app.services.data_sources.public_tenders import list_tender_buyers
from app.services.data_sources.recherche_entreprises import count_companies
from app.services.data_sources.registry_lookup import names_by_siren
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.esn_naf import ESN_NAF_CODES
from app.services.esn_name_match import build_esn_index, match_esn

logger = logging.getLogger(__name__)

#: Sous ce nombre d'offres, un classement de technos ne dit rien : trois offres
#: Java ne font pas une tension du marché (règle du §20, indicateur 5).
MIN_OFFERS_FOR_TECH_RANKING = 30
#: Idem pour le classement des ESN qui recrutent (indicateur 4).
MIN_ESN_OFFERS_FOR_RANKING = 10
#: Les tranches d'effectif retenues pour compter les ESN présentes.
#:
#: Le tome écrit « effectif ≥ 5 » ; le registre n'a pas cette borne — sa tranche
#: la plus basse au-dessus de zéro couvre 3 à 5 salariés. On la garde et on
#: ANNONCE « au moins trois salariés » plutôt que de prétendre à un seuil que la
#: donnée ne porte pas. Ce qui compte est d'écarter les micro-entreprises : sans
#: ce filtre, un département affiche 4 600 « ESN » qui sont des indépendants
#: immatriculés en 62.02A.
TRANCHES_AT_LEAST_3 = ("02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53")

#: Le registre plafonne `total_results` à cette valeur : au-delà, le nombre rendu
#: est un PLANCHER et non un compte. On le dit plutôt que d'afficher 10 000.
REGISTRY_COUNT_CEILING = 10_000

#: Le vocabulaire technique qu'on sait reconnaître dans un intitulé d'offre.
#: Volontairement COURT et explicite : une extraction « intelligente » sur des
#: intitulés français produirait « Ingénieur » et « H/F » en tête de classement.
TECH_TERMS: tuple[str, ...] = (
    "java", "python", "javascript", "typescript", "react", "angular", "vue", ".net", "c#", "php",
    "go", "rust", "scala", "kotlin", "swift", "sql", "data", "big data", "spark", "databricks",
    "snowflake", "power bi", "sap", "salesforce", "oracle", "cloud", "aws", "azure", "gcp",
    "kubernetes", "docker", "devops", "cyber", "sécurité", "réseau", "linux", "windows",
    "embarqué", "iot", "ia", "machine learning", "test", "qa", "scrum", "product owner",
)


#: Le rayon maximal, EN KILOMÈTRES — la borne vient de l'API du registre, qui la
#: dit elle-même (mesuré le 04/09/2026 : `radius=51` rend un 400 « Veuillez
#: indiquer un paramètre `radius` entre `0.001` et `50` »). Elle est reprise ici
#: pour que l'écran puisse l'ANNONCER avant le clic plutôt que de la découvrir
#: en erreur.
MAX_RADIUS_KM = 50


class TerritoryScope:
    """QUEL territoire — un département, une ville, ou un cercle autour d'un point.

    ─────────────────────────────────────────────────────────────────────────
    POURQUOI UN OBJET ET PAS TROIS PARAMÈTRES
    ─────────────────────────────────────────────────────────────────────────
    Les trois mailles sont EXCLUSIVES et chacune touche cinq sources. Passées
    en trois paramètres libres, rien n'empêche d'en fournir deux — et les
    sources trancheraient alors chacune de leur côté, sans que l'écran sache
    laquelle a gagné. Ici la maille est décidée UNE fois, à la construction.

    ⚠️ Toutes les sources ne savent pas descendre sous le département. Le
    registre des entreprises, oui (mesuré) ; les offres d'emploi, peut-être
    (paramètres non vérifiables sans identifiants — voir `list_hiring_companies`) ;
    les appels d'offres et les marchés attribués, NON — BOAMP et DECP publient
    au département. `label` et `coarseSources` existent pour que l'écran dise
    lesquelles répondent à la question posée et lesquelles répondent à une
    question plus large.
    """

    def __init__(
        self,
        *,
        department: str,
        commune_code: str | None = None,
        commune_name: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        radius_km: float | None = None,
    ) -> None:
        #: TOUJOURS renseigné, même en maille ville ou cercle : c'est la seule
        #: maille que les marchés publics savent lire, et le repli de toutes les
        #: autres. Une ville sans son département rendrait ces blocs muets.
        self.department = department
        self.commune_code = commune_code
        self.commune_name = commune_name
        self.latitude = latitude
        self.longitude = longitude
        #: Borné ICI aussi. Trois bornes (contrat, source, écran) qui disent le
        #: même nombre, c'est une de trop — mais la seule qui protège l'appel
        #: réseau est celle-ci, et un 400 se lit « source en panne ».
        self.radius_km = min(float(radius_km), MAX_RADIUS_KM) if radius_km else None

    @property
    def kind(self) -> str:
        if self.radius_km and self.latitude is not None and self.longitude is not None:
            return "around"
        if self.commune_code:
            return "commune"
        return "department"

    @property
    def near(self) -> tuple[float, float, float] | None:
        """Le triplet que le registre attend, ou `None` hors du mode cercle."""
        if self.kind != "around" or self.latitude is None or self.longitude is None or self.radius_km is None:
            return None
        return (self.latitude, self.longitude, self.radius_km)

    @property
    def label(self) -> str:
        """Comment NOMMER ce territoire à l'écran, en une ligne."""
        if self.kind == "around":
            around = self.commune_name or f"{self.latitude:.3f}, {self.longitude:.3f}"
            return f"à moins de {self.radius_km:g} km autour de {around}"
        if self.kind == "commune":
            return f"sur {self.commune_name or self.commune_code}"
        return f"sur le département {self.department}"


def _block(state: str, reason: str | None = None, **payload: Any) -> dict[str, Any]:
    """Un bloc porte TOUJOURS son état — c'est ce qui distingue « rien ici » de
    « je n'ai pas pu regarder »."""
    return {"state": state, "reason": reason, **payload}


def tech_tension(labels: list[str]) -> list[dict[str, Any]]:
    """Les technos les plus demandées, à partir des intitulés d'offres.

    Un terme n'est compté que s'il est CHERCHÉ : le lexique est court et écrit,
    parce qu'une extraction libre sur des intitulés français ferait remonter
    « Ingénieur » et « H/F » avant la première techno.
    """
    counter: Counter[str] = Counter()
    for label in labels:
        lowered = str(label or "").lower()
        for term in TECH_TERMS:
            if term in lowered:
                counter[term] += 1
    return [{"term": term, "count": count} for term, count in counter.most_common(8)]


async def _count_esn_establishments(scope: TerritoryScope) -> int | None:
    """Combien d'ESN d'au moins trois salariés ont leur siège sur ce territoire.

    UN seul appel : le registre accepte une liste de codes NAF complets. Les
    interroger un par un ferait six appels pour le même chiffre — et un préfixe
    (« 62.0 ») serait refusé avec un 400 que l'écran lirait « source
    indisponible » sur un registre parfaitement disponible.

    `None` — jamais 0 — quand il ne répond pas : « zéro ESN ici » et « je n'ai
    pas pu regarder » mènent à deux décisions opposées.

    La maille suit le scope : le registre est la SEULE des quatre sources qui
    sait descendre sous le département, et c'est mesuré — `code_commune=31555`
    + NAF ESN + tranche ≥ 3 rend 965 là où le département en rend plusieurs
    milliers, et un rayon de 5 km rend 2 242 contre 4 366 à 30 km.
    """
    return await count_companies(
        department=scope.department if scope.kind == "department" else None,
        commune_code=scope.commune_code if scope.kind == "commune" else None,
        near=scope.near,
        naf_codes=ESN_NAF_CODES,
        tranches=TRANCHES_AT_LEAST_3,
    )


#: Temps accordé à CHAQUE source publique de la moisson, en secondes — un seul
#: endroit. Doit rester sous le délai API→IA (45 s) : voir `bellum_api`.
TERRITORY_SOURCE_BUDGET_S = 25.0


class TerritorySourceTimeout(TimeoutError):
    """Une source a dépassé son budget. `str()` est LISIBLE : celui d'un
    `TimeoutError()` nu est vide, et la raison affichée devenait « () »."""

    def __init__(self, label: str, budget_s: float) -> None:
        self.label = label
        super().__init__(f"{label} n'a pas répondu à temps ({budget_s:g} s)")


async def _within_budget(label: str, coro: Any) -> Any:
    budget = TERRITORY_SOURCE_BUDGET_S
    try:
        return await asyncio.wait_for(coro, timeout=budget)
    except asyncio.TimeoutError as exc:
        if isinstance(exc, TerritorySourceTimeout):
            raise
        raise TerritorySourceTimeout(label, budget) from exc


def _mesh_key(*parts: object) -> str:
    """La clé d'un agrégat : la QUESTION posée, rien d'un espace ni d'un profil."""
    return "|".join("" if part is None else str(part) for part in parts)


async def _shared(source: str, key: str, fetch: Any) -> Any:
    """LOT (15/10) DATA-C — un agrégat de territoire, gardé 24 h et COMMUN.

    L'écran, l'outil territoire de Laura et la veille nocturne
    (``territory-watch``) posent les mêmes questions : la réponse d'une source
    publique se garde ``TTL_TERRITORY``. Jamais une source en panne (l'exception
    remonte avant l'écriture), jamais un vide (``cached_json`` ne garde que le
    non-vide) : « rien » se redemande, « inconnu » ne se fige pas."""
    return await provider_cache.cached_json(f"territory:{source}", key, fetch, provider_cache.TTL_TERRITORY)


async def territory_overview(
    department: str,
    *,
    since_days: int = 90,
    known_esn_names: set[str] | None = None,
    scope: TerritoryScope | None = None,
    pack: str | None = None,
) -> dict[str, Any]:
    """Les cinq blocs de l'écran Territoire, chacun avec son état.

    `known_esn_names` vient du référentiel ESN (normalisé) : c'est ce qui permet
    de dire « celle-ci est une ESN » SANS résoudre chaque employeur au registre,
    ce qui coûterait un appel par entreprise et par consultation d'écran.

    `scope` porte la maille demandée — département, ville ou cercle. Absent, il
    est construit sur `department` seul : les appelants antérieurs gardent donc
    un comportement byte-identique.
    """
    esn_names = known_esn_names or set()
    scope = scope or TerritoryScope(department=department)

    radius = int(scope.radius_km) if scope.radius_km else None
    hiring_task = _shared(
        "hiring",
        _mesh_key(scope.department, scope.commune_code, radius, since_days, 100),
        lambda: list_hiring_companies(
            scope.department,
            None,
            since_days,
            # ⚠️ La borne est NOMMÉE, et c'est la garde `territory-collection-bounds`
            # qui le demande : elle confronte ce nombre à `TERRITORY_COLLECTION_LIMITS`
            # (le miroir TypeScript qui fait écrire « au moins 100 » à l'écran quand
            # la collecte plafonne). Positionnelle, elle devenait illisible dès qu'un
            # argument nommé la suivait — et une garde qui ne sait plus lire annonce
            # une divergence qui n'existe pas.
            limit=100,
            # La maille fine, TENTÉE. La source rejoue au département si l'API la
            # refuse, et pose alors `coarseFallback` sur chaque ligne — c'est ce
            # drapeau, et non une supposition, qui décide de ce que l'écran promet.
            commune_code=scope.commune_code,
            distance_km=radius,
        ),
    )
    # ⚠️ BOAMP et DECP publient AU DÉPARTEMENT. Leur demander une ville n'est pas
    # une option qu'on aurait négligée : elle n'existe pas. Ces deux blocs
    # répondent donc toujours à la maille département, et l'écran le DIT — c'est
    # `coarseSources` plus bas. Les laisser passer pour précis serait la forme la
    # plus chère de mensonge : une réponse juste à une autre question.
    tenders_task = _shared(
        "tenders",
        # LUD.1 — le pack entre dans la clé SEULEMENT quand il y en a un : la clé IT reste celle d'avant.
        _mesh_key(scope.department, since_days, 50, *(("pack", pack) if pack else ())),
        lambda: list_tender_buyers(scope.department, since_days, limit=50, pack=pack),
    )
    awards_window = max(since_days, 365)
    awards_task = _shared(
        "awards",
        _mesh_key(scope.department, awards_window, 50, *(("pack", pack) if pack else ())),
        lambda: list_award_buyers(scope.department, awards_window, limit=50, pack=pack),
    )
    establishments_task = _shared(
        "esn_count",
        _mesh_key(scope.kind, scope.department, scope.commune_code, scope.near),
        lambda: _count_esn_establishments(scope),
    )

    # Budget PAR SOURCE : une source qui dort devient un bloc `unavailable`, les
    # autres s'affichent (incident prod 07/10/2026 : tout ou rien à 30 s).
    hiring, tenders, awards, esn_count = await asyncio.gather(
        _within_budget("La source d'offres", hiring_task),
        _within_budget("Les appels d'offres", tenders_task),
        _within_budget("Les marchés attribués", awards_task),
        _within_budget("Le registre des entreprises", establishments_task),
        return_exceptions=True,
    )

    # ── Bloc 1 — le marché ────────────────────────────────────────────────
    # `market_coarse` est initialisé AVANT le branchement : une source en panne
    # n'a rien replié, et lire un drapeau non défini ferait tomber tout l'écran
    # sur le chemin où il sait déjà le moins de choses.
    market_coarse = False
    if isinstance(hiring, SignalSourceUnavailable):
        market = _block("unavailable", f"{hiring.source} n'a pas répondu — {hiring.reason}")
        esn_hiring: list[dict] = []
    elif isinstance(hiring, TerritorySourceTimeout):
        market = _block("unavailable", f"{hiring}.")
        esn_hiring = []
    elif isinstance(hiring, BaseException):
        market = _block(
            "unavailable", f"La source d'offres n'a pas répondu ({str(hiring) or type(hiring).__name__})."
        )
        esn_hiring = []
    else:
        rows = [r for r in hiring if isinstance(r, dict)]
        # La maille FINE a-t-elle été obtenue ? La source pose le même drapeau
        # sur toutes ses lignes ; on lit la première plutôt que de le supposer.
        market_coarse = bool(rows and rows[0].get("coarseFallback"))
        labels = [str((r.get("signal") or {}).get("label") or "") for r in rows]
        by_employer: Counter[str] = Counter(str(r.get("name") or "") for r in rows if r.get("name"))
        # Le référentiel porte des noms COMMERCIAUX, les sources d'emploi des
        # RAISONS SOCIALES. L'égalité exacte ne les faisait jamais se
        # rencontrer — « CAPGEMINI TECHNOLOGY SERVICES » n'est pas
        # « capgemini » — et le bloc « qui déborde » restait vide, ce qui se
        # lit comme un territoire sans concurrence. Voir `esn_name_match`, dont
        # la règle est volontairement étroite : un faux positif rangerait un
        # client final parmi les concurrents.
        index = build_esn_index(esn_names)
        # Regroupées par CLÉ de référentiel : « SII » et « SII SUD OUEST » sont
        # une seule ESN, et deux lignes se partageraient ses offres — assez pour
        # la faire passer sous le seuil de classement.
        esn_offers: Counter[str] = Counter()
        # Les comptes finaux n'ont PAS de référentiel qui les canonise : on
        # regroupe donc sur le nom normalisé, et on retient la graphie la plus
        # fréquente pour l'affichage — jamais une forme inventée.
        #
        # Trouvé en recette live le 31/08 sur le département 31 :
        #     « Link Consulting — 6 offres » ET « LINK CONSULTING — 4 offres »
        # Deux lignes pour une entreprise, et une place volée dans un top 10.
        client_offers: Counter[str] = Counter()
        client_spellings: dict[str, Counter[str]] = {}
        # ⚠️ La VILLE voyageait déjà sur chaque ligne (`france_travail` la lit
        # dans `lieuTravail`) et n'était lue NULLE PART : le bloc « qui recrute »
        # nommait des entreprises sans dire où elles sont, sur un écran dont la
        # question est « qu'est-ce qu'il y a LÀ-BAS ». La graphie retenue est la
        # plus fréquente pour cet employeur — jamais une ville inventée, et
        # `None` quand la source n'en donne aucune.
        client_cities: dict[str, Counter[str]] = {}
        for row in rows:
            name = str(row.get("name") or "")
            city = str(row.get("city") or "").strip()
            if not name or not city:
                continue
            client_cities.setdefault(_normalized(name), Counter())[city] += 1
        for employer, count in by_employer.items():
            matched = match_esn(employer, index)
            if matched:
                esn_offers[matched] += count
                continue
            key = _normalized(employer)
            if not key:
                continue
            client_offers[key] += count
            client_spellings.setdefault(key, Counter())[employer] += count
        esn_hiring = [{"name": key, "offers": count} for key, count in esn_offers.most_common()]
        # ⚠️ La borne s'applique APRÈS le tri des seuls clients. Elle portait
        # avant sur `by_employer.most_common(10)`, ESN comprises, puis on les
        # retirait : un département où dix ESN recrutent fort rendait donc ZÉRO
        # compte final, alors que la question de ce bloc est précisément
        # « quels comptes adresser ».
        client_hiring = [
            {
                "name": client_spellings[key].most_common(1)[0][0],
                "offers": count,
                "city": (client_cities[key].most_common(1)[0][0] if client_cities.get(key) else None),
            }
            for key, count in client_offers.most_common(10)
        ]
        market = _block(
            "ready" if rows else "empty",
            None if rows else "Aucune offre IT publiée sur ce département dans la fenêtre demandée.",
            offers=len(rows),
            technologies=tech_tension(labels) if len(rows) >= MIN_OFFERS_FOR_TECH_RANKING else [],
            technologiesReason=(
                None
                if len(rows) >= MIN_OFFERS_FOR_TECH_RANKING
                else f"{len(rows)} offres seulement — sous {MIN_OFFERS_FOR_TECH_RANKING}, un classement de technos ne dit rien."
            ),
            hiringAccounts=client_hiring,
            # `True` = l'API a refusé la ville / le rayon et ces offres couvrent
            # le DÉPARTEMENT. L'écran l'annonce ; sans ce champ il étiquetterait
            # un département entier « à 12 km de Toulouse ».
            coarseFallback=market_coarse,
        )

    # ── Bloc 2 — la concurrence ───────────────────────────────────────────
    if isinstance(esn_count, int):
        competition = _block(
            "ready",
            (
                f"Le registre plafonne son compte à {REGISTRY_COUNT_CEILING} : c'est un plancher, pas un total."
                if esn_count >= REGISTRY_COUNT_CEILING
                else None
            ),
            esnPresent=esn_count,
            # La densité demande l'emploi IT du département : aucune source
            # publique gratuite ne le donne à cette maille. On le DIT.
            density=None,
            densityReason="L'emploi informatique du département n'est publié par aucune source gratuite — densité non calculable.",
        )
    elif isinstance(esn_count, TerritorySourceTimeout):
        competition = _block("unavailable", f"{esn_count}.")
    else:
        competition = _block("unavailable", "Le registre des entreprises n'a pas répondu.")

    # ── Bloc 3 — qui déborde ──────────────────────────────────────────────
    total_esn_offers = sum(item["offers"] for item in esn_hiring)
    if market["state"] == "unavailable":
        overflow = _block("unavailable", "Dépend des offres, que la source n'a pas rendues.")
    elif total_esn_offers < MIN_ESN_OFFERS_FOR_RANKING:
        overflow = _block(
            "partial",
            f"{total_esn_offers} offre(s) publiée(s) par des ESN connues — trop peu pour un classement.",
            esn=esn_hiring[:10],
        )
    else:
        overflow = _block("ready", None, esn=esn_hiring[:10])

    # ── Bloc 4 — ce qui est accessible ────────────────────────────────────
    tender_rows = tenders if isinstance(tenders, list) else []
    award_rows = awards if isinstance(awards, list) else []
    sources_down = [
        name
        for name, value in (("les appels d'offres", tenders), ("les marchés attribués", awards))
        if isinstance(value, BaseException)
    ]
    buyers_with_incumbent = {str(r.get("siren") or r.get("name")) for r in award_rows if isinstance(r, dict)}

    # ─────────────────────────────────────────────────────────────────────────
    # NOMMER L'ACHETEUR — trouvé en recette live le 04/09, sur du code du jour
    # ─────────────────────────────────────────────────────────────────────────
    # Le bloc rendait « Titulaire : CGI FRANCE · Se termine le 2026-09-22 » SANS
    # dire avec QUI. On apprenait donc qu'un concurrent tient un marché qui
    # rouvre dans dix-huit jours, sans savoir chez quel acheteur — ce qui retire
    # à la ligne à peu près tout ce qui la rendait utile.
    #
    # La cause est celle que ce dépôt paie le plus souvent : la donnée voyage
    # (`siren` est là, « 193112562 »), le résolveur existe (`names_by_siren`,
    # déjà utilisé pour les TITULAIRES quinze lignes plus bas dans `decp.py`), et
    # personne ne les relie sur CE chemin. Le millésime 2022 de la source ne
    # publie que des SIRET côté acheteur, et son docstring dit lui-même que le
    # nom « est résolu en aval par le routeur » — le routeur Découvrir le fait,
    # celui-ci ne le faisait pas.
    #
    # UNE passe pour tout le lot, bornée par le sémaphore du résolveur. Un SIREN
    # non résolu reste sans nom — jamais un SIRET brut présenté comme une raison
    # sociale — et l'écran le DIT.
    unnamed_buyers = {
        str(r.get("siren"))
        for r in award_rows
        if isinstance(r, dict) and r.get("siren") and not str(r.get("name") or "").strip()
    }
    if unnamed_buyers:
        try:
            resolved_buyers = await names_by_siren(unnamed_buyers)
        except Exception as exc:  # noqa: BLE001 — le lookup ne casse jamais la liste
            logger.warning("Territoire: résolution des noms d'acheteurs échouée: %s", exc)
            resolved_buyers = {}
        for row in award_rows:
            if isinstance(row, dict) and not str(row.get("name") or "").strip():
                row["name"] = resolved_buyers.get(str(row.get("siren") or ""), "") or ""

    # ─────────────────────────────────────────────────────────────────────────
    # CE BLOC RENDAIT TROIS ENTIERS, ET JETAIT TOUT LE RESTE
    # ─────────────────────────────────────────────────────────────────────────
    # Les deux sources rendent des LIGNES NOMMÉES depuis le premier jour :
    # l'acheteur, son SIREN, l'objet du marché, la date limite de réponse, le
    # lien vers l'avis — et, pour les marchés attribués, LE TITULAIRE EN PLACE,
    # le montant, la durée et la date de FIN. L'écran affichait
    # « 12 marchés attribués ».
    #
    # C'est le défaut n°1 du dépôt dans sa forme la plus coûteuse : la donnée
    # était collectée, payée en latence, puis réduite à un `len()`. « Qui achète
    # de l'informatique près de chez moi, sur quel sujet, pour quand, et qui
    # tient la place aujourd'hui » est très exactement la question que cet écran
    # existe pour répondre.
    #
    # Les compteurs RESTENT (ils sont lus ailleurs et se lisent d'un coup d'œil),
    # les listes s'y ajoutent.
    accessible = _block(
        "unavailable" if len(sources_down) == 2 else ("partial" if sources_down else "ready"),
        f"Source indisponible : {', '.join(sources_down)}." if sources_down else None,
        openTenders=len(tender_rows),
        awardedContracts=len(award_rows),
        buyersWithIncumbent=len(buyers_with_incumbent),
        tenders=[_tender_view(r) for r in tender_rows[:15] if isinstance(r, dict)],
        awards=[_award_view(r) for r in award_rows[:15] if isinstance(r, dict)],
    )

    # ── Bloc 5 — ce que je ne sais pas ────────────────────────────────────
    unknowns = [
        "Les panels fournisseurs privés de ce territoire — ils ne sont publiés nulle part.",
        "L'ouverture réelle au rang 2 des ESN présentes, tant que personne ne l'a déclarée.",
    ]
    if competition["state"] == "ready":
        unknowns.append("La densité concurrentielle : l'emploi IT du département n'est pas publié.")
    if market["state"] == "unavailable":
        unknowns.append("Le volume d'offres, faute de réponse de la source d'emploi.")
    # Une source MUETTE est nommée : « pas répondu à temps » n'est pas « rien là-bas ».
    for silent in (hiring, tenders, awards, esn_count):
        if isinstance(silent, TerritorySourceTimeout):
            unknowns.append(f"{silent} — ce bloc est absent, pas vide : réessayer dans un instant.")
    if scope.kind != "department":
        unknowns.append(
            "Les marchés publics à la maille de la ville : BOAMP et DECP publient au département, "
            f"les chiffres d'appels d'offres portent donc sur le {scope.department} entier."
        )

    # ─────────────────────────────────────────────────────────────────────
    # QUELLES SOURCES RÉPONDENT À UNE QUESTION PLUS LARGE QUE CELLE POSÉE
    # ─────────────────────────────────────────────────────────────────────
    # Demander « à 12 km de Toulouse » et recevoir un département n'est pas
    # faux — c'est juste une autre question. Le taire serait le pire des deux :
    # une réponse exacte à une question qu'on n'a pas posée, impossible à
    # repérer à l'écran. Chaque source qui n'a pas su descendre à la maille
    # demandée se NOMME ici, et l'écran l'écrit à côté du bloc concerné.
    coarse_sources: list[str] = []
    if scope.kind != "department":
        # BOAMP et DECP publient au département : ce n'est pas un repli, c'est
        # leur maille de publication. Ils sont donc toujours nommés hors du mode
        # département — y compris quand tout va bien.
        coarse_sources.extend(["tenders", "awards"])
        if market_coarse:
            coarse_sources.append("market")

    return {
        "department": department,
        "sinceDays": since_days,
        # La maille RÉELLEMENT demandée, et sa phrase. L'écran ne la reconstruit
        # pas : deux formulations du même territoire finiraient par diverger, et
        # c'est celle-ci qui a servi à interroger les sources.
        "scope": {
            "kind": scope.kind,
            "label": scope.label,
            "department": scope.department,
            "communeCode": scope.commune_code,
            "communeName": scope.commune_name,
            "radiusKm": scope.radius_km,
        },
        "coarseSources": coarse_sources,
        "market": market,
        "competition": competition,
        "overflow": overflow,
        "accessible": accessible,
        "unknowns": unknowns,
    }


def _normalized(name: str) -> str:
    """Le nom réduit à ce qui permet de le reconnaître d'une source à l'autre.

    Même règle que côté API (`EsnDirectoryService.normalize`) : sans elle,
    « SII Sud-Ouest » de France Travail et « SII SUD OUEST » du référentiel ne
    se rencontreraient jamais, et aucune ESN ne serait reconnue.
    """
    stripped = "".join(c for c in unicodedata.normalize("NFD", str(name or "")) if unicodedata.category(c) != "Mn")
    return " ".join("".join(ch if ch.isalnum() else " " for ch in stripped.lower()).split())


def _tender_view(row: dict[str, Any]) -> dict[str, Any]:
    """Un appel d'offres, réduit à ce qui décide d'y répondre ou non.

    L'objet est déjà dans `signal.label` (« AO IT publié — <objet> ») et la date
    limite dans `signal.detail` : on ne les recalcule pas, on les EXPOSE. Les
    recomposer ici ferait deux descriptions du même fait, qui divergeraient au
    premier millésime de BOAMP.

    `url` est ce qui rend le bloc actionnable : sans le lien vers l'avis, savoir
    qu'un marché existe ne permet pas d'y répondre.
    """
    signal = row.get("signal") if isinstance(row.get("signal"), dict) else {}
    return {
        "name": str(row.get("name") or ""),
        "siren": row.get("siren") or None,
        "department": row.get("department") or None,
        "subject": signal.get("label") or None,
        "date": signal.get("date") or None,
        # La date limite de réponse et les codes CPV, tels que la source les a
        # écrits. C'est le « pourquoi maintenant » du marché.
        "detail": signal.get("detail") or None,
        "url": signal.get("url") or None,
    }


def _award_view(row: dict[str, Any]) -> dict[str, Any]:
    """Un marché attribué — c'est-à-dire une porte, et la date où elle se rouvre.

    ⚠️ `vendor` est le CONCURRENT EN PLACE. C'est l'information la plus chère de
    tout cet écran, et elle n'était nulle part : savoir qu'un acheteur a
    attribué un marché ne dit rien ; savoir QUI le tient et JUSQU'À QUAND dit
    quand commencer à travailler le compte.

    `endsOn` peut être `None` — le millésime ne publie pas toujours la durée. Il
    reste `None` : une fin de contrat estimée serait une date inventée sur
    laquelle on planifierait une prise de contact.
    """
    return {
        "name": str(row.get("name") or ""),
        "siren": row.get("siren") or None,
        "department": row.get("department") or None,
        "subject": row.get("objet") or None,
        # Le titulaire, quand le millésime le nomme ou que le registre l'a
        # résolu. `None` = non résolu, JAMAIS un SIRET brut affiché comme un nom.
        "vendor": row.get("vendor") or None,
        "amount": row.get("amount") if isinstance(row.get("amount"), (int, float)) else None,
        "durationMonths": row.get("durationMonths") if isinstance(row.get("durationMonths"), int) else None,
        "endsOn": row.get("endsOn") or None,
        "url": row.get("url") or None,
    }
