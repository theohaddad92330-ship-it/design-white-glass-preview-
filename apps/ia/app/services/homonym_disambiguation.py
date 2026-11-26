"""Déterministe homonym disambiguation — pick the RIGHT SIREN among namesakes.

Retour Théo (p.10 / homonyme) : quand un nom saisi ("THALES", "Société Générale",
"Groupe SEB") correspond à PLUSIEURS entités légales actives, la résolution actuelle
(``pappers.search_company``) prend le 1er hit du classement Pappers, aveuglément.
Deux sociétés qui portent le MÊME nom légal passent donc toutes les deux le garde
de similarité de nom (elles sont identiques) : on part sur le mauvais SIREN.

La similarité de nom ne peut pas trancher (les noms SONT identiques) ; les FAITS
registre le peuvent : taille (le vrai groupe n'est pas une TPE 1-2 salariés), NAF
(secteur cohérent, IT 62.0x privilégié pour une ESN), établissements (un groupe en
a beaucoup), statut (cessée = écartée), géographie (siège). Ce module note chaque
candidat sur ces faits et :

  - si UN candidat domine nettement (nom fort + écart clair) → **sélection** ;
  - si plusieurs candidats se valent → **statut ``ambiguous``**, on renvoie la
    liste scorée (SIREN, raison sociale, NAF, ville, taille, statut, score) pour
    que l'appelant / l'UI tranche — JAMAIS un choix silencieux au hasard ;
  - si aucun candidat plausible → statut ``none`` — échec clair, aucun SIREN
    inventé (règle CLAUDE.md : jamais de donnée fictive) ;
  - si un SIREN est fourni (scope lock, le commercial a déjà choisi) → statut
    ``locked`` — la désambiguïsation est court-circuitée, on respecte son choix.

Purement déterministe, aucun LLM (même philosophie que ``identity_resolution`` /
``entities`` / ``truth_status``). ``score_candidate`` / ``disambiguate`` sont
sans I/O — le fetch des candidats vit dans ``research/homonym.py`` (source libre
recherche-entreprises, sans clé). Les FAITS restent factuels : on ne fabrique
jamais un candidat, on ne fait que classer ceux que le registre renvoie.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher

from pydantic import BaseModel, ConfigDict, Field

from app.services.company_filters import parse_headcount_label
from app.services.insee_sirene import is_it_naf
from app.services.it_entity import is_it_entity
from app.services.text_norm import normalize_name

# ── Selection thresholds ────────────────────────────────────────────────────
# A candidate whose name barely resembles the query is never selectable — same
# floor as the legacy Pappers gate (``search.MIN_NAME_SIMILARITY``) for parity.
NAME_FLOOR = 0.55
# The winner must be a STRONG name match (guards against selecting a loose
# partial just because it happens to be the biggest of several weak matches).
HIGH_NAME = 0.80
# The winner must beat the runner-up by this confidence margin to be "dominant";
# below it the field is treated as ambiguous (return the list, don't guess).
DOMINANCE_MARGIN = 0.15
# …but the COMPOSITE margin alone is blind to the case where the name itself
# already decides. A registry search for "Enedis" returns ENEDIS (exact) next to
# ENEDIS SIC / CSE ENEDIS DR PARIS — derivatives, not namesakes. Their composite
# scores land within 0.15 of the real entity, so the field read as "ambiguous"
# and NOTHING was selected (« 21 entreprise(s) non rattachée(s) à un SIREN »).
# When the top candidate is a clearly BETTER name match than every other one, the
# name has done the disambiguating and the composite margin is not required.
NAME_DOMINANCE_MARGIN = 0.10
# Registry-fact dominance (the whole point of this module per its docstring: "le
# vrai groupe n'est pas une TPE 1-2 salariés… un groupe a beaucoup
# d'établissements"). At EQUAL name strength, a candidate with a known, order-of-
# magnitude larger footprint beats one that is unknown/tiny. Deliberately steep so
# only a crushing gap qualifies — comparable namesakes stay ambiguous.
_FACT_HEADCOUNT_RATIO = 10
_FACT_ESTABLISHMENT_RATIO = 5
# Two name scores within this delta count as "equal confidence" — the regime
# where the NAF-IT tiebreak (Théo : entité IT = cible n°1 d'une ESN) may decide.
_NAME_TIE_DELTA = 0.10

# Confidence weights. Name dominates by design; size / NAF-IT / group / active
# are separators that only matter once the name matches. They sum to 1.0 so a
# perfect factual match caps at 1.0 (+ an optional small geographic bonus).
_W_NAME = 0.60
_W_SIZE = 0.20
_W_ACTIVE = 0.07
_W_IT = 0.10
_W_GROUP = 0.03
_GEO_BONUS = 0.05

# Legal-form tokens dropped before name comparison so "THALES SA" == "THALES".
_LEGAL_SUFFIX_TOKENS = frozenset(
    {"sa", "sas", "sasu", "sarl", "eurl", "sci", "se", "snc", "scop", "sca", "selarl", "scs", "sc", "gie"}
)

# INSEE ``tranche d'effectif salarié`` code → lower bound of the bracket (employees).
# Lets a big group (2000-4999 → "51") outrank a namesake TPE (1-2 → "01").
_TRANCHE_MIN_EMP: dict[str, int] = {
    "00": 0, "01": 1, "02": 3, "03": 6, "11": 10, "12": 20, "21": 50, "22": 100,
    "31": 200, "32": 250, "41": 500, "42": 1000, "51": 2000, "52": 5000, "53": 10000,
}
# INSEE ``catégorie d'entreprise`` → a coarse employee floor when no tranche is given.
_CATEGORY_MIN_EMP: dict[str, int] = {"GE": 5000, "ETI": 250, "PME": 10, "TPE": 0}


def tranche_to_employees(code: object) -> int | None:
    """INSEE effectif tranche code ("51") → lower employee bound (2000). ``None``
    for unknown / "NN" so an absent headcount reads as neutral, never as zero."""
    key = str(code or "").strip()
    return _TRANCHE_MIN_EMP.get(key)


def normalize_company_name(name: object) -> str:
    """Accent/case-fold + drop legal-form tokens for name comparison. Falls back
    to the raw normalized name if stripping suffixes empties it out."""
    toks = [t for t in normalize_name(name).split() if t not in _LEGAL_SUFFIX_TOKENS]
    return " ".join(toks) or normalize_name(name)


#: Alias interne historique — ``normalize_company_name`` est le nom public,
#: réutilisé par ``esn_candidate_ranking`` pour que les deux étages normalisent
#: EXACTEMENT pareil.
_norm_company = normalize_company_name


def name_similarity(query: object, candidate: object) -> float:
    """0..1 similarity between the queried name and a candidate's legal name.

    Exact (suffix-stripped) → 1.0. When every query token is present in the
    candidate ("thales" ⊆ "thales avionics") we award a high partial score scaled
    by coverage, so a genuine parent/brand match beats a raw character ratio.
    """
    q = _norm_company(query)
    c = _norm_company(candidate)
    if not q or not c:
        return 0.0
    if q == c:
        return 1.0
    ratio = SequenceMatcher(None, q, c).ratio()
    q_tokens = set(q.split())
    c_tokens = set(c.split())
    if q_tokens and q_tokens <= c_tokens:
        coverage = len(q_tokens) / max(len(c_tokens), 1)
        return max(ratio, 0.75 + 0.20 * coverage)
    return ratio


def autocomplete_name_score(query: object, *names: object) -> float:
    """Similarité de nom TOLÉRANTE AU PRÉFIXE — la variante d'une saisie EN COURS.

    Dans une liste déroulante, l'utilisateur tape encore : « Ki » est un excellent
    indice pour KICKLOX alors que sa distance d'édition est mauvaise.
    :func:`name_similarity`, calibrée sur un nom COMPLET, viderait la liste au
    deuxième caractère.

    Le bonus de préfixe est mis à l'échelle par la COUVERTURE, exactement comme
    la règle de sous-ensemble de tokens juste au-dessus, et pour la même raison :
    sans elle, « KICKLOX PARTICIPATIONS ET IMMOBILIER DU SUD » et « KICKLOX »
    obtiendraient le même 0,9 sur la saisie « Kicklox », et les faits registre
    (taille, établissements) suffiraient alors à faire passer le mastodonte
    homonyme devant la société cherchée. Mesuré ; c'est le test
    « ne prime jamais sur un bien meilleur nom ».

    Plusieurs ``names`` parce que le registre expose DEUX noms — ``nom_complet``
    (souvent la marque) et ``nom_raison_sociale``. Les deux désignent la même
    entité : prendre le meilleur n'est pas une supposition.
    """
    typed = _norm_company(query)
    if not typed:
        return 0.0

    best = 0.0
    for raw in names:
        candidate = _norm_company(raw)
        if not candidate:
            continue
        if candidate == typed:
            score = 1.0
        elif candidate.startswith(typed):
            score = max(name_similarity(typed, candidate), 0.75 + 0.20 * (len(typed) / len(candidate)))
        elif any(token.startswith(typed) for token in candidate.split()):
            score = max(name_similarity(typed, candidate), 0.70 + 0.20 * (len(typed) / len(candidate)))
        else:
            score = name_similarity(typed, candidate)
        best = max(best, score)
    return best


def _employees(headcount: int | None, size_class: str | None) -> int | None:
    if isinstance(headcount, bool):
        return None
    if isinstance(headcount, int):
        return headcount
    if size_class:
        return _CATEGORY_MIN_EMP.get(str(size_class).strip().upper())
    return None


def _size_score(employees: int | None) -> tuple[float, bool]:
    """(score, known). Unknown size → a NEUTRAL 0.5 so it never manufactures a
    margin: two same-name entities of unknown size stay tied → ambiguous."""
    if employees is None:
        return 0.5, False
    for threshold, score in (
        (5000, 1.0), (1000, 0.85), (250, 0.70), (100, 0.55),
        (50, 0.45), (20, 0.35), (10, 0.25), (3, 0.12), (1, 0.05),
    ):
        if employees >= threshold:
            return score, True
    return 0.0, True


def _pct(value: float) -> int:
    return round(100 * value)


class Candidate(BaseModel):
    """A registry match to be scored. Provider-agnostic (recherche-entreprises /
    INSEE / Pappers) — only ``siren`` is required; every other field is optional
    and the scoring degrades gracefully when it's absent."""

    siren: str
    name: str = ""
    # The RAISON SOCIALE, when the source carries it alongside the (often
    # brand-flavoured) trade name. The registry routinely returns
    # "ELECTRICITE DE FRANCE (EDF)" as ``name`` and "ELECTRICITE DE FRANCE" as the
    # legal name — scoring only one of the two demotes the right entity.
    legal_name: str = Field(default="", alias="legalName")
    naf_code: str | None = Field(default=None, alias="nafCode")
    naf_label: str | None = Field(default=None, alias="nafLabel")
    city: str | None = None
    department: str | None = None
    headcount: int | None = None
    size_class: str | None = Field(default=None, alias="sizeClass")
    establishment_count: int | None = Field(default=None, alias="establishmentCount")
    #: La tranche d'effectif INSEE (le CODE, pas le libellé) et la date de
    #: création. Le registre les publiait, le candidat les jetait — et la
    #: barrière d'achat (tome 3) a besoin des deux : « 250+ salariés » se lit
    #: 250 alors que le code dit 5 000 à 9 999.
    headcount_tranche: str | None = Field(default=None, alias="headcountTranche")
    creation_date: str | None = Field(default=None, alias="creationDate")
    #: #2616.2 — catégorie juridique INSEE (``nature_juridique``). Le registre
    #: la publie, comme `headcount_tranche`/`creation_date` ci-dessus ; sans ce
    #: champ, `is_public_employer` (`account_qualification.py`) ne peut jamais
    #: distinguer un employeur public sur un candidat résolu par NOM (BOAMP,
    #: France Travail, APEC) — seul le chemin SIREN direct (DECP) la portait.
    legal_category: str | None = Field(default=None, alias="legalCategory")
    is_active: bool = Field(default=True, alias="isActive")
    #: #4712 — établissements ACTIFS de l'entité dans le département de l'offre ; ``None`` = lieu non demandé.
    site_establishments: int | None = Field(default=None, alias="siteEstablishments")
    source: str = ""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ScoredCandidate(BaseModel):
    """A candidate with its confidence score + a human-readable breakdown. Dumped
    (``by_alias=True``) into ``raw_analysis`` so the front can show every homonym
    it considered (SIREN, raison sociale, NAF, ville, taille, statut, score)."""

    siren: str
    name: str
    naf_code: str | None = Field(default=None, alias="nafCode")
    naf_label: str | None = Field(default=None, alias="nafLabel")
    naf_is_it: bool = Field(default=False, alias="nafIsIt")
    city: str | None = None
    department: str | None = None
    headcount: int | None = None
    size_class: str | None = Field(default=None, alias="sizeClass")
    establishment_count: int | None = Field(default=None, alias="establishmentCount")
    #: La tranche d'effectif INSEE (le CODE, pas le libellé) et la date de
    #: création. Le registre les publiait, le candidat les jetait — et la
    #: barrière d'achat (tome 3) a besoin des deux : « 250+ salariés » se lit
    #: 250 alors que le code dit 5 000 à 9 999.
    headcount_tranche: str | None = Field(default=None, alias="headcountTranche")
    creation_date: str | None = Field(default=None, alias="creationDate")
    #: #2616.2 — voir la même note sur `Candidate.legal_category` ci-dessus.
    legal_category: str | None = Field(default=None, alias="legalCategory")
    is_active: bool = Field(default=True, alias="isActive")
    name_score: float = Field(default=0.0, alias="nameScore")
    score: float = 0.0
    reasons: list[str] = Field(default_factory=list)
    #: #4712 — voir ``Candidate.site_establishments``.
    site_establishments: int | None = Field(default=None, alias="siteEstablishments")
    source: str = ""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class HomonymResolution(BaseModel):
    """Verdict of the disambiguation.

    - ``locked`` — a SIREN was supplied (scope lock) → choice respected, no scan.
    - ``unique`` — exactly one plausible candidate → selected.
    - ``selected`` — several candidates but one DOMINATES → selected.
    - ``ambiguous`` — several plausible, none dominates → ``selected_siren`` None,
      the full scored list is returned for the caller / UI to arbitrate.
    - ``none`` — no plausible candidate → nothing selected, no SIREN invented.
    """

    status: str
    selected_siren: str | None = Field(default=None, alias="selectedSiren")
    confidence: float = 0.0
    candidate_count: int = Field(default=0, alias="candidateCount")
    candidates: list[ScoredCandidate] = Field(default_factory=list)
    message: str = ""
    reasons: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @property
    def is_ambiguous(self) -> bool:
        return self.status == "ambiguous"


def _tranche_or_label_employees(raw: dict) -> int | None:
    """Code de tranche INSEE d'abord, puis libellé TEXTUEL (« Entre 3 et 5
    salariés ») — #4409.1. Absent des deux : ``None``, jamais zéro."""
    coded = tranche_to_employees(raw.get("headcountTranche"))
    if coded is not None:
        return coded
    return parse_headcount_label(raw.get("headcountLabel"))


def candidate_from_registry_row(raw: dict) -> Candidate:
    """Map a ``recherche-entreprises`` candidate dict onto a scorable
    :class:`Candidate`.

    The INSEE effectif tranche code ("51") is resolved to an employee lower bound
    so the size factor works; an unknown / "NN" bracket stays ``None`` — neutral,
    JAMAIS zéro : « aucun salarié déclaré » et « le registre ne publie pas la
    tranche » sont deux faits opposés, et les confondre ferait du score une
    mesure de la complétude de nos données.

    ⚠️ UNE seule projection registre → candidat, ici. Elle a longtemps vécu dans
    ``research/homonym.py``, qui était son unique appelant ; le sélecteur
    d'entreprise en a besoin du même, et deux copies d'une projection divergent
    au premier champ ajouté (le registre en publie treize).
    """
    return Candidate(
        siren=str(raw.get("siren") or ""),
        name=str(raw.get("name") or ""),
        # ``search_companies`` already returns the raison sociale next to the
        # trade name; forwarding it lets the scorer match on either.
        legalName=str(raw.get("legalName") or ""),
        nafCode=raw.get("nafCode"),
        nafLabel=raw.get("nafLabel"),
        city=raw.get("city"),
        department=raw.get("department"),
        # Une source qui publie l'effectif en CHIFFRE (Pappers : `effectif_min`)
        # passe `headcount` ; le registre libre passe un code de tranche. Absent
        # des deux = neutre, jamais zéro.
        headcount=(
            raw["headcount"]
            if isinstance(raw.get("headcount"), int) and not isinstance(raw.get("headcount"), bool)
            else _tranche_or_label_employees(raw)
        ),
        sizeClass=raw.get("sizeClass"),
        establishmentCount=raw.get("establishmentCount"),
        headcountTranche=raw.get("headcountTranche"),
        creationDate=raw.get("creationDate"),
        legalCategory=raw.get("legalCategory"),
        isActive=bool(raw.get("isActive", True)),
        siteEstablishments=raw.get("siteEstablishments") if isinstance(raw.get("siteEstablishments"), int) else None,
        source=str(raw.get("source") or "recherche-entreprises"),
    )


def _name_band(name_score: float) -> int:
    """Bande de confiance de nom, large de :data:`_NAME_TIE_DELTA`.

    Deux noms de la même bande sont « à force égale » — c'est exactement la
    notion que le module utilise déjà pour autoriser un départage par les faits
    registre. La bande est calculée en centièmes ENTIERS : ``0.8 / 0.1`` vaut
    ``8.000000000000002`` en flottant, et un seuil qui bascule sur la seizième
    décimale n'est pas un seuil.
    """
    return int(round(name_score * 100)) // int(round(_NAME_TIE_DELTA * 100))


#: #4409 — en dessous de ce seuil d'effectif CONNU, et sans parc d'établissements,
#: une entité n'est pas la tête opérationnelle d'un groupe (holding à 0 salarié,
#: établissement isolé). Au-dessus, ou si l'une des deux données manque, on ne
#: tranche pas : un effectif inconnu n'est jamais lu « 0 ».
_OPERATIONAL_HEADCOUNT = 10
_OPERATIONAL_ESTABLISHMENTS = 5


def _is_shell_like(candidate: Candidate) -> bool:
    employees = _employees(candidate.headcount, candidate.size_class)
    if employees is None or employees >= _OPERATIONAL_HEADCOUNT:
        return False
    return (candidate.establishment_count or 0) < _OPERATIONAL_ESTABLISHMENTS


#: #4409 — activités qui ne sont PAS celle d'un prospect opérationnel : immobilier (68.xx) et
#: activités de holding (64.20Z). Un fait registre (code NAF) ou la forme juridique tapée dans le
#: nom (SCI) — jamais une devinette sur le nom commercial.
_FOREIGN_NAF_PREFIXES = ("68", "6420")


def _is_foreign_activity(candidate: Candidate, row_names: tuple[object, ...]) -> bool:
    naf = (candidate.naf_code or "").replace(".", "").replace(" ", "").upper()
    if naf.startswith(_FOREIGN_NAF_PREFIXES):
        return True
    return any("sci" in normalize_name(n).split() for n in row_names)


def _is_operational(candidate: Candidate) -> bool:
    employees = _employees(candidate.headcount, candidate.size_class)
    return (employees is not None and employees >= _OPERATIONAL_HEADCOUNT) or (
        (candidate.establishment_count or 0) >= _OPERATIONAL_ESTABLISHMENTS
    )


def _rank_tier(candidate: Candidate, row_names: tuple[object, ...]) -> int:
    """#4409 — 3 entité opérationnelle · 2 petit établissement · 1 effectif non renseigné (jamais
    lu « 0 ») · 0 homonyme d'activité étrangère non opérationnel. Le portefeuille n'y entre pas."""
    if _is_operational(candidate):
        return 3
    if _is_foreign_activity(candidate, row_names):
        return 0
    if _employees(candidate.headcount, candidate.size_class) is None:
        return 1
    return 2


def is_shell_like_row(row: dict) -> bool:
    """#4409.2 — la ligne registre est-elle une holding / un établissement isolé ?"""
    return _is_shell_like(candidate_from_registry_row(row))


#: Mots qui ne DÉSIGNENT personne une fois seuls (« Groupe Renault » ≠ « Groupe »).
GENERIC_ALONE = frozenset(
    {
        "groupe", "group", "societe", "compagnie", "cie", "holding", "france",
        "international", "sa", "sas", "sarl", "sasu", "eurl", "snc", "gie",
        "etablissements", "ets", "agence", "cabinet", "les", "la", "le", "de", "du", "des",
    }
)

#: #4409.1 — nom court (sigle, marque) CONTENU dans une saisie plus longue : un bon
#: nom, au même titre qu'un préfixe. Sous la bande exacte (1,0), au-dessus du plancher.
_BRAND_IN_QUERY_SCORE = 0.95


_TRAILING_SIGLE_RE = re.compile(r"\(([A-Za-z0-9]{2,6})\)\s*$")


def trailing_sigle(name: object) -> str | None:
    """Sigle publié entre parenthèses en fin de nom (« … FUNERAIRE (OGF) » → « OGF »)."""
    match = _TRAILING_SIGLE_RE.search(str(name or "").strip())
    return match.group(1) if match else None


def _brand_in_query_score(query: str, *names: object) -> float:
    """« OGF » est contenu dans « OGF service funéraire » : la saisie nomme la marque
    PLUS un descriptif. Tous les mots du nom doivent figurer dans la saisie, et au
    moins un doit désigner quelqu'un (jamais « groupe » seul)."""
    typed = set(_norm_company(query).split())
    best = 0.0
    for raw in names:
        # #4409.1 — le sigle publié « (OGF) » est un nom de marque : s'il est TAPÉ,
        # c'est le lien de nom que l'utilisateur a donné (la holding le porte).
        sigle = trailing_sigle(raw)
        if sigle and len(typed) > 1 and _norm_company(sigle) in typed and _norm_company(sigle) not in GENERIC_ALONE:
            best = _BRAND_IN_QUERY_SCORE
        tokens = _norm_company(raw).split()
        if not tokens or len(tokens) >= len(typed):
            continue
        if all(t in typed for t in tokens) and any(t not in GENERIC_ALONE and len(t) >= 3 for t in tokens):
            best = _BRAND_IN_QUERY_SCORE
    return best


def order_prospect_suggestions(query: str, rows: list[dict]) -> list[dict]:
    """Réordonne des suggestions registre pour la recherche d'un PROSPECT.

    ─────────────────────────────────────────────────────────────────────────
    POURQUOI CE CLASSEMENT EXISTE
    ─────────────────────────────────────────────────────────────────────────
    ``recherche-entreprises`` est une recherche PLEIN TEXTE dont le tri par
    défaut ignore la taille. Mesuré le 30/08/2026 : ``q=ROCHE`` rend 10 000
    résultats dont les 25 premiers sont des SCI et de l'immobilier — le
    laboratoire Roche (552012031, ETI, 500 à 999 salariés) n'y est pas. La liste
    déroulante affichait ce top-N brut, et choisir une suggestion ÉPINGLE son
    SIREN : le mauvais homonyme partait en analyse à huit crédits.

    Le barème n'est pas neuf — c'est CELUI DE CE MODULE, « quel THALES est mon
    prospect ? », où la taille prime. Il tournait déjà sur le chemin d'analyse
    (``research/homonym.py``) et personne ne l'appelait depuis le sélecteur.

    ─────────────────────────────────────────────────────────────────────────
    LES DEUX BORNES QUI RENDENT LA RÈGLE TENABLE
    ─────────────────────────────────────────────────────────────────────────
    1. **Le nom passe avant les faits.** Le tri est d'abord par BANDE de nom
       (:func:`_name_band`) : les faits registre ne départagent qu'à force de nom
       comparable. Sans cette borne, un mastodonte homonyme au nom lointain
       passerait devant la société exactement nommée — chercher une PME
       reviendrait à se voir proposer son plus gros voisin.
    2. **On ne supprime JAMAIS une ligne.** C'est la différence assumée avec
       ``/discover``, où une homonymie non tranchée est ÉCARTÉE (« aucun SIREN
       inventé ») parce qu'on y explore un volume. Ici l'utilisateur cherche une
       société précise : l'écarter serait décider à sa place. Le point commun des
       deux chemins n'est pas « écarter », c'est ne jamais trancher à la place de
       l'utilisateur et ne jamais inventer.

    Le score ne SORT PAS d'ici : c'est une clé de tri, jamais une valeur affichée.
    Le dépôt n'expose aucune probabilité — pas de « 87 % de confiance » sous une
    ligne de liste (arbitrage refusé six fois). Ce qui aide à choisir est rendu à
    côté, et ce sont des FAITS publiés : effectif, catégorie, activité, SIREN.

    Le tri est STABLE : deux lignes que rien ne sépare gardent l'ordre du
    registre, donc l'ordonnancement est reproductible d'un appel à l'autre.
    """
    cleaned = (query or "").strip()
    if not cleaned or not rows:
        return list(rows or [])

    facts: list[tuple[float, bool, float, int]] = []
    for row in rows:
        name_s = max(
            autocomplete_name_score(cleaned, row.get("name"), row.get("legalName")),
            _brand_in_query_score(cleaned, row.get("name"), row.get("legalName")),
        )
        candidate = candidate_from_registry_row(row)
        scored = score_candidate(cleaned, candidate, name_score=name_s)
        tier = _rank_tier(candidate, (row.get("name"), row.get("legalName")))
        facts.append((name_s, _is_shell_like(candidate), scored.score, tier))

    # #4409.2 — une holding à 0 salarié porte souvent le nom EXACT tapé (bande 10) :
    # la bande de nom l'aurait gardée en tête. Elle ne passe plus devant une entité
    # opérationnelle dont le nom est lui aussi FORT (>= HIGH_NAME) : sa bande est
    # ramenée à celle de la meilleure. Une rétrogradation de rang, jamais un filtre,
    # et seule dans la liste elle reste première.
    strong_bands = [_name_band(n) for n, shell, _, _t in facts if not shell and n >= HIGH_NAME]
    cap = max(strong_bands) if strong_bands else None

    def sort_key(i: int) -> tuple[int, int, float]:
        name_s, shell, score, tier = facts[i]
        band = _name_band(name_s)
        if shell and cap is not None:
            band = min(band, cap)
        return (band, tier, score)

    order = sorted(range(len(rows)), key=sort_key, reverse=True)
    return [rows[i] for i in order]


def score_candidate(query: str, candidate: Candidate, *, name_score: float | None = None) -> ScoredCandidate:
    """Score one candidate 0..1 on the registry facts (deterministic).

    ``name_score`` remplace l'axe du NOM, et lui seul — tout le reste du barème
    est inchangé. Un seul appelant s'en sert : :func:`order_prospect_suggestions`,
    qui note une saisie EN COURS et a donc besoin de la variante tolérante au
    préfixe. Écrire un second barème pour ce seul écart aurait produit deux
    dérivations d'une même règle, qui divergent à la première retouche. Absent
    (le cas de tous les autres appelants) ⇒ comportement byte-identique.
    """
    # Trade name OR raison sociale — whichever matches the query best. Both are
    # the SAME registry entity, so taking the max is not a guess.
    name_s = (
        name_score
        if name_score is not None
        else max(
            name_similarity(query, candidate.name),
            name_similarity(query, candidate.legal_name) if candidate.legal_name else 0.0,
        )
    )
    employees = _employees(candidate.headcount, candidate.size_class)
    size_s, size_known = _size_score(employees)
    active_s = 1.0 if candidate.is_active else 0.0
    # NAF-IT is a REGISTRY fact (code div. 62 / 63.11, or an unambiguous IT label),
    # never a guess on the trade name — it stays factual and only breaks ties.
    naf_is_it = is_it_naf(candidate.naf_code) or bool(candidate.naf_label and is_it_entity(candidate.naf_label))
    it_s = 1.0 if naf_is_it else 0.0
    establishments = candidate.establishment_count or 0
    group_s = 1.0 if establishments >= 5 else (0.5 if establishments >= 2 else 0.0)

    confidence = (
        _W_NAME * name_s
        + _W_SIZE * size_s
        + _W_ACTIVE * active_s
        + _W_IT * it_s
        + _W_GROUP * group_s
    )
    confidence = max(0.0, min(1.0, confidence))

    reasons = [f"nom {_pct(name_s)}% ({'exact' if name_s >= 0.999 else 'partiel'})"]
    if not candidate.is_active:
        reasons.append("entité cessée")
    if naf_is_it:
        reasons.append("NAF IT (div. 62 / 63.11)")
    if size_known and employees is not None:
        reasons.append(f"taille ~{employees}+ salariés")
    elif candidate.size_class:
        reasons.append(f"catégorie {candidate.size_class}")
    else:
        reasons.append("taille inconnue")
    if establishments >= 2:
        reasons.append(f"{establishments} établissements")

    return ScoredCandidate(
        siren=candidate.siren,
        name=candidate.name,
        nafCode=candidate.naf_code,
        nafLabel=candidate.naf_label,
        nafIsIt=naf_is_it,
        city=candidate.city,
        department=candidate.department,
        headcount=employees,
        sizeClass=candidate.size_class,
        establishmentCount=candidate.establishment_count,
        headcountTranche=candidate.headcount_tranche,
        creationDate=candidate.creation_date,
        legalCategory=candidate.legal_category,
        isActive=candidate.is_active,
        nameScore=round(name_s, 3),
        score=round(confidence, 3),
        reasons=reasons,
        siteEstablishments=candidate.site_establishments,
        source=candidate.source,
    )


def _footprint_dominates(top: ScoredCandidate, rival: ScoredCandidate) -> bool:
    """Does ``top`` crush ``rival`` on KNOWN registry footprint?

    True only when the top's headcount is known AND either the rival's is unknown
    or an order of magnitude smaller, AND the top runs several times more
    établissements. This is the "un groupe n'est pas une coquille" separator: EDF
    (10 000 salariés, 9 157 établissements) vs a same-named 1-établissement entity
    of unknown size. Two comparable big namesakes (Carrefour Hypermarchés vs
    Carrefour Stations Service) never qualify — they stay ambiguous.
    """
    if top.headcount is None:
        return False  # nothing KNOWN to dominate with — never manufacture a winner
    if rival.headcount is not None and top.headcount < _FACT_HEADCOUNT_RATIO * rival.headcount:
        return False
    return (top.establishment_count or 0) >= _FACT_ESTABLISHMENT_RATIO * max(rival.establishment_count or 0, 1)


def _dedup_by_siren(scored: list[ScoredCandidate]) -> list[ScoredCandidate]:
    """Keep the best-scored entry per SIREN (a name can surface the same entity
    from several sources); entries without a SIREN are dropped (can't select)."""
    best: dict[str, ScoredCandidate] = {}
    for s in scored:
        key = "".join(ch for ch in str(s.siren or "") if ch.isdigit())
        if not key:
            continue
        if key not in best or s.score > best[key].score:
            best[key] = s
    return list(best.values())


def disambiguate(
    query: str,
    candidates: list[Candidate],
    *,
    siren_lock: str | None = None,
) -> HomonymResolution:
    """Resolve ``query`` to a single SIREN, or expose the ambiguity.

    ``siren_lock`` short-circuits everything (the commercial already chose the
    perimeter). Otherwise the candidates are scored, the field is filtered to the
    plausible ones (name ≥ floor, active), and a winner is picked only when it
    clearly dominates — else the scored list is returned as ``ambiguous``.
    """
    lock = "".join(ch for ch in str(siren_lock or "") if ch.isdigit())
    if lock:
        matched = next(
            (score_candidate(query, c) for c in candidates
             if "".join(ch for ch in str(c.siren or "") if ch.isdigit()) == lock),
            None,
        )
        return HomonymResolution(
            status="locked",
            selectedSiren=lock,
            confidence=1.0,
            candidateCount=1 if matched else 0,
            candidates=[matched] if matched else [],
            message=f"SIREN {lock} fourni (périmètre verrouillé) — désambiguïsation court-circuitée.",
            reasons=["Scope lock : choix explicite de l'utilisateur respecté."],
        )

    scored = _dedup_by_siren([score_candidate(query, c) for c in (candidates or [])])
    scored.sort(key=lambda s: (s.score, s.name_score, s.headcount or 0), reverse=True)
    viable = [s for s in scored if s.is_active and s.name_score >= NAME_FLOOR]

    if not viable:
        return HomonymResolution(
            status="none",
            selectedSiren=None,
            confidence=0.0,
            candidateCount=len(scored),
            candidates=scored,
            message=f"Aucun candidat fiable pour « {query} » (aucun SIREN retenu — pas d'invention).",
            reasons=["Aucune entité active suffisamment proche du nom saisi."],
        )

    if len(viable) == 1:
        winner = viable[0]
        return HomonymResolution(
            status="unique",
            selectedSiren=winner.siren,
            confidence=winner.score,
            candidateCount=len(scored),
            candidates=scored,
            message=(
                f"Un seul candidat plausible : SIREN {winner.siren} "
                f"({winner.name}) — confiance {_pct(winner.score)}%."
            ),
            reasons=winner.reasons,
        )

    top, runner_up = viable[0], viable[1]
    margin = top.score - runner_up.score
    name_tie = abs(top.name_score - runner_up.name_score) < _NAME_TIE_DELTA
    # NAF-IT tiebreak (Théo : entité IT/digitale = cible n°1 d'une ESN) : à noms
    # ~équivalents, un candidat IT (NAF 62/63.11) l'emporte sur un non-IT — sans
    # jamais primer sur un bien meilleur match de nom (garde ``name_tie``).
    it_tiebreak = name_tie and top.naf_is_it and not runner_up.naf_is_it
    # Le nom a-t-il DÉJÀ tranché ? On compare au meilleur nom du reste du peloton
    # (pas au seul 2ᵉ au score composite) : si un autre candidat porte un nom
    # aussi bon, le nom n'a rien tranché du tout.
    best_other_name = max(s.name_score for s in viable[1:])
    name_margin = top.name_score - best_other_name
    name_dominant = name_margin >= NAME_DOMINANCE_MARGIN
    # À force de nom équivalente, les FAITS registre peuvent trancher — mais
    # jamais contre un candidat qui matche NETTEMENT mieux sur le nom.
    facts_dominant = name_margin > -_NAME_TIE_DELTA and _footprint_dominates(top, runner_up)
    dominant = top.name_score >= HIGH_NAME and (
        margin >= DOMINANCE_MARGIN or it_tiebreak or name_dominant or facts_dominant
    )

    if dominant:
        if margin >= DOMINANCE_MARGIN:
            why = "écart de score décisif"
        elif name_dominant:
            why = "match de nom nettement supérieur aux autres candidats"
        elif it_tiebreak:
            why = "NAF IT prioritaire à nom égal"
        else:
            why = "faits registre décisifs à nom égal (taille + établissements)"
        return HomonymResolution(
            status="selected",
            selectedSiren=top.siren,
            confidence=top.score,
            candidateCount=len(scored),
            candidates=scored,
            message=(
                f"SIREN {top.siren} ({top.name}) retenu parmi {len(viable)} homonymes "
                f"(confiance {_pct(top.score)}%, {why} vs 2ᵉ à {_pct(runner_up.score)}%)."
            ),
            reasons=[*top.reasons, f"domine : {why}"],
        )

    return HomonymResolution(
        status="ambiguous",
        selectedSiren=None,
        confidence=top.score,
        candidateCount=len(scored),
        candidates=scored,
        message=(
            f"{len(viable)} homonymes proches pour « {query} » — aucun ne se détache "
            f"(meilleur : {top.name}, confiance {_pct(top.score)}%). "
            "Choix à confirmer (fournir un SIREN) avant de partir sur une entité."
        ),
        reasons=["Plusieurs entités actives au nom quasi identique — ambiguïté exposée, pas de choix au hasard."],
    )
