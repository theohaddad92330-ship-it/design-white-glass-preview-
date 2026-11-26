"""Classement des entités registre candidates pour « quelle est VOTRE ESN ? ».

Le problème concret : ``recherche-entreprises.api.gouv.fr`` est une recherche
PLEIN TEXTE. Son top-1 est régulièrement une entité parasite — cas mesurés en
vrai : « Carrefour » → une SCI du Cannet, « Michelin » → une société
immobilière, « Alan » → un garage à Mougins. Prendre ce top-1 en silence, c'est
partir sur le mauvais SIREN — et comme le profil ESN alimente ensuite TOUS les
prompts d'analyse, l'erreur est systémique et invisible.

Ce module ne choisit pas à la place de l'utilisateur : il **classe** les
candidats que le registre renvoie et dit si l'un d'eux se détache assez pour
être proposé seul. Aucun LLM — le classement doit être prévisible, reproductible
et justifiable ligne à ligne.

Différence assumée avec :mod:`app.services.homonym_disambiguation` (« quel
THALES est mon prospect ? ») : là-bas la TAILLE prime, parce qu'on cherche le
vrai groupe parmi ses homonymes. Ici on cherche **une ESN**, donc c'est la
COHÉRENCE NAF qui prime : une SCI ou un garage n'a rien à faire dans la liste,
quelle que soit sa taille. Les deux barèmes partagent la mesure de similarité de
nom (``homonym_disambiguation.name_similarity``) et rien d'autre.

Règle projet non négociable : **jamais de donnée fictive**. Un fait que le
registre ne donne pas reste ``None`` ; on ne fabrique jamais un candidat pour
étoffer la liste.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.services.company_filters import headcount_label
from app.services.homonym_disambiguation import name_similarity, normalize_company_name

# ─────────────────────────────────────────────────────────────────────────────
# Nomenclature NAF vue à travers la lentille « est-ce une ESN ? »
# ─────────────────────────────────────────────────────────────────────────────

# Cœur informatique : 62.0x programmation / conseil / infogérance, 63.1x
# traitement de données & portails, 58.2x édition de logiciels. Une entité sous
# l'un de ces codes EST une entité IT au sens du registre — c'est un fait, pas
# une interprétation.
_CORE_IT_PREFIXES = frozenset({"620", "631", "582"})

# Codes « plausibles » : beaucoup d'ESN sont immatriculées en conseil de gestion
# (70.22Z) ou en ingénierie (71.12B) plutôt qu'en 62.0x. Ce n'est PAS une preuve
# — d'innombrables cabinets non-IT y sont aussi — donc score intermédiaire, et
# jamais d'auto-sélection sur cette seule base.
_ADJACENT_PREFIXES = frozenset({"7022", "7112"})

# Divisions NAF sous lesquelles aucune ESN n'exerce. C'est ici que se joue le
# cas Carrefour/Michelin (68 = immobilier, la SCI) et le cas Alan (45 = garage).
# Liste VOLONTAIREMENT courte et explicite : on préfère rater une pénalité que
# disqualifier à tort une entité légitime.
_INCOMPATIBLE_DIVISIONS = frozenset(
    {
        "01", "02", "03",  # agriculture, sylviculture, pêche
        "10", "11",        # industries alimentaires, boissons
        "41", "42", "43",  # construction, génie civil, travaux spécialisés
        "45", "47",        # commerce/réparation automobile, commerce de détail
        "55", "56",        # hébergement, restauration
        "86", "87", "88",  # santé humaine, hébergement médico-social, action sociale
        "93",             # sport, loisirs
        "96",             # autres services personnels (coiffure, blanchisserie…)
        "68",             # activités immobilières — la signature de la SCI homonyme
    }
)

# Libellés officiels des seuls codes IT. Décoder une nomenclature publique n'est
# pas inventer une donnée (même principe que les libellés de tranche INSEE) : le
# registre renvoie souvent le code SANS son libellé, et une ligne de liste sans
# secteur est beaucoup plus dure à départager.
IT_NAF_LABELS: dict[str, str] = {
    "5821Z": "Édition de jeux électroniques",
    "5829A": "Édition de logiciels système et de réseau",
    "5829B": "Édition de logiciels outils de développement et de langages",
    "5829C": "Édition de logiciels applicatifs",
    "6201Z": "Programmation informatique",
    "6202A": "Conseil en systèmes et logiciels informatiques",
    "6202B": "Tierce maintenance de systèmes et d'applications informatiques",
    "6203Z": "Gestion d'installations informatiques",
    "6209Z": "Autres activités informatiques",
    "6311Z": "Traitement de données, hébergement et activités connexes",
    "6312Z": "Portails Internet",
}

# ─────────────────────────────────────────────────────────────────────────────
# Barème — documenté ici pour qu'il reste discutable
# ─────────────────────────────────────────────────────────────────────────────
#
#   score = 0.50 × similarité du nom
#         + 0.30 × cohérence NAF
#         + 0.12 × plausibilité de la taille
#         + 0.08 × empreinte (nombre d'établissements)
#
# Somme des poids = 1.0, donc un candidat parfait vaut exactement 1.0.
#
# Pourquoi ces poids :
#
# * **Nom (0.50)** — c'est la seule chose que l'utilisateur a réellement dite.
#   Il domine, mais il ne peut PAS trancher seul : les homonymes portent, par
#   définition, le même nom.
# * **NAF (0.30)** — le seul signal qui distingue « une société qui s'appelle
#   Alan » d'« une ESN qui s'appelle Alan ». Assez lourd pour qu'à nom égal il
#   renverse le classement, jamais assez pour battre un nom nettement meilleur.
# * **Taille (0.12)** — 0 salarié est la signature d'une SCI / coquille : c'est
#   plausible pour une société, pas pour l'ESN où travaille le commercial.
# * **Établissements (0.08)** — départage faible, en dernier recours.
#
# Le statut administratif n'a PAS de poids : une entité cessée est écartée
# d'entrée (cf. ``rank_candidates``). Proposer une coquille radiée comme « votre
# entreprise » est pire que de ne rien proposer — c'est déjà la règle de
# l'autocomplétion.

_W_NAME = 0.50
_W_NAF = 0.30
_W_SIZE = 0.12
_W_FOOTPRINT = 0.08

# Cohérence NAF, de la preuve à la contradiction.
_NAF_FIT_CORE_IT = 1.00
_NAF_FIT_ADJACENT = 0.60
_NAF_FIT_UNKNOWN = 0.40  # neutre : un NAF absent ne prouve rien, dans aucun sens
_NAF_FIT_OTHER = 0.20
_NAF_FIT_INCOMPATIBLE = 0.00

# Plausibilité de la taille, à partir de la tranche d'effectif INSEE.
_SIZE_FIT_NO_EMPLOYEE = 0.15  # tranche "00" — coquille / SCI / holding dormante
_SIZE_FIT_VERY_SMALL = 0.65  # 1 à 9 salariés — une petite ESN, c'est courant
_SIZE_FIT_STAFFED = 1.00  # 10 salariés et plus
_SIZE_FIT_UNKNOWN = 0.45  # neutre — ne doit JAMAIS fabriquer un écart

_TRANCHES_NO_EMPLOYEE = frozenset({"00"})
_TRANCHES_VERY_SMALL = frozenset({"01", "02", "03"})

# En dessous de ce seuil, le nom du candidat ne ressemble pas à ce qui a été
# tapé : la recherche plein-texte l'a remonté sur son objet social, pas sur son
# nom. On ne le propose pas du tout. Même plancher que la désambiguïsation
# historique, pour que les deux chemins restent cohérents.
NAME_FLOOR = 0.55

# Nombre maximum de candidats exposés à l'utilisateur. Au-delà, une liste de
# désambiguïsation n'aide plus à décider, elle noie.
MAX_CANDIDATES = 5

# ── Règle d'auto-sélection ───────────────────────────────────────────────────
#
# On ne préremplit un profil complet SANS liste que dans deux situations :
#
#   1. il n'y a qu'un seul candidat plausible — il n'y a alors rien à
#      départager, et la carte de confirmation reste l'accord explicite de
#      l'utilisateur ;
#   2. le premier candidat écrase les autres ET son NAF prouve que c'est une
#      entité informatique : nom quasi exact, NAF cœur IT, et écart net avec le
#      second.
#
# L'asymétrie est voulue. Un clic de trop coûte deux secondes ; un mauvais
# préremplissage contamine silencieusement tous les prompts d'analyse en aval et
# ne se voit jamais. On exige donc une preuve POSITIVE (le NAF IT) et pas
# seulement l'absence de contradiction.

AUTO_SELECT_NAME_FLOOR = 0.90
AUTO_SELECT_MARGIN = 0.15


class EsnCandidate(BaseModel):
    """Un candidat registre scoré, avec les faits qui permettent de le
    reconnaître. Tout champ que le registre n'a pas donné reste ``None`` — la
    forme est stable, le contenu jamais inventé."""

    siren: str
    name: str
    city: str | None = None
    department: str | None = None
    naf_code: str | None = None
    naf_label: str | None = None
    #: ``True`` NAF cœur informatique, ``False`` NAF incohérent avec une ESN,
    #: ``None`` quand le registre ne donne pas de code — « on ne sait pas » ne
    #: doit pas déclencher une alerte infondée côté UI.
    is_esn_naf: bool | None = None
    headcount_label: str | None = None
    establishment_count: int | None = None
    creation_date: str | None = None
    is_active: bool = True
    name_score: float = 0.0
    score: float = 0.0

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


def _naf_digits(naf_code: object) -> str:
    """Chiffres d'un code NAF, quelle que soit l'écriture registre (``62.02A``
    comme ``6202A``)."""
    return "".join(ch for ch in str(naf_code or "") if ch.isdigit())


def esn_naf_fit(naf_code: object) -> float:
    """Cohérence 0..1 entre un code NAF et l'activité d'une ESN.

    Un code absent rend une valeur NEUTRE (ni preuve, ni contradiction) : le
    registre est parfois muet, ce n'est pas la faute du candidat.
    """
    digits = _naf_digits(naf_code)
    if len(digits) < 3:
        return _NAF_FIT_UNKNOWN
    if digits[:3] in _CORE_IT_PREFIXES:
        return _NAF_FIT_CORE_IT
    if digits[:4] in _ADJACENT_PREFIXES:
        return _NAF_FIT_ADJACENT
    if digits[:2] in _INCOMPATIBLE_DIVISIONS:
        return _NAF_FIT_INCOMPATIBLE
    return _NAF_FIT_OTHER


def is_esn_naf(naf_code: object) -> bool | None:
    """``True`` si le code NAF prouve une activité informatique (62.0x / 63.1x /
    58.2x), ``False`` s'il désigne autre chose, ``None`` quand il est absent.

    Le tri-état est délibéré : c'est ce qui permet à l'UI d'alerter (« cette
    entreprise ne semble pas être une ESN ») uniquement quand le registre le
    CONTREDIT, et de se taire quand il ne dit rien.
    """
    digits = _naf_digits(naf_code)
    if len(digits) < 3:
        return None
    return digits[:3] in _CORE_IT_PREFIXES


def naf_label_for_code(naf_code: object) -> str | None:
    """Libellé officiel d'un code NAF informatique, ou ``None`` hors périmètre."""
    key = "".join(ch for ch in str(naf_code or "") if ch.isalnum()).upper()
    return IT_NAF_LABELS.get(key)


# Libellé de DIVISION NAF (2 chiffres) — un cran plus grossier que
# ``IT_NAF_LABELS``, mais suffisant pour qu'une ligne de liste déroulante porte
# un secteur lisible. Sans lui, « SCI CARREFOUR DU CANNET · Le Cannet » n'affiche
# aucun signal permettant d'écarter la SCI d'un coup d'œil : le registre libre ne
# renvoie que rarement ``libelle_activite_principale``.
#
# Périmètre volontairement restreint aux divisions qui comptent ICI : celles
# qu'une ESN n'exerce pas (le signal à donner au commercial) et les voisines
# du conseil/informatique. Décoder la nomenclature publique n'est pas inventer.
_NAF_DIVISION_LABELS: dict[str, str] = {
    "01": "Agriculture", "02": "Sylviculture", "03": "Pêche et aquaculture",
    "10": "Industries alimentaires", "11": "Fabrication de boissons",
    "41": "Construction", "42": "Génie civil", "43": "Travaux de construction spécialisés",
    "45": "Commerce et réparation automobile",
    "47": "Commerce de détail",
    "55": "Hébergement", "56": "Hébergement et restauration",
    "58": "Édition",
    "62": "Programmation, conseil et autres activités informatiques",
    "63": "Services d'information",
    "64": "Activités financières", "65": "Assurance", "66": "Auxiliaires financiers et d'assurance",
    "68": "Activités immobilières",
    "70": "Conseil de gestion",
    "71": "Architecture et ingénierie",
    "86": "Activités pour la santé humaine", "87": "Hébergement médico-social", "88": "Action sociale",
    "93": "Sport et loisirs",
    "96": "Autres services personnels",
}


def naf_family_label(naf_code: object) -> str | None:
    """Libellé de la DIVISION NAF (« 68.20A » → « Activités immobilières »).

    Filet de dernier recours pour l'affichage : moins précis que
    :func:`naf_label_for_code`, mais il couvre les activités NON informatiques,
    précisément celles que l'utilisateur doit pouvoir écarter à l'œil.
    ``None`` pour une division hors table — jamais un libellé fabriqué.
    """
    digits = _naf_digits(naf_code)
    if len(digits) < 2:
        return None
    return _NAF_DIVISION_LABELS.get(digits[:2])


def _size_fit(tranche: object) -> float:
    code = str(tranche or "").strip().upper()
    if code in _TRANCHES_NO_EMPLOYEE:
        return _SIZE_FIT_NO_EMPLOYEE
    if code in _TRANCHES_VERY_SMALL:
        return _SIZE_FIT_VERY_SMALL
    if headcount_label(code) is not None:
        return _SIZE_FIT_STAFFED
    return _SIZE_FIT_UNKNOWN


def _footprint_fit(establishment_count: object) -> float:
    if not isinstance(establishment_count, int) or isinstance(establishment_count, bool):
        return 0.5
    if establishment_count >= 3:
        return 1.0
    if establishment_count == 2:
        return 0.7
    return 0.5


def _best_name_score(query: str, row: dict) -> float:
    """Meilleure similarité entre la saisie et l'un des deux noms du registre.

    Le registre expose ``nom_complet`` (souvent la marque, éventuellement suffixée)
    ET ``nom_raison_sociale``. Le cas le plus courant est justement celui où les
    deux diffèrent (« Kicklox » est la marque, LINNAEUS la raison sociale) : ne
    comparer qu'à l'un des deux ferait sortir la bonne entité du classement.
    """
    names = [row.get("name"), row.get("legalName")]
    return max((name_similarity(query, n) for n in names if str(n or "").strip()), default=0.0)


def score_candidate(query: str, row: dict) -> EsnCandidate | None:
    """Score une ligne registre. ``None`` quand elle ne peut pas être un candidat
    (pas de SIREN = non sélectionnable, donc rien à proposer)."""
    siren = "".join(ch for ch in str((row or {}).get("siren") or "") if ch.isdigit())
    if not siren:
        return None

    name_score = _best_name_score(query, row)
    naf_code = row.get("nafCode") or None
    fit = esn_naf_fit(naf_code)
    tranche = row.get("headcountTranche")
    establishments = row.get("establishmentCount")

    score = (
        _W_NAME * name_score
        + _W_NAF * fit
        + _W_SIZE * _size_fit(tranche)
        + _W_FOOTPRINT * _footprint_fit(establishments)
    )

    return EsnCandidate(
        siren=siren,
        name=str(row.get("name") or row.get("legalName") or "").strip(),
        city=row.get("city") or None,
        department=row.get("department") or None,
        naf_code=naf_code,
        naf_label=(row.get("nafLabel") or naf_label_for_code(naf_code)) or None,
        is_esn_naf=is_esn_naf(naf_code),
        headcount_label=headcount_label(str(tranche).strip() if tranche else None),
        establishment_count=establishments if isinstance(establishments, int) else None,
        creation_date=row.get("creationDate") or None,
        is_active=bool(row.get("isActive", True)),
        name_score=round(name_score, 4),
        score=round(max(0.0, min(1.0, score)), 4),
    )


def _dedup_by_siren(candidates: list[EsnCandidate]) -> list[EsnCandidate]:
    """Un même SIREN ne doit apparaître qu'une fois — le meilleur score gagne."""
    best: dict[str, EsnCandidate] = {}
    for candidate in candidates:
        current = best.get(candidate.siren)
        if current is None or candidate.score > current.score:
            best[candidate.siren] = candidate
    return list(best.values())


def rank_candidates(query: str, rows: list[dict], *, limit: int = MAX_CANDIDATES) -> list[EsnCandidate]:
    """Classe les lignes registre, de la plus au moins plausible.

    Sont écartées d'office : les lignes sans SIREN (non sélectionnables), les
    entités administrativement cessées, et celles dont le nom ne ressemble pas à
    la saisie (remontées par la recherche plein-texte sur leur objet social).
    """
    cleaned = (query or "").strip()
    if not cleaned or not rows:
        return []

    scored = [c for c in (score_candidate(cleaned, row) for row in rows) if c is not None]
    viable = [c for c in _dedup_by_siren(scored) if c.is_active and c.name_score >= NAME_FLOOR]
    viable.sort(key=lambda c: (c.score, c.name_score, c.siren), reverse=True)
    return viable[: max(1, limit)]


# ─────────────────────────────────────────────────────────────────────────────
# Ordonnancement de l'autocomplétion
# ─────────────────────────────────────────────────────────────────────────────
#
# Le même mal frappe la liste déroulante : elle affiche le top-N brut du registre
# libre, où la SCI homonyme a exactement la même apparence de légitimité qu'un
# vrai résultat. Pire, choisir une suggestion ÉPINGLE son SIREN — ce qui
# court-circuite par construction la désambiguïsation ci-dessus.
#
# Deux différences assumées avec ``rank_candidates`` :
#
# 1. **On ne supprime jamais une ligne.** Une ESN peut avoir un NAF atypique
#    (holding en 70.10Z, ingénierie en 71.12B) ; masquer un résultat correct est
#    pire que de le classer bas. On réordonne, l'utilisateur garde le dernier mot.
# 2. **La saisie est un PRÉFIXE.** L'utilisateur tape encore : « Ki » est un
#    excellent indice pour KICKLOX alors que sa distance d'édition est mauvaise.
#    Un plancher de similarité viderait la liste au 2ᵉ caractère.


def _autocomplete_name_score(query: str, row: dict) -> float:
    """Similarité de nom tolérante au préfixe, sur le nom complet ET la raison
    sociale. Retombe sur la similarité globale quand rien ne préfixe."""
    typed = normalize_company_name(query)
    if not typed:
        return 0.0

    best = 0.0
    for raw in (row.get("name"), row.get("legalName")):
        candidate = normalize_company_name(raw)
        if not candidate:
            continue
        if candidate == typed:
            score = 1.0
        elif candidate.startswith(typed):
            score = 0.9
        elif any(token.startswith(typed) for token in candidate.split()):
            score = 0.8
        else:
            score = name_similarity(typed, candidate)
        best = max(best, score)
    return best


def esn_suggestion_score(query: str, row: dict) -> float:
    """Score de tri d'une suggestion d'autocomplétion, avec le MÊME barème que
    :func:`score_candidate` (nom / NAF / taille / empreinte)."""
    return (
        _W_NAME * _autocomplete_name_score(query, row)
        + _W_NAF * esn_naf_fit(row.get("nafCode"))
        + _W_SIZE * _size_fit(row.get("headcountTranche"))
        + _W_FOOTPRINT * _footprint_fit(row.get("establishmentCount"))
    )


def order_esn_suggestions(query: str, rows: list[dict]) -> list[dict]:
    """Réordonne des suggestions registre selon leur plausibilité d'ESN.

    Ne supprime rien, ne réécrit rien : les lignes rendues sont exactement les
    objets reçus. Le tri est STABLE, donc deux lignes que rien ne sépare gardent
    l'ordre du registre — l'ordonnancement est reproductible d'un appel à l'autre.
    """
    cleaned = (query or "").strip()
    if not cleaned or not rows:
        return list(rows or [])
    return sorted(rows, key=lambda row: esn_suggestion_score(cleaned, row), reverse=True)


def should_auto_select(ranked: list[EsnCandidate]) -> bool:
    """Le premier candidat peut-il être proposé SANS liste de désambiguïsation ?

    Voir le commentaire « Règle d'auto-sélection » plus haut : un seul candidat,
    ou bien un candidat qui domine ET dont le NAF prouve l'activité informatique.
    """
    if not ranked:
        return False
    if len(ranked) == 1:
        return True

    top, runner_up = ranked[0], ranked[1]
    return (
        top.is_esn_naf is True
        and top.name_score >= AUTO_SELECT_NAME_FLOOR
        and (top.score - runner_up.score) >= AUTO_SELECT_MARGIN
    )
