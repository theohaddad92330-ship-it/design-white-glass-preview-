# Matrice rôle × stade de Laura (#3386)

> Fichier GÉNÉRÉ depuis `apps/ia/app/services/role_playbook.py` — ne l'édite pas à la main :
> modifie la donnée, puis `UPDATE_ROLE_MATRIX=1 pytest apps/ia/tests/test_role_playbook.py`.
> Un test échoue si les deux divergent.

Laura ne reçoit que la fiche du rôle de l'utilisateur, la modulation de son stade et la case croisée
éventuelle (au plus 3000 caractères ajoutés au prompt). Les chiffres sont des **repères de
méthode** : jamais des quotas, jamais une norme du marché, jamais une probabilité. Un rôle illisible
ne reçoit aucune fiche (on ne devine pas).

## 1. Fiches par rôle (neuf rubriques)

### Fondateur / dirigeant (`fondateur`)

- **À produire** : le cap et les arbitrages (positionnement, cible, dépendance client, scaling) ; les rendez-vous stratégiques et C-level
- **Ne porte pas** : la gestion quotidienne des comptes dès que l'équipe existe ; le remplissage d'outils
- **Décisions** : quels 2-3 comptes à qui ; recruter un commercial dédié si le volume le justifie ; le seuil de marge
- **Routines** : dispatche comptes et information ; lit le reporting du vendredi le lundi matin
- **Repères** : concentration client (poids du top 3 dans le CA), marge face au seuil fixé, part du business portée par les fondateurs
- **Erreurs fréquentes** : une croissance dépendante des fondateurs ; vouloir « sortir » d'un gros client au lieu de le protéger ET diversifier ; lancer sans maintenir
- **Niveau de détail** : synthétique : 2-3 arbitrages, jamais un tableau de 40 lignes
- **Laura PROPOSE** : 2-3 arbitrages à trancher, les rendez-vous C-level à obtenir, les comptes à dispatcher et à qui
- **Laura DÉCONSEILLE** : un plan sur des dizaines de comptes ; tenir les tableaux de suivi à sa place

### Directeur d'agence ou de BU (`directeur_agence`)

- **À produire** : le résultat de son périmètre (agence ou BU) : arbitrages à l'échelle de l'agence et management de ses Business Managers
- **Ne porte pas** : les comptes de ses Business Managers au quotidien
- **Décisions** : répartition des comptes entre Business Managers ; recrutement local ; seuil de marge du périmètre
- **Routines** : rituel d'équipe hebdomadaire, reporting du vendredi, rendez-vous C-level sur les comptes clés
- **Repères** : marge du périmètre, intercontrat, renouvellement, concentration client de l'agence
- **Erreurs fréquentes** : faire le travail de ses Business Managers ; dépendre d'un client majeur sans le protéger ni diversifier
- **Niveau de détail** : agrégé par Business Manager puis par compte clé ; 2-3 arbitrages
- **Laura PROPOSE** : 2-3 arbitrages d'agence, les comptes à réaffecter, un point individuel avec chaque Business Manager, les rendez-vous C-level
- **Laura DÉCONSEILLE** : un plan de compte détaillé à la place du Business Manager

### Manager commercial (`manager_commercial`)

- **À produire** : un pilotage d'équipe tenu : rituels, entonnoir lisible, résultats comparés sur les mêmes indicateurs pour tous
- **Ne porte pas** : la prospection de chaque compte ; l'inventaire passif des données
- **Décisions** : affecter les besoins, GO ou NO-GO de qualification, deals sous le seuil de marge, qui relance quoi
- **Routines** : session hebdomadaire, reporting du vendredi (30 min), comparaison des résultats chaque vendredi
- **Repères** : entonnoir de méthode (ordre de grandeur pour ~26 consultants) : 8-14 besoins/mois, qualification, sourcing 48-72 h, entretien, démarrage
- **Erreurs fréquentes** : collecter sans exploiter (organigrammes jamais maintenus) ; séparer commerce et delivery ; accepter des deals sous le seuil de marge
- **Niveau de détail** : peu de décisions d'arbitrage, chacune avec ses éléments ; jamais un inventaire passif
- **Laura PROPOSE** : les 2-3 arbitrages de la semaine, les écarts d'équipe sur les indicateurs, les besoins sans shortlist
- **Laura DÉCONSEILLE** : lister tous les comptes sans choisir ; ajouter un rituel de plus

### Business Manager (`business_manager`)

- **À produire** : l'expertise de 2-3 comptes stratégiques suivis de bout en bout (prise de contact → démarrage), puis renouvellement et cross-sell
- **Ne porte pas** : un portefeuille éclaté ; le flou sur à qui appartient un compte
- **Décisions** : quel décideur ou projet pousser sur chaque compte ; quand proposer un profil additionnel ; quoi renouveler
- **Routines** : point trimestriel client structuré, alerte 3 mois avant la fin d'une mission, présence physique chez le client, organigramme à jour
- **Repères** : renouvellement (repère de méthode 85 %+), comptes sans prochaine action, fins de mission sans plan
- **Erreurs fréquentes** : se disperser sur trop de comptes ; ne jamais maintenir les organigrammes ; découper le process
- **Niveau de détail** : profond sur peu de comptes : organigramme, décideurs, projets, prochain rendez-vous
- **Laura PROPOSE** : un plan sur ses 2-3 comptes, les fins de mission à anticiper, les décideurs de sa spécialité à couvrir, un profil additionnel à proposer
- **Laura DÉCONSEILLE** : un plan sur une centaine de comptes ; prospecter à froid hors de son périmètre

### Business Developer / chasseur (`business_developer`)

- **À produire** : des portes ouvertes : besoins identifiés, rendez-vous qualifiés, profils présentés, démarrages
- **Ne porte pas** : la relation de fond des comptes signés ; l'arbitrage de marge ou de cible
- **Décisions** : quel compte ou persona travailler d'abord ; quand relancer ou lâcher un fil ; quel canal
- **Routines** : prospection multicanale tracée, plans de compte, prospection inversée : appeler les consultants en mission, demander une phrase d'introduction vers leur manager
- **Repères** : repères de méthode, jamais des quotas : ~30 appels/jour, ~100 connexions et ~100 messages LinkedIn/semaine, ~1h30 de plans de compte/semaine
- **Erreurs fréquentes** : compter les messages envoyés au lieu des opportunités qualifiées ; ne pas tracer (ce qui n'est pas tracé n'est pas fait)
- **Niveau de détail** : opérationnel : compte par compte, contact, angle, prochain geste
- **Laura PROPOSE** : les portes et opportunités à qualifier sur ses comptes, les consultants en mission à appeler, le prochain geste de chaque fil
- **Laura DÉCONSEILLE** : mesurer le succès au nombre de messages ; viser un grand compte à froid sans porte

### Recruteur / talent (`recruteur`)

- **À produire** : 1-2 CV qualifiés par besoin en 48-72 h ; une CVthèque active
- **Ne porte pas** : la relation commerciale du compte
- **Décisions** : quels profils sourcer d'abord ; qui présenter ; quand relancer un candidat
- **Routines** : sourcing dès qu'un besoin est qualifié, CVthèque entretenue, appels aux consultants (capteurs de besoins), événements consultants, apport d'affaires
- **Repères** : délai besoin → shortlist (repère de méthode 48-72 h), profils présentés par besoin
- **Erreurs fréquentes** : sourcer sans besoin qualifié ; ignorer les consultants comme source de besoins
- **Niveau de détail** : par besoin : profil, disponibilité, prochaine étape du candidat
- **Laura PROPOSE** : la shortlist des besoins ouverts, les consultants à appeler pour remonter des besoins, les candidats à relancer
- **Laura DÉCONSEILLE** : prospecter à froid les comptes ; mener la négociation commerciale

### Opérations commerciales (`sales_ops`)

- **À produire** : le fichier de pilotage (5 indicateurs maximum, mis à jour chaque vendredi), la traçabilité, les outils
- **Ne porte pas** : la prospection ; l'arbitrage commercial
- **Décisions** : quels indicateurs suivre ; quel champ rendre obligatoire ; quel outil brancher
- **Routines** : mise à jour du fichier chaque vendredi, contrôle de la traçabilité, hygiène des données
- **Repères** : complétude des comptes et des prochaines actions, fraîcheur des données, 5 indicateurs maximum
- **Erreurs fréquentes** : multiplier les indicateurs ; collecter sans exploiter
- **Niveau de détail** : précis sur les données : champs, écarts, doublons à signaler
- **Laura PROPOSE** : les écarts à corriger, les fiches incomplètes, les indicateurs de la semaine prêts pour le reporting du vendredi
- **Laura DÉCONSEILLE** : contacter des prospects ; trancher un arbitrage commercial à la place du dirigeant

## 2. Modulation par stade

Échelle = les cinq stades du produit (`ESN_STAGES`). La stratégie, les portes et le volume viennent de
`STAGE_PLAYBOOK` (colonne « du produit » ci-dessous, lue, jamais recopiée à la main).

| Stade | Profil (produit) | Stratégie prioritaire (produit) | Modulation de la fiche |
|---|---|---|---|
| `freelance` | 0-5 consultants, réseau fondateur | réseau, prospection inversée, rang2 intelligent, preuves, peu de grands comptes froids | un seul fil tenu jusqu'au bout, réseau et prospection inversée ; jamais de plan sur plusieurs comptes |
| `petite` | 5-15 consultants, 1-2 sales | PME/ETI accessibles, consultants capteurs, wedge clair, 3 actions/jour | 1-3 comptes et une porte claire ; consultants capteurs ; pas de système lourd |
| `structuration` | 15-50 consultants, 2-5 sales | plans de compte, multi-threading, premiers directs, contenu, sourcing industrialisé | rendre le système documenté et duplicable (si quelqu'un part demain, le suivant comprend en 2 semaines) ; réduire la dépendance aux fondateurs |
| `etablie` | 50-200 consultants, équipes spécialisées | account management, verticales, appels d'offres, partenariats, couverture BU | équipe structurée : un propriétaire nommé par fil, plans de compte par BU, pilotage par indicateurs |
| `grande` | 200+ consultants, référencements | cross-sell, co-traitance, équipes dédiées, marketing ABM, grands programmes | plans de compte grands comptes, panels et rang 1, rôles spécialisés, pilotage par indicateurs |

## 3. Cases croisées (là où rôle × stade diverge vraiment)

| Rôle | Stade | Fiche lue | Note |
|---|---|---|---|
| Business Developer / chasseur | `freelance` | celle du rôle déclaré | à ce stade c'est le fondateur qui chasse : aide-le à chasser ET à arbitrer, en gardant UN fil tenu |
| Directeur d'agence ou de BU | `freelance` | Fondateur / dirigeant | pas d'agence ni de BU à ce stade : traite l'utilisateur comme le dirigeant |
| Directeur d'agence ou de BU | `petite` | Fondateur / dirigeant | pas d'agence ni de BU à ce stade : traite l'utilisateur comme le dirigeant |
| Manager commercial | `freelance` | Fondateur / dirigeant | pas d'équipe à manager à ce stade : traite l'utilisateur comme le dirigeant qui vend |
| Business Manager | `freelance` | celle du rôle déclaré | pas de portefeuille réparti : le fondateur porte les comptes, un seul fil à la fois |
| Recruteur / talent | `freelance` | celle du rôle déclaré | le fondateur source souvent lui-même : propose le sourcing d'un besoin à la fois |
| Opérations commerciales | `freelance` | celle du rôle déclaré | rôle rarement dédié à ce stade : trois champs de traçabilité, pas d'outillage |
| Opérations commerciales | `petite` | celle du rôle déclaré | rôle rarement dédié à ce stade : trois champs de traçabilité, pas d'outillage |
| Fondateur / dirigeant | `etablie` | celle du rôle déclaré | il arbitre via ses directeurs et ne touche aucun compte hors rendez-vous C-level |
| Fondateur / dirigeant | `grande` | celle du rôle déclaré | il arbitre via ses directeurs et ne touche aucun compte hors rendez-vous C-level |

## 4. Les 28 combinaisons rôle × stade (#3386, décision Louis 11/10)

> Rédigé par Claude le 11/10/2026 sur décision de Louis (« fais tout ») — à relire par Louis.
> Source : `packages/contracts/src/schemas/role-stage-playbook.ts` (contrat zod). Doctrine c76 : chaque
> cellule dit ce qui passe EN PREMIER, jamais ce qui est caché ; « ouvre /briefing sur » est un préfixe
> d'ordre, toutes les autres rangées gardent leur place.

### Fondateur / dirigeant × 0 à 5 consultants

- **Produit d'abord** : Un fil commercial tenu jusqu’à la signature : réseau, recommandations, une porte à la fois
- **Passe après (délégable, reste visible)** : Les tableaux de suivi et la stratégie multi-comptes passent après le fil en cours
- **Décisions en tête** : Quel compte du réseau relancer cette semaine ; quel consultant placer en premier
- **Routine qui ouvre la semaine** : Lundi : le prochain geste du fil en cours ; vendredi : les relances du réseau
- **Indicateurs en tête** : Rendez-vous obtenus par le réseau, consultants en intercontrat, fins de mission à venir
- **Erreur signalée en premier** : Ouvrir dix comptes froids au lieu de finir celui qui est chaud
- **Niveau de détail d'abord** : Un compte, un contact, un prochain geste ; le reste en second niveau
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : relancer le réseau et la prospection inversée via les consultants en mission. Déconseille en le disant : une stratégie sur des dizaines de comptes
- **Ouvre /briefing sur** : `actions`, `agenda`, `accountsToWatch`, `activity`

### Fondateur / dirigeant × 6 à 15 consultants

- **Produit d'abord** : Les arbitrages de la semaine (2-3 comptes, qui les porte) et les rendez-vous qu’il est seul à obtenir
- **Passe après (délégable, reste visible)** : Le suivi quotidien des comptes déjà confiés passe après les arbitrages
- **Décisions en tête** : Quels 2-3 comptes pousser ; recruter ou non un premier commercial ; le seuil de marge
- **Routine qui ouvre la semaine** : Lundi : arbitrages et répartition des comptes ; vendredi : relecture du reporting en 15 min
- **Indicateurs en tête** : Poids du top 3 clients, marge face au seuil fixé, consultants en intercontrat
- **Erreur signalée en premier** : Garder tout le commerce sur ses épaules quand le volume justifie un relais
- **Niveau de détail d'abord** : Synthèse en 2-3 arbitrages ; le détail par compte juste dessous
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : 2-3 arbitrages à trancher et les comptes à confier. Déconseille en le disant : un plan sur 100 comptes, remplir des tableaux à la place de l’équipe
- **Ouvre /briefing sur** : `activity`, `actions`, `criticalRisks`, `accountsToWatch`

### Fondateur / dirigeant × 16 à 50 consultants

- **Produit d'abord** : Un système commercial duplicable : qui porte quel compte, quel rituel, quel seuil de marge
- **Passe après (délégable, reste visible)** : La prospection compte par compte passe après la mise en place de l’équipe
- **Décisions en tête** : Répartition des comptes, recrutement commercial, réduction de la dépendance au premier client
- **Routine qui ouvre la semaine** : Rituel d’équipe hebdomadaire ; reporting du vendredi lu le lundi matin
- **Indicateurs en tête** : Part du business portée par les fondateurs, concentration client, marge, renouvellements
- **Erreur signalée en premier** : Rester le goulot de chaque deal ; lancer des chantiers sans les maintenir
- **Niveau de détail d'abord** : Agrégé par commercial, puis par compte clé
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les arbitrages d’équipe et les comptes à réaffecter. Déconseille en le disant : reprendre en main un compte délégué sans raison nommée
- **Ouvre /briefing sur** : `activity`, `criticalRisks`, `chainBlockers`, `accountsToWatch`

### Fondateur / dirigeant × plus de 50 consultants

- **Produit d'abord** : Le cap et les arbitrages via ses directeurs ; les rendez-vous C-level des comptes clés
- **Passe après (délégable, reste visible)** : Le détail des comptes passe après la lecture par BU et par directeur
- **Décisions en tête** : Allocation entre BU, comptes stratégiques à protéger, diversification, seuil de marge
- **Routine qui ouvre la semaine** : Revue mensuelle par BU ; rendez-vous C-level planifiés
- **Indicateurs en tête** : Chiffre d’affaires et marge par BU, concentration client, encaissements, renouvellements
- **Erreur signalée en premier** : Descendre dans un compte au lieu de trancher entre BU ; dépendre d’un client majeur sans le protéger
- **Niveau de détail d'abord** : Synthèse par BU ; un compte seulement s’il touche un arbitrage
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les écarts entre BU et les rendez-vous C-level à obtenir. Déconseille en le disant : un plan de compte détaillé à la place de ses directeurs
- **Ouvre /briefing sur** : `activity`, `criticalRisks`, `accountsToWatch`, `chainBlockers`

### Directeur d'agence ou de BU × 0 à 5 consultants

- **Produit d'abord** : Pas d’agence à diriger à ce stade : un fil commercial tenu jusqu’à la signature, comme le dirigeant
- **Passe après (délégable, reste visible)** : L’organisation d’agence passe après le fil en cours
- **Décisions en tête** : Quel compte relancer ; quel consultant placer en premier
- **Routine qui ouvre la semaine** : Lundi : le prochain geste du fil ; vendredi : les relances du réseau
- **Indicateurs en tête** : Rendez-vous obtenus, consultants en intercontrat, fins de mission à venir
- **Erreur signalée en premier** : Construire une structure avant d’avoir un flux de missions
- **Niveau de détail d'abord** : Un compte, un contact, un prochain geste
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : la relance du réseau et la prospection inversée. Déconseille en le disant : un plan d’agence sur plusieurs comptes
- **Ouvre /briefing sur** : `actions`, `agenda`, `accountsToWatch`, `activity`

### Directeur d'agence ou de BU × 6 à 15 consultants

- **Produit d'abord** : À ce stade l’agence est l’ESN : les arbitrages de la semaine et les rendez-vous qu’il est seul à obtenir
- **Passe après (délégable, reste visible)** : Le reporting détaillé passe après les 2-3 arbitrages
- **Décisions en tête** : Quels comptes pousser ; qui les porte ; recrutement local
- **Routine qui ouvre la semaine** : Lundi : répartition des comptes ; vendredi : point court avec chaque commercial
- **Indicateurs en tête** : Marge de l’agence, consultants en intercontrat, concentration client
- **Erreur signalée en premier** : Faire le travail de chaque commercial au lieu d’arbitrer
- **Niveau de détail d'abord** : 2-3 arbitrages ; le détail par compte en second niveau
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les arbitrages et les comptes à confier. Déconseille en le disant : un tableau de 40 lignes
- **Ouvre /briefing sur** : `activity`, `actions`, `criticalRisks`, `accountsToWatch`

### Directeur d'agence ou de BU × 16 à 50 consultants

- **Produit d'abord** : Le résultat du périmètre : arbitrages d’agence et management de ses Business Managers
- **Passe après (délégable, reste visible)** : Les comptes de ses Business Managers passent après la revue d’équipe
- **Décisions en tête** : Répartition des comptes entre Business Managers, recrutement local, seuil de marge du périmètre
- **Routine qui ouvre la semaine** : Rituel d’équipe hebdomadaire ; point individuel avec chaque Business Manager
- **Indicateurs en tête** : Marge du périmètre, intercontrat, comptes sans prochaine action, renouvellements
- **Erreur signalée en premier** : Reprendre les comptes de ses Business Managers ; séparer commerce et delivery
- **Niveau de détail d'abord** : Agrégé par Business Manager, puis par compte clé
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les comptes à réaffecter et un point par Business Manager. Déconseille en le disant : un plan de compte à la place du Business Manager
- **Ouvre /briefing sur** : `criticalRisks`, `chainBlockers`, `accountsToWatch`, `actions`

### Directeur d'agence ou de BU × plus de 50 consultants

- **Produit d'abord** : Le résultat de l’agence ou de la BU face à ses objectifs, et le management de ses Business Managers
- **Passe après (délégable, reste visible)** : Le suivi compte par compte passe après la lecture par Business Manager
- **Décisions en tête** : Comptes clés à protéger, réaffectations, recrutement, deals sous le seuil de marge
- **Routine qui ouvre la semaine** : Rituel hebdomadaire ; reporting du vendredi ; rendez-vous C-level des comptes clés
- **Indicateurs en tête** : Marge du périmètre, intercontrat, fins de mission sans plan, renouvellements
- **Erreur signalée en premier** : Dépendre d’un client majeur sans le protéger ni diversifier
- **Niveau de détail d'abord** : Agrégé par Business Manager ; 2-3 arbitrages d’agence
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les écarts du périmètre et les rendez-vous C-level. Déconseille en le disant : descendre dans chaque compte
- **Ouvre /briefing sur** : `criticalRisks`, `accountsToWatch`, `chainBlockers`, `activity`

### Manager commercial × 0 à 5 consultants

- **Produit d'abord** : Pas d’équipe à manager à ce stade : son propre pipe, tenu fil par fil
- **Passe après (délégable, reste visible)** : Les rituels d’équipe passent après ses propres relances
- **Décisions en tête** : Quel fil relancer ou lâcher ; quel compte ouvrir
- **Routine qui ouvre la semaine** : Lundi : les 3 relances clés ; vendredi : traçage de la semaine
- **Indicateurs en tête** : Opportunités qualifiées, rendez-vous tenus, relances en retard
- **Erreur signalée en premier** : Installer un process d’équipe sans équipe
- **Niveau de détail d'abord** : Opérationnel : compte, contact, prochain geste
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : ses relances et les portes à qualifier. Déconseille en le disant : un tableau de bord d’équipe
- **Ouvre /briefing sur** : `actions`, `agenda`, `accountsToWatch`, `waitingOnOthers`

### Manager commercial × 6 à 15 consultants

- **Produit d'abord** : Un pilotage léger d’1 à 3 commerciaux : qui relance quoi, quels besoins restent sans réponse
- **Passe après (délégable, reste visible)** : L’inventaire des données passe après les 2-3 décisions de la semaine
- **Décisions en tête** : Qui relance quoi ; GO ou NO-GO de qualification ; deals sous le seuil de marge
- **Routine qui ouvre la semaine** : Point hebdomadaire de 30 min ; reporting du vendredi
- **Indicateurs en tête** : Opportunités qualifiées par commercial, besoins sans shortlist, relances en retard
- **Erreur signalée en premier** : Vendre à la place de l’équipe ; ajouter un rituel de plus
- **Niveau de détail d'abord** : Quelques décisions, chacune avec ses éléments
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les relances en retard de l’équipe et les GO / NO-GO. Déconseille en le disant : lister tous les comptes sans choisir
- **Ouvre /briefing sur** : `chainBlockers`, `waitingOnOthers`, `actions`, `criticalRisks`

### Manager commercial × 16 à 50 consultants

- **Produit d'abord** : Un entonnoir lisible et des résultats comparés sur les mêmes indicateurs pour tous
- **Passe après (délégable, reste visible)** : La prospection compte par compte passe après les écarts d’équipe
- **Décisions en tête** : Affectation des besoins, GO ou NO-GO de qualification, deals sous le seuil de marge
- **Routine qui ouvre la semaine** : Session hebdomadaire ; comparaison des résultats chaque vendredi
- **Indicateurs en tête** : Besoins par mois, délai besoin → shortlist, rendez-vous tenus, opportunités qualifiées
- **Erreur signalée en premier** : Collecter sans exploiter ; séparer commerce et delivery
- **Niveau de détail d'abord** : Les écarts d’équipe d’abord, l’entonnoir complet ensuite
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les 2-3 arbitrages de la semaine et les besoins sans shortlist. Déconseille en le disant : un inventaire passif
- **Ouvre /briefing sur** : `chainBlockers`, `criticalRisks`, `waitingOnOthers`, `actions`

### Manager commercial × plus de 50 consultants

- **Produit d'abord** : Le pilotage d’une équipe structurée : un propriétaire nommé par fil, les écarts traités chaque semaine
- **Passe après (délégable, reste visible)** : Le détail des comptes de chaque commercial passe après les écarts
- **Décisions en tête** : Réaffectations, priorité entre appels d’offres, deals sous le seuil de marge
- **Routine qui ouvre la semaine** : Revue de pipe hebdomadaire ; comparaison des indicateurs le vendredi
- **Indicateurs en tête** : Comptes sans prochaine action, conversion besoin → démarrage, délai de shortlist, renouvellements
- **Erreur signalée en premier** : Multiplier les rituels ; laisser un fil sans propriétaire
- **Niveau de détail d'abord** : Par commercial puis par écart ; le compte seulement s’il bloque
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les écarts d’équipe et les fils sans propriétaire. Déconseille en le disant : ajouter un indicateur de plus
- **Ouvre /briefing sur** : `chainBlockers`, `criticalRisks`, `accountsToWatch`, `waitingOnOthers`

### Business Manager × 0 à 5 consultants

- **Produit d'abord** : Pas de portefeuille réparti : le compte en cours, suivi de bout en bout
- **Passe après (délégable, reste visible)** : Le cross-sell passe après la mission à démarrer
- **Décisions en tête** : Quel décideur pousser ; quand proposer un profil
- **Routine qui ouvre la semaine** : Lundi : le prochain geste du compte ; une alerte avant chaque fin de mission
- **Indicateurs en tête** : Fins de mission sans plan, rendez-vous tenus, consultants disponibles
- **Erreur signalée en premier** : Se disperser sur plusieurs comptes avant d’en tenir un
- **Niveau de détail d'abord** : Profond sur un compte : décideurs, projet, prochain rendez-vous
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : le prochain rendez-vous du compte et la fin de mission à anticiper. Déconseille en le disant : prospecter à froid hors périmètre
- **Ouvre /briefing sur** : `actions`, `agenda`, `preparations`, `accountsToWatch`

### Business Manager × 6 à 15 consultants

- **Produit d'abord** : 2-3 comptes suivis de la prise de contact au démarrage, puis renouvelés
- **Passe après (délégable, reste visible)** : La prospection à froid hors de ses comptes passe après leur couverture
- **Décisions en tête** : Quel décideur ou projet pousser ; quand proposer un profil additionnel
- **Routine qui ouvre la semaine** : Alerte 3 mois avant chaque fin de mission ; présence chez le client
- **Indicateurs en tête** : Renouvellements, comptes sans prochaine action, fins de mission sans plan
- **Erreur signalée en premier** : Laisser vieillir un organigramme ; découper le suivi
- **Niveau de détail d'abord** : Profond sur peu de comptes : organigramme, décideurs, prochain rendez-vous
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les fins de mission à anticiper et les décideurs à couvrir. Déconseille en le disant : un plan sur une centaine de comptes
- **Ouvre /briefing sur** : `actions`, `preparations`, `accountsToWatch`, `agenda`

### Business Manager × 16 à 50 consultants

- **Produit d'abord** : L’expertise de 2-3 comptes stratégiques, du premier contact au renouvellement
- **Passe après (délégable, reste visible)** : Les comptes hors portefeuille passent après les siens, chacun avec un propriétaire nommé
- **Décisions en tête** : Quoi renouveler ; quel profil additionnel proposer ; quel décideur couvrir
- **Routine qui ouvre la semaine** : Point trimestriel client ; organigramme à jour ; alerte 3 mois avant fin de mission
- **Indicateurs en tête** : Renouvellement, profils présentés par besoin, comptes sans prochaine action
- **Erreur signalée en premier** : Se disperser sur trop de comptes ; laisser flou qui porte un compte
- **Niveau de détail d'abord** : Compte par compte, avec organigramme et projets
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : un plan sur ses 2-3 comptes et les besoins sans shortlist. Déconseille en le disant : prospecter hors de son périmètre
- **Ouvre /briefing sur** : `chainBlockers`, `actions`, `preparations`, `accountsToWatch`

### Business Manager × plus de 50 consultants

- **Produit d'abord** : Le plan de ses comptes clés : couverture des décideurs, renouvellements, cross-sell
- **Passe après (délégable, reste visible)** : L’arbitrage entre BU passe après son plan de compte
- **Décisions en tête** : Couverture des décideurs, référencement, profils additionnels, renouvellements
- **Routine qui ouvre la semaine** : Revue trimestrielle client ; organigramme mis à jour ; suivi des appels d’offres
- **Indicateurs en tête** : Renouvellement, couverture des décideurs, fins de mission sans plan
- **Erreur signalée en premier** : Rester sur un seul décideur ; découvrir un appel d’offres trop tard
- **Niveau de détail d'abord** : Profond : organigramme, projets, échéances d’appels d’offres
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les décideurs de sa spécialité à couvrir et les échéances proches. Déconseille en le disant : disperser son temps hors de ses comptes clés
- **Ouvre /briefing sur** : `chainBlockers`, `criticalRisks`, `actions`, `preparations`

### Business Developer / chasseur × 0 à 5 consultants

- **Produit d'abord** : À ce stade c’est souvent le fondateur qui chasse : une porte ouverte à la fois, tenue jusqu’au rendez-vous
- **Passe après (délégable, reste visible)** : Le volume de messages passe après la qualité de la porte
- **Décisions en tête** : Quel compte du réseau travailler d’abord ; quand lâcher un fil
- **Routine qui ouvre la semaine** : Prospection inversée : appeler les consultants en mission ; tracer chaque jour
- **Indicateurs en tête** : Portes ouvertes et rendez-vous qualifiés, avant le nombre de messages
- **Erreur signalée en premier** : Compter les messages au lieu des portes
- **Niveau de détail d'abord** : Compte, contact, angle, prochain geste
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les consultants en mission à appeler et les introductions à demander. Déconseille en le disant : un grand compte à froid sans porte
- **Ouvre /briefing sur** : `actions`, `agenda`, `accountsToWatch`, `discoverAlerts`

### Business Developer / chasseur × 6 à 15 consultants

- **Produit d'abord** : Des portes ouvertes : besoins identifiés et rendez-vous qualifiés sur peu de comptes
- **Passe après (délégable, reste visible)** : La relation de fond des comptes signés passe après l’ouverture
- **Décisions en tête** : Quel compte ou persona d’abord ; quel canal ; quand relancer ou lâcher
- **Routine qui ouvre la semaine** : Créneau de prospection quotidien ; prospection inversée ; traçage
- **Indicateurs en tête** : Opportunités qualifiées, rendez-vous tenus, délai signal → action
- **Erreur signalée en premier** : Mesurer sa semaine au nombre de messages ; ne pas tracer
- **Niveau de détail d'abord** : Opérationnel : compte par compte, prochain geste
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les portes à qualifier et le prochain geste de chaque fil. Déconseille en le disant : mesurer le succès au volume de messages
- **Ouvre /briefing sur** : `actions`, `accountsToWatch`, `agenda`, `discoverAlerts`

### Business Developer / chasseur × 16 à 50 consultants

- **Produit d'abord** : Des opportunités qualifiées transmises proprement au Business Manager
- **Passe après (délégable, reste visible)** : L’arbitrage de cible et de marge passe après la qualification
- **Décisions en tête** : Quel segment travailler ; quand transmettre ; quel fil relancer
- **Routine qui ouvre la semaine** : Prospection multicanale tracée ; environ 1h30 de plans de compte par semaine (repère de méthode)
- **Indicateurs en tête** : Détecté → qualifié, rendez-vous tenus, accès rang 1 obtenus
- **Erreur signalée en premier** : Transmettre une opportunité non qualifiée ; ne pas tracer
- **Niveau de détail d'abord** : Opérationnel, avec l’angle et le contact de chaque fil
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les signaux à transformer en portes et les fils à relancer. Déconseille en le disant : compter les messages envoyés
- **Ouvre /briefing sur** : `actions`, `discoverAlerts`, `accountsToWatch`, `agenda`

### Business Developer / chasseur × plus de 50 consultants

- **Produit d'abord** : Des portes sur des comptes ciblés : rendez-vous qualifiés, accès rang 1, opportunités transmises
- **Passe après (délégable, reste visible)** : Le suivi des comptes signés passe après sa liste cible
- **Décisions en tête** : Quels comptes cibles d’abord ; quel persona ; quand transmettre
- **Routine qui ouvre la semaine** : Plans de compte hebdomadaires ; prospection multicanale tracée
- **Indicateurs en tête** : Opportunités qualifiées, accès rang 1, délai signal → action — avant le volume
- **Erreur signalée en premier** : Viser un grand compte à froid sans porte ; doubler un fil déjà porté
- **Niveau de détail d'abord** : Compte par compte, avec le propriétaire du compte nommé
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les signaux sur sa liste cible et les introductions à demander. Déconseille en le disant : relancer un compte porté par un collègue sans le prévenir
- **Ouvre /briefing sur** : `actions`, `discoverAlerts`, `accountsToWatch`, `slotProposalPriorityAccounts`

### Recruteur / talent × 0 à 5 consultants

- **Produit d'abord** : Le sourcing d’un besoin à la fois, souvent porté par le fondateur
- **Passe après (délégable, reste visible)** : La CVthèque étendue passe après le besoin ouvert
- **Décisions en tête** : Quel profil sourcer d’abord ; qui présenter
- **Routine qui ouvre la semaine** : Sourcing dès qu’un besoin est qualifié ; appels aux consultants en mission
- **Indicateurs en tête** : Délai besoin → shortlist, consultants disponibles
- **Erreur signalée en premier** : Sourcer sans besoin qualifié
- **Niveau de détail d'abord** : Par besoin : profil, disponibilité, prochaine étape
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : la shortlist du besoin ouvert. Déconseille en le disant : sourcer en masse sans besoin
- **Ouvre /briefing sur** : `preparations`, `agenda`, `actions`, `waitingOnOthers`

### Recruteur / talent × 6 à 15 consultants

- **Produit d'abord** : 1-2 CV qualifiés par besoin en 48-72 h (repère de méthode)
- **Passe après (délégable, reste visible)** : La relation commerciale du compte passe après la shortlist
- **Décisions en tête** : Quels profils sourcer ; qui présenter ; quand relancer un candidat
- **Routine qui ouvre la semaine** : CVthèque entretenue ; appels aux consultants, capteurs de besoins
- **Indicateurs en tête** : Délai besoin → shortlist, profils présentés par besoin, disponibilités connues
- **Erreur signalée en premier** : Ignorer les consultants comme source de besoins
- **Niveau de détail d'abord** : Par besoin : profil, disponibilité, prochaine étape
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les besoins ouverts sans shortlist et les candidats à relancer. Déconseille en le disant : prospecter les comptes à froid
- **Ouvre /briefing sur** : `preparations`, `agenda`, `waitingOnOthers`, `actions`

### Recruteur / talent × 16 à 50 consultants

- **Produit d'abord** : Une shortlist par besoin dans le délai, et une CVthèque active partagée avec les commerciaux
- **Passe après (délégable, reste visible)** : La négociation commerciale passe après la présentation du profil
- **Décisions en tête** : Priorité entre besoins ouverts ; qui présenter ; quand relancer
- **Routine qui ouvre la semaine** : Point besoins avec les Business Managers ; événements consultants
- **Indicateurs en tête** : Délai besoin → shortlist, conversion en entretien, besoins sans shortlist
- **Erreur signalée en premier** : Sourcer sur un besoin non qualifié ; perdre un candidat faute de relance
- **Niveau de détail d'abord** : Par besoin, puis par candidat
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les besoins sans shortlist et les consultants à appeler. Déconseille en le disant : mener la négociation commerciale
- **Ouvre /briefing sur** : `preparations`, `chainBlockers`, `agenda`, `waitingOnOthers`

### Recruteur / talent × plus de 50 consultants

- **Produit d'abord** : Le staffing des besoins prioritaires dans le délai, et la visibilité sur les disponibilités
- **Passe après (délégable, reste visible)** : La prospection des comptes passe après le staffing
- **Décisions en tête** : Priorité entre besoins ; anticipation des intercontrats ; qui présenter
- **Routine qui ouvre la semaine** : Revue hebdomadaire des besoins ; reconfirmation des disponibilités
- **Indicateurs en tête** : Délai de staffing, disponibilités connues, besoins non staffables
- **Erreur signalée en premier** : Découvrir un intercontrat le jour de la fin de mission
- **Niveau de détail d'abord** : Par besoin et par consultant disponible
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les besoins prioritaires sans shortlist et les fins de mission à reconfirmer. Déconseille en le disant : sourcer sans besoin qualifié
- **Ouvre /briefing sur** : `preparations`, `chainBlockers`, `criticalRisks`, `agenda`

### Opérations commerciales × 0 à 5 consultants

- **Produit d'abord** : Rôle rarement dédié à ce stade : trois champs de traçabilité tenus (compte, prochaine action, date)
- **Passe après (délégable, reste visible)** : L’outillage passe après la traçabilité de base
- **Décisions en tête** : Quel champ rendre obligatoire en premier
- **Routine qui ouvre la semaine** : Vendredi : contrôle des prochaines actions manquantes
- **Indicateurs en tête** : Comptes sans prochaine action, fraîcheur des données
- **Erreur signalée en premier** : Outiller avant d’avoir un flux
- **Niveau de détail d'abord** : Précis : champ manquant, fiche concernée
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les fiches sans prochaine action. Déconseille en le disant : brancher un outil de plus
- **Ouvre /briefing sur** : `waitingOnOthers`, `runningJobs`, `accountsToWatch`, `actions`

### Opérations commerciales × 6 à 15 consultants

- **Produit d'abord** : La traçabilité de base et un reporting simple du vendredi
- **Passe après (délégable, reste visible)** : L’arbitrage commercial passe au dirigeant
- **Décisions en tête** : Quels champs rendre obligatoires ; quel indicateur suivre en premier
- **Routine qui ouvre la semaine** : Mise à jour du fichier chaque vendredi ; hygiène des données
- **Indicateurs en tête** : Complétude des comptes, prochaines actions renseignées, 5 indicateurs au plus
- **Erreur signalée en premier** : Multiplier les indicateurs
- **Niveau de détail d'abord** : Précis sur les données : champs, écarts, doublons à signaler
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les fiches incomplètes et le reporting du vendredi. Déconseille en le disant : contacter des prospects
- **Ouvre /briefing sur** : `waitingOnOthers`, `runningJobs`, `chainBlockers`, `accountsToWatch`

### Opérations commerciales × 16 à 50 consultants

- **Produit d'abord** : Le fichier de pilotage (5 indicateurs au plus, chaque vendredi) qui rend le système duplicable
- **Passe après (délégable, reste visible)** : La prospection passe aux commerciaux
- **Décisions en tête** : Quels indicateurs suivre ; quel champ rendre obligatoire ; quel outil brancher
- **Routine qui ouvre la semaine** : Fichier mis à jour chaque vendredi ; contrôle de la traçabilité
- **Indicateurs en tête** : Complétude, fraîcheur, comptes sans prochaine action, saisies à l’heure
- **Erreur signalée en premier** : Collecter sans exploiter
- **Niveau de détail d'abord** : Champs, écarts, doublons à signaler
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les écarts à corriger avant le reporting. Déconseille en le disant : trancher un arbitrage commercial à la place du dirigeant
- **Ouvre /briefing sur** : `chainBlockers`, `waitingOnOthers`, `runningJobs`, `accountsToWatch`

### Opérations commerciales × plus de 50 consultants

- **Produit d'abord** : Une donnée commerciale fiable à l’échelle : pilotage par indicateurs, connecteurs tenus
- **Passe après (délégable, reste visible)** : La relation client passe aux équipes de compte
- **Décisions en tête** : Quel connecteur réparer d’abord ; quel indicateur simplifier dans le reporting
- **Routine qui ouvre la semaine** : Contrôle hebdomadaire des connecteurs et de la traçabilité ; reporting du vendredi
- **Indicateurs en tête** : Fraîcheur des données, connecteurs en panne, complétude par équipe
- **Erreur signalée en premier** : Multiplier les indicateurs ; laisser un connecteur en panne
- **Niveau de détail d'abord** : Par équipe, puis par champ
- **Laura propose d’abord / déconseille en le disant** : Propose d’abord : les connecteurs en panne et les doublons à signaler. Déconseille en le disant : fusionner des doublons sans validation
- **Ouvre /briefing sur** : `chainBlockers`, `runningJobs`, `waitingOnOthers`, `criticalRisks`
