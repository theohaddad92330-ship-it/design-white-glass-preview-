"""Les règles de DISCIPLINE commerciale distillées, portées côté Python.

## Le défaut que ce module ferme

Le delta de méthode du paquet de récupération a été distillé en onze règles
gardées et sept interdits. Ils sont écrits et testés depuis des mois dans
``packages/contracts/src/knowledge/method-delta.ts`` — et n'avaient **aucun
appelant applicatif** : aucun prompt ne les portait, le copilote ne les avait
jamais vues. Le motif habituel de ce dépôt : du code juste, calculé, testé, que
personne n'appelle.

Ce module les porte côté Python pour qu'ils deviennent la **quatrième source**
du corpus citable (``app/services/method_knowledge.py``), à côté des objections,
des playbooks sectoriels et du registre de règles métier. Le copilote peut alors
CITER la discipline qui justifie son conseil, au lieu de la réciter de mémoire.

## Ce que ce module n'est pas

* **Pas un doublon de** ``app/knowledge/business_rules.py`` : ce registre-là
  porte des règles de SCORING (``account_fit_score_25``, ``no_go_sectors``…).
  Ici, ce sont des règles de DISCIPLINE. Aucun recouvrement, et un test l'exige.
* **Pas une seconde implémentation.** Une règle déjà tenue par du code ne se
  réécrit pas ici : elle POINTE vers lui via ``applied_by``. C'est le cas de
  « Le fil achats est distinct du fil métier », tenue par
  ``app/services/purchasing_thread.py`` (bloc ``THREAD ACHATS`` injecté par
  ``app/routers/phase4_plan.py``). Ce qui manquait était son ÉNONCÉ. Un test
  vérifie que chaque chemin déclaré existe sur le disque — motif de GA-38.

## Pourquoi une copie, et ce qui l'empêche de dériver

Une valeur recopiée à la main dans deux langages diverge toujours. Ce qui
l'empêche ici est un test, pas une bonne intention :
``packages/contracts/src/knowledge/method-delta.parity.test.ts`` lit CE fichier
et fait rougir la CI dès que les deux listes divergent — sur les identifiants
comme sur les énoncés. Il compare des ENSEMBLES D'IDENTIFIANTS, jamais des
chaînes libres cherchées au mot : une garde qui cherche un mot trouve les
commentaires.

⚠️ Conséquence pratique : les littéraux ``id=`` et ``statement=`` ci-dessous sont
lus par cette garde. Chacun tient sur UNE ligne, et aucun commentaire de ce
fichier ne doit en imiter la forme.
"""

from __future__ import annotations

from dataclasses import dataclass

# La provenance citée dans le prompt. Volontairement sans chemin de dépôt : un
# chemin interne n'a rien à faire dans une réponse lue par un commercial.
METHOD_SOURCE = "Méthode commerciale Bellum — delta de méthode distillé"


@dataclass(frozen=True)
class MethodRule:
    """Une règle de discipline commerciale, gardée ou refusée.

    ``statement`` est VERBATIM : une règle reformulée à chaque usage devient dix
    règles voisines, et plus personne ne sait laquelle fait foi.

    ``applied_by`` liste les chemins (relatifs à ``apps/ia/``) qui appliquent
    DÉJÀ la règle. Vide n'est pas un manque : la plupart de ces règles sont une
    discipline humaine que le copilote rappelle, pas un calcul. Un interdit, lui,
    n'en porte JAMAIS — il est une absence de code, rien ne peut l'appliquer.
    """

    id: str
    statement: str
    applied_by: tuple[str, ...] = ()


# ── Les onze règles gardées ──────────────────────────────────────────────────

METHOD_RULES: tuple[MethodRule, ...] = (
    MethodRule(
        id="plan_de_compte_hebdomadaire",
        statement="Le plan de compte est une discipline hebdomadaire, pas un document figé.",
    ),
    MethodRule(
        id="haut_et_bas_en_parallele",
        statement="Le haut et le bas de l’organisation se travaillent en parallèle, jamais l’un après l’autre.",
    ),
    MethodRule(
        id="fil_achats_distinct_du_fil_metier",
        statement="Le fil achats est distinct du fil métier.",
        # Déjà TENUE par le service qui construit le fil achats à part des autres
        # signaux et l'injecte comme son propre bloc. On désigne, on ne refait pas.
        applied_by=("app/services/purchasing_thread.py", "app/routers/phase4_plan.py"),
    ),
    MethodRule(
        id="action_avec_proprietaire_date_resultat",
        statement="Chaque action a un propriétaire, une date, un résultat attendu et un point de contrôle.",
    ),
    MethodRule(
        id="couverture_multi_roles_niveaux_entites",
        statement="Une couverture de compte traverse plusieurs rôles, plusieurs niveaux et plusieurs entités.",
    ),
    MethodRule(
        id="consultant_capteur_avec_consentement",
        statement="Un consultant en mission peut devenir capteur de signaux ou source d’introduction — avec son consentement et une trace.",
    ),
    MethodRule(
        id="objection_validee_puis_exploree",
        statement="Une objection se valide d’abord, puis s’explore par une question.",
    ),
    # #3421.8-.12 (retour bêta 30/09/2026) — la suite de la règle ci-dessus :
    # une fois la vraie raison clarifiée, ce qu'elle exige encore. Statement
    # distinct plutôt qu'allongé : deux moments de la même discipline, cités
    # séparément le jour où un seul des deux manque à une réponse.
    MethodRule(
        id="objection_contextuelle_et_sortie_respectee",
        statement="La réponse à une objection s’appuie sur le contexte réel, répond à sa vraie raison, propose une étape proportionnée et accepte une sortie ferme.",
    ),
    MethodRule(
        id="ouverture_construit_une_conversation",
        statement="Un message d’ouverture construit une conversation ; il ne déroule pas l’offre.",
    ),
    MethodRule(
        id="non_resultat_est_un_resultat",
        statement="Le NON-résultat d’une action est un résultat exploitable.",
    ),
    MethodRule(
        id="quotas_historiques_sont_des_exemples",
        statement="Les quotas historiques sont des exemples, jamais des valeurs de produit.",
    ),
)


# ── Les sept interdits ───────────────────────────────────────────────────────
#
# Ils vivent au même endroit que les règles gardées, et c'est délibéré : un refus
# rangé ailleurs se perd, puis quelqu'un le réintroduit de bonne foi six mois
# plus tard en croyant combler un manque.

METHOD_REFUSALS: tuple[MethodRule, ...] = (
    MethodRule(
        id="nombres_fixes_de_volumes",
        statement="Des nombres fixes de contacts, de messages, d’appels ou de jours.",
    ),
    MethodRule(
        id="ciblage_informatique_par_defaut",
        statement="Un ciblage informatique par défaut.",
    ),
    MethodRule(
        id="gabarits_recopies_mot_pour_mot",
        statement="Des gabarits de message recopiés mot pour mot.",
    ),
    MethodRule(
        id="promesses_de_delai_sans_engagement",
        statement="Des promesses de délai qui n’engagent personne.",
    ),
    MethodRule(
        id="automatisation_du_reseau_professionnel",
        statement="Toute automatisation du réseau professionnel.",
    ),
    MethodRule(
        id="nom_de_fournisseur_technique_dans_l_app",
        statement="Le nom d’un fournisseur technique dans l’application.",
    ),
    MethodRule(
        id="anciennes_statistiques_comme_reperes",
        statement="D’anciennes statistiques présentées comme des repères Bellum.",
    ),
)
