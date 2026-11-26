"""#1927 — L'ÉTAT DU FIL : ce que Laura a RÉELLEMENT vu, préparé et demandé dans
CETTE conversation.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT
─────────────────────────────────────────────────────────────────────────────
« Trouve-moi des comptes à Toulouse », puis « uniquement ceux sans
référencement », puis « et avec une équipe Data » : Laura repartait de zéro à
chaque message. La seule mémoire d'un fil était le résumé roulant
(`apps/api/src/modules/memory/memory.service.ts::nextSummary`) — deux extraits
de 200 caractères par échange, 2 000 au total, sans aucune structure : ni les
objets cités, ni les critères de la recherche, ni les actions préparées, ni les
questions déjà posées. `find_accounts` reconstruisait des critères neufs à
chaque appel (`chat_tools.py`, branche `find_accounts`), et « lui », « ce
compte », « le deuxième » n'avaient rien sur quoi se résoudre.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE FAIT — DÉTERMINISTE, SANS APPEL DE MODÈLE
─────────────────────────────────────────────────────────────────────────────
Il PROJETTE les appels d'outils réellement exécutés dans un tour (leurs sorties,
pas le texte du modèle) sur un état borné, et le prolonge d'un tour à l'autre :

* ``objects``   — comptes, contacts, consultants, besoins, missions rendus par
                  un outil, identifiant + libellé, du plus récent au plus ancien ;
* ``focus``     — par nature, l'objet « dont on parle » : cité SEUL (un dossier
                  lu, la cible d'une action). Une liste de plusieurs objets de la
                  même nature le fait tomber — « ce compte » y redevient ambigu ;
* ``last_list`` — la dernière liste rendue, dans son ORDRE d'affichage : c'est ce
                  qui donne un sens à « le deuxième » ;
* ``searches``  — la dernière recherche préparée par outil de recherche, avec les
                  critères que l'outil a RETENUS (pas ceux que le modèle a tentés) ;
* ``proposals`` — les actions préparées : leur TYPE et leur cible, jamais leur
                  contenu (D65 : le corps d'un message ne repart jamais vers le
                  modèle) ;
* ``questions`` — les questions de précision posées par `ask_clarification`.

#1995 — et ce que Laura NOMME dans les options d'une clarification entre dans
``last_list`` / ``objects`` AVEC son identifiant, quand elle l'avait sous les
yeux ce tour-là (une sortie d'outil, ou le résumé des contacts du contexte, qui
porte « contact_id: … »). C'est le seul véhicule d'un tour à l'autre : le résumé
des contacts n'existe QUE lorsque le message nomme un compte que l'API sait
résoudre, et « Sandrine Pata a 9h30 » n'en nomme plus aucun.

* ``ruled_out``   — les pistes que Laura a ÉCARTÉES, avec leur raison (#1927.3) ;
* ``assumptions`` — les hypothèses sur lesquelles elle avance (#1927.4) ;
* ``accepted``    — les résultats ACCEPTÉS, nommés par le modèle : distincts de
                    ``last_list`` (la dernière liste RENDUE), pas ce qui a été
                    RETENU dedans (#2268.7).

#1927.3 / #1927.4 — LE REFUS TIENT, LA VOIE S'EST OUVERTE AILLEURS. Ce module a
longtemps porté un refus écrit : « les extraire par mots-clés serait un détecteur
fragile qui rate en silence ». Il n'est PAS levé — aucun détecteur textuel n'a
été posé, et `tests/test_chat_thread_ruled_out.py` en porte le témoin (une
réponse qui DIT « j'écarte Lyon » ne met rien dans l'état). Ce qui a changé est
que le modèle a maintenant un endroit TYPÉ où le dire : `ask_clarification`
porte `ruled_out` et `assumptions` à côté de `question` et `options`, et ce
service projette ces champs comme il projette déjà les questions.

⚠️ La borne se dit : `ask_clarification` est retirée de la boîte à outils POUR
LE TOUR QUI SUIT celui où une clarification a été posée, pas pour le reste de
la conversation (§9.4, revu #3854/BEL-LAU-1008-003 — bannir l'outil à vie
empêchait une qualification neuve, utile, sur une tâche différente, plus tard
dans le même fil). Le porteur reste celui du tour de clarification ; un tour
sans clarification ne produit toujours aucune option écartée.

Tout contenu vient d'une sortie d'outil DÉJÀ montrée au modèle dans un tour
précédent : l'état ne fait entrer dans le prompt aucune donnée nouvelle, il
empêche seulement qu'elle se perde.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from app.services.account_suitability import VERDICTS as _ACCOUNT_VERDICTS
from app.services.chat_requested_mode import current_turn_thread
from app.services.constraint_graph import (  # noqa: F401  (CONSTRAINT_VALUE_MAX : miroir de la borne zod, relu par la garde des bornes)
    CONSTRAINT_TYPES,
    CONSTRAINT_VALUE_MAX,
    ThreadConstraint,
    annotate_constraints,
    constraints_from_message,
    constraints_from_raw,
    merge_message_constraints,
)

THREAD_STATE_VERSION = 1

# ── Les bornes — miroir exact de `packages/contracts/src/schemas/conversation-thread-state.ts` ──
#
# Calculées pour qu'un état REMPLI à chaque plafond, valeurs à leur longueur
# maximale et accentuées, reste sous 16 Ko sérialisé (test
# `test_the_worst_case_state_stays_small`). La contrainte SQL de la colonne
# (`1792800130000-ConversationThreadState`) est deux fois plus large.
OBJECTS_MAX = 12
FOCUS_MAX = 5
LAST_LIST_MAX = 10
PROPOSALS_MAX = 5
QUESTIONS_MAX = 3
# #2269.13 — trois choix simples PLUS un « autre » catch-all : 4, pas 3, pour
# laisser sa place au quatrième sans le faire couper en silence.
OPTIONS_MAX = 4
RULED_OUT_MAX = 3
ASSUMPTIONS_MAX = 3
RULED_OUT_OPTION_MAX = 60
RULED_OUT_REASON_MAX = 120
ASSUMPTION_MAX = 120
# #2268.1 / #2268.5 / #2268.10 — l'objectif actif, les critères exclus du
# périmètre, les décisions prises. Même discipline que RULED_OUT/ASSUMPTIONS :
# un état REMPLI à ces plafonds reste dans l'enveloppe de
# `test_the_worst_case_state_stays_small`.
GOAL_MAX = 160
EXCLUDED_MAX = 3
EXCLUDED_CRITERION_MAX = 60
EXCLUDED_REASON_MAX = 120
DECISIONS_MAX = 3
DECISION_MAX = 120
# #2268.12 / #2268.13 / #2268.15 — le job en cours, l'étape actuelle du
# travail, le prochain geste prévu. Même discipline, même outil
# (`note_thread_context`), un état REMPLACE l'ancien comme `goal` — un fil n'a
# qu'un job actif à la fois.
CURRENT_JOB_MAX = 160
CURRENT_STEP_MAX = 160
NEXT_STEP_MAX = 160
# #2268.7 — les résultats ACCEPTÉS, distincts de `last_list` (la dernière liste
# RENDUE, pas ce que l'utilisateur a RETENU dedans). Même discipline, même
# outil (`note_thread_context`), même forme que `decisions` : un texte
# s'accumule, un nouveau ne remplace pas l'ancien.
ACCEPTED_MAX = 3
ACCEPTED_MAX_LEN = 120
# #3178.1 / #3178.2 — le périmètre persistant (groupe/filiales), distinct de
# `focus` (l'objet dont on parle CE tour). Même discipline que FOCUS_MAX :
# un état REMPLI à ce plafond, deux fois (inclus + exclus), reste dans
# l'enveloppe de `test_the_worst_case_state_stays_small`.
SCOPE_ENTITIES_MAX = 6
# #3178.3b — les `entity_kind` du résolveur qui désignent un GROUPE (racine de périmètre).
GROUP_ENTITY_KINDS = frozenset({"group", "parent_company", "holding"})
# #3187.4 (LAU-FINAL-193) — une ENTITÉ déjà traitée dans ce fil (« BoursoBank »
# après « et côté BoursoBank ? »), pour qu'une demande ELLIPTIQUE ultérieure
# (« et les autres ? ») l'exclue sans la redemander. Distincte d'`excluded`
# (`ThreadExcluded` porte un CRITÈRE de périmètre, jamais une entreprise, une
# ville ou une personne — même frontière que `ThreadRuledOut`/`ThreadExcluded`
# ci-dessus) : ceci porte l'entité elle-même. Même outil (`note_thread_context`),
# même forme qu'`excluded` : un texte s'accumule, un nouveau ne remplace pas
# l'ancien.
TREATED_ENTITIES_MAX = 3
TREATED_ENTITY_MAX = 80
TREATED_ENTITY_REASON_MAX = 120
# #3191.3.12 (LAU-FINAL-197, épopée #3220) — les précautions déjà énoncées
# dans ce fil, nommées par le modèle via `note_thread_context`, même forme
# et même discipline que `decisions` : un texte s'accumule, un nouveau ne
# remplace pas l'ancien. Ce que ce champ permet : ne PAS répéter mot pour
# mot une réserve déjà dite, sans jamais en supprimer une qui redevient
# pertinente pour la première fois dans ce tour (elle n'est simplement pas
# encore dans la liste).
PRECAUTIONS_MAX = 3
PRECAUTION_MAX = 160
# #193.1 (LAU-FINAL-193, épopée #3230) — les FACETTES restantes de la spec
# (#3187) au-delà de `treated_entities` (#193.4, déjà livré) : chacune suit la
# même voie que `goal`/`current_job` ci-dessus — un champ TYPÉ que le modèle
# NOMME lui-même via `note_thread_context`, jamais un détecteur qui relit une
# phrase (refus #1927.3/.4 tenu, voir l'en-tête du module). #193.2 (schéma
# riche par facette : status/introduced_at_turn/confirmed/superseded/scope/
# source/expiry) reste écarté — même décision que pour les 8 champs déjà
# livrés : « remplace si renommé » sert l'intention (ne pas perdre d'info)
# sans le cycle de vie complet, qui serait une refonte de `ThreadState`.
#
# Un SEUL mécanisme générique (`facets`, clé → valeur) plutôt que 15 attributs
# dupliqués sur `ThreadState` : le TYPE reste un champ fermé que le modèle
# nomme explicitement (`FACET_TYPES`, miroir de l'enum zod), donc la même
# garantie que 15 champs séparés, pour une seule voie de lecture/écriture à
# maintenir. Chaque type a son propre libellé (`FACET_LABELS`) pour le rendu
# dans le prompt.
FACET_TYPES: tuple[str, ...] = (
    "group",
    "projects",
    "programs",
    "internal_clients",
    "sectors",
    "professions",
    "technologies",
    "geographies",
    "sizes",
    "roles",
    "channels",
    "periods",
    "requested_counts",
    "requested_sources",
    "refused_sources",
)
FACET_LABELS: dict[str, str] = {
    "group": "Groupe",
    "projects": "Projets",
    "programs": "Programmes",
    "internal_clients": "Clients internes",
    "sectors": "Secteurs",
    "professions": "Métiers",
    "technologies": "Technologies",
    "geographies": "Géographies",
    "sizes": "Tailles",
    "roles": "Rôles",
    "channels": "Canaux",
    "periods": "Périodes",
    "requested_counts": "Nombres demandés",
    "requested_sources": "Sources demandées",
    "refused_sources": "Sources refusées",
}
FACET_VALUE_MAX = 40
# #194.1 (LAU-FINAL-194, épopée #3233) — le catalogue NOMMÉ des 10 types de
# correction utilisateur de la spec (#3188) : rien d'équivalent dans le dépôt,
# `get_account_work_contract` a un catalogue voisin mais pour les OBJECTIFS de
# travail, pas pour les corrections d'une réponse. Un type CONNU que le modèle
# NOMME via `note_thread_context`, jamais deviné — même discipline que
# `FACET_TYPES` ci-dessus.
CORRECTION_TYPES: tuple[str, ...] = (
    "wrong_source",
    "wrong_entity",
    "wrong_scope",
    "wrong_role",
    "wrong_sector",
    "contact_left",
    "too_generic",
    "wrong_assumption",
    "style_preference",
    "unwanted_action",
)
CORRECTION_LABELS: dict[str, str] = {
    "wrong_source": "Mauvaise source",
    "wrong_entity": "Mauvaise entité",
    "wrong_scope": "Mauvais scope",
    "wrong_role": "Mauvais rôle",
    "wrong_sector": "Mauvais secteur",
    "contact_left": "Contact parti",
    "too_generic": "Résultat trop générique",
    "wrong_assumption": "Hypothèse fausse",
    "style_preference": "Préférence de style",
    "unwanted_action": "Action non désirée",
}
CORRECTION_SUMMARY_MAX = 80
ID_MAX = 64
LABEL_MAX = 80
ACTION_MAX = 40
TOOL_MAX = 40
QUESTION_MAX = 200
OPTION_MAX = 60
CRITERION_TEXT_MAX = 120
CRITERION_LIST_MAX = 10
CRITERION_ITEM_MAX = 40

OBJECT_KINDS: tuple[str, ...] = ("account", "contact", "consultant", "need", "mission")

# ── #1927.7 — les outils de recherche qui savent AFFINER ─────────────────────
#
# Un outil y figure quand il porte PLUSIEURS critères indépendants qu'une
# phrase suivante peut resserrer sans les répéter. Les autres recherches voisines
# n'y sont pas, et c'est délibéré :
#   - `find_needs` / `search_missions` / `search_dormant_network` : un seul
#     critère (un libellé, une fenêtre de jours) — affiner, c'est remplacer ;
#   - `search_rfps`, `list_accounts_to_act` : aucun critère.
#
# #3706 — `region` est un critère affinable des DEUX recherches de comptes :
# « finalement dans toute la France » est `drop: ["region"]` (la zone s'en va,
# « luxe » reste), « plutôt en Auvergne-Rhône-Alpes » la remplace. Avant, la
# région n'y figurait pas : le retrait était accepté puis ignoré en silence.
REFINABLE_SEARCH_CRITERIA: dict[str, tuple[str, ...]] = {
    # #3762 — `city` rejoint les critères affinables : une ville résolue par la
    # source officielle (jamais devinée par le modèle, `chat_tools.py`) doit
    # survivre à la question suivante au même titre que `department`.
    "find_accounts": (
        "sectors",
        "department",
        "city",
        "region",
        "headcount",
        "signals",
        "keywords",
        # #3941.1 — le préréglage « startup » délimite QUI est cherché, comme `sectors`.
        "company_profile",
    ),
    "search_market_memory": (
        "technology",
        "location",
        "esn",
        "role_family",
        "employee_min",
        "employee_max",
        # #2991 (#2287.15 / #2287.17) — la taille et le recours externe
        # observé générique rejoignent les critères affinables.
        "size",
        "external_recourse_observed",
    ),
    # #3222 — `zone`/`radius_km` (tiroir « Ville et rayon ») rejoignent les
    # critères affinables : « et à Lyon » resserre sans répéter la compétence.
    "search_talents": ("query", "available_within_days", "zone", "radius_km"),
    # #3201.1 (épopée #3224) — le tour d'horizon lui-même n'avait AUCUNE mémoire
    # de fil : une contrainte posée (« à Toulouse », « effectif 250-999 ») ne
    # survivait pas à la question suivante, contrairement à `find_accounts`.
    # `signals` en est exclu : le tour d'horizon interroge le registre public,
    # qui ne sait pas les appliquer (chat_tools.py, description de l'outil) —
    # les mémoriser laisserait croire à un critère RETENU qui ne l'est jamais.
    "run_account_search": (
        "sectors",
        "exclude_sectors",
        "department",
        "city",
        # #4429.3 — un rayon demandé délimite la zone comme la ville : il se garde d'un tour à l'autre.
        "radius_km",
        "region",
        "headcount",
        "keywords",
        "site_basis",
        # #3866 — le domaine de l'offre se garde d'un tour à l'autre (sans lui, un `refine` qui ne
        # le repasse pas rendait « Recommandé » un recrutement hors domaine). Ce n'est PAS un
        # périmètre : `_NON_SCOPE_CRITERIA` l'écarte des tests de « même recherche ».
        "offer",
        # #3941.1 — le préréglage « startup » délimite QUI est cherché, comme `sectors` : il
        # rejoint les critères affinables, pas `_NON_SCOPE_CRITERIA`.
        "company_profile",
        # #4408 — « petite structure » délimite QUI est cherché : il survit à « et à Lyon ».
        "purchasing_process",
    ),
}

# #3866 — critères mémorisés et affinables qui ne délimitent pas QUELLES entreprises sont
# cherchées : les redonner (même changés) ne fait jamais repartir une recherche de zéro.
# #3983 — `site_basis` précise la ZONE (siège / implantation) sans en être une : « et au siège
# seulement » en relance garde la zone du tour précédent au lieu de repartir de zéro.
_NON_SCOPE_CRITERIA: frozenset[str] = frozenset({"offer", "site_basis"})


def _scope_criteria(tool_name: str) -> tuple[str, ...]:
    return tuple(key for key in REFINABLE_SEARCH_CRITERIA.get(tool_name, ()) if key not in _NON_SCOPE_CRITERIA)


#: #4429.3 — les critères qui DÉLIMITENT la zone : un seul à la fois (le dernier nommé gagne), `radius_km` suit la ville.
_ZONE_CRITERIA = ("city", "department", "region")

REFINE_FLAG = "refine"
DROP_FIELD = "drop"

# #3704 (recette prod 08/10, 8c42a4032c RÉFUTÉE) — « donne-moi aussi des besoins » juste
# après un tour d'horizon changeait d'entreprises (zone perdue) : signe que le modèle avait
# oublié `refine: true`, le seul levier déjà éprouvé pour ce tour d'horizon (#3704.2) — mais
# un levier de PROMPT, donc probabiliste. Filet déterministe, borné à `run_account_search` et
# à cette forme précise : un appel qui ne porte NI secteur NI zone NI mot-clé propres (il ne
# demande visiblement QU'un enrichissement sur ce qui a déjà été trouvé) est reconnu comme LA
# MÊME recherche même sans le drapeau. Une relance qui redonne elle-même un secteur ou une
# zone part sciemment de zéro (#3762) : jamais fusionnée.
_IMPLICIT_REFINE_TOOLS: frozenset[str] = frozenset({"run_account_search"})


def _is_needs_only_follow_up(tool_name: str, tool_input: dict[str, Any]) -> bool:
    if tool_name not in _IMPLICIT_REFINE_TOOLS:
        return False
    return not any(tool_input.get(key) for key in _scope_criteria(tool_name))


def _norm_criterion(value: Any) -> list[str]:
    # #3704 (recette prod 10/10) — le modèle passe parfois un scalaire ("Finance") là où le schéma
    # attend une liste : lu comme une liste d'un élément, sinon le critère « différait » à tort.
    items = value if isinstance(value, list) else ([value] if isinstance(value, str) and value.strip() else [])
    return sorted(str(v).strip().lower() for v in items)


def _same_criterion(given: Any, previous: Any) -> bool:
    """#3704 — « le même critère » à la lecture tolérante : égalité, ou chaque valeur redonnée
    recouvre une valeur du tour précédent (« Banque, finance » redit « finance »). Un secteur
    d'une AUTRE famille (« industry » contre « finance ») ne recouvre rien : vrai changement (#3762)."""
    new, old = _norm_criterion(given), _norm_criterion(previous)
    if new == old:
        return True
    return bool(new) and bool(old) and all(any(n in o or o in n for o in old) for n in new)


# #3704 (RAN, recette ND 10/10 en prod) — la DEMANDE elle-même : « donne-moi aussi des besoins »,
# « ajoute leurs signaux ». Un message court qui ne fait qu'AJOUTER une information à la liste déjà
# rendue n'est jamais un nouveau filtre, quel que soit le champ où le modèle range ce mot
# (`signals`, `keywords`…). Borné : ≤ 8 mots, un verbe/adverbe d'ajout ET un nom d'enrichissement.
_ENRICHMENT_ADD_RE = re.compile(r"\b(aussi|ajoute\w*|en plus|et leurs?|avec leurs?|donne\w*[- ]moi)\b", re.IGNORECASE)
_ENRICHMENT_NOUN_RE = re.compile(r"\b(besoins?|signaux|signal|contacts?|technologies|recrutements?)\b", re.IGNORECASE)
# Mots d'enrichissement que le modèle range parfois dans `keywords` : jamais un critère de sélection.
_ENRICHMENT_KEYWORDS = frozenset({"besoin", "besoins", "signal", "signaux", "contact", "contacts", "needs"})


def _message_asks_enrichment_only() -> bool:
    thread = current_turn_thread()
    if thread is None:
        return False
    message = thread[0].strip()
    if not message or len(message.split()) > 8:
        return False
    return bool(_ENRICHMENT_ADD_RE.search(message) and _ENRICHMENT_NOUN_RE.search(message))


def _enrichment_message_follow_up(tool_name: str, tool_input: dict[str, Any], previous: dict[str, Any] | None) -> bool:
    """La demande ne fait qu'ajouter un enrichissement ET chaque critère de sélection redonné
    (hors mots d'enrichissement rangés dans `keywords`) est identique à celui du tour précédent."""
    if tool_name not in _IMPLICIT_REFINE_TOOLS or not previous or not _message_asks_enrichment_only():
        return False
    for key in _scope_criteria(tool_name):
        value = tool_input.get(key)
        if not value:
            continue
        if key == "keywords" and all(
            str(word).strip().lower() in _ENRICHMENT_KEYWORDS
            for word in (value if isinstance(value, list) else [value])
        ):
            continue
        if not _same_criterion(value, previous.get(key)):
            return False
    return True


def _restates_previous_scope_with_signals(
    tool_name: str, tool_input: dict[str, Any], previous: dict[str, Any] | None
) -> bool:
    """#3704 (recette prod MN, 41f1f288) — « donne-moi aussi des besoins » : le modèle
    RÉÉCRIT le secteur (identique) mais OMET la région, sans `refine` → région perdue.
    Un enrichissement par `signals` n'est jamais un filtre : si chaque critère redonné
    est identique à celui du tour précédent, c'est la MÊME recherche (les autres
    critères se gardent). Un critère DIFFÉRENT reste un vrai changement (#3762)."""
    if tool_name not in _IMPLICIT_REFINE_TOOLS or not previous or not tool_input.get("signals"):
        return False
    given = [key for key in _scope_criteria(tool_name) if tool_input.get(key)]
    return bool(given) and all(_same_criterion(tool_input[key], previous.get(key)) for key in given)


# #194.2 (LAU-FINAL-194, épopée #3233, reste) — le libellé FR de chaque outil
# affinable, pour le NOMMER dans le prompt (relance CIBLÉE) sans répéter son
# nom technique.
REFINABLE_SEARCH_LABELS: dict[str, str] = {
    "find_accounts": "la recherche de comptes",
    "search_market_memory": "la recherche dans l'observation du marché",
    "search_talents": "la recherche de talents",
    # Intégration Z (29/09) : `run_account_search` (#3201.1) a rejoint
    # `REFINABLE_SEARCH_CRITERIA` sur une branche parallèle — sans son libellé,
    # une correction qui l'invalide ferait tomber le rendu du bloc d'état.
    "run_account_search": "le tour d'horizon des comptes",
}
# Au plus un outil affinable par entrée du catalogue : aucune combinatoire à
# borner séparément.
CORRECTION_INVALIDATES_MAX = len(REFINABLE_SEARCH_CRITERIA)

# Les actions dont la proposition désigne une PERSONNE du portefeuille. La cible
# est lue sur ces deux clés seulement — liste BLANCHE : un champ ajouté demain à
# une proposition (un objet, un corps, une adresse) n'entre pas dans l'état.
_CONTACT_TARGET_KEYS = ("contact_id", "contact_name")


def _text(value: Any, limit: int) -> str:
    """Une ligne, bornée. Un libellé repart dans le prompt : un saut de ligne y
    ouvrirait une fausse section."""
    if value is None or isinstance(value, (dict, list, tuple, set)):
        return ""
    text = " ".join(str(value).split())[:limit]
    # zod (l'API) compte une longueur en unités UTF-16, Python en points de
    # code : 80 émojis font 160 unités, et l'API refuserait l'état ENTIER. La
    # borne se tient dans l'unité de celui qui la vérifie.
    while len(text.encode("utf-16-le")) > 2 * limit:
        text = text[:-1]
    return text.rstrip()


@dataclass(frozen=True)
class ThreadObject:
    kind: str
    id: str
    label: str

    def to_wire(self) -> dict[str, str]:
        return {"kind": self.kind, "id": self.id, "label": self.label}


@dataclass(frozen=True)
class ThreadProposal:
    action: str
    target_kind: str | None = None
    target_id: str | None = None
    target_label: str | None = None
    #: #194.2 (résidu, épopée #3233) — l'OUTIL d'origine, posé SEULEMENT pour un
    #: outil que `ThreadCorrection.invalidates` peut nommer (`REFINABLE_SEARCH_CRITERIA`) :
    #: c'est le seul lien proposition → outil que le fil porte, jamais deviné.
    #: Absent (`None`) partout ailleurs et sur tout état écrit avant ce lot.
    tool: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        wire: dict[str, str | None] = {
            "action": self.action,
            "target_kind": self.target_kind,
            "target_id": self.target_id,
            "target_label": self.target_label,
        }
        if self.tool:
            wire["tool"] = self.tool
        return wire


@dataclass(frozen=True)
class ThreadQuestion:
    question: str
    options: tuple[str, ...] = ()
    # #3854 (BEL-LAU-1008-003) — le TOUR qui l'a posée, estampillé par le
    # collecteur (jamais nommé par le modèle) ; ``None`` = fil d'avant
    # l'estampille. Même convention que `ThreadConstraint.source_turn`
    # (#3224, lot X36) : c'est ce qui permet de bornER le retrait de l'outil
    # `ask_clarification` au tour qui vient de la poser, au lieu de la vie
    # entière du fil (voir `has_open_question` ci-dessous).
    source_turn: int | None = None

    def to_wire(self) -> dict[str, Any]:
        wire: dict[str, Any] = {"question": self.question, "options": list(self.options)}
        if self.source_turn is not None:
            wire["source_turn"] = self.source_turn
        return wire


@dataclass(frozen=True)
class ThreadRuledOut:
    """#1927.3 — une piste écartée. La raison peut manquer : « j'ai écarté Lyon »
    est déjà une information, « j'ai écarté » n'en est pas une."""

    option: str
    reason: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        return {"option": self.option, "reason": self.reason}


@dataclass(frozen=True)
class ThreadExcluded:
    """#2268.5 — un CRITÈRE explicitement exclu du PÉRIMÈTRE (« sans les grands
    groupes », « hors Île-de-France »), distinct d'une piste ÉCARTÉE
    (`ThreadRuledOut` porte une entreprise, une ville, une personne — ceci
    porte un critère de recherche)."""

    criterion: str
    reason: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        return {"criterion": self.criterion, "reason": self.reason}


#: #3706 — la relation du point d'entrée choisi à la maison mère du périmètre.
ENTRY_RELATIONS: tuple[str, ...] = ("groupe", "maison", "filiale", "direction")


@dataclass(frozen=True)
class ThreadPersistentScope:
    """#3178.1 / #3178.2 — LE PÉRIMÈTRE PERSISTANT d'un fil (le « Facet Ledger »
    de LAU-FINAL-184) : le groupe ou la maison mère que Laura garde comme
    périmètre de recherche, distinct de `ThreadState.focus` (l'objet « dont on
    parle » CE tour, qui bascule à chaque compte cité). `root_entity` REMPLACE
    l'ancien comme `goal` ; `included_entities`/`excluded_entities`
    s'ACCUMULENT, bornés, comme `ruled_out` — jamais extraits d'une phrase,
    seulement ce que le modèle NOMME via `note_thread_context`."""

    root_entity: ThreadObject
    included_entities: tuple[ThreadObject, ...] = ()
    excluded_entities: tuple[ThreadObject, ...] = ()
    # #3178.2b (#3227) — les entités CITÉES dans ce périmètre sans compte
    # résolu (« une filiale de Vinci, laquelle je ne sais pas »), nommées par
    # le modèle via `note_thread_context.group_scope_unresolved`, jamais
    # extraites d'une phrase — même discipline que `included_entities`. Des
    # LIBELLÉS, pas des `ThreadObject` : un `ThreadObject` porte un `id`, et
    # c'est précisément l'absence d'id qui range une entité ici plutôt que
    # dans `included_entities`.
    unresolved_entities: tuple[str, ...] = ()
    # #3706 — le POINT D'ENTRÉE que la personne a CHOISI dans ce périmètre (groupe, maison,
    # filiale, direction) : les contacts et actions suivants suivent CETTE entité. Une
    # recommandation de Laura n'y entre jamais (voir `ENTRY_RELATIONS`).
    entry_entity: ThreadObject | None = None
    entry_relation: str | None = None

    def to_wire(self) -> dict[str, Any]:
        return {
            "entry_entity": self.entry_entity.to_wire() if self.entry_entity else None,
            "entry_relation": self.entry_relation,
            "root_entity": self.root_entity.to_wire(),
            "included_entities": [obj.to_wire() for obj in self.included_entities],
            "excluded_entities": [obj.to_wire() for obj in self.excluded_entities],
            "unresolved_entities": list(self.unresolved_entities),
        }


@dataclass(frozen=True)
class ThreadTreatedEntity:
    """#3187.4 — une entité (filiale, société, périmètre) déjà TRAITÉE dans ce
    fil, nommée par le modèle via `note_thread_context` — jamais extraite d'une
    phrase (même refus que `ThreadRuledOut`/`ThreadExcluded` ci-dessus)."""

    entity: str
    reason: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        return {"entity": self.entity, "reason": self.reason}


@dataclass(frozen=True)
class ThreadCorrection:
    """#194.1 / #194.2 (LAU-FINAL-194, épopée #3233) — la correction
    utilisateur reconnue dans ce fil : son TYPE (catalogue fermé,
    `CORRECTION_TYPES`) et l'écart reconnu EN UNE PHRASE (#194.2 étape 2 —
    « Tu as raison, j'ai utilisé la mauvaise couche »). Nommée par le modèle
    via `note_thread_context`, jamais devinée. Remplace la précédente, comme
    `goal` : une seule correction active à la fois dans ce fil.

    #194.2 (reste) — ``invalidates`` porte les outils affinables
    (`REFINABLE_SEARCH_CRITERIA`) dont le PLAN de recherche retenu est
    désormais invalide : c'est l'invalidation FORMELLE et la reconstruction
    du plan demandées par la spec (#3188 étapes 4/5/6), au format déjà
    tranché pour #193.2 — un champ nommé, pas un objet séparé."""

    correction_type: str
    summary: str
    invalidates: tuple[str, ...] = ()

    def to_wire(self) -> dict[str, Any]:
        return {
            "correction_type": self.correction_type,
            "summary": self.summary,
            "invalidates": list(self.invalidates),
        }


@dataclass
class ThreadState:
    """L'état d'un fil. Chaque liste est ordonnée du plus récent au plus ancien."""

    objects: list[ThreadObject] = field(default_factory=list)
    focus: list[ThreadObject] = field(default_factory=list)
    last_list_tool: str = ""
    last_list: list[ThreadObject] = field(default_factory=list)
    # outil → critères retenus ; l'ordre d'insertion porte la récence (le plus
    # récent en tête, voir `ThreadStateCollector._remember_search`).
    searches: dict[str, dict[str, Any]] = field(default_factory=dict)
    proposals: list[ThreadProposal] = field(default_factory=list)
    questions: list[ThreadQuestion] = field(default_factory=list)
    # #1927.3 / #1927.4 — nommés par le modèle dans une sortie typée, jamais
    # extraits d'une phrase.
    ruled_out: list[ThreadRuledOut] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    # #2268.1 / #2268.5 / #2268.10 — nommés par le modèle via `note_thread_context`,
    # jamais extraits d'une phrase (même refus que ruled_out/assumptions).
    goal: str | None = None
    excluded: list[ThreadExcluded] = field(default_factory=list)
    decisions: list[str] = field(default_factory=list)
    # #2268.12 / #2268.13 / #2268.15 — nommés par le modèle via
    # `note_thread_context`, comme `goal` : un nouveau REMPLACE l'ancien.
    current_job: str | None = None
    current_step: str | None = None
    next_step: str | None = None
    # #2268.7 — les résultats acceptés, nommés par le modèle, jamais extraits
    # de `last_list` : une liste RENDUE n'est pas ce qui a été RETENU dedans.
    accepted: list[str] = field(default_factory=list)
    # #3178.1 / #3178.2 — le périmètre persistant (groupe/filiales), nommé par
    # le modèle via `note_thread_context`, comme `goal`/`ruled_out` : jamais
    # extrait d'une phrase, jamais remplacé silencieusement par `focus`.
    persistent_scope: ThreadPersistentScope | None = None
    # #3187.4 — les entités déjà traitées dans ce fil, nommées par le modèle,
    # jamais extraites d'une phrase.
    treated_entities: list[ThreadTreatedEntity] = field(default_factory=list)
    # #3191.3.12 — les précautions déjà énoncées dans ce fil, nommées par le
    # modèle, jamais extraites d'une phrase (même refus que ruled_out/assumptions).
    precautions: list[str] = field(default_factory=list)
    # #193.1 — les facettes nommées par le modèle, clé (`FACET_TYPES`) → valeur.
    # Un type REMPLACE l'ancien quand le modèle le renomme, comme `goal`.
    facets: dict[str, str] = field(default_factory=dict)
    # #194.1 / #194.2 — la correction utilisateur reconnue dans ce fil, nommée
    # par le modèle. Remplace la précédente, comme `goal`.
    active_correction: ThreadCorrection | None = None
    # #3201.1 / #3201.2 (épopée #3224) — le graphe de contraintes, nommé par le
    # modèle via `note_thread_context.constraints` : une par type (vocabulaire
    # fermé de 17), la dernière nommée remplace. `detect_conflicts` le relit.
    constraints: list[ThreadConstraint] = field(default_factory=list)
    # #3224 (lot X36) — le NUMÉRO du dernier tour joué dans ce fil (le collecteur
    # l'incrémente à chaque tour). Ne compte pas dans `is_empty` : un fil sans
    # rien d'autre reste vide. 0 = fil d'avant le compteur.
    turns: int = 0
    # #3223 (lot R17, épopée #3223) — le DERNIER verdict de compte connu dans ce
    # fil (`account_suitability.VERDICTS`), pour que le tour suivant puisse dire
    # si une correction a changé le résultat, sans deviner. Un nouveau verdict
    # remplace l'ancien, comme `goal`/`current_job` ; un tour sans verdict garde
    # celui d'avant (copié par `ThreadStateCollector.__init__`).
    last_account_verdict: str | None = None

    def is_empty(self) -> bool:
        return not (
            self.objects
            or self.focus
            or self.last_list
            or self.searches
            or self.proposals
            or self.questions
            or self.ruled_out
            or self.assumptions
            or self.goal
            or self.excluded
            or self.decisions
            or self.current_job
            or self.current_step
            or self.next_step
            or self.accepted
            or self.persistent_scope
            or self.treated_entities
            or self.precautions
            or self.facets
            or self.active_correction
            or self.constraints
            or self.last_account_verdict
        )

    def has_questions(self) -> bool:
        return bool(self.questions)

    def has_open_question(self) -> bool:
        """#3854 (BEL-LAU-1008-003) — une clarification reste « ouverte » (elle
        retire `ask_clarification` de la boîte à outils, §9.4) SEULEMENT pour le
        tour qui suit immédiatement celui où elle a été posée, pas pour le reste
        de la vie du fil : c'est ce qui force le modèle à utiliser la réponse
        tout de suite sans la reposer, sans empêcher une clarification NEUVE,
        sur une tâche différente, plus tard dans la même conversation.

        ``source_turn`` absent (fil d'avant l'estampille #3224) ⇒ ouverte, comme
        avant ce lot — aucune régression sur une conversation déjà en cours au
        moment du déploiement."""
        if not self.questions:
            return False
        turn = self.questions[0].source_turn
        return turn is None or turn >= self.turns

    def focus_of(self, kind: str) -> ThreadObject | None:
        return next((obj for obj in self.focus if obj.kind == kind), None)

    def copy(self) -> ThreadState:
        return ThreadState(
            objects=list(self.objects),
            focus=list(self.focus),
            last_list_tool=self.last_list_tool,
            last_list=list(self.last_list),
            searches={tool: dict(criteria) for tool, criteria in self.searches.items()},
            proposals=list(self.proposals),
            questions=list(self.questions),
            ruled_out=list(self.ruled_out),
            assumptions=list(self.assumptions),
            goal=self.goal,
            excluded=list(self.excluded),
            decisions=list(self.decisions),
            current_job=self.current_job,
            current_step=self.current_step,
            next_step=self.next_step,
            accepted=list(self.accepted),
            persistent_scope=self.persistent_scope,
            treated_entities=list(self.treated_entities),
            precautions=list(self.precautions),
            facets=dict(self.facets),
            active_correction=self.active_correction,
            constraints=list(self.constraints),
            turns=self.turns,
            last_account_verdict=self.last_account_verdict,
        )

    def to_wire(self) -> dict[str, Any]:
        """La forme qui voyage IA → API (stockée telle quelle) puis API → IA.
        Clés en snake_case, comme tout le corps de `/chat/message`."""
        return {
            "version": THREAD_STATE_VERSION,
            "objects": [obj.to_wire() for obj in self.objects],
            "focus": [obj.to_wire() for obj in self.focus],
            "last_list": (
                {"tool": self.last_list_tool, "items": [obj.to_wire() for obj in self.last_list]}
                if self.last_list
                else None
            ),
            "searches": [{"tool": tool, "criteria": dict(criteria)} for tool, criteria in self.searches.items()],
            "proposals": [proposal.to_wire() for proposal in self.proposals],
            "questions": [question.to_wire() for question in self.questions],
            "ruled_out": [entry.to_wire() for entry in self.ruled_out],
            "assumptions": list(self.assumptions),
            "goal": self.goal,
            "excluded": [entry.to_wire() for entry in self.excluded],
            "decisions": list(self.decisions),
            "current_job": self.current_job,
            "current_step": self.current_step,
            "next_step": self.next_step,
            "accepted": list(self.accepted),
            "persistent_scope": self.persistent_scope.to_wire() if self.persistent_scope else None,
            "treated_entities": [entry.to_wire() for entry in self.treated_entities],
            "precautions": list(self.precautions),
            "facets": {facet_type: self.facets[facet_type] for facet_type in FACET_TYPES if facet_type in self.facets},
            "correction": self.active_correction.to_wire() if self.active_correction else None,
            "constraints": [constraint.to_wire() for constraint in self.constraints],
            "turns": self.turns,
            "last_account_verdict": self.last_account_verdict,
        }


# ── Lecture tolérante du fil ─────────────────────────────────────────────────


def _object_from(raw: Any) -> ThreadObject | None:
    if not isinstance(raw, dict):
        return None
    kind = raw.get("kind")
    ident = _text(raw.get("id"), ID_MAX)
    label = _text(raw.get("label"), LABEL_MAX)
    if kind not in OBJECT_KINDS or not ident or not label:
        return None
    return ThreadObject(kind=kind, id=ident, label=label)


def _scope_entity_from(raw: Any) -> ThreadObject | None:
    """#3178.1 / #3178.2 — une entité du périmètre persistant : toujours un
    compte (`kind="account"`), le seul type que le Facet Ledger porte —
    `group_scope_root`/`_includes`/`_excludes` n'envoient jamais de `kind`,
    contrairement à `objects`/`focus`."""
    if not isinstance(raw, dict):
        return None
    ident = _text(raw.get("id"), ID_MAX)
    label = _text(raw.get("label"), LABEL_MAX)
    if not ident or not label:
        return None
    return ThreadObject(kind="account", id=ident, label=label)


def _objects_from(raw: Any, limit: int) -> list[ThreadObject]:
    seen: set[tuple[str, str]] = set()
    kept: list[ThreadObject] = []
    for item in raw if isinstance(raw, list) else []:
        obj = _object_from(item)
        if obj is None or (obj.kind, obj.id) in seen:
            continue
        seen.add((obj.kind, obj.id))
        kept.append(obj)
    return kept[:limit]


def _criterion(value: Any) -> Any:
    """Une valeur de critère lisible, ou ``None`` : un texte, un entier, ou une
    liste de textes. Rien d'autre ne décrit un filtre de recherche."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, list):
        items = [_text(item, CRITERION_ITEM_MAX) for item in value]
        items = [item for item in items if item][:CRITERION_LIST_MAX]
        return items or None
    text = _text(value, CRITERION_TEXT_MAX)
    return text or None


def _criteria_from(tool: str, raw: Any) -> dict[str, Any]:
    allowed = REFINABLE_SEARCH_CRITERIA.get(tool, ())
    if not isinstance(raw, dict):
        return {}
    kept: dict[str, Any] = {}
    for name, value in raw.items():
        if name not in allowed:
            continue
        clean = _criterion(value)
        if clean is not None:
            kept[name] = clean
    return kept


def _proposal_from(raw: Any) -> ThreadProposal | None:
    if not isinstance(raw, dict):
        return None
    action = _text(raw.get("action"), ACTION_MAX)
    if not action:
        return None
    kind = raw.get("target_kind")
    ident = _text(raw.get("target_id"), ID_MAX)
    label = _text(raw.get("target_label"), LABEL_MAX)
    tool = raw.get("tool")
    tool = tool if isinstance(tool, str) and tool in REFINABLE_SEARCH_CRITERIA else None
    if kind not in OBJECT_KINDS or not ident or not label:
        return ThreadProposal(action=action, tool=tool)
    return ThreadProposal(action=action, target_kind=kind, target_id=ident, target_label=label, tool=tool)


def _question_from(raw: Any) -> ThreadQuestion | None:
    if not isinstance(raw, dict):
        return None
    question = _text(raw.get("question"), QUESTION_MAX)
    if not question:
        return None
    options = raw.get("options")
    clean = [_text(option, OPTION_MAX) for option in (options if isinstance(options, list) else [])]
    turn = raw.get("source_turn")
    source_turn = turn if isinstance(turn, int) and not isinstance(turn, bool) and turn >= 1 else None
    return ThreadQuestion(
        question=question,
        options=tuple(option for option in clean if option)[:OPTIONS_MAX],
        source_turn=source_turn,
    )


def _ruled_out_from(raw: Any) -> ThreadRuledOut | None:
    if not isinstance(raw, dict):
        return None
    option = _text(raw.get("option"), RULED_OUT_OPTION_MAX)
    if not option:
        return None
    reason = _text(raw.get("reason"), RULED_OUT_REASON_MAX)
    return ThreadRuledOut(option=option, reason=reason or None)


def _excluded_from(raw: Any) -> ThreadExcluded | None:
    if not isinstance(raw, dict):
        return None
    criterion = _text(raw.get("criterion"), EXCLUDED_CRITERION_MAX)
    if not criterion:
        return None
    reason = _text(raw.get("reason"), EXCLUDED_REASON_MAX)
    return ThreadExcluded(criterion=criterion, reason=reason or None)


def _treated_entity_from(raw: Any) -> ThreadTreatedEntity | None:
    if not isinstance(raw, dict):
        return None
    entity = _text(raw.get("entity"), TREATED_ENTITY_MAX)
    if not entity:
        return None
    reason = _text(raw.get("reason"), TREATED_ENTITY_REASON_MAX)
    return ThreadTreatedEntity(entity=entity, reason=reason or None)


def _facets_from(raw: Any) -> dict[str, str]:
    """#193.1 — les facettes, relues d'une clé PAR TYPE (jamais un type hors de
    `FACET_TYPES` : une liste blanche, comme le reste de ce module)."""
    if not isinstance(raw, dict):
        return {}
    kept: dict[str, str] = {}
    for facet_type in FACET_TYPES:
        value = _text(raw.get(facet_type), FACET_VALUE_MAX)
        if value:
            kept[facet_type] = value
    return kept


def _invalidates_from(raw: Any) -> tuple[str, ...]:
    """#194.2 (reste) — un outil CONNU (`REFINABLE_SEARCH_CRITERIA`)
    seulement, jamais deviné : un nom hors catalogue disparaît, sans faire
    tomber les autres ni la correction elle-même."""
    kept: list[str] = []
    for tool in _as_list(raw):
        name = str(tool)
        if name in REFINABLE_SEARCH_CRITERIA and name not in kept:
            kept.append(name)
    return tuple(kept[:CORRECTION_INVALIDATES_MAX])


def _correction_from(raw: Any) -> ThreadCorrection | None:
    if not isinstance(raw, dict):
        return None
    correction_type = raw.get("correction_type")
    if correction_type not in CORRECTION_TYPES:
        return None
    summary = _text(raw.get("summary"), CORRECTION_SUMMARY_MAX)
    if not summary:
        return None
    return ThreadCorrection(
        correction_type=correction_type,
        summary=summary,
        invalidates=_invalidates_from(raw.get("invalidates")),
    )


def thread_state_from_wire(raw: Any) -> ThreadState:
    """L'état relu depuis le corps de la requête (``ChatRequest.thread_state``).

    Tolérant ENTRÉE PAR ENTRÉE : un élément illisible disparaît seul, une clé
    inconnue n'est pas gardée, une version inconnue rend un état VIDE — jamais
    une erreur (un tour de chat ne tombe pas pour sa mémoire), jamais une
    valeur devinée. C'est pourquoi le champ est un ``dict`` côté pydantic et non
    un modèle strict : un seul élément mal formé rejetterait le tour entier en
    422 (même leçon que ``PinnedMemoryItem``)."""
    if not isinstance(raw, dict) or raw.get("version") != THREAD_STATE_VERSION:
        return ThreadState()
    state = ThreadState(objects=_objects_from(raw.get("objects"), OBJECTS_MAX))
    focus: list[ThreadObject] = []
    for obj in _objects_from(raw.get("focus"), FOCUS_MAX):
        if all(existing.kind != obj.kind for existing in focus):
            focus.append(obj)
    state.focus = focus
    last_list = raw.get("last_list")
    if isinstance(last_list, dict):
        items = _objects_from(last_list.get("items"), LAST_LIST_MAX)
        tool = _text(last_list.get("tool"), TOOL_MAX)
        if items and tool:
            state.last_list_tool, state.last_list = tool, items
    for search in raw.get("searches") if isinstance(raw.get("searches"), list) else []:
        if not isinstance(search, dict):
            continue
        tool = search.get("tool")
        if tool in REFINABLE_SEARCH_CRITERIA and tool not in state.searches:
            state.searches[tool] = _criteria_from(tool, search.get("criteria"))
    state.proposals = [p for p in map(_proposal_from, _as_list(raw.get("proposals"))) if p][:PROPOSALS_MAX]
    state.questions = [q for q in map(_question_from, _as_list(raw.get("questions"))) if q][:QUESTIONS_MAX]
    state.ruled_out = [r for r in map(_ruled_out_from, _as_list(raw.get("ruled_out"))) if r][:RULED_OUT_MAX]
    state.assumptions = [text for text in (_text(a, ASSUMPTION_MAX) for a in _as_list(raw.get("assumptions"))) if text][
        :ASSUMPTIONS_MAX
    ]
    state.goal = _text(raw.get("goal"), GOAL_MAX) or None
    state.excluded = [e for e in map(_excluded_from, _as_list(raw.get("excluded"))) if e][:EXCLUDED_MAX]
    state.decisions = [text for text in (_text(d, DECISION_MAX) for d in _as_list(raw.get("decisions"))) if text][
        :DECISIONS_MAX
    ]
    state.current_job = _text(raw.get("current_job"), CURRENT_JOB_MAX) or None
    state.current_step = _text(raw.get("current_step"), CURRENT_STEP_MAX) or None
    state.next_step = _text(raw.get("next_step"), NEXT_STEP_MAX) or None
    state.accepted = [text for text in (_text(a, ACCEPTED_MAX_LEN) for a in _as_list(raw.get("accepted"))) if text][
        :ACCEPTED_MAX
    ]
    state.persistent_scope = _persistent_scope_from(raw.get("persistent_scope"))
    state.treated_entities = [e for e in map(_treated_entity_from, _as_list(raw.get("treated_entities"))) if e][
        :TREATED_ENTITIES_MAX
    ]
    state.precautions = [text for text in (_text(p, PRECAUTION_MAX) for p in _as_list(raw.get("precautions"))) if text][
        :PRECAUTIONS_MAX
    ]
    state.facets = _facets_from(raw.get("facets"))
    state.active_correction = _correction_from(raw.get("correction"))
    state.constraints = annotate_constraints(constraints_from_raw(raw.get("constraints")))
    turns = raw.get("turns")
    state.turns = turns if isinstance(turns, int) and not isinstance(turns, bool) and turns > 0 else 0
    _last_verdict = raw.get("last_account_verdict")
    state.last_account_verdict = _last_verdict if _last_verdict in _ACCOUNT_VERDICTS else None
    return state


def _persistent_scope_from(raw: Any) -> ThreadPersistentScope | None:
    if not isinstance(raw, dict):
        return None
    root = _object_from(raw.get("root_entity"))
    if root is None:
        # Un périmètre SANS racine ne décrit rien : jamais un état à moitié
        # rempli, comme un critère exclu sans son texte.
        return None
    included = tuple(_objects_from(raw.get("included_entities"), SCOPE_ENTITIES_MAX))
    excluded = tuple(_objects_from(raw.get("excluded_entities"), SCOPE_ENTITIES_MAX))
    unresolved = tuple(
        text for text in (_text(item, LABEL_MAX) for item in _as_list(raw.get("unresolved_entities"))) if text
    )[:SCOPE_ENTITIES_MAX]
    entry = _scope_entity_from(raw.get("entry_entity"))
    relation = raw.get("entry_relation")
    return ThreadPersistentScope(
        root_entity=root,
        included_entities=included,
        excluded_entities=excluded,
        unresolved_entities=unresolved,
        entry_entity=entry if relation in ENTRY_RELATIONS else None,
        entry_relation=relation if entry and relation in ENTRY_RELATIONS else None,
    )


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


# ── #1927.1 — ce qu'une sortie d'outil NOMME ─────────────────────────────────


def _rows(output: dict[str, Any], key: str) -> list[dict[str, Any]]:
    return [row for row in _as_list(output.get(key)) if isinstance(row, dict)]


def _named(kind: str, rows: list[dict[str, Any]], id_key: str, label_key: str) -> list[ThreadObject]:
    return [
        obj
        for obj in (_object_from({"kind": kind, "id": row.get(id_key), "label": row.get(label_key)}) for row in rows)
        if obj is not None
    ]


def cited_objects(tool_name: str, output: dict[str, Any]) -> tuple[list[ThreadObject], bool]:
    """Les objets qu'une sortie d'outil NOMME, et si elle les rend comme une LISTE.

    Les clés lues sont celles que `chat_tools.py` RÉÉCRIT (vivier, besoins,
    missions, dossiers de compte) ou, pour les réponses relayées telles quelles,
    celles du pont NestJS (`copilot-bridge.controller.ts` : `accounts/to-act` →
    `accounts[].companyName`, `contacts/dormant` → `contacts[].contact_id`). Un
    outil absent d'ici ne nomme rien : l'observation du marché ne rend AUCUN
    identifiant (par dessein), la messagerie jamais (D65)."""
    if tool_name == "get_account_briefing":
        return _named("account", [output], "account_id", "company_name"), False
    if tool_name == "compare_accounts":
        return _named("account", _rows(output, "dossiers"), "account_id", "company_name"), True
    if tool_name == "analyze_named_companies":
        # #5054 — les comptes d'un lot de noms (réutilisés de l'espace ou lancés) sont « les comptes du fil » :
        # « compare-les » les reprend. Un nom non lancé / homonyme / introuvable n'a pas d'identifiant : il n'entre pas.
        known = [
            {"id": row.get("account_id"), "label": row.get("account_name") or row.get("company")}
            for row in _rows(output, "known")
        ]
        launched = [{"id": row.get("account_id"), "label": row.get("company")} for row in _rows(output, "launched")]
        return _named("account", [*known, *launched], "id", "label"), True
    if tool_name in ("search_workspace_accounts", "get_accounts_by_owner"):
        # #5054 (recette 01/11) — les comptes de l'ESPACE rendus par une recherche/liste sont « les comptes du fil » :
        # sans ça « compare-les » n'avait rien à reprendre et le modèle choisissait lui-même (un dossier hors fil).
        # Bornés au propriétaire par le pont qui les rend ; un compte sans identifiant n'entre pas.
        rows = [
            {"id": row.get("account_id") or row.get("id"), "label": row.get("company_name") or row.get("companyName")}
            for row in _rows(output, "accounts")
        ]
        return _named("account", rows, "id", "label"), True
    if tool_name == "search_talents":
        return _named("consultant", _rows(output, "talents"), "id", "full_name"), True
    if tool_name in ("search_missions", "get_mission_risks"):
        return _named("mission", _rows(output, "missions"), "id", "label"), True
    if tool_name == "find_needs":
        return _named("need", _rows(output, "needs"), "id", "label"), True
    if tool_name == "run_matching":
        # #4059.1 — le besoin classé reste « le besoin dont on parle » : chaque CV
        # ajouté ensuite se compare à CE besoin, sans que la personne le ressaisisse.
        need = output.get("need")
        if isinstance(need, dict):
            return _named("need", [need], "needId", "role"), False
        return [], False
    if tool_name == "list_accounts_to_act":
        return _named("account", _rows(output, "accounts"), "id", "companyName"), True
    if tool_name == "search_dormant_network":
        return _named("contact", _rows(output, "contacts"), "contact_id", "full_name"), True
    if tool_name == "get_account_contacts":
        # #AM.20 — les personnes du compte deviennent « la dernière liste » : « la suite » mène à un brouillon.
        return _named("contact", _rows(output, "contacts"), "contact_id", "full_name"), True
    if tool_name == "get_action_plan":
        # #5054 (recette prod 02/11) — « 3 comptes à travailler cette semaine » : les comptes du plan par geste
        # (`gestures[].actions[]`, `accountId` / `companyName`, un compte pouvant figurer sous plusieurs gestes)
        # sont « les comptes du fil ». Un contact du réseau dormant sans compte n'a pas d'`accountId` : il n'entre pas.
        actions = [
            action
            for gesture in _rows(output, "gestures")
            for action in _rows(gesture, "actions")
            if action.get("accountId")
        ]
        unique = list({str(action["accountId"]): action for action in reversed(actions)}.values())[::-1]
        return _named("account", unique, "accountId", "companyName"), True
    if tool_name == "get_reengagement_report":
        # #5054 — le bilan de relance rend ses comptes sous `accounts[]` (`accountId` / `companyName`).
        return _named("account", _rows(output, "accounts"), "accountId", "companyName"), True
    if tool_name == "get_portfolio_priorities":
        # #3769.2 — la priorisation devient la DERNIÈRE LISTE du fil : son raffinement
        # géographique (« seulement en Occitanie ») se reconnaît au tour suivant.
        rows = [row for key in ("now", "toVerify", "toWatch", "notNow") for row in _rows(output, key)]
        return _named("account", rows, "id", "companyName"), True
    return [], False


# ── #1995 — ce que Laura A EU SOUS LES YEUX ce tour-ci ───────────────────────
#
# Recette du 14/09/2026, rejouée en production : Laura propose « Sandrine Pata »
# et « Gerald Oualid » chez THALES, l'utilisateur répond « Sandrine Pata a 9h30 »,
# et Laura répond qu'elle n'a pas l'identifiant de la fiche. Elle l'avait au tour
# d'avant : le résumé des contacts le porte depuis le correctif précédent
# (`apps/api/src/modules/ia-proxy/chat-context.service.ts`, « contact_id: … »).
# Mais ce résumé n'existe QUE quand le message nomme un compte que l'API sait
# résoudre : au tour suivant, « Sandrine Pata a 9h30 » ne nomme plus THALES, donc
# `contactsSummary` est `null` et l'identifiant disparaît. Le seul véhicule d'un
# tour à l'autre est l'état du fil, et il ne voyait que les sorties d'OUTILS.
#
# ⚠️ La correspondance se fait sur ce que Laura a elle-même mis dans ses options,
# contre ce qu'elle avait sous les yeux CE tour-là — jamais un rapprochement par
# nom dans le référentiel (doctrine : deux référentiels ne se joignent pas par le
# nom, et deux homonymes ne se rapprochent jamais). Une option qui désigne deux
# personnes n'en désigne AUCUNE, et un nom que Laura n'avait pas n'entre pas.

_CONTEXT_CONTACT_ID = re.compile(r"\s-\s*contact_id\s*:\s*(\S+)\s*$")


def contacts_shown_in_context(contacts_summary: str | None) -> list[ThreadObject]:
    """Les contacts que le CONTEXTE du tour a mis sous les yeux du modèle.

    Lit la forme écrite par `chat-context.service.ts` — une ligne par contact,
    ``<identité> - <poste> - <rôle> - contact_id: <uuid>`` — et rien d'autre. Une
    ligne sans identifiant lisible ne nomme personne : l'API la laisse SANS
    `contact_id` quand la ligne de base n'en porte pas, et un identifiant absent
    reste absent.
    """
    shown: list[ThreadObject] = []
    for line in (contacts_summary or "").splitlines():
        found = _CONTEXT_CONTACT_ID.search(line)
        if found is None:
            continue
        obj = _object_from({"kind": "contact", "id": found.group(1), "label": line[: found.start()].split(" - ")[0]})
        if obj is not None:
            shown.append(obj)
    return shown


def _fold(text: str) -> str:
    """Casse et accents retirés : le modèle réécrit « Bénard » en « Benard ».
    (`ILIKE` plie la casse, pas les diacritiques — ici les deux sont pliées.)"""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def _is_name_char(char: str) -> bool:
    """Ce qui PROLONGE un nom. Le trait d'union en fait partie : sans lui,
    « Marie » attraperait « Marie-Claire »."""
    return char.isalnum() or char in "-'’"


def _option_names(option: str, name: str) -> bool:
    """L'option NOMME-t-elle ce libellé ? Une occurrence bornée des deux côtés
    par autre chose qu'un caractère de nom — jamais un simple `in`."""
    haystack, needle = _fold(option), _fold(name)
    if not needle:
        return False
    at = haystack.find(needle)
    while at != -1:
        end = at + len(needle)
        before = haystack[at - 1] if at else ""
        after = haystack[end] if end < len(haystack) else ""
        if not (before and _is_name_char(before)) and not (after and _is_name_char(after)):
            return True
        at = haystack.find(needle, at + 1)
    return False


def _nameable_forms(obj: ThreadObject) -> tuple[str, ...]:
    """Les formes sous lesquelles Laura peut écrire cet objet. Une demi-identité
    porte sa mention dans le libellé (« Maximilian D. (nom de famille non
    révélé) ») ; l'option qu'elle écrit ne la porte pas."""
    label = obj.label
    head = label.split(" (", 1)[0].strip()
    return (label,) if head == label else (label, head)


def _anchor_market_memory_on_persistent_scope(
    tool_input: dict[str, Any], scope: ThreadPersistentScope | None
) -> dict[str, Any]:
    """#3177.2 / #3225 (reste, lot M01 29/09) — quand le modèle a déjà fixé un
    PÉRIMÈTRE de groupe (`note_thread_context.group_scope_root`) mais omet
    `company_id` sur CET appel de `search_market_memory`, ancre l'appel sur ce
    périmètre plutôt que de le laisser tomber sur l'axe critères (qui exige au
    moins un filtre) — c'est l'appelant manquant diagnostiqué en recette prod
    (« la source n'a pas répondu dans ce tour », #3177/#3225, 29-30/09). Un
    `company_id` déjà donné n'est JAMAIS remplacé : le modèle garde la main."""
    if scope is None or str(tool_input.get("company_id") or "").strip():
        return tool_input
    return {**tool_input, "company_id": scope.root_entity.id, "include_subsidiaries": True}


class ThreadStateCollector:
    """Prolonge l'état d'un fil pendant UN tour.

    Créé par le routeur à partir de l'état relu, passé à la boucle d'outils
    (`chat_orchestrator.run_chat_with_tools(…, thread=…)`), relu par le routeur
    une fois le tour fini. La boucle l'appelle à deux moments, dans l'ORDRE des
    appels du modèle (jamais l'ordre d'arrivée des lectures concurrentes) :
    ``prepare`` avant d'exécuter un outil, ``record`` après."""

    def __init__(
        self,
        previous: ThreadState | None = None,
        *,
        shown_objects: Sequence[ThreadObject] = (),
    ) -> None:
        self.previous = previous.copy() if previous else ThreadState()
        self.state = self.previous.copy()
        # #3224 (lot X36) — ce tour a un NUMÉRO, que portent les contraintes qu'il pose.
        self.state.turns = self.previous.turns + 1
        # #1995 — ce que le CONTEXTE du tour a mis sous les yeux du modèle
        # (`contacts_shown_in_context`). Rien n'entre dans l'état par ce canal :
        # il sert UNIQUEMENT à reconnaître ce que Laura nomme elle-même.
        self.shown = list(shown_objects)

    # ── #1927.7 — affiner au lieu de repartir de zéro ────────────────────────

    def prepare(self, tool_name: str, tool_input: Any) -> tuple[Any, dict[str, Any] | None]:
        """Rend (entrée à exécuter, bilan de l'affinage ou ``None``).

        Sans ``refine`` ni ``drop`` dans l'appel, l'entrée repart TELLE QUELLE —
        le même objet : le comportement d'avant #1927, à l'octet. Avec
        ``refine: true``, les critères de la dernière recherche préparée par CE
        MÊME outil sont repris ; ceux que l'appel donne les REMPLACENT, ceux
        qu'il nomme dans ``drop`` sont retirés, les autres sont GARDÉS."""
        if tool_name == "search_market_memory" and isinstance(tool_input, dict):
            tool_input = _anchor_market_memory_on_persistent_scope(tool_input, self.state.persistent_scope)
        if (
            tool_name == "run_matching"
            and isinstance(tool_input, dict)
            and not str(tool_input.get("need_id") or "").strip()
        ):
            # #4059.1 — « ajoute ce CV » sans renommer le besoin : on reprend celui que ce fil
            # vient de classer. Jamais un besoin deviné — aucun besoin en focus, l'outil
            # redemande l'identifiant comme avant.
            focus = self.state.focus_of("need")
            if focus is not None:
                return {**tool_input, "need_id": focus.id}, None
            return tool_input, None
        if tool_name == "compare_accounts" and isinstance(tool_input, dict):
            # #5054 — « compare-les » sans identifiants : les comptes que CE fil vient de citer (sorties d'outil
            # seulement, jamais un nom deviné). Des identifiants donnés par le modèle ne sont jamais écrasés ; le
            # routeur `compare` borne de toute façon au propriétaire.
            given = [str(x) for x in _as_list(tool_input.get("account_ids")) if x]
            from_list = [o for o in self.state.last_list if o.kind == "account"]
            cited = {o.id for o in self.state.objects if o.kind == "account"}
            fil_accounts = from_list or [o for o in self.state.objects if o.kind == "account"]
            if not given and fil_accounts:
                return {**tool_input, "account_ids": [o.id for o in fil_accounts]}, None
            if given and cited:
                # #5054 r3 — dès UN compte cité (le plan d'actions en cite 3 : le fil les porte), l'écart se fait; moins
                # de 2 comptes comparables ⇒ le message honnête de #4705.2. Fil SANS compte cité : inchangé.
                # Le fil a ses comptes : un identifiant que AUCUNE sortie d'outil du fil n'a cité (choisi par le
                # modèle, ex. un dossier récent hors fil) n'entre jamais dans la carte. « compare X et Y » nommés
                # passe : leur résolution (`search_workspace_accounts`) les a cités au fil avant cet appel.
                kept = [i for i in given if i in cited]
                if not kept and from_list:
                    # #5054 r4 — rien de ce que le modèle propose n'est du fil : « compare-les » reprend les comptes
                    # NOMMÉS du fil (le routeur dit honnêtement ceux qui ne sont pas comparables), jamais d'autres.
                    return {**tool_input, "account_ids": [o.id for o in from_list]}, None
                if kept != given:
                    return {**tool_input, "account_ids": kept}, None
            return tool_input, None
        if tool_name in ("get_account_contacts", "prepare_message_for_contact") and isinstance(tool_input, dict):
            # #AM.20 — « la suite » sans identifiant : on reprend celui que le fil vient de rendre (le compte
            # de la priorité, la première personne de la liste). Un identifiant donné par le modèle n'est jamais écrasé.
            key, previous_tool, kind = (
                ("account_id", "get_portfolio_priorities", "account")
                if tool_name == "get_account_contacts"
                else ("contact_id", "get_account_contacts", "contact")
            )
            if not str(tool_input.get(key) or "").strip() and self.state.last_list_tool == previous_tool:
                first = self.state.last_list[0] if self.state.last_list else None
                if first is not None and first.kind == kind:
                    return {**tool_input, key: first.id}, None
            return tool_input, None
        allowed = REFINABLE_SEARCH_CRITERIA.get(tool_name)
        if allowed is None or not isinstance(tool_input, dict):
            return tool_input, None
        enrichment_message = (
            REFINE_FLAG not in tool_input
            and tool_name in self.state.searches
            and _enrichment_message_follow_up(tool_name, tool_input, self.state.searches.get(tool_name))
        )
        implicit_refine = (
            REFINE_FLAG not in tool_input
            and tool_name in self.state.searches
            and (
                enrichment_message
                or _is_needs_only_follow_up(tool_name, tool_input)
                or _restates_previous_scope_with_signals(tool_name, tool_input, self.state.searches.get(tool_name))
            )
        )
        if REFINE_FLAG not in tool_input and DROP_FIELD not in tool_input and not implicit_refine:
            return tool_input, None
        fresh = {key: value for key, value in tool_input.items() if key not in (REFINE_FLAG, DROP_FIELD)}
        if enrichment_message and "keywords" in fresh:
            # #3704 (RAN) — « besoins » rangé dans `keywords` est un enrichissement, pas un filtre.
            words = fresh["keywords"] if isinstance(fresh["keywords"], list) else [fresh["keywords"]]
            if all(str(word).strip().lower() in _ENRICHMENT_KEYWORDS for word in words):
                del fresh["keywords"]
        if tool_input.get(REFINE_FLAG) is not True and not implicit_refine:
            return fresh, None
        previous = self.state.searches.get(tool_name)
        dropped = [name for name in allowed if name in {str(v) for v in _as_list(tool_input.get(DROP_FIELD))}]
        kept = {name: value for name, value in (previous or {}).items() if name not in dropped and name not in fresh}
        if any(fresh.get(zone) for zone in _ZONE_CRITERIA):
            # #4429.3 — une zone NOMMÉE remplace la zone précédente : « et à Toulouse » ne garde pas l'Île-de-France.
            kept = {name: value for name, value in kept.items() if name not in _ZONE_CRITERIA + ("radius_km",)}
        refinement = {
            "previous_found": previous is not None,
            "kept": dict(kept),
            "changed": {name: fresh[name] for name in allowed if name in fresh},
            "dropped": dropped,
        }
        merged = {**kept, **fresh}
        if "radius_km" in dropped and merged.get("city") and "radius_km" not in fresh:
            # #4641 — une ville seule part à 100 km par défaut : retirer le rayon (« finalement Toulouse seule ») doit
            # le DIRE à l'outil (`None`), sinon le défaut reviendrait en silence.
            merged["radius_km"] = None
        return _ordered(merged, allowed), refinement

    # ── Ce qu'un appel a produit ─────────────────────────────────────────────

    def record(self, tool_name: str, tool_input: Any, output: Any) -> None:
        """Projette UNE sortie d'outil sur l'état. Une erreur ne produit rien :
        un outil qui n'a rien rendu n'a rien cité, rien préparé.

        #1995 — une clarification n'est pas qu'une question : ses options NOMMENT
        des objets, et ceux que Laura avait sous les yeux y gardent leur
        identifiant (`_remember_named_choices`)."""
        if not isinstance(output, dict) or output.get("error"):
            return
        status = output.get("status")
        if status == "clarification":
            self._remember_question(output)
            return
        if status == "pending_confirmation":
            self._remember_proposal(tool_name, output.get("proposal"))
            return
        if status == "thread_note":
            self._remember_thread_note(output)
            return
        if tool_name in REFINABLE_SEARCH_CRITERIA:
            self._remember_search(tool_name, tool_input)
        objects, is_list = cited_objects(tool_name, output)
        if not objects:
            return
        if tool_name == "get_account_contacts":
            self._keep_contacts_account(tool_input)
        if tool_name == "get_account_briefing":
            self._root_scope_on_resolved_group(output, objects[0])
        if is_list:
            self.state.last_list_tool = tool_name
            self.state.last_list = objects[:LAST_LIST_MAX]
            if len(objects) > 1:
                kinds = {obj.kind for obj in objects}
                self.state.focus = [obj for obj in self.state.focus if obj.kind not in kinds]
            else:
                self._set_focus(objects[0])
        else:
            for obj in objects:
                self._set_focus(obj)
        self._cite(objects)

    def _keep_contacts_account(self, tool_input: Any) -> None:
        """#AM.20 — les personnes d'un compte ne font pas perdre le compte : il reste au contexte (focus + objets cités),
        avec le libellé que le fil lui connaissait déjà."""
        account_id = str(tool_input.get("account_id") or "").strip() if isinstance(tool_input, dict) else ""
        if not account_id:
            return
        known = next(
            (
                obj
                for obj in [*self.state.last_list, *self.state.objects]
                if obj.kind == "account" and obj.id == account_id
            ),
            None,
        )
        if known is not None:
            self._set_focus(known)
            self._cite([known])

    def _root_scope_on_resolved_group(self, output: dict[str, Any], account: ThreadObject) -> None:
        """#3178.3b (#3227) — pose la racine du périmètre quand le dossier lu EST
        un groupe d'après le résolveur (`entity_kind`, posé par
        `entity_resolution.py` seulement sur un état ancré). Jamais par-dessus un
        périmètre que le modèle a déjà nommé, jamais depuis une filiale
        (`parent_names` ne porte que des noms, pas d'identifiant : on ne le
        devine pas)."""
        if self.state.persistent_scope is not None or output.get("entity_kind") not in GROUP_ENTITY_KINDS:
            return
        self.state.persistent_scope = ThreadPersistentScope(root_entity=account)

    def narrow_to_reply(self, reply: str) -> None:
        """#5054 r4 — « les comptes du fil » sont ceux que la RÉPONSE nomme, pas toute la sortie de l'outil.

        `get_portfolio_priorities` rend tout le portefeuille (now, toVerify, toWatch, notNow) alors que la réponse
        n'en montre que 3 : sans ce resserrage, « compare-les » reprenait (ou laissait passer) des comptes que
        l'utilisateur n'a jamais vus. Appelé UNE fois, la réponse finale connue. Une liste de comptes dont la
        réponse ne nomme AUCUN compte reste telle quelle (rien n'est deviné) ; un compte nommé est gardé."""
        accounts = [o for o in self.state.last_list if o.kind == "account"]
        if len(accounts) < 2 or not reply:
            return
        named = [o for o in accounts if any(_option_names(reply, form) for form in _nameable_forms(o))]
        if not named or len(named) == len(accounts):
            return
        unnamed = {o.id for o in accounts} - {o.id for o in named}
        self.state.last_list = [o for o in self.state.last_list if o.kind != "account" or o.id not in unnamed]
        self.state.objects = [o for o in self.state.objects if o.kind != "account" or o.id not in unnamed]
        self.state.focus = [o for o in self.state.focus if o.kind != "account" or o.id not in unnamed]

    def _cite(self, objects: list[ThreadObject]) -> None:
        keys = {(obj.kind, obj.id) for obj in objects}
        older = [obj for obj in self.state.objects if (obj.kind, obj.id) not in keys]
        fresh: list[ThreadObject] = []
        for obj in objects:
            if all((obj.kind, obj.id) != (seen.kind, seen.id) for seen in fresh):
                fresh.append(obj)
        self.state.objects = (fresh + older)[:OBJECTS_MAX]

    def _set_focus(self, obj: ThreadObject) -> None:
        others = [existing for existing in self.state.focus if existing.kind != obj.kind]
        self.state.focus = ([obj] + others)[:FOCUS_MAX]

    def _remember_search(self, tool_name: str, criteria: Any) -> None:
        clean = _criteria_from(tool_name, criteria)
        others = {tool: kept for tool, kept in self.state.searches.items() if tool != tool_name}
        # Une recherche SANS critère (« tous les consultants ») REMPLACE la
        # précédente de cet outil : la garder ferait revenir, au prochain
        # `refine`, un filtre que la personne vient d'abandonner.
        self.state.searches = {tool_name: clean, **others} if clean else others

    def _remember_proposal(self, tool_name: str, proposal: Any) -> None:
        if not isinstance(proposal, dict):
            return
        # `find_accounts` est une recherche ET une proposition : sa proposition
        # porte les critères que l'outil a RETENUS (secteur inventé écarté,
        # mots-clés sans signal écartés) — ce sont eux qu'on garde.
        if tool_name in REFINABLE_SEARCH_CRITERIA:
            self._remember_search(tool_name, proposal)
        target = _object_from(
            {
                "kind": "contact",
                "id": proposal.get(_CONTACT_TARGET_KEYS[0]),
                "label": proposal.get(_CONTACT_TARGET_KEYS[1]),
            }
        )
        entry = ThreadProposal(
            action=_text(proposal.get("action"), ACTION_MAX) or _text(tool_name, ACTION_MAX),
            target_kind=target.kind if target else None,
            target_id=target.id if target else None,
            target_label=target.label if target else None,
            tool=tool_name if tool_name in REFINABLE_SEARCH_CRITERIA else None,
        )
        self.state.proposals = ([entry] + [p for p in self.state.proposals if p != entry])[:PROPOSALS_MAX]
        if target:
            self._set_focus(target)
            self._cite([target])

    def _remember_question(self, output: dict[str, Any]) -> None:
        question = _question_from({"question": output.get("question"), "options": output.get("options")})
        if question is None:
            return
        # #3854 (BEL-LAU-1008-003) — estampillée par LE COLLECTEUR, jamais par le
        # modèle : c'est elle qui borne `has_open_question` au tour qui suit.
        question = replace(question, source_turn=self.state.turns)
        self.state.questions = ([question] + [q for q in self.state.questions if q != question])[:QUESTIONS_MAX]
        # #1995 — les options sont lues sur la sortie BRUTE, pas sur la question
        # bornée : `_question_from` coupe un libellé à OPTION_MAX, et un nom coupé
        # en deux ne désigne plus personne.
        self._remember_named_choices(output.get("options"))
        # #1927.3 / #1927.4 — ce que le modèle a NOMMÉ dans sa sortie typée, et
        # rien d'autre : ni la question, ni les options, ni le texte du tour ne
        # sont relus pour y chercher un refus ou une hypothèse.
        self._remember_ruled_out(output.get("ruled_out"))
        self._remember_assumptions(output.get("assumptions"))

    def _remember_ruled_out(self, raw: Any) -> None:
        for entry in (e for e in map(_ruled_out_from, _as_list(raw)) if e):
            kept = [r for r in self.state.ruled_out if r.option != entry.option]
            self.state.ruled_out = ([entry] + kept)[:RULED_OUT_MAX]

    def _remember_assumptions(self, raw: Any) -> None:
        for text in (_text(item, ASSUMPTION_MAX) for item in _as_list(raw)):
            if not text:
                continue
            kept = [a for a in self.state.assumptions if a != text]
            self.state.assumptions = ([text] + kept)[:ASSUMPTIONS_MAX]

    # #2268.1 / #2268.5 / #2268.10 — CE QUE LAURA NOMME entre les tours : son
    # objectif actif, un critère exclu du périmètre, une décision prise.
    # #2268.12 / #2268.13 / #2268.15 — le job en cours, son étape actuelle, le
    # prochain geste prévu : même voie, même remplacement que `goal`.

    def _remember_thread_note(self, output: dict[str, Any]) -> None:
        goal = _text(output.get("goal"), GOAL_MAX)
        if goal:
            # Un nouvel objectif REMPLACE l'ancien : le fil n'en a qu'un actif
            # à la fois, contrairement aux hypothèses qui s'accumulent.
            self.state.goal = goal
        self._remember_excluded(output.get("excluded"))
        self._remember_decisions(output.get("decisions"))
        # #3347 (recette prod 30/09/2026) — `job_done` EFFACE plutôt que
        # remplace : sans lui, un job noté restait pour toujours (`if
        # current_job:` n'assigne jamais une valeur vide), et
        # `interrupted_work_block` continuait de réclamer « reprendre ? » sur
        # des tours sans rapport avec ce job depuis longtemps clos.
        if output.get("job_done") is True:
            self.state.current_job = None
            self.state.current_step = None
            self.state.next_step = None
        else:
            current_job = _text(output.get("current_job"), CURRENT_JOB_MAX)
            if current_job:
                self.state.current_job = current_job
            current_step = _text(output.get("current_step"), CURRENT_STEP_MAX)
            if current_step:
                self.state.current_step = current_step
            next_step = _text(output.get("next_step"), NEXT_STEP_MAX)
            if next_step:
                self.state.next_step = next_step
        self._remember_accepted(output.get("accepted"))
        self._remember_scope(
            output.get("group_scope_root"),
            output.get("group_scope_includes"),
            output.get("group_scope_excludes"),
            output.get("group_scope_unresolved"),
            output.get("group_scope_entry"),
        )
        self._remember_treated_entities(output.get("treated_entities"))
        self._remember_precautions(output.get("precautions"))
        self._remember_facets(output.get("facets"))
        self._remember_constraints(output.get("constraints"))
        correction = _correction_from(output.get("correction"))
        if correction is not None:
            # #194.2 — une correction REMPLACE la précédente, comme `goal` :
            # ce fil n'a qu'une correction active à la fois.
            self.state.active_correction = correction
            # #194.2 (reste) — invalidation FORMELLE : les outils qu'elle
            # nomme perdent leur plan de recherche retenu, pour que le
            # prochain `refine` ne le retrouve plus et reparte de zéro —
            # repartir de zéro, jamais deviner ce qui reste valide.
            for tool in correction.invalidates:
                self.state.searches.pop(tool, None)
            # #194.2 (résidu) — et la proposition que CET outil avait préparée :
            # le lien est NOMMÉ (`ThreadProposal.tool`), une proposition d'un
            # autre outil ou sans lien reste (jamais une correspondance devinée).
            if correction.invalidates:
                self.state.proposals = [p for p in self.state.proposals if p.tool not in correction.invalidates]

    def note_unfinished_work(self, request: str | None, rounds_done: int, rounds_budget: int) -> None:
        """#3236.2 (a) — un tour APPROFONDI a épuisé son budget de rounds : le
        fil garde le travail laissé en suspens (les champs que
        `INTERRUPTED_WORK_BLOCK` lit déjà) pour que le tour suivant propose de
        reprendre. Jamais par-dessus un job que le modèle a déjà nommé."""
        if self.state.current_job:
            return
        subject = _text(request, CURRENT_JOB_MAX - 40)
        if not subject:
            return
        self.state.current_job = _text(f"Approfondissement interrompu : {subject}", CURRENT_JOB_MAX)
        self.state.current_step = _text(
            f"Budget du tour épuisé après {rounds_done} tour(s) d'outils sur {rounds_budget}", CURRENT_STEP_MAX
        )
        self.state.next_step = "Reprendre l'approfondissement là où le budget s'est arrêté"

    def observe_user_message(self, message: str) -> None:
        """#3224 (Y14 02/10) — les contraintes que le message NOMME (lexique fermé) entrent dans le
        graphe AVANT le modèle : sans cela, rien n'était nommé ni opposé quand il n'appelait pas
        `note_thread_context`. Ce que le modèle nomme ensuite, ce tour, les REMPLACE."""
        named = constraints_from_message(message or "", turn=self.state.turns)
        if named:
            self.state.constraints = merge_message_constraints(self.state.constraints, named)

    def _remember_constraints(self, raw: Any) -> None:
        # #3201.1 — un type NOMMÉ remplace sa valeur précédente, comme une
        # facette ; les autres types restent.
        named = [replace(c, source_turn=self.state.turns) for c in constraints_from_raw(raw)]
        if not named:
            return
        replaced = {c.constraint_type for c in named}
        kept = [c for c in self.state.constraints if c.constraint_type not in replaced]
        merged = {c.constraint_type: c for c in [*kept, *named]}
        self.state.constraints = annotate_constraints([merged[t] for t in CONSTRAINT_TYPES if t in merged])

    def _remember_facets(self, raw: Any) -> None:
        # #193.1 — un type NOMMÉ remplace sa valeur précédente, comme `goal` :
        # une facette n'a qu'une valeur active à la fois.
        for facet_type, value in _facets_from(raw).items():
            self.state.facets[facet_type] = value

    def _remember_accepted(self, raw: Any) -> None:
        for text in (_text(item, ACCEPTED_MAX_LEN) for item in _as_list(raw)):
            if not text:
                continue
            kept = [a for a in self.state.accepted if a != text]
            self.state.accepted = ([text] + kept)[:ACCEPTED_MAX]

    def _remember_precautions(self, raw: Any) -> None:
        """#3191.3.12 — une précaution NOMMÉE par le modèle s'accumule, comme
        `decisions` : un texte déjà présent remonte en tête plutôt que de se
        dupliquer, un nouveau ne chasse aucun ancien tant que le plafond n'est
        pas atteint."""
        for text in (_text(item, PRECAUTION_MAX) for item in _as_list(raw)):
            if not text:
                continue
            kept = [p for p in self.state.precautions if p != text]
            self.state.precautions = ([text] + kept)[:PRECAUTIONS_MAX]

    def _remember_excluded(self, raw: Any) -> None:
        for entry in (e for e in map(_excluded_from, _as_list(raw)) if e):
            kept = [x for x in self.state.excluded if x.criterion != entry.criterion]
            self.state.excluded = ([entry] + kept)[:EXCLUDED_MAX]

    def _remember_treated_entities(self, raw: Any) -> None:
        for entry in (e for e in map(_treated_entity_from, _as_list(raw)) if e):
            kept = [t for t in self.state.treated_entities if t.entity != entry.entity]
            self.state.treated_entities = ([entry] + kept)[:TREATED_ENTITIES_MAX]

    def _remember_decisions(self, raw: Any) -> None:
        for text in (_text(item, DECISION_MAX) for item in _as_list(raw)):
            if not text:
                continue
            kept = [d for d in self.state.decisions if d != text]
            self.state.decisions = ([text] + kept)[:DECISIONS_MAX]

    # #3178.1 / #3178.2 — LE PÉRIMÈTRE PERSISTANT, séparé de `_set_focus`
    # (`focus` bascule au dernier compte cité par construction — voir son
    # docblock). `group_scope_root` REMPLACE, comme `goal` ; les entités
    # incluses/exclues s'ACCUMULENT, bornées, comme `ruled_out` — un compte
    # exclu ne reste jamais inclus (et réciproquement), au lieu de porter les
    # deux verdicts à la fois.
    def _remember_scope(
        self, root_raw: Any, includes_raw: Any, excludes_raw: Any, unresolved_raw: Any = None, entry_raw: Any = None
    ) -> None:
        root = _scope_entity_from(root_raw)
        previous = self.state.persistent_scope
        chosen_entry = previous.entry_entity if previous else None
        chosen_relation = previous.entry_relation if previous else None
        if isinstance(entry_raw, dict) and entry_raw.get("relation") in ENTRY_RELATIONS:
            picked = _scope_entity_from(entry_raw)
            if picked is not None:
                chosen_entry, chosen_relation = picked, entry_raw["relation"]
        included = list(self.state.persistent_scope.included_entities) if self.state.persistent_scope else []
        excluded = list(self.state.persistent_scope.excluded_entities) if self.state.persistent_scope else []
        unresolved = list(self.state.persistent_scope.unresolved_entities) if self.state.persistent_scope else []
        if root is not None:
            # Une nouvelle racine ouvre un NOUVEAU périmètre : l'ancien contenu
            # (inclus/exclus/non résolus d'un autre groupe) ne le suit pas.
            if self.state.persistent_scope is None or self.state.persistent_scope.root_entity.id != root.id:
                included, excluded, unresolved = [], [], []
                # Un autre groupe : le point d'entrée choisi dans l'ancien ne le suit pas.
                if not isinstance(entry_raw, dict):
                    chosen_entry, chosen_relation = None, None
        for entry in (e for e in map(_scope_entity_from, _as_list(includes_raw)) if e):
            excluded = [x for x in excluded if x.id != entry.id]
            included = ([entry] + [x for x in included if x.id != entry.id])[:SCOPE_ENTITIES_MAX]
        for entry in (e for e in map(_scope_entity_from, _as_list(excludes_raw)) if e):
            included = [x for x in included if x.id != entry.id]
            excluded = ([entry] + [x for x in excluded if x.id != entry.id])[:SCOPE_ENTITIES_MAX]
        # #3178.2b — une entité RÉSOLUE (incluse ou exclue) quitte les non
        # résolues : c'est précisément ce que « résolue » veut dire.
        resolved_labels = {entry.label.casefold() for entry in (*included, *excluded)}
        unresolved = [text for text in unresolved if text.casefold() not in resolved_labels]
        for text in (_text(item, LABEL_MAX) for item in _as_list(unresolved_raw)):
            if not text or text.casefold() in resolved_labels:
                continue
            unresolved = ([text] + [x for x in unresolved if x.casefold() != text.casefold()])[:SCOPE_ENTITIES_MAX]
        root_entity = root or (self.state.persistent_scope.root_entity if self.state.persistent_scope else None)
        if root_entity is None:
            return
        self.state.persistent_scope = ThreadPersistentScope(
            root_entity=root_entity,
            included_entities=tuple(included),
            excluded_entities=tuple(excluded),
            unresolved_entities=tuple(unresolved),
            entry_entity=chosen_entry,
            entry_relation=chosen_relation,
        )

    # ── #1995 — le contact que Laura NOMME survit au tour ────────────────────

    def _nameable(self) -> list[ThreadObject]:
        """Ce que Laura pouvait nommer à cet instant : le contexte du tour ET ce
        que ses outils ont déjà rendu dans ce fil. Rien d'autre — surtout pas une
        recherche par nom dans le portefeuille."""
        seen: set[tuple[str, str]] = set()
        candidates: list[ThreadObject] = []
        for obj in [*self.shown, *self.state.objects]:
            if (obj.kind, obj.id) in seen:
                continue
            seen.add((obj.kind, obj.id))
            candidates.append(obj)
        return candidates

    def _named_by(self, option: Any, candidates: list[ThreadObject]) -> ThreadObject | None:
        """L'objet UNIQUE que cette option nomme, ou ``None``.

        Deux objets nommés par la même option (deux homonymes) : aucun. On
        redemande plutôt que de deviner — un rappel posé sur la mauvaise fiche
        est pire qu'un rappel non posé."""
        text = option if isinstance(option, str) else ""
        matched = [obj for obj in candidates if any(_option_names(text, form) for form in _nameable_forms(obj))]
        distinct = {(obj.kind, obj.id) for obj in matched}
        return matched[0] if len(distinct) == 1 else None

    def remember_offered_choices(self, objects: list[ThreadObject]) -> None:
        """#3857 (lot RBJ) — les fiches homonymes dont l'orchestrateur a fait des BOUTONS.

        Chaque objet porte le libellé de son bouton (nom + ce qui le distingue) et son identifiant :
        le clic (« Société Générale — Banque ») désigne UNE fiche, il ne retombe pas sur l'homonymie.
        Même effet que `_remember_named_choices` : la liste rendue, dans l'ordre d'affichage."""
        if len(objects) < 2:
            return
        self.state.last_list_tool = "offer_reply_options"
        self.state.last_list = objects[:LAST_LIST_MAX]
        kinds = {obj.kind for obj in objects}
        self.state.focus = [obj for obj in self.state.focus if obj.kind not in kinds]
        self._cite(objects)

    def _remember_named_choices(self, options: Any) -> None:
        candidates = self._nameable()
        if not candidates:
            return
        chosen: list[ThreadObject] = []
        for option in _as_list(options):
            obj = self._named_by(option, candidates)
            if obj is not None and all((obj.kind, obj.id) != (kept.kind, kept.id) for kept in chosen):
                chosen.append(obj)
        if not chosen:
            # Aucune option ne nomme quelqu'un qu'elle avait : l'état est celui
            # d'avant #1995, au byte près. Un identifiant absent reste absent.
            return
        # Les options sont une LISTE, dans leur ordre d'affichage : « le
        # deuxième » s'y résout comme sur n'importe quelle liste rendue.
        self.state.last_list_tool = "ask_clarification"
        self.state.last_list = chosen[:LAST_LIST_MAX]
        if len(chosen) > 1:
            # Deux objets de la même nature également plausibles : « ce contact »
            # y redevient ambigu — c'est la question qu'on vient de poser.
            kinds = {obj.kind for obj in chosen}
            self.state.focus = [obj for obj in self.state.focus if obj.kind not in kinds]
        else:
            self._set_focus(chosen[0])
        self._cite(chosen)


def _ordered(criteria: dict[str, Any], allowed: tuple[str, ...]) -> dict[str, Any]:
    """Les critères dans l'ordre du schéma de l'outil, puis le reste (ex. ``limit``) :
    deux affinages équivalents rendent la même entrée, octet pour octet."""
    head = {name: criteria[name] for name in allowed if name in criteria}
    tail = {name: value for name, value in criteria.items() if name not in allowed}
    return {**head, **tail}
