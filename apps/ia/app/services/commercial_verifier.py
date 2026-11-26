"""#3190 (LAU-FINAL-196, « PRE-RESPONSE COMMERCIAL VERIFIER ») — un contrôle
déterministe, câblé au MÊME point que ``chat_turn_plan.unverified_figures``
dans ``chat_orchestrator`` (fin du tour, juste avant ``_self_check``).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
La spec (#3190) demande PASS / REPAIR / BLOCK, une checklist en sept familles
(INTENTION, SOURCES, PERSONNALISATION, STRATÉGIE, SCOPE, VÉRITÉ, STYLE,
ACTION) et un pouvoir de réparation actif (retirer une affirmation,
raccourcir, déclencher une alternative). Ce module livre la tranche
DÉTERMINISTE et déjà BRANCHÉE sur des données réelles de ce tour :

 - VÉRITÉ — « une affirmation non supportée existe-t-elle ? » — réutilise
   ``chat_turn_plan.unverified_figures`` (GA-26 : jamais une seconde
   implémentation du même contrôle).
 - STYLE — « la réponse ressemble-t-elle à un template d'IA ? » — réutilise
   ``forbidden_phrasings.COPILOT_FORBIDDEN_PHRASINGS``, le catalogue que
   ``bellum_advisor.py`` bannit déjà dans le prompt.
 - VÉRITÉ (épopée #3241, #3190.9 reste) — « l'action est-elle seulement
   préparée ou réellement exécutée ? » : un catalogue fermé de formulations
   qui prétendent un envoi/une écriture ACHEVÉE. Toujours fautif dans cette
   architecture (doctrine c67 : « Fait » ne porte jamais de preuve d'envoi ;
   une écriture CRM/ERP passe TOUJOURS par la porte d'approbation, #2391) —
   aucun croisement avec ``actions`` n'est nécessaire.
 - STYLE (épopée #3241, #3190.10 reste) — « la réponse est-elle trop
   longue ? ». Tranché sans Louis : le seuil est un multiple de la largeur
   de lecture déjà posée pour une bulle de chat (D81/GA-34, ``Chat.tsx``
   ``max-w-[min(70ch,92%)]``) — au-delà de ~20 lignes de 70 caractères
   (1 400 caractères), une réponse a débordé du format conversationnel que
   STRUCTURE ADAPTATIVE (#3191.2) décrit.
 - STYLE (épopée #3241, #3190.10 reste, volet FORME) — « un titre est-il
   justifié, une liste est-elle artificielle ? ». Mesurable SANS jugement
   sémantique sur le FOND : un en-tête markdown ne sectionne utilement
   qu'une réponse assez longue pour l'avoir besoin (même borne D81/GA-34,
   un multiple de lignes plus bas que RESPONSE_TOO_LONG) ; une liste d'au
   plus deux éléments courts fragmente en structure ce qui tenait dans une
   phrase. Deux mesures de FORME, jamais un jugement sur ce que dit chaque
   élément.
 - ACTION (épopée #3241, #3190.11 reste, volet CONCRET/RÉALISTE) — la
   réponse PROMET-elle, en texte libre, une action sur une capacité (CRM,
   agenda) qui n'est PAS connectée pour cet utilisateur ? Le routeur retire
   déjà l'OUTIL correspondant du catalogue présenté au modèle
   (``chat_tools.tools_for``) — il ne peut donc jamais l'EXÉCUTER — mais rien
   n'empêchait jusqu'ici une PROMESSE en texte, jamais suivie d'un appel
   d'outil. Catalogue fermé de formulations, croisé avec
   ``chat_tools.missing_capabilities`` (même donnée que le routeur, jamais un
   second calcul, GA-26). Le volet GOUVERNANCE de #3190.11 (une écriture
   CRM/ERP passe toujours par la porte d'approbation) était déjà couvert
   ailleurs (#3243) ; celui-ci couvre le volet RÉALISTE.

Le texte, au moment où ce contrôle tourne, a déjà été diffusé au fil de l'eau
(``chat_orchestrator`` : les évènements ``delta`` partent PENDANT que le
modèle écrit). ``status`` est donc un VERDICT observé, jamais une réécriture
— même discipline que ``chat_content_guards`` (« mesurer avant de pouvoir
bloquer ») et que ``_self_check``. ``block`` n'existe pas encore dans ce
module : aucun signal réel (une source EXPLICITEMENT refusée, une
contradiction de profil) ne circule aujourd'hui jusqu'à ce point du tour —
en fabriquer un ici serait le code que personne n'appelle. INTENTION,
SOURCES, PERSONNALISATION, STRATÉGIE et SCOPE exigent un jugement sémantique
qu'un contrôle sans appel de modèle ne peut pas rendre honnêtement (et un
appel de modèle est justement ce que la spec interdit pour ne pas exposer de
chaîne de pensée côté PROMPT — mais resterait un système à part entière côté
coût/latence/prompt dédié). Le reste va à l'épopée.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Literal

from app.prompts.forbidden_phrasings import COPILOT_FORBIDDEN_PHRASINGS
from app.services.chat_tools import missing_capabilities
from app.services.chat_turn_plan import unverified_figures
from app.services.response_density import classify_expected_density, density_mismatch

VerifierStatus = Literal["pass", "repair"]

#: Codes stables (OBSERVABILITÉ #3190) — jamais le texte de la réponse, qui ne
#: sort pas vers les journaux (même règle que ``_self_check``).
UNSUPPORTED_CLAIM = "affirmation_non_supportee"
AI_TEMPLATE_STYLE = "style_template_ia"
#: #3190.9 reste (VÉRITÉ, épopée #3241) — « l'action est-elle seulement
#: préparée ou réellement exécutée ? ». Doctrine c67 (Louis 21/09/2026) :
#: « Fait » ne porte jamais de preuve d'envoi. Déterministe et déjà nourri
#: par une donnée réelle de CE tour : nul besoin de croiser `actions` — dans
#: cette architecture, une écriture CRM/ERP ou un envoi ne se confirme
#: JAMAIS dans le texte d'un tour de chat (porte d'approbation, #2391), donc
#: toute formulation qui prétend le contraire est TOUJOURS fautive.
ACTION_DECLARED_WITHOUT_PROOF = "action_declaree_sans_preuve"
#: #3436.2 (lot Q06) — une OBSERVATION de marché (historique, structurelle)
#: présentée comme une pratique ACTUELLE : « X recrute des freelances »,
#: « Java est leur stack officielle »… Le prompt (``bellum_advisor``, OBSERVATIONS
#: MARCHÉ) le bannit ; ceci le MESURE sur la réponse, sans modèle, avec le
#: même catalogue fermé de formulations que le prompt cite.
MARKET_OBSERVATION_AS_CURRENT = "observation_marche_presentee_comme_actuelle"
#: #3190.10 reste (STYLE, épopée #3241) — « la réponse est-elle trop longue
#: pour une bulle de chat ? ». Tranché sans Louis : voir le seuil ci-dessous.
RESPONSE_TOO_LONG = "reponse_trop_longue"
#: ~20 lignes de la largeur de lecture déjà posée pour une bulle de chat
#: (D81/GA-34, 70ch). Un multiple round choisi pour rester lisible dans le
#: commit et le test, pas mesuré au caractère près.
_TOO_LONG_THRESHOLD_CHARS = 1400
#: #3190.11 reste, volet CONCRET/RÉALISTE (épopée #3241) — « la prochaine
#: action annoncée est-elle réaliste, croisée avec les capacités RÉELLEMENT
#: connectées ? ». Le routeur retire déjà les OUTILS d'une famille absente
#: (`chat_tools.tools_for`) — le modèle ne peut donc jamais EXÉCUTER un envoi
#: CRM ou calendrier sans connecteur. Il peut en revanche le PROMETTRE en
#: TEXTE libre, sans appeler aucun outil : c'est le trou que ce code ferme,
#: déterministe et déjà nourri par une donnée réelle de ce tour
#: (`connected_families`, déjà transmis à `run_chat_with_tools` — GA-26,
#: jamais un second calcul de la même famille manquante que
#: `chat_tools.missing_capabilities`).
PROMISES_UNCONNECTED_CAPABILITY = "action_promise_capacite_non_connectee"
#: #3190.10 reste (STYLE, épopée #3241, volet FORME) — « un titre est-il
#: justifié ? ». Un en-tête markdown ne sectionne utilement qu'une réponse
#: déjà assez longue pour en avoir besoin ; en dessous, il imite la forme
#: d'un rapport sans le contenu qui le justifierait. Seuil ancré sur la MÊME
#: largeur de lecture que ``RESPONSE_TOO_LONG`` (D81/GA-34, 70ch), à un
#: multiple de lignes plus bas (~10 plutôt que ~20) : un titre se justifie
#: avant qu'une réponse déborde franchement du format conversationnel.
UNNECESSARY_HEADER = "titre_non_justifie"
_UNNECESSARY_HEADER_THRESHOLD_CHARS = 700

#: #3190.10 reste (STYLE, épopée #3241, volet FORME) — « la liste est-elle
#: artificielle ? ». Une liste à puces d'au plus deux éléments, chacun un
#: fragment court (moins d'une ligne de lecture, 70ch, D81/GA-34), découpe
#: en structure ce qui tient dans une phrase — le symptôme nommé par
#: l'issue, jamais un jugement sur le CONTENU de chaque élément.
ARTIFICIAL_LIST = "liste_artificielle"
_ARTIFICIAL_LIST_MAX_ITEMS = 2
_ARTIFICIAL_LIST_ITEM_MAX_CHARS = 70

#: #3192 (LAU-FINAL-198, épopée #3241 côté observabilité) — « contrôle de
#: densité de réponse non prouvé » (recette 30/09). Déterministe et déjà
#: nourrie par une donnée réelle de CE tour (``user_message``, le texte brut
#: de la personne) : ``response_density.classify_expected_density`` +
#: ``density_mismatch``, jamais un second classifieur ici (GA-26).
RESPONSE_DENSITY_MISMATCH = "densite_reponse_incoherente"

#: #3175.4/.6 (épopée #3215) — « une question commerciale n'est jamais traitée
#: comme encyclopédique ». Quand l'objet ``CommercialIntent`` du tour exige une
#: PREUVE d'outil (``evidence_requirement == "preuve_d_outil"``) et qu'aucun
#: résultat d'outil n'existe, une réponse AFFIRMATIVE (pas une question de
#: clarification) répond de mémoire : le signal part, la limite s'ajoute.
EVIDENCE_REQUIRED_MISSING = "preuve_exigee_absente"

#: SIMON-FIX S.18b (recette 20/10) — « Tu peux choisir un compte de cette sélection » alors que la recherche n'a
#: rendu AUCUNE liste (« Transport Île-de-France +1000 salariés » : critères gardés, outil muet). Une réponse ne renvoie
#: jamais à une liste absente : soit un outil a rendu des lignes, soit la limite s'ajoute et dit ce qui manque.
REFERS_TO_ABSENT_LIST = "renvoie_a_une_liste_absente"
_LIST_POINTERS = (
    "cette sélection",
    "de la sélection",
    "dans la sélection",
    "la liste ci-dessus",
    "les comptes ci-dessus",
    "ces comptes ci-dessus",
    "la liste ci-dessous",
    "les comptes ci-dessous",
    "dans la liste",
    "parmi ces comptes",
    "choisir un compte",
    "choisis un compte",
    "choisir l'un de ces comptes",
)


@dataclass(frozen=True)
class VerifierResult:
    status: VerifierStatus
    repair_reasons: list[str] = field(default_factory=list)


#: #3190.9 reste (VÉRITÉ, épopée #3241) — « une inconnue convertie en zéro ».
#: Un outil NOMME ce qu'il n'a pas pu évaluer (`not_evaluated`, `unknowns[].axis`,
#: `scoreUnmeasured`, `limitedByData`) ; si la réponse écrit « <ce nom> … 0 »
#: (0, 0/5, 0 %, « zéro »), une inconnue est devenue un zéro (doctrine : « non
#: mesuré » n'est jamais « 0 », GA-18/GA-19). Donnée structurée DE CE TOUR, jamais
#: un zéro deviné : sans inconnue nommée par un outil, un zéro reste un zéro.
UNKNOWN_CONVERTED_TO_ZERO = "inconnue_convertie_en_zero"
_UNKNOWN_KEYS = ("not_evaluated", "notEvaluated", "scoreUnmeasured", "limitedByData")
_ZERO_AFTER = r"(?:[^\n.;!?]{0,25}?(?<![\d,.])(?:0(?!\d|[.,]\d)|z[ée]ro\b))"


def _unknown_names(tool_outputs: Iterable[str]) -> list[str]:
    names: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key in _UNKNOWN_KEYS and isinstance(value, list):
                    names.extend(str(v).strip() for v in value if isinstance(v, str))
                elif key == "unknowns" and isinstance(value, list):
                    names.extend(str(v.get("axis", "")).strip() for v in value if isinstance(v, dict))
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for output in tool_outputs:
        try:
            walk(json.loads(output))
        except (ValueError, TypeError):
            continue
    return [n for n in dict.fromkeys(names) if len(n) >= 4]


def _converts_an_unknown_to_zero(text: str, tool_outputs: Iterable[str]) -> bool:
    folded = _fold(text)
    for name in _unknown_names(tool_outputs):
        if re.search(re.escape(_fold(name)) + _ZERO_AFTER, folded):
            return True
    return False


def _normalise(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text or "").replace("’", "'").lower()
    return re.sub(r"\s+", " ", folded)


def _has_ai_template_phrasing(text: str) -> bool:
    normalised = _normalise(text)
    return any(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", normalised) for phrase in COPILOT_FORBIDDEN_PHRASINGS)


#: #3190.9 reste — une réponse ne prétend JAMAIS qu'un envoi ou une écriture
#: externe a été mené à bien : seule la préparation (proposition) existe à ce
#: point du tour. Catalogue fermé, même discipline que
#: ``COPILOT_FORBIDDEN_PHRASINGS`` : des formulations FERMÉES, pas un mot-clé
#: isolé (« envoyé » seul capturerait « je te l'ai envoyé pour relecture, pas
#: encore au client », qui ne prétend rien de faux).
_SEND_CONFIRMATION_CLAIMS: tuple[str, ...] = (
    "message envoyé",
    "email envoyé",
    "mail envoyé",
    "je viens d'envoyer",
    "c'est envoyé",
    "envoyé avec succès",
    "l'email est parti",
    "le message est parti",
    "le mail est parti",
    "c'est fait, envoyé",
)


def _fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", _normalise(text)) if not unicodedata.combining(c))


#: #3436.2 — les formulations de « pratique actuelle » que les OBSERVATIONS
#: MARCHÉ ne prouvent jamais seules (texte du prompt, ``bellum_advisor``).
_CURRENT_PRACTICE_CLAIMS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern)
    for pattern in (
        r"\b(?:recrut(?:e|ent)|embauch(?:e|ent)|fait appel a|font appel a|travaill(?:e|ent) avec)\s+(?:actuellement\s+|aujourd'hui\s+|en ce moment\s+)?(?:des\s+)?freelances?\b",
        r"\bexternalis\w*\s+actuellement\b",
        r"\best actuellement chez eux\b",
        r"\best (?:leur|sa|son) (?:stack officielle|fournisseur en place)\b",
        r"\bsont (?:leurs|ses) fournisseurs? en place\b",
        r"\baccept\w*\s+d'etre en rang 2\b",
        r"\best le decideur final\b",
        r"\ble budget est confirme\b",
    )
)
_NEGATION_BEFORE = re.compile(r"\b(?:ne|n'|pas|jamais|aucun\w*|rien|sans preuve|non)\b|\bsoit\b")


def _states_an_observation_as_current(text: str) -> bool:
    folded = _fold(text)
    for pattern in _CURRENT_PRACTICE_CLAIMS:
        for match in pattern.finditer(folded):
            window = folded[max(0, match.start() - 40) : match.end()]
            if not _NEGATION_BEFORE.search(window):
                return True
    return False


def _claims_a_send_was_completed(text: str) -> bool:
    normalised = _normalise(text)
    return any(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", normalised) for phrase in _SEND_CONFIRMATION_CLAIMS)


def _is_too_long(text: str) -> bool:
    return len(text or "") > _TOO_LONG_THRESHOLD_CHARS


_HEADER_PATTERN = re.compile(r"(?m)^#{1,6}\s+\S")
_LIST_ITEM_PATTERN = re.compile(r"(?m)^[ \t]*(?:[-*•]|\d+[.)])[ \t]+(\S.*)$")


def _has_unnecessary_header(text: str) -> bool:
    body = text or ""
    if not _HEADER_PATTERN.search(body):
        return False
    return len(body) <= _UNNECESSARY_HEADER_THRESHOLD_CHARS


def _has_an_artificial_list(text: str) -> bool:
    items = _LIST_ITEM_PATTERN.findall(text or "")
    if not items or len(items) > _ARTIFICIAL_LIST_MAX_ITEMS:
        return False
    return all(len(item.strip()) <= _ARTIFICIAL_LIST_ITEM_MAX_CHARS for item in items)


#: Catalogue FERMÉ, même discipline que ``_SEND_CONFIRMATION_CLAIMS`` : des
#: formulations complètes, jamais un mot-clé isolé qui capturerait une
#: proposition légitime (« je peux te proposer d'exporter vers ton CRM » ne
#: promet rien — c'est une question, pas un engagement).
_CAPABILITY_PROMISE_CLAIMS: dict[str, tuple[str, ...]] = {
    "crm": (
        "je l'exporte vers ton crm",
        "j'exporte ça vers ton crm",
        "je l'ajoute à ton crm",
        "je crée la fiche dans ton crm",
        "je mets à jour ton crm",
    ),
    "calendar": (
        "je programme un rappel dans ton agenda",
        "je bloque un créneau dans ton agenda",
        "je te mets un rappel dans ton agenda",
        "je programme un créneau dans ton calendrier",
        "je bloque ce créneau dans ton calendrier",
    ),
}


def _promises_an_unconnected_capability(text: str, connected_families: Iterable[str] | None) -> bool:
    if connected_families is None:
        # Même repli sûr que ``chat_tools.tools_for``/``missing_capabilities`` :
        # « on ne sait pas » ne doit jamais déclencher un repair sur un
        # appelant qui ne transmet pas encore l'état des connexions.
        return False
    absent = set(missing_capabilities(list(connected_families)))
    if not absent:
        return False
    normalised = _normalise(text)
    return any(
        re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", normalised)
        for family, phrasings in _CAPABILITY_PROMISE_CLAIMS.items()
        if family in absent
        for phrase in phrasings
    )


def _tool_returned_rows(tool_outputs: Iterable[str]) -> bool:
    """Un outil a-t-il rendu au moins UNE ligne ? Une sortie illisible compte comme oui : on ne devine pas un vide."""

    def has_rows(node: object) -> bool:
        if isinstance(node, list):
            return len(node) > 0
        if isinstance(node, dict):
            return any(has_rows(value) for value in node.values())
        return False

    for output in tool_outputs:
        if not str(output or "").strip():
            continue
        try:
            parsed = json.loads(output)
        except (TypeError, ValueError):
            return True
        if has_rows(parsed):
            return True
    return False


def _points_to_an_absent_list(text: str, tool_outputs: Iterable[str]) -> bool:
    normalised = _normalise(text)
    if not any(pointer in normalised for pointer in _LIST_POINTERS):
        return False
    bullets = re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+\S", text or "")
    if len(bullets) >= 2:
        return False  # la liste est dans la réponse elle-même
    return not _tool_returned_rows(tool_outputs)


def verify_response(
    text: str,
    *,
    tool_outputs: Iterable[str] = (),
    connected_families: Iterable[str] | None = None,
    user_message: str | None = None,
    evidence_requirement: str | None = None,
) -> VerifierResult:
    """Le verdict PRE-RESPONSE pour ``text`` — ``pass`` ou ``repair``, avec les
    motifs (#3190 ``repair_reasons``). Jamais d'appel de modèle : déterministe,
    donc jamais de chaîne de pensée à exposer (la première exigence de la
    spec). ``tool_outputs``/``connected_families`` vides (le défaut) :
    comportement inchangé pour tout appelant qui n'en a pas encore.

    ``user_message`` (#3192, LAU-FINAL-198) : le texte brut de la question de
    CE tour. ``None`` (le défaut, et le choix de tout appelant d'avant ce
    contrôle) : le contrôle de densité ne tourne pas — « on ne sait pas » ne
    déclenche jamais un repair, même repli sûr que
    ``_promises_an_unconnected_capability``.

    ``evidence_requirement`` (#3175.4/.6) : celui de ``CommercialIntent`` —
    ``None`` (le défaut) ou ``"aucune"`` : ce contrôle ne tourne pas."""
    reasons: list[str] = []
    tool_outputs = list(tool_outputs)
    if unverified_figures(text, tool_outputs):
        reasons.append(UNSUPPORTED_CLAIM)
    if _has_ai_template_phrasing(text):
        reasons.append(AI_TEMPLATE_STYLE)
    if _claims_a_send_was_completed(text):
        reasons.append(ACTION_DECLARED_WITHOUT_PROOF)
    if _states_an_observation_as_current(text):
        reasons.append(MARKET_OBSERVATION_AS_CURRENT)
    if _is_too_long(text):
        reasons.append(RESPONSE_TOO_LONG)
    if _has_unnecessary_header(text):
        reasons.append(UNNECESSARY_HEADER)
    if _has_an_artificial_list(text):
        reasons.append(ARTIFICIAL_LIST)
    if _promises_an_unconnected_capability(text, connected_families):
        reasons.append(PROMISES_UNCONNECTED_CAPABILITY)
    if _converts_an_unknown_to_zero(text, tool_outputs):
        reasons.append(UNKNOWN_CONVERTED_TO_ZERO)
    if _points_to_an_absent_list(text, tool_outputs):
        reasons.append(REFERS_TO_ABSENT_LIST)
    if user_message is not None and density_mismatch(classify_expected_density(user_message), text):
        reasons.append(RESPONSE_DENSITY_MISMATCH)
    if (
        evidence_requirement == "preuve_d_outil"
        and not any(output.strip() for output in tool_outputs)
        and not text.rstrip().endswith("?")
    ):
        reasons.append(EVIDENCE_REQUIRED_MISSING)
    return VerifierResult(status="repair" if reasons else "pass", repair_reasons=reasons)


#: #3241 (#3190.2/.12, lot P11 30/09) — la réparation ACTIVE, sans bufferiser :
#: le texte est déjà diffusé, donc le levier « ajouter une limite » (nommé par
#: la spec REPAIR) PROLONGE la réponse d'une précision. Seuls les motifs qu'une
#: limite répare honnêtement en ont une ; la FORME (longueur, titre, liste,
#: densité, gabarit) ne se répare pas en ajoutant du texte. Jamais un second
#: calcul : les motifs viennent de ``verify_response``.
LIMIT_ADDED = "limite_ajoutee"
_REPAIR_ADDENDA: dict[str, dict[str, str]] = {
    ACTION_DECLARED_WITHOUT_PROOF: {
        "fr": "Précision : je n'ai rien envoyé ni écrit — ce message est préparé, l'envoi reste ton geste.",
        "en": "Clarification: I sent nothing and wrote nothing — this message is prepared, sending stays your move.",
    },
    PROMISES_UNCONNECTED_CAPABILITY: {
        "fr": "Précision : je ne peux pas le faire d'ici — l'outil correspondant n'est pas connecté à ton espace.",
        "en": "Clarification: I can't do that from here — the matching tool isn't connected to your workspace.",
    },
    EVIDENCE_REQUIRED_MISSING: {
        "fr": "Précision : cette réponse ne s'appuie sur aucun résultat d'outil ce tour — à vérifier avant de la citer.",
        "en": "Clarification: this answer rests on no tool result this turn — check it before quoting it.",
    },
    UNKNOWN_CONVERTED_TO_ZERO: {
        "fr": "Précision : ce que j'ai écrit « 0 » n'est pas zéro — c'est non mesuré, je ne l'ai pas pu évaluer.",
        "en": "Clarification: what I wrote as “0” is not zero — it is not measured, I could not assess it.",
    },
    REFERS_TO_ABSENT_LIST: {
        "fr": "Précision : je n'ai aucune liste de comptes à te montrer ce tour — la recherche n'a rien renvoyé. Précise ou relance-la.",
        "en": "Clarification: I have no list of accounts to show you this turn — the search returned nothing. Refine it or run it again.",
    },
    UNSUPPORTED_CLAIM: {
        "fr": "Précision : certains chiffres ci-dessus ne viennent d'aucun résultat d'outil de ce tour — à vérifier avant de les citer.",
        "en": "Clarification: some figures above come from no tool result this turn — check them before quoting them.",
    },
}


#: #3396/#3215 — les deux motifs qui disent « aucun résultat d'outil » parlent
#: d'UN seul fait ; ils partagent un seul libellé (celui de EVIDENCE_REQUIRED_MISSING).
_NO_TOOL_RESULT_REASONS = (EVIDENCE_REQUIRED_MISSING, UNSUPPORTED_CLAIM)


def repair_addendum(repair_reasons: Iterable[str], language: str = "fr", *, tools_answered: bool = False) -> str:
    """Les précisions à ajouter à une réponse déjà diffusée, une par motif
    réparable (ordre du catalogue, stable) ; ``""`` sans motif réparable.

    ``tools_answered`` (#3396) : au moins un outil a répondu ce tour. La
    précision « aucun résultat d'outil » serait alors FAUSSE (la réponse cite
    ses sources) : elle ne sort que si AUCUN outil n'a répondu, et jamais sous
    deux libellés (#3215)."""
    reasons = set(repair_reasons)
    lang = language if language in ("fr", "en") else "fr"
    if tools_answered:
        reasons -= set(_NO_TOOL_RESULT_REASONS)
    elif reasons & set(_NO_TOOL_RESULT_REASONS):
        reasons -= set(_NO_TOOL_RESULT_REASONS)
        reasons.add(EVIDENCE_REQUIRED_MISSING)
    lines = [texts[lang] for code, texts in _REPAIR_ADDENDA.items() if code in reasons]
    return "\n\n" + "\n".join(lines) if lines else ""


def states_no_tool_result(reply: str) -> bool:
    """#3215 — la réponse porte-t-elle la précision « aucun résultat d'outil » ?
    (le libellé du catalogue, dans les deux langues ; jamais un autre motif)."""
    text = reply or ""
    return any(label in text for label in (_REPAIR_ADDENDA[EVIDENCE_REQUIRED_MISSING]["fr"], _REPAIR_ADDENDA[EVIDENCE_REQUIRED_MISSING]["en"]))


__all__ = [
    "LIMIT_ADDED",
    "states_no_tool_result",
    "repair_addendum",
    "ACTION_DECLARED_WITHOUT_PROOF",
    "AI_TEMPLATE_STYLE",
    "ARTIFICIAL_LIST",
    "MARKET_OBSERVATION_AS_CURRENT",
    "PROMISES_UNCONNECTED_CAPABILITY",
    "REFERS_TO_ABSENT_LIST",
    "EVIDENCE_REQUIRED_MISSING",
    "RESPONSE_DENSITY_MISMATCH",
    "RESPONSE_TOO_LONG",
    "UNNECESSARY_HEADER",
    "UNKNOWN_CONVERTED_TO_ZERO",
    "UNSUPPORTED_CLAIM",
    "VerifierResult",
    "VerifierStatus",
    "verify_response",
]
