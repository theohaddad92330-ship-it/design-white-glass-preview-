"""#2321 — LE ROUTEUR D'INTENTION de Laura (LAU-FINAL-062).

Ce qui n'existait pas
---------------------
Mesuré le 22/09/2026, deux fois, indépendamment : **aucun compilateur ``/chat``
n'existait**. ``app/services/chat_tools.py`` déclare soixante outils, et RIEN ne
lisait une demande pour décider lequel appeler — le choix restait implicite au
raisonnement du modèle. Le contrat de demande structuré
(``app/models/request_intent_contract.py``, #2257) nommait dix-huit champs dont
**deux** seulement avaient un producteur déterministe. Ce module est le
producteur qui manquait pour quatre d'entre eux (``intention_principale``,
``resultat_attendu``, ``objets_a_produire``, ``action_souhaitee``).

Ce qu'il fait, et ce qu'il ne fait pas
--------------------------------------
Il classe une demande sur un vocabulaire de marqueurs **déclarés** (FR ET EN),
puis lit une table de routage. Aucun appel de modèle, aucun réseau, aucune
écriture. Et surtout : il **n'invente rien** — une demande sans marqueur n'est
pas routée, une intention reconnue dont la capacité manque le DIT.

Les trois règles de doctrine qui le commandent
-----------------------------------------------
1. **Un intent NON DÉCLARÉ attend.** :data:`UNDECLARED_CHAT_INTENT` n'ouvre
   aucun outil et lève ``awaits_human``. Jumeau exact d'``UNDECLARED_INTENT_SITE``
   (``packages/contracts/src/schemas/action-os.ts``) : la valeur par défaut d'un
   routage inconnu est celle qui demande une validation humaine, jamais celle
   qui laisse agir.
2. **Aucune PROBABILITÉ.** ``confidence`` a deux valeurs NOMMÉES. Jamais un
   nombre, jamais un pourcentage (refusé six fois, cf. doctrine).
3. **Le copilote PRÉPARE, il n'envoie jamais.** L'étape terminale s'appelle
   ``preparer_le_message`` et elle ATTEND ; aucune étape « envoyer » n'existe
   dans :data:`CHAT_INTENT_PIPELINE`.

Miroir TS : ``packages/contracts/src/schemas/chat-intent-router.ts``. La parité
des vocabulaires est tenue par ``chat-intent-router.parity.test.ts``, qui LIT ce
fichier-ci — deux langages, une seule liste (GA-26).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

# #2321 — le routeur ne redéfinit PAS le vocabulaire des demandes non routées :
# il RÉUTILISE celui qui existe, avec sa contrainte SQL côté API et son écran
# côté back-office (GA-26).
from app.services.unrouted_intent import UNROUTED_INTENT_CATEGORIES

# ── Les dix intentions du ticket ─────────────────────────────────────────────

#: Les dix intentions que le ticket énumère, DANS SON ORDRE — qui est aussi
#: l'ordre de départage d'une égalité de marqueurs. Il ne se réordonne pas sans
#: raison.
CHAT_INTENT_KINDS: tuple[str, ...] = (
    "chercher_du_business",  # #2321.1
    "information_client",  # #2321.2
    "besoin",  # #2321.3
    "profil",  # #2321.4
    "matcher",  # #2321.5
    "proposer",  # #2321.6
    "retour",  # #2321.7
    "signe",  # #2321.8
    "importer",  # #2321.9
    "diagnostic",  # #2321.10
    # #3175.3 (épopée #3215) — « comparer des options », un des six types
    # d'intention du ticket #3175 non encore câblés. AJOUTÉE À LA FIN (GA-08),
    # même règle que `submission` sur `CHAT_INTENT_OBJECT_KINDS` : ce n'est pas
    # l'ordre du ticket #2321 d'origine, donc elle ne s'y insère pas.
    "comparer",
    # #3175.3 — « trouver des contacts », deuxième des six. AJOUTÉE À LA FIN,
    # même raison que `comparer` juste au-dessus.
    "trouver_contacts",
    # #3175.3 — « actualiser une information », troisième des six. RECONNUE,
    # non servie (mesure du 28/09/2026, comme `information_client` /
    # `retour`) : aucun outil de chat ne relance une analyse existante — voir
    # la table plus bas.
    "actualiser",
    # #3175.3 — « choisir un périmètre », quatrième des six. Servie :
    # `resolve_account_territory` existe déjà (« quel est le bon périmètre
    # chez X », « faut-il viser le groupe ou une filiale »).
    "choisir_perimetre",
    # #3175.3 (lot E1 30/09) — les deux derniers des six. « challenger un
    # compte » : servie par la matrice intérêt × pénétrabilité ET les comptes
    # alternatifs. « comprendre un écosystème » : servie par la carte de
    # couverture (périmètre, famille, niveau) ET les ESN observées sur le compte.
    "challenger_un_compte",
    "comprendre_ecosysteme",
)

#: Le défaut. ⚠️ Il ne fait PAS partie de :data:`CHAT_INTENT_KINDS` : ce n'est
#: pas une onzième intention, c'est l'ABSENCE de routage — et l'absence de
#: routage attend un humain.
UNDECLARED_CHAT_INTENT = "non_declaree"

#: ⚠️ Les cinq premiers sont EXACTEMENT ``OBJECT_KINDS`` de
#: ``app/services/chat_thread_state.py``. ``submission`` est le SEUL ajout, et il
#: est ajouté à la FIN (GA-08) : le ticket le nomme comme objet canonique, le fil
#: ne le connaissait pas encore. ``consultant`` tient lieu de « Talent ».
CHAT_INTENT_OBJECT_KINDS: tuple[str, ...] = (
    "account",
    "contact",
    "consultant",
    "need",
    "mission",
    "submission",
)

#: #2321.12 — le RÉSULTAT ATTENDU, dans un vocabulaire FERMÉ. Une phrase libre
#: serait de la donnée fictive dès que le routeur se trompe ; une valeur
#: d'énumération se vérifie.
CHAT_INTENT_RESULT_KINDS: tuple[str, ...] = (
    "liste_de_comptes",
    "signal_qualifie",
    "fiche_besoin",
    "fiche_profil",
    "marche_inverse",  # #2321.22 — le NO-GO du ticket.
    "liste_de_correspondances",
    "shortlist",
    "suivi_de_soumission",
    "mission_creee",
    "plan_d_import",
    "liste_de_priorites",
    # #3175.3 — le résultat de `comparer` : ni une liste (le tri des comptes
    # les uns par rapport aux autres, pas leur simple énumération), ni
    # `liste_de_priorites` (`diagnostic` compare un portefeuille ENTIER sans
    # options nommées ; `comparer` compare des options NOMMÉES par la
    # demande).
    "comparaison_de_comptes",
    # #3175.3 — le résultat de `trouver_contacts` : QUI approcher, distinct de
    # `liste_de_comptes` (des comptes, pas des personnes).
    "liste_de_contacts",
    # #3175.3 — le résultat NOMMÉ de `actualiser`, même si aucun outil ne le
    # produit encore (`tools=()` plus bas) : nommer le résultat attendu, pas
    # seulement la capacité manquante, garde la table lisible en symétrie avec
    # les neuf autres intentions.
    "information_actualisee",
    # #3175.3 — le résultat de `choisir_perimetre` : QUEL niveau adresser
    # (groupe, filiale, BU…), distinct de `liste_de_priorites` (un
    # portefeuille de comptes, pas les niveaux d'UN compte).
    "perimetre_recommande",
    # #3175.3 — le résultat de `challenger_un_compte` : un verdict argumenté
    # sur la cible, pas une liste.
    "compte_challenge",
    # #3175.3 — le résultat de `comprendre_ecosysteme` : la carte de ce qui
    # entoure UN compte (périmètre, couverture, concurrents observés).
    "ecosysteme_du_compte",
)

#: #2321.18 — les étapes d'un job séquencé, DANS L'ORDRE.
#:
#: ⚠️ #2321.19 — le NO-GO du saut d'étape se tient ICI, par construction : une
#: route ne rend jamais un sous-ensemble troué de ce tuple, seulement une
#: TRANCHE CONTIGUË. Sauter de « j'ai un besoin » à « envoie le mail » est donc
#: inexprimable.
#:
#: ⚠️ Aucune étape ne s'appelle « envoyer ».
CHAT_INTENT_PIPELINE: tuple[str, ...] = (
    "qualifier_le_besoin",
    "trouver_les_profils",
    "construire_la_shortlist",
    "faire_valider_la_shortlist",
    "preparer_le_message",
)

#: #2321.16 — les étapes qui ATTENDENT une validation humaine. Les deux
#: dernières : on ne pousse pas une shortlist sans validation, et un message
#: préparé n'est jamais parti.
CHAT_INTENT_STEPS_AWAITING_VALIDATION: tuple[str, ...] = (
    "faire_valider_la_shortlist",
    "preparer_le_message",
)

#: #2257.35 — les marqueurs DÉCLARÉS d'un travail FACULTATIF (FR ET EN) : utile,
#: mais pas nécessaire au résultat demandé. ⚠️ Posé par règle sur un marqueur
#: écrit, jamais deviné ; le marqueur qui a joué sort en ``optional_reason``.
CHAT_INTENT_OPTIONAL_MARKERS: tuple[str, ...] = (
    "accessoirement",
    "en option",
    "facultatif",
    "optionnel",
    "si tu as le temps",
    "si possible",
    "si ca ne te prend pas trop de temps",
    "en bonus",
    "optionally",
    "optional",
    "if you have time",
    "if possible",
    "as a bonus",
    "nice to have",
)

#: #2321.14 — les données qu'une demande peut exiger.
#:
#: ⚠️ Ce que le routeur SAIT de ces données ne vient JAMAIS du texte : l'appelant
#: passe ``available_inputs``, résolu avant le tour. Deviner « il y a un besoin »
#: parce que le mot « besoin » est écrit fabriquerait la donnée que la doctrine
#: interdit.
CHAT_INTENT_INPUT_KINDS: tuple[str, ...] = (
    "compte_actif",
    "besoin_cite",
    "consultant_cite",
    "mission_citee",
)

#: Les champs d'une route — miroir exact de ``CHAT_INTENT_ROUTE_FIELDS``
#: côté TS. Un champ ajouté d'un seul côté fait échouer la garde de parité.
CHAT_INTENT_ROUTE_FIELDS: tuple[str, ...] = (
    "intent",
    "confidence",
    "canonical_object",
    "expected_result",
    "starting_point",
    "known_inputs",
    "missing_inputs",
    "tools",
    "capability_gap",
    "steps",
    "produces_now",
    "awaits_validation",
    "awaits_human",
    "unrouted_category",
    "reasoning",
    # #2257.35 — les travaux facultatifs.
    "optional_steps",
    "optional_reason",
)


@dataclass(frozen=True)
class ChatIntentRoutingEntry:
    """Une ligne de la table de routage."""

    #: L'objet canonique concerné, ou ``None`` quand la demande n'en vise aucun.
    canonical_object: str | None
    #: Ce que la demande attend comme résultat.
    expected_result: str
    #: Les outils de chat qui SERVENT cette intention — des noms qui existent
    #: réellement dans ``chat_tools.py`` (la garde de parité le vérifie et sait
    #: dire NON). Vide = capacité absente, et la route le dit au lieu d'inventer.
    tools: tuple[str, ...]
    #: Ce qui manque ENCORE, nommé. ``None`` quand rien ne manque. C'est la liste
    #: de courses des sept autres lots de compilateurs : ils le passent à
    #: ``None`` quand ils livrent la capacité.
    capability_gap: str | None
    #: L'étape du pipeline que cette intention occupe, ou ``None`` hors pipeline.
    stage: str | None
    #: Les données que cette intention exige pour produire son résultat.
    requires: tuple[str, ...]
    #: Les marqueurs déclarés — FR ET EN. ⚠️ Un marqueur est une DEMANDE, jamais
    #: une simple MENTION de l'objet : « ce besoin » dans « matcher ce besoin »
    #: nomme la matière, pas ce qui est demandé. Mettre une mention ici ferait
    #: gagner la mauvaise intention.
    markers: tuple[str, ...]


#: #3864.1 (BEL-LAU-1008-013, recette bêta 08/10) — « trouve-moi des besoins »
#: ne portait AUCUN marqueur de la table : les marqueurs de l'intention
#: ``besoin`` supposent un besoin déjà connu de la personne (« j'ai un
#: besoin »), jamais une RECHERCHE. La demande retombait sur
#: ``non_declaree`` et Laura expliquait les limites du produit au lieu
#: d'appeler ``find_needs``. Nommé à part (comme ``REVERSE_MARKET_MARKERS``)
#: pour que :func:`asks_to_discover_needs` puisse le relire sans dupliquer la
#: liste (GA-26) — réutilisé par ``markers=`` de l'entrée ``besoin`` ci-dessous.
NEED_DISCOVERY_MARKERS: tuple[str, ...] = (
    "trouve-moi des besoins",
    "trouve moi des besoins",
    "trouve des besoins",
    "cherche-moi des besoins",
    "cherche moi des besoins",
    "cherche des besoins",
    "ou trouver des besoins",
    "quels besoins correspondent",
    "des besoins qui correspondent",
    "besoins ouverts",
    "find me needs",
    "find needs",
    "where can i find needs",
    "what needs match",
    "what open needs",
    "needs that match my expertise",
)


def asks_to_discover_needs(message: str) -> str | None:
    """Le marqueur de RECHERCHE DE BESOINS (#3864.1) présent dans la demande,
    ou ``None``. Pur et déterministe, comme `asks_for_public_news`."""
    hits = _matched(_normalize(message), NEED_DISCOVERY_MARKERS)
    return hits[0] if hits else None


#: ⚠️ LA TABLE. Seul endroit où une intention se décrit (GA-26).
#:
#: Les ``capability_gap`` non nuls sont la mesure du 22/09/2026, faite outil par
#: outil contre ``chat_tools.py`` : l'intention est RECONNUE, la capacité n'existe
#: pas encore. Le routeur le dit — c'est exactement la catégorie
#: ``capacite_absente``, qui existe déjà et qui a un écran. Il ne fabrique pas un
#: outil qui n'est pas là.
CHAT_INTENT_ROUTING_TABLE: dict[str, ChatIntentRoutingEntry] = {
    # #2321.1 — servie : `find_accounts` / `run_account_search`.
    "chercher_du_business": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="liste_de_comptes",
        tools=("find_accounts", "run_account_search"),
        capability_gap=None,
        stage=None,
        requires=(),
        markers=(
            "du business",
            "des prospects",
            "nouveaux clients",
            "nouveau client",
            "qui prospecter",
            "trouver des comptes",
            # #2679 — recette prod du 23/09 : « Trouve-moi des comptes
            # intéressants » n'était PAS routée (`non_declaree`), donc le bloc
            # « ce que le serveur a compris » restait vide et Laura écrivait ses
            # précisions en liste markdown inerte. Le tiret reste après
            # `_normalize`, d'où les deux graphies.
            "trouve-moi des comptes",
            "trouve moi des comptes",
            "comptes interessants",
            "des leads",
            "new business",
            "prospects",
            "new clients",
            "who to prospect",
            "find accounts",
            "find me accounts",
            "interesting accounts",
            "leads",
        ),
    ),
    # #2321.2 — RECONNUE, non servie : aucun outil ne transforme une phrase libre
    # en signal qualifié (mesure du 18/09, reconfirmée le 22/09).
    "information_client": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="signal_qualifie",
        tools=(),
        capability_gap="qualification_d_un_signal_libre",
        stage=None,
        requires=("compte_actif",),
        markers=(
            "j'ai appris",
            "jai appris",
            "on m'a dit",
            "on m a dit",
            "j'ai vu que",
            "jai vu que",
            "il parait que",
            "ils recrutent",
            "ils ouvrent",
            "i heard",
            "i learned",
            "i saw that",
            "they are hiring",
            "they are opening",
        ),
    ),
    # #2321.3 — `find_needs` CHERCHE des besoins existants ; créer/enrichir un
    # besoin depuis un brief libre n'existe pas.
    "besoin": ChatIntentRoutingEntry(
        canonical_object="need",
        expected_result="fiche_besoin",
        tools=("find_needs",),
        capability_gap="creation_d_un_besoin_depuis_un_brief",
        stage="qualifier_le_besoin",
        requires=(),
        markers=(
            "j'ai un besoin",
            "jai un besoin",
            "un besoin de",
            "ils cherchent un",
            "poste a pourvoir",
            "mission a pourvoir",
            "appel d'offres",
            "appel d offres",
            "i have a need",
            "they need a",
            "open role",
            "job opening",
            # #3864.1 — ceux ci-dessus supposent un besoin déjà connu de la
            # personne (« j'ai un besoin »), jamais une RECHERCHE. Réutilise
            # `NEED_DISCOVERY_MARKERS` (défini plus haut, GA-26) au lieu de
            # dupliquer la liste.
            *NEED_DISCOVERY_MARKERS,
        ),
    ),
    # #2321.4 — `search_talents` CHERCHE dans le vivier ; créer un Talent depuis
    # un CV déposé au fil n'est pas un outil de chat.
    "profil": ChatIntentRoutingEntry(
        canonical_object="consultant",
        expected_result="fiche_profil",
        tools=("search_talents",),
        capability_gap="creation_d_un_talent_depuis_un_cv",
        stage="trouver_les_profils",
        requires=(),
        markers=(
            "j'ai un profil",
            "jai un profil",
            "un consultant",
            "un cv",
            "candidat",
            "i have a profile",
            "a consultant",
            "a cv",
            "candidate",
        ),
    ),
    # #2321.5 — servie : `run_matching`.
    "matcher": ChatIntentRoutingEntry(
        canonical_object="need",
        expected_result="liste_de_correspondances",
        tools=("run_matching",),
        capability_gap=None,
        stage="trouver_les_profils",
        requires=("besoin_cite",),
        markers=(
            "matcher",
            "correspondance",
            "rapprocher",
            "qui correspond",
            "match this",
            "matching",
            "who fits",
        ),
    ),
    # #2321.6 — servie : `run_matching` rend la carte `consultant_shortlist`
    # (`reply_blocks.py`). Le « push » vers le client reste #2321.7.
    "proposer": ChatIntentRoutingEntry(
        canonical_object="consultant",
        expected_result="shortlist",
        tools=("run_matching",),
        capability_gap=None,
        stage="construire_la_shortlist",
        requires=(),
        markers=(
            "proposer",
            "shortlist",
            "presenter au client",
            "pousser",
            "propose",
            "present to the client",
            "push",
        ),
    ),
    # #2321.7 — RECONNUE, non servie : `SubmissionEntity` existe côté API, aucun
    # outil de chat ne la met à jour.
    "retour": ChatIntentRoutingEntry(
        canonical_object="submission",
        expected_result="suivi_de_soumission",
        tools=(),
        capability_gap="mise_a_jour_d_une_soumission",
        stage=None,
        requires=(),
        markers=(
            "j'ai un retour",
            "jai un retour",
            "un retour du client",
            "ils ont repondu",
            "ils ont refuse",
            "ils ont accepte",
            "i have feedback",
            "feedback from the client",
            "they replied",
            "they rejected",
            "they accepted",
        ),
    ),
    # #2321.8 — `search_missions` / `propose_mission_proof` existent ; la
    # vérification d'accord double puis la création de Mission, non.
    "signe": ChatIntentRoutingEntry(
        canonical_object="mission",
        expected_result="mission_creee",
        tools=("search_missions", "propose_mission_proof"),
        capability_gap="creation_d_une_mission_apres_accord",
        stage=None,
        requires=(),
        markers=(
            "c'est signe",
            "c est signe",
            "cest signe",
            "contrat signe",
            "bon de commande",
            "on a gagne",
            "it is signed",
            "its signed",
            "signed contract",
            "purchase order",
            "we won",
        ),
    ),
    # #2321.9 — `get_import_overview` rend une VUE ; le plan multi-objets
    # (CV + contacts + besoins) n'existe pas.
    "importer": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="plan_d_import",
        tools=("get_import_overview",),
        capability_gap="plan_d_import_multi_objets",
        stage=None,
        requires=(),
        markers=(
            "importer",
            "mon existant",
            "reprendre mes donnees",
            "fichier excel",
            "mes cv",
            "import my",
            "my existing data",
            "migrate my",
            "excel file",
            "my cvs",
        ),
    ),
    # #2321.10 — servie : `list_accounts_to_act` (priorisation, périmètre comptes).
    "diagnostic": ChatIntentRoutingEntry(
        canonical_object=None,
        expected_result="liste_de_priorites",
        tools=("list_accounts_to_act",),
        capability_gap=None,
        stage=None,
        requires=(),
        markers=(
            "je ne sais pas",
            "par ou commencer",
            "quoi faire",
            "que faire",
            "aide moi",
            "i do not know",
            "i dont know",
            "where to start",
            "what should i do",
            "help me",
        ),
    ),
    # #3175.3 (épopée #3215) — servie : `compare_accounts` existe déjà
    # (portefeuille de l'utilisateur, comptes déjà analysés). Distincte de
    # `diagnostic` : ici la demande NOMME les comptes ou options à comparer,
    # `diagnostic` compare le portefeuille entier sans rien nommer.
    "comparer": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="comparaison_de_comptes",
        tools=("compare_accounts",),
        capability_gap=None,
        stage=None,
        requires=(),
        markers=(
            "comparer ces comptes",
            "comparer mes comptes",
            "comparer les comptes",
            "quel compte attaquer en premier",
            "quel compte prioriser",
            "lequel prioriser",
            "compare these accounts",
            "compare my accounts",
            "which account first",
            "which account should i prioritize",
        ),
    ),
    # #3175.3 (épopée #3215) — servie : `get_account_contacts` (compte actif
    # déjà résolu) et `search_workspace_contacts` (cross-compte, sans compte
    # actif requis) — les DEUX outils existent déjà dans `chat_tools.py`,
    # `requires` reste vide : le second sert même sans compte actif.
    "trouver_contacts": ChatIntentRoutingEntry(
        canonical_object="contact",
        expected_result="liste_de_contacts",
        tools=("get_account_contacts", "search_workspace_contacts"),
        capability_gap=None,
        stage=None,
        requires=(),
        markers=(
            "trouver des contacts",
            "trouve-moi des contacts",
            "trouve moi des contacts",
            "qui contacter chez",
            "les contacts de",
            "par qui je commence",
            "qui connait-on chez",
            "quel contact chez",
            "find contacts",
            "who to contact at",
            "contacts at",
            "who do i start with",
            "who do we know at",
        ),
    ),
    # #3175.3 (épopée #3215) — RECONNUE, non servie : aucun outil de chat ne
    # relance une analyse existante (mesure du 28/09/2026, comme
    # `information_client` / `retour` plus haut) — `refresh_account` est un
    # écran (`agent_docs/chantiers-livres.md`, LAU-059), jamais un outil
    # `/chat`. Servir ce point demanderait de câbler cet écran comme outil de
    # chat, ce que ce lot ne fait pas.
    "actualiser": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="information_actualisee",
        tools=(),
        capability_gap="relance_dune_analyse_existante_depuis_le_chat",
        stage=None,
        requires=("compte_actif",),
        markers=(
            "actualiser ce compte",
            "actualiser les informations",
            "remettre a jour ce compte",
            "rafraichir ce compte",
            "les infos sont-elles a jour",
            "est-ce a jour",
            "update this account",
            "refresh this account",
            "is this information up to date",
            "is this information current",
        ),
    ),
    # #3175.3 (épopée #3215) — servie : `resolve_account_territory` existe
    # déjà (portefeuille de l'utilisateur, comptes déjà analysés).
    "choisir_perimetre": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="perimetre_recommande",
        tools=("resolve_account_territory",),
        capability_gap=None,
        stage=None,
        requires=("compte_actif",),
        markers=(
            "quel perimetre",
            "quel est le bon perimetre chez",
            "par ou attaquer",
            "faut-il viser le groupe ou une filiale",
            "quelle filiale viser",
            "groupe ou filiale",
            "which perimeter",
            "which scope to target",
            "which subsidiary should i target",
            "group or subsidiary",
        ),
    ),
    # #3175.3 (lot E1 30/09) — servie : `get_account_interest_penetrability`
    # (intérêt × pénétrabilité, facteurs nommés) et `suggest_account_alternatives`
    # (3 à 5 cibles plus accessibles quand le compte n'est pas AGIR MAINTENANT).
    "challenger_un_compte": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="compte_challenge",
        tools=("get_account_interest_penetrability", "suggest_account_alternatives"),
        capability_gap=None,
        stage=None,
        requires=("compte_actif",),
        markers=(
            "challenge ce compte",
            "challenger ce compte",
            "challenge cette cible",
            "challenger cette cible",
            "remets en question ce compte",
            "est-ce le bon compte",
            "est ce le bon compte",
            "est-ce que ce compte vaut",
            "avocat du diable sur ce compte",
            "challenge this account",
            "challenge this target",
            "is this the right account",
            "devil's advocate on this account",
            "devils advocate on this account",
        ),
    ),
    # #3175.3 (lot E1 30/09) — servie : `get_account_coverage_map` (périmètre,
    # famille, niveau) et `get_esn_on_account` (ESN observées). Le graphe
    # inter-entreprises (clients, partenaires) n'existe pas : Laura le dit.
    "comprendre_ecosysteme": ChatIntentRoutingEntry(
        canonical_object="account",
        expected_result="ecosysteme_du_compte",
        tools=("get_account_coverage_map", "get_esn_on_account"),
        capability_gap=None,
        stage=None,
        requires=("compte_actif",),
        markers=(
            "ecosysteme de ce compte",
            "ecosysteme autour de",
            "comprendre l'ecosysteme",
            "comprendre l ecosysteme",
            "qui gravite autour de",
            "cartographie de l'ecosysteme",
            "ecosystem around",
            "understand the ecosystem",
            "map the ecosystem",
            "who orbits around",
        ),
    ),
}

#: #2321.22 — LE NO-GO EXPLICITE DU TICKET.
#:
#: « À qui vendre ce consultant ? » n'est PAS un matching : c'est un Reverse
#: Market — la liste des comptes où positionner ce profil. Le piège est réel : la
#: phrase porte souvent aussi « proposer » ou « shortlist », et un routeur qui
#: compte les marqueurs partirait sur ``run_matching``. Ces marqueurs-ci
#: COURT-CIRCUITENT le comptage.
#:
#: La cible existe déjà comme option catalogée de ``propose_guided_action``
#: (route ``/consultants/:id/reverse-market``) ; ce qui manquait, c'est la règle
#: qui y ENVOIE.
REVERSE_MARKET_MARKERS: tuple[str, ...] = (
    "a qui vendre",
    "a qui proposer ce consultant",
    "a qui le vendre",
    "sur quels comptes positionner",
    "quels comptes pour ce consultant",
    "who should i sell this consultant",
    "who to sell this consultant",
    "which accounts for this consultant",
    "where to place this consultant",
    # #3816.1 (call bêta 07/10) — « trouve-moi des missions pour ce profil : <consultant> » et ses
    # variantes. Marqueurs ÉTROITS à dessein : « des comptes pour » seul capturerait « des comptes
    # pour la banque », qui est un tour d'horizon (`run_account_search`), pas un marché inversé.
    # La variante avec un nom propre (« des comptes pour Marie Dupont ») reste servie par la
    # description de l'outil — un routeur pur ne sait pas qu'un nom est dans le vivier.
    "missions pour ce profil",
    "missions pour ce consultant",
    "trouve-moi des missions pour",
    "trouve moi des missions pour",
    "trouve des missions pour",
    "des comptes pour ce profil",
    "des comptes pour ce consultant",
    "ou placer",
    "missions for this profile",
    "missions for this consultant",
    "find missions for",
    "accounts for this profile",
    "where to place",
)

#: #3865.2 (BEL-LAU-1008-014, recette bêta 08/10) — « pour ce consultant, quels besoins
#: compatibles ? » n'est PAS un marché inversé (comptes) : c'est l'INVERSE de `matcher`
#: (un besoin → des profils) — un profil → des BESOINS déjà ouverts. Même piège, même
#: remède que `REVERSE_MARKET_MARKERS` juste au-dessus : marqueurs ÉTROITS, nommant
#: « besoin(s) » et jamais « compte(s) »/« mission(s) » (qui restent le marché inversé).
NEEDS_FOR_TALENT_MARKERS: tuple[str, ...] = (
    "besoins compatibles avec",
    "besoins compatibles pour",
    "quels besoins pour ce consultant",
    "quels besoins pour ce profil",
    "des besoins pour ce consultant",
    "des besoins pour ce profil",
    "besoins ouverts compatibles",
    "le positionner sur un besoin",
    "positionner ce consultant sur un besoin",
    "compatible needs for this consultant",
    "compatible needs for this profile",
    "needs for this consultant",
    "needs for this profile",
    "which needs for this consultant",
    "position him on a need",
)

#: Ce qui n'est pas de notre ressort, et qu'on ne fait donc PAS semblant de
#: router. ``hors_perimetre`` existe déjà comme catégorie ; elle n'avait aucun
#: producteur déterministe.
#:
#: Le seul cas que la doctrine tranche noir sur blanc : **BellumAI SUIT le
#: financier, il ne COMPTABILISE pas** (Louis 18/09/2026, #2564).
OUT_OF_SCOPE_MARKERS: tuple[str, ...] = (
    "plan comptable",
    "ecriture comptable",
    "ecritures comptables",
    "journal comptable",
    "bilan comptable",
    "chart of accounts",
    "accounting entry",
    "general ledger",
)

#: #2321.19 — les marqueurs de l'étape FINALE. Ils ne sont l'intention de
#: personne : ils n'ajoutent qu'une étape au job. C'est ce qui rend le saut
#: d'étape inexprimable — demander le mail ne retire pas ce qui le précède.
MESSAGE_STAGE_MARKERS: tuple[str, ...] = (
    "envoie un mail",
    "envoyer un mail",
    "envoie un email",
    "un mail au client",
    "ecrire au client",
    "prepare le message",
    "send an email",
    "send a mail",
    "write to the client",
    "prepare the message",
)

#: #2721 / #2678 — une question sur l'ACTUALITÉ PUBLIQUE. Ce n'est l'intention
#: de personne au sens de la table (aucune des dix n'est « chercher sur le
#: web ») : c'est un signal à part, qui pose une consigne à part
#: (`app/prompts/intent_route.public_news_block`). Recette prod du 23/09 :
#: « les dernières levées de fonds de la French Tech » recevait une réponse de
#: MÉMOIRE, zéro source, alors que `web_search` était exposé au modèle.
#:
#: ⚠️ « dernières » SEUL n'en fait pas partie : « mes dernières actions » porte
#: sur le portefeuille, pas sur le web. Un marqueur nomme un FAIT PUBLIC.
#:
#: #3091 — « startups ayant levé en pre-seed/seed ces 3 derniers mois » ne
#: contenait AUCUN des marqueurs ci-dessus (pas de « de fonds » après « levé »,
#: pas de « tour de table ») : le stade d'une levée (pre-seed, seed, amorçage)
#: se dit SANS le mot « fonds », donc `asks_for_public_news` rendait `None` et
#: la question repartait sur une réponse de mémoire comme avant #2721/#2678.
#: `(?<![a-z0-9])…(?![a-z0-9])` de `_matched` traite déjà le trait d'union
#: comme une frontière de mot : « seed » seul attrape aussi « pre-seed ».
PUBLIC_NEWS_MARKERS: tuple[str, ...] = (
    "actualite",
    "actualites",
    "l'actu",
    "levee de fonds",
    "levees de fonds",
    "leve des fonds",
    "tour de table",
    "dans la presse",
    "communique de presse",
    "news",
    "funding round",
    "funding rounds",
    "fundraising",
    "raised funds",
    "in the press",
    "press release",
    "pre-seed",
    "preseed",
    "seed",
    "amorcage",
    # #3176 — CURRENT_PUBLIC du ticket : un poste ou un recrutement RÉCENT est,
    # comme une levée de fonds, une actualité que Laura ne doit jamais
    # répondre de mémoire. Assez spécifiques pour ne pas attraper une demande
    # sans rapport (ex. « prépare-moi un poste de consultant »).
    "poste actuel",
    "derniers recrutements",
    "current position",
    "latest hires",
)


def asks_for_public_news(message: str) -> str | None:
    """Le marqueur d'actualité publique présent dans la demande, ou ``None``.

    Pur et déterministe, comme `route_chat_intent`. Rend un marqueur DÉCLARÉ,
    jamais un extrait du message.
    """
    hits = _matched(_normalize(message), PUBLIC_NEWS_MARKERS)
    return hits[0] if hits else None


#: #2679 (famille) — RELANCER UN CONTACT n'est l'intention de personne au sens
#: de la table : aucune des dix ne nomme la préparation d'un message à un
#: contact déjà connu. Recette prod du 23/09/2026 (sha servi 4a4e9e07d), SANS
#: compte actif : « Prépare-moi un message pour relancer » recevait une
#: précision de CANAL (mail, LinkedIn, téléphone) écrite en markdown au lieu
#: d'un appel à `offer_reply_options` — `route.intent` restait `non_declaree`,
#: donc `intent_route_block` rendait `""` et rien ne pointait le modèle vers
#: l'outil à l'endroit précis où il choisit le canal. Même remède que
#: #2721 (actualité publique) : un marqueur À PART, séparé de la table des dix
#: intentions, sa propre consigne (`app/prompts/intent_route.message_prep_block`).
#:
#: ⚠️ « contacter » seul n'en fait PAS partie : trop large, il attraperait
#: « qui contacter chez Thales » — une recherche de comptes, pas une relance.
MESSAGE_PREP_MARKERS: tuple[str, ...] = (
    "relancer",
    "relance",
    "prepare-moi un message",
    "prepare moi un message",
    "prepare un message",
    "ecris-moi un message",
    "ecris moi un message",
    "prepare une approche",
    "follow up",
    "follow-up",
    "reach out",
    "write me a message",
    "write a message",
)


def asks_to_prepare_a_message(message: str) -> str | None:
    """Le marqueur de PRÉPARATION DE MESSAGE (relance, approche) présent dans
    la demande, ou ``None``. Pur et déterministe, comme `asks_for_public_news`.
    """
    hits = _matched(_normalize(message), MESSAGE_PREP_MARKERS)
    return hits[0] if hits else None


#: #2434.51 — recette prod du 25/09/2026, écran `/chat` : « Lis-moi tout mon
#: pipeline » rendait TOUT le texte agrégé (18 projets / 5 étapes) — un
#: problème surtout en mode vocal, où ce texte est ensuite lu intégralement à
#: voix haute (`ListenReply`, `apps/web/src/features/chat/voice/`). Aucune des
#: dix intentions de la table ne nomme une demande de LECTURE INTÉGRALE ;
#: même remède que #2679 / #2721 : un marqueur À PART, sa propre consigne
#: (`app/prompts/intent_route.long_read_block`).
#:
#: ⚠️ « lis-moi » SEUL n'en fait pas partie : « lis-moi la fiche de ce
#: contact » porte sur UN élément précis, pas sur un ensemble entier — le
#: marqueur nomme la demande de TOUT lire, jamais la simple lecture.
LONG_READ_MARKERS: tuple[str, ...] = (
    "lis-moi tout",
    "lis moi tout",
    "lis-moi toute",
    "lis moi toute",
    "raconte-moi tout",
    "raconte moi tout",
    "dis-moi tout",
    "dis moi tout",
    "read me everything",
    "read everything to me",
    "read me the whole",
    "read it all to me",
)


def asks_for_a_long_read(message: str) -> str | None:
    """Le marqueur de DEMANDE DE LECTURE INTÉGRALE présent dans la demande, ou
    ``None``. Pur et déterministe, comme `asks_for_public_news`.
    """
    hits = _matched(_normalize(message), LONG_READ_MARKERS)
    return hits[0] if hits else None


#: #3176 (LAU-FINAL-182 — KNOWLEDGE SOURCE PLANNER) — la demande explicite de
#: NE PAS aller chercher sur le web, mode INTERNAL_ONLY du ticket. Recette
#: bêta du 28/09/2026 : rien ne distinguait ce tour d'un tour normal —
#: `web_search` restait un choix libre du modèle, qui pouvait soit l'appeler
#: par réflexe soit conclure trop vite qu'il ne sait rien sans avoir essayé
#: les outils internes (`search_market_memory`, `find_accounts`, le contexte
#: workspace déjà injecté). Même remède que #2721 / #2679 / #2434.51 : un
#: marqueur À PART, sa propre consigne (`app/prompts/intent_route.internal_only_block`).
#:
#: ⚠️ « mémoire » seul n'en fait pas partie : trop large, il attraperait
#: « la mémoire du client sur ce sujet » — un marqueur doit nommer soit la
#: mémoire DE BELLUM, soit l'exclusion explicite du web.
INTERNAL_ONLY_SCOPE_MARKERS: tuple[str, ...] = (
    "dans ta memoire",
    "dans votre memoire",
    "tu sais en memoire",
    "vous savez en memoire",
    "ce que bellum connait deja",
    "ce que bellum sait deja",
    "sans aller sur le web",
    "sans chercher sur le web",
    "sans recherche web",
    "dans nos donnees",
    "dans mon crm",
    "in your memory",
    "you know in memory",
    "what bellum already knows",
    "without going on the web",
    "without a web search",
    "in our data",
    "in my crm",
    "don't go on the web",
    "do not go on the web",
)


def asks_for_internal_only_scope(message: str) -> str | None:
    """Le marqueur de PÉRIMÈTRE INTERNE SEUL (mode ``INTERNAL_ONLY`` du
    ticket #3176) présent dans la demande, ou ``None``. Pur et déterministe,
    comme `asks_for_public_news`.
    """
    hits = _matched(_normalize(message), INTERNAL_ONLY_SCOPE_MARKERS)
    return hits[0] if hits else None


#: #3175 (LAU-FINAL-181 — COMMERCIAL INTENT RESOLVER) — la RECETTE du ticket :
#: une question littérale sur UN compte nommé (« SG travaille avec des
#: consultants ? », « je peux ouvrir Airbus ? », « tu penses quoi de
#: Carrefour ? ») a une réponse ponctuelle, mais la décision commerciale
#: sous-jacente est plus large (adéquation activité, références bancaires,
#: relations workspace, anciens consultants, partenaires, barrières achats,
#: entités plus accessibles, coût d'opportunité). L'objet ``CommercialIntent``
#: complet à treize champs est hors lot (système de plusieurs jours, épopée
#: #3175) ; ce marqueur ferme la tranche mesurable de la recette : la
#: QUALIFICATION littérale d'un compte nommé, câblée sur sa propre consigne
#: (`app/prompts/intent_route.account_qualification_widening_block`).
#:
#: ⚠️ Une DÉCOUVERTE sans compte nommé (« tu connais des boîtes cyber ? ») n'en
#: fait PAS partie : ``chercher_du_business`` (table des dix) la sert déjà, et
#: elle n'a pas de compte unique à qualifier.
ACCOUNT_QUALIFICATION_MARKERS: tuple[str, ...] = (
    "prend des freelances",
    "prend des consultants",
    "prennent des freelances",
    "prennent des consultants",
    "travaille avec des consultants",
    "travaille avec des freelances",
    "travaillent avec des consultants",
    "travaillent avec des freelances",
    "je peux ouvrir",
    "puis-je ouvrir",
    "puis je ouvrir",
    "ou sont passes les consultants",
    "tu penses quoi de",
    # #3513 (recette prod 02/10) — « Faut-il aller chez LVMH ? » ne portait
    # aucun marqueur : Laura répondait sans verdict d'adéquation ni carte.
    "faut-il aller chez",
    "faut il aller chez",
    "faut-il prospecter",
    "faut il prospecter",
    "dois-je prospecter",
    "dois je prospecter",
    "est-ce que je dois prospecter",
    "verdict d'adequation",
    "verdict adequation",
    "que penses-tu de",
    "que penses tu de",
    "work with consultants",
    "work with freelancers",
    "works with consultants",
    "works with freelancers",
    "can i open",
    "what do you think of",
    "should i go after",
    "is it worth going after",
    "worth going after",
    "fit verdict",
)


def asks_to_qualify_a_named_account(message: str) -> str | None:
    """Le marqueur de QUALIFICATION LITTÉRALE D'UN COMPTE NOMMÉ (#3175)
    présent dans la demande, ou ``None``. Pur et déterministe, comme
    `asks_for_public_news`.
    """
    hits = _matched(_normalize(message), ACCOUNT_QUALIFICATION_MARKERS)
    return hits[0] if hits else None


#: #3399 (lot RAW, recette G4 prod 11/10) — « Quel compte attaquer en premier ? » : prose, AUCUN outil,
#: alors que « Où investir » rend la carte du portefeuille. La question ne NOMME aucun compte : c'est le
#: classement du PORTEFEUILLE (`get_portfolio_priorities`), pas `compare_accounts` (comptes nommés), où
#: le marqueur `comparer` l'envoyait. Lu par l'orchestrateur pour FORCER l'outil au premier round.
PORTFOLIO_PRIORITY_MARKERS: tuple[str, ...] = (
    "quel compte attaquer",
    "quels comptes attaquer",
    "quel compte prioriser",
    "quels comptes prioriser",
    "par quel compte commencer",
    "ou investir",
    "which account first",
    "which account should i prioritize",
    "which accounts should i prioritize",
    "where to invest",
)
#: Des comptes NOMMÉS à départager (« entre SG et BNP ») : c'est `compare_accounts`, pas le portefeuille.
_NAMED_COMPARISON_MARKERS: tuple[str, ...] = (" entre ", " between ", " vs ", " versus ")


def asks_which_account_to_attack_first(message: str) -> str | None:
    """#3399 — le marqueur de PRIORISATION DU PORTEFEUILLE (aucun compte nommé), ou ``None``."""
    haystack = _normalize(message)
    if any(marker in f" {haystack} " for marker in _NAMED_COMPARISON_MARKERS):
        return None
    hits = _matched(haystack, PORTFOLIO_PRIORITY_MARKERS)
    return hits[0] if hits else None


#: #3939 (recette prod 13/10, Renault) — « où est la douleur sur ce compte ? » : le compte étant déjà en
#: contexte, le modèle répondait SANS lire le dossier (une phrase + puces, sans source). Lu par
#: l'orchestrateur pour FORCER `get_account_briefing` au premier round quand un compte est en portée.
#:
#: #3939.3 (recette prod 14/10, Sanofi) — même défaut sur une AUTRE phrase : « Fais-moi un point
#: rapide » (le check-in générique d'un commercial sur le compte ouvert) n'était pas dans la liste,
#: donc ne forçait rien — même absence de source. Jumeau du même défaut, même remède : la famille
#: « point » rejoint celle de « douleur ».
PAIN_QUESTION_MARKERS: tuple[str, ...] = (
    "ou est la douleur",
    "ou sont les douleurs",
    "quelle est la douleur",
    "quelles sont les douleurs",
    "quelles douleurs",
    "quelle douleur",
    "les douleurs du compte",
    "les douleurs de ce compte",
    "pain points",
    "pain point",
    "where is the pain",
    "where are the pains",
    "what are the pains",
    "what is the pain",
    "fais-moi un point rapide",
    "fais moi un point rapide",
    "fais-moi un point",
    "fais moi un point",
    "fais-moi le point",
    "fais moi le point",
    # #3939.3 (recette prod 14/10 R5, Sanofi) — le check-in générique (« fais-moi
    # un point rapide ») appelle la même lecture proactive : le modèle répondait
    # SANS lire le dossier, même cause racine que la phrase explicite ci-dessus.
    "point rapide",
    "quick update",
    "quick check-in",
    "quick status",
    # #3243 (recette R37, 16/10) — « Faut-il relancer <compte> maintenant ? » : Laura répondait « aucun
    # résultat d'outil ce tour » sans lire le dossier, donc sans voir « signaux tous archivés ⇒ besoin à
    # confirmer ». Une question de relance sur un compte nommé lit CE compte avant de répondre.
    "faut-il relancer",
    "faut il relancer",
    "dois-je relancer",
    "dois je relancer",
    "est-ce le moment de relancer",
    "est ce le moment de relancer",
    "bon moment pour relancer",
    "should i follow up",
    "should i chase",
)


def asks_where_is_the_pain(message: str) -> str | None:
    """#3939 — le marqueur d'une question sur la DOULEUR d'un compte, ou ``None``."""
    hits = _matched(_normalize(message), PAIN_QUESTION_MARKERS)
    return hits[0] if hits else None


#: #2887 (recette prod R15, 15/10) — « que faire cette semaine ? » répondait en prose : le plan
#: d'actions par geste (`get_action_plan`, « proche de signer » rangé par stade) existait mais le
#: modèle ne l'appelait pas. Marqueurs de la question hebdomadaire.
WEEKLY_ACTION_MARKERS: tuple[str, ...] = (
    "que faire cette semaine",
    "quoi faire cette semaine",
    "que dois-je faire cette semaine",
    "que dois je faire cette semaine",
    "que fais-je cette semaine",
    "que faut-il faire cette semaine",
    "mon plan d'actions",
    "mon plan d'action",
    "plan d'actions de la semaine",
    "plan d'action de la semaine",
    "what should i do this week",
    "what do i do this week",
)


def asks_what_to_do_this_week(message: str) -> str | None:
    """#2887 — le marqueur d'une question « que faire cette semaine », ou ``None``."""
    hits = _matched(_normalize(message), WEEKLY_ACTION_MARKERS)
    return hits[0] if hits else None


#: #4397 — « lance / relance l'analyse de X » : un compte NOMMÉ (de/du/d'/des + un nom). « lancer des analyses »
#: sans compte ne force rien : il n'y a rien à préparer.
_LAUNCH_ANALYSIS_RE = re.compile(
    r"\b(?:re)?lance(?:r|z)?\s+(?:l'|une\s+|the\s+)?analyse\s+(?:du\s+compte\s+)?(?:de\s+|du\s+|d'|des\s+)\S"
    r"|\b(?:re)?launch(?:ing)?\s+(?:the\s+|an\s+)?analysis\s+(?:of|for|on)\s+\S"
)


def asks_to_launch_account_analysis(message: str) -> bool:
    """#4397 — la demande de LANCER l'analyse d'un compte nommé (et non d'en lire une)."""
    return bool(_LAUNCH_ANALYSIS_RE.search(_normalize(message)))


#: #4462.2 (recette prod 23/10) — « Analyse ces comptes : Airbus, Thales, Safran… » : une LISTE nommée à analyser.
#: Laura répondait « Je reprends le fil avec Thales… Que veux-tu ? » : le fil repris masquait la liste.
_ANALYZE_LIST_RE = re.compile(
    r"\b(?:analys\w*|lanc\w*|etudi\w*|analy[sz]e|launch|study)\b[^:\n]{0,40}\b(?:ces|these|mes|my)\s+"
    r"(?:comptes?|entreprises?|societes?|boites?|accounts?|compan(?:y|ies))\b[^:\n]{0,30}[:\n]"
)


def asks_to_analyze_named_list(message: str) -> bool:
    """#4462.2 — la demande d'analyser une LISTE de ≥ 3 noms collés après « ces comptes : ». Moins de trois
    noms, ou aucune liste, ne force rien (une demande sur un compte a ses propres chemins)."""
    text = _normalize(message)
    match = _ANALYZE_LIST_RE.search(text)
    if not match:
        return False
    # `_normalize` tasse les retours à la ligne : la liste se découpe dans le texte brut, après le premier « : ».
    tail = (message or "").split(":", 1)[1] if ":" in (message or "") else text[match.end() :]
    items = [i.strip() for i in re.split(r"[,;\n]|\bet\b|\band\b", tail) if i.strip()]
    return len(items) >= 3


#: #3243.r41 (recette prod 17/10, ARCHI LOGICIEL) — « prépare une action sur <compte> » SANS geste nommé : le
#: geste par défaut (un premier message au contact le plus pertinent) se prépare, il ne se redemande pas.
PREPARE_ACTION_MARKERS: tuple[str, ...] = (
    "prepare une action",
    "prepare-moi une action",
    "prepare moi une action",
    "prepare l'action",
    "prepare la prochaine action",
    "prepare an action",
    "prepare the next action",
)


def asks_to_prepare_an_action(message: str) -> bool:
    """#3243.r41 — la demande « prépare une action » sans geste nommé (ni message, ni relance : ceux-là
    ont leur propre chemin, `asks_to_prepare_a_message`)."""
    text = _normalize(message)
    return bool(_matched(text, PREPARE_ACTION_MARKERS)) and not asks_to_prepare_a_message(message)


#: #3247.r41 (recette prod 17/10) — « quelles alternatives à Safran ? » : le groupe visé est NOMMÉ après « alternative(s) à ».
_ALTERNATIVES_TO_RE = re.compile(r"(?<![a-z0-9])alternatives?\s+(?:a|au|aux|to)\s+[a-z0-9]")


def asks_alternatives_to_a_group(message: str) -> bool:
    """#3247.r41 — « quelles alternatives à Safran ? » : une demande d'alternatives à un groupe NOMMÉ. Le
    modèle y répondait en prose (Airbus, Thales…), sans lire l'outil : au premier round
    `suggest_account_alternatives` est forcé et la carte part de ses lignes."""
    return bool(_ALTERNATIVES_TO_RE.search(_normalize(message)))


_DOCUMENT_SOURCE_RE = re.compile(
    r"(?<![a-z0-9])(?:(?:nos|mes|les|des|de nos|dans nos|dans les|dans mes)\s+documents?"
    r"|base de connaissances?|knowledge base|(?:our|my|the)\s+documents?)(?![a-z0-9])"
)
_PROJECTS_RE = re.compile(r"(?<![a-z0-9])(?:projets?|projects?)(?![a-z0-9])")


def asks_projects_in_documents(message: str) -> bool:
    """#3889 (recette prod R15, 15/10) — « quels projets a Sanofi dans nos documents ? ».

    Il faut les DEUX : le mot « projet(s) » ET une source documentaire déclarée (« nos documents »,
    « base de connaissance »). « Quels projets a Sanofi ? » seul lit les besoins enregistrés
    (`find_needs`), pas les documents : rien n'est forcé."""
    text = _normalize(message)
    return bool(_PROJECTS_RE.search(text) and _DOCUMENT_SOURCE_RE.search(text))


#: #4057 / #4058 (recette prod R15, 15/10) — « interlocuteurs cyber GRC de EDF » : « aucun interlocuteur,
#: recherche élargie pas menée », alors que le compte portait déjà un RSSI. La lecture de la base (gratuite)
#: passe AVANT toute recherche externe (payante) : forcée au premier round.
_PEOPLE_NOUNS = ("interlocuteur", "interlocuteurs", "contact", "contacts", "decideur", "decideurs", "qui est le")
_EXPERTISE_WORDS = (
    "cyber",
    "cybersecurite",
    "grc",
    "rssi",
    "ciso",
    "securite si",
    "securite informatique",
    "securite des si",
    "conformite",
    "risques",
    "risk",
    "compliance",
    "security",
)


def asks_known_people_by_expertise(message: str) -> bool:
    """#4057 — une demande de PERSONNES (« interlocuteurs », « contacts », « qui est le RSSI ») sur une
    expertise cyber/GRC. Les deux sont requis ; « interlocuteurs achats » ne force rien."""
    text = _normalize(message)
    return bool(_matched(text, _PEOPLE_NOUNS) and _matched(text, _EXPERTISE_WORDS)) or bool(
        re.search(r"(?<![a-z0-9])qui est (?:le|la) (?:rssi|ciso)(?![a-z0-9])", text)
    )


#: #4982.3 (prod 60a0aae5) — « Répartis mes contacts par région » : une répartition de PERSONNES par zone. Deux
#: formes : un verbe de répartition + « contacts », ou « par région / département / zone / ville » + « contacts ».
#: « comptes par région » ne se déclenche pas : l'agrégat compte des contacts.
_CONTACTS_BY_ZONE_RE = re.compile(
    r"(?<![a-z0-9])(?:repartis|repartir|repartition|ventile|ventiler)\b[^?.!]*?(?<![a-z0-9])contacts?(?![a-z0-9])"
    r"|(?<![a-z0-9])contacts?(?![a-z0-9])[^?.!]*?(?<![a-z0-9])par\s+(?:region|departement|zone|ville)s?(?![a-z0-9])"
    r"|(?<![a-z0-9])combien de contacts par (?:region|departement|zone|ville)"
)


def asks_contacts_by_zone(message: str) -> bool:
    """#4982.3 — « Répartis mes contacts par région », « combien de contacts par département ? » : l'agrégat
    `search_workspace_contacts(by_zone=true)` répond, la liste de lignes non."""
    return bool(_CONTACTS_BY_ZONE_RE.search(_normalize(message)))


#: #3905.5/.6 (recette R37) — « trouve-moi des comptes dans l'industrie » : Laura partait en recherche web au
#: lieu de préparer la recherche de comptes. Un VERBE de recherche + un nom de COMPTES + un SECTEUR introduit par
#: « dans / du secteur / in » : trois conditions, « trouve-moi des comptes » seul ou « trouve le contact chez X »
#: ne forcent rien.
_FIND_ACCOUNTS_RE = re.compile(
    r"(?<![a-z0-9])(?:trouve|trouvez|cherche|cherchez|identifie|donne|liste|find|search for|list|give)(?:-moi| moi| me)?"
    r"\s+(?:\w+\s+){0,3}?(?:comptes?|entreprises?|societes?|cibles?|accounts?|companies)\b"
    r"[^?.!]*?(?<![a-z0-9])(?:dans|du secteur|des secteurs|in|within)\s+(?:l'|la |le |les |the |un |une )?[a-z]"
)


def asks_reverse_market_for_talent(message: str) -> bool:
    """#4421.3 (mesure prod 29/10) — « trouve-moi des missions pour ce consultant » : le MARCHÉ INVERSÉ d'un talent.
    MÊMES marqueurs que ``route_chat_intent`` (``REVERSE_MARKET_MARKERS``, GA-26) : la route le disait déjà, mais
    elle ne faisait que conseiller — le modèle choisissait l'outil d'offres et rendait 30 offres, zéro compte."""
    return bool(_matched(_normalize(message), REVERSE_MARKET_MARKERS))


def asks_to_find_accounts_in_a_sector(message: str) -> bool:
    """#3905.5/.6 — « trouve-moi des comptes dans l'industrie » : une demande de NOUVEAUX comptes dans un secteur.
    Au premier round `find_accounts` est forcé (la recherche se prépare, elle ne se mène pas sur le web)."""
    return bool(_FIND_ACCOUNTS_RE.search(_normalize(message)))


#: #4288.4/.5 (recette prod 19/10) — « liste mes affaires perdues en 2026 » rendait une question de cadrage
#: (« Que veux-tu traiter ? ») au lieu de la liste ; « candidats vus en entretien » une réponse générique.
#: Un VERBE de liste + des affaires/opportunités CLOSES (perdues, gagnées), ou des candidats vus en entretien.
#: « les affaires en cours » ou « pourquoi nous avons perdu chez X » ne forcent rien.
_CLOSED_RECORDS_RE = re.compile(
    r"(?<![a-z0-9])(?:liste|listes|lister|montre|montrez|affiche|donne|quelles?|quels?|sort|sors|recapitule)"
    r"[^?.!]*?(?:"
    r"(?:affaires?|opportunites?|deals?)\s+(?:\w+\s+){0,2}?(?:perdues?|gagnees?|closes?|lost|won)"
    r"|candidats?\s+(?:[\w-]+\s+){0,3}?(?:vus?|rencontres?|passes?|recus?)\s+(?:\w+\s+){0,2}?(?:en )?entretiens?"
    r"|candidats?\s+(?:[\w-]+\s+){0,3}?entretiens?"
    r")"
)


def asks_for_a_closed_records_listing(message: str) -> bool:
    """#4288.4/.5 — une demande de LISTE d'affaires closes (CRM) ou de candidats vus en entretien (ATS) :
    au premier round, `list_records` est forcé (le modèle remplit la source et la fenêtre)."""
    return bool(_CLOSED_RECORDS_RE.search(_normalize(message)))


#: #3202 (LAU-FINAL-208) — le vocabulaire d'ARCHÉTYPE D'ENTREPRISE. Aucune des
#: dix intentions de la table ne le nomme : « trouve-moi des startups » route
#: normalement sur `chercher_du_business`, mais rien n'y dit à Laura qu'un
#: « startup » n'est pas un simple filtre effectif+secteur (le NO-GO du
#: ticket). Même remède que #2679/#2721/#2434.51 : un marqueur À PART, sa
#: propre consigne (`app/prompts/intent_route.company_archetype_block`).
#:
#: ⚠️ Volontairement RESTREINT aux mots qui portent l'AMBIGUÏTÉ (une notion
#: métier confondue avec un filtre) — « grand groupe » ou « PME » seuls n'y
#: sont pas : ce sont déjà des filtres effectif directs, sans notion métier
#: à distinguer derrière.
COMPANY_ARCHETYPE_MARKERS: tuple[str, ...] = (
    "startup",
    "start-up",
    "scale-up",
    "scaleup",
    "spin-off",
    "spinoff",
    "french tech",
    "filiale autonome",
    "filiale integree",
    "pure player",
)


def asks_about_company_archetype(message: str) -> str | None:
    """Le marqueur d'ARCHÉTYPE D'ENTREPRISE présent dans la demande, ou
    ``None``. Pur et déterministe, comme `asks_for_public_news`.
    """
    hits = _matched(_normalize(message), COMPANY_ARCHETYPE_MARKERS)
    return hits[0] if hits else None


@dataclass(frozen=True)
class ChatIntentRoute:
    """La route d'une demande — quinze champs, miroir du schéma TS."""

    intent: str
    #: ``certaine`` ou ``hypothese``. ⚠️ Jamais un nombre : la doctrine refuse
    #: toute PROBABILITÉ affichée.
    confidence: Literal["certaine", "hypothese"]
    canonical_object: str | None
    expected_result: str | None
    #: #2321.11 — le compte ACTIF, déjà résolu par l'appelant. Jamais extrait du
    #: message.
    starting_point: str | None
    known_inputs: tuple[str, ...]
    missing_inputs: tuple[str, ...]
    tools: tuple[str, ...]
    capability_gap: str | None
    steps: tuple[str, ...]
    produces_now: tuple[str, ...]
    awaits_validation: tuple[str, ...]
    #: Vrai dès que quoi que ce soit attend un humain. C'est LE champ que lit un
    #: appelant qui veut savoir s'il a le droit d'agir seul.
    awaits_human: bool
    unrouted_category: str | None
    #: Le MARQUEUR DÉCLARÉ qui a déclenché la route. ⚠️ Jamais le texte de
    #: l'utilisateur : toujours une valeur de la table ci-dessus. C'est ce qui
    #: rend le motif affichable ET journalisable sans exposer un message.
    reasoning: str | None = field(default=None)
    #: #2257.35 — sous-ensemble de ``steps`` : le travail utile mais non
    #: nécessaire au résultat demandé. Jamais lancé sans geste de la personne
    #: (absent de ``produces_now``), ne bloque jamais le résultat principal
    #: (absent de ``awaits_validation`` et de ``awaits_human``).
    optional_steps: tuple[str, ...] = field(default=())
    #: #2257.35 — le marqueur DÉCLARÉ (``CHAT_INTENT_OPTIONAL_MARKERS``) qui a
    #: posé ``optional_steps``. ``None`` quand rien n'est facultatif.
    optional_reason: str | None = field(default=None)


#: #2321.14 — ce qu'un objet CITÉ par le fil fournit comme donnée d'entrée.
#:
#: Les clés sont des ``kind`` d'``OBJECT_KINDS`` (``chat_thread_state.py``), tels
#: que le fil les a rangés aux tours PRÉCÉDENTS — donc une donnée RÉSOLUE, pas
#: une donnée devinée dans le texte du tour. ``contact`` n'ouvre aucune entrée :
#: aucune intention du ticket n'en exige un.
THREAD_OBJECT_KIND_TO_INPUT: dict[str, str] = {
    "account": "compte_actif",
    "need": "besoin_cite",
    "consultant": "consultant_cite",
    "mission": "mission_citee",
}


def available_inputs_from_thread(thread_state: dict | None, *, active_account: bool) -> tuple[str, ...]:
    """Les données que l'appelant a DÉJÀ, lues sur l'état du fil (#2321.14).

    ⚠️ Rien ici ne regarde le message du tour. Un fil qui n'a cité aucun besoin
    ne fournit pas ``besoin_cite``, même si l'utilisateur écrit le mot
    « besoin » — c'est exactement la donnée fictive que la doctrine interdit.
    """
    found: list[str] = ["compte_actif"] if active_account else []
    for obj in (thread_state or {}).get("objects") or []:
        if not isinstance(obj, dict):
            continue
        kind = THREAD_OBJECT_KIND_TO_INPUT.get(str(obj.get("kind")))
        if kind and kind not in found:
            found.append(kind)
    return tuple(found)


def _normalize(message: str) -> str:
    """Minuscules, accents retirés, apostrophes typographiques ramenées à
    l'apostrophe droite, espaces tassés.

    Sans ça, « C'EST SIGNÉ » et « c'est signe » seraient deux demandes
    différentes — et la seconde seule serait routée.
    """
    text = message or ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    for quote in ("‘", "’", "ʼ"):
        text = text.replace(quote, "'")
    return " ".join(text.lower().split())


def _matched(haystack: str, markers: Sequence[str]) -> list[str]:
    """Les marqueurs présents, lus sur des FRONTIÈRES DE MOT.

    ⚠️ Jamais en simple sous-chaîne. Le défaut a été mesuré le 22/09/2026 en
    regardant le bloc rendu : « j'ai un retour du client sur la CANDIDATURE »
    déclenchait le marqueur ``candidat`` de l'intention « profil », qui ajoutait
    une étape « trouver les profils » à une demande qui n'en parlait pas. Une
    sous-chaîne attrape ce qu'elle ne vise pas.
    """
    found: list[str] = []
    for marker in markers:
        if re.search(rf"(?<![a-z0-9]){re.escape(_normalize(marker))}(?![a-z0-9])", haystack):
            found.append(marker)
    return found


def route_chat_intent(
    *,
    message: str,
    active_account_company_name: str | None = None,
    available_inputs: Sequence[str] = (),
) -> ChatIntentRoute:
    """Route UNE demande. Pure, déterministe, sans réseau et sans modèle.

    ``message`` ne sort jamais de cette fonction : seule une route en sort, et
    son ``reasoning`` est un marqueur DÉCLARÉ, pas un extrait du texte.
    """
    text = _normalize(message)
    available = tuple(available_inputs)

    # 1. Hors périmètre d'abord : ce qu'on ne fait pas, on ne le route pas, même
    #    si la phrase porte par ailleurs un marqueur reconnu.
    out_of_scope = _matched(text, OUT_OF_SCOPE_MARKERS)
    if out_of_scope:
        return _undeclared_route(active_account_company_name, "hors_perimetre", out_of_scope[0])

    # 2. #2321.22 — le NO-GO court-circuite le comptage : « à qui vendre ce
    #    consultant » ne doit JAMAIS finir en simple matching.
    reverse_market = _matched(text, REVERSE_MARKET_MARKERS)
    if reverse_market:
        base = CHAT_INTENT_ROUTING_TABLE["profil"]
        return _build_route(
            intent="profil",
            entry=ChatIntentRoutingEntry(
                canonical_object=base.canonical_object,
                expected_result="marche_inverse",
                # #3816.1 — un VRAI outil qui lit le marché inversé d'UN talent et rend les comptes
                # dans le fil. Avant, la route n'ouvrait que l'écran (`propose_guided_action`).
                tools=("find_accounts_for_talent",),
                capability_gap=None,
                stage=base.stage,
                requires=base.requires,
                markers=base.markers,
            ),
            reasoning=reverse_market[0],
            confidence="certaine",
            stages=("trouver_les_profils",),
            starting_point=active_account_company_name,
            available=available,
        )

    # 2bis. #3865.2 — même piège, même remède que le marché inversé juste au-dessus :
    #       « des besoins pour ce consultant » n'est l'intention de personne dans la table
    #       (aucune des dix ne nomme un profil → ses besoins compatibles).
    needs_for_talent = _matched(text, NEEDS_FOR_TALENT_MARKERS)
    if needs_for_talent:
        base = CHAT_INTENT_ROUTING_TABLE["profil"]
        return _build_route(
            intent="profil",
            entry=ChatIntentRoutingEntry(
                canonical_object=base.canonical_object,
                expected_result="liste_de_correspondances",
                # #3865.2 — `InverseMatchingService.matchTalent` existait déjà pour l'écran
                # (`POST consultants/:id/match-inverse`), sans appelant côté conversation.
                tools=("find_needs_for_talent",),
                capability_gap=None,
                stage=base.stage,
                requires=base.requires,
                markers=base.markers,
            ),
            reasoning=needs_for_talent[0],
            confidence="certaine",
            stages=("trouver_les_profils",),
            starting_point=active_account_company_name,
            available=available,
        )

    # 3. Le comptage des marqueurs déclarés, intention par intention.
    scored: list[tuple[str, list[str]]] = []
    for kind in CHAT_INTENT_KINDS:
        hits = _matched(text, CHAT_INTENT_ROUTING_TABLE[kind].markers)
        if hits:
            scored.append((kind, hits))
    if not scored:
        # Le défaut qui ATTEND. ``certaine`` parce que l'ABSENCE de marqueur est
        # un fait mesuré, pas une supposition — on est certain de ne pas savoir.
        return _undeclared_route(active_account_company_name, "intention_incomprise", None)

    best = max(len(hits) for _, hits in scored)
    # Égalité : le premier dans l'ordre du ticket gagne, et la route le dit en se
    # déclarant `hypothese`. On PRODUIT un premier résultat plutôt que de poser
    # une question (#2321.20 / #2321.21).
    winner_kind, winner_hits = next((kind, hits) for kind, hits in scored if len(hits) == best)

    # 4. #2321.18 / #2321.19 — le job séquencé. Toutes les étapes évoquées, plus
    #    celle du message si elle est demandée, ramenées à une TRANCHE CONTIGUË :
    #    rien ne peut être sauté.
    stages: list[str] = []
    for kind, _hits in scored:
        stage = CHAT_INTENT_ROUTING_TABLE[kind].stage
        if stage and stage not in stages:
            stages.append(stage)
    if _matched(text, MESSAGE_STAGE_MARKERS) and "preparer_le_message" not in stages:
        stages.append("preparer_le_message")

    # #3856 (BEL-LAU-1008-005) — « une demande composée conserve tous ses
    # livrables » : les outils des intentions matchées MAIS NON gagnantes
    # s'ajoutent à la suite de ceux de la gagnante, jamais à leur place
    # (déduppliqués, winner d'abord) — jusqu'ici seule la gagnante sortait de
    # la route, et une demande à deux marqueurs déclarés (« comptes » +
    # « contacts ») perdait silencieusement le second outil.
    extra_tools: tuple[str, ...] = tuple(
        tool
        for kind, _hits in scored
        if kind != winner_kind
        for tool in CHAT_INTENT_ROUTING_TABLE[kind].tools
    )

    return _build_route(
        intent=winner_kind,
        entry=CHAT_INTENT_ROUTING_TABLE[winner_kind],
        reasoning=winner_hits[0],
        confidence="certaine" if best >= 2 else "hypothese",
        stages=tuple(stages),
        starting_point=active_account_company_name,
        available=available,
        extra_tools=extra_tools,
        optional_marker=(_matched(text, CHAT_INTENT_OPTIONAL_MARKERS) or [None])[0],
    )


def _undeclared_route(starting_point: str | None, category: str, reasoning: str | None) -> ChatIntentRoute:
    assert category in UNROUTED_INTENT_CATEGORIES, "jamais une quatrième catégorie"
    return ChatIntentRoute(
        intent=UNDECLARED_CHAT_INTENT,
        confidence="certaine",
        canonical_object=None,
        expected_result=None,
        starting_point=starting_point,
        known_inputs=(),
        missing_inputs=(),
        tools=(),
        capability_gap=None,
        steps=(),
        produces_now=(),
        awaits_validation=(),
        # Un intent non déclaré ATTEND — jumeau d'`UNDECLARED_INTENT_SITE`.
        awaits_human=True,
        unrouted_category=category,
        reasoning=reasoning,
    )


def _build_route(
    *,
    intent: str,
    entry: ChatIntentRoutingEntry,
    reasoning: str,
    confidence: Literal["certaine", "hypothese"],
    stages: Sequence[str],
    starting_point: str | None,
    available: Sequence[str],
    extra_tools: Sequence[str] = (),
    optional_marker: str | None = None,
) -> ChatIntentRoute:
    # La tranche contiguë : du premier au dernier rang évoqué, sans trou.
    ranks = [CHAT_INTENT_PIPELINE.index(stage) for stage in stages if stage in CHAT_INTENT_PIPELINE]
    steps: tuple[str, ...] = () if not ranks else CHAT_INTENT_PIPELINE[min(ranks) : max(ranks) + 1]

    # #3856 — winner d'abord, puis les outils des autres intentions matchées
    # (`extra_tools`), jamais en double.
    tools: tuple[str, ...] = entry.tools + tuple(t for t in extra_tools if t not in entry.tools)

    # #2257.35 — l'étape la plus en AVAL est facultative quand un marqueur déclaré
    # le dit ET qu'elle n'est pas celle du résultat demandé (``entry.stage``) ET
    # qu'une étape nécessaire la précède : le résultat demandé n'est jamais
    # facultatif.
    optional_steps: tuple[str, ...] = ()
    if optional_marker and len(steps) > 1 and steps[-1] != entry.stage:
        optional_steps = (steps[-1],)

    awaits_validation = tuple(
        step for step in steps if step in CHAT_INTENT_STEPS_AWAITING_VALIDATION and step not in optional_steps
    )
    # Sans outil, la route ne prétend RIEN produire — elle nomme son manque.
    produces_now = (
        ()
        if not tools
        else tuple(
            step
            for step in steps
            if step not in CHAT_INTENT_STEPS_AWAITING_VALIDATION and step not in optional_steps
        )
    )

    return ChatIntentRoute(
        intent=intent,
        confidence=confidence,
        canonical_object=entry.canonical_object,
        expected_result=entry.expected_result,
        starting_point=starting_point,
        known_inputs=tuple(kind for kind in entry.requires if kind in available),
        missing_inputs=tuple(kind for kind in entry.requires if kind not in available),
        tools=tools,
        capability_gap=entry.capability_gap,
        steps=steps,
        produces_now=produces_now,
        awaits_validation=awaits_validation,
        awaits_human=(not tools) or bool(awaits_validation),
        # Intention reconnue mais aucun outil pour la servir : c'est exactement
        # `capacite_absente`, la catégorie qui existe déjà et qui a un écran.
        unrouted_category=None if tools else "capacite_absente",
        reasoning=reasoning,
        optional_steps=optional_steps,
        optional_reason=optional_marker if optional_steps else None,
    )


def chat_intent_route_for_log(route: ChatIntentRoute) -> dict[str, object]:
    """La vue JOURNALISABLE d'une route — SANS CONTENU, comme
    ``request_intent_contract_for_log``.

    Le ``reasoning`` est un marqueur DÉCLARÉ, donc il peut sortir tel quel ; le
    point de départ, lui, porte un nom de compte et n'est réduit qu'à sa
    PRÉSENCE.
    """
    return {
        "intent": route.intent,
        "confidence": route.confidence,
        "expected_result": route.expected_result or "aucun",
        "canonical_object": route.canonical_object or "aucun",
        "capability_gap": route.capability_gap or "aucun",
        "unrouted_category": route.unrouted_category or "aucune",
        "matched_marker": route.reasoning or "aucun",
        "has_starting_point": route.starting_point is not None,
        "awaits_human": route.awaits_human,
        "steps_count": len(route.steps),
        "optional_steps_count": len(route.optional_steps),
        "missing_inputs_count": len(route.missing_inputs),
    }
