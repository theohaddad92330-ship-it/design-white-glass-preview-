"""#3197 (LAU-FINAL-203, beta P0) — le VOCABULAIRE des quinze mesures de
l'« eval suite d'intelligence commerciale » demandée pour Laura, et leur
section dans le tableau de pilotage (`chat_dashboard.py`, #2443.11).

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE MODULE EXISTE
─────────────────────────────────────────────────────────────────────────────
#3197 demande un banc bloquant avant déploiement sur cinq groupes de comptes
(Société Générale, Décathlon/Accor, Vinci, industrie, reverse market) et
quinze mesures nommées. `git grep` de chacune des quinze mesures rendait zéro
résultat dans tout le dépôt avant ce module — le VOCABULAIRE n'existait sous
aucun de ces noms, bien que plusieurs MÉCANISMES voisins existent déjà
(routage d'intention reporté, résolution d'entité opérationnelle,
`account_verdict_quality_cap` en règle métier, les cinq niveaux de vérité de
`test_copilote_truth_levels_eval.py`, le jeu Market Memory de
`test_copilote_market_memory_eval.py`) — aucun n'est la MESURE agrégée que
#3197 réclame, chacun vérifie une RÈGLE PRÉSENTE dans le prompt, jamais un
taux de justesse sur des sorties réelles.

Ce module livre le même genre de pierre que `chat_hard_failures.py` pour
cette famille de demandes : les quinze mesures, nommées et classées
`computable_today` avec une raison concrète — jamais un silence, jamais une
mesure inventée pour faire nombre. Le CORPUS des cinq groupes de comptes
nommés par #3197 (Société Générale, Décathlon/Accor, Vinci, industrie,
reverse market) n'existe pas dans ce dépôt et n'est pas construit par ce
module : `apps/ia/tests/test_copilote_scenario_corpus.py` est un système à
cinq suites et sept-cents lignes de garde (§11/§12, 17 champs comptés) —
l'étendre sans le lire en entier serait le risque que `CLAUDE.md` interdit
(« ne jamais modifier plus de 3 fichiers sans `/impact-check` »). Nommer les
mesures ne dépend, lui, d'aucun corpus : une mesure se DÉFINIT avant d'avoir
des données à mesurer, exactement comme `chat_score_dimensions.py` l'a fait
pour les dix-sept dimensions de score d'une autre demande de la même épopée.

─────────────────────────────────────────────────────────────────────────────
NO-GO DE #3197 — POURQUOI IL EST UNE CONSÉQUENCE DE CE VOCABULAIRE
─────────────────────────────────────────────────────────────────────────────
« Une amélioration du style compense une régression de la pertinence
commerciale » est le cas qui ne doit jamais passer. `STYLE_TEMPLATE_RATE`
(forme de la réponse) et `ACCOUNT_VERDICT_QUALITY` (pertinence du verdict)
sont deux entrées DISTINCTES de `MEASURE_SPECS`, jamais fondues dans un
agrégat unique — la même discipline que le gate golden set existant
(`agent_docs/eval-gate.md` : bascule pass→fail d'un golden = zéro tolérance,
jamais compensée par un gain de score ailleurs). Un futur gate qui lirait ce
module ne peut pas, par construction, moyenner les deux.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ChatCommercialMeasure(StrEnum):
    """Les QUINZE mesures, dans l'ordre exact du corps de #3197 (§ MESURES).

    ⚠️ ORDRE FIGÉ (GA-08, même discipline que `ChatHardFailure`) : une valeur
    ne disparaît jamais, un ajout va en FIN.
    """

    INTENT_ACCURACY = "intent_accuracy"
    SOURCE_ROUTING_ACCURACY = "source_routing_accuracy"
    INTERNAL_SOURCE_USAGE = "internal_source_usage"
    FACET_RETENTION = "facet_retention"
    ENTITY_RESOLUTION = "entity_resolution"
    ACCOUNT_VERDICT_QUALITY = "account_verdict_quality"
    COUNTER_ADVICE_QUALITY = "counter_advice_quality"
    ALTERNATIVE_RELEVANCE = "alternative_relevance"
    SPECIALIST_ROLE_PRECISION = "specialist_role_precision"
    UNSUPPORTED_CLAIM_RATE = "unsupported_claim_rate"
    CURRENT_VS_HISTORICAL_ACCURACY = "current_vs_historical_accuracy"
    CORRECTION_RERUN_SUCCESS = "correction_rerun_success"
    NEXT_ACTION_QUALITY = "next_action_quality"
    STYLE_TEMPLATE_RATE = "style_template_rate"
    RESPONSE_DENSITY_FIT = "response_density_fit"


@dataclass(frozen=True)
class BilingualLabel:
    fr: str
    en: str


@dataclass(frozen=True)
class MeasureSpec:
    """Une mesure : ce qu'elle nomme, et si ce dépôt peut la calculer
    aujourd'hui — jamais deviné, toujours vérifié par lecture directe."""

    label: BilingualLabel
    #: Ce que mesure cet axe, en une phrase — jamais un nombre déjà décrété.
    what_it_measures: str
    computable_today: bool
    #: Raison CONCRÈTE, citant ce qui existe ou manque — jamais un silence.
    reason: str


MEASURE_SPECS: dict[ChatCommercialMeasure, MeasureSpec] = {
    ChatCommercialMeasure.INTENT_ACCURACY: MeasureSpec(
        label=BilingualLabel("justesse de l'intention détectée", "detected-intent accuracy"),
        what_it_measures="la part des demandes pour lesquelles Laura détecte la bonne intention commerciale",
        computable_today=False,
        reason=(
            "le routage d'intention EN CODE est reporté (agent_docs/chantiers-livres.md:280) — "
            "sans détecteur, il n'y a pas de sortie à comparer à une vérité-terrain"
        ),
    ),
    ChatCommercialMeasure.SOURCE_ROUTING_ACCURACY: MeasureSpec(
        label=BilingualLabel("justesse du routage de source", "source-routing accuracy"),
        what_it_measures="la part des demandes où Laura interroge la bonne source (marché interne, public, mémoire marché)",
        computable_today=False,
        reason=(
            "aucun corpus étiqueté « quelle source AURAIT dû être interrogée » n'existe pour les cinq "
            "groupes de comptes du corpus de #3197 (Société Générale, Décathlon/Accor, Vinci, industrie, "
            "reverse market) — un jeu de vérité-terrain manque, pas un scoreur"
        ),
    ),
    ChatCommercialMeasure.INTERNAL_SOURCE_USAGE: MeasureSpec(
        label=BilingualLabel("taux d'usage des sources internes", "internal-source usage rate"),
        what_it_measures="la fréquence à laquelle Laura consulte le marché interne avant de conclure",
        computable_today=False,
        reason=(
            "c'est un TAUX sur du trafic réel, pas une accuracy sur fixtures : dépend du pipeline "
            "d'échantillonnage production (#2443.10 / #2899 : opt-in par espace, côté API, `chat_eval_samples` — "
            "aucun lecteur ne rejoue encore ces échantillons dans les évals)"
        ),
    ),
    ChatCommercialMeasure.FACET_RETENTION: MeasureSpec(
        label=BilingualLabel("rétention des facettes de profil", "profile-facet retention"),
        what_it_measures="si une facette du profil du commercial (ex. périmètre géographique) reste respectée sur tout le tour",
        computable_today=False,
        reason=(
            "seule une vérification DÉTERMINISTE au cas par cas existe (`test_copilote_scope_eval.py`, "
            "conflit de portée) — aucun corpus agrégé ne fait de cette vérification un TAUX mesuré sur "
            "plusieurs cas, ce que #3197 réclame"
        ),
    ),
    ChatCommercialMeasure.ENTITY_RESOLUTION: MeasureSpec(
        label=BilingualLabel("justesse de la résolution d'entité", "entity-resolution accuracy"),
        what_it_measures="si Laura distingue la bonne entité (ex. Vinci Energies vs Vinci Construction, SG CIB vs banque de détail)",
        computable_today=False,
        reason=(
            "le mécanisme de résolution d'entité existe et tourne (39 fichiers du dépôt en dépendent), "
            "mais aucune métrique agrégée de justesse n'existe : le mécanisme n'est pas la mesure"
        ),
    ),
    ChatCommercialMeasure.ACCOUNT_VERDICT_QUALITY: MeasureSpec(
        label=BilingualLabel("qualité du verdict de compte", "account-verdict quality"),
        what_it_measures="si le verdict GO/NO_GO rendu par Laura est commercialement justifié",
        computable_today=False,
        reason=(
            "`account_verdict_quality_cap` existe déjà comme RÈGLE MÉTIER (`app/knowledge/business_rules.py:151` "
            "— un dossier inexploitable ne peut pas recevoir de verdict) mais c'est un PLAFOND, pas une mesure "
            "de justesse du verdict rendu — aucun corpus étiqueté GO/NO_GO correct n'existe"
        ),
    ),
    ChatCommercialMeasure.COUNTER_ADVICE_QUALITY: MeasureSpec(
        label=BilingualLabel("qualité du contre-conseil", "counter-advice quality"),
        what_it_measures="si un contre-conseil (dissuader un compte) est justifié et accompagné d'une alternative",
        computable_today=False,
        reason="aucun corpus étiqueté de cas de contre-conseil avec verdict de qualité n'existe dans ce dépôt",
    ),
    ChatCommercialMeasure.ALTERNATIVE_RELEVANCE: MeasureSpec(
        label=BilingualLabel("pertinence des alternatives proposées", "alternative relevance"),
        what_it_measures="si l'alternative proposée après un contre-conseil est commercialement pertinente",
        computable_today=False,
        reason="dépend du même corpus absent que counter_advice_quality — aucune donnée à comparer",
    ),
    ChatCommercialMeasure.SPECIALIST_ROLE_PRECISION: MeasureSpec(
        label=BilingualLabel("précision du rôle spécialiste recherché", "specialist-role precision"),
        what_it_measures="si Laura cible le bon type de responsable (ex. Data/IA chez Décathlon/Accor)",
        computable_today=False,
        reason="aucun jeu de vérité-terrain « bon rôle attendu » par compte n'existe dans le dépôt",
    ),
    ChatCommercialMeasure.UNSUPPORTED_CLAIM_RATE: MeasureSpec(
        label=BilingualLabel("taux d'affirmation non soutenue", "unsupported-claim rate"),
        what_it_measures="la part des affirmations de Laura sans source citée",
        computable_today=False,
        reason=(
            "`faithfulness` (`app/eval/metrics.py`) mesure déjà ce principe pour le DOSSIER de compte "
            "(gate golden set, `agent_docs/eval-gate.md`) — mais sur des fixtures d'ANALYSE, pas sur des "
            "réponses de CHAT ; étendre `faithfulness` au tour de conversation est hors de cette tranche"
        ),
    ),
    ChatCommercialMeasure.CURRENT_VS_HISTORICAL_ACCURACY: MeasureSpec(
        label=BilingualLabel("justesse actuel vs historique", "current-vs-historical accuracy"),
        what_it_measures="si Laura distingue une donnée ACTUELLE d'une donnée de Mémoire Marché ou une personne partie",
        computable_today=False,
        reason=(
            "`test_copilote_market_memory_eval.py` vérifie qu'une RÈGLE existe pour ne pas confondre les "
            "deux (cinq questions verbatim de #1628), pas que la sortie réelle est juste — un contrôle de "
            "présence de règle n'est pas une mesure de justesse"
        ),
    ),
    ChatCommercialMeasure.CORRECTION_RERUN_SUCCESS: MeasureSpec(
        label=BilingualLabel("succès du rejeu après correction", "correction-rerun success"),
        what_it_measures="si une correction utilisateur déclenche bien un nouveau calcul, jamais un simple accusé",
        computable_today=False,
        reason=(
            "le geste de correction existe (`chat_reply_feedback`, `ReplyFeedback.tsx`) mais aucun "
            "mécanisme ne trace le REJEU qui devrait suivre — rien à mesurer sans ce producteur de donnée"
        ),
    ),
    ChatCommercialMeasure.NEXT_ACTION_QUALITY: MeasureSpec(
        label=BilingualLabel("qualité de la prochaine action", "next-action quality"),
        what_it_measures="si l'action suivante proposée par Laura fait avancer le compte",
        computable_today=False,
        reason="aucun corpus étiqueté « bonne prochaine action » par cas n'existe dans le dépôt",
    ),
    ChatCommercialMeasure.STYLE_TEMPLATE_RATE: MeasureSpec(
        label=BilingualLabel("taux de réponse gabarit", "style-template rate"),
        what_it_measures="la part des réponses qui sonnent comme un modèle recopié plutôt qu'une réponse au cas précis",
        computable_today=False,
        reason=(
            "`chat_verdict.py` (`audit_answer`) détecte une redite MÉCANIQUE (carte reformulée en texte) "
            "sur le corpus des cartes verdict, pas un « ton gabarit » général sur toute réponse de chat"
        ),
    ),
    ChatCommercialMeasure.RESPONSE_DENSITY_FIT: MeasureSpec(
        label=BilingualLabel("adéquation de la densité de réponse", "response-density fit"),
        what_it_measures="si la longueur/densité de la réponse correspond à ce que la question demandait",
        computable_today=False,
        reason=(
            "explicitement non promis par le tome 7 (`agent_docs/chantiers-livres.md:460` : "
            "« la densité par persona — le produit n'a pas de notion de persona ») — rien à mesurer sans elle"
        ),
    ),
}


def measure_spec(measure: ChatCommercialMeasure) -> MeasureSpec:
    """La spec d'une mesure — lève si `MEASURE_SPECS` en oublie une (un
    `KeyError` explicite vaut mieux qu'un `.get()` silencieux)."""
    return MEASURE_SPECS[measure]
