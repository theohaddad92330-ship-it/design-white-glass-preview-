"""Score déterministe et explicable d'un candidat Découvrir (0-100).

Contrat : ``agent_docs/discover-v2-contract.md``.

    « Le registre produit la liste. Le LLM ne produit que l'angle commercial. »

La v1 laissait Claude inventer un ``priorityScore`` /10 rendu dans un badge
d'apparence précise : ni échelle, ni rubrique, ni preuve. Ce module le remplace
par un calcul **pur** — aucun réseau, aucun LLM, aucun aléa — où **chaque point
est rattaché à un facteur nommé portant sa donnée brute** (``evidence``).

Il ne duplique pas la logique existante, il en reprend la philosophie :

- :mod:`apps/api/src/modules/accounts/similar-scoring.ts` — le trio
  **secteur > géographie = taille** pesé contre le profil vendeur, la règle
  « une donnée absente d'un côté OU de l'autre vaut exactement 0 » (jamais de
  malus, jamais de point deviné) et la table région↔départements, portée ici à
  l'identique.
- :mod:`app.services.score_axes` — deux axes **distincts** : le score
  commercial d'un côté, la **confiance donnée** de l'autre (:func:`data_confidence`),
  qui se dégrade sur données registre incomplètes, signaux archivés
  (horizon ~24 mois, comme ``confidence.compute_confidence``) et sources en
  panne (``degraded[]``).

Troisième axe, aussi important que les deux premiers : la **mesurabilité**. Un
critère qu'on n'a pas pu évaluer (pas de donnée côté candidat, ou pas de critère
côté requête/profil) ne vaut PAS « 0 sur 30 » — ce sont deux affirmations
différentes, et les confondre est ce qui faisait afficher « 0/100 » à tout un
écran. :func:`score_candidate` rend donc ``unmeasured`` (les blocs sans mesure)
et ``scoreMax`` (le dénominateur RÉEL, plafonds des seuls blocs mesurables) ;
quand plus rien n'est mesurable, ``score`` vaut ``None`` — « indisponible »,
jamais un chiffre qui a l'air mesuré.

Barème (somme des plafonds = 100). Cette table est la SEULE description du
barème dans ce module, et elle est verrouillée par un test : un docstring qui
décrit un barème périmé coûte plus cher qu'un docstring absent, parce que c'est
lui qu'on lit avant de toucher au calcul.

===========================  =======  ==================================
Bloc                          Max      Le plus fort au plus faible
===========================  =======  ==================================
Activité (NAF / secteur)       10      NAF exact > même division
                                       > mot-clé secteur du profil
Géographie                      7      département demandé > zone du profil
Effectif                        5      tranche demandée > type cible
Ancienneté                      3      fenêtre demandée / établie
Surface informatique           20      taille + signaux techniques
Signaux (« pourquoi            20      pondérés par type ET fraîcheur
maintenant »)
Accessibilité                  20      barrière d'achat, proportion, chemin,
                                       relation, coût d'accès
Qualité des preuves            15      confiance dans la donnée sous-jacente
===========================  =======  ==================================

Chaque facteur porte la CLÉ de son bloc (``block``), pour que l'écran cesse de
la deviner depuis le libellé — c'est ce que faisait le web, et trois blocs sur
huit tombaient dans « divers ».
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Any

from app.services.access_scoring import barrier_for_company
from app.services.domain_focus import is_industrial_seller
from app.services.esn_sales_profile import PROFILE_DEFAULT_SORT, classify_esn_sales_profile

# ── Barème — toute la surface de réglage, en un seul endroit ────────────────

#: Score maximal atteignable. Le badge UI est sur CETTE échelle.
DISCOVER_SCORE_MAX = 100

# ── Barème de l'addendum final (p41) ────────────────────────────────────────
#
# Le barème précédent (activité 30 / géo 20 / effectif 20 / signaux 25 /
# ancienneté 5) mesurait bien, mais il mesurait UNE SEULE chose : la ressemblance
# du candidat au profil demandé. Trois questions commerciales n'y avaient aucune
# place — le compte a-t-il une surface informatique à confier, quelle est la
# qualité des preuves derrière le chiffre, et sait-on seulement l'atteindre ?
#
# Cinq blocs les portent désormais. Deux règles de conception les accompagnent :
#
#   - « validité de l'entité » n'est PAS un bloc de points mais un GATE, tenu en
#     amont par `account_qualification`. Une personne physique ne doit pas
#     obtenir « 40/100 », elle doit sortir de la liste ;
#   - « accessibilité » n'est PAS mesurable au stade registre : on ne connaît
#     aucun contact à ce moment-là. Le bloc existe, il est déclaré NON MESURÉ, et
#     son plafond quitte le dénominateur — jamais un zéro qui aurait l'air mesuré.
#     Il se remplira quand une analyse aura trouvé des interlocuteurs.

# Fit ICP (25) — secteur, zone, taille. Les trois sous-critères gardent leur
# hiérarchie : un fait DEMANDÉ prime toujours sur un fait déduit du profil.
_POINTS_NAF_EXACT = 10
_POINTS_NAF_DIVISION = 6
_POINTS_SECTOR_KEYWORD = 4
_MAX_ACTIVITY = 10

_POINTS_GEO_REQUESTED = 7
_POINTS_GEO_PROFILE = 4
_MAX_GEO = 7

_POINTS_HEADCOUNT_REQUESTED = 5
_POINTS_HEADCOUNT_PROFILE = 3
_MAX_HEADCOUNT = 5

# Surface informatique (20) — le compte a-t-il quelque chose à confier ? Au stade
# registre on ne peut pas ouvrir son organigramme ; on lit ce qui EST observable :
# une taille compatible avec une DSI interne, des recrutements techniques, une
# stack détectée. Aucun de ces trois n'est une preuve à lui seul, les trois
# ensemble en font une.
_POINTS_IT_HEADCOUNT_LARGE = 8
_POINTS_IT_HEADCOUNT_MID = 5
_POINTS_IT_HIRING = 8
_POINTS_IT_TECH = 4
_MAX_IT_SURFACE = 20
#: Au-delà, une entreprise a presque toujours une direction informatique.
_IT_LARGE_HEADCOUNT = 250
_IT_MID_HEADCOUNT = 50

# Accessibilité (20) — sait-on par qui entrer ? Non mesurable au registre.
_MAX_ACCESSIBILITY = 20

# Qualité des preuves (15) — fraîcheur, source, cohérence, densité. Le produit
# calculait déjà cet axe (`data_confidence`) et l'affichait à côté du score ; le
# rapport demande qu'il COMPTE. Un candidat parfaitement noté sur des données
# trouées ne vaut pas un candidat identiquement noté sur des données sûres.
_MAX_EVIDENCE = 15

# Signaux — le « pourquoi maintenant ». Plafonné pour que dix signaux faibles ne
# pèsent jamais plus qu'un vrai fit secteur + géo.
_SIGNAL_BASE_POINTS: dict[str, int] = {
    "tender": 10,  # AO ouvert (BOAMP) — un besoin exprimé, daté, public
    "hiring": 8,  # recrutements IT — capacité qui manque, maintenant
    "award": 7,  # marché attribué (DECP) — budget prouvé + titulaire en place
    "legal": 5,  # BODACC — évènement de vie (fusion, changement de direction)
    "tech": 4,  # stack détectée — contexte, pas un déclencheur
    # #3941 — levée annoncée par la presse : même poids que le défaut (4), posé ici
    # pour le NOMMER — aucune pondération neuve n'est décidée sans Louis.
    "funding": 4,
}
_SIGNAL_DEFAULT_POINTS = 4
_MAX_SIGNALS = 20

# Ancienneté — faible poids, purement additif (une jeune pousse n'est jamais
# pénalisée, elle ne gagne simplement pas ces points). Elle reste dans le bloc
# « fit » : « entreprise établie » est un critère de cible, et la question
# « est-ce une vraie entreprise » a désormais son gate en amont.
#
# Les quatre sous-critères du fit somment EXACTEMENT à 25 (10 + 7 + 5 + 3) :
# c'est ce qui fait tenir le barème du rapport à 100 une fois les cinq blocs
# additionnés. Modifier l'un d'eux sans les autres ferait dériver le total, et
# le badge « 78/85 » cesserait de vouloir dire quelque chose.
_POINTS_AGE = 3
_ESTABLISHED_YEARS = 3

# Fraîcheur d'un signal. Même horizon d'archivage (~24 mois) que
# `confidence.compute_confidence` : un AO de 2019 n'est pas une raison d'appeler
# aujourd'hui, il vaut donc exactement 0.
_FRESHNESS_BANDS: tuple[tuple[int, float], ...] = (
    (183, 1.0),  # < ~6 mois — chaud
    (365, 0.6),  # < ~1 an — tiède
    (730, 0.3),  # < ~2 ans — froid
)

# ── Normalisation ───────────────────────────────────────────────────────────


def _normalize(value: str) -> str:
    """Minuscule, sans accents, tout ce qui n'est pas alphanumérique → espace.
    Port exact de `normalize()` de similar-scoring.ts."""
    stripped = "".join(
        char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()


def _tokens(value: str) -> list[str]:
    return [token for token in _normalize(value).split(" ") if token]


#: Mots outils des libellés d'onboarding — jamais un signal secteur à eux seuls
#: (« Services financiers » ne doit pas matcher « Services de nettoyage »).
_SECTOR_STOPWORDS = frozenset(
    {"services", "service", "grande", "grands", "grand", "secteur", "secteurs", "autres", "marches"}
)

#: Zones qui n'expriment AUCUNE restriction géographique : le critère ne peut
#: alors pas discriminer deux candidats, il est donc entièrement sauté.
_OPEN_ZONES = ("national", "international", "remote", "toute la france", "monde", "france entiere")

#: Région administrative par département (métropole). Table factuelle, stable,
#: portée telle quelle de similar-scoring.ts.
_REGION_DEPARTMENTS: dict[str, tuple[str, ...]] = {
    "ile de france": ("75", "77", "78", "91", "92", "93", "94", "95"),
    "auvergne rhone alpes": ("01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"),
    "hauts de france": ("02", "59", "60", "62", "80"),
    "pays de la loire": ("44", "49", "53", "72", "85"),
    "nouvelle aquitaine": ("16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"),
    "occitanie": ("09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"),
    "provence alpes cote d azur": ("04", "05", "06", "13", "83", "84"),
    "grand est": ("08", "10", "51", "52", "54", "55", "57", "67", "68", "88"),
    "bretagne": ("22", "29", "35", "56"),
    "normandie": ("14", "27", "50", "61", "76"),
    "centre val de loire": ("18", "28", "36", "37", "41", "45"),
    "bourgogne franche comte": ("21", "25", "39", "58", "70", "71", "89", "90"),
    "corse": ("20",),
}

_REGION_ALIASES: dict[str, str] = {"paca": "provence alpes cote d azur", "idf": "ile de france"}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _parse_date(value: Any) -> date | None:
    """ISO date (``2026-06-01`` ou ``2026-06-01T09:00:00Z``) → :class:`date`.
    Jamais d'exception : une date illisible vaut « pas de date »."""
    raw = _text(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(raw[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


# ── Effectifs ───────────────────────────────────────────────────────────────

#: Un nombre éventuellement écrit avec des espaces de milliers (« 10 000 »).
_NUMBER_RE = re.compile(r"\d[\d\s  ]*\d|\d")


def parse_headcount_range(label: str | None) -> tuple[int, int | None] | None:
    """Borne basse / borne haute d'une tranche d'effectifs registre.

    Lit les libellés INSEE / recherche-entreprises tels qu'ils arrivent
    (« 100 à 199 salariés », « 10 000 salariés et plus », « 1 ou 2 salariés »).
    Les NOMBRES du libellé font foi — aucune tranche devinée. ``None`` quand le
    libellé ne porte aucune borne (« Unités non employeuses », vide), auquel cas
    le critère effectif ne marquera simplement pas de points.

    La borne haute vaut ``None`` pour une tranche ouverte (« et plus »).
    """
    text = _text(label)
    if not text:
        return None
    numbers = [int(re.sub(r"[\s  ]", "", match.group())) for match in _NUMBER_RE.finditer(text)]
    if not numbers:
        return None
    # #3814 — recette prod 08/10 : la borne BASSE est le PREMIER nombre du
    # libellé, celui que « X à Y salariés » / « X salariés et plus »
    # publient TOUJOURS en tête — jamais le plus petit trouvé n'importe où
    # dans le texte (`min(numbers)`, aveugle à un chiffre qui traînerait
    # ailleurs : une note, un code).
    low = numbers[0]
    if re.search(r"\b(et|ou)\s+plus\b", text, flags=re.IGNORECASE):
        return (low, None)
    # Même raison pour la borne HAUTE : le SECOND nombre, jamais le plus
    # grand trouvé n'importe où.
    return (low, numbers[1] if len(numbers) > 1 else low)


def _ranges_overlap(a: tuple[int, int | None], b: tuple[int, int | None]) -> bool:
    a_max = a[1] if a[1] is not None else float("inf")
    b_max = b[1] if b[1] is not None else float("inf")
    return a[0] <= b_max and b[0] <= a_max


#: #4362.3 — la définition BellumAI de la taille (décision Louis 21/10/2026), la MÊME que
#: `apps/web/src/features/discover/lib/discover-size-bounds.ts` : TPE < 10 · PME 10-249 ·
#: ETI 250-999 · GC (grand compte) ≥ 1 000. Plus les seuils INSEE (ETI < 5 000, GE ≥ 5 000).
SIZE_TPE_MAX = 9
SIZE_PME_MIN = 10
SIZE_PME_MAX = 249
SIZE_ETI_MIN = 250
SIZE_ETI_MAX = 999
SIZE_GC_MIN = 1000


def size_band_for_headcount(headcount: int | None) -> str | None:
    """TPE / PME / ETI / GC d'un effectif ; ``None`` pour un effectif absent ou nul (rien d'inventé)."""
    if headcount is None or headcount < 1:
        return None
    if headcount <= SIZE_TPE_MAX:
        return "TPE"
    if headcount <= SIZE_PME_MAX:
        return "PME"
    if headcount <= SIZE_ETI_MAX:
        return "ETI"
    return "GC"


def _range_for_target_type(label: str) -> tuple[int, int | None] | None:
    """Tranche visée par un libellé « type d'entreprise » de l'onboarding.

    Source première = les NOMBRES que le vendeur a lui-même sélectionnés
    (« PME (50-500 salariés) »). À défaut, une borne conventionnelle commentée.
    Un libellé sans dimension de taille (« Secteur public ») ne borne rien.
    Port de `headcountRangeForTargetType` (similar-scoring.ts).
    """
    normalized = "".join(
        char for char in unicodedata.normalize("NFD", label) if unicodedata.category(char) != "Mn"
    ).lower()
    explicit = re.search(r"(\d[\d\s]*)\s*(?:-|–|\ba\b)\s*(\d[\d\s]*)", normalized)
    if explicit:
        low = int(re.sub(r"\s", "", explicit.group(1)))
        high = int(re.sub(r"\s", "", explicit.group(2)))
        if low <= high:
            return (low, high)
    # #4362.3 — Grands comptes : la définition BellumAI, >= 1 000 salariés (plus 5 000).
    if any(marker in normalized for marker in ("cac40", "sbf", "grand")):
        return (SIZE_GC_MIN, None)
    # Startups & scale-ups : structures jeunes, au plus une PME (< 250).
    if "startup" in normalized or "scale" in normalized:
        return (1, SIZE_PME_MAX)
    return None


def _is_startup_target_type(label: str) -> bool:
    """True quand le libellé cible spécifiquement « startup »/« scale-up » —
    le SEUL type d'entreprise dont la tranche d'effectifs seule ne dit pas
    grand-chose : 1-250 salariés recoupe aussi bien une jeune pousse qu'une
    TPE vieille de vingt ans. `_headcount_factors` s'en sert pour exiger, en
    plus de la tranche, l'absence de preuve contraire sur l'âge (#3092).
    Port de `isStartupTargetType` (similar-scoring.ts)."""
    normalized = "".join(
        char for char in unicodedata.normalize("NFD", label) if unicodedata.category(char) != "Mn"
    ).lower()
    return "startup" in normalized or "scale" in normalized


#: Seuil conventionnel d'une structure « jeune » au sens startup/scale-up —
#: même ordre de grandeur que le critère d'âge du label French Tech
#: Next40/120. Jamais une pénalité : une date de création ABSENTE ne retire
#: rien (aucune donnée inventée) — seule une date CONNUE et dépassée écarte le
#: candidat du critère « type d'entreprise ciblé : startup ».
_YOUNG_COMPANY_YEARS = 8


def _is_confirmed_established(created: date | None, today: date, *, years: int) -> bool:
    """`True` seulement quand une date de création CONNUE confirme que la
    structure a dépassé l'âge donné — jamais sur une date absente."""
    if created is None:
        return False
    return (today - created).days >= years * 365


# ── Facteurs ────────────────────────────────────────────────────────────────
#
# `label` est un texte français, rendu verbatim par `CandidateScore.tsx`
# (Découvrir). Un utilisateur en anglais y lisait donc du français — le défaut
# mesuré du 09/09. `label_key` + `label_params` sont AJOUTÉS (jamais un
# remplacement de `label`, jamais un retrait) : un code stable + les valeurs
# interpolées, que le web traduit via `apps/web/src/i18n/locales/{fr,en}/discover.json`
# en préférant la clé et en retombant sur `label` quand elle est absente — le
# repli qui rend la fenêtre de déploiement Vercel/Railway inoffensive.


def _factor(
    label: str,
    points: int,
    evidence: str,
    *,
    label_key: str | None = None,
    label_params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    factor: dict[str, Any] = {"label": label, "points": int(points), "evidence": evidence}
    if label_key is not None:
        factor["label_key"] = label_key
        factor["label_params"] = dict(label_params or {})
    return factor


def _naf_key(code: str) -> str:
    """« 62.02A » / « 6202A » / « 62.02 A » → « 6202A » pour comparer sans se
    faire piéger par le formatage de la source."""
    return re.sub(r"[^0-9a-z]", "", code.lower())


def _requested_naf_codes(filters: Mapping[str, Any]) -> list[str]:
    """Les codes NAF demandés, un par un — la liste arrive jointe par des virgules."""
    return [code for code in re.split(r"[\s,;]+", _text(filters.get("nafCode"))) if code]


def _requested_departments(filters: Mapping[str, Any]) -> set[str]:
    """#2490.6 — TOUS les départements demandés : `departments` (le territoire)
    et `department` (le premier, gardé pour la source qui n'en prend qu'un)."""
    wanted = {re.sub(r"\s", "", _text(filters.get("department")))}
    wanted.update(re.sub(r"\s", "", _text(item)) for item in _str_list(filters.get("departments")))
    return {department for department in wanted if department}


def target_sectors_of(profile: Mapping[str, Any]) -> list[str]:
    """Les secteurs CIBLES déclarés au profil ESN (`profileData.sectors`,
    `packages/contracts/src/schemas/analysis.ts:833`), résolus SERVER-SIDE et
    transmis à chaque appel Découvrir. Seul point de lecture de cette clé
    (GA-26) — le bonus de score et le FILTRE cible (#2489.3/D1,
    `routers/discover.py`) la lisent tous les deux ici."""
    return _str_list(profile.get("sectors"))


def sector_matches_profile_targets(activity_text: str, profile_sectors: Sequence[str]) -> tuple[str, str] | None:
    """Le même appariement mot-clé que le bonus de score (`_activity_factors`)
    ET le filtre cible de Découvrir (#2489.3/D1) — un réglage vit à un seul
    endroit (GA-26), jamais recopié.

    Préfixe dans les deux sens (>= 4 caractères, mots outils exclus) pour que
    « assurance » matche « assurances ». Rend ``(mot du profil, mot du
    candidat)`` apparié, ou ``None`` si aucun secteur cible ne se retrouve dans
    le libellé d'activité — un libellé VIDE (secteur inconnu côté candidat)
    n'est jamais un appariement ET n'est jamais un rejet : c'est à l'appelant
    de décider ce qu'un inconnu devient (GA-18/GA-19)."""
    if not activity_text or not profile_sectors:
        return None
    candidate_tokens = [token for token in _tokens(activity_text) if len(token) >= 4]
    profile_tokens = [
        token
        for sector in profile_sectors
        for token in _tokens(sector)
        if len(token) >= 4 and token not in _SECTOR_STOPWORDS
    ]
    return next(
        (
            (profile_token, candidate_token)
            for profile_token in profile_tokens
            for candidate_token in candidate_tokens
            if candidate_token.startswith(profile_token) or profile_token.startswith(candidate_token)
        ),
        None,
    )


def _activity_factors(
    company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any]
) -> list[dict[str, Any]]:
    """Bloc activité : proximité NAF (graduée) puis, à défaut, mot-clé des
    secteurs CIBLES du vendeur retrouvé dans le libellé d'activité."""
    candidate_naf = _text(company.get("nafCode"))
    # #2490.5 — `nafCode` porte une LISTE depuis que chaque secteur d'écran part
    # avec ses codes (« 64.19Z,64.92Z,… »). Comparée en bloc à un code unique,
    # elle ne rendait jamais « exact » — au mieux la division du PREMIER code.
    wanted_codes = _requested_naf_codes(filters)
    if candidate_naf and wanted_codes:
        candidate_key = _naf_key(candidate_naf)
        wanted_by_key = {_naf_key(code): code for code in wanted_codes}
        if candidate_key in wanted_by_key:
            wanted_naf = wanted_by_key[candidate_key]
            return [
                _factor(
                    f"NAF {candidate_naf} exact",
                    _POINTS_NAF_EXACT,
                    f"code NAF registre {candidate_naf} = code demandé {wanted_naf}",
                    label_key="factors.nafExact",
                    label_params={"code": candidate_naf},
                )
            ]
        same_division = next(
            (code for key, code in wanted_by_key.items() if candidate_key[:2] and key[:2] == candidate_key[:2]), None
        )
        if same_division:
            return [
                _factor(
                    f"NAF {candidate_key[:2]} — même division que {same_division}",
                    _POINTS_NAF_DIVISION,
                    f"code NAF registre {candidate_naf} (division {candidate_key[:2]})",
                    label_key="factors.nafDivision",
                    label_params={"division": candidate_key[:2], "code": same_division},
                )
            ]

    # Mot-clé des secteurs cibles du profil dans le libellé d'activité du
    # candidat — même appariement que le FILTRE cible de Découvrir
    # (`routers/discover.py`, #2489.3/D1) : un réglage vit à un seul endroit
    # (GA-26), voir `sector_matches_profile_targets`.
    sectors = target_sectors_of(profile)
    activity_text = _text(company.get("sector"))
    matched = sector_matches_profile_targets(activity_text, sectors)
    if not matched:
        return []
    return [
        _factor(
            "Secteur cible du profil ESN",
            _POINTS_SECTOR_KEYWORD,
            f"« {matched[0]} » (secteurs visés) retrouvé dans « {activity_text} »",
            label_key="factors.sectorKeyword",
        )
    ]


def _department_of(company: Mapping[str, Any]) -> str:
    """Département du siège : la colonne registre si elle existe, sinon dérivé
    du code postal (DOM sur 3 chiffres)."""
    department = re.sub(r"\s", "", _text(company.get("department")))
    if department:
        return department
    digits = re.sub(r"\D", "", _text(company.get("postalCode")))
    if len(digits) < 2:
        return ""
    return digits[:3] if digits.startswith(("97", "98")) else digits[:2]


def _geo_factors(
    company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any]
) -> list[dict[str, Any]]:
    department = _department_of(company)
    city = _text(company.get("city"))

    # 1. Le critère explicitement DEMANDÉ prime — c'est un fait dur.
    # #2490.6 — le territoire entier, pas seulement son premier département : un
    # siège dans le second valait 0 point, « hors zone demandée ».
    wanted_departments = _requested_departments(filters)
    wanted_city = _text(filters.get("city"))
    if wanted_departments and department:
        if department in wanted_departments:
            return [
                _factor(
                    f"Département {department} — zone demandée",
                    _POINTS_GEO_REQUESTED,
                    f"siège registre : {city or 'département'} ({department})",
                    label_key="factors.geoDepartmentRequested",
                    label_params={"department": department},
                )
            ]
        return []  # hors zone demandée : 0 point, jamais de malus
    if wanted_city and city and _normalize(city) == _normalize(wanted_city):
        return [
            _factor(
                f"Ville {city} — zone demandée",
                _POINTS_GEO_REQUESTED,
                f"siège registre : {city}",
                label_key="factors.geoCityRequested",
                label_params={"city": city},
            )
        ]

    # 2. À défaut, la zone commerciale du profil vendeur (ville citée, ou
    #    département → région). Une zone ouverte ne discrimine rien.
    zones = [zone.strip() for zone in _text(profile.get("geoZone")).split(",") if zone.strip()]
    restrictive = [_normalize(zone) for zone in zones if not any(open_ in _normalize(zone) for open_ in _OPEN_ZONES)]
    if not restrictive:
        return []
    normalized_city = _normalize(city)
    if len(normalized_city) >= 3 and any(f" {normalized_city} " in f" {zone} " for zone in restrictive):
        return [
            _factor(
                "Siège dans la zone géographique du profil",
                _POINTS_GEO_PROFILE,
                f"siège registre : {city} — zone commerciale « {', '.join(zones)} »",
                label_key="factors.geoProfileZone",
            )
        ]
    if not department:
        return []
    region = next((name for name, departments in _REGION_DEPARTMENTS.items() if department in departments), None)
    if not region:
        return []
    for zone in restrictive:
        canonical = zone
        for alias, target in _REGION_ALIASES.items():
            if alias in canonical:
                canonical = f"{canonical} {target}"
        if region in canonical:
            return [
                _factor(
                    "Siège dans la zone géographique du profil",
                    _POINTS_GEO_PROFILE,
                    f"département {department} ({region}) — zone commerciale « {', '.join(zones)} »",
                    label_key="factors.geoProfileZone",
                )
            ]
    return []


def _headcount_factors(
    company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any], today: date
) -> list[dict[str, Any]]:
    label = _text(company.get("headcountRange"))
    candidate_range = parse_headcount_range(label)
    if candidate_range is None:
        return []

    wanted_min = filters.get("headcountMin")
    wanted_max = filters.get("headcountMax")
    if isinstance(wanted_min, int) or isinstance(wanted_max, int):
        wanted = (wanted_min if isinstance(wanted_min, int) else 0, wanted_max if isinstance(wanted_max, int) else None)
        if _ranges_overlap(candidate_range, wanted):
            return [
                _factor(
                    f"Effectif {label} — tranche demandée",
                    _POINTS_HEADCOUNT_REQUESTED,
                    f"tranche registre « {label} » recoupe {wanted[0]}-{wanted[1] if wanted[1] is not None else '∞'}",
                    label_key="factors.headcountRequested",
                    label_params={"range": label},
                )
            ]
        return []

    # #3092 — retour bêta Apricot Labs : « Laura a renvoyé des micro-entreprises
    # et pas des startups ». Une tranche d'effectifs 1-250 seule ne distingue
    # pas une jeune pousse d'une TPE vieille de vingt ans ; pour le type ciblé
    # « startup »/« scale-up » spécifiquement, une date de création registre
    # CONNUE et confirmée établie écarte le candidat de CE critère (les autres
    # types ciblés et les autres axes restent intacts). Absente ⇒ aucune
    # donnée inventée, aucune pénalité : le critère matche comme avant.
    created = _parse_date(company.get("creationDate"))
    target_types = _str_list(profile.get("targetCompanyTypes"))
    for target_type in target_types:
        target_range = _range_for_target_type(target_type)
        if not target_range or not _ranges_overlap(candidate_range, target_range):
            continue
        if _is_startup_target_type(target_type) and _is_confirmed_established(
            created, today, years=_YOUNG_COMPANY_YEARS
        ):
            continue
        evidence = f"tranche registre « {label} » recoupe « {target_type} »"
        if _is_startup_target_type(target_type) and created is not None:
            evidence = f"{evidence} ; création registre {created.isoformat()}"
        return [
            _factor(
                f"Effectif {label} — type d'entreprise ciblé",
                _POINTS_HEADCOUNT_PROFILE,
                evidence,
                label_key="factors.headcountProfile",
                label_params={"range": label},
            )
        ]
    return []


def _freshness(signal_date: date, now: date) -> float:
    """Pondération de fraîcheur d'un signal. Au-delà de ~24 mois le signal est
    ARCHIVÉ et vaut 0 — même horizon que `confidence.compute_confidence`."""
    age_days = (now - signal_date).days
    if age_days < 0:
        return 1.0  # date future (AO à échéance) : traité comme chaud
    for max_days, weight in _FRESHNESS_BANDS:
        if age_days <= max_days:
            return weight
    return 0.0


def _signal_factors(signals: Sequence[Mapping[str, Any]], now: date) -> list[dict[str, Any]]:
    """Un facteur agrégé pour le bloc signaux — le « pourquoi maintenant ».

    Un signal SANS date ne compte pas : le contrat rend ``date`` obligatoire
    précisément parce qu'un signal non daté ne justifie pas d'appeler aujourd'hui.
    """
    scored: list[tuple[int, str]] = []
    for signal in signals:
        if not isinstance(signal, Mapping):
            continue
        signal_date = _parse_date(signal.get("date"))
        if signal_date is None:
            continue
        base = _SIGNAL_BASE_POINTS.get(_text(signal.get("type")), _SIGNAL_DEFAULT_POINTS)
        points = int(round(base * _freshness(signal_date, now)))
        if points <= 0:
            continue
        label = _text(signal.get("label")) or _text(signal.get("type")) or "signal"
        scored.append((points, f"{label} ({signal_date.isoformat()})"))
    if not scored:
        return []
    scored.sort(key=lambda item: item[0], reverse=True)
    total = min(_MAX_SIGNALS, sum(points for points, _ in scored))
    # L'evidence liste les signaux qui portent réellement le bloc (top 3), avec
    # leur date — le vendeur doit pouvoir vérifier d'où vient chaque point.
    return [
        _factor(
            f"Signaux datés ({len(scored)})",
            total,
            " ; ".join(evidence for _, evidence in scored[:3]),
            label_key="factors.signalsDated",
            label_params={"count": len(scored)},
        )
    ]


def _age_factors(company: Mapping[str, Any], filters: Mapping[str, Any], now: date) -> list[dict[str, Any]]:
    created = _parse_date(company.get("creationDate"))
    if created is None:
        return []
    after = _parse_date(filters.get("createdAfter"))
    before = _parse_date(filters.get("createdBefore"))
    if after or before:
        if (after and created < after) or (before and created > before):
            return []
        return [
            _factor(
                "Ancienneté dans la fenêtre demandée",
                _POINTS_AGE,
                f"création registre {created.isoformat()}",
                label_key="factors.ageWindow",
            )
        ]
    if (now - created).days >= _ESTABLISHED_YEARS * 365:
        return [
            _factor(
                f"Ancienneté — entreprise établie depuis {created.year}",
                _POINTS_AGE,
                f"création registre {created.isoformat()}",
                label_key="factors.ageEstablished",
                label_params={"year": created.year},
            )
        ]
    return []


def _it_surface_factors(
    company: Mapping[str, Any],
    signals: Sequence[Mapping[str, Any]],
    profile: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Surface de demande du compte — a-t-il quelque chose à confier, DANS LE
    DOMAINE QUE CE VENDEUR VEND ?

    Ce n'est PAS « est-ce une entreprise informatique » : une banque n'a aucun
    code NAF technique et pilote pourtant une des plus grosses DSI de France. On
    lit donc ce qui est observable au stade registre — une taille compatible avec
    une fonction interne structurée, des recrutements du domaine, une empreinte
    technique détectée — sans jamais présenter l'un des trois comme une preuve à
    lui seul.

    ⚠️ La CLÉ de bloc reste ``it_surface`` et le nom de cette fonction ne change
    pas : la clé vit pour toujours dans les ``raw_analysis`` déjà produites, le
    contrat partagé la porte et quatre composants web la lisent. Ce qui se
    spécialise est le LIBELLÉ montré et la lecture faite — pas l'identifiant.
    Renommer aurait cassé des dossiers existants pour un gain d'affichage.

    Sans profil, en ESN IT ou sur un pack sans lentille : les libellés IT
    historiques, à l'octet près.
    """
    label, label_key, headcount_large, headcount_mid, hiring_evidence, tech_evidence = _surface_wording(profile)
    factors: list[dict[str, Any]] = []

    parsed = parse_headcount_range(_text(company.get("headcountRange")) or None)
    if parsed:
        low, _high = parsed
        if low >= _IT_LARGE_HEADCOUNT:
            factors.append(
                _factor(
                    label,
                    _POINTS_IT_HEADCOUNT_LARGE,
                    f"effectif {_text(company.get('headcountRange'))} — {headcount_large}",
                    label_key=label_key,
                )
            )
        elif low >= _IT_MID_HEADCOUNT:
            factors.append(
                _factor(
                    label,
                    _POINTS_IT_HEADCOUNT_MID,
                    f"effectif {_text(company.get('headcountRange'))} — {headcount_mid}",
                    label_key=label_key,
                )
            )

    kinds = {_text(s.get("type")).lower() for s in signals if isinstance(s, Mapping)}
    if "hiring" in kinds:
        factors.append(_factor(label, _POINTS_IT_HIRING, hiring_evidence, label_key=label_key))
    if "tech" in kinds:
        factors.append(_factor(label, _POINTS_IT_TECH, tech_evidence, label_key=label_key))
    return factors


def _surface_wording(profile: Mapping[str, Any] | None) -> tuple[str, str, str, str, str, str]:
    """Les cinq libellés du bloc de surface (+ leur `label_key`), selon le
    domaine du VENDEUR.

    Les libellés IT sont rendus à l'octet près sans profil, en ESN IT, ou pour
    tout pack qui n'a pas de lentille — c'est ce qui garantit qu'aucun compte
    déjà scoré ne change de justification.
    """
    if not is_industrial_seller(profile or {}):
        return (
            "surface informatique",
            "factors.itSurfaceIt",
            "direction informatique interne probable",
            "informatique structurée probable",
            "recrutements techniques détectés",
            "stack technique détectée",
        )
    return (
        "surface industrielle",
        "factors.itSurfaceIndustrial",
        "direction technique et bureau d'études internes probables",
        "fonction technique structurée probable",
        "recrutements techniques industriels détectés",
        "empreinte technique détectée",
    )

def _it_surface_measurable(company: Mapping[str, Any], signals: Sequence[Mapping[str, Any]]) -> bool:
    """Mesurable dès qu'on connaît la taille OU qu'un signal technique existe.
    Sans ni l'un ni l'autre, on ne sait rien de la surface — et on le dit."""
    return bool(_text(company.get("headcountRange"))) or bool(signals)


def _evidence_factors(confidence: int) -> list[dict[str, Any]]:
    """La qualité des preuves, convertie en points (p41).

    Le produit calculait déjà cet axe et l'affichait À CÔTÉ du score ; le rapport
    demande qu'il COMPTE. Deux candidats également notés ne se valent pas si l'un
    repose sur un dossier complet et l'autre sur trois champs vides.
    """
    points = round(_MAX_EVIDENCE * confidence / 100)
    if points <= 0:
        return []
    return [
        _factor(
            "qualité des preuves",
            points,
            f"confiance donnée {confidence}/100",
            label_key="factors.evidenceQuality",
        )
    ]


# ── Adressabilité (tome 1 §6) ───────────────────────────────────────────────
#
# Les 20 points réservés au bloc « accessibilité » depuis le premier jour, et
# jamais calculés : `"accessibility": False` était écrit en dur, avec sa raison
# — « on ne connaît aucun interlocuteur au stade registre ». C'était vrai pour
# TROIS des cinq axes. Les deux autres se mesurent sur des données publiques.
#
# #1631.5 — le compte a bougé : la RELATION se mesure dès que la couche zéro
# (le CRM que l'ESN a connecté) a retrouvé le compte. #1631.3/.4/.5 (lot 13) —
# le compte a bougé une seconde fois : le CHEMIN se mesure dès que l'appelant
# transporte le compte de parcours agrégé de la mémoire marché. Reste UN axe
# non calculé — `access_cost` — parce qu'il se DÉCLARE et ne s'estime jamais
# (D60). Le détail de chacun est dans `addressability_for_company`.
#
# ⚠️ CORRIGÉ le 10/09/2026 (lot 14, #1631.3/.4, #1606.2) : ce paragraphe disait
# « `path` est CALCULABLE, ce n'est pas dire qu'il est ALIMENTÉ » — vrai le
# temps du lot 13, FAUX depuis. `ResearchRequest` (compte du portefeuille)
# transporte désormais `market_paths_observed` / `market_top_esn`, résolus
# côté API par `MarketMemoryService.pathAxisFor` et threadés par
# `AnalysisService` / `AnalysisOnDemandService` / `AnalysisWorker` / `IaClient`
# jusqu'à `phase1_research.py`, exactement comme `resolveCrmPresence` l'a fait
# pour la relation (#1631.5). Reste NON câblé, et ce n'est pas un oubli : les
# signaux de DÉCOUVRIR (candidat, pas encore un compte) — hors du périmètre de
# ce lot, à ouvrir ensuite avec la même discipline. Sur ce second chemin,
# `market_paths_observed` reste `None` et `path` reste NOMMÉ dans
# `unmeasured` — jamais un `0`.
#
# La discipline est celle du reste du module, appliquée à l'AXE et non au bloc :
# un axe dont on n'a pas les deux côtés sort du dénominateur. Un « 0 sur 20 »
# ferait lire « ce compte est inatteignable » là où la vérité est « on n'a pas
# regardé » — et l'écart entre les deux, c'est huit mois de prospection.
_AXIS_LOCK = 6
_AXIS_PROPORTION = 5
_AXIS_PATH = 5
_AXIS_RELATION = 3
_AXIS_ACCESS_COST = 1

#: Le seuil transverse de la mémoire marché (#1631.3, retour verbatim : « le
#: seuil transverse de Market Memory est 3 »). MIROIR de
#: ``packages/contracts/src/schemas/market-memory.ts::MARKET_MEMORY_MIN_PATHS``
#: — ce module Python n'a aucun mécanisme d'import inter-langage pour une
#: constante scalaire (seules les FORMES de contrat sont synchronisées, voir
#: ``app/contracts/sync_schemas.py``), donc cette valeur est un miroir tenu à
#: la main, à l'octet — et c'est exactement ce que
#: ``tests/test_discover_scoring_path_axis.py::test_mirrors_the_ts_source_of_truth``
#: vérifie en lisant le fichier TS source, pour qu'un futur changement d'un
#: seul côté fasse échouer la suite plutôt que diverger en silence (GA-26).
_MARKET_MEMORY_MIN_PATHS = 3

#: Sous ``_PATH_STRONG_MIN_PATHS`` observations, la preuve est INTERMÉDIAIRE
#: (retour verbatim : « 3–4 observations → preuve intermédiaire »). Le nombre
#: de points reste sous le plafond de l'axe : une preuve intermédiaire ne vaut
#: pas la preuve forte, et l'écart doit se LIRE dans le score, pas seulement
#: dans le mot choisi pour la preuve.
_PATH_INTERMEDIATE_POINTS = 3

#: À partir de cinq observations, la preuve est FORTE (retour verbatim :
#: « >=5 → preuve forte ») et l'axe vaut son plafond plein.
_PATH_STRONG_MIN_PATHS = 5

#: Les cinq axes et leur plafond. La somme fait exactement `_MAX_ACCESSIBILITY`.
_ADDRESSABILITY_AXES: tuple[tuple[str, int], ...] = (
    ("lock", _AXIS_LOCK),
    ("proportion", _AXIS_PROPORTION),
    ("path", _AXIS_PATH),
    ("relation", _AXIS_RELATION),
    ("access_cost", _AXIS_ACCESS_COST),
)


#: Les trois tris, et celui qu'on propose par défaut selon la maturité déclarée.
#:
#: Le §8.3 le pose ainsi : une ESN de moins de cinq consultants ouvre Découvrir
#: trié par ADRESSABILITÉ, une ESN établie par INTÉRÊT. Ce n'est pas une
#: préférence d'affichage — c'est la différence entre un outil qui sert à
#: démarrer et un outil qui sert à couvrir un portefeuille.
#:
#: Le défaut est PROPOSÉ, jamais imposé : un choix explicite de l'utilisateur le
#: remplace, et rien ne le ré-écrase à la requête suivante.
DISCOVER_SORTS = ("interest", "addressability", "balanced")


def recommended_sort(profile: Mapping[str, Any] | None) -> str:
    """Le tri à proposer d'entrée, déduit de la taille déclarée de l'ESN.

    Sans profil, on rend ``balanced`` : c'est le seul des trois qui ne parie sur
    rien. Proposer l'intérêt à une ESN dont on ignore la taille lui montrerait
    d'abord les comptes qu'elle a le moins de chances d'ouvrir.
    """
    # Le PROFIL commercial d'abord (tome 3, D87) : une ESN de six personnes avec
    # une expertise rare n'ouvre pas les mêmes comptes qu'une ESN de six
    # personnes sans spécialité — la première vend son expertise, la seconde a
    # besoin d'une porte. La taille seule ne fait pas cette différence.
    sales_profile = classify_esn_sales_profile(profile)
    if sales_profile:
        return PROFILE_DEFAULT_SORT[sales_profile]

    size = _text((profile or {}).get("size"))
    low = _esn_lower_bound(size) if size else None
    if low is None:
        return "balanced"
    if low < 5:
        return "addressability"
    if low < 20:
        return "balanced"
    return "interest"


def _axis(
    axis: str,
    label: str,
    points: int,
    evidence: str,
    *,
    label_key: str | None = None,
    label_params: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    factor: dict[str, Any] = {
        "label": label,
        "points": int(points),
        "evidence": evidence,
        "block": "accessibility",
        "axis": axis,
    }
    if label_key is not None:
        factor["label_key"] = label_key
        factor["label_params"] = dict(label_params or {})
    return factor


def _lock_axis(
    signals: Sequence[Mapping[str, Any]], barrier: Mapping[str, Any] | None = None
) -> dict[str, Any] | None:
    """A1 — le verrouillage, sur la seule donnée publique qui en parle.

    Deux faits, et seulement des faits :

    - une **attribution** (DECP) dit qu'un fournisseur EST en place chez cet
      acheteur. Ce n'est pas « verrouillé » : DECP ne publie pas ici la durée du
      marché, donc affirmer que le panel est fermé serait une invention. C'est
      « il y a une porte, et elle passe par quelqu'un » — le `semi_ouvert` du
      §6.1 ;
    - un **appel d'offres** ouvert dit que la porte est ouverte MAINTENANT, à
      une date publique. C'est l'`ouvert` du §6.1.

    Rien trouvé ⇒ ``None`` ⇒ axe non mesuré. C'est l'interdit central du §15
    (« estimer un verrouillage faute de donnée »), et sa réciproque est pire
    encore : une entreprise privée n'apparaît JAMAIS dans DECP, donc l'absence
    de trace n'y prouve rigoureusement rien. Déclarer « ouvert » sur un silence
    serait promettre une porte qu'on n'a pas vue.
    """
    award: Mapping[str, Any] | None = None
    tender: Mapping[str, Any] | None = None
    for signal in signals:
        if not isinstance(signal, Mapping):
            continue
        kind = _text(signal.get("type")).lower()
        if kind == "award" and award is None:
            award = signal
        elif kind == "tender" and tender is None:
            tender = signal

    if tender is not None and award is None:
        return _axis(
            "lock",
            "Consultation ouverte — la porte l'est aussi",
            _AXIS_LOCK,
            f"appel d'offres public en cours : {_text(tender.get('label')) or 'sans intitulé'}"
            + (f" ({_text(tender.get('date'))})" if _text(tender.get("date")) else ""),
            label_key="axes.lockTenderOpen",
        )
    if award is not None:
        # L'échéance est collectée depuis le tome 2 (`decp.py`). Elle n'était lue
        # nulle part ici : l'axe écrivait « échéance inconnue » EN DUR sur une
        # donnée qu'on avait. C'est pourtant la seule information qui transforme
        # un « non » en rendez-vous daté.
        ends = _text(award.get("endsOn")) or _text(award.get("ends_on"))
        return _axis(
            "lock",
            "Un prestataire est déjà en place — l'entrée passe par lui",
            _AXIS_LOCK - 2,
            f"marché public remporté : {_text(award.get('label')) or 'sans intitulé'}"
            + (f" ({_text(award.get('date'))})" if _text(award.get("date")) else "")
            + (
                f" · en cours jusqu'au {ends}"
                if ends
                else " · échéance du marché inconnue, à vérifier au premier contact"
            ),
            label_key="axes.lockAwardIncumbent",
        )

    # Aucune trace de commande publique. La barrière ESTIMÉE prend le relais
    # (tome 3, D71 : « la formule du tome 3 CALCULE l'axe A1 »), et son evidence
    # dit que c'est une estimation de registre — jamais un fait sur la porte.
    return _lock_axis_from_barrier(barrier)


#: Points de l'axe A1 selon la classe estimée. Une classe A ne vaut PAS les six
#: points d'une consultation ouverte : une estimation de proxies n'est pas une
#: porte qu'on a vue s'ouvrir.
_LOCK_POINTS_BY_CLASS: dict[str, int] = {"A": 5, "B": 3, "C": 2, "D": 0}

#: Le libellé composé (« {classe} — estimation de registre ») est un texte FIXE
#: par classe — les quatre classes du tome 3 (`access_scoring.CLASS_BOUNDS`)
#: sont un ensemble fermé. Pas de `label_params` ici : composer la traduction
#: de la classe DANS la phrase demanderait une traduction imbriquée ; choisir
#: directement la BONNE clé, une par classe, l'évite.
_LOCK_ESTIMATE_LABEL_KEY_BY_CLASS: dict[str, str] = {
    "A": "axes.lockEstimateA",
    "B": "axes.lockEstimateB",
    "C": "axes.lockEstimateC",
    "D": "axes.lockEstimateD",
}


def _lock_axis_from_barrier(barrier: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not barrier or not barrier.get("measurable"):
        return None
    klass = str(barrier.get("access_class") or "")
    if klass not in _LOCK_POINTS_BY_CLASS:
        return None
    measured = [p for p in barrier.get("proxies", []) if p.get("measurable")]
    return _axis(
        "lock",
        f"{barrier.get('label')} — estimation de registre",
        _LOCK_POINTS_BY_CLASS[klass],
        f"barrière estimée {barrier.get('score')}/10 sur {len(measured)} proxies publics "
        f"(classe {klass}) — aucune trace de marché public à son nom",
        label_key=_LOCK_ESTIMATE_LABEL_KEY_BY_CLASS[klass],
    )


#: Bornes basses des tranches d'effectif du COMPTE, du §6.2.
_PROPORTION_COMPANY_TIERS: tuple[tuple[int, str], ...] = (
    (5000, "> 5 000"),
    (1000, "1 000 - 5 000"),
    (250, "250 - 1 000"),
    (0, "< 250"),
)

#: Bornes basses des paliers d'effectif de l'ESN, tels que les pose le
#: questionnaire d'accueil (`consultant_size`). Le palier le plus fin est
#: « 1-10 », plus grossier que la table du §6.2 : une ESN est donc résolue par
#: sa borne BASSE. Sur-estimer la capacité d'une ESN à ouvrir un grand compte
#: est l'erreur qui coûte huit mois ; la sous-estimer suggère seulement de viser
#: une filiale — les deux erreurs ne se paient pas le même prix.
_PROPORTION_ESN_TIERS: tuple[tuple[int, int], ...] = ((80, 3), (21, 2), (6, 1), (0, 0))

#: La table du §6.2 : ligne = tranche du compte, colonne = palier de l'ESN.
_PROPORTION_TABLE: tuple[tuple[int, int, int, int], ...] = (
    (5, 5, 4, 2),  # < 250
    (3, 5, 5, 4),  # 250 - 1 000
    (1, 3, 5, 5),  # 1 000 - 5 000
    (0, 1, 3, 5),  # > 5 000
)


def _esn_lower_bound(size: str) -> int | None:
    """« 10-30 » → 10 · « 500+ » → 500. Une valeur illisible rend ``None``,
    et l'axe sort du calcul plutôt que de tomber sur un palier au hasard."""
    match = re.search(r"\d+", size)
    return int(match.group()) if match else None


def _proportion_axis(company: Mapping[str, Any], profile: Mapping[str, Any]) -> dict[str, Any] | None:
    """A2 — « ce compte est-il à la portée de CETTE ESN-là ? »

    L'axe que la note stratégique ne voit pas, et le plus important pour une ESN
    qui démarre. Un point à 0 n'est PAS une pénalité : c'est un fit nul, et le
    message le dit franchement plutôt que de laisser croire à un mauvais score.
    """
    label = _text(company.get("headcountRange"))
    parsed = parse_headcount_range(label)
    if parsed is None:
        return None
    size = _text(profile.get("size"))
    esn_low = _esn_lower_bound(size) if size else None
    if esn_low is None:
        return None

    company_low = parsed[0]
    row = next(index for index, (floor, _name) in enumerate(_PROPORTION_COMPANY_TIERS) if company_low >= floor)
    # `_PROPORTION_COMPANY_TIERS` descend, la table monte : on la relit à l'endroit.
    row = len(_PROPORTION_COMPANY_TIERS) - 1 - row
    column = next(index for floor, index in _PROPORTION_ESN_TIERS if esn_low >= floor)
    points = _PROPORTION_TABLE[row][column]

    tier_name = _PROPORTION_COMPANY_TIERS[len(_PROPORTION_COMPANY_TIERS) - 1 - row][1]
    if points == 0:
        evidence = (
            f"{label} face à une ESN de {size} : pas d'ouverture en direct. "
            "Deux chemins existent — passer par un référencé, ou viser une filiale."
        )
    else:
        evidence = f"effectif {tier_name} face à une ESN de {size}"
    return _axis(
        "proportion",
        f"Proportion — {tier_name} pour une ESN de {size}",
        points,
        evidence,
        label_key="axes.proportion",
        label_params={"tier": tier_name, "size": size},
    )


# #2298.6 — un chemin se dit sans nommer personne : cet axe est la couche qui
# tient cette règle pour la RELATION (« un chemin existe dans ton équipe »,
# jamais qui). Verrouillé par `test_the_relation_axis_never_carries_the_name_of_a_colleagues_contact`
# (#1606.3) ET par `test_2298_6_the_relation_axis_says_a_path_exists_in_the_team_without_naming_who`
# (`tests/test_discover_scoring_addressability_axes.py`).
def _relation_axis(
    crm_presence: str | None,
    *,
    missions_count: int | None = None,
    last_meeting_at: str | None = None,
    last_email_at: str | None = None,
    human_correction: str | None = None,
    known_contacts_count: int | None = None,
) -> dict[str, Any] | None:
    """A4 — « quelqu'un chez nous connaît-il déjà ce compte ? » (#1631.5,
    étendu #2298.4 — décision Louis du 19/09/2026, « la relation se lit à
    plusieurs sources »).

    ─────────────────────────────────────────────────────────────────────────
    D'OÙ VIENT LA DONNÉE, ET D'OÙ ELLE NE VIENT PAS
    ─────────────────────────────────────────────────────────────────────────
    #1631.5 branchait UNE source : le CRM que l'ESN a elle-même connecté.
    #2298.4 en ajoute QUATRE, dans l'ordre où le retour les cite, chacune
    ALIMENTÉE seulement si la donnée RÉELLE existe en base (jamais devinée) :

    1. ``missions_count`` — une mission SIGNÉE, en cours ou passée, chez ce
       compte (``RUNNING_MISSION_STATUSES`` ∪ ``FINISHED_MISSION_STATUSES``,
       ``@bellum/contracts``) est la preuve la plus forte qui existe : l'ESN a
       DÉJÀ été payée par ce compte.
    2. ``last_meeting_at`` — un rendez-vous PASSÉ avec un contact du compte, lu
       depuis les connexions agenda (Google/Microsoft) déjà branchées
       (``activities`` table, ``kind = 'meeting'``).
    3. ``last_email_at`` — MÉTADONNÉES seulement (une date d'échange), JAMAIS
       le corps : doctrine « le corps des messages ne sort jamais vers un
       humain ni vers le modèle » (stocké au journal, jamais exposé). Cette
       fonction n'a d'ailleurs AUCUN paramètre qui pourrait porter un corps ou
       un objet de message — voir
       ``test_relation_axis_signature_never_accepts_an_email_body``.
    4. ``human_correction`` — une correction humaine gagne toujours : le mot
       que le commercial a lui-même posé sur la relation
       (``account.relationship_memory.relation``, jamais deviné).

    Pas de la mémoire marché : son corpus ne porte AUCUN hash de personne — la
    table ``market_person_path_hashes`` de la demande d'origine n'a jamais eu de
    source, et rapprocher des gens par leur nom rapprocherait des homonymes.
    ⚠️ Et ce n'est PAS le seul refus : la mémoire marché élève un POTENTIEL,
    elle ne fabrique JAMAIS de relation ni d'urgence (GA-263,
    ``market-memory-never-creates-urgency.spec.ts``) — un compte que « le
    marché » a beaucoup vu n'est pas, pour autant, un compte où NOUS avons une
    relation. DataForge (prior sectoriel/procurement tiers, pas un fait de
    relation propre à l'ESN) n'est pas branché pour la même raison : les deux
    restent hors de cet axe, par écrit, pas par oubli.

    L'entrée CRM est le relevé de la couche zéro (annexe méthodo p8), rendu
    côté API par ``formatCrmPresence`` et transporté par
    ``ResearchRequest.crm_presence``. Son contrat, déjà documenté et déjà lu
    comme un booléen par :func:`app.services.zero_layer.has_crm_history` : il
    n'arrive NON VIDE que sur un match RÉEL — au moins un contact ou un deal
    ouvert chez ce compte.

    ─────────────────────────────────────────────────────────────────────────
    POURQUOI L'AXE RESTE BINAIRE, ET POURQUOI JAMAIS ZÉRO
    ─────────────────────────────────────────────────────────────────────────
    **Binaire** : chaque source est un FAIT d'existence (une mission existe,
    un rendez-vous a eu lieu…), jamais un niveau. Graduer sur « combien de
    missions » ou « combien de rendez-vous » inventerait un barème que
    personne n'a écrit ; le relevé CRM reste en plus un texte d'AFFICHAGE
    qu'on ne peut pas parser sans dépendre d'une phrase qu'une traduction
    casserait. L'axe vaut donc TOUJOURS son plafond (``_AXIS_RELATION``) dès
    qu'AU MOINS une source est réelle — jamais la somme des sources, qui
    ferait dépendre le barème du nombre d'intégrations connectées plutôt que
    de la réalité « ce compte est-il froid ».

    **Jamais zéro** : chaque source, PRISE SEULE, recouvre plusieurs causes
    indiscernables (pas de CRM connecté / consulté sans match / lecture en
    échec pour le CRM ; pas de mission / pas encore signée pour les missions ;
    etc.). « Il n'y a pas de relation » n'est donc jamais ce qu'on sait tant
    qu'AUCUNE source n'a répondu ; ce qu'on sait, c'est qu'on n'a rien trouvé à
    regarder. Un ``0/3`` affirmerait le contraire, et ferait mécaniquement
    baisser l'adressabilité de tout compte dont aucune intégration n'est
    connectée — le score mesurerait la complétude de NOS données. L'axe sort
    du dénominateur.

    ─────────────────────────────────────────────────────────────────────────
    ⚠️ CE QUI NE SORT PAS D'ICI
    ─────────────────────────────────────────────────────────────────────────
    Aucun caractère du relevé CRM. L'adressabilité est PERSISTÉE dans
    ``raw_analysis`` et lue par tout l'espace, alors que le relevé est obtenu
    avec les identifiants d'UNE personne : recopier « Alice Martin (DSI) » y
    publierait le carnet d'adresses d'un collègue à ses collègues (RBAC,
    #1606.3). L'axe n'en lit que l'EXISTENCE. Et le CRM est nommé par sa
    CAPACITÉ (« votre CRM »), jamais par son éditeur. Même discipline pour les
    nouvelles sources : ``missions_count`` est un NOMBRE, ``last_meeting_at`` /
    ``last_email_at`` sont des DATES — jamais un nom de contact, un objet de
    réunion, un corps de message.
    """
    sources: list[str] = []
    if _text(crm_presence):
        sources.append(
            "ton CRM connecté a retrouvé ce compte : au moins un contact ou un deal ouvert y est "
            "enregistré — l'interlocuteur se relit dans ton CRM, il n'est jamais recopié ici"
        )
    if missions_count is not None and missions_count > 0:
        plural = "s" if missions_count > 1 else ""
        sources.append(f"{missions_count} mission{plural} en cours ou passée{plural} chez ce compte")
    meeting_at = _text(last_meeting_at)
    if meeting_at:
        sources.append(f"dernier rendez-vous le {meeting_at}")
    email_at = _text(last_email_at)
    if email_at:
        sources.append(f"derniers échanges e-mail le {email_at} (dates seulement, jamais le contenu)")
    # #4680 — la CINQUIÈME source, lue en base comme les trois premières : les contacts CONNUS (import d'un fichier ou
    # d'un ancien CRM, fiche créée depuis le CRM) déjà rattachés au compte. Un NOMBRE, jamais un nom ni une
    # coordonnée ; absent ou 0 → aucune source (l'axe reste non évaluable, jamais « 0 »).
    if known_contacts_count is not None and known_contacts_count > 0:
        plural = "s" if known_contacts_count > 1 else ""
        sources.append(
            f"{known_contacts_count} contact{plural} connu{plural} de ton équipe déjà rattaché{plural} à ce compte"
        )
    correction = _text(human_correction)
    if correction:
        sources.append(f"correction posée par ton équipe : {correction}")

    if not sources:
        return None
    return _axis(
        "relation",
        "Une relation existe déjà — l'entrée n'est pas froide",
        _AXIS_RELATION,
        "; ".join(sources),
        label_key="axes.relation",
    )


# #2298.4 (19/09/2026, lot I3) — LE REJEU GRATUIT DE L'AXE RELATION SEUL.
#
# Le rattrapage ciblé (#AF, #2543.7) rejoue des segments ENTIERS via des
# chemins PAYANTS (`refreshResearch`, `replan`…). L'axe relation, lui, a trois
# sources déjà en base sans le moindre appel sortant (missions signées, agenda,
# e-mails — `RelationAxisReaderService` côté API) et une quatrième posée par un
# humain (`relationship_memory.relation`) : rejouer CET axe seul ne coûte rien.
#
# ⚠️ AUCUN paramètre `crm_presence` — et ce n'est pas un oubli. Le lire exige
# un appel LIVE au fournisseur CRM connecté (`CrmReadService.findAccountPresence`,
# HubSpot/Salesforce), donc un appel sortant : exactement ce que ce chemin
# gratuit refuse. L'appelant (`AnalysisOnDemandService.recalculateRelationAxis`,
# côté API) ne DOWNGRADE jamais un axe déjà mesuré par un calcul CRM antérieur —
# c'est LUI qui tient cette garde, pas cette fonction : elle reste pure et ne
# voit jamais le passé.
#
# Réutilise `_relation_axis` TELLE QUELLE (GA-26, une dérivation vit à un seul
# endroit) — jamais une seconde implémentation du barème.
def relation_axis_recalc(
    *,
    missions_count: int | None = None,
    last_meeting_at: str | None = None,
    last_email_at: str | None = None,
    human_correction: str | None = None,
    known_contacts_count: int | None = None,
) -> dict[str, Any]:
    """La MÊME forme que `addressability_for_company`
    (``{score, max, unmeasured, factors}``), réduite au seul axe relation :
    ``unmeasured`` ne peut contenir que ``["relation"]`` ou ``[]``, ``factors``
    au plus un élément. L'appelant recombine ce résultat avec le reste de
    l'adressabilité déjà stockée — jamais recalculé ici."""
    relation = _relation_axis(
        None,
        missions_count=missions_count,
        last_meeting_at=last_meeting_at,
        last_email_at=last_email_at,
        human_correction=human_correction,
        known_contacts_count=known_contacts_count,
    )
    if relation is None:
        return {"score": None, "max": 0, "unmeasured": ["relation"], "factors": []}
    return {"score": relation["points"], "max": _AXIS_RELATION, "unmeasured": [], "factors": [relation]}


def _path_axis(paths_observed: int | None, top_esn: str | None) -> dict[str, Any] | None:
    """A3 — « la mémoire marché a-t-elle déjà vu une route vers ce compte ? »
    (#1631.3/.4/.5, #1606.2, #1606.6 — lot 13).

    ─────────────────────────────────────────────────────────────────────────
    LE BARÈME, VERBATIM DU RETOUR
    ─────────────────────────────────────────────────────────────────────────
    « < 3 parcours vers une même ESN / route cohérente → None / axe non mesuré.
    3–4 observations → preuve intermédiaire. >=5 → preuve forte. » Le seuil de
    3 n'est PAS choisi ici : c'est ``_MARKET_MEMORY_MIN_PATHS``, le seuil
    TRANSVERSE de toute la mémoire marché (``MARKET_MEMORY_MIN_PATHS`` côté
    contrat TS) — en-dessous, la mémoire marché ELLE-MÊME ne rend aucun compte
    de parcours à personne (``market-memory.service.ts``), donc un appelant
    honnête ne peut de toute façon jamais transmettre 1 ou 2 ici. Le second
    filtre ci-dessous n'est donc pas redondant : c'est la garde qui refuse un
    appelant qui se tromperait — GA-272, la preuve « sait dire NON ».

    ⚠️ CORRIGÉ le 10/09/2026 (lot 14, #1624) : cette phrase était VRAIE pour le
    TOTAL agrégé (``coverage.marketPaths``, celui que ``paths_observed``
    reçoit ici) mais se lisait comme une garantie sur tout ce que le service
    rend — garantie qu'il ne tenait PAS : mesuré en production sur BNP
    Paribas, ``coverageFor`` rendait une ligne ESN (Keyrus) à 2 parcours dans
    ``esnObserved``, affichée telle quelle à l'écran (« 2 parcours observés
    relient Keyrus… »). Le filtre qui la construisait comparait au plancher
    ``MARKET_OBSERVATION_MIN_PERSONS`` (pensé pour la pile technique), pas au
    seuil transverse. Corrigé côté TS (``esnObservedFrom``, GA-285) : la
    phrase est vraie maintenant, au sens le plus strict, pour tout nombre que
    ``market-memory.service.ts`` expose — pas seulement le total agrégé.

    INTERDIT explicitement par le retour : « 1 observation → 2/5 ». Aucun
    palier de ce barème ne peut donc être atteint sous le seuil : soit l'axe
    est non mesuré, soit il vaut au moins ``_PATH_INTERMEDIATE_POINTS``.

    ─────────────────────────────────────────────────────────────────────────
    LE MOT « QUALIFIER » — OBLIGATOIRE, DEUX FOIS DANS LE RETOUR
    ─────────────────────────────────────────────────────────────────────────
    Une observation de parcours n'est jamais une présence actuelle (la même
    règle que ``market_esn_client`` côté API : « observé », jamais « en
    place », jamais « fournisseur actuel »). L'evidence dit donc « chemin
    partenaire à qualifier », jamais « chemin ouvert » ni un pourcentage de
    chance — aucune PROBABILITÉ, doctrine du dépôt.

    ─────────────────────────────────────────────────────────────────────────
    CE QUE CETTE FONCTION NE FAIT PAS
    ─────────────────────────────────────────────────────────────────────────
    Elle ne RÉSOUT rien : elle ne sait pas interroger la mémoire marché, elle
    ne connaît ni SIREN ni domaine, elle prend le compte de parcours et le nom
    de l'ESN la plus observée TELS QUE L'APPELANT les lui donne. La résolution
    d'identité (alias, clé de marché) reste UNE SEULE fois dans
    ``MarketMemoryService`` (API TypeScript, GA-258) — la refaire ici créerait
    une seconde dérivation qui diverge à la première mise à jour d'un alias.

    :param paths_observed: le compte de parcours agrégés vers ce compte,
        toutes ESN confondues, tel que la mémoire marché le rend. ``None`` =
        pas d'ingrédient (aucun appelant actuel n'en transporte encore, voir le
        commentaire au-dessus de ``_AXIS_LOCK``) ; c'est le défaut, et il rend
        cet axe byte-identique à avant l'ajout de ce paramètre.
    :param top_esn: le nom de l'ESN la plus observée sur ce compte, pour une
        preuve nommée (« … relient ALTEN … ») plutôt qu'anonyme. Optionnel :
        sans nom, l'evidence reste vraie en désignant « des sociétés de
        services partenaires ».
    """
    if paths_observed is None:
        return None
    if paths_observed < _MARKET_MEMORY_MIN_PATHS:
        return None
    strong = paths_observed >= _PATH_STRONG_MIN_PATHS
    points = _AXIS_PATH if strong else _PATH_INTERMEDIATE_POINTS
    who = _text(top_esn) or "des sociétés de services partenaires"
    evidence = (
        f"{paths_observed} parcours observés relient {who} à cet environnement — "
        "chemin partenaire à qualifier."
    )
    if strong:
        label = "Chemin partenaire documenté — preuve forte, à qualifier"
        label_key = "axes.pathStrong"
    else:
        label = "Chemin partenaire émergent — preuve intermédiaire, à qualifier"
        label_key = "axes.pathIntermediate"
    return _axis("path", label, points, evidence, label_key=label_key, label_params={"count": paths_observed})


def addressability_for_company(
    company: Mapping[str, Any],
    profile: Mapping[str, Any],
    signals: Sequence[Mapping[str, Any]],
    barrier: Mapping[str, Any] | None = None,
    *,
    crm_presence: str | None = None,
    market_paths_observed: int | None = None,
    market_top_esn: str | None = None,
    # #2298.4 — les quatre sources AJOUTÉES à la relation, dans l'ordre du
    # retour de Louis. Voir le docstring de `_relation_axis`.
    missions_count: int | None = None,
    last_meeting_at: str | None = None,
    last_email_at: str | None = None,
    human_correction: str | None = None,
) -> dict[str, Any]:
    """L'adressabilité d'un candidat de Découvrir OU d'un compte du portefeuille.

    « INTÉRÊT 68/80 · ADRESSABILITÉ 17/20 » dit « parfait, et indisponible
    jusqu'en novembre ». Un 61 unique ne dit rien, et c'est pourtant ce compte
    qui sortirait en tête de liste — c'est le second nombre, et il ne se fond
    JAMAIS dans le premier (§6.4).

    UN SEUL axe sur cinq reste, par REFUS, hors de portée de ce calcul :

    * ``access_cost`` — **refus assumé** (D60). Le coût d'accès se DÉCLARE dans
      l'onglet Accès, il ne s'estime jamais, et il ne s'agrège jamais entre
      espaces : les espaces sont des ESN, donc des concurrents, et ce serait un
      échange d'informations tarifaires (GA-43).

    Les deux autres ont chacun BOUGÉ, à un an d'écart, et pour la MÊME raison —
    un ingrédient qui n'était pas transporté jusqu'ici l'est devenu :

    * ``relation`` est mesuré depuis #1631.5 dès que la couche zéro a VRAIMENT
      retrouvé le compte — voir :func:`_relation_axis`. Sur un candidat de
      Découvrir il ne l'est jamais : un prospect qu'on découvre n'est, par
      définition, pas dans le CRM.
    * ``path`` (lot 13, #1631.3/.4/.5) est CALCULÉ depuis le lot 13, et CÂBLÉ
      depuis le lot 14 (#1631.3/.4, #1606.2) — voir :func:`_path_axis`. Phase 1
      (``phase1_research.py``, compte du portefeuille) transmet désormais
      ``market_paths_observed`` / ``market_top_esn``, résolus côté API par
      ``MarketMemoryService.pathAxisFor`` (la SEULE porte vers ses tables
      partagées, GA-258) et threadés par ``AnalysisService`` /
      ``AnalysisOnDemandService`` / ``AnalysisWorker`` / ``IaClient``. ⚠️ Reste
      NON câblé, et ce n'est pas un oubli : DÉCOUVRIR (candidat, pas encore un
      compte) — voir le commentaire au-dessus de ``_AXIS_LOCK``. Sur ce second
      chemin (défaut ``None``), l'axe reste NOMMÉ dans ``unmeasured`` — jamais
      un ``0``.

    Les axes non mesurés sont NOMMÉS plutôt que tus : sans quoi un 11/11 se
    lirait comme un 11/20.

    #1579 — PUBLIQUE (pas de `_`) depuis que Phase 1 (`phase1_research.py`)
    l'appelle aussi, pour persister `raw_analysis.addressability` de la même
    manière que `access_barrier` (`app.services.access_scoring.barrier_for_company`,
    qui documente déjà « la barrière d'un candidat de Découvrir OU d'un compte
    analysé » — le même principe). Une SEULE dérivation : Découvrir et Comptes
    lisent alors la MÊME vérité, jamais deux calculs qui pourraient diverger.
    """
    factors: list[dict[str, Any]] = []
    lock = _lock_axis(signals, barrier)
    if lock is not None:
        factors.append(lock)
    proportion = _proportion_axis(company, profile)
    if proportion is not None:
        factors.append(proportion)
    # Lot 13 (#1631.3/.4/.5) — l'axe CHEMIN. Même discipline que la relation
    # juste en dessous : `None` (pas d'ingrédient, ou compte de parcours sous
    # le seuil transverse) n'ajoute AUCUN facteur, l'axe reste NOMMÉ dans
    # `unmeasured` et son plafond hors du dénominateur. Un `_axis(..., 0, ...)`
    # ici ferait baisser l'adressabilité de tout compte que la mémoire marché
    # n'a simplement pas encore vu. Garde GA-272.
    path = _path_axis(market_paths_observed, market_top_esn)
    if path is not None:
        factors.append(path)
    # #1631.5, étendu #2298.4 — l'axe RELATION, maintenant à PLUSIEURS sources
    # (CRM, missions, agenda, e-mails, correction humaine). Aucune source
    # réelle n'ajoute AUCUN facteur : l'axe reste dans `unmeasured` et son
    # plafond hors du dénominateur, exactement comme le verrou sans trace
    # publique. C'est ici que se joue « non mesuré n'est pas mesuré à zéro » —
    # un `_axis(..., 0, ...)` à la place de ce `if` ferait baisser
    # l'adressabilité de tout compte dont aucune intégration n'est connectée.
    # Garde GA-272.
    relation = _relation_axis(
        crm_presence,
        missions_count=missions_count,
        last_meeting_at=last_meeting_at,
        last_email_at=last_email_at,
        human_correction=human_correction,
    )
    if relation is not None:
        factors.append(relation)

    measured = {factor["axis"] for factor in factors}
    unmeasured = [axis for axis, _max in _ADDRESSABILITY_AXES if axis not in measured]
    maximum = sum(cap for axis, cap in _ADDRESSABILITY_AXES if axis in measured)
    return {
        "score": sum(factor["points"] for factor in factors) if maximum else None,
        "max": maximum,
        "unmeasured": unmeasured,
        "factors": factors,
    }


def _capped(factors: list[dict[str, Any]], maximum: int, block: str) -> list[dict[str, Any]]:
    """Rabote le dernier facteur d'un bloc pour respecter son plafond, afin que
    l'invariant « score = somme des facteurs » tienne toujours.

    Estampille aussi chaque facteur de la clé de son bloc. C'est ici et nulle
    part ailleurs : le plafond et la clé sont la même information vue de deux
    côtés, et les séparer les ferait diverger au premier bloc ajouté.
    """
    total = 0
    kept: list[dict[str, Any]] = []
    for factor in factors:
        room = maximum - total
        if room <= 0:
            break
        points = min(factor["points"], room)
        total += points
        kept.append({**factor, "points": points, "block": block})
    return kept


# ── Mesurabilité ────────────────────────────────────────────────────────────
#
# « Non mesuré » et « mesuré à zéro » sont deux affirmations DIFFÉRENTES, et
# c'est la distinction que le score raté rendait impossible : un candidat sans
# aucun critère évaluable sortait à « 0/100 », strictement indiscernable d'un
# candidat évalué sur tout et correspondant à rien.
#
# Un bloc est MESURABLE quand les deux côtés de la comparaison existent : une
# donnée sur le candidat ET un critère (filtre d'écran ou profil vendeur) à quoi
# la comparer. Sinon il est déclaré `unmeasured` et son plafond quitte le
# dénominateur — on ne prétend pas avoir noté ce qu'on n'a pas pu regarder.

#: Plafond de chaque bloc, dans l'ordre d'affichage. La somme fait 100.
_BLOCK_MAXIMA: tuple[tuple[str, int], ...] = (
    ("activity", _MAX_ACTIVITY),
    ("geography", _MAX_GEO),
    ("headcount", _MAX_HEADCOUNT),
    ("age", _POINTS_AGE),
    ("it_surface", _MAX_IT_SURFACE),
    ("signals", _MAX_SIGNALS),
    ("accessibility", _MAX_ACCESSIBILITY),
    ("evidence", _MAX_EVIDENCE),
)


def _activity_measurable(company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
    """Comparable si un code NAF est demandé ET publié, ou si le profil nomme des
    secteurs cibles ET le registre un libellé d'activité."""
    if _text(company.get("nafCode")) and _requested_naf_codes(filters):
        return True
    return bool(_str_list(profile.get("sectors")) and _text(company.get("sector")))


def _geo_measurable(company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
    department = _department_of(company)
    city = _text(company.get("city"))
    if _requested_departments(filters) and department:
        return True
    if _text(filters.get("city")) and city:
        return True
    # Une zone OUVERTE (« National ») n'exprime aucune restriction : elle ne peut
    # pas discriminer, le bloc n'est donc pas mesurable — pas « mesuré à zéro ».
    zones = [zone.strip() for zone in _text(profile.get("geoZone")).split(",") if zone.strip()]
    restrictive = [zone for zone in zones if not any(open_ in _normalize(zone) for open_ in _OPEN_ZONES)]
    return bool(restrictive and (department or city))


def _headcount_measurable(company: Mapping[str, Any], profile: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
    if parse_headcount_range(_text(company.get("headcountRange"))) is None:
        return False
    if isinstance(filters.get("headcountMin"), int) or isinstance(filters.get("headcountMax"), int):
        return True
    # Un type d'entreprise ciblé n'est un critère de TAILLE que s'il porte une
    # dimension (« PME (50-500 salariés) ») ; « Secteur public » n'en porte pas.
    return any(_range_for_target_type(target) for target in _str_list(profile.get("targetCompanyTypes")))


def _signals_measurable(signals: Sequence[Mapping[str, Any]]) -> bool:
    """Aucun signal COLLECTÉ ne prouve pas qu'il n'y en a aucun.

    Le chemin registre passe volontairement ``signals=[]`` (les signaux datés
    sont produits par ``/discover/signals``) : c'est une absence de mesure, pas
    un « ce compte ne bouge pas ». En revanche des signaux réellement collectés
    mais tous archivés SONT une mesure — et une information.
    """
    return bool(signals)


def _age_measurable(company: Mapping[str, Any]) -> bool:
    return _parse_date(company.get("creationDate")) is not None


# ── API publique ────────────────────────────────────────────────────────────


def data_confidence(
    company: Mapping[str, Any],
    *,
    signals: Sequence[Mapping[str, Any]] = (),
    degraded: Sequence[Mapping[str, Any]] = (),
    now: date | None = None,
) -> int:
    """Axe 2 — à quel point la donnée sous-jacente est SÛRE, sur 0-100.

    Distinct du score commercial (règle de :mod:`app.services.score_axes`) : un
    candidat peut être parfaitement connu et mal noté, ou l'inverse. Se dégrade
    sur trois causes réelles, jamais sur une impression :

    - identité non résolue (pas de SIREN) — le fait le plus structurant ;
    - champs registre manquants ;
    - source injoignable (``degraded[]``) ou photo entièrement archivée.
    """
    today = now or date.today()
    score = 40 if _text(company.get("siren")) else 0
    fields = ("nafCode", "sector", "city", "department", "headcountRange", "creationDate")
    filled = sum(1 for field in fields if _text(company.get(field)))
    score += round(60 * filled / len(fields))
    # Toute source en panne retire de la confiance : on en sait objectivement
    # moins. Jamais masqué (le contrat l'expose aussi dans `degraded[]`).
    score -= 10 * len([item for item in degraded if isinstance(item, Mapping)])
    # Des signaux tous archivés = une photo périmée.
    dated = [date_ for date_ in (_parse_date(s.get("date")) for s in signals if isinstance(s, Mapping)) if date_]
    if dated and all(_freshness(signal_date, today) == 0.0 for signal_date in dated):
        score -= 10
    return max(0, min(100, score))


def score_candidate(
    company: Mapping[str, Any],
    *,
    profile: Mapping[str, Any] | None = None,
    filters: Mapping[str, Any] | None = None,
    signals: Sequence[Mapping[str, Any]] | None = None,
    degraded: Sequence[Mapping[str, Any]] | None = None,
    now: date | None = None,
) -> dict[str, Any]:
    """Score 0-100 d'un candidat registre + la liste des facteurs qui le portent.

    Fonction **pure** : aucun réseau, aucun LLM, aucun aléa. Deux appels avec les
    mêmes entrées rendent le même résultat.

    :param company: ligne registre (``name``, ``siren``, ``nafCode``, ``sector``,
        ``city``, ``department``, ``headcountRange``, ``creationDate``).
    :param profile: profil ESN vendeur (``sectors``, ``geoZone``,
        ``targetCompanyTypes``…), résolu server-side par l'API.
    :param filters: critères normalisés réellement appliqués à la recherche.
    :param signals: signaux datés déjà collectés pour ce candidat.
    :param degraded: sources en panne — n'affecte QUE la confiance donnée, jamais
        le score commercial (une source HS ne rend pas un compte moins pertinent).
    :param now: date de référence, injectable pour des tests déterministes.

    :returns: ``{"score": int | None, "scoreMax": int, "unmeasured": [str],
        "factors": [{label, points, evidence}], "dataConfidence": int}``.

        Invariants : ``score == sum(f["points"])`` (aucun résidu inexpliqué) et
        ``score <= scoreMax <= 100``. ``score`` vaut ``None`` — et ``scoreMax``
        0 — quand AUCUN critère n'était évaluable : « indisponible » est la
        réponse honnête, « 0/100 » serait une mesure inventée.
    """
    today = now or date.today()
    profile = profile or {}
    filters = filters or {}
    signals = list(signals or [])

    confidence = data_confidence(company, signals=signals, degraded=degraded or (), now=today)
    barrier = barrier_for_company(company, signals=signals, now=today)

    factors: list[dict[str, Any]] = [
        *_capped(_activity_factors(company, profile, filters), _MAX_ACTIVITY, "activity"),
        *_capped(_geo_factors(company, profile, filters), _MAX_GEO, "geography"),
        *_capped(_headcount_factors(company, profile, filters, today), _MAX_HEADCOUNT, "headcount"),
        *_capped(_age_factors(company, filters, today), _POINTS_AGE, "age"),
        *_capped(_it_surface_factors(company, signals, profile), _MAX_IT_SURFACE, "it_surface"),
        *_capped(_signal_factors(signals, today), _MAX_SIGNALS, "signals"),
        *_capped(_evidence_factors(confidence), _MAX_EVIDENCE, "evidence"),
    ]

    measurable = {
        "activity": _activity_measurable(company, profile, filters),
        "geography": _geo_measurable(company, profile, filters),
        "headcount": _headcount_measurable(company, profile, filters),
        "age": _age_measurable(company),
        "it_surface": _it_surface_measurable(company, signals),
        "signals": _signals_measurable(signals),
        # Non mesurable au stade registre : on ne connaît aucun interlocuteur à
        # ce moment-là. Le déclarer non mesuré retire son plafond du dénominateur
        # — un « 0 sur 20 » ferait croire que le compte est inatteignable, alors
        # qu'on n'a simplement pas encore cherché.
        "accessibility": False,
        "evidence": bool(_text(company.get("siren"))),
    }
    unmeasured = [block for block, _max in _BLOCK_MAXIMA if not measurable[block]]
    score_max = sum(maximum for block, maximum in _BLOCK_MAXIMA if measurable[block])
    score = min(DISCOVER_SCORE_MAX, sum(factor["points"] for factor in factors))

    return {
        # Rien de mesurable → rien à annoncer. Le contrat accepte `null` pour que
        # l'UI puisse écrire « score indisponible » plutôt qu'un faux zéro.
        "score": score if score_max else None,
        "scoreMax": score_max,
        "unmeasured": unmeasured,
        "factors": factors,
        "dataConfidence": confidence,
        # Le SECOND nombre. Il vit à part et n'entre dans aucune somme : c'est
        # structurellement ce qui l'empêche de se fondre dans le premier.
        "addressability": addressability_for_company(company, profile, signals, barrier),
        # Le TROISIÈME nombre, et il ne se fond pas davantage dans les deux
        # autres : la barrière d'ACHAT (tome 3). L'adressabilité dit « peux-tu
        # entrer » ; la barrière dit « cette organisation sait-elle acheter à
        # quelqu'un comme toi ». Un compte peut être parfaitement accessible et
        # totalement verrouillé — c'est le terrain qui l'a montré (D71).
        "barrier": barrier,
    }
