"""#3901 — l'EMPLOYEUR d'une offre est-il le compte analysé ?

France Travail et WTTJ ne filtrent pas par employeur et APEC filtrait par
sous-chaîne : « Still » (industriel) ramassait les offres de la commune de Still.
Doctrine : jamais de donnée non attribuée — une offre dont l'employeur est absent
ou différent est ÉCARTÉE, jamais rattachée « au cas où ».
"""

from __future__ import annotations

import re
import unicodedata

#: Formes juridiques et mots d'enseigne retirés avant comparaison.
_LEGAL = frozenset(
    {"sas", "sa", "sarl", "sasu", "eurl", "snc", "gie", "groupe", "holding", "france", "se"}
    # #3915.a — formes étrangères lues sur les ATS publics (Personio, Workable…).
    | {"gmbh", "ag", "ltd", "limited", "inc", "llc", "bv", "nv", "plc", "srl", "spa"}
)
#: Articles ignorés.
_STOP = frozenset({"de", "du", "des", "la", "le", "les", "d", "l", "et"})
#: Seuls mots admis dans le RESTE d'un nom plus long (préfixe/suffixe complet).
_GENERIC = frozenset({"international", "group", "intl"})

_COLLECTIVITE_RE = re.compile(
    r"\b(?:mairie|commune|communes|communaute|communautes|departement|departements|region|regions|"
    r"syndicat|ccas|ville de|centre communal|conseil departemental)\b"
)


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower().replace(".", "")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def brand_name(company: object) -> str:
    """GROUPE-FRANCE (16/10) — la MARQUE seule : les mots du nom sans forme juridique, pays
    (« France ») ni article, casse gardée (« DECATHLON FRANCE SAS » → « DECATHLON »). Jamais un
    mot tronqué : « Orange Business Services » reste entier. Vide si rien ne reste."""
    return " ".join(w for w in str(company or "").split() if _fold(w) not in _LEGAL | _STOP and _fold(w))


def is_collectivite(name: object) -> bool:
    return bool(_COLLECTIVITE_RE.search(_fold(name)))


def _tokens(name: object) -> list[str]:
    return [t for t in _fold(name).split() if t not in _LEGAL and t not in _STOP]


def _siren(value: object) -> str | None:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[:9] if len(digits) in (9, 14) else None


def same_employer(
    employer_name: object,
    company_name: object,
    *,
    employer_siren: object = None,
    company_siren: object = None,
) -> bool:
    """Vrai si ``employer_name`` (celui de l'offre) est le compte ``company_name``.

    Un SIREN/SIRET des deux côtés prime sur le nom. Sinon : égalité du jeu de
    mots significatifs, ou l'un est préfixe/suffixe COMPLET de l'autre et le
    reste n'est que du générique (International, Group). Une collectivité n'est
    jamais l'employeur d'une société privée.
    """
    e_siren, c_siren = _siren(employer_siren), _siren(company_siren)
    if e_siren and c_siren:
        return e_siren == c_siren

    emp, comp = _tokens(employer_name), _tokens(company_name)
    if not emp or not comp:
        return False
    if is_collectivite(employer_name) and not is_collectivite(company_name):
        return False
    if sorted(emp) == sorted(comp):
        return True
    short, long_ = (emp, comp) if len(emp) <= len(comp) else (comp, emp)
    if len(short) == len(long_):
        return False
    rest = long_[len(short):] if long_[: len(short)] == short else (
        long_[: len(long_) - len(short)] if long_[len(long_) - len(short):] == short else None
    )
    return rest is not None and all(t in _GENERIC for t in rest)


#: DECATHLON 11/10 — mots qui nomment une SUBDIVISION d'un groupe (métier
#: interne, canal, zone), jamais une activité tierce : « Decathlon Digital »,
#: « DECATHLON Logistics & Supply chain » sont Decathlon ; « Decathlon
#: Plomberie », « Orange Business », « Renault Trucks » ne le deviennent pas.
#: Liste FERMÉE : un mot absent ici laisse l'offre écartée (doctrine : mieux
#: vaut un onglet plus court qu'un signal faux).
_SUBDIVISION = frozenset(
    {"digital", "united", "numerique", "tech", "technology", "technologies", "it"}
    | {"logistics", "logistic", "logistique", "supply", "chain"}
    | {"retail", "store", "stores", "magasin", "magasins", "ecommerce", "online"}
    | {"international", "intl", "group", "europe", "corporate", "operations"}
)
#: Une racine trop courte (« Cap », « Still ») est un homonyme probable : la
#: règle de subdivision ne s'y applique pas (seuls nom exact, entité connue ou SIREN).
_MIN_GROUP_ROOT_CHARS = 6


def _subdivision_of(employer_name: object, company_name: object) -> bool:
    """DECATHLON 11/10 — ``employer_name`` = racine du compte + subdivision(s) nommée(s)."""
    emp, comp = _tokens(employer_name), _tokens(company_name)
    comp = [t for t in comp if t not in _GENERIC]
    if not emp or not comp or len("".join(comp)) < _MIN_GROUP_ROOT_CHARS:
        return False
    if is_collectivite(employer_name) and not is_collectivite(company_name):
        return False
    rest = emp[len(comp):]
    return emp[: len(comp)] == comp and bool(rest) and all(t in _SUBDIVISION for t in rest)


def same_group_employer(
    employer_name: object,
    company_name: object,
    *,
    employer_siren: object = None,
    company_siren: object = None,
    known_names: object = (),
    known_sirens: object = (),
) -> bool:
    """DECATHLON 11/10 — ``employer_name`` appartient-il au GROUPE ``company_name`` ?

    Une offre est rattachée sur PREUVE, jamais deviné :

    1. SIREN de l'employeur = celui du compte, ou d'une entité CONNUE du groupe ;
    2. nom d'une entité CONNUE du groupe (filiale, marque, raison sociale) ;
    3. racine du compte + subdivision nommée (``_SUBDIVISION``), racine ≥ 6 lettres ;
    4. sinon la règle stricte :func:`same_employer` — dont « SIREN différent sur
       un nom identique = homonyme ».
    """
    e_siren, c_siren = _siren(employer_siren), _siren(company_siren)
    group_sirens = {s for s in (_siren(x) for x in (known_sirens or ())) if s}
    if e_siren and (e_siren == c_siren or e_siren in group_sirens):
        return True
    if is_collectivite(employer_name) and not is_collectivite(company_name):
        return False
    names = [n for n in (known_names or ()) if n]
    if any(same_employer(employer_name, n) for n in names):
        return True
    if _subdivision_of(employer_name, company_name):
        return True
    return same_employer(employer_name, company_name, employer_siren=employer_siren, company_siren=company_siren)


class EmployerScope:
    """DECATHLON 11/10 — ce qu'on SAIT du groupe d'un compte, pour rattacher ses offres.

    Construit une fois par analyse (nom tapé, SIREN d'ancrage, entités du groupe
    lues au registre) et passé aux sources d'offres. ``fingerprint`` sert de clé
    de cache : deux connaissances différentes ne partagent pas un résultat filtré."""

    __slots__ = ("company", "siren", "known_names", "known_sirens", "siren_names")

    def __init__(
        self,
        company: str,
        siren: str | None,
        known_names: tuple[str, ...],
        known_sirens: tuple[str, ...],
        siren_names: tuple[str, ...] = (),
    ):
        self.company = company
        self.siren = siren
        self.known_names = known_names
        self.known_sirens = known_sirens
        #: CACHE-SOURCES (15/10) — les noms du groupe dont le registre donne AUSSI le SIREN :
        #: les seuls qu'une source payée à l'offre a le droit de nommer dans sa requête
        #: (un nom deviné — GIE, immobilier — ferait payer des offres jetées ensuite).
        self.siren_names = siren_names

    @classmethod
    def build(
        cls,
        company: object,
        *,
        siren: object = None,
        known_names: object = (),
        known_sirens: object = (),
        siren_names: object = (),
    ) -> EmployerScope:
        names = tuple(sorted({" ".join(str(n).split()) for n in (known_names or ()) if n and str(n).strip()}))
        sirens = tuple(sorted({s for s in (_siren(x) for x in (known_sirens or ())) if s}))
        proven = tuple(sorted({" ".join(str(n).split()) for n in (siren_names or ()) if n and str(n).strip()}))
        return cls(" ".join(str(company or "").split()), _siren(siren), names, sirens, proven)

    @classmethod
    def from_registry(cls, company: object, *, siren: object = None, profile: object = None) -> EmployerScope:
        """Le groupe du compte tel que le REGISTRE le décrit (fiche Pappers déjà
        collectée par l'analyse) : raison sociale, nom commercial, filiales et
        leurs SIREN. Fiche absente ou illisible ⇒ seul le nom et l'ancre comptent."""
        names: list[object] = []
        sirens: list[object] = []
        proven: list[object] = []
        if profile is not None:
            try:
                own = [getattr(profile, "legal_name", None), getattr(profile, "commercial_name", None)]
                names += own
                sirens.append(getattr(profile, "siren", None))
                if _siren(getattr(profile, "siren", None)):
                    proven += own
                for sub in list(getattr(profile, "subsidiaries", None) or []):
                    names.append(getattr(sub, "name", None))
                    sirens.append(getattr(sub, "siren", None))
                    if _siren(getattr(sub, "siren", None)):
                        proven.append(getattr(sub, "name", None))
            except TypeError:  # fiche inattendue : on n'invente rien
                names, sirens, proven = [], [], []
        names = [n for n in names if isinstance(n, str)]
        sirens = [s for s in sirens if isinstance(s, str)]
        proven = [n for n in proven if isinstance(n, str)]
        return cls.build(company, siren=siren, known_names=names, known_sirens=sirens, siren_names=proven)

    def matches(self, employer_name: object, *, employer_siren: object = None) -> bool:
        return same_group_employer(
            employer_name,
            self.company,
            employer_siren=employer_siren,
            company_siren=self.siren,
            known_names=self.known_names,
            known_sirens=self.known_sirens,
        )

    def fingerprint(self) -> str:
        return "|".join(
            [_fold(self.company), self.siren or "", ",".join(_fold(n) for n in self.known_names), ",".join(self.known_sirens)]
        )


def _case_tokens(text: object) -> list[str]:
    """Mots du texte, accents retirés mais CASSE GARDÉE (une majuscule marque un nom propre)."""
    raw = unicodedata.normalize("NFD", str(text or ""))
    raw = "".join(c for c in raw if unicodedata.category(c) != "Mn").replace(".", "")
    return re.sub(r"[^A-Za-z0-9]+", " ", raw).split()


def named_in_text(text: object, company_name: object) -> bool:
    """#3915.a — le texte (article de presse) NOMME-t-il le compte ``company_name`` ?

    Même contrôle que les offres : on cherche les mots significatifs du compte
    (sans forme juridique ni générique), on prolonge par les mots à majuscule qui
    suivent — le nom propre réellement écrit (« Renault Trucks ») — puis ce nom
    passe par :func:`same_employer`. « Renault » ne rattache donc jamais un article
    sur « Renault Trucks » ; « Groupe Renault » ou « Acme Group » restent le compte.
    """
    needle = [t for t in _tokens(company_name) if t not in _GENERIC]
    words = _case_tokens(text)
    if not needle or not words:
        return False
    folded = [w.lower() for w in words]
    significant = [i for i, w in enumerate(folded) if w not in _LEGAL and w not in _STOP]
    n = len(needle)
    for k in range(len(significant) - n + 1):
        idx = significant[k : k + n]
        if [folded[i] for i in idx] != needle or idx[-1] - idx[0] >= 2 * n:
            continue
        end = idx[-1] + 1
        while end < len(words) and words[end][0].isupper():
            end += 1
        if same_employer(" ".join(words[idx[0] : end]), company_name):
            return True
    return False
