"""Les 16 packs méthode nommés (#3221, #206.3/#206.4 — LAU-FINAL-206, #3200).

Le problème que ce module ferme : l'architecture de retrieval-par-intention
(`app/services/method_knowledge.py`) est déjà câblée dans le chat
(`app/routers/chat.py:472,595`), mais elle ne porte que quatre sources —
objections, playbooks sectoriels, règles métier, discipline générale. Le
ticket #3200 nomme SEIZE moments du cycle commercial (« ouvrir un compte »,
« filiale accessible », « compte à déconseiller »...) qu'aucune de ces quatre
sources n'expose comme PACK retrouvable par intention, et un SCHÉMA à 11
champs (`rule_id, title, domain, trigger, prerequisites, recommendation,
counter_example, stop_condition, allowed_evidence, version, source`) que ni
`method_rules.py` (`id, statement, applied_by`) ni `business_rules.py`
(`id, label, description, source, status, applied_in, test_ref`) ne portent —
et n'ont pas à porter : ce sont deux registres différents, protégés par leur
propre garde de parité (`method-delta.parity.test.ts`), pas le schéma que ce
ticket demande.

Ce module TYPE et ASSEMBLE, il n'invente pas :
- quand un service existant porte déjà la décision d'un pack (l'ouverture
  d'un compte froid, le choix du mouvement, le rang 2, la réactivation,
  l'expansion, le plafond de verdict...), la règle CITE ce service en
  `source` plutôt que de dupliquer sa logique ;
- quand le ticket lui-même fournit l'énoncé verbatim (section EXEMPLES DE
  RÈGLES), la règle le reprend mot pour mot, jamais reformulé ;
- un pack sans service porteur ET sans énoncé source (« réunion de
  découverte ») reste ABSENT de `METHOD_PACK_RULES` plutôt que de fabriquer
  un conseil commercial sans source — même discipline que les quatre
  catégories vides par construction de `salesconnect-corpus.ts` v1.0.0.
  `chantiers-livres.md` doit lister ce manque, pas ce module l'inventer.

Le retrieval RÉEL passe par `method_knowledge.retrieve_method_chunks`
(`apps/ia` ne peut pas importer `packages/contracts`, même contrainte que
`salesconnect-corpus.ts` documente) : ce module fournit les entrées, pas un
second moteur de recherche.
"""

from __future__ import annotations

from dataclasses import dataclass

# ── Les 16 packs du ticket (#3200, section PACKS), verbatim ───────────────────

METHOD_PACK_DOMAINS: tuple[str, ...] = (
    "ouvrir_un_compte",
    "choisir_un_terrain_de_jeu",
    "identifier_une_premiere_porte",
    "compte_grand_groupe_ferme",
    "filiale_accessible",
    "partenaire_rang_2",
    "consultant_disponible",
    "besoin_entrant",
    "premier_message",
    "reactivation",
    "reunion_de_decouverte",
    "renouvellement_de_mission",
    "expansion_client",
    "compte_sans_signal",
    "arbitrage_du_temps",
    "compte_a_deconseiller",
)

#: Domaines pour lesquels AUCUNE règle n'existe encore — ni service porteur, ni
#: énoncé sourcé dans le ticket. `test_method_packs.py` garde cette liste
#: contre le silence : un domaine qui en sort DOIT apparaître dans
#: `METHOD_PACK_RULES`, jamais les deux à la fois.
METHOD_PACK_DOMAINS_WITHOUT_RULE: tuple[str, ...] = ("reunion_de_decouverte",)

#: Le libellé de citation affiché au commercial (ticket, section CITATION —
#: « Méthode Bellum : compte fermé sans accès »). Un identifiant interne
#: (`rule_id`, `domain`) n'a rien à faire dans cette phrase.
CITATION_LABEL_BY_DOMAIN: dict[str, str] = {
    "ouvrir_un_compte": "ouverture de compte",
    "choisir_un_terrain_de_jeu": "choix du terrain de jeu",
    "identifier_une_premiere_porte": "première porte",
    "compte_grand_groupe_ferme": "compte fermé sans accès",
    "filiale_accessible": "filiale accessible",
    "partenaire_rang_2": "partenaire rang 2",
    "consultant_disponible": "consultant disponible",
    "besoin_entrant": "besoin entrant",
    "premier_message": "premier message",
    "reactivation": "réactivation",
    "renouvellement_de_mission": "renouvellement de mission",
    "expansion_client": "expansion client",
    "compte_sans_signal": "compte sans signal",
    "arbitrage_du_temps": "arbitrage du temps",
    "compte_a_deconseiller": "compte à déconseiller",
}

#: Le vocabulaire du fondement d'une recommandation (instruction commune
#: #3249, règle : « chaque recommandation dit son fondement »). Jamais une
#: probabilité, jamais un fondement anonyme.
ALLOWED_EVIDENCE_KINDS: tuple[str, ...] = (
    "donnee",
    "regle_methodologique",
    "observation",
    "inference",
    "preference_utilisateur",
)


@dataclass(frozen=True)
class MethodPackRule:
    """Le schéma de règle du ticket #3200, champ pour champ — #206.4."""

    rule_id: str
    title: str
    domain: str
    trigger: str
    prerequisites: tuple[str, ...]
    recommendation: str
    counter_example: str | None
    stop_condition: str | None
    allowed_evidence: tuple[str, ...]
    version: str
    source: str


_SPEC_SOURCE = "#3200 (spec LAU-FINAL-206, verbatim)"
_V1 = "1.0.0"
_EVIDENCE_STANDARD = ("regle_methodologique", "donnee")

# ── Les 15 packs sourcés (service existant et/ou énoncé verbatim #3200) ───────

METHOD_PACK_RULES: tuple[MethodPackRule, ...] = (
    MethodPackRule(
        rule_id="pack_ouvrir_un_compte",
        title="Ouvrir un compte froid suit un playbook nommé, pas une improvisation",
        domain="ouvrir_un_compte",
        trigger="ouvrir compte froid entree premier contact playbook",
        prerequisites=("stade ESN connu (esn_stage)", "archétype de compte connu"),
        recommendation=(
            "Le playbook d'ouverture assemble le volume attendu par stade ESN, la séquence de "
            "mouvement déterministe et le vocabulaire des familles de rôles terrain en UN bloc "
            "nommé, plutôt que de laisser le modèle improviser trois pièces séparées."
        ),
        counter_example="Envoyer le même message d'ouverture générique à toutes les ESN, quel que soit leur stade.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/cold_account_playbook.py:92 (cold_account_opening_block), :234 (cold_account_playbook_block)",
    ),
    MethodPackRule(
        rule_id="pack_choisir_un_terrain_de_jeu",
        title="Le terrain de jeu se choisit par critères nommés, pas par défaut",
        domain="choisir_un_terrain_de_jeu",
        trigger="terrain de jeu strategie critere selection mouvement",
        prerequisites=("triple SalesContext (stade × archétype × relation) connue",),
        recommendation=(
            "Le choix du terrain de jeu (quel mouvement d'ouverture tenter) suit des critères de "
            "sélection stratégique nommés — jamais une préférence par défaut du modèle."
        ),
        counter_example="Toujours recommander le même mouvement (ex. top-down) quel que soit le compte.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/opening_movement.py:214 (strategy_selection_criteria)",
    ),
    MethodPackRule(
        rule_id="pack_identifier_une_premiere_porte",
        title="La première porte n'est pas nécessairement le décideur final",
        domain="identifier_une_premiere_porte",
        trigger="premiere porte decideur orienter entree",
        prerequisites=(),
        recommendation=(
            "La première porte n'est pas nécessairement le décideur final ; elle peut être la "
            "personne capable d'orienter."
        ),
        counter_example="Cibler systématiquement le décideur final en premier contact, même sans accès ni relation.",
        stop_condition=None,
        allowed_evidence=("regle_methodologique",),
        version=_V1,
        source=_SPEC_SOURCE + " ; apps/ia/app/services/opening_movement.py:113 (recommend_opening_movement)",
    ),
    MethodPackRule(
        rule_id="pack_compte_grand_groupe_ferme",
        title="Un board n'est jamais une porte d'entrée en première approche sans relation",
        domain="compte_grand_groupe_ferme",
        trigger="grand groupe ferme board gouvernance administrateur premiere approche",
        prerequisites=("chemin de contacts (recommendedPath) et niveaux hiérarchiques connus",),
        recommendation=(
            "Sur un compte froid, les sièges de gouvernance (board, administrateur, C-level "
            "groupe/mondial) passent derrière les interlocuteurs opérationnels dans le chemin "
            "recommandé — un board n'est jamais une porte d'entrée en première approche sans "
            "relation ni sponsor."
        ),
        counter_example="Recommander un contact de gouvernance en première approche parce qu'il est le plus senior du chemin.",
        stop_condition="Le compte porte une relation ou un sponsor connu (has_relation_or_sponsor) : la démotion ne s'applique plus.",
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/governance_guard.py:79 (demote_governance_first_touch)",
    ),
    MethodPackRule(
        rule_id="pack_filiale_accessible",
        title="Une filiale ou un site accessible est un mouvement d'ouverture à part",
        domain="filiale_accessible",
        trigger="filiale site accessible perimetre local groupe",
        prerequisites=(),
        recommendation=(
            "Un périmètre plus accessible que le groupe entier (filiale, site) est un mouvement "
            "d'ouverture nommé à part : entrer par le référent local puis remonter vers le "
            "groupe, plutôt que d'attaquer le groupe entier d'emblée."
        ),
        counter_example="Prospecter directement le siège groupe alors qu'une filiale accessible est connue.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/opening_movement.py:35 (OPENING_MOVEMENTS['filiale_site'])",
    ),
    MethodPackRule(
        rule_id="pack_partenaire_rang_2",
        title="Le rang 2 passe par le delivery, jamais en brûlant le partenaire",
        domain="partenaire_rang_2",
        trigger="partenaire rang 2 sous traitant delivery",
        prerequisites=("relation rang 2 identifiée",),
        recommendation=(
            "Sur une relation de rang 2 (déjà sous-traitant via un partenaire), le mouvement "
            "passe par le delivery jusqu'au sponsor direct côté client, sans jamais brûler le "
            "partenaire en place."
        ),
        counter_example="Contacter directement le client final sans passer par le partenaire en place, en rang 2.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/opening_movement.py:129 (recommend_opening_movement, branche rang2) ; OPENING_MOVEMENTS['rang2']",
    ),
    MethodPackRule(
        rule_id="pack_consultant_disponible",
        title="Un consultant disponible crée un point de départ, pas un envoi de masse",
        domain="consultant_disponible",
        trigger="consultant disponible cv diffusion point de depart",
        prerequisites=(),
        recommendation=(
            "Un consultant disponible crée un point de départ, pas une raison d'envoyer son CV à "
            "froid à cinquante personnes."
        ),
        counter_example="Diffuser le CV d'un consultant disponible en masse, sans qualifier de destinataire.",
        stop_condition=None,
        allowed_evidence=("regle_methodologique",),
        version=_V1,
        source=_SPEC_SOURCE,
    ),
    MethodPackRule(
        rule_id="pack_besoin_entrant",
        title="Un recrutement CDI n'est pas automatiquement un besoin de prestation",
        domain="besoin_entrant",
        trigger="besoin entrant recrutement cdi signal",
        prerequisites=(),
        recommendation="Une entreprise qui recrute en CDI ne constitue pas automatiquement un besoin de prestation.",
        counter_example="Traiter toute offre d'emploi CDI publiée par le prospect comme un signal de besoin de prestation ESN.",
        stop_condition=None,
        allowed_evidence=("regle_methodologique", "observation"),
        version=_V1,
        source=_SPEC_SOURCE,
    ),
    MethodPackRule(
        rule_id="pack_premier_message",
        title="Le premier message suit la séquence du mouvement choisi, jamais un gabarit recopié",
        domain="premier_message",
        trigger="premier message ouverture sequence gabarit",
        prerequisites=("mouvement d'ouverture déjà choisi",),
        recommendation=(
            "Le premier message suit la séquence du mouvement d'ouverture choisi (bottom-up, "
            "middle-out, top-down, sandwich...), pas un gabarit recopié mot pour mot — un "
            "gabarit recopié mot pour mot est un refus produit explicite."
        ),
        counter_example="Recopier mot pour mot un script d'ouverture, quel que soit le compte visé.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/opening_movement.py:469 (movement_prompt_block) ; OPENING_MOVEMENTS",
    ),
    MethodPackRule(
        rule_id="pack_reactivation",
        title="Une relation dormante se réouvre, elle ne se recontacte pas à froid",
        domain="reactivation",
        trigger="reactivation dormant relance ancienne relation sponsor historique",
        prerequisites=("relation antérieure connue (relationship_state = dormant)",),
        recommendation=(
            "Une relation dormante se réouvre par le sponsor historique, en reconfirmant le "
            "besoin actuel avant de relancer la séquence — jamais comme un premier contact "
            "froid, jamais comme une relation encore vivante."
        ),
        counter_example="Relancer une relation dormante avec le même mouvement qu'un premier contact froid.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/opening_movement.py:148 (recommend_opening_movement, branche dormant)",
    ),
    MethodPackRule(
        rule_id="pack_renouvellement_de_mission",
        title="Une mission historique n'est pas un référencement groupe",
        domain="renouvellement_de_mission",
        trigger="renouvellement mission historique referencement groupe",
        prerequisites=(),
        recommendation="Une mission historique n'est pas un référencement groupe.",
        counter_example="Traiter une mission passée sur une filiale comme une preuve de référencement au niveau du groupe entier.",
        stop_condition=None,
        allowed_evidence=("regle_methodologique", "donnee"),
        version=_V1,
        source=_SPEC_SOURCE,
    ),
    MethodPackRule(
        rule_id="pack_expansion_client",
        title="L'expansion suit une priorité calculée et des garde-fous nommés",
        domain="expansion_client",
        trigger="expansion client extension mission priorite garde fou",
        prerequisites=("lead d'expansion qualifié (compte client existant)",),
        recommendation=(
            "L'expansion sur un compte client suit une priorité calculée et des garde-fous "
            "nommés — jamais une extension proposée sans preuve d'un signal réel."
        ),
        counter_example="Proposer une extension de mission sans aucun signal ni preuve sur le compte.",
        stop_condition="Un garde-fou d'expansion est violé (expansion_guardrail_violations) : l'extension ne se propose pas.",
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/compilers/account_expansion_compiler.py:119 (expansion_priority_score), :126 (expansion_guardrail_violations)",
    ),
    MethodPackRule(
        rule_id="pack_compte_sans_signal",
        title="Un compte sans accès, preuve ni signal n'absorbe pas le temps commercial",
        domain="compte_sans_signal",
        trigger="compte sans signal sans preuve sans acces temps commercial",
        prerequisites=(),
        recommendation=(
            "Un compte sans accès, sans preuve et sans signal ne doit pas absorber la majorité "
            "du temps commercial."
        ),
        counter_example="Continuer à investir du temps sur un compte froid sans qu'aucun accès, preuve ni signal n'ait émergé.",
        stop_condition=None,
        allowed_evidence=("regle_methodologique", "observation"),
        version=_V1,
        source=_SPEC_SOURCE + " ; apps/ia/app/services/cold_account_playbook.py",
    ),
    MethodPackRule(
        rule_id="pack_arbitrage_du_temps",
        title="L'effort qualifié sur un compte froid est plafonné par son stade",
        domain="arbitrage_du_temps",
        trigger="arbitrage temps effort qualifie plafond stade",
        prerequisites=("stade ESN connu (esn_stage)",),
        recommendation=(
            "Le volume d'effort qualifié sur un compte froid est plafonné par son stade ESN — "
            "l'arbitrage du temps commercial suit ce plafond, pas une intuition."
        ),
        counter_example="Allouer le même volume d'effort à toutes les ESN, quel que soit leur stade.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/services/cold_account_playbook.py:72 (qualification_cap)",
    ),
    MethodPackRule(
        rule_id="pack_compte_a_deconseiller",
        title="Un dossier inexploitable ne porte jamais un verdict confiant",
        domain="compte_a_deconseiller",
        trigger="compte a deconseiller verdict plafond hallucination donnees faibles",
        prerequisites=("gate qualité G6 évalué (hallucination / trop_faible)",),
        recommendation=(
            "Un dossier jugé inexploitable (hallucination, données trop faibles) voit son "
            "verdict plafonné — jamais un verdict confiant affiché sur un dossier qu'on sait "
            "fragile."
        ),
        counter_example="Afficher un verdict GO confiant alors que le gate qualité a détecté une incohérence ou des données trop faibles.",
        stop_condition=None,
        allowed_evidence=_EVIDENCE_STANDARD,
        version=_V1,
        source="apps/ia/app/knowledge/business_rules.py:151 (account_verdict_quality_cap)",
    ),
)
