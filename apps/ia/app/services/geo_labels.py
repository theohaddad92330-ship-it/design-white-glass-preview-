"""#2547 / #2533 (recette prod 07/10) — un code INSEE ne s'affiche jamais brut.

Laura écrivait « Région : 27 » dans l'axe d'une carte de classement : le code
que le registre comprend, jamais ce qu'un commercial lit. Ce module rend le
LIBELLÉ d'une région ou d'un département, pour tout texte ou carte de Laura.

Les régions viennent de la table déjà tenue par la lecture de demande Découvrir
(`discover_request_reading._REGIONS`) — un réglage vit à un seul endroit
(GA-26). Les départements (101, stables depuis 2011 — Mayotte) sont figés ici :
ce n'est pas un référentiel mouvant comme les communes (`geo_communes.py`).

Un code inconnu est rendu TEL QUEL, jamais remplacé par un libellé deviné.
"""

from __future__ import annotations

from app.services.discover_request_reading import _REGIONS

_REGION_LABELS: dict[str, str] = {code: label for _, code, label in _REGIONS}

_DEPARTMENT_LABELS: dict[str, str] = {
    "01": "Ain",
    "02": "Aisne",
    "03": "Allier",
    "04": "Alpes-de-Haute-Provence",
    "05": "Hautes-Alpes",
    "06": "Alpes-Maritimes",
    "07": "Ardèche",
    "08": "Ardennes",
    "09": "Ariège",
    "10": "Aube",
    "11": "Aude",
    "12": "Aveyron",
    "13": "Bouches-du-Rhône",
    "14": "Calvados",
    "15": "Cantal",
    "16": "Charente",
    "17": "Charente-Maritime",
    "18": "Cher",
    "19": "Corrèze",
    "2A": "Corse-du-Sud",
    "2B": "Haute-Corse",
    "21": "Côte-d'Or",
    "22": "Côtes-d'Armor",
    "23": "Creuse",
    "24": "Dordogne",
    "25": "Doubs",
    "26": "Drôme",
    "27": "Eure",
    "28": "Eure-et-Loir",
    "29": "Finistère",
    "30": "Gard",
    "31": "Haute-Garonne",
    "32": "Gers",
    "33": "Gironde",
    "34": "Hérault",
    "35": "Ille-et-Vilaine",
    "36": "Indre",
    "37": "Indre-et-Loire",
    "38": "Isère",
    "39": "Jura",
    "40": "Landes",
    "41": "Loir-et-Cher",
    "42": "Loire",
    "43": "Haute-Loire",
    "44": "Loire-Atlantique",
    "45": "Loiret",
    "46": "Lot",
    "47": "Lot-et-Garonne",
    "48": "Lozère",
    "49": "Maine-et-Loire",
    "50": "Manche",
    "51": "Marne",
    "52": "Haute-Marne",
    "53": "Mayenne",
    "54": "Meurthe-et-Moselle",
    "55": "Meuse",
    "56": "Morbihan",
    "57": "Moselle",
    "58": "Nièvre",
    "59": "Nord",
    "60": "Oise",
    "61": "Orne",
    "62": "Pas-de-Calais",
    "63": "Puy-de-Dôme",
    "64": "Pyrénées-Atlantiques",
    "65": "Hautes-Pyrénées",
    "66": "Pyrénées-Orientales",
    "67": "Bas-Rhin",
    "68": "Haut-Rhin",
    "69": "Rhône",
    "70": "Haute-Saône",
    "71": "Saône-et-Loire",
    "72": "Sarthe",
    "73": "Savoie",
    "74": "Haute-Savoie",
    "75": "Paris",
    "76": "Seine-Maritime",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "79": "Deux-Sèvres",
    "80": "Somme",
    "81": "Tarn",
    "82": "Tarn-et-Garonne",
    "83": "Var",
    "84": "Vaucluse",
    "85": "Vendée",
    "86": "Vienne",
    "87": "Haute-Vienne",
    "88": "Vosges",
    "89": "Yonne",
    "90": "Territoire de Belfort",
    "91": "Essonne",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
    "971": "Guadeloupe",
    "972": "Martinique",
    "973": "Guyane",
    "974": "La Réunion",
    "976": "Mayotte",
}


def region_label(code: str) -> str:
    """Le nom d'une région depuis son code INSEE ; un code inconnu reste tel quel."""
    key = (code or "").strip()
    return _REGION_LABELS.get(key, key)


def department_label(code: str) -> str:
    """« Côte-d'Or (21) » depuis « 21 » ; une liste « 21,25 » est nommée élément par élément.

    Le code reste entre parenthèses : c'est ce qu'un commercial recoupe avec un
    code postal. Un code inconnu reste tel quel, jamais un nom deviné.
    """
    parts = [part.strip().upper() for part in (code or "").split(",") if part.strip()]
    labelled = [f"{_DEPARTMENT_LABELS[part]} ({part})" if part in _DEPARTMENT_LABELS else part for part in parts]
    return ", ".join(labelled)


def department_code_for_label(label: object) -> str | None:
    """#4419.5 — « Nord » → « 59 » (casse, accents et tirets pliés). Un nom inconnu ne devine rien : ``None``."""
    return _DEPARTMENT_BY_FOLDED_LABEL.get(_fold_place(label))


def _fold_place(value: object) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower().replace("œ", "oe").replace("æ", "ae")
    return " ".join("".join(ch if ch.isalnum() else " " for ch in text).split())


def same_place(left: object, right: object) -> bool:
    """« SAINT-ETIENNE » et « Saint Étienne » sont le même lieu (accents, casse, ponctuation ignorés). Vide : jamais."""
    folded = _fold_place(left)
    return bool(folded) and folded == _fold_place(right)


_DEPARTMENT_BY_FOLDED_LABEL: dict[str, str] = {_fold_place(label): code for code, label in _DEPARTMENT_LABELS.items()}


def department_name(code: str | None) -> str | None:
    """#4429.2 — le NOM seul d'un département (« Haute-Garonne »), ou ``None`` pour un code inconnu."""
    return _DEPARTMENT_LABELS.get((code or "").strip().upper())


#: #3769.2 — les départements d'outre-mer, par code de région INSEE (la table
#: métropolitaine vit dans `discover_scoring._REGION_DEPARTMENTS`, GA-26).
_OVERSEAS_REGION_DEPARTMENTS: dict[str, tuple[str, ...]] = {
    "01": ("971",),
    "02": ("972",),
    "03": ("973",),
    "04": ("974",),
    "06": ("976",),
}


def region_departments(code: str) -> frozenset[str]:
    """#3769.2 — les codes département d'une région (code INSEE), ou un ensemble
    VIDE pour un code inconnu — jamais une région devinée. La Corse rend aussi
    2A/2B, la forme que donne un code postal (`department_from_postal_code`)."""
    from app.services.discover_scoring import _REGION_DEPARTMENTS

    key = (code or "").strip()
    if key in _OVERSEAS_REGION_DEPARTMENTS:
        return frozenset(_OVERSEAS_REGION_DEPARTMENTS[key])
    words = next((w for w, c, _ in _REGIONS if c == key), None)
    departments = set(_REGION_DEPARTMENTS.get(" ".join(words), ())) if words else set()
    if "20" in departments:
        departments |= {"2A", "2B"}
    return frozenset(departments)


#: LUD.2 / LUD.6 bis — les villes dont on sait la couverture départementale (une ville absente d'ici ne devine
#: rien). Un seul endroit : la moisson de signaux et la préférence de zone des contacts le lisent tous les deux.
#: KEVIN-FIX K.6 — « Lille » se rattachait à rien : Laura demandait un département pour une ville connue. Les
#: grandes villes sont ici (clé pliée : minuscules, sans accent, tirets en espaces), une ville absente ne devine rien.
CITY_DEPARTMENTS: dict[str, tuple[str, ...]] = {
    "lyon": ("69",),
    "villeurbanne": ("69",),
    "lille": ("59",),
    "roubaix": ("59",),
    "tourcoing": ("59",),
    "villeneuve d ascq": ("59",),
    "paris": ("75",),
    "nanterre": ("92",),
    "boulogne billancourt": ("92",),
    "courbevoie": ("92",),
    "issy les moulineaux": ("92",),
    "marseille": ("13",),
    "aix en provence": ("13",),
    "toulouse": ("31",),
    "nantes": ("44",),
    "bordeaux": ("33",),
    "strasbourg": ("67",),
    "rennes": ("35",),
    "montpellier": ("34",),
    "nice": ("06",),
    "grenoble": ("38",),
    "rouen": ("76",),
    "le havre": ("76",),
    "dijon": ("21",),
    "angers": ("49",),
    "nancy": ("54",),
    "metz": ("57",),
    "tours": ("37",),
    "clermont ferrand": ("63",),
    "reims": ("51",),
    "saint etienne": ("42",),
    "toulon": ("83",),
    "orleans": ("45",),
    "caen": ("14",),
    "brest": ("29",),
    "amiens": ("80",),
    "limoges": ("87",),
    "poitiers": ("86",),
    # #4419.5 — les communes que les offres des Hauts-de-France citent le plus (lieux tronqués « Marcq-en-Barœul, Hauts-de- »).
    "marcq en baroeul": ("59",),
    "la madeleine": ("59",),
    "lambersart": ("59",),
    "wasquehal": ("59",),
    "mons en baroeul": ("59",),
    "croix": ("59",),
    "ronchin": ("59",),
    "loos": ("59",),
    "lezennes": ("59",),
    "seclin": ("59",),
    "douai": ("59",),
    "valenciennes": ("59",),
    "dunkerque": ("59",),
    "cambrai": ("59",),
    "arras": ("62",),
    "lens": ("62",),
    "calais": ("62",),
    "boulogne sur mer": ("62",),
}


def region_of_department(code: object) -> str | None:
    """Lot 757 — le NOM de la région d'un département (« 59 » → « Hauts-de-France »), lu sur la même table que
    :func:`region_departments` (GA-26). Un code inconnu ou vide ne devine rien : ``None``."""
    key = str(code or "").strip().upper()
    if not key:
        return None
    for region_code in dict.fromkeys(c for _, c, _ in _REGIONS):
        if key in region_departments(region_code):
            return region_label(region_code)
    return None
