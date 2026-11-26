"""LE JEU DE TESTS MÉTIER DE RÉFÉRENCE DE LAURA — #3422 (retour bêta 30/09).

Un index, pas un corpus de plus : « NE PAS en écrire un de plus »
(`copilote_scenario_metadata.py`, décision du 12/09). Chacun des 21 profils nommés
par l'issue renvoie à la ou aux PREUVES qui le rejouent déjà (fichier + nom
d'épreuve) et dit, en toutes lettres, le comportement attendu de Laura, des
pages et des messages. `test_business_reference_set.py` refuse :

* un profil sans comportement écrit, ou sans preuve ;
* une preuve dont le fichier ou l'épreuve n'existe plus (renommée, supprimée) ;
* un profil retiré de la liste des vingt-et-un.

« Rejoué automatiquement après chaque changement des instructions ou règles
commerciales » : ce fichier est dans `CHAT_PROMPT_SURFACE` et son test dans
`CHAT_EVAL_SUITES` (`app/eval/chat_gate.py`) — toute modification des
instructions de Laura rejoue ce test, donc chaque preuve citée est relue.

Doctrine qui gouverne les attendus : jamais de donnée fictive (une absence se
dit), aucune probabilité, le copilote prépare et le commercial envoie, un
connecteur absent se nomme avec son action.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Proof:
    """Une épreuve qui rejoue le profil : chemin depuis la racine du dépôt + nom."""

    path: str
    name: str


@dataclass(frozen=True)
class ReferenceProfile:
    """Un des vingt-et-un profils de #3422, avec ce qu'on attend de l'ensemble."""

    number: int
    label: str
    laura: str
    pages: str
    messages: str
    proofs: tuple[Proof, ...]


_IA = "apps/ia/tests/"
_API = "apps/api/src/modules/"

REFERENCE_PROFILES: tuple[ReferenceProfile, ...] = (
    ReferenceProfile(
        1,
        "fondateur de 3 consultants demandant 100 comptes",
        "Elle challenge le volume (le coût dépasse la valeur probable), nomme ce qui est réellement en main "
        "(jamais « les 100 » quand 20 sont rendus) et propose de commencer par un sprint de dix comptes.",
        "Carte « sprint exécutable » : nombre réellement rendu, lien vers la liste complète dans Découvrir, "
        "focus vide si aucune porte d'entrée vérifiée.",
        "Aucun message préparé tant que le sprint n'est pas choisi.",
        (
            Proof(
                _IA + "test_beta_30_09_3422_remainders.py",
                "test_3422_1_founder_of_three_asking_for_100_accounts_is_challenged",
            ),
            Proof(
                _IA + "test_f28_3422_volume_wording.py",
                "test_the_opening_names_what_is_in_hand_when_less_than_requested",
            ),
            Proof(
                _IA + "test_f28_3422_volume_wording.py",
                "test_a_card_title_claiming_the_requested_count_loses_its_title_not_the_card",
            ),
        ),
    ),
    ReferenceProfile(
        2,
        "ESN de 15 consultants, premier Business Manager",
        "Elle la traite comme une structure à un seul commercial : peu d'actions, hiérarchisées, séquencées.",
        "Plan : trois à cinq actions maximum, la première est la plus simple à lancer.",
        "Messages courts, un seul fil par compte.",
        (
            Proof(
                _IA + "test_business_reference_profiles_eval.py",
                "test_esn_15_consultants_premier_business_manager_est_traitee_comme_fondateur_solo",
            ),
        ),
    ),
    ReferenceProfile(
        3,
        "ESN de 35 consultants, plusieurs commerciaux",
        "Elle la traite comme une équipe : répartition des comptes, pas de doublon d'approche entre commerciaux.",
        "Plan : actions par commercial, périmètres distincts.",
        "Un message par commercial et par compte, jamais deux approches simultanées sur la même personne.",
        (
            Proof(
                _IA + "test_business_reference_profiles_eval.py",
                "test_esn_35_consultants_plusieurs_commerciaux_est_traitee_comme_une_equipe",
            ),
        ),
    ),
    ReferenceProfile(
        4,
        "Business Developer ouvrant un grand compte fermé",
        "Elle ne démarre jamais par la gouvernance d'un compte froid : l'opérationnel d'abord, le comité ensuite.",
        "Parcours d'ouverture : premier toucher sur un contact opérationnel, la direction reste dans le plan, rétrogradée.",
        "Message M1 adressé à l'opérationnel, jamais au comité.",
        (Proof(_IA + "test_governance_first_touch.py", "test_cold_account_never_opens_on_the_board"),),
    ),
    ReferenceProfile(
        5,
        "Business Manager avec besoin sans budget",
        "Verdict « mettre en veille » : elle n'investit pas, elle dit pourquoi et ce qui rouvrirait le dossier.",
        "Fiche compte : verdict METTRE EN VEILLE, sans action de prospection poussée.",
        "Aucun message d'approche proposé.",
        (Proof(_IA + "test_account_verdict_recette_neuf_profils.py", "ingenierie_budget_gele"),),
    ),
    ReferenceProfile(
        6,
        "recruteur avec consultant disponible",
        "Elle rapproche le consultant disponible des besoins ouverts du marché et dit ce qui manque quand le territoire est inconnu.",
        "Page consultants : besoins rapprochés, motif de non-lecture nommé quand aucune zone n'est renseignée.",
        "Message de mise en relation préparé, jamais envoyé.",
        (Proof(_API + "consultants/matching/reverse-market.spec.ts", "reverseMarketUnavailability"),),
    ),
    ReferenceProfile(
        7,
        "manager devant couper cinq comptes",
        "Elle recommande de masquer le bruit : les comptes au verdict STOP sortent du travail du jour.",
        "Plan : action « masquer le bruit » en tête, comptes écartés restent archivés.",
        "Aucun message sur les comptes coupés.",
        (Proof(_IA + "test_action_recommender.py", "test_stop_does_not_invest"),),
    ),
    ReferenceProfile(
        8,
        "client actif à étendre vers une autre BU",
        "Elle nomme le premier mouvement prudent et les trois pistes d'extension quand le retour d'expérience est positif.",
        "Plan : expansion de compte, BU cibles nommées.",
        "Message d'extension qui s'appuie sur le retour d'expérience réel, jamais inventé.",
        (Proof(_IA + "test_action_recommender.py", "test_positive_rex_names_the_three_expansion_tracks"),),
    ),
    ReferenceProfile(
        9,
        "approche directe",
        "Par défaut, elle route vers l'accès direct — sans chemin détourné inutile.",
        "Parcours d'ouverture : mouvement direct, séquence et justification présentes.",
        "Message M1 direct au contact accessible.",
        (Proof(_IA + "test_opening_movement.py", "test_default_is_middle_out"),),
    ),
    ReferenceProfile(
        10,
        "relation chaude",
        "Une relation forte ouvre par le haut : elle s'appuie sur le lien existant.",
        "Parcours d'ouverture : mouvement descendant, lien nommé.",
        "Message qui cite la relation réelle, jamais un lien supposé.",
        (Proof(_IA + "test_opening_movement.py", "test_strong_tie_goes_top_down"),),
    ),
    ReferenceProfile(
        11,
        "contact recommandé",
        "Elle route vers la recommandation : demande de mise en relation, jamais d'approche à froid déguisée.",
        "Parcours d'ouverture : mouvement « recommandation ».",
        "Séquence « recommandation » de la bibliothèque, proposée seulement si les quatre faits obligatoires sont confirmés.",
        (
            Proof(_IA + "test_opening_movement.py", "test_open_need_is_reverse_prospecting"),
            Proof(_IA + "test_opening_movement.py", "test_every_movement_carries_a_sequence_and_rationale"),
        ),
    ),
    ReferenceProfile(
        12,
        "rang 2 avec non-contournement",
        "Elle vérifie la gouvernance avant de recommander une route partenaire, et ne dit jamais « passe par cette ESN » sans fait d'accès déclaré.",
        "Fiche compte : chemin partenaire marqué comme indice, pas comme preuve.",
        "Aucun message qui contourne le partenaire sans accord.",
        (
            Proof(
                _IA + "test_copilote_prompt_blocks.py",
                "test_3270_laura_verifies_governance_before_recommending_a_partner_route",
            ),
        ),
    ),
    ReferenceProfile(
        13,
        "mauvais C-level",
        "Sur un compte froid, un dirigeant de groupe ou de périmètre mondial est rétrogradé derrière l'opérationnel.",
        "Parcours d'ouverture : le C-level reste visible, mais n'est pas le premier toucher.",
        "Aucun premier message au C-level d'un compte froid.",
        (Proof(_IA + "test_governance_first_touch.py", "test_worldwide_cto_is_demoted_like_governance"),),
    ),
    ReferenceProfile(
        14,
        "bon manager intermédiaire",
        "Un manager local, non gouvernance, n'est pas rétrogradé : il reste un premier toucher légitime.",
        "Parcours d'ouverture : le manager intermédiaire reste en tête.",
        "Message M1 adressé au manager intermédiaire.",
        (Proof(_IA + "test_governance_first_touch.py", "test_a_local_cto_is_not_a_governance_seat"),),
    ),
    ReferenceProfile(
        15,
        "historique CRM disponible",
        "Elle lit le CRM branché et répond avec le contenu réel : contacts connus, dernière activité, affaires ouvertes.",
        "Fiche compte : historique CRM rappelé avec sa date.",
        "Message qui tient compte de l'historique réel, jamais d'un historique supposé.",
        (Proof(_IA + "test_q05_3422_crm_scenarios.py", "test_3422_15_crm_history_reaches_the_model_and_the_answer"),),
    ),
    ReferenceProfile(
        16,
        "aucun connecteur",
        "Elle dit qu'aucun CRM n'est branché et nomme l'action pour en brancher un — jamais « aucun contact ».",
        "Panneau « non consulté » : « Aucun CRM connecté » avec son action.",
        "Aucun message qui prétend connaître un historique.",
        (
            Proof(
                _IA + "test_q05_3422_crm_scenarios.py",
                "test_3422_16_without_connector_the_model_is_told_so_never_an_invented_absence",
            ),
            Proof(
                _IA + "test_q05_3422_crm_scenarios.py",
                "test_3422_16_the_panel_names_the_missing_connector_with_its_action",
            ),
        ),
    ),
    ReferenceProfile(
        17,
        "données contradictoires",
        "Elle ne fusionne pas en silence deux sources qui se contredisent : homonyme ou incertain, la contradiction est nommée.",
        "Fiche compte : statut d'identité « incertain » ou « homonyme », avec la raison.",
        "Aucun message tant que l'identité du compte n'est pas levée.",
        (
            Proof(
                _IA + "test_beta_30_09_3422_remainders.py",
                "test_3422_17_contradictory_registry_and_web_data_is_not_silently_merged",
            ),
        ),
    ),
    ReferenceProfile(
        18,
        "correction d'organigramme par l'utilisateur",
        "La correction de l'utilisateur gagne toujours ; aucune donnée protégée n'entre dans le classement.",
        "Organigramme : la correction humaine remplace la lecture automatique.",
        "Les messages suivent l'organigramme corrigé.",
        (
            Proof(
                _IA + "test_protected_criteria_scoring.py", "test_aucun_prompt_de_notation_ne_recoit_un_critere_protege"
            ),
        ),
    ),
    ReferenceProfile(
        19,
        "observation historique non actuelle",
        "Une observation seule ne suffit pas pour une question actuelle : elle la présente comme ancienne et demande vérification.",
        "Fiche compte : observation datée, marquée non actuelle.",
        "Aucun message qui présente une observation ancienne comme un besoin en cours.",
        (
            Proof(
                _IA + "test_copilote_prompt_blocks.py",
                "test_temporal_rule_requires_verification_for_a_current_question",
            ),
            Proof(_IA + "test_copilote_need_freshness_eval.py", "test_every_anchor_is_present"),
        ),
    ),
    ReferenceProfile(
        20,
        "message trop générique",
        "Elle passe le message à la checklist « avant d'envoyer » : « pas prêt » dès qu'un contrôle échoue ou reste non vérifiable.",
        "Checklist avant envoi : échecs nommés (aucun contexte, aucune question ouvrante).",
        "Le texte générique (« je me permets de vous contacter… ») n'est jamais déclaré prêt.",
        (
            Proof(_IA + "test_chat_pre_send_check_tool.py", "test_the_turn_replayed_laura_names_the_failing_check"),
            Proof(
                "packages/contracts/src/schemas/pre-send-check-generic-3422.test.ts",
                "#3422.20 — un message trop générique est signalé",
            ),
        ),
    ),
    ReferenceProfile(
        21,
        "action nécessitant validation",
        "Elle prépare l'action ; l'écriture CRM/ERP passe par une porte, jamais en silence.",
        "Aperçu figé de l'action avant exécution, geste utilisateur explicite.",
        "Le message est préparé, le commercial envoie.",
        (Proof(_API + "action-router/action-router.service.spec.ts", "ActionRouterService.dispatch"),),
    ),
)
