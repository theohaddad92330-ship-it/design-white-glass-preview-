"""#1926 — le CADRAGE d'un message, connu AVANT de le rédiger.

« Avant de générer, Laura doit connaître : canal ; objectif ; relation ; niveau
hiérarchique ; tutoiement/vouvoiement ; signal ou contexte ; offre pertinente ;
appel à l'action souhaité. » Le canal, le signal et l'offre voyageaient déjà
jusqu'au prompt (``bellum_outreach``). L'OBJECTIF était câblé en dur, le niveau
et le registre laissés au modèle, l'appel à l'action absent.

Ce module les DÉRIVE, sans LLM ni I/O, de ce que la requête porte déjà, et dit
pour chacun D'OÙ il vient (``*Source``) :

1. ``angle``   — ce que le commercial a écrit (le composer, ou l'angle que Laura
   passe à ``prepare_message_for_contact``) : une demande explicite gagne ;
2. ``relation`` / ``poste`` / ``objectif`` — une donnée existante (état de
   relation du SalesContext, persona calculé depuis le poste) ;
3. ``defaut``  — la règle par défaut, NOMMÉE comme telle ;
4. sinon ``missing`` — la matière d'UNE question groupée (#1923 : une seule).

Ce que le module ne fait PAS : poser la question. Le composer n'a pas de tour
de dialogue, et le copilote (``chat_tools`` / ``bellum_advisor``) est hors de
ce lot — ``missing`` est rendu à l'appelant, qui décide de la poser.

Les NEUF objectifs de l'issue (#1926.9-.17) portent chacun leurs règles propres.
Six d'entre eux (#1926.11-.15, .17) étaient RECONNUS sans règles : le prompt
renvoyait alors à l'angle du commercial — honnête, mais un objectif nommé sans
règles laisse le modèle rédiger comme il rédige tout le reste, ce qui est
exactement ce que l'issue reproche. Un état de relation, lui, ne se range
toujours pas de force dans un objectif : ``connu``, ``client_actif``,
``besoin_ouvert`` et ``rang2`` n'en dérivent aucun, et le cadrage renvoie alors
au bloc RELATION AU COMPTE qui, lui, les décrit.

Doctrine c58 : rien ici ne lit un critère protégé — seuls le poste, l'état de
relation du COMPTE et le texte de l'angle entrent dans le cadrage.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.knowledge.channel_length import CHANNEL_LENGTH
from app.knowledge.message_matrix import MESSAGE_MATRIX
from app.knowledge.persona import PERSONA_UNKNOWN, contact_persona
from app.services.decision_role import classify_decision_role
from app.services.relationship_playbook import MESSAGE_PLAYBOOK, objective_premise_holds
from app.services.text_norm import normalize_name

# #1926.9-.17 — les neuf objectifs de la taxonomie, avec LEURS règles. Les
# règles sont écrites pour le MODÈLE (texte de prompt) ; le code est le contrat.
MESSAGE_OBJECTIVES: dict[str, dict[str, str]] = {
    "ouverture_compte": {
        "label": "ouvrir le compte",
        "rules": (
            "premier contact sur ce compte : un signal crédible propre à CE compte, puis UNE question facile. "
            "Aucune présentation de l'ESN, aucune demande de rendez-vous."
        ),
        "cta": "question_facile",
    },
    "relance": {
        "label": "relancer",
        "rules": (
            "un premier message est resté sans réponse. Apporte un élément NEUF (un signal, un cas, une donnée "
            "précise) ; rappelle le premier message en une demi-phrase au plus ; ne reproche jamais le silence ; "
            "aucune relance creuse du type « je reviens vers vous »."
        ),
        "cta": "sortie_elegante",
    },
    "reprise_relation": {
        "label": "reprendre la relation",
        "rules": (
            "une relation a existé avec ce compte. Cite le fait d'historique EXACT fourni dans le contexte (quoi, "
            "avec qui, quand) ; s'il n'y en a aucun, n'en suppose pas — écris « élément à vérifier » ; demande ce "
            "qui a changé depuis."
        ),
        "cta": "ce_qui_a_change",
    },
    # #1926.11 — une information demandée, pas une vente déguisée en question.
    # #2204.21 (Louis 16-17/10) — « valider un contexte » est CE même objectif, pas un objectif en plus (GA-26).
    "demande_information": {
        "label": "obtenir une information précise ou valider un contexte",
        "rules": (
            "tu cherches UNE information précise, celle que nomme l'angle. Demande-la directement et dis à quoi "
            "elle te sert ; rien d'autre dans le message — aucune offre, aucun argumentaire, aucune proposition "
            "de rendez-vous. Une question posée pour ouvrir une vente se voit, et ne reçoit pas de réponse. "
            "Si tu as déjà compris une partie du contexte (le besoin, l'organisation, le calendrier) et veux le "
            "FAIRE CONFIRMER, énonce-le comme une hypothèse — jamais comme un fait — en t'appuyant UNIQUEMENT sur "
            "ce que le contexte fournit, puis pose UNE question fermée pour la confirmer ou la corriger."
        ),
        "cta": "question_facile",
    },
    # #1926.12 — on demande un aiguillage ; on ne juge jamais l'interlocuteur.
    "recommandation": {
        "label": "être orienté vers le bon interlocuteur",
        "rules": (
            "tu demandes vers QUI te tourner sur un sujet nommé. Dis en une phrase pourquoi tu écris à cette "
            "personne-là, puis demande l'aiguillage. N'insinue jamais qu'elle n'est pas la bonne personne, et "
            "n'invente aucun référent : si le contexte n'en fournit aucun, n'en cite aucun."
        ),
        "cta": "vers_qui",
    },
    # #1926.13 — une expertise se prouve par un fait déclaré, jamais par un
    # superlatif (règle d'or « aucune promesse non prouvée »).
    "positionnement_expertise": {
        "label": "faire connaître une expertise",
        "rules": (
            "tu fais connaître une expertise, tu ne vends rien dans ce message. Appuie-la sur un fait DÉCLARÉ par "
            "l'ESN dans le contexte (une référence, un retour d'expérience, un chiffre fourni) et relie-la à un "
            "sujet réel de CE compte. Sans fait déclaré, dis simplement sur quoi l'équipe travaille — jamais un "
            "superlatif, jamais une promesse de résultat."
        ),
        "cta": "aucune_demande",
    },
    # #1926.14 — garder le lien : le message doit rester acceptable sans réponse.
    "nurturing": {
        "label": "garder le lien",
        "rules": (
            "tu entretiens le lien sans rien vendre. Apporte UNE chose utile qui vaut le coup d'être lue même si "
            "la personne ne répond jamais (un élément de son marché, un retour d'expérience, une ressource) ; "
            "aucune offre, aucune relance déguisée, aucune demande de rendez-vous."
        ),
        "cta": "aucune_demande",
    },
    # #1926.15 — après un échange, on ne reconstitue pas ce qui s'est dit.
    "suivi_rendez_vous": {
        "label": "faire suite au rendez-vous",
        "rules": (
            "un échange a déjà eu lieu. Reprends UNIQUEMENT les points fournis dans le contexte (ce qui a été dit, "
            "décidé, par qui) — n'en reconstitue aucun de mémoire ; confirme ce que tu fais de ton côté, puis "
            "nomme la prochaine étape convenue. Si aucun point n'est fourni, demande confirmation de ce qui a été "
            "retenu au lieu de l'écrire à leur place."
        ),
        "cta": "prochaine_etape",
    },
    # #1926.17 — une échéance ne s'invente pas : ce serait la fausse urgence
    # que la règle d'or bannit déjà (#1926.23).
    "renouvellement": {
        "label": "préparer le renouvellement",
        "rules": (
            "un engagement en cours arrive à son terme. Cite l'échéance et le périmètre EXACTS fournis dans le "
            "contexte ; s'ils n'y sont pas, demande-les au lieu de les supposer — aucune date, aucune durée, "
            "aucune rareté inventée. Parle de ce qui a été livré avant de parler de la suite."
        ),
        "cta": "echange_court",
    },
    # #2374.6 — un dixième objectif, ajouté après la taxonomie initiale
    # (#1926.9-.17) : un document (dossier, étude de cas, proposition) a déjà
    # été envoyé. Même règle que #1926.15 (« suivi de rendez-vous ») : reprendre
    # UNIQUEMENT ce que le contexte fournit, jamais reconstituer le contenu
    # envoyé de mémoire.
    "suivi_document": {
        "label": "faire suite à un document envoyé",
        "rules": (
            "un document (dossier, étude de cas, proposition) a déjà été envoyé à cette personne. Reprends "
            "UNIQUEMENT ce que le contexte nomme (quel document, quand) — n'en reconstitue aucun de mémoire ; "
            "demande si la lecture a soulevé une question, ou propose la prochaine étape SI le contexte la fournit."
        ),
        "cta": "prochaine_etape",
    },
    # #2947/#2204.22 — un onzième objectif : demander une INTRODUCTION vers un
    # tiers, distinct de `recommandation` (#1926.12, qui demande VERS QUI se
    # tourner sans nommer personne) : ici, le tiers est déjà identifié — on
    # demande à CETTE personne de nous mettre en relation avec LUI.
    "introduction": {
        "label": "demander une introduction",
        "rules": (
            "tu demandes à cette personne de te mettre en relation avec un tiers nommé dans le contexte — jamais "
            "de lui vendre à ELLE. Dis en une phrase pourquoi cette mise en relation précisément, sans présumer "
            "que le tiers visé est intéressé ni promettre ce que la mise en relation produira."
        ),
        "cta": "demander_intro",
    },
    # #2947/#2204.27 — un douzième objectif : explorer un PARTENARIAT entre
    # organisations (co-traitance, apport d'affaires, sous-traitance) —
    # jamais une vente à la personne elle-même.
    "partenariat": {
        "label": "explorer un partenariat",
        "rules": (
            "tu explores une collaboration entre organisations (co-traitance, apport d'affaires, sous-traitance) — "
            "jamais une vente à cette personne. Nomme la nature de la collaboration envisagée et pourquoi CETTE "
            "organisation précisément, sans promettre de volume ni de délai."
        ),
        "cta": "explorer_partenariat",
    },
    # #2371.3 (reste) — un treizième objectif : pousser un consultant identifié
    # pour un besoin ou une opportunité (scénario D de #2386, « push profil »).
    # Distinct de #1926.13 (`positionnement_expertise`) : celui-ci ne nomme
    # jamais une personne, celui-ci en nomme une précise.
    "proposer_profil": {
        "label": "proposer un profil",
        "rules": (
            "tu proposes un profil (consultant) concret pour un besoin ou une opportunité. Nomme le profil et le "
            "fait EXACTS fournis dans le contexte (l'expertise, la disponibilité annoncée, l'opportunité qui "
            "justifie de le proposer maintenant) ; ne promets jamais une disponibilité ou une compétence non "
            "fournie ; si aucun besoin ou opportunité précis n'est nommé dans le contexte, ne pousse pas le "
            "profil à froid — écris pour ouvrir la conversation, pas pour le placer."
        ),
        "cta": "echange_court",
    },
    # #2204.21 (épopée #2947) — HISTORIQUE. Louis (16-17/10) : « valider un contexte » est
    # `demande_information`, pas un objectif en plus (GA-26). Ce code reste ACCEPTÉ pour les valeurs déjà
    # enregistrées et se résout sur `demande_information` (`OBJECTIVE_ALIASES`) ; il n'est plus détecté ni proposé.
    "valider_contexte": {
        "label": "valider un contexte",
        "rules": (
            "tu as déjà compris une partie du contexte de cette personne (le besoin, l'organisation, le calendrier) "
            "et tu veux le faire CONFIRMER. Énonce ce que tu crois avoir compris comme une hypothèse — jamais comme "
            "un fait acquis — en t'appuyant UNIQUEMENT sur ce que le contexte fournit, puis pose UNE question "
            "fermée pour la confirmer ou la corriger. Aucune offre, aucun argumentaire : si le contexte ne fournit "
            "aucun élément à valider, demande d'abord ce qui est en jeu au lieu d'en supposer un."
        ),
        "cta": "question_facile",
    },
    # #4060 — une approche DIRECTE, quand l'utilisateur la choisit : le message
    # annonce ce qu'on propose et qualifie le besoin, sans signal public ni
    # accroche imposés. Les autres voix (signal crédible, relance…) restent les
    # règles de leurs objectifs : le produit n'impose pas UNE seule voix.
    "approche_directe": {
        "label": "approche directe",
        "rules": (
            "approche directe choisie par le commercial : annonce en une phrase ce que l'ESN propose, appuie-toi "
            "sur le rôle du destinataire et le périmètre fournis, puis pose UNE question pour qualifier le besoin. "
            "Aucun signal, aucun article, aucune actualité n'est requis, et tu n'en ajoutes aucun pour meubler. "
            "N'affirme jamais un besoin, un projet ou un budget que le contexte n'établit pas : qualifie-le en "
            "demandant. Pas de détour de curiosité."
        ),
        "cta": "echange_court",
    },
}

# #1926.8 — les appels à l'action, en texte de prompt.
_CTA_RULES: dict[str, str] = {
    "question_facile": "UNE question facile, à laquelle on répond en une ligne — pas de demande de rendez-vous.",
    "sortie_elegante": (
        "une question encore plus simple que la première, ou une sortie élégante (« si ce n'est pas vous, qui ? »)."
    ),
    "ce_qui_a_change": "demander ce qui a changé depuis (équipe, périmètre, priorités).",
    "echange_court": "proposer un échange court, en donnant la raison précise de le faire.",
    "vers_qui": (
        "demander vers qui se tourner sur le sujet nommé — une seule question, avec une sortie si ce n'est pas elle."
    ),
    "aucune_demande": (
        "aucune demande — le message se suffit. Au plus, une porte ouverte que la personne peut ignorer sans coût."
    ),
    "prochaine_etape": (
        "confirmer la prochaine étape convenue, avec sa date si le contexte la fournit — sinon demander laquelle "
        "retenir."
    ),
    # #2947/#2204.22
    "demander_intro": (
        "demander explicitement la mise en relation avec le tiers nommé, en proposant de préparer un message "
        "court à transférer si utile."
    ),
    # #2947/#2204.27
    "explorer_partenariat": "proposer un échange court pour explorer une collaboration concrète, sans engagement.",
}

# Les états de relation dont l'objectif se DÉDUIT : miroir de
# ``scenarioForRelationship`` (``packages/contracts/src/schemas/
# outreach-scenarios.ts``), la correspondance état → scénario que lit déjà le
# contrôle avant envoi — gardée par ``test_message_brief.py``, qui lit le TS. Un
# état qu'aucun scénario ne couvre (connu, client_actif, besoin_ouvert, rang2)
# ne se range pas de force dans un objectif : il reste ``indetermine``, et c'est
# son playbook de relation qui porte la consigne.
_STATE_TO_SCENARIO: dict[str, str] = {
    "linkedin": "accepted_connection",
    "dormant": "dormant_connection",
    "ancien_client": "dormant_connection",
    "refere": "referred_contact",
    "froid": "cold_approach",
}
# Les quatre scénarios, rangés dans les objectifs de ce lot.
_SCENARIO_TO_OBJECTIVE: dict[str, str] = {
    "cold_approach": "ouverture_compte",
    "accepted_connection": "ouverture_compte",
    "referred_contact": "ouverture_compte",
    "dormant_connection": "reprise_relation",
}
_STATE_TO_OBJECTIVE: dict[str, str] = {
    state: _SCENARIO_TO_OBJECTIVE[scenario] for state, scenario in _STATE_TO_SCENARIO.items()
}

#: #2204.21 (Louis 16-17/10) — « valider un contexte » n'est PAS un objectif en plus (GA-26) : c'est
#: `demande_information`. Le code historique `valider_contexte` reste ACCEPTÉ (valeurs déjà enregistrées) et se
#: résout ici ; il n'est plus détecté depuis l'angle ni proposé par l'écran.
OBJECTIVE_ALIASES: dict[str, str] = {"valider_contexte": "demande_information"}


# Mots de l'angle, lus sur le texte NORMALISÉ (sans accents, minuscules).
# L'ORDRE décide : les trois objectifs génériques sont testés d'abord, si bien
# que « relance sur le renouvellement » est une relance, pas un renouvellement.
_OBJECTIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("relance", re.compile(r"\brelanc")),
    ("reprise_relation", re.compile(r"\breprendre (le )?contact|\breprise\b|\brenouer\b|\breactiv")),
    (
        "ouverture_compte",
        re.compile(r"\bouvrir (le |un |ce )?compte|\bouverture\b|\bpremier contact\b|\bprise de contact\b"),
    ),
    ("renouvellement", re.compile(r"\brenouvel")),
    (
        "suivi_rendez_vous",
        re.compile(r"\bsuivi (de |du )?(rendez-vous|rdv)\b|\bapres (le |notre )?(rendez-vous|rdv)\b"),
    ),
    # #2374.6 — testé AVANT "recommandation" et les autres motifs génériques
    # sans conflit connu ; testé APRÈS `suivi_rendez_vous` pour qu'un
    # « suivi » sans complément de rendez-vous retombe ici plutôt que d'y
    # entrer par erreur — les deux motifs ne se recouvrent pas (rendez-vous/
    # rdv vs document/dossier/proposition).
    (
        "suivi_document",
        re.compile(
            r"\bsuivi (apres |du |de la |d'un )?(l'envoi (du |de la )?)?(document|dossier|proposition)\b"
            r"|\bapres (l')?envoi (du |de la )?(document|dossier|proposition)\b"
        ),
    ),
    ("recommandation", re.compile(r"\brecommandation\b")),
    ("nurturing", re.compile(r"\bnurturing\b")),
    ("demande_information", re.compile(r"\b(demander|obtenir) (une |des )?info")),
    ("positionnement_expertise", re.compile(r"\bpositionner (une |notre |nos |mon |mes )?expertise")),
    # #2947/#2204.22 — testé avant `recommandation` n'est pas nécessaire : les
    # deux motifs ne se recouvrent pas (« introduction » vs « recommandation »).
    ("introduction", re.compile(r"\bintroduction\b|\bmettre en relation\b|\bmise en relation\b")),
    # #2947/#2204.27
    ("partenariat", re.compile(r"\bpartenariat\b|\bco-traitance\b|\bcotraitance\b|\bapport d'affaires\b")),
    # #2887 — onzième objectif : arrivé avec ses règles et son CTA
    # (`MESSAGE_OBJECTIVES["proposer_profil"]`) mais SANS motif de détection
    # depuis l'angle libre — le seul des onze qui ne pouvait jamais être atteint
    # autrement que par un choix explicite du formulaire. Mesuré à
    # l'intégration (#2367.11/#2910, matin B, 26/09) : `test_outreach_persona_
    # context_golden.py` couvrait dix objectifs, le prompt en portait onze.
    ("proposer_profil", re.compile(r"\bpropos\w*\b.*\bprofil\b")),
    # #2204.21 — « valider/confirmer (un|le|notre…) contexte/hypothèse ». EN FIN,
    # après `relance` et `demande_information` : un angle qui relance ou cherche
    # une information garde son objectif d'origine.
    (
        "demande_information",
        re.compile(
            r"\b(valider|confirmer|verifier) (une |le |la |notre |nos |son |leur )?(comprehension |hypothese |le )?"
            r"(du )?(contexte|hypothese)\b"
        ),
    ),
    # #4060 — l'approche directe demandée dans l'angle. « ton plus direct » (un
    # réglage de FORME, `_TONE_ADJUSTMENTS`) ne la déclenche pas.
    ("approche_directe", re.compile(r"\bapproche directe\b|\bmessage direct\b|\bvoix directe\b")),
)
# #2123.61-.68 — les codes que le FORMULAIRE du composer peut choisir. Le miroir
# TS (`message-parameters.ts`) est tenu par ``test_message.py``, qui le lit.
# #1926.11-.15, .17 — les six objectifs jadis « reconnus sans règles » portent
# désormais les leurs : il n'y a plus de liste de différés à exposer.
MESSAGE_CTAS: tuple[str, ...] = tuple(_CTA_RULES)
RELATIONSHIP_STATES: tuple[str, ...] = ("froid", *MESSAGE_PLAYBOOK)
_TU = re.compile(r"\btutoi|\btutoy")
_VOUS = re.compile(r"\bvouvoi|\bvouvoy")
_MEETING = re.compile(r"\brendez-vous\b|\brdv\b|\bvisio\b|\b15 ?min")
_NO_MEETING = re.compile(r"\bsans (demande de )?(rendez-vous|rdv)\b")


def objective_cta_rule(objective: str | None) -> str | None:
    """#2947 (#2204.11) — l'appel à l'action d'un objectif, en texte de prompt,
    pour le prompt BATCH (``bellum_messages.message_objective_block``) : la même
    table que le composer, jamais une seconde. ``None`` hors taxonomie."""
    entry = MESSAGE_OBJECTIVES.get(objective or "")
    return _CTA_RULES.get(entry["cta"]) if entry else None


def objective_asks_nothing(objective: str | None) -> bool:
    """#2947 (#2204.11) — l'objectif ne demande RIEN (``aucune_demande`` :
    nurturing, positionnement d'expertise) : la séquence batch ne finit alors
    pas sur une demande de 15 minutes."""
    entry = MESSAGE_OBJECTIVES.get(objective or "")
    return bool(entry) and entry["cta"] == "aucune_demande"


def _first(patterns: tuple[tuple[str, re.Pattern[str]], ...], text: str) -> str | None:
    return next((code for code, pattern in patterns if pattern.search(text)), None)


def derive_message_brief(
    *,
    contact: Mapping[str, Any],
    relationship_state: str | None,
    angle: str | None,
    parameters: Mapping[str, Any] | None = None,
    channel: str | None = None,
) -> dict[str, Any]:
    """Le cadrage d'UN message, chaque valeur avec sa provenance.

    Rend ``{objective, objectiveSource, relationship, persona, decisionRole,
    formality, formalitySource, cta, ctaSource, forbidden, forbiddenSource,
    missing}``. Codes seulement — aucun libellé d'affichage : l'écran traduit,
    l'IA ne rédige pas l'interface.
    """
    text = normalize_name(angle)
    state = (relationship_state or "").strip()
    # #2123.61-.63 / .68 — un paramètre CHOISI dans le formulaire gagne sur la
    # dérivation, et sa provenance le dit (``formulaire``). L'appelant a déjà
    # validé les codes (``MessageParameters``) et retiré les valeurs vides.
    chosen = parameters or {}

    # #1926.2 — l'objectif : l'angle, puis la relation, jamais deviné.
    objective = chosen.get("objective") or _first(_OBJECTIVE_PATTERNS, text)
    objective = OBJECTIVE_ALIASES.get(objective, objective) if objective else objective
    if chosen.get("objective"):
        objective_source = "formulaire"
    elif objective:
        objective_source = "angle"
    elif not state:
        objective, objective_source = "ouverture_compte", "defaut"
    elif state in _STATE_TO_OBJECTIVE:
        objective, objective_source = _STATE_TO_OBJECTIVE[state], "relation"
    else:
        objective_source = "indetermine"

    # #1926.4 — le niveau hiérarchique : le persona calculé depuis le poste.
    persona = chosen.get("persona") or contact_persona(dict(contact))

    # #3418.4 (retour bêta 30/09) — « rôle dans la décision », déterminé AVANT
    # rédaction comme les autres axes de ce cadrage. `decision_role` est
    # calculé à l'analyse (`classify_decision_role`, colonne `contacts.decision_role`)
    # et déjà fetché par l'appelant (`message.py`) — il manquait seulement à
    # CE cadrage. Repli sur le titre quand la colonne est vide (rejeu d'un
    # dossier antérieur), MÊME classifieur que la colonne, jamais une seconde
    # règle. `None` (titre vide ou aucune règle ne correspond) ⇒ `missing`,
    # jamais deviné.
    decision_role = contact.get("decision_role") or classify_decision_role(contact.get("title"))

    # #1926.5 — le registre du message EXTERNE : celui que le commercial demande,
    # sinon le vouvoiement (aucune préférence n'est stockée par contact).
    if _TU.search(text):
        formality, formality_source = "tu", "angle"
    elif _VOUS.search(text):
        formality, formality_source = "vous", "angle"
    else:
        formality, formality_source = "vous", "defaut"

    # #1926.8 — l'appel à l'action : l'angle, puis l'objectif, puis la règle d'or.
    # #1926.15 — « suivi du rendez-vous de mardi » NOMME un rendez-vous passé :
    # le lire comme une demande de rendez-vous ferait proposer un échange à qui
    # sort justement d'un échange.
    if chosen.get("cta"):
        cta, cta_source = chosen["cta"], "formulaire"
    elif _MEETING.search(text) and not _NO_MEETING.search(text) and objective != "suivi_rendez_vous":
        cta, cta_source = "echange_court", "angle"
    elif objective:
        cta, cta_source = MESSAGE_OBJECTIVES[objective]["cta"], "objectif"
    else:
        cta, cta_source = "question_facile", "defaut"

    # #2887.5 — « interdits » : le sixième attribut composé du triplet
    # persona × stade × objectif, rendu comme DONNÉE pour un appelant qui a
    # besoin du cadrage complet sans reparser le prompt (`MessageInsightPanel`).
    # Même source que `relationship_playbook.message_directive_block`
    # (``MESSAGE_PLAYBOOK``, déjà importé) — zéro second texte, zéro risque de
    # divergence (GA-26) : ce bloc ne RÉÉCRIT rien, il COMPOSE ce qui existe déjà.
    # ``froid`` ne porte aucune interdiction PROPRE au stade (la règle d'or n°3
    # suffit) : ``sans_objet``, jamais confondu avec un stade non mesuré
    # (#2371.4 — non mesuré n'est jamais traité comme froid, ni l'inverse).
    if state == "froid":
        forbidden, forbidden_source = None, "sans_objet"
    elif state in MESSAGE_PLAYBOOK:
        forbidden, forbidden_source = MESSAGE_PLAYBOOK[state]["forbidden"], "relation"
    else:
        forbidden, forbidden_source = None, "non_mesure"

    missing = [
        name
        for name, absent in (
            ("objective", objective is None),
            ("persona", persona is None),
            ("decisionRole", decision_role is None),
        )
        if absent
    ]
    # Les deux provenances neuves n'apparaissent QUE sur un choix du formulaire :
    # sans paramètre, le cadrage rendu est celui d'avant, clé pour clé.
    sources = {f"{name}Source": "formulaire" for name in ("relationship", "persona") if chosen.get(name)}
    # #2371.5 — « longueur » : le sixième attribut, lu de la MÊME donnée que le
    # prompt (`channel_length`, GA-26). Sans canal passé, ni clé ni valeur : le
    # cadrage d'avant reste identique clé pour clé. Un canal inconnu n'est
    # jamais deviné : `null`, `non_mesure`.
    if channel is not None:
        sources["length"] = CHANNEL_LENGTH.get(channel)
        sources["lengthSource"] = "canal" if channel in CHANNEL_LENGTH else "non_mesure"
    return {
        "objective": objective,
        "objectiveSource": objective_source,
        # #1926.3 — la relation au compte ; `null` = aucun état connu (jamais un « froid » supposé).
        "relationship": state or None,
        # Toujours calculé depuis le poste ; `null` = non déterminé (voir `missing`).
        "persona": persona,
        # #3418.4 — `null` = non déterminé (titre vide ou hors taxonomie), voir `missing`.
        "decisionRole": decision_role,
        "formality": formality,
        "formalitySource": formality_source,
        "cta": cta,
        "ctaSource": cta_source,
        # #2887.5 — ``None`` = aucune interdiction de STADE à nommer (froid, ou
        # stade non mesuré) ; jamais "aucune", jamais deviné.
        "forbidden": forbidden,
        "forbiddenSource": forbidden_source,
        "missing": missing,
        **sources,
    }


def message_brief_block(brief: Mapping[str, Any] | None) -> str:
    """Le cadrage rendu pour le prompt utilisateur. ``None`` ⇒ ``""`` : un
    appelant sans cadrage garde le prompt d'avant ce lot, à l'octet près.

    Ce qu'un autre bloc dit déjà n'y est pas redit — deux consignes sur le même
    sujet divergent, et le modèle choisit laquelle ignorer :

    * la relation, et les règles d'un objectif que le bloc RELATION AU COMPTE
      (``message_directive_block``) décrit déjà pour cet état ;
    * le registre par défaut, que porte la ligne TON du prompt système : seul un
      tu/vous DEMANDÉ par le commercial est rendu ici."""
    if not brief:
        return ""
    objective = brief.get("objective")
    objective = OBJECTIVE_ALIASES.get(objective, objective) if isinstance(objective, str) else objective
    state = brief.get("relationship") or ""
    if objective in MESSAGE_OBJECTIVES and state in MESSAGE_PLAYBOOK and _STATE_TO_OBJECTIVE.get(state) == objective:
        objective_line = f"- Objectif : {MESSAGE_OBJECTIVES[objective]['label']} — suis le bloc RELATION AU COMPTE."
    elif objective in MESSAGE_OBJECTIVES:
        entry = MESSAGE_OBJECTIVES[objective]
        objective_line = f"- Objectif : {entry['label']} — {entry['rules']}"
    elif state in MESSAGE_PLAYBOOK:
        # #1926.2 — le défaut qu'avait épinglé le golden persona × contexte :
        # écrire ici « sans supposer de relation ni de besoin » pendant que le
        # bloc RELATION AU COMPTE, trois lignes plus haut, décrit un client
        # actif ou un besoin qualifié, donne DEUX consignes contraires — l'une
        # des deux est ignorée, et on ne choisit pas laquelle.
        objective_line = (
            "- Objectif : aucun objectif type ne couvre cet état de relation — suis le bloc RELATION AU COMPTE."
        )
    else:
        objective_line = (
            "- Objectif : non déterminé — écris une ouverture prudente, sans supposer de relation ni de besoin."
        )
    # #2371 — stade × objectif : un objectif dont la prémisse écrite contredit la
    # relation MESURÉE (« premier contact » adressé à un client actif) est NOMMÉ
    # comme tel. L'objectif reste celui choisi — une correction humaine gagne —
    # mais le modèle ne recopie pas une prémisse fausse. Sans contradiction, la
    # ligne est celle d'avant, à l'octet près.
    if objective_premise_holds(state, objective) is False:
        # Le froid n'a pas de ligne de stade (le prompt de base le décrit) : on
        # le nomme sans renvoyer à un bloc RELATION qui n'existe pas pour lui.
        stage = MESSAGE_MATRIX["stages"][state]
        stage_label = stage["label"] if stage else "compte froid, aucun contact connu"
        objective_line += (
            f"\n  ⚠️ La prémisse de cet objectif ne correspond pas à la relation mesurée ({stage_label}) : "
            "garde l'objectif, mais n'affirme pas sa prémisse — n'écris de la relation que ce que le "
            "contexte fournit."
        )
    persona = brief.get("persona")
    persona_origin = (
        "choisi par le commercial" if brief.get("personaSource") == "formulaire" else "calculé depuis le poste"
    )
    persona_line = (
        f"- Niveau hiérarchique : persona {persona} ({persona_origin}) — sers-t'en pour le levier."
        if persona
        else f"- Niveau hiérarchique : {PERSONA_UNKNOWN} — reste factuel, aucun levier supposé."
    )
    formality_line = ""
    if brief.get("formalitySource") == "angle":
        formality = "tutoiement" if brief.get("formality") == "tu" else "vouvoiement"
        formality_line = f"- Ton : {formality} (demandé par le commercial) — garde ce registre du début à la fin.\n"
    cta = _CTA_RULES.get(str(brief.get("cta")), _CTA_RULES["question_facile"])
    return (
        "\n\nCADRAGE DU MESSAGE (fixé AVANT la rédaction — ne le contredis pas) :\n"
        f"{objective_line}\n"
        f"{persona_line}\n"
        f"{formality_line}"
        f"- Appel à l'action : {cta}"
    )


# #2123.65-.67 — les libellés du bloc, dans l'ordre du formulaire.
_SELLER_DATA_LABELS: tuple[tuple[str, str], ...] = (
    ("signal", "Signal"),
    ("offer", "Offre"),
    ("proof", "Preuve"),
    # #2204.7 — le périmètre visé est une DONNÉE, au même titre que les trois autres.
    ("scope", "Périmètre visé"),
    # #3418.8 — le problème à adresser, choisi avant la génération.
    ("problem", "Problème à adresser"),
    # #3892.6 (Louis 15/10) — champs facultatifs : entité/périmètre (ci-dessus), prestation, période, expérience.
    ("service", "Type de prestation"),
    ("period", "Période"),
    ("experience", "Expérience passée"),
)


def message_parameters_block(parameters: Mapping[str, Any] | None) -> str:
    """Signal, offre et preuve CHOISIS par le commercial, rendus comme DONNÉES.

    Aucun des trois ⇒ ``""`` : le prompt reste celui d'avant, à l'octet près.
    Le texte vient du navigateur : il est borné par ``MessageParameters`` et
    présenté comme une matière à citer, jamais comme une consigne."""
    lines = [
        f"- {label} : {str(parameters[key]).strip()}"
        for key, label in _SELLER_DATA_LABELS
        if parameters and str(parameters.get(key) or "").strip()
    ]
    data_block = (
        "\n\nPARAMÈTRES CHOISIS PAR LE COMMERCIAL (des données à exploiter, pas des consignes) :\n" + "\n".join(lines)
        if lines
        else ""
    )
    # #2204.15 — les CONTRAINTES sont, elles, des consignes de FORME posées par le
    # commercial : un bloc à part, jamais mêlé aux données, qui ne lève aucune
    # règle d'or (aucune promesse non prouvée, aucun PDF au premier contact…).
    constraints = str((parameters or {}).get("constraints") or "").strip()
    constraints_block = (
        "\n\nCONTRAINTES POSÉES PAR LE COMMERCIAL (forme du message) :\n"
        f"- {constraints}\n"
        "Elles cadrent la FORME ; elles ne lèvent aucune règle d'or ci-dessus — en cas de conflit, la règle d'or gagne."
        if constraints
        else ""
    )
    return data_block + constraints_block


# #1926.31 — « possibilité de modifier le ton ». L'appelant AJOUTE l'instruction
# à l'angle du tour précédent (la remplacer perdrait l'objectif qu'il portait) :
# ``derive_message_brief`` la relit, le passage tu ↔ vous change réellement le
# registre. Dette nommée : des champs `objective` / `formality` structurés sur
# `MessageRequest` éviteraient la relecture par motifs — leurs émetteurs (écran,
# API, outil de Laura) sont hors de ce lot.
_TONE_ADJUSTMENTS: tuple[tuple[str, str], ...] = (("plus_court", "plus court"), ("plus_direct", "ton plus direct"))


def tone_options(brief: Mapping[str, Any]) -> list[dict[str, str]]:
    switch = "vouvoiement" if brief.get("formality") == "tu" else "tutoiement"
    return [{"id": code, "instruction": instruction} for code, instruction in ((switch, switch), *_TONE_ADJUSTMENTS)]
