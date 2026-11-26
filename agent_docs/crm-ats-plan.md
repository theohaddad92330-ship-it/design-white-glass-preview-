# CRM + ATS natifs — plan d'exécution

Source : `BELLUMAI_CRM_ATS_OPERATING_SYSTEM_ESN_VERSION_PRODUCTION_2026-08-16.pdf` (104 p.)
et la synthèse du workflow 7 agents du 16/08. Les deux se contredisaient sur l'objet
pivot ; les arbitrages ci-dessous tranchent, et priment sur les deux documents.

## Arbitrages Louis — 16/08/2026

| #   | Décision                | Choix retenu                                                                                                                                                                                                                                     |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Objet pivot             | **Un « Projet » unique** (`projects`). Le cycle `detected → potential → qualified → confirmed → won/lost/dormant` porte tout. Les rôles recherchés sont des sous-lignes `project_needs`, pas une table de postes autonome. Pas de table `deals`. |
| 2   | Navigation              | **Refonte complète à 9 entrées** (Aujourd'hui, Comptes, Projets, Talents, Missions, Actions, Copilote, Pilotage, Paramètres) avec absorption des surfaces selon §48 et redirects sur toutes les anciennes URLs.                                  |
| 3   | Cadence                 | **Une branche + une PR par tranche**, suite complète verte avant chaque merge dans `main` (auto-deploy prod).                                                                                                                                    |
| 4   | Prévision               | **Aucune probabilité, aucun forecast pondéré.** Pipeline par étape, montants réellement saisis, `sans_montant` compté à part.                                                                                                                    |
| 5   | Marge                   | **Coût chargé saisi à la main**, gated par une nouvelle permission `finance:read`. Non renseigné ⇒ « non mesurée », jamais 0 €.                                                                                                                  |
| 6   | Étapes                  | **5 étapes figées, libellés renommables par espace.** Nombre, ordre et `is_won`/`is_lost` non modifiables.                                                                                                                                       |
| 7   | Vivier                  | **Une table `consultants` + colonne `kind` (candidat\|consultant)**, purge paramétrable **plafonnée à 2 ans**, branchement dans privacy-export ET privacy-deletion.                                                                              |
| 8   | Revenue Protection      | **Jusqu'à « prêt à facturer »** : CRA, validation, montant préparatoire et bloqueurs. Bellum n'émet aucune facture légale.                                                                                                                       |
| 9   | Corps des messages      | **Stocké intégralement** dans `activities` (revirement assumé de la règle antérieure). Le copilote, lui, continue de ne JAMAIS remonter de corps — la garde existante est conservée.                                                             |
| 10  | Reprise CRM tiers       | **Dans le chantier** : imports paginés Salesforce/Pipedrive/Attio, `sync_links`, écran de réconciliation, dry-run, snapshot avant première écriture.                                                                                             |
| 11  | Gating                  | Nouvelles features **`crm_native`** et **`ats_native`**, ouvertes par défaut, grille posée au back-office.                                                                                                                                       |
| 12  | Backfill                | `opportunities` → `projects` **avec état de vérité** : `nouveau→detected`, `confirme→qualified`, `obsolete→dormant`, `transforme`/`converti`→`confirmed`. Aucun projet promu par la migration.                                                   |
| 13  | Automatisation niveau 5 | **Trois playbooks**, relance client incluse (envoi automatique), sous garde-fous : arrêt dès réponse, une relance max par règle, opt-out vérifié, quiet hours, plafond quotidien, opt-in par espace avec bouton stop.                            |

## Règles permanentes appliquées à chaque tranche

- UI livrée **FR + EN**.
- Seed `demo-dataset.ts` + classement dans `demo-coverage.ts` (seedée OU vide à dessein avec sa raison).
- Une entrée changelog FR+EN par tranche user-facing.
- TDD : le test avant le code ; suite complète verte avant merge.
- Aucune donnée inventée : un champ inconnu vaut `null`, jamais une valeur de remplissage.
- Provenance : `human > connector > pipeline > model`. Un blanc n'écrase jamais une valeur.

## Tranches

| #   | Nom                       | Contenu                                                                                                                                        | Objets créés                                                                                            |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| T0  | Socle de vérité           | Provenance par champ, journal d'audit, notes polymorphes, édition des fiches compte/contact, création unitaire, soft-delete, exports de listes | `field_provenance`, `record_field_audit`, `notes`                                                       |
| T1  | Projet (pivot)            | `projects` + `project_needs` + étapes + backfill `opportunities` + écran Projets (liste, kanban, détail) + redirects `/needs`                  | `projects`, `project_needs`, `project_contacts`, `pipeline_stage_labels`, `loss_reasons`                |
| T2  | Activités & timeline      | Capture messagerie/agenda/téléphonie, corps stocké, idempotence `(workspace, source, external_id)`, timeline compte/contact/projet             | `activities`, `activity_participants`                                                                   |
| T3  | Tâches & Aujourd'hui      | Tâches libres, vue « Aujourd'hui » unifiée (tâches ∪ plan ∪ relances ∪ RDV ∪ positionnements en attente)                                       | `tasks`                                                                                                 |
| T4  | Navigation & capacités    | Nav 9 entrées, absorptions §48, redirects, registre de capacités (état réel par fonctionnalité/connecteur)                                     | `capability_states` (lecture)                                                                           |
| T5  | Talents                   | `kind` candidat, compétences typées, documents (CV) + extraction, recherche paginée, purge 2 ans, privacy export/deletion                      | `skills`, `consultant_skills`, `consultant_documents`                                                   |
| T6  | Matching & positionnement | Matching multi-axes explicable, shortlist, positionnement (CV envoyé), entretiens, feedback structuré, CV versionné                            | `submissions`, `interviews`, `submission_feedback`                                                      |
| T7  | Missions & staffing       | Câblage `mission_assignments`, écran Missions, disponibilité dérivée, alertes T-60/T-30/T-15, coût chargé + `finance:read`, marge              | `mission_commercial_terms`                                                                              |
| T8  | Revenue Protection        | Collecte CRA, validation/contestation, montant préparatoire, bloqueurs, relances graduées                                                      | `invoice_readiness`                                                                                     |
| T9  | Reprise & cohabitation    | `sync_links`, journal par enregistrement, imports paginés SF/Pipedrive/Attio, CSV généralisé, écran de réconciliation, snapshot                | `sync_links`, `sync_runs`, `sync_record_events`                                                         |
| T10 | Gouvernance               | Écritures sortantes gouvernées (CRM+ATS), Approval Center, vues sauvegardées, champs personnalisés bornés, doublons proposés                   | `outbound_write_requests`, `saved_views`, `custom_field_defs`, `custom_field_values`, `duplicate_pairs` |
| T11 | Playbooks & cockpit       | Trois playbooks niveau 5, file d'intervention manager, dictionnaire KPI                                                                        | `interventions`                                                                                         |

## État — chantier CLOS le 17/08/2026

Les douze tranches sont mergées dans `main`, déployées en production et vérifiées
écran par écran sur Chrome.

| #   | PR   | Vérifié en production                                                             |
| --- | ---- | --------------------------------------------------------------------------------- |
| T0  | #944 | Fiches éditables, badge de provenance, journal d'écriture                         |
| T1  | #945 | Écran Projets, 5 colonnes du pipe, 287 projets détectés comptés à part            |
| T2  | #948 | Onglet Historique d'un dossier, saisie manuelle, suppression                      |
| T3  | #949 | Bloc « Tes tâches » de Ma journée, échéance, achèvement                           |
| T4  | #950 | Neuf entrées de nav + les dix écrans de Réglages                                  |
| T5  | #953 | Écran Vivier (état vide VRAI : aucun consultant dans l'espace)                    |
| T6  | #955 | Positionnements (aucun dans l'espace — état vide vrai)                            |
| T7  | #956 | Écran Missions, onglet « En cours »                                               |
| T8  | #957 | Onglet « Prêt à facturer » : mois, préparés, bloqués, mention « pas une facture » |
| T9  | #958 | Reprise CRM : simulation → « 200 à créer · il reste des pages »                   |
| T10 | #959 | Champs personnalisés 0/10, doublons repérés                                       |
| T11 | #960 | Trois playbooks (éteints), file « À traiter », dictionnaire des indicateurs       |

### Défauts trouvés EN PRODUCTION, pas par les tests

Six, et c'est la leçon la plus utile du chantier : une suite verte ne dit rien de
la navigation, du cache, de la forme d'une réponse ni du contrat d'un fournisseur.

| PR   | Défaut                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| #946 | Écran de détail projet vide sur une réponse pourtant à 200                                             |
| #947 | Compteur divergent entre deux zones d'un même écran                                                    |
| #951 | Cache IndexedDB sans `buster` : « Ma journée » plantait sur une charge utile d'avant la tranche        |
| #952 | « Intégrations » disparue de la navigation — un onglet déclaré ne s'affiche pas s'il n'est pas rendu   |
| #954 | `staleTime` global de 5 min sur un cache persisté : la timeline restait vide malgré un 200 rempli      |
| #961 | La reprise demandait 200 contacts, HubSpot en rend 100 au maximum → l'import échouait sur tout portail |

### Correctifs de robustesse livrés dans la foulée

- **Débit fournisseur** : `Promise.all` non borné sur soixante lectures Gmail →
  « Too many concurrent requests for user », qui faisait tomber la recherche
  entière (routine « relances sans réponse » muette le 17/08 au matin). Remplacé
  par `mapWithConcurrency` + `retryOnThrottle` (`common/util/concurrency.ts`),
  appliqué à la messagerie, à la couche zéro et aux lectures d'agenda.
- **Occurrence de routine perdue** : la fenêtre d'exécution valait une heure, sans
  rattrapage. Un redémarrage pendant cette heure faisait perdre l'occurrence
  définitivement et sans trace (routine de 18 h absente le 15/08). Fenêtre portée
  à trois heures — bornée, parce qu'un brief du matin reçu à 23 h est pire que pas
  de brief.

### Parité démo du volet delivery — TRANCHÉE et livrée

Missions, Positionnements et Prêt à facturer s'ouvraient VIDES sur le lien de
démonstration : la moitié ATS du produit ne se montrait pas. Arbitrage Louis du
17/08 : **un client FICTIF dédié**, plutôt que d'attacher une mission à l'une des
cinq sociétés réelles (ce qui affirmerait une relation commerciale inexistante)
ou de laisser les écrans vides.

`DEMO_DELIVERY_CLIENT` porte un besoin gagné, trois positionnements (dont un
`no_feedback`, le motif compté à part), deux missions — une prête à facturer, une
bloquée faute de relevé, et sans date de fin pour montrer le cas que le produit
refuse d'alerter. Nom portant « client d'exemple », domaine en `.example`
(RFC 2606), marqué `customer` donc absent des vues de conquête.

Deux gardes ajoutées au passage :

- la couverture démo vérifiait qu'une DÉCISION avait été prise, jamais qu'elle
  avait été TENUE — une table déclarée seedée sans `INSERT` passait au vert ;
- la page d'accueil du lien annonçait « les entreprises, contacts et signaux
  affichés ici sont fictifs » alors que les cinq dossiers portent de vraies
  sociétés depuis le passage aux comptes réels. Le test passait sur `/fictif/`
  sans regarder ce que le mot qualifiait.

### Audit du 18/08 — deux moitiés manquantes, trouvées en relisant le rapport

Le chantier a été déclaré clos le 17/08 sur la foi des douze tranches. Une
relecture du PDF contre le code a trouvé deux fonctionnalités livrées **à
moitié** : l'écran, la table, le contrat et les tests existaient ; l'appelant,
non. Aucune suite verte ne pouvait le voir, parce qu'un test appelle toujours la
méthode qu'il teste.

| Fonctionnalité                | Ce qui manquait                                     | Ce que l'écran disait   |
| ----------------------------- | --------------------------------------------------- | ----------------------- |
| Playbooks niveau 5 (§43, #13) | `evaluate()` et `reserveSend()` sans aucun appelant | « armé » — sans envoyer |
| Doublons (T10, §44)           | `proposeDuplicates()` sans aucun appelant           | « aucun doublon »       |

Les deux sont désormais branchés, et le rapport gagne au passage ce qu'il
exigeait et qui n'existait nulle part :

- **`PlaybookSendSweeper`** exécute les playbooks armés. L'envoi passe par
  `MailboxService.sendBatch` — jamais un second chemin — donc il hérite de
  l'opt-out par destinataire, de la déduplication, de l'arrêt après trois échecs
  et de la signature du compte connecté. Réservation AVANT envoi. Interrupteur :
  `PLAYBOOKS_SEND_DISABLED=true`.
- **La simulation** (`GET /playbooks/:playbook/dry-run` + bouton « Simuler ») :
  exigée par le §43 pour tout niveau 4-5 et par la porte **G5** du §53, elle
  n'existait pour aucune automatisation. Elle juge COMME SI le playbook était
  armé, n'écrit rien, et partage la source de cibles du balayeur — une
  simulation qui calculerait sa propre liste montrerait autre chose que ce qui
  part.
- **`DuplicatesSweeper`** alimente `duplicate_pairs` depuis les contacts natifs,
  avec le détecteur pur déjà testé. Les comptes restent hors périmètre, et c'est
  écrit : les clés du détecteur ne décrivent pas une entreprise.
- **`wired-write-paths.spec.ts`** : la garde qui empêche la récidive. Elle lit
  les sources et échoue si l'un de ces chemins d'écriture perd son appelant.

### Ce qui reste, et qui n'est pas du code

1. **Reprise HubSpot réelle** : la simulation annonce 200 contacts prêts. Le clic
   « Importer pour de bon » appartient à l'opérateur.
2. **Armement des playbooks** : livrés éteints, ils le restent tant que personne
   ne les arme — et depuis le 18/08, les armer déclenche RÉELLEMENT des envois.
   Le bouton « Simuler » de l'écran montre d'abord, sur les vraies données, qui
   recevrait quoi et qui serait écarté ; c'est la lecture à faire avant le clic.
3. **Recyclage des salles de démonstration** : le nouveau client d'exemple
   n'apparaît que dans une salle RE-SEEDÉE. Les salles se remettent à neuf à
   l'expiration de leur bail (30 min) — rien à faire, mais une salle consultée
   dans l'heure qui suit le déploiement peut encore montrer l'ancien jeu.
