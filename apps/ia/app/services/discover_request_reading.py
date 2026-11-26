"""#2490 / #2496 — LIRE une demande Découvrir écrite en langage naturel.

Mesuré en production le 17/09/2026 : « ESN spécialisées cybersécurité à
Toulouse » rendait CARGLASS, l'ANPAA, APF France Handicap, BNP Paribas et le
CNRS. Aucune étape ne lisait la demande : la phrase entière partait dans le
plein-texte du registre (``q``), qui la compare aux NOMS et aux ADRESSES de tous
les établissements — les grands réseaux nationaux, présents partout, arrivaient
en tête. Le retour de Louis (#2490) : « il me sort très souvent des boîtes qui
ne collent pas ».

Ce module lit la demande de façon DÉTERMINISTE, sans réseau et sans modèle :

* le TYPE d'entreprise — « ESN », « SSII », « société de conseil », le
  numérique, la cybersécurité — devient les codes NAF d'une ESN, par la
  convention du dépôt (:data:`app.services.esn_naf.ESN_NAF_CODES`) ;
* un mot de SECTEUR devient les codes du secteur d'application qu'il désigne,
  par la table existante (:mod:`app.services.application_sector_naf`) et la
  règle de préfixe déjà en vigueur (« aéronautique » ↔ « Aéronautique &
  spatial », voir :mod:`app.services.profile_sector_orientation`) ;
* le LIEU : un code postal, un numéro de département, une région (table
  ci-dessous) se lisent tels quels ; une VILLE n'est jamais devinée ici — le
  texte qui suit « à », « sur », « en »… est rendu comme CANDIDAT, et c'est
  l'appelant qui le fait résoudre par la source officielle (``geo-communes``),
  sous SA part du budget ;
* tout le reste est rendu dans ``leftover`` pour être NOMMÉ comme non appliqué
  — jamais avalé, jamais envoyé en plein-texte.

Pourquoi pas le modèle : la seule étape modèle de la chaîne (l'angle) est déjà
celle qui dépasse le budget en production ; en ajouter une AVANT le registre
prendrait sur la part de la liste à chaque recherche. La lecture déterministe
est instantanée et couvre les demandes mesurées.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.application_sector_naf import naf_codes_for_sectors
from app.services.application_sectors import APPLICATION_SECTOR_LABELS_FR
from app.services.esn_naf import ESN_NAF_CODES
from app.services.text_norm import normalize_name

#: Le code d'activité rendu à l'écran pour « une ESN » — l'écran le traduit.
ESN_ACTIVITY = "esn"

#: Les mots qui désignent une ESN à eux seuls (pliés : minuscules, sans accent).
_ESN_WORDS = frozenset(
    {
        "esn",
        "esns",
        "ssii",
        "informatique",
        "informatiques",
        "numerique",
        "numeriques",
        "digital",
        "digitale",
        "digitales",
        "cyber",
        "cybersecurite",
        "infogerance",
    }
)

#: Les expressions qui désignent une ESN — même convention (`70.22Z` est dans
#: ``ESN_NAF_CODES`` : beaucoup d'ESN y sont immatriculées).
_ESN_PHRASES: tuple[tuple[str, ...], ...] = (
    ("entreprises", "de", "services", "numeriques"),
    ("entreprise", "de", "services", "numeriques"),
    ("societes", "de", "conseil"),
    ("societe", "de", "conseil"),
    ("cabinets", "de", "conseil"),
    ("cabinet", "de", "conseil"),
)

#: Les régions (code INSEE). Dix-huit entrées, inchangées depuis le 01/01/2016 —
#: à la différence des 34 875 communes, qui fusionnent plusieurs fois par an et
#: que ce dépôt refuse de figer (`geo_communes.py`).
_REGIONS: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("ile", "de", "france"), "11", "Île-de-France"),
    (("idf",), "11", "Île-de-France"),
    (("centre", "val", "de", "loire"), "24", "Centre-Val de Loire"),
    (("bourgogne", "franche", "comte"), "27", "Bourgogne-Franche-Comté"),
    (("normandie",), "28", "Normandie"),
    (("hauts", "de", "france"), "32", "Hauts-de-France"),
    (("grand", "est"), "44", "Grand Est"),
    (("pays", "de", "la", "loire"), "52", "Pays de la Loire"),
    (("bretagne",), "53", "Bretagne"),
    (("nouvelle", "aquitaine"), "75", "Nouvelle-Aquitaine"),
    (("occitanie",), "76", "Occitanie"),
    (("auvergne", "rhone", "alpes"), "84", "Auvergne-Rhône-Alpes"),
    (("provence", "alpes", "cote", "d", "azur"), "93", "Provence-Alpes-Côte d'Azur"),
    (("paca",), "93", "Provence-Alpes-Côte d'Azur"),
    (("corse",), "94", "Corse"),
    (("guadeloupe",), "01", "Guadeloupe"),
    (("martinique",), "02", "Martinique"),
    (("guyane",), "03", "Guyane"),
    (("la", "reunion"), "04", "La Réunion"),
    (("mayotte",), "06", "Mayotte"),
)

def region_label(code: str | None) -> str | None:
    """Le nom d'une région à partir de son code INSEE (« 84 » → Auvergne-Rhône-Alpes),
    ou ``None`` — jamais un nom deviné pour un code inconnu."""
    wanted = (code or "").strip()
    return next((label for _words, region_code, label in _REGIONS if region_code == wanted), None) if wanted else None


#: #2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : « qui recrute des
#: développeurs Java à Toulouse » listait « recrute » parmi les mots NON pris
#: en compte, comme un mot totalement illisible. Il EST lu — aucun champ du
#: registre ne sait filtrer sur une intention de recrutement/appel d'offres/
#: attribution (ce n'est pas une activité d'entreprise), donc rien n'est
#: DEVINÉ en filtre — mais un mot compris n'est pas un mot reproché : il est
#: consommé, comme un mot-outil. Même vocabulaire que le mode Besoins
#: (`discover-needs-freetext.ts`, `NATURE_TRIGGERS`) — une lecture cohérente
#: entre les deux modes, pas un second vocabulaire inventé.
#: Clés déjà PLIÉES (minuscules, sans accent) : comparées à `token.folded`,
#: jamais au texte tapé — même convention que `_ESN_WORDS`.
_INTENT_WORDS: dict[str, str] = {
    "recrute": "hiring",
    "recrutent": "hiring",
    "recrutement": "hiring",
    "embauche": "hiring",
    "embauchent": "hiring",
    "embaucher": "hiring",
    "consultation": "tender",
    "attribue": "award",
    "remporte": "award",
    "laureat": "award",
}
_INTENT_PHRASES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("appel", "d", "offres"), "tender"),
    (("marche", "public"), "tender"),
    (("marches", "publics"), "tender"),
)

#: #3512 — le PROFIL recherché par une entreprise qui recrute : un métier et/ou
#: une techno (« développeurs Python »). Prod 01/10 : ces mots, laissés dans
#: ``leftover``, devenaient le NOM d'entreprise filtré → « Aucune entreprise ne
#: correspond ». Ils ne sont lus comme profil QU'AVEC une intention de
#: recrutement : sans elle, « Python Software » reste un nom.
#: Clés déjà PLIÉES (minuscules, sans accent).
_PROFILE_WORDS = frozenset(
    {
        "developpeur", "developpeurs", "developpeuse", "developpeuses", "dev", "devs",
        "ingenieur", "ingenieurs", "ingenieure", "ingenieures", "consultant", "consultants",
        "consultante", "consultantes", "architecte", "architectes", "devops", "testeur",
        "testeurs", "analyste", "analystes", "informaticien", "informaticiens", "profil", "profils",
        "stagiaire", "stagiaires", "alternant", "alternants", "freelance", "freelances",
        "python", "java", "javascript", "typescript", "react", "angular", "vue", "node",
        "php", "golang", "rust", "kotlin", "swift", "scala", "sql", "aws", "azure", "sap",
        "salesforce", "cobol", "kubernetes", "docker", "terraform", "spark", "data",
        "cloud", "fullstack", "backend", "frontend", "mobile", "ia",
    }
)  # fmt: skip

#: #4751 — un INTITULÉ DE POSTE connu, en toutes lettres (« Product Owner à Lille ») : il dit déjà ce que la
#: demande cherche, sans « qui recrute ». Liste fermée de séquences PLIÉES, jamais un mot isolé ambigu
#: (« product » seul reste un nom d'entreprise). Lue, l'intitulé devient un profil recruté et l'intention
#: « recrute » — dit par `profile_words`, jamais avalé en silence.
_JOB_TITLE_PHRASES: tuple[tuple[str, ...], ...] = (
    ("product", "owner"),
    ("product", "manager"),
    ("chef", "de", "produit"),
    ("chef", "de", "projet"),
    ("chefs", "de", "projet"),
    ("scrum", "master"),
    ("project", "manager"),
    ("business", "analyst"),
    ("data", "analyst"),
    ("data", "engineer"),
    ("data", "scientist"),
    ("tech", "lead"),
    ("lead", "developpeur"),
    ("responsable", "produit"),
    ("directeur", "produit"),
)

#: Les mots qui introduisent un lieu.
_PLACE_PREPOSITIONS = frozenset({"a", "sur", "en", "dans", "vers", "autour", "pres", "proche"})
#: Les mots qui peuvent relier les parties d'un nom de ville (« Aix en Provence »).
_CONNECTORS = frozenset({"de", "du", "des", "la", "le", "les", "en", "sur", "sous", "d", "l", "et"})
#: Les mots qui annoncent un numéro de département.
_DEPARTMENT_MARKERS = frozenset({"departement", "departements", "dept", "dpt", "le"})
_DEPARTMENT_RE = re.compile(r"^(?:\d{2}|2a|2b|97[1-6])$")
_POSTAL_RE = re.compile(r"^\d{5}$")

#: Les mots d'usage courant qui ne sont NI une activité NI un reproche. Sans
#: eux, « grandes entreprises » désignait la grande distribution et « je
#: recherche » l'éducation & recherche, par simple ressemblance de préfixe.
_NEUTRAL_WORDS = frozenset(
    {
        "entreprise",
        "entreprises",
        "societe",
        "societes",
        "boite",
        "boites",
        "cabinet",
        "cabinets",
        "groupe",
        "groupes",
        "structure",
        "structures",
        "organisation",
        "organisations",
        "specialise",
        "specialisee",
        "specialises",
        "specialisees",
        "specialiste",
        "specialistes",
        "recherche",
        "recherches",
        "rechercher",
        "cherche",
        "chercher",
        "trouve",
        "trouver",
        "veux",
        "voudrais",
        "grand",
        "grands",
        "grande",
        "grandes",
        "petit",
        "petits",
        "petite",
        "petites",
        "moyenne",
        "moyennes",
        "service",
        "services",
        "secteur",
        "secteurs",
        "activite",
        "activites",
        "domaine",
        "domaines",
        "compte",
        "comptes",
        "client",
        "clients",
        "cible",
        "cibles",
        "prospect",
        "prospects",
        "dans",
        "pour",
        "avec",
        "sans",
        "chez",
        "leur",
        "leurs",
        "autour",
        "proche",
        "proches",
        "region",
        "departement",
        "ville",
        "zone",
        "france",
        "francaise",
        "francaises",
        "marche",
        "marches",
        "tous",
        "toutes",
        "tout",
        "type",
        "genre",
    }
)

#: Les mots des libellés de secteur trop généraux pour désigner un secteur.
_GENERIC_LABEL_WORDS = frozenset(
    {
        "secteur",
        "distribution",
        "grande",
        "production",
        "industrielle",
        "infrastructures",
        "marches",
        "reseaux",
        "mode",
        "recherche",
        "equipements",
        "services",
    }
)

#: Un mot plus court ne discrimine rien — sauf égalité EXACTE (« BTP », « gaz »).
_MIN_PREFIX_LENGTH = 4
#: #3705 — l'écart de longueur toléré par l'appariement de préfixe : un pluriel ou un
#: genre (« aéronautiques », « banques ») ajoute une à trois lettres. Sans borne,
#: « luxembourg » (un LIEU) commençait par « luxe » et était lu comme le secteur
#: « Luxe & mode » : une banque au Luxembourg remontait pour une recherche de luxe.
_MAX_PREFIX_SUFFIX = 3
#: Combien de mots restants essayer comme ville quand aucune préposition n'en
#: annonce une (« aéronautique Toulouse ») — chaque essai est un appel réseau.
_MAX_BARE_PLACE_CANDIDATES = 2
#: Au-delà, un texte sans rien de reconnu est une PHRASE, pas un nom.
_MAX_NAME_TOKENS = 3

_TOKEN_RE = re.compile(r"[^\W_]+")


def _fold(value: str) -> str:
    return normalize_name(value)


def _label_words(label: str) -> set[str]:
    return {
        word for word in re.split(r"[^0-9a-z]+", _fold(label)) if len(word) >= 3 and word not in _GENERIC_LABEL_WORDS
    }


#: #3705.1 — recette prod R4b : « logiciels fintech » ramenait des sociétés
#: dont la seule raison sociale contenait « LOGICIELS ». Cause : « fintech »
#: est bien un mot du libellé `fintech` (« Fintech & services financiers »),
#: mais « logiciel »/« logiciels » n'apparaît dans AUCUN libellé — le libellé
#: ÉCRAN du secteur `software_tech` est « Éditeurs & tech », pas « Logiciels ».
#: Le mot non reconnu partait alors en texte libre (`leftover`), qui compare
#: au NOM de l'entreprise, jamais à son activité. Synonymes d'ACTIVITÉ
#: ADDITIFS au libellé affiché — jamais un mot de LIEU ni de forme juridique,
#: qui resteraient lus par leurs propres étapes (régions, ESN…).
_SECTOR_WORD_SYNONYMS: dict[str, tuple[str, ...]] = {
    "software_tech": ("logiciel", "logiciels"),
}

_SECTOR_WORDS: dict[str, set[str]] = {code: _label_words(label) for code, label in APPLICATION_SECTOR_LABELS_FR.items()}
for _code, _synonyms in _SECTOR_WORD_SYNONYMS.items():
    _SECTOR_WORDS.setdefault(_code, set()).update(_synonyms)


def _sectors_for_word(word: str) -> list[str]:
    """Les secteurs dont le libellé porte ce mot — égalité, ou préfixe dans un
    sens ou l'autre à partir de quatre lettres (« aéronautique » ↔
    « aéronautiques »)."""
    codes: list[str] = []
    for code, label_words in _SECTOR_WORDS.items():
        for label_word in label_words:
            if word == label_word or (
                len(word) >= _MIN_PREFIX_LENGTH
                and len(label_word) >= _MIN_PREFIX_LENGTH
                and abs(len(word) - len(label_word)) <= _MAX_PREFIX_SUFFIX
                and (word.startswith(label_word) or label_word.startswith(word))
            ):
                codes.append(code)
                break
    return codes


@dataclass(frozen=True)
class _Token:
    text: str
    folded: str
    start: int
    end: int


@dataclass(frozen=True)
class RequestReading:
    """Ce que la demande dit, champ par champ. Rien n'y est deviné."""

    #: Les activités reconnues : ``"esn"`` ou des codes de secteur d'application.
    activities: tuple[str, ...] = ()
    #: Les codes NAF à interroger pour ces activités.
    naf_codes: tuple[str, ...] = ()
    #: Les mots de la demande qui ont produit ces activités, tels que tapés.
    activity_words: tuple[str, ...] = ()
    #: Les mots d'activité que la lecture a reconnus mais qui ne sont pas
    #: appliqués (un secteur à côté d'« ESN » : le registre ne sait pas dire
    #: « une ESN qui sert l'aéronautique »).
    activity_words_not_applied: tuple[str, ...] = ()
    region: str | None = None
    department: str | None = None
    postal_code: str | None = None
    #: Le lieu lu sans réseau, tel qu'il s'affiche (région, département, code postal).
    place_label: str | None = None
    #: Le texte qui suit une préposition de lieu — une ville PROBABLE, à résoudre.
    place_after_preposition: str | None = None
    #: Les textes à faire résoudre en commune, dans l'ordre de préférence.
    place_candidates: tuple[str, ...] = ()
    #: Les mots ni reconnus ni neutres — à nommer comme non appliqués.
    leftover: tuple[str, ...] = ()
    #: #2165.60 — l'intention lue (« recrute » → ``"hiring"``…), ou ``None``.
    #: Reconnue mais jamais transformée en filtre DEVINÉ : le registre n'a pas
    #: de champ pour une intention de recrutement.
    intent: str | None = None
    #: #3512 — le métier/la techno recrutés (« développeurs », « Python »), tels
    #: que tapés. Jamais un nom d'entreprise, jamais un filtre du registre.
    profile_words: tuple[str, ...] = ()
    #: #4419.1 — le profil a été lu SANS intention de recrutement : c'est le besoin lui-même (chemin offres).
    profile_is_need: bool = False
    #: Vrai quand le texte ressemble à une phrase plutôt qu'à un nom d'entreprise.
    sentence_like: bool = False
    #: Tous les mots lus, pour le diagnostic.
    tokens: tuple[str, ...] = field(default=(), repr=False)

    @property
    def zone_read(self) -> bool:
        return bool(self.region or self.department or self.postal_code)


def _match_phrase(tokens: list[_Token], index: int, phrase: tuple[str, ...]) -> bool:
    if index + len(phrase) > len(tokens):
        return False
    return all(tokens[index + offset].folded == word for offset, word in enumerate(phrase))


def read_request(text: str) -> RequestReading:  # noqa: C901 — une lecture, une passe, dans l'ordre
    """Lit la demande. Pur, sans réseau : la ville reste un CANDIDAT."""
    tokens = [_Token(m.group(0), _fold(m.group(0)), m.start(), m.end()) for m in _TOKEN_RE.finditer(text or "")]
    consumed = [False] * len(tokens)
    has_esn = False
    esn_words: list[str] = []
    region: str | None = None
    region_label: str | None = None
    department: str | None = None
    postal_code: str | None = None
    #: #2165.60 — première intention reconnue (« recrute » → ``"hiring"``…).
    intent: str | None = None

    # 1. Les expressions (ESN, régions, intentions), la plus longue d'abord.
    phrases: list[tuple[tuple[str, ...], str]] = [(p, "esn") for p in _ESN_PHRASES]
    phrases += [(p, f"region:{code}:{label}") for p, code, label in _REGIONS]
    phrases += [(p, f"intent:{code}") for p, code in _INTENT_PHRASES]
    phrases.sort(key=lambda item: -len(item[0]))
    for index in range(len(tokens)):
        if consumed[index]:
            continue
        for phrase, meaning in phrases:
            if not _match_phrase(tokens, index, phrase):
                continue
            if any(consumed[index : index + len(phrase)]):
                continue
            if meaning == "esn":
                has_esn = True
                esn_words.append(text[tokens[index].start : tokens[index + len(phrase) - 1].end])
            elif meaning.startswith("intent:"):
                if intent is None:
                    intent = meaning.split(":", 1)[1]
            elif region is None:
                _, region, region_label = meaning.split(":", 2)
            for offset in range(len(phrase)):
                consumed[index + offset] = True
            break

    # 2. Les mots seuls : ESN, intention, code postal, numéro de département.
    for index, token in enumerate(tokens):
        if consumed[index]:
            continue
        if token.folded in _ESN_WORDS:
            has_esn = True
            esn_words.append(token.text)
            consumed[index] = True
        elif token.folded in _INTENT_WORDS:
            if intent is None:
                intent = _INTENT_WORDS[token.folded]
            consumed[index] = True
        elif _POSTAL_RE.match(token.folded) and postal_code is None:
            postal_code = token.folded
            consumed[index] = True
        elif (
            _DEPARTMENT_RE.match(token.folded)
            and department is None
            and index > 0
            and tokens[index - 1].folded in _DEPARTMENT_MARKERS
        ):
            department = token.folded.upper()
            consumed[index] = True

    # 2 bis. #3512 — le profil recruté : métier/techno, seulement avec une intention
    # de recrutement (sinon « Python Software » est un nom).
    profile_words: list[str] = []
    profile_is_need = False
    if intent == "hiring":
        for index, token in enumerate(tokens):
            if not consumed[index] and token.folded in _PROFILE_WORDS:
                profile_words.append(token.text)
                consumed[index] = True

    # 2 ter. #4751 — l'intitulé de poste connu : profil recruté, intention « recrute » si aucune autre.
    if intent in (None, "hiring"):
        for index in range(len(tokens)):
            if consumed[index]:
                continue
            for phrase in sorted(_JOB_TITLE_PHRASES, key=len, reverse=True):
                if _match_phrase(tokens, index, phrase) and not any(consumed[index : index + len(phrase)]):
                    profile_words.append(text[tokens[index].start : tokens[index + len(phrase) - 1].end])
                    intent = "hiring"
                    for offset in range(len(phrase)):
                        consumed[index + offset] = True
                    break

    # 3. La ville PROBABLE : ce qui suit une préposition de lieu.
    place_after: str | None = None
    place_indexes: set[int] = set()
    for index, token in enumerate(tokens):
        if token.folded not in _PLACE_PREPOSITIONS or consumed[index]:
            continue
        cursor = index + 1
        # « autour de Lyon », « près de Nantes » : le connecteur est sauté.
        while cursor < len(tokens) and tokens[cursor].folded in _CONNECTORS and not consumed[cursor]:
            cursor += 1
        if cursor >= len(tokens) or consumed[cursor] or tokens[cursor].folded.isdigit():
            continue
        words = [cursor]
        probe = cursor + 1
        while probe < len(tokens) and len(words) < 4 and not consumed[probe]:
            if tokens[probe].text[:1].isupper():
                words.append(probe)
                probe += 1
            elif (
                tokens[probe].folded in _CONNECTORS
                and probe + 1 < len(tokens)
                and tokens[probe + 1].text[:1].isupper()
                and not consumed[probe + 1]
            ):
                words.extend([probe, probe + 1])
                probe += 2
            else:
                break
        first, last = tokens[words[0]], tokens[words[-1]]
        if tokens[words[0]].folded in _ESN_WORDS or _sectors_for_word(first.folded):
            # « ESN en cybersécurité », « en aéronautique » : une activité, pas un lieu.
            continue
        place_after = text[first.start : last.end]
        place_indexes = set(words)
        break

    # 4. Les secteurs, mot à mot.
    sector_codes: list[str] = []
    sector_words: list[str] = []
    leftover: list[str] = []
    # #4419.1 — les mots de métier/techno non lus, courts compris (« dev ») : candidats au profil sans « recrute ».
    loose_profile: list[str] = []
    for index, token in enumerate(tokens):
        if consumed[index] or index in place_indexes:
            continue
        word = token.folded
        if word in _PROFILE_WORDS and len(word) >= 3 and not _sectors_for_word(word):
            loose_profile.append(token.text)
        if len(word) < 3 or word in _NEUTRAL_WORDS or word in _CONNECTORS or word in _PLACE_PREPOSITIONS:
            continue
        codes = [] if word.isdigit() else _sectors_for_word(word)
        if codes:
            consumed[index] = True
            sector_words.append(token.text)
            for code in codes:
                if code not in sector_codes:
                    sector_codes.append(code)
        elif len(word) >= _MIN_PREFIX_LENGTH or word.isdigit():
            leftover.append(token.text)

    # 4 bis. #4419.1 (Louis 31/10) — un métier et/ou une techno dont le RESTE de la phrase n'est rien d'autre sont un
    # PROFIL, avec ou sans « recrute » : « développeur Java dans les Hauts-de-France », « dev à Lyon ». Prod 31/10 :
    # lus comme raison sociale, 0 compte. Garde #4842 : dès qu'un mot hors profil reste (« Python Software »,
    # « Capgemini »), la phrase garde son nom et rien n'est lu comme profil.
    if (
        not profile_words
        and loose_profile
        and all(_fold(word) in _PROFILE_WORDS for word in leftover)
        and not has_esn
        and not sector_codes
    ):
        profile_words = [*loose_profile]
        profile_is_need = True
        leftover = []

    # 5. Le type d'entreprise PRIME sur le secteur : « ESN aéronautique » veut
    # des ESN — le registre ne sait pas dire lesquelles servent l'aéronautique,
    # et un OU rendrait aussi les avionneurs. Le secteur est alors NOMMÉ.
    if has_esn:
        activities: tuple[str, ...] = (ESN_ACTIVITY,)
        naf_codes: tuple[str, ...] = tuple(ESN_NAF_CODES)
        not_applied_activity = tuple(sector_words)
        activity_words = tuple(esn_words)
    else:
        activities = tuple(sector_codes)
        naf_codes = tuple(naf_codes_for_sectors(sector_codes))
        not_applied_activity = ()
        activity_words = tuple(sector_words)

    zone_read = bool(region or department or postal_code)
    candidates: list[str] = []
    if not zone_read:
        if place_after:
            candidates.append(place_after)
        else:
            # « aéronautique Toulouse » : aucune préposition, le mot restant est
            # ESSAYÉ comme ville — les majuscules d'abord, jamais plus de deux.
            bare = sorted(leftover, key=lambda word: not word[:1].isupper())
            candidates.extend(word for word in bare if not word.isdigit())
            candidates = candidates[:_MAX_BARE_PLACE_CANDIDATES]

    place_label = region_label or postal_code or department
    sentence_like = len(tokens) > _MAX_NAME_TOKENS or any(
        token.folded in _PLACE_PREPOSITIONS or token.folded in _CONNECTORS for token in tokens
    )
    return RequestReading(
        activities=activities,
        naf_codes=naf_codes,
        activity_words=activity_words,
        activity_words_not_applied=not_applied_activity,
        region=region,
        department=department,
        postal_code=postal_code,
        place_label=place_label,
        place_after_preposition=place_after,
        place_candidates=tuple(candidates),
        leftover=tuple(leftover),
        sentence_like=sentence_like,
        tokens=tuple(token.text for token in tokens),
        intent=intent,
        profile_words=tuple(profile_words),
        profile_is_need=profile_is_need,
    )
