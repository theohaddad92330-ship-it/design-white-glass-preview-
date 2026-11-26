"""Playbook d'ouverture compte froid — assemblage NOMMÉ (annexe méthodo p3/p13)
+ contenu bottom-up sourcé (issue #2314, LAU-FINAL-055).

Ce module réunit DEUX lots distincts et non chevauchants sur le même chantier
#2314 :

1. ``cold_account_opening_block`` (#2314.1/.5/.10/.33/.35/.36/.37) — #2314
   constatait que l'ouverture d'un compte froid s'appuyait déjà sur trois
   pièces réelles et sourcées — le volume par stade ESN
   (``esn_stage.STAGE_PLAYBOOK``, table p3), la séquence d'ouverture
   déterministe (``opening_movement.OPENING_MOVEMENTS``, TABLE C p13) et le
   vocabulaire des familles de rôles terrain
   (``contact_segments.role_families``) — sans jamais être assemblées en UN
   playbook nommé qu'un commercial lit comme un seul bloc. Ce sous-module
   n'invente rien : il nomme et assemble ce qui existe déjà.

2. ``cold_account_playbook_block`` (épopée #3009, 25 points : #2314.2, .3,
   .4, .6, .12-.17, .19-.32, .38) — source : le corps de l'issue #2314
   elle-même (retour bêta transmis le 15/09/2026, catégorie « metier »,
   `gh issue view 2314 --json body`). Décision de source tranchée sans Louis
   le 25/09/2026 (règle du 22/09 « on applique la reco », #3009) : l'annexe
   méthodologie et l'annexe organigramme mentionnent le mouvement d'ouverture
   bottom-up générique (voir ``opening_movement.py``) mais PAS les routes
   sectorielles, les personas terrain ni les objectifs du premier échange de
   ce retour — recherche exhaustive et négative dans ``agent_docs/sources/``,
   tracée dans ``.claude/notes/recherche-source-2314-25-09.md``. Chaque
   constante de ce sous-module est recopiée VERBATIM depuis le corps de
   l'issue #2314 — jamais reformulée — avec, en commentaire, la section
   d'origine. Une règle absente du corps de l'issue reste absente ici : sept
   des neuf secteurs n'ont AUCUN anti-pattern nommé (seuls « environnement »
   et « industrie » en ont un) et on ne fabrique pas les sept manquants
   (doctrine « on n'affiche pas ce qu'on n'a pas »).

Les autres points du registre #2314 (.7-.9, .11, .18, .39) restent hors de
ces deux lots — voir ``.claude/notes/registre-2026-09-17-lau-055-2314.md``.

Les deux blocs sont ADDITIFS, même contrat que ``movement_prompt_block`` :
compte chaud (relation ou sponsor existant, même garde que
``governance_guard.has_relation_or_sponsor`` pour le premier bloc ; état de
relation différent de ``"froid"`` pour le second) → ``""``, prompt inchangé.
"""

from __future__ import annotations

from typing import Any

from app.services.contact_segments import role_families
from app.services.esn_stage import STAGE_PLAYBOOK
from app.services.governance_guard import has_relation_or_sponsor
from app.services.opening_movement import OPENING_MOVEMENTS

#: #2314.33 — une seule équipe visée au premier tour.
FIRST_TOUCH_TEAM_CAP = 1
#: #2314.35 — une seule question d'ouverture au premier tour.
FIRST_TOUCH_QUESTION_CAP = 1
#: #2314.36 — une seule relance prévue au premier tour.
FIRST_TOUCH_FOLLOWUP_CAP = 1

# #2314.37 — la borne HAUTE déjà écrite dans STAGE_PLAYBOOK[...]['volume'] (p3),
# recopiée ici en entier pour être citée par un nombre plutôt que reparsée depuis
# la prose. Aucun stade ne s'approche de 50 : le NO-GO est déjà structurel.
_STAGE_QUALIFICATION_CAP: dict[str, int] = {
    "freelance": 3,  # "1 seul thread ... 2-3 contacts cibles maximum"
    "petite": 5,  # "3-5 contacts cibles, pas de multi-thread sur 15 personnes"
    "structuration": 8,  # "multi-thread ciblé : 5-8 contacts sur 2-3 entités"
    "etablie": 10,  # "6-10 contacts répartis par BU"
    "grande": 15,  # "8-15 contacts sur plusieurs entités"
}
_DEFAULT_STAGE = "petite"  # même défaut sûr que `esn_stage.classify_esn_stage`


def qualification_cap(esn_stage: str | None) -> int:
    """Plafond de contacts avant qualification pour ce stade (#2314.37).

    Stade inconnu/absent → défaut sûr ``petite`` (même doctrine que
    ``classify_esn_stage`` : ne jamais supposer une capacité qu'on ignore)."""
    stage = str(esn_stage or "").strip().lower()
    return _STAGE_QUALIFICATION_CAP.get(stage, _STAGE_QUALIFICATION_CAP[_DEFAULT_STAGE])


def _sponsor_trigger_sentence() -> str:
    """#2314.10 — le moment où sponsor/achats deviennent utiles n'est pas
    l'ORDRE (déjà connu, ``OPENING_MOVEMENTS['bottom_up']``) mais un
    DÉCLENCHEUR explicite : une fois le premier rang couvert, pas avant."""
    return (
        f"Sponsor et achats ({OPENING_MOVEMENTS['bottom_up']}) ne deviennent pertinents "
        "qu'une fois le premier rang (N-2) réellement couvert par un échange — "
        "jamais en ouverture, jamais par anticipation."
    )


def cold_account_opening_block(esn_stage: str | None, relationship_state: str | None) -> str:
    """LE playbook d'ouverture compte froid, nommé et assemblé (#2314.1).

    ``""`` si le compte a déjà une relation ou un sponsor — même garde que
    ``governance_guard.has_relation_or_sponsor`` (dupliquée volontairement :
    deux modules, deux préoccupations, cf. son propre docstring)."""
    if has_relation_or_sponsor(relationship_state):
        return ""
    stage = str(esn_stage or "").strip().lower()
    if stage not in STAGE_PLAYBOOK:
        stage = _DEFAULT_STAGE
    cap = qualification_cap(stage)
    families = ", ".join(role_families())
    return (
        "\n\n===== PLAYBOOK D'OUVERTURE COMPTE FROID (déterministe — stade ESN × relation) =====\n"
        f"Premier contact : {FIRST_TOUCH_TEAM_CAP} équipe visée, {FIRST_TOUCH_QUESTION_CAP} question "
        f"d'ouverture, {FIRST_TOUCH_FOLLOWUP_CAP} relance prévue — jamais plus au premier tour.\n"
        f"Jamais plus de {cap} contacts créés avant qualification (stade {stage}).\n"
        f"{_sponsor_trigger_sentence()}\n"
        f"Familles de rôles terrain disponibles pour cibler l'équipe qui vit le problème : {families}."
    )


# #2314.2 — source : issue #2314, section OBJECTIF (« Laura ne doit pas se
# contenter de dire : "Trouve des décideurs." »).
GENERIC_ANSWER_BANNED = "Trouve des décideurs."

# #2314.3, #2314.4, #2314.6 — source : issue #2314, section ÉTAPES (points 1,
# 2, 4 sur les 9 listés ; les points 3, 5, 7, 8, 9 sont hors de ce lot).
COLD_ACCOUNT_STEPS: tuple[str, ...] = (
    "Choisir un périmètre réaliste.",
    "Identifier l’équipe qui vit probablement le problème.",
    "Identifier la première information à obtenir.",
)

# #2314.12-#2314.17 — source : issue #2314, section PREMIER OBJECTIF. « Le
# premier échange ne vise pas nécessairement un rendez-vous. Il vise une
# information. »
FIRST_EXCHANGE_TARGETS: tuple[str, ...] = (
    "bon périmètre",
    "bon owner",
    "réalité du besoin",
    "recours externe",
    "timing",
    "voie d’achat",
)

# #2314.19-#2314.21 — source : issue #2314, section PERSONAS (« La question
# change réellement. »).
PERSONA_QUESTIONS: dict[str, str] = {
    "operationnel": "Questionner le travail réel.",
    "manager": "Questionner la priorité et la capacité.",
    "achats": "Questionner le circuit et les conditions.",
}

# #2314.22-#2314.30 — source : issue #2314, section SECTEURS (« Le playbook
# doit produire des routes adaptées »). Neuf secteurs, aucun autre : un secteur
# absent de ce tuple n'a pas de route ici — `match_cold_account_sector` répond
# ``None``, jamais une route devinée.
COLD_ACCOUNT_SECTORS: tuple[str, ...] = (
    "cyber",
    "data",
    "ingenierie",
    "industrie",
    "environnement",
    "automobile",
    "pharma",
    "infrastructure",
    "conseil_metier",
)

# Reconnaissance mot-clé → clé de secteur ci-dessus. Axe INDÉPENDANT de
# `app.knowledge.match_sector` (secteur du COMPTE CIBLE pour le ton du
# message) : ici, la route d'ouverture bottom-up (registre #2314.22/.25,
# « sector_playbooks.json couvre un AUTRE axe »).
_SECTOR_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("cyber", ("cyber", "cybersécurité", "cybersecurite", "sécurité informatique", "securite informatique")),
    ("data", ("data", "données", "donnees", "data science", "décisionnel", "decisionnel")),
    ("ingenierie", ("ingénierie", "ingenierie", "bureau d’études", "bureau d'etudes", "r&d")),
    ("industrie", ("industrie", "industriel", "usine", "manufacturing")),
    ("environnement", ("environnement", "environnemental", "rse", "développement durable", "developpement durable")),
    ("automobile", ("automobile", "automotive", "constructeur auto", "équipementier auto", "equipementier auto")),
    ("pharma", ("pharma", "pharmaceutique", "biotech", "santé", "sante")),
    ("infrastructure", ("infrastructure", "réseau", "reseau", "télécom", "telecom", "énergie", "energie")),
    ("conseil_metier", ("conseil métier", "conseil metier", "conseil en organisation", "conseil en stratégie", "conseil en strategie")),
)

# #2314.31, #2314.32 — source : issue #2314, section SECTEURS (« Exemple
# environnement » / « Exemple industriel »). Seuls deux secteurs, sur les
# neuf, ont un anti-pattern nommé dans le corps de l'issue.
SECTOR_ANTI_PATTERNS: dict[str, str] = {
    "environnement": "ne pas commencer par le directeur RSE groupe si le sujet concerne une autorisation de site.",
    "industrie": "ne pas commencer par le CIO si le sujet concerne les méthodes usine.",
}

# #2314.38 — source : issue #2314, section RECETTE. Neuf scénarios, recopiés
# tels quels.
RECIPE_SCENARIOS: tuple[str, ...] = (
    "aucun contact",
    "grand groupe",
    "PME",
    "site industriel",
    "filiale",
    "secteur environnement",
    "secteur automobile",
    "achats centralisés",
    "donnée faible",
)


def match_cold_account_sector(raw_sector: str | None) -> str | None:
    """Reconnaît un des neuf secteurs #2314.22-#2314.30 dans un texte libre
    (`sector` / `businessDescription`), ou ``None``. Un secteur non listé par
    l'issue #2314 répond ``None`` — jamais une route fabriquée (test qui sait
    dire NON)."""
    text = (raw_sector or "").strip().lower()
    if not text:
        return None
    for key, needles in _SECTOR_KEYWORDS:
        if any(needle in text for needle in needles):
            return key
    return None


def sector_route(raw_sector: str | None) -> dict[str, Any] | None:
    """Route sectorielle #2314.22-#2314.32 pour ``raw_sector`` : ``{sector,
    anti_pattern}`` (``anti_pattern`` est ``None`` pour les 7 secteurs qui n'en
    ont pas dans le corps de l'issue), ou ``None`` si le secteur n'est pas l'un
    des neuf listés."""
    key = match_cold_account_sector(raw_sector)
    if key is None:
        return None
    return {"sector": key, "anti_pattern": SECTOR_ANTI_PATTERNS.get(key)}


def persona_question(persona: str | None) -> str | None:
    """Question terrain #2314.19-#2314.21 pour ``persona`` (« operationnel »,
    « manager », « achats »), ou ``None`` pour toute autre valeur."""
    key = (persona or "").strip().lower()
    return PERSONA_QUESTIONS.get(key)


def cold_account_playbook_block(sales_context: dict[str, Any] | None, raw_sector: str | None = None) -> str:
    """Bloc de prompt (plan) pour un compte SANS contact connu.

    ADDITIF : ``""`` tant que ``salesContext.relationship.state`` n'est pas
    ``"froid"`` (pas de SalesContext, ou un compte déjà connu) → prompt
    inchangé. Runtime-only : n'affecte pas les prompts golden d'un dossier déjà
    relié à un contact.
    """
    relationship = (sales_context or {}).get("relationship") if isinstance(sales_context, dict) else None
    state = str((relationship or {}).get("state") or "").strip() if isinstance(relationship, dict) else ""
    if state != "froid":
        return ""

    lines = [
        "\n\n===== PLAYBOOK COMPTE FROID — BOTTOM-UP (aucun contact connu sur ce compte) =====",
        f'Ne te contente PAS de répondre "{GENERIC_ANSWER_BANNED}" — c\'est un réflexe générique, pas une stratégie.',
        "Étapes : " + " ".join(COLD_ACCOUNT_STEPS),
        "Le premier échange ne vise pas nécessairement un rendez-vous : il vise une "
        "de ces informations — " + ", ".join(FIRST_EXCHANGE_TARGETS) + ".",
        "La question change selon le persona : "
        + " ".join(f"{persona.upper()} → {question}" for persona, question in PERSONA_QUESTIONS.items())
        + " La question change réellement.",
    ]

    route = sector_route(raw_sector)
    if route is not None:
        sector_line = f"Route sectorielle ({route['sector']})."
        if route["anti_pattern"]:
            sector_line += f" Anti-pattern : {route['anti_pattern']}"
        lines.append(sector_line)

    return "\n".join(lines)
