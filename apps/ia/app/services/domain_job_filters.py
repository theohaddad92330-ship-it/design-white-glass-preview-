"""Quelles offres d'emploi comptent, selon le domaine que le vendeur VEND.

Addendum Stelya §11 et décision de Louis du 24/08 (« dé-siloter les SOURCES
d'abord, le bloc Découvrir ensuite »).

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT
─────────────────────────────────────────────────────────────────────────────
Le tri des offres était IT EN DUR : préfixe ROME ``M18`` plus un lexique
informatique. Le commentaire de ``france_travail.py`` le dit d'ailleurs sans le
vouloir — « methodes » y est écarté du lexique IT parce qu'il ramène des
« méthodes industrielles », et « régleurs sur commande numérique » y est cité
comme exemple de ce qu'on ne veut PAS. C'est-à-dire exactement ce qu'une société
de conseil en ingénierie industrielle cherche.

Un portefeuille industriel changeait donc le prisme des PROMPTS sans rien
changer aux SOURCES : le vendeur lisait des offres de développeurs.

─────────────────────────────────────────────────────────────────────────────
LA SÛRETÉ
─────────────────────────────────────────────────────────────────────────────
``None`` (pas de pack), ``esn_it`` ou un pack sans filtre déclaré ⇒ le tri IT
historique, à l'octet près. Les filtres ci-dessous n'ajoutent un domaine que
lorsqu'un vendeur l'a EXPLICITEMENT déclaré.

Et ils ne remplacent jamais la règle de fond du domaine industriel : une offre
d'emploi dit une ACTIVITÉ, pas un achat. C'est le prompt qui porte cette lecture
(``industrial_engineering.py``) ; ici on ne fait que cesser de jeter les offres
qui parlent du métier du vendeur.

─────────────────────────────────────────────────────────────────────────────
UN SECOND AXE, ORTHOGONAL : LE PLACEMENT (#1124)
─────────────────────────────────────────────────────────────────────────────
Le pack dit QUEL MÉTIER le vendeur vend. Il ne dit rien de son MODE de vente.
Une ESN informatique qui place aussi des profils en CDI chez ses clients veut
les offres IT (qu'elle a déjà) **et** les autres — pour elle, toute ouverture
de poste chez un compte est une piste, quel que soit le rôle.

Ce n'est donc pas un pack de plus : remplacer le tri IT par un tri
« recrutement » lui ferait PERDRE les offres IT, c'est-à-dire l'inverse de ce
qu'elle demande. C'est un ÉLARGISSEMENT — l'axe se lit
:func:`recruits_for_clients` et se compose avec le pack au lieu de s'y
substituer.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


def fold(value: object) -> str:
    """minuscules, sans accents, apostrophes normalisées — même règle que le
    tri IT (France Travail publie « Systèmes d'Information » avec l'apostrophe
    typographique, qui ne matchait pas la simple)."""
    s = str(value or "").lower().replace("’", "'").replace("ʼ", "'").replace("`", "'")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


@dataclass(frozen=True)
class DomainJobFilter:
    """Ce qui prouve qu'une offre relève du domaine d'un vendeur."""

    #: Préfixes ROME (référentiel PUBLIC France Travail) qui suffisent à eux
    #: seuls. Volontairement des sous-familles et non des lettres entières :
    #: « H » couvre toute l'industrie, jusqu'aux postes de conduite de machine,
    #: qui noieraient le signal d'un bureau d'études.
    rome_prefixes: tuple[str, ...]
    #: Termes NON AMBIGUS de l'intitulé ou du vocabulaire contrôlé de l'API.
    terms: tuple[str, ...]

    def matches(self, offer: dict) -> bool:
        if not isinstance(offer, dict):
            return False
        rome = str(offer.get("romeCode") or "").upper()
        if rome and any(rome.startswith(prefix) for prefix in self.rome_prefixes):
            return True
        blob = fold(
            f"{offer.get('intitule') or ''} {offer.get('appellationlibelle') or ''} {offer.get('romeLibelle') or ''}"
        )
        return bool(self._regex.search(blob))

    @property
    def _regex(self) -> re.Pattern[str]:
        # Compilé à la demande et mis en cache sur l'instance gelée via le dict
        # de classe — les instances sont des constantes de module.
        cached = _REGEX_CACHE.get(id(self))
        if cached is None:
            cached = re.compile("|".join(rf"\b{re.escape(t)}\b" for t in self.terms))
            _REGEX_CACHE[id(self)] = cached
        return cached


_REGEX_CACHE: dict[int, re.Pattern[str]] = {}


#: Ingénierie industrielle — les sous-familles ROME du référentiel public :
#: H12 (études/R&D industrielles), H14 (méthodes, industrialisation, gestion de
#: production), H15 (qualité industrielle), H25 (management de production),
#: I11 (management et ingénierie de maintenance), I13 (installation et
#: maintenance d'équipements industriels).
#: LUD.3 — génie civil / BTP : F11 (conception et études du BTP), F12 (conduite
#: et encadrement de chantier). Volontairement PAS F13+ (second œuvre, gros
#: œuvre, montage : des métiers d'exécution qui noieraient le signal d'une ESN
#: d'assistance technique, comme « H » entier le ferait pour l'industrie).
_INDUSTRIAL = DomainJobFilter(
    rome_prefixes=("H12", "H14", "H15", "H25", "I11", "I13", "F11", "F12"),
    terms=(
        # LUD.3 — génie civil, BTP, conduite de travaux
        "conducteur de travaux",
        "conducteurs de travaux",
        "conductrice de travaux",
        "coordinateur de chantier",
        "coordinatrice de chantier",
        "coordinateur chantier",
        "ingenieur genie civil",
        "genie civil",
        "charge d'affaires",
        "chargee d'affaires",
        # Bureau d'études et conception
        "bureau d'etudes",
        "bureau d'etude",
        "projeteur",
        "dessinateur",
        "calcul de structures",
        "conception mecanique",
        "cao",
        "catia",
        "solidworks",
        # Méthodes et industrialisation
        "methodes",
        "industrialisation",
        "gammes",
        "npi",
        "amelioration continue",
        "lean manufacturing",
        # Automatisme et contrôle-commande
        "automatisme",
        "automaticien",
        "controle-commande",
        "robotique",
        "mise en service",
        "commissioning",
        # Qualité et validation
        "qualite fournisseur",
        "assurance qualite",
        "metrologie",
        "amdec",
        "ivvq",
        # Maintenance et fiabilité
        "maintenance industrielle",
        "fiabilite",
        "gmao",
        "arret de tranche",
        "turnaround",
        # Production et industrie
        "ingenieur production",
        "responsable production",
        "process engineer",
        "supply chain industrielle",
        # HSE
        "hse",
        "securite industrielle",
    ),
)


#: pack d'offre → filtre. Un pack absent d'ici garde le tri historique.
DOMAIN_JOB_FILTERS: dict[str, DomainJobFilter] = {
    "industrial_engineering": _INDUSTRIAL,
}


def job_filter_for(pack: str | None) -> DomainJobFilter | None:
    """Le filtre du pack, ou ``None`` quand le tri IT historique s'applique.

    ``esn_it`` rend explicitement ``None`` : le tri IT vit dans
    ``france_travail.py`` et n'a pas à être recopié ici — deux définitions du
    même tri divergeraient au premier terme ajouté d'un seul côté.

    ⚠️ ``None`` pour un autre pack n'est PAS un vide : c'est un trou DÉCLARÉ.
    Six des huit packs enregistrés retombent aujourd'hui sur le tri IT, et la
    raison de chacun — avec la taille du lexique V10 qu'il resterait à curer —
    est écrite dans :mod:`app.services.domain_filter_gaps`. Un filtre muet se
    lit « il n'y avait rien » ; celui-ci dit ce qu'il ne trie pas.
    """
    if not pack or pack == "esn_it":
        return None
    return DOMAIN_JOB_FILTERS.get(pack)


def recruits_for_clients(profile: dict | None) -> bool:
    """Le vendeur place-t-il des profils EN CDI chez ses clients ? (#1124)

    « Je propose aussi à mes clients du recrutement de profil IT en fixe chez
    eux. Donc si tu peux me sortir les annonces de postes comme ça, je suis
    assez refait. »

    DÉCLARÉ dans le profil ESN, jamais déduit — et c'est le cœur de la
    décision. On aurait pu le tirer d'`offer_domains` en y cherchant « RH,
    talent, recrutement » : ce domaine désigne le fait de vendre du CONSEIL RH,
    pas de placer des gens. Un vendeur de SIRH aurait vu son signal d'emploi
    exploser sans l'avoir demandé, et l'ESN IT qui place réellement — dont les
    domaines sont tous informatiques — n'aurait rien vu changer. Une dérivation
    qui se trompe dans les deux sens n'est pas une dérivation.

    Absent, `False` ou profil vide ⇒ ``False`` ⇒ tri historique à l'octet près.
    """
    return bool((profile or {}).get("recruitsForClients") is True)


# ─────────────────────────────────────────────────────────────────────────────
# #3901 — « ce n'est plus offre IT, c'est offre tout court » (Louis, 10/10/2026)
# ─────────────────────────────────────────────────────────────────────────────
# La pertinence d'une offre dépend du CONTEXTE de l'ESN ou de la BU de
# l'utilisateur : son domaine d'offre (pack) et les métiers qu'il place. Pas de
# filtre IT fixe, et SANS profil exploitable on ne filtre pas — on n'invente pas
# un périmètre. Un seul endroit : les sources d'offres (France Travail, APEC,
# WTTJ, recherche) appellent toutes `offer_relevant_to_profile`.

_ROLE_STOPWORDS = frozenset({"des", "les", "une", "pour", "chez", "avec", "et", "de", "du", "la", "le", "en"})


@dataclass(frozen=True)
class ProfileJobScope:
    """Ce que le profil déclare vendre/placer — jamais déduit."""

    packs: tuple[str, ...]
    role_terms: tuple[str, ...]
    any_role: bool


def _as_list(value: object) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    return [str(v).strip() for v in value if str(v or "").strip()]


def profile_job_scope(profile: dict | None) -> ProfileJobScope | None:
    """Le périmètre d'offres du profil, ou ``None`` : profil vide ⇒ aucun filtre."""
    if not isinstance(profile, dict):
        return None
    raw_packs = _as_list(profile.get("offerDomain")) + _as_list(
        profile.get("offerDomains") or profile.get("offer_domains")
    )
    packs = [fold(p).replace(" ", "_") for p in raw_packs]
    terms: list[str] = []
    for role in _as_list(profile.get("placed_roles") or profile.get("placedRoles")):
        for word in re.split(r"[^a-z0-9#+.]+", fold(role)):
            if len(word) >= 3 and word not in _ROLE_STOPWORDS and word not in terms:
                terms.append(word)
    if not packs and not terms:
        return None
    return ProfileJobScope(
        packs=tuple(dict.fromkeys(packs)), role_terms=tuple(terms), any_role=recruits_for_clients(profile)
    )


def _role_match_text(value: str) -> str:
    """Repli de comparaison des métiers : même règle que ``foldForRoleMatch`` (contracts)."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#+.]+", " ", fold(value))).strip()


def _declared_roles(profile: dict | None) -> list[str]:
    if not isinstance(profile, dict):
        return []
    return _as_list(profile.get("placed_roles") or profile.get("placedRoles"))


def inferred_role_terms(profile: dict | None) -> tuple[str, ...]:
    """Les termes des métiers DÉDUITS (décision Louis 11/10/2026), ou ``()``.

    Calculés par l'API (``placed-roles-inference.ts``) depuis tout le contexte
    de l'espace. Vides dès qu'un métier est DÉCLARÉ : le déclaré gagne toujours.
    Une entrée illisible est écartée, jamais complétée.
    """
    if not isinstance(profile, dict) or _declared_roles(profile):
        return ()
    raw = profile.get("inferredPlacedRoles")
    if not isinstance(raw, list):
        return ()
    terms: list[str] = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("role"), str):
            continue
        for term in item.get("terms") if isinstance(item.get("terms"), list) else []:
            folded = _role_match_text(term) if isinstance(term, str) else ""
            if folded and folded not in terms:
                terms.append(folded)
    return tuple(terms)


def _title_blob(offer: dict) -> str:
    view = _offer_view(offer)
    return _role_match_text(
        f"{view.get('intitule') or ''} {view.get('appellationlibelle') or ''} {view.get('romeLibelle') or ''}"
    )


def _matches_terms(blob: str, terms: tuple[str, ...]) -> bool:
    return bool(terms) and re.search(
        "|".join(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])" for t in terms), blob
    ) is not None


#: SIMON-FIX S.14 — famille ROME « J » = santé : aucune ESN ne place ces métiers, même sous un intitulé neutre.
_NON_PLACED_ROME_PREFIXES = ("J",)


def _is_non_placed_offer(offer: dict) -> bool:
    from app.services.discover_hiring_scope import is_non_placed_position  # import tardif : ce module est son socle

    view = _offer_view(offer)
    rome = str(view.get("romeCode") or "").strip().upper()
    if rome.startswith(_NON_PLACED_ROME_PREFIXES):
        return True
    return any(
        is_non_placed_position(str(view.get(key) or ""))
        for key in ("intitule", "appellationlibelle", "romeLibelle")
    )


def _is_digital_esn_profile(profile: dict | None) -> bool:
    """ESN numérique/IT DÉCLARÉE (``esn_it`` ou domaine sans filtre propre).

    Jamais sans profil, jamais pour une ESN de placement (``recruitsForClients`` garde toute ouverture) :
    les signaux de recrutement suivent le SECTEUR de l'ESN (Louis).
    """
    if not isinstance(profile, dict) or recruits_for_clients(profile):
        return False
    scope = profile_job_scope(profile)
    return scope is not None and any(job_filter_for(pack) is None for pack in scope.packs)


def offer_relevant_to_profile(offer: dict, profile: dict | None, *, it_check) -> bool:
    """L'offre est-elle pertinente pour CE profil ? (``it_check`` : le tri IT de la source.)

    Sans profil exploitable ⇒ ``True`` (on ne filtre pas). Placement en CDI
    (``recruitsForClients``) ⇒ ``True``. Sinon : un métier placé, le filtre de
    SON domaine, ou le tri IT quand le domaine est IT/sans filtre déclaré —
    jamais le tri IT imposé à une ESN industrie, ni aux métiers d'une BU cyber.

    Métiers DÉDUITS (11/10/2026) : ils ÉLARGISSENT — une offre gardée par la
    règle déclarée le reste, une offre qui recoupe un métier déduit s'ajoute.
    """
    # SIMON-FIX S.14 — un poste que nulle ESN ne place (soin, tri, livraison…) sort À LA SOURCE, pour toutes
    # les sources d'offres : un placeur en CDI (``recruitsForClients``) gardait « Infirmier », « Agent de tri ».
    # Le verdict vit à UN endroit (``discover_hiring_scope``, GA-26) ; sans profil on ne filtre pas.
    if _is_digital_esn_profile(profile) and isinstance(offer, dict) and _is_non_placed_offer(offer):
        return False
    if _declared_offer_relevant(offer, profile, it_check=it_check):
        return True
    terms = inferred_role_terms(profile)
    return bool(terms) and isinstance(offer, dict) and _matches_terms(_title_blob(offer), terms)


def placed_role_terms(profile: dict | None) -> tuple[str, ...]:
    """Les métiers que le vendeur place — déclarés, sinon déduits —, en termes de titre ; ``()`` sans métier."""
    declared = _declared_roles(profile)
    if declared:
        return tuple(dict.fromkeys(t for t in (_role_match_text(r) for r in declared) if t))
    return inferred_role_terms(profile)


def offer_matches_trade(offer: object, terms: tuple[str, ...]) -> bool:
    """DECATHLON 30/10 — l'offre recoupe-t-elle un métier du vendeur (``placed_role_terms``) ?"""
    return isinstance(offer, dict) and _matches_terms(_title_blob(offer), terms)


def trade_offer_count(offers: list, terms: tuple[str, ...]) -> int:
    """Les offres DU MÉTIER du vendeur ; sans métier, toutes comptent (chemin historique).

    DECATHLON 30/10 — un placeur en CDI garde toute offre : sans ce compte, 10 offres de vente
    « atteignaient » le plancher et aucune offre data n'était jamais cherchée."""
    if not terms:
        return len(offers)
    return sum(1 for o in offers if offer_matches_trade(o, terms))


def rank_offers_by_placed_roles(offers: list, profile: dict | None) -> list:
    """Les offres qui recoupent un métier placé (déclaré, sinon déduit) passent EN TÊTE.

    Tri STABLE : l'ordre des sources est gardé à l'intérieur de chaque groupe.
    Sans métier : la liste revient telle quelle (même objet) — chemin historique.
    """
    terms = placed_role_terms(profile)
    if not terms or not isinstance(offers, list):
        return offers
    head = [o for o in offers if offer_matches_trade(o, terms)]
    if not head:
        return offers
    head_ids = {id(o) for o in head}
    return head + [o for o in offers if id(o) not in head_ids]


def _declared_offer_relevant(offer: dict, profile: dict | None, *, it_check) -> bool:
    scope = profile_job_scope(profile)
    if scope is None:
        return True
    # #4182 — le placement en CDI garde toute ouverture SEULEMENT quand aucun métier n'est
    # déclaré : des postes visés déclarés pilotent le tri, même pour un placeur.
    if scope.any_role and not scope.role_terms:
        return True
    if not isinstance(offer, dict):
        return False
    offer = _offer_view(offer)
    blob = fold(
        f"{offer.get('intitule') or ''} {offer.get('appellationlibelle') or ''} {offer.get('romeLibelle') or ''}"
    )
    if scope.role_terms and re.search(
        "|".join(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])" for t in scope.role_terms), blob
    ):
        return True
    if scope.any_role:
        return False
    for pack in scope.packs:
        domain_filter = job_filter_for(pack)
        if domain_filter is not None:
            if domain_filter.matches(offer):
                return True
        elif it_check(offer):
            return True
    return False


def _offer_view(offer: dict) -> dict:
    """#3901 — une ligne déjà RENDUE (``title``, ``romeLabel``) lue comme une offre brute.

    Les offres par compte arrivent rendues (France Travail, APEC, WTTJ, boards
    ATS, pages carrières : ``title``) ; l'offre brute porte ``intitule`` /
    ``romeLibelle``. La lecture s'adapte ICI, pas chez chaque appelant.
    """
    view = dict(offer)
    if not view.get("intitule") and view.get("title"):
        view["intitule"] = view["title"]
    if not view.get("romeLibelle") and view.get("romeLabel"):
        view["romeLibelle"] = view["romeLabel"]
    return view


def profile_widens_collection(profile: dict | None) -> bool:
    """#3901 — une source d'offres PAR COMPTE doit-elle collecter sans son tri IT ?

    ``False`` seulement quand le tri IT propre à la source EST la règle du
    profil (domaine IT ou sans filtre déclaré, aucun métier placé, pas de
    placement en CDI) : chemin historique à l'octet près. Sinon on collecte
    large et :func:`offer_relevant_to_profile` juge — sans profil exploitable,
    elle garde tout (on n'invente pas de périmètre).
    """
    scope = profile_job_scope(profile)
    if scope is None or scope.any_role:
        return True
    if inferred_role_terms(profile):
        return True  # 11/10/2026 — un métier déduit hors IT ne se voit qu'en collectant large
    return bool(scope.role_terms) or any(job_filter_for(pack) is not None for pack in scope.packs)


# ─────────────────────────────────────────────────────────────────────────────
# #4045 — LE MOT-CLÉ DE LA RECHERCHE DISCOVER TRIE LES SIGNAUX (Louis 12/10)
# ─────────────────────────────────────────────────────────────────────────────
# « keywords=cybersécurité » ne servait qu'à lire un TYPE d'entreprise (NAF) :
# un recrutement « Data Analyst » sortait avant un « Analyste SOC ». Le mot-clé
# TRIE maintenant les signaux de chaque candidat — il ne retire JAMAIS une
# entreprise ni un signal. UN seul lexique, ici (GA-26) : le web ne le recopie
# pas, il lit le drapeau ``keywordMatch`` que le tri pose sur le signal.

#: Les familles de mots-clés connues : un mot de la famille appelle tous les
#: termes de son métier. Pliés (:func:`fold`). Un mot-clé hors famille ne
#: s'élargit pas : il reste lui-même, jamais un synonyme deviné.
_KEYWORD_FAMILIES: tuple[tuple[str, ...], ...] = (
    (
        "cyber",
        "cybersecurite",
        "cybersecurity",
        "securite informatique",
        "securite des systemes d'information",
        "ssi",
        "soc",
        "pentest",
        "pentester",
        "rssi",
        "ciso",
        "iam",
        "secops",
        "devsecops",
        "grc",
        "cert",
        "siem",
        "edr",
        "forensic",
        "ethical hacker",
        "securite applicative",
    ),
)


def keyword_terms(keywords: object) -> tuple[str, ...]:
    """Les termes pliés qu'un mot-clé de recherche désigne. Vide ⇒ aucun tri."""
    raw = keywords if isinstance(keywords, (list, tuple)) else [keywords]
    terms: list[str] = []
    for item in raw:
        word = fold(item).strip()
        if not word:
            continue
        family = next((f for f in _KEYWORD_FAMILIES if word in f), None)
        for term in family if family is not None else (word,):
            if term not in terms:
                terms.append(term)
    return tuple(terms)


def signal_matches_keywords(signal: dict, terms: tuple[str, ...]) -> bool:
    """Le signal (intitulé, détail, technologies) porte-t-il un des termes ?
    Un MOT ENTIER, jamais une sous-chaîne (« soc » ≠ « soccer »)."""
    if not terms or not isinstance(signal, dict):
        return False
    techs = signal.get("technologies")
    blob = fold(" ".join([str(signal.get("label") or ""), str(signal.get("detail") or ""), *map(str, techs or [])]))
    return any(re.search(rf"(?<![a-z0-9]){re.escape(t)}(?![a-z0-9])", blob) for t in terms)
