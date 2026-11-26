"""Le PERSONA d'un contact — calculé une fois, jamais re-déduit par le modèle.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT QUE CE MODULE FERME
─────────────────────────────────────────────────────────────────────────────
Le palier hiérarchique d'un contact est calculé DÉTERMINISTEMENT depuis son
poste, en Python, à la phase 3 (``classify_hierarchy_level``), et il voyage
jusqu'au prompt messages : chaque dict de contact porte ``hierarchyLevel``, en
``computed_field`` toujours émis.

Le prompt messages le jetait. Il ne transmettait que le titre, puis demandait au
modèle : « Pour CHAQUE contact, déduis son PERSONA depuis son titre ». On payait
donc un appel de modèle pour recalculer ce qu'on savait déjà — et on obtenait
deux vérités, qui n'ont aucune raison de coïncider : le contrôle avant envoi
(``right_persona``) juge sur le persona CALCULÉ, le message est écrit sur le
persona DEVINÉ.

Une dérivation vit à un seul endroit (GA-26). Elle vit ici, côté Python, et une
garde de parité (``tests/test_persona_parity.py``) la tient alignée sur la
source TS.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UNE COPIE PLUTÔT QU'UN IMPORT
─────────────────────────────────────────────────────────────────────────────
La table des leviers et la dérivation palier → persona vivent dans
``packages/contracts/src/schemas/outreach-scenarios.ts``, parce que c'est le
contrôle avant envoi (TypeScript, côté web) qui en est le premier lecteur. Le
service IA est un AUTRE PROCESSUS, en Python : il ne peut pas importer ce
fichier. Même frontière et même remède que ``relationship_playbook`` /
``test_cadence_parity`` — une copie que rien ne vérifie finit toujours par
diverger, donc la copie est gardée.

⚠️ Le vocabulaire canonique est SANS ACCENT (``decideur``, ``operationnel``) :
c'est celui de ``OUTREACH_PERSONAS``. Le prompt écrivait ``"décideur | manager |
opérationnel"``, accentué — une valeur qu'aucun consommateur TS n'aurait
reconnue le jour où quelqu'un aurait voulu la lire.
"""

from __future__ import annotations

from typing import Any

from app.services.hierarchy_level import classify_hierarchy_level

#: Les sept cases, dans l'ordre de ``OUTREACH_PERSONAS`` (TS). #2887 (#2371.2) —
#: une par palier RÉEL de ``classify_hierarchy_level``, plus de collapse.
PERSONAS: tuple[str, ...] = ("decideur", "gouvernance", "direction", "manager", "acheteur", "expert", "operationnel")

#: Ce qui est DIT quand le poste n'a pas permis de trancher. Nommé plutôt que
#: laissé vide : un persona absent qui deviendrait « opérationnel » par défaut
#: proposerait le levier d'un opérationnel à quelqu'un dont on n'a jamais vu le
#: poste — c'est deviner, et le TS rend ``null`` pour cette raison exacte.
PERSONA_UNKNOWN = "non déterminé"

#: Miroir de ``OUTREACH_PERSONA_PROFILES`` (TS). Gardé par la parité.
PERSONA_PROFILES: dict[str, dict[str, str]] = {
    "decideur": {
        "lever": "un arbitrage qu’il est en train de faire",
        "speaks_in": "enjeu, arbitrage, conséquence à six mois",
        "turns_off": "le détail d’exécution, et toute forme de brochure",
    },
    "gouvernance": {
        "lever": "un enjeu de gouvernance ou de risque qu’il doit porter au conseil",
        "speaks_in": "mandat, risque, redevabilité",
        "turns_off": "le détail opérationnel, et toute sollicitation commerciale directe",
    },
    "direction": {
        "lever": "un objectif de sa direction pour la période en cours",
        "speaks_in": "objectif, budget de sa direction, résultat mesurable",
        "turns_off": "le discours générique sans lien avec son périmètre",
    },
    "manager": {
        "lever": "une contrainte d’équipe qu’il vit cette semaine",
        "speaks_in": "délai, charge, capacité à tenir un jalon",
        "turns_off": "le discours stratégique au-dessus de son périmètre",
    },
    "acheteur": {
        "lever": "un enjeu de coût, de contrat ou de fournisseur en cours de discussion",
        "speaks_in": "coût, conditions contractuelles, risque fournisseur",
        "turns_off": "l’argumentaire technique sans aucun chiffrage",
    },
    "expert": {
        "lever": "un problème technique de fond qu’il cherche à résoudre",
        "speaks_in": "architecture, choix technique, retour d’expérience",
        "turns_off": "le discours commercial ou managérial",
    },
    "operationnel": {
        "lever": "un sujet technique précis sur lequel il travaille",
        "speaks_in": "stack, pratique, ce qui marche vraiment",
        "turns_off": "le vocabulaire commercial, sous toutes ses formes",
    },
}

#: La consigne de RÉDACTION propre à chaque persona. Elle ne vient pas du TS —
#: le contrôle avant envoi n'en a pas besoin, et l'y remonter obligerait à
#: garder un texte de prompt dans un schéma. Elle complète le levier, elle ne le
#: remplace pas.
_WRITING_ADVICE: dict[str, str] = {
    "decideur": (
        "Reste au niveau du CADRAGE — demande le bon point d’entrée, "
        "ne propose pas une mission détaillée sans sponsor terrain."
    ),
    "gouvernance": "Reste au niveau du MANDAT — jamais une sollicitation commerciale directe.",
    "direction": "Un objectif de direction chiffré, jamais un discours générique.",
    "manager": "Un cas concret chiffré.",
    "acheteur": "Un chiffrage ou une condition contractuelle concrète.",
    "expert": "Un point technique précis, jamais un argumentaire commercial.",
    "operationnel": "UNE question binaire facile.",
}

#: L'EXEMPLE calibré par persona — #2887 (#2371.6). ``_WRITING_ADVICE`` porte
#: une CONSIGNE (« un cas concret chiffré »), pas un message : la matrice
#: #2371 cite trois questions verbatim (opérationnel froid, manager froid,
#: achats), reprises ici à l'identique plutôt que paraphrasées. Les quatre
#: personas sans citation directe (gouvernance/direction/decideur/expert)
#: suivent le même registre — une question, jamais une affirmation — construite
#: depuis leur ``lever``/``speaks_in`` déjà validés dans ``PERSONA_PROFILES``.
PERSONA_EXAMPLES: dict[str, str] = {
    "decideur": "Ce sujet pèse-t-il sur un risque, une transformation en cours, ou un résultat que vous devez tenir ?",
    "gouvernance": "Quel est l’enjeu que vous portez au conseil sur ce sujet, en ce moment ?",
    "direction": "Quel objectif de votre direction ce sujet vient-il appuyer ce trimestre ?",
    "manager": "Qu’est-ce qui doit avancer avant la fin du trimestre ?",
    "acheteur": "Comment un nouveau prestataire peut-il intervenir sur ce périmètre ?",
    "expert": "Quel choix d’architecture ce sujet remet-il en question aujourd’hui ?",
    "operationnel": "Qu’est-ce qui bloque concrètement dans l’équipe ?",
}

#: Miroir de ``personaForHierarchyLevel`` (TS). #2887 (#2371.2) — UN palier, UN
#: persona : les sept paliers réels de ``classify_hierarchy_level`` ont chacun
#: leur profil désormais, la dérivation ne collapse plus rien. Un palier absent
#: de cette table — ``unknown`` compris — rend ``None``.
_LEVEL_TO_PERSONA: dict[str, str] = {
    "governance": "gouvernance",
    "c_level": "decideur",
    "direction": "direction",
    "management": "manager",
    "achats": "acheteur",
    "expert": "expert",
    "operationnel": "operationnel",
}


def persona_for_hierarchy_level(level: str | None) -> str | None:
    """Le persona d'un palier hiérarchique, ou ``None`` s'il n'en désigne aucun.

    #2887 — UN palier RÉEL, UN persona : les sept paliers de
    ``classify_hierarchy_level`` ont chacun leur profil (voir
    ``PERSONA_PROFILES``), la granularité déjà produite par la classification
    n'est plus jetée en aval.
    """
    return _LEVEL_TO_PERSONA.get((level or "").strip())


def contact_persona(contact: dict[str, Any]) -> str | None:
    """Le persona d'un contact tel qu'il arrive au prompt.

    ``hierarchyLevel`` est un ``computed_field`` de ``EnrichedContact`` : il est
    normalement là. Quand il manque (contact venu d'un autre chemin, rejeu d'un
    ancien dossier), on retombe sur ``classify_hierarchy_level`` — la MÊME
    fonction qui l'aurait produit, pas une seconde règle. Sans titre non plus,
    ``None`` : on ne devine pas.
    """
    level = contact.get("hierarchyLevel") or contact.get("hierarchy_level")
    if not level:
        title = contact.get("title") or ""
        level = classify_hierarchy_level(title) if title else ""
    return persona_for_hierarchy_level(level if isinstance(level, str) else "")


def persona_lever_block() -> str:
    """Les sept leviers, prêts à coller dans un prompt système.

    Construit DEPUIS {@link PERSONA_PROFILES} plutôt que réécrit à la main :
    c'est ce qui fait que la table gardée par la parité atteint réellement le
    prompt. Elle ne l'atteignait pas — le prompt avait sa propre version, en
    dur, et rien ne les reliait.
    """
    lines = [
        "Le PERSONA de chaque contact t’est DONNÉ dans la liste ci-dessous — il est calculé depuis son poste, "
        "en amont. Ne le recalcule pas et ne le contredis pas : sers-t’en pour choisir le levier.",
    ]
    for persona in PERSONAS:
        profile = PERSONA_PROFILES[persona]
        lines.append(
            f"- {persona} : levier = {profile['lever']}. Parle en {profile['speaks_in']}. "
            f"{_WRITING_ADVICE[persona]} Ce qui le fait décrocher : {profile['turns_off']}. "
            f"Exemple calibré : « {PERSONA_EXAMPLES[persona]} »"
        )
    lines.append(
        f"- persona {PERSONA_UNKNOWN} : le poste n’a pas permis de trancher. N’invente aucun niveau "
        "hiérarchique — reste factuel, une question ouverte simple, aucun levier supposé."
    )
    return "\n".join(lines)
