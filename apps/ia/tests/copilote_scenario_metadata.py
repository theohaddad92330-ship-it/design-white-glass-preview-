"""LE SCHÉMA UNIQUE DES MÉTADONNÉES D'UN SCÉNARIO DE LAURA (#1948, #1945, #1920).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#1948 demandait « un corpus canonique unique ». La décision du 12/09/2026 est
de NE PAS en écrire un de plus : cinq suites de scénarios existent déjà
(`test_copilote_{scope,security,ask_before_answering,truth_levels,market_memory}_eval.py`),
chacune avec sa forme, et un sixième fichier qui les recopierait divergerait au
premier renommage. Ce module définit donc UNE FOIS le schéma des métadonnées,
et chaque scénario existant le porte dans son champ ``meta``. Le corpus
canonique est une VUE (`Canonique`), bâtie par
``test_copilote_scenario_corpus.py`` à partir des suites elles-mêmes.

Il n'est pas collecté par pytest (son nom ne commence pas par ``test_``).

#1948 — son unicité n'est plus une intention : ``test_copilote_scenario_corpus``
§11 refuse qu'un autre module Python du service définisse un nom de ce schéma
(GA-26), et §12 compte les dix-sept champs de l'énoncé. §11 lit désormais DEUX
fichiers canoniques : celui-ci, et `app/access/rights_matrix.py` (#2445.4,
#2766) où vivent `Famille`/`FAMILLE_PAR_ROLE`/`Permission` — sortis d'ici pour
être lisibles par du code de production, pas seulement par ce module de test.

─────────────────────────────────────────────────────────────────────────────
DEUX SORTES DE CHAMPS, ET LA RÈGLE QUI LES SÉPARE
─────────────────────────────────────────────────────────────────────────────
* Les champs ÉCRITS À LA MAIN (`Meta`) sont ceux que le code ne peut pas
  savoir : pour qui, à quel moment, avec quelle intention, sur quelle page.
* Les champs DÉRIVÉS (`permission_de`, `cout_de`, `donnees_necessaires_de`)
  sont LUS dans le code — le registre d'outils, la classification lecture /
  proposition / dépense d'``app/access/rights_matrix.py``, la grille
  ``CREDIT_WEIGHTS`` de ``packages/contracts``. Les recopier ici en ferait une
  seconde vérité (GA-26).

Un champ qu'on ne sait pas remplir vaut ``None`` et se DIT : la garde
``test_unknown_fields_are_said`` les nomme. Jamais de valeur de remplissage.
"""

from __future__ import annotations

import re
from enum import StrEnum
from functools import cache
from pathlib import Path
from typing import NamedTuple

from app.access.rights_matrix import (
    ANCIENNETE_DU_NOUVEL_ARRIVANT,  # noqa: F401 — ré-exporté, importé d'ici par test_copilote_scenario_corpus.py
    FAMILLE_PAR_ROLE,  # noqa: F401 — ré-exporté, importé d'ici par test_copilote_scenario_corpus.py
    SPENDING_TOOLS,
    TOUTES_LES_FAMILLES,
    Famille,
    Permission,
    permission_de,
)
from app.eval.chat_hard_failures import ChatHardFailure
from app.services import chat_tools

#: apps/ia/tests/<ce fichier> → parents[3] = racine du dépôt.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_QUESTIONNAIRE_TS = _REPO_ROOT / "packages" / "contracts" / "src" / "schemas" / "profile-questionnaire.ts"
_CREDIT_WEIGHTS_TS = _REPO_ROOT / "packages" / "contracts" / "src" / "billing" / "credit-weights.ts"
_ROUTE_TREE_TS = _REPO_ROOT / "apps" / "web" / "src" / "routeTree.gen.ts"


# #2445.4 (#2766) — `Famille`, `TOUTES_LES_FAMILLES`, `FAMILLE_PAR_ROLE` et
# `ANCIENNETE_DU_NOUVEL_ARRIVANT` vivent désormais dans `app/access/
# rights_matrix.py` (second fichier canonique GA-26, à côté de ce module) :
# du code de production doit pouvoir les lire, pas seulement ce module de test.


def options_du_questionnaire(cle: str, source: str | None = None) -> tuple[str, ...]:
    """Les valeurs d'une liste de `PROFILE_QUESTION_OPTIONS`, LUES dans le TS.

    ``source`` permet aux gardes de rejouer un questionnaire fabriqué."""
    text = source if source is not None else _QUESTIONNAIRE_TS.read_text(encoding="utf-8")
    match = re.search(rf"\b{re.escape(cle)}: \[(.*?)\]", text, flags=re.DOTALL)
    if match is None:
        return ()
    return tuple(simple or double for simple, double in re.findall(r"'([^']*)'|\"([^\"]*)\"", match.group(1)))


# ── #1948.14 — MOMENT MÉTIER ─────────────────────────────────────────────────


class Moment(StrEnum):
    PREMIERS_PAS = "premiers pas — découvrir le produit, remplir l'espace"
    JOURNEE = "début de journée — par quoi commencer"
    PROSPECTION = "prospection — trouver et prioriser des comptes"
    QUALIFICATION = "qualification — analyser un compte, trouver l'entrée"
    AVANT_RENDEZ_VOUS = "avant un rendez-vous"
    PRISE_DE_CONTACT = "prise de contact — écrire, relancer, joindre"
    STAFFING = "staffing — besoins, vivier, partenaires"
    DELIVERY = "delivery — missions, relevés, risques"
    FACTURATION = "facturation et encaissement"
    PILOTAGE = "pilotage — pipe, capacité, santé de l'espace"
    REGLAGES = "réglages — routines, mémoire, lexique, import"
    SECURITE = "tentative de contournement"


# ── #1948.29 → .43 — CATÉGORIES (intention principale et secondaires) ────────


class Categorie(StrEnum):
    """La valeur EST le numéro du registre : un rapport de garde se relit contre
    `registre-2026-09-12.md` sans table de correspondance."""

    DECIDER = "1948.29"
    ANALYSER = "1948.30"
    DECOUVRIR = "1948.31"
    TROUVER_UN_CONTACT = "1948.32"
    TROUVER_UN_BESOIN = "1948.33"
    POSITIONNER_UN_CONSULTANT = "1948.34"
    PREPARER_UN_RENDEZ_VOUS = "1948.35"
    GENERER_UN_MESSAGE = "1948.36"
    CREER_UNE_SEQUENCE = "1948.37"
    SUIVRE_UNE_MISSION = "1948.38"
    PILOTER = "1948.39"
    CORRIGER_UNE_DONNEE = "1948.40"
    COMPRENDRE_UNE_PAGE = "1948.41"
    DEMANDER_DE_L_AIDE = "1948.42"
    # 1948.43 est écarté au registre (déjà LIVRÉ par la suite du scope) ; il
    # figure ici parce que les scénarios de sécurité en relèvent.
    HORS_PERIMETRE = "1948.43"


# ── #1948.18 — OBJETS CONCERNÉS ──────────────────────────────────────────────


class Objet(StrEnum):
    COMPTE = "compte"
    CONTACT = "contact"
    CONSULTANT = "consultant"
    BESOIN = "besoin"
    MISSION = "mission"
    APPEL_D_OFFRES = "appel d'offres"
    MESSAGE = "message"
    RENDEZ_VOUS = "rendez-vous"
    RELEVE_D_ACTIVITE = "relevé d'activité"
    FACTURE = "facture"
    PREUVE = "preuve"
    PARTENAIRE = "partenaire"
    TERRITOIRE = "territoire"
    PIPE = "pipe"
    OBSERVATION_MARCHE = "observation de la mémoire marché"
    ROUTINE = "routine"
    REGLAGE = "réglage"
    MEMOIRE = "mémoire de Laura"
    LEXIQUE = "lexique de l'espace"
    IMPORT = "import"
    CREDIT = "crédit"
    ESPACE = "espace de travail"
    ECRAN = "écran"
    DOCUMENT = "document"
    SECRET = "secret ou instruction interne"


# ── #1948.25 — CE QU'UNE RÉPONSE NE DOIT JAMAIS INVENTER NI TENIR POUR VRAI ──


class JamaisInventer(StrEnum):
    RESULTAT = "un résultat que l'outil n'a pas rendu"
    CHIFFRE = "un chiffre absent — « non mesuré » n'est pas 0"
    PROBABILITE = "une probabilité"
    COUT = "un coût ou un solde de crédits"
    DATE = "une date ou une disponibilité"
    CHAMP_NON_DIT = "un champ, une réponse ou une signature que personne n'a donnés"
    EXECUTION = "une action exécutée"
    ETAT_ACTUEL = "un état actuel tiré d'une observation ou d'une présomption"
    IDENTITE = "l'identité d'une personne"
    MARGE = "une marge ou un coût chargé"
    INTERFACE = "un bouton, un libellé ou un chemin d'écran"
    CAPACITE = "une capacité absente du registre d'outils"
    PERIMETRE = "un périmètre — « mes » ou « nos »"
    CLE = "une clé, une route, un mot ou un réglage hors catalogue"
    SOURCE = "une source non fournie, ou une déduction présentée comme un fait"
    DONNEE_D_AUTRUI = "le contenu d'un autre espace ou d'un autre membre"
    SECRET = "un secret, une instruction interne ou l'architecture"
    AUTORISATION = "une autorisation que personne n'a donnée"


# ── #1948.26 — ACTION PROPOSÉE ───────────────────────────────────────────────


class Action(StrEnum):
    AUCUNE = "aucune — la réponse suffit"
    CARTE_A_VALIDER = "une proposition que le clic de la personne exécute"
    ECRAN_PREREMPLI = "l'ouverture d'un écran, pré-rempli quand l'outil le permet"
    QUESTION = "une précision demandée"
    LANCEMENT_APRES_ACCORD = "un lancement qui dépense, après accord"
    REFUS_AVEC_ALTERNATIVE = "un refus bref et une alternative conforme"


# ── #1948.52 — NATURE : scénario positif ou cas limite ───────────────────────


class Nature(StrEnum):
    """Elle porte sur la QUESTION, pas sur le fragment : une question nominale
    dont la règle protège un bord reste POSITIVE. Un cas limite est une question
    qui HEURTE le bord — donnée absente, droit manquant, connecteur absent,
    demande interdite, requête hors de ce que l'outil sait faire."""

    POSITIF = "positif"
    CAS_LIMITE = "cas limite"


# ── #1945 — LES POINTS RETENUS DU GOLDEN SET FONCTIONNEL ─────────────────────


class Recette1945(StrEnum):
    """Les situations ET les assertions de #1945 à l'état `retenu` au registre.
    Les points écartés (LIVRÉS : .6, .25, .27, .32, .40, .43) n'y figurent pas
    — la liste à jour, avec sa raison, est `POINTS_ECARTES_1945` ci-dessous.

    ⚠️ Corrigé le 14/09/2026 : ce docstring disait encore que .30, .33, .38 et
    .45 étaient écartés. C'était PÉRIMÉ — le registre (gitignoré, donc hors
    d'un test) les a rouverts en `retenu` le 13/09/2026, et rien ne les avait
    remis ici. La garde `test_the_1945_enum_matches_the_versioned_registry`
    (`test_copilote_scenario_corpus.py`) existe pour que CE défaut-là — un
    docstring vrai qui devient faux sans qu'aucun rouge ne le dise — ne se
    reproduise plus en silence : elle ne lit pas ce texte, elle compare cette
    énumération à `POINTS_ECARTES_1945`."""

    PREMIERE_UTILISATION = "1945.1"
    UTILISATEUR_CONNU = "1945.2"
    PROFIL_INCOMPLET = "1945.3"
    AUCUN_CONNECTEUR = "1945.4"
    CONNECTEUR_CASSE = "1945.5"
    ENTREPRISE_HOMONYME = "1945.7"
    PRIORISER_LES_COMPTES = "1945.8"
    TROUVER_UN_CONTACT = "1945.9"
    CONSULTANT_DISPONIBLE = "1945.10"
    AUCUN_RESULTAT = "1945.11"
    PREPARER_UN_RENDEZ_VOUS = "1945.12"
    MISSION_A_J_30 = "1945.13"
    MISSION_SANS_DATE = "1945.14"
    MESSAGE_C_LEVEL = "1945.15"
    MESSAGE_OPERATIONNEL = "1945.16"
    TUTOIEMENT_VOUVOIEMENT = "1945.17"
    SEQUENCE_SANS_CONNECTEUR = "1945.18"
    ACTION_A_VALIDER = "1945.19"
    ACTION_EXECUTEE = "1945.20"
    ACTION_ECHOUEE = "1945.21"
    DONNEE_FAUSSE = "1945.22"
    OBSERVATION_HISTORIQUE = "1945.23"
    ORGANIGRAMME_INCERTAIN = "1945.24"
    CREDITS_INSUFFISANTS = "1945.26"
    DEUXIEME_MEMBRE = "1945.28"
    PERMISSIONS_LIMITEES = "1945.29"
    # #1945.30 — ROUVERT 13/09 : reste EVAL_EN_LIGNE, cf. test_copilote_scenario_corpus.py.
    REOUVRIR_LE_LIEN_PARTAGE = "1945.30"
    PIECE_JOINTE = "1945.31"
    # #1945.33 — ROUVERT 13/09 : LIVRÉ hors corpus, cf. PREUVES_HORS_CORPUS.
    HORS_PERIMETRE = "1945.33"
    RETOUR_APRES_SEPT_JOURS = "1945.34"
    MOBILE = "1945.35"
    REPOND_A_LA_VRAIE_QUESTION = "1945.36"
    AUCUNE_CAPACITE_INVENTEE = "1945.37"
    # #1945.38 — ROUVERT 13/09 : reste EVAL_EN_LIGNE, cf. test_copilote_scenario_corpus.py.
    CHAINAGE_DES_NIVEAUX_DE_VERITE = "1945.38"
    BONNE_REDIRECTION = "1945.39"
    ETAT_D_ACTION_REEL = "1945.41"
    PERMISSIONS_RESPECTEES = "1945.42"
    CORRECTION_PERSISTANTE = "1945.44"
    # #1945.45 — ROUVERT 13/09 : PAS LIVRÉ, cf. NON_LIVRES_1945 (#1925 OPEN, lot à part).
    RECOMMANDATION_INTERCHANGEABLE = "1945.45"


#: #1945 — le nombre TOTAL de points audités par l'issue (retenus + écartés).
#: Mesuré au 14/09/2026 sur l'issue elle-même. Rien d'autre ne lit ce nombre —
#: s'il change (un point de plus ajouté à l'issue), c'est cette ligne qui bouge,
#: dans la PR qui touche aussi `Recette1945` et `POINTS_ECARTES_1945`.
TOTAL_POINTS_1945 = 45

#: #1945 — les points ÉCARTÉS du golden set (LIVRÉS, ou hors périmètre de ce
#: golden set), avec leur raison. Source de vérité VERSIONNÉE, dans le dépôt :
#: le registre qui les décide (`.claude/notes/registre-2026-09-12.md`) est
#: gitignoré et partagé entre sessions, donc illisible depuis un test (et
#: jamais modifié par un). Cette liste-ci l'est, et c'est ce qui rend un écart
#: visible AU DIFF, pas seulement à l'exécution : `Recette1945` et ce dict
#: doivent, ENSEMBLE, couvrir exactement `1945.1` à `1945.{TOTAL_POINTS_1945}`,
#: sans trou ni recoupement — la garde
#: `test_the_1945_enum_matches_the_versioned_registry` le vérifie.
POINTS_ECARTES_1945: dict[str, str] = {
    "1945.6": "LIVRÉ",
    "1945.25": "LIVRÉ",
    "1945.27": "LIVRÉ",
    "1945.32": "LIVRÉ",
    "1945.40": "LIVRÉ",
    "1945.43": "LIVRÉ",
}


# ── #2443.2 (#2899) — LES NEUF SOURCES DU CORPUS DE BASE ─────────────────────
#
# #2443 (« CORPUS DE BASE ») énumère neuf sources à inclure et versionner,
# dans cet ordre. La valeur EST le libellé de l'issue — même discipline que
# `Categorie`, dont la valeur EST le numéro du registre : on se relit sans
# table de correspondance.


class Source(StrEnum):
    REQUETES_PREPAREES = "les 100 requêtes préparées"
    EXPORTS_CONVERSATIONNELS = "les trois exports conversationnels réels"
    CORRECTIONS = "leurs corrections"
    REQUETES_PROJETEES = "les requêtes complémentaires non exécutées mais projetées"
    RETOURS_ANTOINE = "les retours Antoine"
    CAS_SALESCONNECT = "les cas SalesConnect"
    CORPUS_HISTORIQUES = "les corpus historiques"
    CONVERSATIONS_SUPPORT = "les conversations support validées"
    ERREURS_PRODUCTION = "les erreurs production anonymisées"


class Provenance(StrEnum):
    """#2443.2 — décision Louis 27/09/2026 : chaque cas est ÉTIQUETÉ, jamais
    présenté comme réel sans l'être. Jamais de donnée client réelle ; jamais
    un cas fictif présenté comme réel."""

    SYNTHETIQUE = "synthétique — écrit à la main, aucune personne ni compte réels"
    ANONYMISE = "anonymisé — dépersonnalisé avant d'entrer dans ce fichier"


# ── LES CHAMPS ÉCRITS À LA MAIN ──────────────────────────────────────────────


class Meta(NamedTuple):
    """Ce que le code ne peut pas savoir d'un scénario. Tout le reste se dérive."""

    # #1948.14 — le moment métier.
    moment: Moment
    # #1948.16 — l'intention principale, une catégorie de 1948.29-.43.
    intention: Categorie
    # #1948.18 — les objets concernés. ``None`` = on ne sait pas les nommer, et
    # la garde `test_unknown_fields_are_said` le dit.
    objets: tuple[Objet, ...] | None
    # #1948.23 — la page propriétaire : l'écran où la personne fait la même chose
    # SANS Laura, écrit comme TanStack Router l'écrit (`/accounts/$id`). ``None``
    # n'est permis qu'au cliquet `SANS_PAGE_PROPRIETAIRE`.
    page: str | None
    # #1948.25 — ce que la réponse ne doit jamais inventer. Vide = la règle ne
    # protège aucune information précise (une règle de ton, par exemple).
    jamais_inventer: tuple[JamaisInventer, ...]
    # #1948.26 — l'action que Laura propose au bout du tour.
    action: Action
    # #1948.52 — positif ou cas limite.
    nature: Nature
    # #1948.13 — pour qui. Par défaut TOUTES : une règle écrite vaut pour tous.
    personas: frozenset[Famille] = TOUTES_LES_FAMILLES
    # #1948.17 — les intentions secondaires.
    secondaires: tuple[Categorie, ...] = ()
    # #1945 — les points du golden set que ce scénario PROUVE (règle écrite).
    situations: tuple[Recette1945, ...] = ()
    # #1948.28 — priorité et fréquence terrain. Les sources qui les portaient
    # (les PDF de la méta-analyse du 03/08) ne sont PAS dans le dépôt : la valeur
    # est inconnue partout, et elle le reste tant que personne ne la mesure.
    priorite_terrain: str | None = None
    # #2443.2 (#2899) — laquelle des neuf sources du CORPUS DE BASE porte ce
    # cas. Défaut : les scénarios déjà versionnés SONT la source n°1 (« les
    # 100 requêtes préparées ») — écrits à la main par l'équipe, pas une
    # supposition.
    source: Source = Source.REQUETES_PREPAREES
    # #2443.2 — décision Louis 27/09/2026 : jamais une donnée client réelle,
    # jamais un cas fictif présenté comme réel. Défaut SYNTHÉTIQUE — vrai pour
    # tous les scénarios déjà versionnés (écrits par l'équipe).
    provenance: Provenance = Provenance.SYNTHETIQUE


# ── LES CHAMPS DÉRIVÉS — lus dans le code, jamais recopiés ───────────────────


# #2445.4 (#2766) — `Permission` et `permission_de` vivent désormais dans
# `app/access/rights_matrix.py` (second fichier canonique GA-26) : du code de
# production doit pouvoir les lire, pas seulement ce module de test.


@cache
def registre() -> dict[str, dict]:
    """Le registre tel qu'il part au modèle, par nom d'outil."""
    return {str(tool["name"]): tool for tool in chat_tools.CHAT_TOOLS}


def restriction_de(outil: str | None) -> str | None:
    """#1948.21, seconde moitié — un DROIT de l'espace en plus de la portée.

    Lu dans la description : c'est elle qui apprend au modèle quoi dire quand le
    droit manque. ``None`` = aucune restriction écrite pour le modèle."""
    if outil is None:
        return None
    if "finance_forbidden" in str(registre()[outil].get("description", "")):
        return "droit de lecture financière de l'équipe (`finance_forbidden`)"
    return None


def grille_de_credits(source: str | None = None) -> dict[str, int]:
    """#1948.22 — `CREDIT_WEIGHTS`, LU dans `packages/contracts`. C'est la grille
    que `creditCostOf` applique ; aucun chiffre n'est recopié ici."""
    text = source if source is not None else _CREDIT_WEIGHTS_TS.read_text(encoding="utf-8")
    bloc = re.search(r"export const CREDIT_WEIGHTS\b[^=]*=\s*\{(.*?)\n\}", text, flags=re.DOTALL)
    if bloc is None:
        return {}
    return {key: int(value) for key, value in re.findall(r"^\s*(\w+):\s*(\d+),?\s*$", bloc.group(1), flags=re.M)}


#: L'action de la grille à laquelle aboutit un outil. Un outil absent de cette
#: table n'aboutit à aucune action pondérée : il ne coûte que le tour de
#: conversation (`copilot_message`). Le NOMBRE, lui, se lit toujours dans la grille.
ACTION_CREDITEE_PAR_OUTIL: dict[str, str] = {
    "plan_account_analysis": "account_analysis",
    "start_account_analysis": "account_analysis",
    "enrich_contact": "contact_enrichment",
    "run_matching": "need_matching",
    "prepare_message_for_contact": "message_generation",
}

ACTION_DU_TOUR = "copilot_message"


def cout_de(outil: str | None) -> tuple[str, int]:
    """#1948.22 — (action de la grille, crédits) pour le coût ÉVENTUEL du scénario."""
    action = ACTION_CREDITEE_PAR_OUTIL.get(outil or "", ACTION_DU_TOUR)
    return action, grille_de_credits()[action]


def budget_duree_de(outil: str | None) -> float | None:
    """#3383.2 — le BUDGET de durée (secondes) d'un appel d'outil, LU dans
    l'orchestrateur (`_PER_CALL_TIMEOUT_S`, le délai au-delà duquel l'appel est
    coupé) — jamais une latence mesurée ni inventée : mesurer demande un appel
    modèle réel, hors du corpus déterministe. ``None`` pour une règle de prompt
    (aucun outil, aucun appel, aucun budget à lire)."""
    if outil is None:
        return None
    from app.services import chat_orchestrator

    return chat_orchestrator._PER_CALL_TIMEOUT_S


def donnees_necessaires_de(outil: str | None) -> tuple[str, ...] | None:
    """#1948.19 — les connecteurs exigés (`TOOL_REQUIRED_FAMILIES`, le filtre que
    `tools_for` applique AVANT l'appel) et les champs obligatoires du schéma.

    ``None`` pour une règle de conduite : aucune donnée ne se dérive d'un bloc de
    prompt, et un inventaire écrit à la main serait une supposition."""
    if outil is None:
        return None
    connecteurs = tuple(f"connecteur « {family} »" for family in chat_tools.TOOL_REQUIRED_FAMILIES.get(outil, ()))
    required = registre()[outil].get("input_schema", {}).get("required", [])
    return connecteurs + tuple(f"champ `{field}`" for field in required)


# ── #2443.5 (#2899) — ANNOTATION PAR CAS DU FUTUR GATE CHAT ──────────────────
#
# #2899 demande, pour la plateforme d'évaluation conversationnelle, « un schéma
# d'annotation par cas (input, outils attendus/interdits, hard failures,
# poids) ». L'entrée (`formulation`) et l'outil attendu (`outil`) sont déjà
# les 17 champs de #1948 ci-dessus — ce qui manquait, c'était les OUTILS
# INTERDITS, les HARD FAILURES gardés, et le POIDS. Les trois sont DÉRIVÉS,
# jamais recopiés (même discipline que `permission_de`/`cout_de` : GA-26, un
# schéma de scénario, un seul endroit).
#
# ⚠️ Ce que ceci N'EST PAS : le corpus multi-source, le gate CI dédié, le
# canary et l'échantillonnage production restants de #2899 dépendent tous
# d'un socle plus large qui n'existe pas encore. Ce qui suit rend seulement
# les 100+ scénarios déjà versionnés (`CORPUS`, cf. plus bas) capables de
# porter une annotation de gate — sans en inventer le contenu.

#: Les seules paires DOCUMENTÉES entre une règle déjà écrite (`JamaisInventer`,
#: #1948.25) et un hard failure NOMMÉ (`ChatHardFailure`, #2443.6) — pas une
#: table exhaustive : une valeur de `JamaisInventer` sans correspondance
#: directe (ex. `COUT`, `DATE`) ne rend rien plutôt qu'un rapprochement forcé.
HARD_FAILURE_DE_JAMAIS_INVENTER: dict[JamaisInventer, ChatHardFailure] = {
    JamaisInventer.RESULTAT: ChatHardFailure.FABRICATED_RESULT,
    JamaisInventer.CHIFFRE: ChatHardFailure.ABSENCE_SHOWN_AS_ZERO,
    JamaisInventer.PROBABILITE: ChatHardFailure.PROBABILITY_DISPLAYED,
    JamaisInventer.IDENTITE: ChatHardFailure.IDENTITY_ERROR,
    JamaisInventer.CAPACITE: ChatHardFailure.CAPABILITY_INVENTED,
    JamaisInventer.PERIMETRE: ChatHardFailure.PERMISSION_BYPASSED,
    JamaisInventer.DONNEE_D_AUTRUI: ChatHardFailure.CROSS_WORKSPACE_LEAK,
    JamaisInventer.SECRET: ChatHardFailure.SECRET_LEAKED,
}


def hard_failures_de(jamais_inventer: tuple[JamaisInventer, ...]) -> tuple[ChatHardFailure, ...]:
    """#2443.5 — les hard failures qu'un scénario garde déjà, DÉRIVÉS de ses
    règles `jamais_inventer` (#1948.25). Ordre stable, sans doublon."""
    trouves = (HARD_FAILURE_DE_JAMAIS_INVENTER[regle] for regle in jamais_inventer if regle in HARD_FAILURE_DE_JAMAIS_INVENTER)
    return tuple(dict.fromkeys(trouves))


def poids_de(outil: str | None) -> int:
    """#2443.5 — le poids d'un cas pour un futur gate : 1 (chaque cas compte,
    même une simple règle de conversation à 0 crédit — la sécurité et la
    plupart des scénarios de scope le sont) PLUS les crédits que l'action de
    ce cas ferait perdre au client si elle se déclenchait à tort. Le « +1 »
    est la seule décision non dérivée du module ; le reste est LU dans
    `cout_de` (donc dans `CREDIT_WEIGHTS`), jamais un nombre inventé."""
    return 1 + cout_de(outil)[1]


def outils_interdits_de(action: Action, outil: str | None) -> tuple[str, ...]:
    """#2443.5 — les outils qu'un tour n'a JAMAIS le droit d'appeler. Seule
    règle déjà écrite qui donne cette liste sans l'inventer : un tour qui ne
    propose pas de lancement après accord ne doit appeler AUCUN outil de
    dépense (`SPENDING_TOOLS`, #1948.21) — l'outil que ce scénario attend
    lui-même excepté, s'il en fait partie."""
    if action == Action.LANCEMENT_APRES_ACCORD:
        return ()
    return tuple(sorted(SPENDING_TOOLS - ({outil} if outil else set())))


def normalise_route(path: str) -> str:
    return path if path == "/" else path.rstrip("/")


def routes_web(source: str | None = None) -> frozenset[str]:
    """#1948.54 — les écrans qui EXISTENT, lus dans le registre de routes généré
    par TanStack Router (`routeTree.gen.ts`), pas dans une liste recopiée."""
    text = source if source is not None else _ROUTE_TREE_TS.read_text(encoding="utf-8")
    return frozenset(normalise_route(path) for path in re.findall(r"fullPath: '([^']*)'", text))


# ── LA VUE CANONIQUE — les 17 champs de #1948, sans un corpus de plus ────────


class Tour(NamedTuple):
    """#2899 (#2278.12/.17) — UN tour d'une conversation : l'unité que la revue humaine vise (`HumanReview.tour`).

    ``rang`` : 1 = première réponse. ``outil`` : l'outil attendu à CE tour (``None`` = règle de conduite)."""

    rang: int
    formulation: str
    outil: str | None = None


def problemes_de_tours(conversation: tuple[Tour, ...]) -> tuple[str, ...]:
    """Les défauts d'une conversation déclarée : rangs 1..n sans trou ni doublon, formulations non vides.
    Une conversation vide est un cas mono-tour — rien à valider."""
    problems: list[str] = []
    rangs = [tour.rang for tour in conversation]
    if conversation and rangs != list(range(1, len(conversation) + 1)):
        problems.append(f"les rangs de tour doivent être 1..{len(conversation)} sans trou ni doublon, reçus {rangs}")
    for tour in conversation:
        if not tour.formulation.strip():
            problems.append(f"le tour {tour.rang} n'a pas de formulation")
    return tuple(problems)


class Canonique(NamedTuple):
    # #1948.12 — `<suite>/<nom du scénario>`, unique sur les cinq suites.
    identifiant: str
    # Le module de test qui porte le scénario.
    suite: str
    # #1948.15 — la formulation réelle, telle qu'écrite dans la suite.
    formulation: str
    # #1948.20 — l'outil nécessaire ; ``None`` pour une règle du prompt.
    outil: str | None
    # #1948.24 — le comportement attendu : la RÈGLE écrite que la suite vérifie.
    fragments: tuple[str, ...]
    meta: Meta
    # #1948.27 — le test qui porte l'assertion.
    assertion: str
    # #2899 (#2278.12/.17) — la CONVERSATION du cas quand elle a plusieurs tours ; ``()`` = un seul tour (le
    # comportement d'avant, à l'octet près : voir `tours`). UN schéma, défini ici (`Tour`).
    conversation: tuple[Tour, ...] = ()

    @property
    def tours(self) -> tuple[Tour, ...]:
        """Les tours du cas : sa conversation déclarée, sinon son unique formulation."""
        return self.conversation or (Tour(rang=1, formulation=self.formulation, outil=self.outil),)

    @property
    def nb_tours(self) -> int:
        """Le nombre de tours — c'est LUI que borne `HumanReview.tour` (jamais un nombre écrit à la main)."""
        return len(self.tours)

    @property
    def permission(self) -> Permission:
        return permission_de(self.outil)

    @property
    def restriction(self) -> str | None:
        return restriction_de(self.outil)

    @property
    def cout(self) -> tuple[str, int]:
        return cout_de(self.outil)

    @property
    def budget_duree(self) -> float | None:
        return budget_duree_de(self.outil)

    @property
    def donnees_necessaires(self) -> tuple[str, ...] | None:
        return donnees_necessaires_de(self.outil)

    # ── #2443.5 (#2899) — annotation par cas du futur gate chat ─────────────

    @property
    def hard_failures(self) -> tuple[ChatHardFailure, ...]:
        return hard_failures_de(self.meta.jamais_inventer)

    @property
    def poids(self) -> int:
        return poids_de(self.outil)

    @property
    def outils_interdits(self) -> tuple[str, ...]:
        return outils_interdits_de(self.meta.action, self.outil)
