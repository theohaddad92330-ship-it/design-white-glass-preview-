"""Lire une sortie de prompt, et — quand c'est possible — son ENTRÉE.

Deux frictions, nommées plutôt que contournées.

**1. La sortie enregistrée est en ``snake_case``.**
``recorder._serialisable`` fait ``model_dump(mode="json")`` *sans* ``by_alias``.
Une sortie de ``ContactsOutput`` porte donc ``full_name``, pas ``fullName`` —
alors que les primitives du produit (``assemble_buying_committee``,
``judge._contact_name``…) lisent les DEUX orthographes, parce qu'elles reçoivent
tantôt du contrat, tantôt du modèle. :func:`get` fait pareil, explicitement, et
ne devine rien d'autre : ce n'est pas un normaliseur (un normaliseur avale les
champs neufs), c'est un accès à deux noms connus.

**2. « Aucune personne inventée » a besoin de l'ENTRÉE.**
La sortie de ``bellum_organigramme`` ne contient que des NOMS ; savoir si un nom
a été inventé suppose de connaître la liste de contacts qui a été FOURNIE. Elle
n'existe qu'à un endroit : le ``user`` de l'enregistrement, où
``classification.py:443`` l'a injectée en JSON. :func:`input_contacts` la relit.

C'est un couplage au gabarit du prompt, et il est assumé **dans un seul sens** :
quand la lecture échoue, la fonction rend ``None`` et l'axe concerné devient
*non mesurable avec sa raison*. Elle ne rend jamais une liste vide, qui se
lirait « le modèle n'avait aucun contact » — soit exactement le contresens que
la doctrine interdit.

**3. Quatre prompts de LIVRABLE ont la même exigence, plus dure.**
``bellum_cv`` et ``bellum_need_play`` demandent une CITATION EXACTE de leur
matière source ; ``bellum_battlecard`` interdit un concurrent qu'on ne lui a pas
fourni ; ``bellum_compare`` interdit un compte qu'on ne lui a pas donné. Les
quatre matières n'existent, elles aussi, que dans le prompt utilisateur. Les
extracteurs ci-dessous les relisent, avec la MÊME règle de retour :

* ``None`` = **entrée illisible** — l'axe devient non mesurable et le DIT ;
* ``[]``   = **le prompt a dit qu'il n'y en avait aucun** — ce qui est une
  information, pas une lecture ratée. Pour la battle card, c'est même un
  contrat : « si AUCUN concurrent n'est identifié, renvoie ``vs_competitors:
  []`` » (``app/prompts/bellum_battlecard.py:117``).

Confondre les deux ferait, dans un sens, accuser un modèle honnête et, dans
l'autre, absoudre un modèle qui invente.

**4. Trois des quatre prompts RESTÉS sur Sonnet ont la même exigence.**
``bellum_rfp_analyse`` doit extraire des exigences « telles qu'écrites » dans un
cahier des charges ; ``bellum_rfp_draft`` ne peut citer qu'une source APPROUVÉE
qu'on lui a fournie ; ``bellum_linkedin_posts`` doit ancrer chaque sujet dans un
contexte cité « tel quel ». Les trois matières n'existent, elles aussi, que dans
le prompt utilisateur, et les extracteurs suivent la MÊME règle de retour.

⚠️ ``input_post_context`` ajoute un troisième état à la place de ``[]`` : la
chaîne VIDE. ``bellum_linkedin_posts`` écrit « AUCUN CONTEXTE FOURNI. » quand
les quatre blocs sont vides (``app/prompts/bellum_linkedin_posts.py:61-62``) —
c'est un contrat, pas une lecture ratée, et il rend TOUT ancrage impossible :
un ``grounded_on`` non vide y est nécessairement inventé.

⚠️ ``bellum_scorer`` n'a PAS d'extracteur. Son prompt utilisateur interpole
``raw_analysis`` par ``str(dict)`` — un ``repr`` Python, pas du JSON
(``app/prompts/bellum_scorer.py:63``) — donc rien n'y est relisible sans
deviner. Son barème ne note que ce que la sortie porte, et le DIT dans son
``caveat``.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

#: Là où chaque prompt injecte la liste de contacts qu'il fournit au modèle.
#: ``bellum_contacts`` : un bloc entre deux séparateurs ``=====`` ;
#: ``bellum_organigramme`` : une ligne ``CONTACTS: [...]``.
_CONTACTS_BLOCK_RE = re.compile(
    r"=====\s*CONTACTS BRUTS\s*=====\s*\n(.*?)(?=\n=====|\Z)", re.DOTALL
)
_CONTACTS_LINE_RE = re.compile(r"^CONTACTS:[ \t]*(\[.*\])[ \t]*$", re.MULTILINE)

#: Le CV source de ``bellum_cv``, encadré par deux ``\"\"\"``
#: (``app/prompts/bellum_cv.py:106-110``).
_CV_SOURCE_RE = re.compile(r'CV SOURCE.*?\n"""\n(.*?)\n"""', re.DOTALL)

#: La ligne des comptes comparés (``app/prompts/bellum_compare.py:50``).
_COMPARED_LINE_RE = re.compile(r"^COMPTES À COMPARER[ \t]*:[ \t]*(.+)$", re.MULTILINE)

#: En dessous, une citation ne prouve rien : « Java » se retrouve dans n'importe
#: quel CV, « Data » dans n'importe quel dossier. La MÊME borne que les deux
#: gardes d'API qui retirent une citation non prouvante
#: (``apps/api/src/modules/consultants/cv-rewrite-guard.ts`` ``MIN_PROOF_CHARS``
#: et ``apps/api/src/modules/accounts/need-play-guard.ts`` ``MIN_PROOF_CHARS``).
MIN_PROOF_CHARS = 12

#: Le bloc de matière autorisée de ``bellum_need_play`` : du premier titre
#: jusqu'à la consigne finale (``app/prompts/bellum_need_play.py:126-138``).
_NEED_PLAY_MATERIAL = ("BESOIN À ATTAQUER", "Prépare l'attaque de ce besoin")
_NEED_PLAY_PEOPLE = ("PERSONNES CONNUES DU DOSSIER", "L'ESN QUI ATTAQUE")
#: Le bloc concurrence de ``bellum_battlecard`` (``app/prompts/bellum_battlecard.py:78-80``)
#: et la phrase EXACTE qu'il écrit quand l'analyse n'en a identifié aucun.
_BATTLECARD_COMPETITORS = ("CONCURRENTS / ESN DÉJÀ PRÉSENTES", "SORTIE JSON")
_BATTLECARD_NO_COMPETITOR = "Aucun concurrent identifié dans l'analyse."

#: Le cahier des charges injecté dans ``bellum_rfp_analyse``
#: (``app/prompts/bellum_rfp.py:113-118``). La borne de fin est le bloc « JSON
#: attendu », qui suit immédiatement le document.
_RFP_DOCUMENT = ("APPEL D'OFFRES :", "\nJSON attendu :")
#: L'exigence unique et le catalogue de sources de ``bellum_rfp_draft``
#: (``app/prompts/bellum_rfp.py:196-201``).
_RFP_REQUIREMENT = ("EXIGENCE À TRAITER :", "\nSOURCES APPROUVÉES DISPONIBLES :")
_RFP_SOURCES = ("SOURCES APPROUVÉES DISPONIBLES :", "\nJSON attendu :")

#: Le drapeau que ``bellum_rfp.py:105-110`` écrit DANS le document quand il a dû
#: le couper. Il change ce qu'on a le droit d'attendre du modèle (« toute exigence
#: dont tu n'as pas lu la fin doit sortir `ambiguous` »), donc un barème qui
#: l'ignore note la mauvaise règle.
RFP_TRUNCATION_MARKER = "DOCUMENT TRONQUÉ"

#: La consigne finale de ``bellum_linkedin_posts`` — elle FERME le contexte
#: (``app/prompts/bellum_linkedin_posts.py:63-66``), et la phrase exacte que le
#: gabarit écrit quand les quatre blocs sont vides.
_POST_CONTEXT_END = "Propose des sujets ancrés UNIQUEMENT sur ce qui précède."
_POST_NO_CONTEXT = "AUCUN CONTEXTE FOURNI."


def as_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def as_list(value: Any) -> list[Any]:
    """Une liste, et rien d'autre. Une chaîne n'est PAS une liste de caractères ici.

    Le schéma des prompts glisse une chaîne d'instruction en tête de certains
    tableaux (« (MIN 4, viser 5) Pour chaque pain : ») et les modèles la
    recopient parfois. On garde tout ; c'est :func:`mappings` qui trie.
    """
    if isinstance(value, (str, bytes, Mapping)):
        return []
    return list(value) if isinstance(value, Sequence) else []


def mappings(value: Any) -> list[dict[str, Any]]:
    """Les seuls éléments notables d'un tableau d'objets — même règle que
    ``rubric._mappings`` (``app/eval/strategy/rubric.py:148``) : une chaîne
    d'annotation de schéma n'est pas un contenu."""
    return [dict(v) for v in as_list(value) if isinstance(v, Mapping)]


def get(obj: Mapping[str, Any], *names: str) -> Any:
    """La première clé présente parmi ``names`` — camel ET snake, jamais devinée."""
    for name in names:
        if name in obj and obj[name] not in (None, ""):
            return obj[name]
    for name in names:
        if name in obj:
            return obj[name]
    return None


def present(value: Any) -> bool:
    """Un champ porte-t-il un contenu réel ? Même vocabulaire de vide que
    ``app/eval/metrics.py:123`` (``_present``), plus les deux marqueurs
    d'absence que les prompts imposent en toutes lettres (« Non source »,
    « Non datee ») — les écrire est HONNÊTE, mais ce n'est pas une valeur."""
    if value is None:
        return False
    text = str(value).strip().lower()
    if not text:
        return False
    stripped = "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )
    return stripped not in (
        "non identifie", "non precise", "n/a", "na", "inconnu", "none", "null", "-",
        "non source", "non sourcee", "non datee", "non date", "a definir", "a preciser",
    )


def norm_name(value: Any) -> str:
    """Casse et accents retirés — la même normalisation que
    ``app/graph/judge.py:63`` (``_norm``), pour que « OUDÉA » == « OUDEA »."""
    decomposed = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(
        "".join(c for c in decomposed if not unicodedata.combining(c)).upper().split()
    )


def contact_names(items: Sequence[Any]) -> set[str]:
    """Les noms normalisés d'une liste de contacts (contrat OU dump du modèle)."""
    out: set[str] = set()
    for c in items:
        if isinstance(c, Mapping):
            name = norm_name(get(c, "fullName", "full_name", "name"))
            if name:
                out.add(name)
    return out


def comparable(value: Any) -> str:
    """Texte comparable : accents retirés, casse repliée, espaces compactés.

    C'est la normalisation de ``need-play-guard.ts:comparable`` — chercher une
    citation sans se faire piéger par la casse, un accent ou un retour à la ligne
    de copier-coller de PDF.

    ⚠️ Divergence ASSUMÉE et nommée : ``app/routers/cv.py:231`` (``_normalise``)
    ne retire PAS les accents. Ce barème est donc un cheveu plus permissif que ce
    validateur-là sur une citation ré-accentuée — ce qui va dans le bon sens
    (il n'accuse pas un modèle d'avoir inventé ce qu'il a seulement re-typographié).
    """
    text = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).split()).casefold()


def quote_is_grounded(quote: Any, haystack: str) -> bool:
    """La citation est-elle RÉELLEMENT dans la matière source ?

    ``haystack`` est déjà passé par :func:`comparable`. Une citation vide n'est
    pas une citation introuvable : c'est une citation ABSENTE — l'appelant les
    distingue, parce que l'une est une invention et l'autre un manque.
    """
    needle = comparable(quote)
    return bool(needle) and needle in haystack


def _segment(text: str, start: str, end: str) -> str | None:
    """Le morceau de prompt entre deux repères. ``None`` si l'un manque —
    jamais le prompt entier, qui ferait passer n'importe quoi pour de la matière."""
    i = (text or "").find(start)
    if i < 0:
        return None
    j = text.find(end, i + len(start))
    return text[i + len(start): j if j >= 0 else len(text)]


def _json_in(segment: str | None) -> Any:
    """Le premier littéral JSON d'un segment, décodé. ``None`` si illisible.

    ``raw_decode`` s'arrête au littéral, donc l'indentation du ``json.dumps``
    des prompts (et le texte qui suit) ne le gênent pas — là où une expression
    rationnelle ``\\[.*?\\]`` couperait au premier crochet imbriqué.
    """
    if segment is None:
        return None
    for i, ch in enumerate(segment):
        if ch in "[{":
            try:
                value, _ = json.JSONDecoder().raw_decode(segment[i:])
            except ValueError:
                return None
            return value
    return None


def input_cv_text(user_prompt: str) -> str | None:
    """Le CV source de ``bellum_cv``, relu dans le prompt utilisateur.

    ``None`` quand le bloc est absent : sans le CV, « cité » et « inventé » ne se
    distinguent pas, et le barème doit le DIRE plutôt que de tout accuser.
    """
    match = _CV_SOURCE_RE.search(user_prompt or "")
    if match is None:
        return None
    text = match.group(1)
    return text if text.strip() else None


def input_need_play_material(user_prompt: str) -> str | None:
    """La matière autorisée de ``bellum_need_play``, sous forme comparable.

    Équivalent de ``need-play-guard.ts:buildSourceMaterial``, à une différence
    NOMMÉE : la garde d'API confronte les objets de la REQUÊTE, ce barème
    confronte le PROMPT — c'est-à-dire ce que le modèle a réellement vu. Sur une
    citation, c'est la bonne référence ; les deux ne peuvent diverger que si un
    champ de la requête n'atteint pas le prompt.
    """
    segment = _segment(user_prompt or "", *_NEED_PLAY_MATERIAL)
    if segment is None or not segment.strip():
        return None
    return comparable(segment)


def input_need_play_people(user_prompt: str) -> list[dict[str, Any]] | None:
    """Les personnes du dossier — les SEULES que le prompt autorise à nommer
    (``app/prompts/bellum_need_play.py:132``). ``None`` si le bloc est illisible."""
    parsed = _json_in(_segment(user_prompt or "", *_NEED_PLAY_PEOPLE))
    if not isinstance(parsed, list):
        return None
    return [dict(p) for p in parsed if isinstance(p, Mapping)]


def input_battlecard_competitors(user_prompt: str) -> list[dict[str, Any]] | None:
    """Les concurrents INJECTÉS dans la battle card.

    Trois états, pas deux : ``None`` = bloc illisible ; ``[]`` = le prompt a
    écrit noir sur blanc qu'aucun n'était identifié (et le contrat devient alors
    « renvoie ``vs_competitors: []`` ») ; une liste = ceux qu'on a fournis.
    """
    segment = _segment(user_prompt or "", *_BATTLECARD_COMPETITORS)
    if segment is None:
        return None
    if _BATTLECARD_NO_COMPETITOR in segment:
        return []
    parsed = _json_in(segment)
    if not isinstance(parsed, list):
        return None
    return [dict(c) for c in parsed if isinstance(c, Mapping)]


def input_compared_companies(user_prompt: str) -> list[str] | None:
    """Les comptes que ``bellum_compare`` avait à comparer.

    ⚠️ Le prompt les joint par ``", "`` (``app/prompts/bellum_compare.py:50``) :
    un nom de société contenant une virgule serait coupé en deux. La conséquence
    est bornée — un faux « compte inventé » — et elle est nommée dans le
    ``blind_to`` de l'axe qui s'en sert.
    """
    match = _COMPARED_LINE_RE.search(user_prompt or "")
    if match is None:
        return None
    names = [n.strip() for n in match.group(1).split(",") if n.strip()]
    return names or None


def input_rfp_document(user_prompt: str) -> str | None:
    """Le cahier des charges injecté dans ``bellum_rfp_analyse``.

    ``None`` quand le bloc est absent : sans le document, « exigence citée » et
    « exigence inventée » ne se distinguent pas, et le barème doit le DIRE.

    ⚠️ Le segment rendu contient AUSSI la note de troncature quand il y en a une
    (``bellum_rfp.py:105-110``) : quelques dizaines de caractères de NOTRE
    vocabulaire entrent donc dans la meule de foin. La conséquence est bornée et
    va dans le sens permissif — une exigence pourrait, en théorie, se prouver sur
    une phrase que nous avons écrite. Elle est nommée ici plutôt que corrigée en
    silence, parce que la retirer supposerait de re-couper le segment sur une
    chaîne qui, elle, changerait sans prévenir.
    """
    segment = _segment(user_prompt or "", *_RFP_DOCUMENT)
    if segment is None or not segment.strip():
        return None
    return segment


def rfp_document_is_truncated(user_prompt: str) -> bool:
    """Le document a-t-il été COUPÉ avant d'être envoyé ?

    C'est une condition de mesure, pas un détail : le prompt change de règle
    quand c'est le cas (``bellum_rfp.py:88-89`` — « marque `ambiguous` tout ce
    dont tu n'as pas lu la fin »). Un barème qui note la règle du document
    ENTIER sur un document coupé sanctionne un modèle obéissant.
    """
    return RFP_TRUNCATION_MARKER in (input_rfp_document(user_prompt) or "")


def input_rfp_requirement(user_prompt: str) -> dict[str, Any] | None:
    """L'exigence UNIQUE que ``bellum_rfp_draft`` doit traiter. ``None`` si le
    bloc est illisible."""
    parsed = _json_in(_segment(user_prompt or "", *_RFP_REQUIREMENT))
    return dict(parsed) if isinstance(parsed, Mapping) else None


def input_rfp_sources(user_prompt: str) -> list[dict[str, Any]] | None:
    """Les sources APPROUVÉES fournies à ``bellum_rfp_draft``.

    Trois états, comme la battle card : ``None`` = bloc illisible ; ``[]`` = on
    n'a fourni AUCUNE source, ce qui est un contrat (« si aucune source ne couvre
    l'exigence, tu NE RÉDIGES PAS », ``bellum_rfp.py:151-154``) et non un manque ;
    une liste = celles qu'on a fournies.
    """
    parsed = _json_in(_segment(user_prompt or "", *_RFP_SOURCES))
    if not isinstance(parsed, list):
        return None
    return [dict(s) for s in parsed if isinstance(s, Mapping)]


def input_post_context(user_prompt: str) -> str | None:
    """Le contexte autorisé de ``bellum_linkedin_posts``, sous forme comparable.

    Trois états :

    * ``None`` — la consigne de fermeture est absente : le gabarit a bougé, et on
      ne sait plus où s'arrête le contexte. L'axe le DIT ;
    * ``""``   — le gabarit a écrit « AUCUN CONTEXTE FOURNI. » : il n'y a rien à
      citer, donc tout ``grounded_on`` non vide est inventé. C'est une
      information, pas une lecture ratée ;
    * le texte — ce que le modèle avait le droit de citer.
    """
    text = user_prompt or ""
    end = text.find(_POST_CONTEXT_END)
    if end < 0:
        return None
    segment = text[:end]
    if _POST_NO_CONTEXT in segment:
        return ""
    return comparable(segment)


def input_contacts(user_prompt: str) -> list[dict[str, Any]] | None:
    """La liste de contacts FOURNIE au modèle, relue dans le prompt utilisateur.

    ``None`` — jamais ``[]`` — quand le bloc est absent ou illisible : l'appelant
    doit alors NOMMER l'axe non mesurable, pas conclure que le modèle n'avait
    rien reçu.
    """
    text = user_prompt or ""
    for match in (_CONTACTS_BLOCK_RE.search(text), _CONTACTS_LINE_RE.search(text)):
        if match is None:
            continue
        raw = match.group(1).strip()
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, list):
            return [dict(p) for p in parsed if isinstance(p, Mapping)]
    return None
