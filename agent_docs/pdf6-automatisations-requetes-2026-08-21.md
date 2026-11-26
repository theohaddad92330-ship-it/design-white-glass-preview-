# PDF 6/9 — Automatisations et requêtes utilisateurs — 21/08/2026

**Source** : `agent_docs/sources/pdf6-automatisations-requetes-2026-08-21.pdf` (10 pages, ORION,
daté du 19/08/2026). Le dossier `sources/` est gitignoré — le PDF n'est pas committé.

**Prérequis annoncés par le document** : PDF 1 (niveaux, orchestration, canaux), PDF 2 à 5 (objets
métier). Les quatre sont traités et en prod.

---

## 0. Ce qu'il faut savoir avant de le lire

**Collision de numérotation, la troisième de la série.** Le PDF 6 pose ses questions sous les
identifiants D3, D8, D31, D32 et D33. Les trois derniers sont **déjà pris** par le PDF 5
(`pdf5-missions-cra-facturation-2026-08-20.md` §4 : D31 périmètre du board, D32 Factur-X, D33
niveau de recouvrement) — que j'avais moi-même renumérotés pour la même raison. D3 et D8 sont
présentés comme des « rappels » du PDF 1, mais le tracker du PDF 1 ne les a jamais tranchés : ils
sont donc ouverts, pas rappelés. Les cinq questions du PDF 6 sont renumérotées **D38 à D42**.

**Le document renvoie explicitement ailleurs pour trois blocs** : les objets métier (PDF 2 à 5),
les états des connecteurs (PDF 7) et les écrans de pilotage (PDF 8). Sa famille E — 14
automatisations mission/CRA/facturation — est déclarée « reprise du PDF 5 §12, non redupliquée
ici ». Elle sort donc de l'inventaire de ce chantier et reste dans celui du PDF 5.

**Ses marqueurs `[Confirmé — repo]` sont à vérifier un par un**, comme sur les cinq PDF
précédents : ceux du PDF 1 décrivaient le dépôt d'avant le chantier T0→T11 et trois affirmations
sur cinq étaient fausses ; ceux du PDF 3 en comptaient trois fausses également. Le PDF 6 en pose
une vingtaine, dont plusieurs sur des automatisations nommées.

---

## 1. Inventaire

### §1 — Périmètre (p.1)

| #   | Exigence                                                        | Statut  | Preuve / raison                                                                                      |
| --- | --------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Le format complet d'une automatisation (12 attributs)           | PARTIEL | `workflow-catalog.ts` porte 9 attributs sur 12, `routine-catalog.ts` 1 sur 12                        |
| 2   | Le catalogue des 60 automatisations                             | PARTIEL | 26 routines (`routine-catalog.ts:30`) + 5 workflows (`workflow-catalog.ts:44`) ; ni les mêmes, ni 60 |
| 3   | Les 10 workflows de brouillons Gmail / Outlook / Teams          | PARTIEL | 2 sur 10 partiellement outillés, aucun complet                                                       |
| 4   | Le moteur de chaînes ordonnées                                  | ABSENT  | aucune occurrence de `chain_key`/`chain_run`/`nextPosition`                                          |
| 5   | Le compteur de proactivité                                      | ABSENT  | aucun plafond de notification par utilisateur                                                        |
| 6   | Les 285 requêtes utilisateur mappées sur les outils du copilote | PARTIEL | 12 outils copilote (`chat_tools.py:423`) ; 17 des 23 noms du PDF n'existent pas                      |

### §2 — Le format d'une automatisation, 12 attributs (p.1)

Règle posée : « une automatisation qui n'en renseigne pas 12 n'est pas spécifiée ».

| #   | Attribut                | Contenu attendu                                                    | Statut  | Preuve                                                                                              |
| --- | ----------------------- | ------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------- |
| 7   | `ID`                    | identifiant stable                                                 | LIVRÉ   | `action-os.ts:218` (`key`) · `routines.ts:124`                                                      |
| 8   | `Déclencheur`           | événement ou horaire, **dans le fuseau de l'utilisateur**          | PARTIEL | `action-os.ts:224` + `workflowTriggerSchema:197` ; côté routines, temporel seul (`routines.ts:129`) |
| 9   | `Condition`             | ce qui doit être vrai pour qu'elle s'exécute                       | ABSENT  | aucun champ `condition` dans les deux catalogues ; assumé en commentaire `workflow-catalog.ts:40`   |
| 10  | `Donnée utilisée`       | ce qu'elle lit                                                     | ABSENT  | seul `intent` en texte libre (`action-os.ts:177`)                                                   |
| 11  | `Connecteur nécessaire` | capacité requise ; si absente, elle ne s'exécute pas **et le dit** | LIVRÉ   | `action-os.ts:179` (`capability`) · `routines.ts:97` (`routineRequirementSchema`)                   |
| 12  | `Action préparée`       | ce qu'elle produit sans effet externe                              | LIVRÉ   | `action-os.ts:175-177`                                                                              |
| 13  | `Validation humaine`    | oui / non, et à quel niveau                                        | LIVRÉ   | `action-os.ts:226` (`minimumLevel`) + `approvalRequestSchema:238`                                   |
| 14  | `Niveau d'autonomie`    | N0 à N5                                                            | LIVRÉ   | `action-os.ts:226` → `automationLevelSchema:37`                                                     |
| 15  | `Risque`                | ce qui peut mal tourner                                            | LIVRÉ   | `action-os.ts:184` (`risk`) + `:186` (`sensitiveFamily`)                                            |
| 16  | `Fallback`              | ce qu'elle fait quand elle ne peut pas faire ce qui est prévu      | PARTIEL | `retryPolicySchema` (`action-os.ts:118`) est une REPRISE, pas un chemin alternatif                  |
| 17  | `Log`                   | ce qui est écrit et où c'est consultable                           | PARTIEL | `workflowRunSchema:288` au runtime ; pas un attribut du catalogue                                   |
| 18  | `Critère d'acceptation` | comment on prouve qu'elle marche                                   | LIVRÉ   | `action-os.ts:188` (`expectedResult`)                                                               |

### §3 — Niveaux et garde-fous (p.1-2)

| #   | Exigence                                                                                                                                                                                                                           | Statut  | Preuve                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| 19  | N0 Conseil — aucune écriture, aucune validation                                                                                                                                                                                    | LIVRÉ   | `action-os.ts:37-51`                                                                |
| 20  | N1 Préparation — brouillon, tâche proposée, shortlist, document ; aucune validation                                                                                                                                                | LIVRÉ   | idem                                                                                |
| 21  | N2 Approbation simple — email, écriture CRM, événement, enrichissement ; un clic                                                                                                                                                   | LIVRÉ   | idem                                                                                |
| 22  | N3 Approbation manager — volume, dépense, changement de propriétaire, export sensible ; **double** validation                                                                                                                      | LIVRÉ   | `approval-policy.ts:76-111` (`decideApproval`)                                      |
| 23  | N4 Automatique borné — digest, rappel, rafraîchissement, sync non destructive ; opt-in + limites                                                                                                                                   | LIVRÉ   | idem                                                                                |
| 24  | N5 Autonomie étendue — actions récurrentes atteignant un client ; historique fiable + audit + arrêt d'urgence                                                                                                                      | LIVRÉ   | idem                                                                                |
| 25  | Garde-fou N5 n°1 — arrêt dès réponse, **définitif**                                                                                                                                                                                | LIVRÉ   | `playbook.ts:128` ; runtime `playbook-send.sweeper.ts:128`                          |
| 26  | Garde-fou N5 n°2 — une relance maximum par règle, **pas de cadence en autonome**                                                                                                                                                   | LIVRÉ   | `playbook.ts:51` (`PLAYBOOK_MAX_PER_TARGET = 1`)                                    |
| 27  | Garde-fou N5 n°3 — opt-out vérifié à chaque envoi, **jamais en cache**                                                                                                                                                             | LIVRÉ   | `playbook.ts:130` ; lecture en base par envoi `playbook-send.sweeper.ts:122`        |
| 28  | Garde-fou N5 n°4 — heures calmes 8 h-19 h, jours ouvrés                                                                                                                                                                            | LIVRÉ   | `playbook.ts:44-47` + `withinQuietHours:150` ; cron borné `*/30 8-18 * * 1-5`       |
| 29  | Garde-fou N5 n°5 — plafond quotidien par espace : **25 envois**                                                                                                                                                                    | LIVRÉ   | `playbook.ts:49` (`PLAYBOOK_DAILY_CAP = 25`)                                        |
| 30  | Garde-fou N5 n°6 — opt-in par espace, avec bouton d'arrêt                                                                                                                                                                          | LIVRÉ   | `playbook.ts:55` (défaut `false`) ; écran `PlaybooksPanel.tsx`                      |
| 31  | Les 6 garde-fous sont **non désactivables**                                                                                                                                                                                        | LIVRÉ   | aucun réglage ne les désactive ; chaque refus est nommé (`playbook.ts:78-89`)       |
| 32  | Familles toujours sensibles : `bulk_send`, `multichannel_send`, `bulk_delete`, `bulk_update`, `costly_enrichment`, `data_export`, `client_commitment` — jamais sous N2, franchissent N3 au-delà d'un seuil de volume ou de dépense | PARTIEL | les 7 existent (`action-os.ts:76-85`) ; **5 sur 7 sans aucun porteur** au catalogue |

### §4 — Catalogue, 60 automatisations (p.2-4)

Critère d'acceptation générique, applicable à toutes : **l'automatisation ne s'exécute pas si son
connecteur est absent, et elle le dit ; elle n'échoue jamais en silence.**

#### Famille A — Journée et agenda (10)

| #   | ID  | Déclencheur                      | Condition           | Niv. | Connecteur          | Action                                      | Fallback                                                 | Statut  | Preuve                                                                                                                 |
| --- | --- | -------------------------------- | ------------------- | ---- | ------------------- | ------------------------------------------- | -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 33  | A01 | 08:30 quotidien                  | espace actif        | N4   | agenda + messagerie | brief du jour                               | brief partiel avec les blocs disponibles                 | PARTIEL | `routine-catalog.ts:31` (`daily_briefing`) — heure 08:00, pas 08:30                                                    |
| 34  | A02 | T-24 h RDV externe               | domaine externe     | N2   | messagerie          | confirmation + ordre du jour                | brief consultable seulement                              | ABSENT  | `meeting_prep` notifie l'utilisateur, n'écrit rien à l'invité                                                          |
| 35  | A03 | T-60 min RDV                     | tout RDV            | N4   | agenda              | checklist de préparation                    | —                                                        | LIVRÉ   | `routine-catalog.ts:229` (`meeting_checklist`, `continuous`)                                                           |
| 36  | A04 | +30 min après RDV                | terminé             | N2   | agenda + messagerie | CR + next steps + brouillon + tâche J+2     | CR à partir du titre et des participants, **et le dire** | PARTIEL | routine notifie (`:247`) ; workflow écrit (`workflow-catalog.ts:99`) — les deux non branchés, déclencheur AVANT le RDV |
| 37  | A05 | annulation par un invité externe | —                   | N2   | agenda + messagerie | 3 créneaux + brouillon                      | notification simple                                      | PARTIEL | `routine-catalog.ts:265` + `routine-executors.ts:484` ; nombre de créneaux non figé à 3                                |
| 38  | A06 | 17:00, aucun RDV client sous 3 j | —                   | N1   | —                   | proposer 3 blocs de prospection             | —                                                        | LIVRÉ   | `routine-catalog.ts:121` (`empty_pipeline_alert`, `defaultHour: 17`)                                                   |
| 39  | A07 | événement créé sans visio        | agenda en écriture  | N4   | agenda              | ajouter le lien visio                       | ne rien promettre si non supporté                        | ABSENT  | lecture seule du lien visio ; aucune écriture d'événement                                                              |
| 40  | A08 | conflit d'agenda                 | chevauchement       | N1   | agenda              | proposer un décalage                        | —                                                        | PARTIEL | `routine-catalog.ts:103` signale le conflit ; aucun décalage proposé (`href: null`)                                    |
| 41  | A09 | RDV externe créé                 | —                   | N4   | agenda              | titre normalisé « Société + Sujet »         | —                                                        | ABSENT  | —                                                                                                                      |
| 42  | A10 | fin de journée                   | tâches non traitées | N4   | —                   | « il te reste X actions, je les reporte ? » | —                                                        | PARTIEL | `routine-executors.ts:186` compte les actions, mais au MATIN ; aucune routine de fin de journée                        |

#### Famille B — Messagerie et relances (10)

| #   | ID  | Déclencheur                       | Condition                      | Niv.    | Connecteur            | Action                                      | Fallback                    | Statut  | Preuve                                                                                      |
| --- | --- | --------------------------------- | ------------------------------ | ------- | --------------------- | ------------------------------------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| 43  | B01 | fil sortant sans réponse > 7 j    | hors internes, opt-out vérifié | N2      | messagerie            | brouillon de relance                        | tâche interne avec le texte | PARTIEL | `routine-catalog.ts:67` ; ne prépare aucun brouillon avec angle nouveau                     |
| 44  | B02 | réponse positive détectée         | classification                 | N2      | messagerie + agenda   | proposer un créneau + maj CRM               | —                           | PARTIEL | `routine-catalog.ts:85` notifie ; ne propose ni créneau ni maj CRM                          |
| 45  | B03 | absence de bureau détectée        | date extraite                  | N4      | messagerie            | replanifier la relance                      | repli J+7 si date illisible | ABSENT  | la lecture d'absence existe (`google-mail.backend.ts:221`) ; rien ne replanifie             |
| 46  | B04 | bounce                            | —                              | N4      | messagerie            | invalider le contact, retirer des séquences | **jamais de suppression**   | PARTIEL | motif `bounce` prévu (`email-suppression.entity.ts:22`) ; **aucun détecteur ne l'écrit**    |
| 47  | B05 | opt-out reçu                      | —                              | N6 int. | —                     | liste de suppression, définitif             | irréversible                | LIVRÉ   | `email-suppressions` (`1784901000000`) ; survit au reset démo                               |
| 48  | B06 | 3 relances sans réponse           | —                              | N1      | —                     | proposer close-loop ou changement de canal  | —                           | LIVRÉ   | `contact-cadence.ts:26` (`close_loop`) + `outreach-sequence.ts:218`                         |
| 49  | B07 | non-lus externes le matin         | —                              | N2      | messagerie            | brouillons de réponse par fil               | —                           | PARTIEL | `briefing-actions.ts:101` (`unread`) ; pas de routine dédiée ni de filtre « externe »       |
| 50  | B08 | mail contenant un AO              | PJ + mots-clés                 | N2      | messagerie + stockage | résumé + dossier + tâches J-5/J-2/H-4       | —                           | LIVRÉ   | `routine-catalog.ts:283` (`tender_watch`)                                                   |
| 51  | B09 | mail contenant un CV              | PJ                             | N3      | messagerie            | parser, dédupliquer, fiche `needs_review`   | CV illisible : le dire      | PARTIEL | la chaîne existe hors messagerie (`cv-intake.service.ts:25`) ; la routine SIGNALE seulement |
| 52  | B10 | mail « contrat » ou « signature » | —                              | N2      | messagerie            | statut + brouillon de relance + tâche       | —                           | LIVRÉ   | `routine-catalog.ts:301` (`contract_watch`)                                                 |

#### Famille C — CRM et pipeline (10)

| #   | ID  | Déclencheur                             | Condition        | Niv. | Connecteur       | Action                                | Fallback                        | Statut  | Preuve                                                                                            |
| --- | --- | --------------------------------------- | ---------------- | ---- | ---------------- | ------------------------------------- | ------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| 53  | C01 | RDV externe terminé                     | CRM connecté     | N3   | CRM + agenda     | log meeting + note + tâche J+2        | tâche interne                   | PARTIEL | `workflow-catalog.ts:111` ; déclencheur `meeting_upcoming` ≠ « terminé », pas d'idempotence       |
| 54  | C02 | réponse email reçue                     | contact connu    | N2   | messagerie       | proposer la maj du statut du contact  | —                               | PARTIEL | `routine-catalog.ts:85` notifie ; aucune proposition de mise à jour                               |
| 55  | C03 | compte suivi sans prochaine action 30 j | —                | N1   | —                | proposer une action + intervention    | —                               | LIVRÉ   | `playbook.ts:251` + `intervention-rules.ts` (`account_untouched`) + `interventions.sweeper.ts:62` |
| 56  | C04 | projet immobile > SLA d'étape           | par étape        | N1   | —                | alerte + revue                        | —                               | ABSENT  | `stage_entered_at` existe ; aucun seuil par étape de pipe                                         |
| 57  | C05 | mercredi 18:00                          | CRM connecté     | N1   | CRM              | proposer les fusions de doublons      | jamais exécuté                  | LIVRÉ   | `routine-catalog.ts:355` (mercredi 18:00) + `crm-core/duplicates.sweeper.ts:59`                   |
| 58  | C06 | 1er jour ouvré du mois                  | —                | N1   | —                | hygiène de données mensuelle          | —                               | LIVRÉ   | `routine-catalog.ts:413` + `routine-schedule.ts:54` (`isFirstBusinessDay`)                        |
| 59  | C07 | contact change de poste                 | preuve datée     | N1   | —                | proposer maj + chercher le successeur | jamais d'écrasement sans preuve | ABSENT  | évoqué en commentaire (`contact.ts:217`), jamais codé                                             |
| 60  | C08 | projet passe `won`                      | —                | N2   | —                | proposer la création de la mission    | —                               | LIVRÉ   | `stage-move.ts:105` + exécution réelle `projects.controller.ts:441` (livré avant-hier)            |
| 61  | C09 | 10:00 quotidien                         | leads à relancer | N2   | messagerie + CRM | brouillons par segment                | —                               | ABSENT  | —                                                                                                 |
| 62  | C10 | J+7 après « proposition envoyée »       | aucune activité  | N2   | messagerie       | brouillon + tâche                     | —                               | PARTIEL | `routine-catalog.ts:337` (`stalled_proposals`) ; lit l'activité CRM externe, pas l'étape du pipe  |

#### Famille D — Talent et matching (10)

| #   | ID  | Déclencheur                             | Condition       | Niv. | Connecteur | Action                                             | Fallback                  | Statut  | Preuve                                                                                                       |
| --- | --- | --------------------------------------- | --------------- | ---- | ---------- | -------------------------------------------------- | ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| 63  | D01 | besoin passe `open`                     | ≥ 1 compétence  | N1   | —          | pré-matching + notification                        | vivier vide : le dire     | ABSENT  | le moteur existe et reste manuel ; aucun appelant automatique                                                |
| 64  | D02 | nouveau talent `qualified`              | —               | N1   | —          | besoins où il dépasse le seuil                     | —                         | PARTIEL | l'état `qualified` existe (`cv-intake.service.ts:36`) ; aucune automatisation sur la transition              |
| 65  | D03 | mission à T-30                          | date fiable     | N1   | —          | matching inverse + repositionnement                | sans date : rien          | PARTIEL | alerte T-30 (`routine-catalog.ts:175`) et matching inverse (`inverse-matching.service.ts`) ne se parlent pas |
| 66  | D04 | intercontrat > 30 j                     | —               | N1   | —          | push ciblé                                         | —                         | PARTIEL | `routine-catalog.ts:193` (`bench_alert`) notifie une liste, ne pousse rien                                   |
| 67  | D05 | besoin sans shortlist 5 j               | —               | N1   | —          | alerte + proposer d'assouplir un critère **nommé** | —                         | PARTIEL | la donnée existe (`open-needs.ts:47`) ; aucun seuil de 5 jours, aucun déclencheur                            |
| 68  | D06 | disponibilité déclarée > 60 j           | —               | N2   | messagerie | demande de confirmation                            | 1 relance                 | PARTIEL | segment `to_revalidate` ; **`SEGMENT_ACTION` est du code mort** (`talent-pool-segments.ts:50`)               |
| 69  | D07 | consentement < 30 j                     | candidat        | N2   | messagerie | demande de renouvellement                          | **obligatoire**           | PARTIEL | `talent-consent.ts:25` (`CONSENT_WARNING_DAYS = 30`) ; aucune demande envoyée                                |
| 70  | D08 | consentement expiré                     | —               | N6   | —          | purge selon politique                              | irréversible, journalisée | PARTIEL | état `expired` existe ; la purge est ancrée sur l'inactivité, pas sur le consentement                        |
| 71  | D09 | positionnement sans retour J+3 puis J+7 | opt-out vérifié | N5   | messagerie | relance client                                     | 6 garde-fous              | ABSENT  | offsets J+3/J+7 en template outreach, sur un contact — pas sur un positionnement                             |
| 72  | D10 | positionnement sans retour 14 j         | —               | N1   | —          | intervention manager, marqué `no_feedback`         | —                         | LIVRÉ   | `playbook.ts:244` + `intervention-rules.ts:78` + `interventions.sweeper.ts:62`                               |

#### Famille E — Mission, CRA, facturation (14)

| #   | Exigence                                                                                                              | Statut         | Preuve                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| 73  | `MIS-01` à `MIS-12` et `FIN-01` à `FIN-12` — **reprises du PDF 5 §12, non redupliquées ici** par le document lui-même | HORS PÉRIMÈTRE | traitées dans `pdf5-missions-cra-facturation-2026-08-20.md` |

#### Famille F — Capitalisation et pilotage (10)

| #   | ID  | Déclencheur                                 | Niv. | Connecteur | Action                                              | Fallback                     | Statut  | Preuve                                                                                       |
| --- | --- | ------------------------------------------- | ---- | ---------- | --------------------------------------------------- | ---------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 74  | F01 | REX collecté                                | N1   | —          | analyse, 1 à 3 preuves candidates                   | consentement jamais déduit   | PARTIEL | file `capitalisation.controller.ts:86` qu'on TIRE ; aucun déclencheur                        |
| 75  | F02 | mission terminée +30 j, satisfaction élevée | N2   | messagerie | demander un témoignage                              | 1 demande                    | PARTIEL | témoignages existent ; ni délai +30 j, ni condition de satisfaction, ni déclencheur          |
| 76  | F03 | email de remerciement détecté               | N1   | messagerie | proposer la création d'un REX                       | jamais de publication        | ABSENT  | —                                                                                            |
| 77  | F04 | consentement de preuve expirant < 30 j      | N1   | —          | signaler, proposer le renouvellement                | preuve redescend à `interne` | ABSENT  | `consent_reference` est un texte libre ; aucune date d'expiration à surveiller               |
| 78  | F05 | AO perdu                                    | N2   | messagerie | demander le motif au client                         | ton neutre, pas de relance   | PARTIEL | `stage-move.ts:114` exige le motif au déplacement manuel ; rien côté AO                      |
| 79  | F06 | balayage quotidien                          | N1   | —          | file d'intervention                                 | —                            | LIVRÉ   | `interventions.sweeper.ts:62` (`@Cron('10 6 * * *')`) + 6 natures                            |
| 80  | F07 | lundi 08:15                                 | N4   | —          | brief de semaine                                    | —                            | PARTIEL | `routine-catalog.ts:395` (`monday_kickstart`) — 08:00, pas 08:15                             |
| 81  | F08 | vendredi 16:00 et 11:00                     | N4   | —          | recap et prévisionnel                               | —                            | LIVRÉ   | `routine-catalog.ts:139` (vendredi 16 h) et `:157` (vendredi 11 h) — aux deux heures exactes |
| 82  | F09 | 1er jour du trimestre                       | N1   | —          | revue trimestrielle                                 | —                            | LIVRÉ   | `routine-catalog.ts:431` (`quarterly`) + 1er jour OUVRÉ (`routine-schedule.ts:93`)           |
| 83  | F10 | veille d'un rituel                          | N4   | —          | préparer l'ordre du jour avec les données du moment | —                            | ABSENT  | aucune occurrence de « rituel » / « ordre du jour »                                          |

#### Famille G — Intégrations et données (6)

| #   | ID  | Déclencheur                         | Niv. | Action                                                          | Statut  | Preuve                                                                                                     |
| --- | --- | ----------------------------------- | ---- | --------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| 84  | G01 | jeton expiré                        | N4   | mettre en pause les workflows dépendants, notifier **une fois** | PARTIEL | l'état `authorization_expired` existe (`tool-registry.ts:144`) ; aucune mise en pause, aucune notification |
| 85  | G02 | portée retirée                      | N4   | passer les capacités concernées en `portee_manquante`           | PARTIEL | `read_only`/`limited_write` déclarés ; **`deriveCapabilityState` n'a aucun appelant**                      |
| 86  | G03 | test de santé quotidien             | N4   | vérifier chaque capacité, mettre à jour l'état                  | ABSENT  | `status.monitor.ts` sonde db/redis/ia — de l'infra, pas des connecteurs                                    |
| 87  | G04 | dernière sync > seuil               | N1   | proposer une resynchronisation                                  | PARTIEL | `CAPABILITY_SYNC_LATE_DAYS = 30` déclaré ; aucun consommateur, aucun geste de resync                       |
| 88  | G05 | limite de débit atteinte            | N4   | file d'attente + reprise                                        | PARTIEL | détection et reprise génériques existent ; aucun état `degraded` posé, rien d'annoncé à l'utilisateur      |
| 89  | G06 | 3 erreurs en 24 h sur un connecteur | N1   | alerte admin + diagnostic                                       | ABSENT  | aucun compteur d'erreurs par connecteur                                                                    |

### §5 — Les 10 workflows de brouillons (p.4-5)

| #   | Workflow                            | Destinataire            | Canal préféré               | Personnalisation                                | Après envoi                     | Relance                  | Statut  | Preuve                                                                                                        |
| --- | ----------------------------------- | ----------------------- | --------------------------- | ----------------------------------------------- | ------------------------------- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| 90  | W1 Demande d'information consultant | consultant              | email · Teams si interne    | prénom + champs précis manquants                | `activity`, champ en attente    | J+5, 1 fois              | ABSENT  | —                                                                                                             |
| 91  | W2 Relance CRA                      | consultant              | **email** (Teams en rappel) | prénom, mois, jours, lien                       | compteur +1, `activity`         | J+12, J+20 puis escalade | PARTIEL | `timesheets.controller.ts:54` + `:61` ; **aucun écran**, aucun corps composé, cadence [5,12,20] ≠ [12,20]     |
| 92  | W3 Demande de feedback client       | contact client          | email                       | prénom, nom du consultant, durée                | `activity`, REX en attente      | 1 relance à J+10         | ABSENT  | libellé seul (`board-move.ts:165`), case non exécutée                                                         |
| 93  | W4 Relance besoin                   | contact demandeur       | email                       | prénom, intitulé du rôle                        | `activity`                      | J+7, puis close-loop     | PARTIEL | `NeedReminderDialog.tsx:21` pose un rappel INTERNE sur le compte, pas un brouillon au demandeur               |
| 94  | W5 Relance facture                  | contact facturation     | email                       | prénom, référence, montant ; **ton par espace** | `activity`, compteur            | J+15, J+30 avec escalade | PARTIEL | relances sur les BLOQUEURS internes, pas sur une facture impayée ; `due_on` existe, rien n'en tire de relance |
| 95  | W6 Demande de disponibilité         | consultant ou freelance | email · Teams               | prénom, date connue                             | disponibilité → **à revalider** | 1 relance                | ABSENT  | `SEGMENT_ACTION.to_revalidate` est du code mort ; l'état est DÉRIVÉ, pas l'effet d'une demande                |
| 96  | W7 Confirmation de mission          | consultant              | email                       | prénom, tous les éléments                       | `activity`, checklist créée     | —                        | ABSENT  | cases `tell_consultant`/`prepare_onboarding` non exécutées ; aucune notion de checklist                       |
| 97  | W8 Préparation de renouvellement    | contact client          | email                       | prénom, réalisations chiffrées si preuve        | tâche de suivi                  | J+10                     | PARTIEL | `GET /delivery/renewals` affiché ; « résultats prouvés » non exigés, aucune tâche, aucun J+10                 |
| 98  | W9 Relance opportunité              | contact du projet       | email                       | prénom, information nouvelle **obligatoire**    | `activity`, étape inchangée     | J+7, angle différent     | PARTIEL | playbook `proposal_no_reply` ; **l'information nouvelle n'est jamais exigée ni vérifiée**                     |
| 99  | W10 Relance compte dormant          | contact principal       | email                       | prénom, signal daté                             | `activity`                      | 1 seule, puis arrêt      | PARTIEL | `dormant_account_revival` ne fait que notifier ; son déclencheur n'est **jamais armé**                        |

| #   | Règle commune aux 10 (§5.2)                                                                                       | Statut  | Preuve                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 100 | Aucun envoi sans validation humaine, sauf N5 avec ses 6 garde-fous                                                | PARTIEL | la grille N1→N5 vit uniquement dans `action-os` ; les relances CRA/facture ne la traversent pas                |
| 101 | Le canal effectif est **annoncé avant le clic** (« Je créerai 4 brouillons dans ta boîte Gmail »)                 | PARTIEL | le champ existe (`reminder-channel.ts:41`) ; **aucun écran ne le lit** — défaut X4                             |
| 102 | Sans signature configurée : brouillon **non signé**, mention visible, **jamais de placeholder `[signature]`**     | PARTIEL | la mention existe (`DraftDialog.tsx:113`) ; **`{{signature}}` livré dans `default-library.ts:42`** — défaut X5 |
| 103 | Une relance apporte une **information nouvelle** ou change d'angle. Jamais « je me permets de revenir vers vous » | ABSENT  | aucune vérification, aucun champ, aucun test                                                                   |
| 104 | Opt-out vérifié **à l'instant de l'envoi**, jamais en cache                                                       | LIVRÉ   | `suppression.service.ts:31` — COUNT en base, aucun cache                                                       |
| 105 | Log : `activity` avec canal, type, verdict, identifiant externe après envoi                                       | PARTIEL | la table existe ; ni colonne canal, ni verdict, et **aucun envoi n'écrit d'activité** — défaut X7              |
| 106 | Mise à jour CRM **proposée**, jamais exécutée sans validation ; idempotente sur `thread_id + règle`               | PARTIEL | la proposition sans exécution existe ; **aucune clé `thread_id + règle`** nulle part                           |

| #   | Le cas Teams (§5.3, marqué « à confirmer selon API »)                                                                                                 | Statut  | Preuve                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| 107 | Objet créé : message **préparé stocké dans BellumAI**, pas un brouillon                                                                               | ABSENT  | aucun message préparé n'est stocké ; `sendChatMessage` envoie directement                            |
| 108 | L'utilisateur ne peut PAS le relire dans son outil — il le relit dans BellumAI                                                                        | ABSENT  | —                                                                                                    |
| 109 | Envoi Teams sur validation : **irréversible**                                                                                                         | PARTIEL | l'envoi est bien immédiat (`reminder-channel.ts:85`) ; le mot « irréversible » n'apparaît nulle part |
| 110 | Pièce jointe Teams : **lien** vers le fichier, pas un fichier réel                                                                                    | ABSENT  | `sendChatMessage` envoie `{text}` brut, sans notion de pièce jointe                                  |
| 111 | Usage recommandé Teams : **rappel interne uniquement**                                                                                                | ABSENT  | aucune mention ; et **aucun émetteur n'est branché** sur ce canal — défaut X3                        |
| 112 | Trois libellés de bouton, trois promesses : « Créer les brouillons » (email) · « Préparer les messages » (Teams) · « Créer les tâches » (aucun canal) | ABSENT  | aucun des trois libellés n'existe, ni en FR ni en EN                                                 |

### §6 — Le moteur de chaînes ordonnées (p.5-6)

| #   | Exigence                                                                                                                              | Statut | Preuve                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| 113 | Chaîne `ouverture_compte` — 15 étapes, porte G1 « compte priorisé », boucle « signal nouveau → rafraîchir le plan »                   | ABSENT | —                                                                                               |
| 114 | Chaîne `acquisition` — 30 étapes (4 moteurs), aucune porte, boucle « réponse → séquence arrêtée »                                     | ABSENT | —                                                                                               |
| 115 | Chaîne `prospection_inversee` — 18 étapes, aucune porte, boucle « insight → besoin détecté »                                          | ABSENT | —                                                                                               |
| 116 | Chaîne `sourcing_matching` — 16 étapes, portes G3 staffable + G4 pushable, boucle « refus → retour au matching »                      | ABSENT | —                                                                                               |
| 117 | Chaîne `push_ao_conversion` — 18 étapes, porte G5 « go entretien », boucle « sans retour → relance »                                  | ABSENT | —                                                                                               |
| 118 | Chaîne `rang2_rang1` — 23 étapes, porte G6 « preuves suffisantes », boucle « manque → collecte de REX »                               | ABSENT | —                                                                                               |
| 119 | Chaîne `onboarding_delivery` — 22 étapes, portes G7 risque + G8 prêt à facturer, boucle « risque → plan de mitigation »               | ABSENT | —                                                                                               |
| 120 | Objet `chain` : key, label_fr, label_en, domain, enabled, owner_role                                                                  | ABSENT | —                                                                                               |
| 121 | Objet `chain_step` : chain_key, position, label, actor (user/agent/connector), expected_output, automation_level, required_capability | ABSENT | —                                                                                               |
| 122 | Objet `chain_gate` : chain_key, after_position, question, yes_target_position, no_target_position, reason_required                    | ABSENT | —                                                                                               |
| 123 | Objet `chain_run` : chain_key, subject_type, subject_id, current_position, state, gate_answers, started_at, ended_at                  | ABSENT | —                                                                                               |
| 124 | `nextPosition(chain, currentPosition, gateAnswer)` est une **fonction pure**                                                          | ABSENT | `nextPosition` : 0 occurrence ; seul `orderByDependency` existe et ne revient jamais en arrière |
| 125 | Une réponse NON renvoie à une position **amont**, jamais à la fin                                                                     | ABSENT | —                                                                                               |
| 126 | Une porte **sans réponse** ne fait **jamais** avancer la chaîne                                                                       | ABSENT | —                                                                                               |
| 127 | Écran `/actions/chaines` : pistes avec compteurs                                                                                      | ABSENT | —                                                                                               |
| 128 | Clic sur une position → liste des dossiers à cette étape et l'action attendue                                                         | ABSENT | —                                                                                               |
| 129 | Clic sur une porte → liste des décisions en attente                                                                                   | ABSENT | —                                                                                               |

### §7 — Le compteur de proactivité (p.6, marqué « Confirmé — doc »)

| #   | Exigence                                                                                                                                     | Statut  | Preuve                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| 130 | Règle : **2 à 3 messages proactifs utiles par jour, pas plus**                                                                               | ABSENT  | le seul plafond du dépôt porte sur les envois e-mail de playbook, par espace                                 |
| 131 | Chaque message proactif porte une **priorité 0-100** = impact business × urgence × capacité d'agir                                           | ABSENT  | aucun champ de priorité sur une notification                                                                 |
| 132 | Un compteur **journalier par utilisateur**                                                                                                   | ABSENT  | `routines.service.ts:214` boucle sur 26 routines et poste sans jamais compter                                |
| 133 | Au-delà du seuil : les messages de priorité inférieure sont **supprimés**, pas mis en file (une file crée un rattrapage massif le lendemain) | ABSENT  | —                                                                                                            |
| 134 | Un message supprimé reste **visible dans le centre d'actions**, sans notification                                                            | ABSENT  | `notification.entity.ts` n'a que `read_at`                                                                   |
| 135 | **Rien à dire ⇒ rien envoyé.** Jamais de « rien à signaler aujourd'hui »                                                                     | PARTIEL | règle tenue par chaque exécuteur (`routine-executors.ts:20`, helper `quiet`) ; **aucune garde structurelle** |
| 136 | Ne comptent PAS dans le plafond : les **échecs** (l'utilisateur doit savoir qu'une action a raté)                                            | ABSENT  | —                                                                                                            |
| 137 | Ne comptent PAS dans le plafond : les actions **déclenchées par l'utilisateur lui-même**                                                     | ABSENT  | aucune notion d'origine « déclenché par l'utilisateur » vs « proactif »                                      |

### §8 — Sécurité transverse des automatisations (p.6)

| #   | Règle            | Application                                                                                | Statut  | Preuve                                                                                                                           |
| --- | ---------------- | ------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 138 | Simulation       | toute action N4/N5 doit pouvoir être **simulée** avant activation                          | PARTIEL | trois simulations réelles (playbooks, import CRM, import comptes) ; rien pour les 26 routines                                    |
| 139 | Reprise en main  | suspendre un workflow, annuler une exécution préparée, corriger la donnée                  | PARTIEL | suspendre par utilisateur et kill-switch global ; pas par espace, pas d'annulation d'un run `running`                            |
| 140 | Budget           | coût plafond par exécution, par jour, par utilisateur, par espace                          | ABSENT  | `budget_cap_cents` : 0 occurrence ; il y a une réservation de crédits, pas un budget                                             |
| 141 | Réputation       | aucun envoi massif, aucune relance après réponse, aucune séquence sur contact non qualifié | LIVRÉ   | les 6 garde-fous N5 (`playbook.ts:125-155`) portent exactement ces trois interdits                                               |
| 142 | Idempotence      | 6 clés du PDF 1 §9.2                                                                       | PARTIEL | registre à 9 flux (`flow-registry.ts:26`) ; **4 flux à clé vide**, 4 des 6 clés du PDF 1 inexistantes                            |
| 143 | Vérification     | après exécution, relire l'objet externe ou afficher l'erreur et la reprise                 | ABSENT  | `expectedResult` est déclaré et **rien ne le relit** ; `status: 'done'` sur la foi du connecteur                                 |
| 144 | Timeout ≠ succès | `unknown` existe ; on **réconcilie** avant de rejouer                                      | PARTIEL | `unknown` existe et arrête la reprise (`action-os.ts:88`, `workflow-runner.service.ts:377`) ; **la réconciliation n'existe pas** |
| 145 | Observabilité    | `user_id, action, object_id, status, latency_ms, error_code, tool`                         | PARTIEL | `user_id`/`action`/`object_id`/`status` existent ; `latency_ms`, `error_code`, `tool` ne sont persistés nulle part               |

### §9 — Les 285 requêtes utilisateur (p.6-8)

| #   | Exigence                                                                                                                 | Statut  | Preuve                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------- |
| 146 | Répartition — Messagerie 45 (45 A / 0 B) : `search_mailbox`, `get_thread`, `draft_message`, `create_draft`               | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 147 | Répartition — Agenda 30 (30 A / 0 B) : `get_agenda`, `create_event`, `meeting_brief`                                     | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 148 | Répartition — CRM 60 (50 A / 10 B) : `search_accounts`, `search_contacts`, `search_projects`, `create_task`              | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 149 | Répartition — Documents 35 (35 A / 0 B) : `search_documents`, `get_document`, `search_knowledge`                         | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 150 | Répartition — Talent et delivery 60 (55 A / 5 B) : `search_talents`, `run_matching`, `search_missions`, `get_timesheets` | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 151 | Répartition — Appels d'offres 15 (12 A / 3 B) : `get_rfp`, `search_proofs`                                               | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 152 | Répartition — Conseil et pilotage 40 (0 A / 40 B) : `get_kpi`, `get_pipeline_summary`, `get_interventions`               | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 153 | Total 285 = 227 exécution + 58 conseil                                                                                   | PARTIEL | voir §9 — 12 outils sur ~23 ; aucun sur le vivier, les missions, le CRA, la facturation, les RFP, les KPI |
| 154 | Les 285 servent à trois choses : jeu d'entraînement du routeur, jeu de recette, contenu de la bibliothèque de commandes  | ABSENT  | aucun jeu de recette de requêtes, aucune bibliothèque de commandes                                        |

**Les 20 requêtes qui doivent marcher en premier (§9.2)** — jeu de recette minimal d'un palier.

> ⚠️ **Remesuré le 25/08/2026** (chantier de l'archive `01`). Le tableau
> ci-dessous date du 21/08 et son verdict dominant — « API et écran existent,
> **aucun outil copilote** ne les expose » — n'est plus vrai : la dette des six
> PDF a ajouté sept outils, et **seize requêtes sur vingt** ont désormais un
> outil capable d'y répondre, contre six à la mesure d'origine.
>
> Les quatre restantes sont déclarées sans outil, avec leur raison, dans
> `apps/ia/tests/test_priority_queries_coverage.py` — qui est aussi le « jeu de
> tests » que le PDF 9 §6.1 exige en tête de son premier lot. ⚠️ Il ne teste PAS
> le routage : router demande d'appeler le modèle, donc une clé de production
> dans les actions et une garde qui rougit parce qu'un modèle a tourné sa phrase
> autrement. Il teste la moitié DÉTERMINISTE, et c'est celle qui échouait
> réellement — un modèle ne route pas vers un outil qui n'existe pas.

| #   | Requête                                                        | Outils                | Preuve attendue                     | Statut  | Preuve                                                                                         |
| --- | -------------------------------------------------------------- | --------------------- | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| 155 | Réponds en brouillon à tous mes non-lus                        | messagerie            | `draft_id` par fil                  | PARTIEL | l'outil ne prépare qu'UN brouillon ; pas de boucle « un `draft_id` par fil »                   |
| 156 | Prépare mes relances pour les fils sans réponse depuis 7 jours | messagerie            | `draft_id`                          | LIVRÉ   | intent `no_reply` (`chat_tools.py:287`) + `prepare_mail_draft`                                 |
| 157 | Quels comptes prioriser cette semaine ?                        | CRM                   | liste motivée avec preuves datées   | PARTIEL | `compare_accounts` exige des UUID en entrée ; aucune borne « cette semaine »                   |
| 158 | Quels comptes n'ont pas de prochaine action ?                  | CRM                   | liste                               | ABSENT  | rien côté copilote ; côté responsable seulement (`intervention-rules.ts:191`)                  |
| 159 | Trouve les besoins actifs sur mes comptes                      | projets               | liste de besoins avec compte parent | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 160 | Génère une shortlist pour ce besoin                            | matching              | 3 à 5 profils + fiches              | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 161 | Crée un CV client pour ce consultant                           | talent                | `file_id`                           | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 162 | Compare ce consultant avec ce besoin                           | matching              | 12 axes                             | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 163 | Quels consultants repositionner ?                              | talent                | liste + besoins cibles              | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 164 | Quelles missions finissent dans 30 jours ?                     | delivery              | liste + rappels                     | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 165 | Quelles missions sont à risque ?                               | delivery              | liste + axes, ou « non mesurable »  | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 166 | Relance les CRA manquants                                      | delivery + messagerie | brouillons ou messages préparés     | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 167 | Qu'est-ce qui bloque ma facturation ce mois-ci ?               | delivery              | bloqueurs nommés                    | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 168 | Prépare les éléments de facturation à envoyer                  | delivery              | `file_id`                           | PARTIEL | export CSV existe ; **pas de `file_id`**, aucun outil copilote                                 |
| 169 | Prépare mon rendez-vous de demain                              | agenda + CRM          | brief 1 page                        | PARTIEL | `list_agenda` + `get_daily_briefing` ; pas de brief 1 page PAR rendez-vous                     |
| 170 | Crée un RDV « Société + Sujet » mardi 15 h avec visio          | agenda                | `event_id` + lien                   | PARTIEL | `find_free_slots` est en lecture seule ; la création réelle n'est pas appelable depuis le chat |
| 171 | Résume cet appel d'offres                                      | AO                    | synthèse structurée                 | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 172 | Quelles références puis-je mobiliser ?                         | preuves               | preuves validées                    | PARTIEL | API et écran existent ; **aucun outil copilote** ne les expose                                 |
| 173 | Où dois-je intervenir aujourd'hui ?                            | pilotage              | 5 interventions classées            | PARTIEL | file du RESPONSABLE (crédits, inactivité) ; rien côté commercial, pas de top-5 classé          |
| 174 | Analyse mon Q3 et propose un plan Q4                           | conseil               | verdict + preuves + plan + actions  | ABSENT  | aucune maille trimestrielle, aucun plan généré                                                 |

| #   | Protocole de recette (§9.3) et routeur (§9.4)                                                                                                           | Statut  | Preuve                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 175 | Chaque requête se teste avec 8 champs : Requête · Verdict · Message observé · Résultat outil observé · Écart · Preuves · Correction attendue · Priorité | PARTIEL | 5 champs sur 8 dans les trackers de chantier ; aucun jeu de recette de requêtes utilisateur                                   |
| 176 | 4 verdicts : `PASS` · `FAIL` · `PARTIAL` · `BLOCKED`                                                                                                    | PARTIEL | la sémantique existe sous d'autres noms (`partial` de l'Action OS, capacité `false`) ; jamais un enum                         |
| 177 | **Distinction capitale** : `FAIL` = problème de produit, `BLOCKED` = problème de configuration. Les confondre fait perdre des semaines                  | ABSENT  | la distinction est énoncée dans un doc d'août, jamais outillée                                                                |
| 178 | Routeur étape 1 — classification : intention → cerveau A ou B, et famille d'outils                                                                      | PARTIEL | 6 intentions en PROMPT (`bellum_advisor.py:130`), pas 2 cerveaux, aucun classifieur en code                                   |
| 179 | Routeur étape 2 — extraction d'entités : compte, contact, besoin, mission, période mentionnés                                                           | ABSENT  | le compte est choisi à l'UI (`?accountId=`), jamais extrait de la phrase                                                      |
| 180 | Routeur étape 3 — vérification de capacité : les connecteurs requis sont-ils disponibles ?                                                              | PARTIEL | le registre d'outils est injecté (`tool-capability-digest.ts:25`) ; la vérification est **conseillée** au modèle, pas imposée |
| 181 | Routeur étape 4 — exécution : appel des outils, dans l'ordre                                                                                            | PARTIEL | boucle tool-use native, 2 tours (`chat_orchestrator.py:189`) ; aucun ordre planifié                                           |
| 182 | Routeur étape 5 — réponse selon le contrat : verdict, preuves, limites, prochaine action                                                                | PARTIEL | format en consigne de prompt (`bellum_advisor.py:163`), non structuré, non vérifié                                            |
| 183 | Une requête ambiguë demande une précision **une seule fois**, avec 2 ou 3 options cliquables. **Jamais deux tours de clarification**                    | ABSENT  | aucun compteur de tours, aucune option cliquable                                                                              |
| 184 | Capacité manquante : faire ce qui est possible, **nommer ce qui manque**, ne pas tout bloquer                                                           | PARTIEL | règle de prompt (`bellum_advisor.py:146`) ; rien ne garantit l'exécution partielle en code                                    |

### §10 — Tickets (p.8-9)

| #   | Ticket        | Titre                                    | Priorité | Statut  | Preuve                                                                                                                                                     |
| --- | ------------- | ---------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 185 | `BEL-AUT-501` | Définitions de workflow persistées       | P1       | ABSENT  | `workflow_definitions` : 0 occurrence ; deux catalogues en dur (5 workflows + 26 routines)                                                                 |
| 186 | `BEL-AUT-502` | Moteur de chaînes ordonnées              | P1       | ABSENT  | aucune des 4 tables, aucune des 7 chaînes                                                                                                                  |
| 187 | `BEL-AUT-503` | Compteur de proactivité                  | P1       | ABSENT  | aucun plafond, aucune priorité, aucune suppression                                                                                                         |
| 188 | `BEL-AUT-504` | Résolution de canal et libellés honnêtes | **P0**   | PARTIEL | `resolveChannel` existe depuis avant-hier mais **aucun nom de canal ne correspond**, aucun libellé, aucune mention « irréversible » — et 4 défauts (X1-X4) |
| 189 | `BEL-AUT-505` | Bibliothèque de commandes et routeur     | P1       | ABSENT  | `/chat/commandes` absent ; 19 suggestions en dur, le clic pré-remplit sans exécuter                                                                        |

**Détail de `BEL-AUT-501`** — table `workflow_definitions` (key, version, trigger, conditions
jsonb, steps jsonb, automation_level, policy, budget_cap_cents, enabled_by_workspace, chain_key
nullable, position_in_chain nullable) ; backfill depuis le catalogue existant reproduisant
**exactement** le comportement actuel ; un espace peut désactiver un workflow **sans toucher au
code** ; aucune automatisation ne s'exécute si son connecteur est absent. Contrat
`workflow-definition.ts` : schéma + fonction **pure** `canRun(definition, workspace, capabilities)
→ {ok, reason?}` où `reason` **nomme** le connecteur manquant. Interdits explicites du ticket :
modifier le comportement des 23 routines existantes, créer un second moteur d'exécution.

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

Neuf défauts, dont **quatre dans la livraison du PDF 5, faite hier**. Aucun n'est visible : ils sont
tous de la famille « livré, testé, vert, et que rien n'appelle » — celle que les cinq chantiers
précédents ont trouvée à chaque recette.

### X1 — `resolveChannel` prend un webhook Zapier pour une messagerie d'équipe

`capabilities.chat` est calculé par `EXISTS (SELECT 1 FROM integrations WHERE user_id = $2 AND
enabled)` (`apps/api/src/modules/delivery/timesheets.service.ts:309`). La table `integrations`
couvre `slack | discord | teams | googlechat | mattermost | webhook`
(`apps/api/src/database/entities/integration.entity.ts:8`). Un espace qui a branché un webhook
Zapier et **aucune messagerie d'équipe** se voit donc proposer le canal « message d'équipe ».

### X2 — `resolveChannel` annonce un brouillon que la messagerie refusera

`capabilities.mailbox` teste la simple existence d'une connexion
(`timesheets.service.ts:307-308`), sans regarder la capacité `draft` du jeton — alors que
`MailboxService.createDraft` refuse justement sur `!capabilities.draft`
(`apps/api/src/modules/mailbox/mailbox.service.ts:407-412`). Le canal annoncé avant le clic peut
donc être exactement celui qui échouera après.

### X3 — Le canal « message d'équipe » ne mène à rien

Aucun émetteur n'est branché dessus. `sendChatMessage`
(`apps/api/src/modules/integrations/integrations.outbound.ts:48`) n'est appelé que par
`notifications.service.ts:185` et `analysis.worker.ts:808`. Choisir ce canal ne produit aucun
message.

### X4 — L'annonce « avant le clic » n'est affichée nulle part, et il n'y a pas de clic

`GET /delivery/timesheets/reminders` (`timesheets.controller.ts:54`) et
`GET /delivery/invoice-readiness/reminders` (`invoice-readiness.controller.ts:61`) ont **zéro
appelant** dans `apps/web/src`. Le champ `sendsImmediately`, dont toute la raison d'être est de
dire avant le clic si le message part tout seul, n'atteint aucun écran. C'est la garantie centrale
du §5.2 règle (b), livrée et inatteignable.

### X5 — Le placeholder `[signature]` que la règle interdit est livré dans la bibliothèque

La règle 102 dit : « jamais de placeholder ». `apps/api/src/modules/library/default-library.ts:42`
et `:114` contiennent `{{signature}}` en dur dans les modèles fournis par défaut.

### X6 — `profiles.email_signature` est en lecture seule

La colonne existe (`1788800000001-MailboxSignature.ts:27`) et elle est LUE
(`mailbox.service.ts:433`), mais **aucun endpoint, aucun DTO, aucun écran ne l'écrit**. La branche
« signature saisie dans Bellum », qui est la première du repli documenté dans `CLAUDE.md`, est
morte : elle ne peut jamais être vraie.

### X7 — Aucun envoi n'écrit d'activité

Le §5.2 règle (f) veut un log `activity` portant canal, type, verdict et identifiant externe après
envoi. La table existe, mais `external_id` est rempli par la **synchro de lecture**
(`activity-capture.service.ts:156`) et aucun chemin d'envoi n'appelle `ActivitiesService` — le
`draftId` / `messageId` rendu par `mailDraftResultSchema` n'est persisté nulle part. Il n'existe ni
colonne `canal` ni colonne `verdict`.

### X8 — `deriveCapabilityState` : huit états déclarés, aucun lecteur

`packages/contracts/src/schemas/tool-registry.ts:167` dérive huit états de capacité, avec un ordre
d'urgence justifié en commentaire et un test complet
(`packages/contracts/src/schemas/capability-state.test.ts`). Son **seul appelant est son propre
test**. C'est exactement ce que la famille G du PDF réclame (jeton expiré, portée retirée,
synchronisation en retard, débit) : le socle est écrit, il n'a jamais été branché.

### X9 — Deux catalogues de code mort, et un commentaire faux

`SEGMENT_ACTION` (`packages/contracts/src/schemas/talent-pool-segments.ts:50`) n'a aucun
consommateur. Le déclencheur `account_dormant` du workflow `dormant_account_revival`
(`workflow-catalog.ts:262`) n'est jamais armé. Et le docblock de `routine-catalog.ts:15` annonce
« vingt-trois » routines quand le tableau en contient **26** — les trois dernières sont celles que
j'ai ajoutées avant-hier sans mettre le commentaire à jour.

---

## 3. Lots d'implémentation

**Le document est trop gros pour être livré en entier, et le dire est la première décision.**
60 automatisations, 7 chaînes de 142 étapes, 285 requêtes, 5 tickets. Le dépôt en porte déjà une
partie : 37 items sur 189 sont livrés, 87 partiels. Ce qui suit ordonne par **valeur réelle
rapportée au risque**, pas par ordre de lecture.

Le classement tient à une observation du croisement : **14 des 20 requêtes prioritaires ont déjà
leur API et leur écran** — il ne leur manque que l'outil qui les expose au copilote. C'est le
meilleur rapport valeur/coût du chantier, et de loin.

| Lot | Contenu                                                                                                                                                                                               | Items                | Dépend de |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------- |
| A   | **Les 4 défauts de `resolveChannel`** (X1-X4) : capacité de chat réellement vérifiée, capacité `draft` du jeton lue, canal sans émetteur retiré, et l'annonce « avant le clic » affichée quelque part | 101, 109, 111, X1-X4 | —         |
| B   | **Ticket 504 (P0)** : trois canaux nommés comme le PDF, trois libellés de bouton honnêtes, message de confirmation, mention « irréversible » sur le canal qui part tout seul                          | 107-112              | A         |
| C   | **La signature** : écran qui ÉCRIT `profiles.email_signature` (colonne morte aujourd'hui) et retrait du `{{signature}}` livré dans la bibliothèque                                                    | 102, X5, X6          | —         |
| D   | **Ticket 503 — compteur de proactivité** : priorité 0-100, plafond journalier par utilisateur, suppression sans file, visible sans notification, exemptions échecs + gestes de l'utilisateur          | 130-137              | —         |
| E   | **Les outils copilote qui débloquent les 20 requêtes prioritaires** — vivier, matching, missions, CRA, facturation, preuves, interventions. Le pont `bellum_api.py` et son gate existent déjà         | 146-174              | —         |
| F   | **Ticket 505 — bibliothèque de commandes** `/chat/commandes` : commandes classées, connecteurs requis affichés, indisponibilité nommée, **clic qui exécute** (aujourd'hui il pré-remplit)             | 154, 189             | E         |
| G   | **Famille G — brancher `deriveCapabilityState`** : huit états écrits, testés, sans lecteur. Jeton expiré, portée retirée, synchronisation en retard, débit                                            | 84-89, X8            | —         |
| H   | **Le log d'envoi** : colonnes canal et verdict sur `activities`, identifiant externe écrit APRÈS envoi                                                                                                | 105, 145             | A         |
| I   | **Les 12 attributs sur le catalogue de routines** : condition, donnée, validation, niveau, risque, fallback, critère — 1 sur 12 aujourd'hui                                                           | 7-18                 | —         |
| J   | **Le routeur d'intentions en CODE** : classification, extraction d'entités, clarification bornée à un tour avec options cliquables                                                                    | 178-184              | E         |
| K   | **Protocole de recette** : les 4 verdicts en enum, la distinction FAIL (produit) / BLOCKED (configuration) outillée                                                                                   | 175-177              | E         |
| L   | Démo · changelog FR+EN · i18n · tracker · docblock périmé de `routine-catalog.ts` (X9)                                                                                                                | —                    | tous      |

---

## 4. Décisions tranchées par Louis le 21/08/2026

⚠️ Le PDF numérote ses questions D3, D8, D31, D32, D33 — trois de ces numéros sont **déjà pris**
par le PDF 5. Renumérotées ici D38 à D42, plus les questions que le croisement a fait naître.

| #   | Question                                               | Réponse                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D38 | D3 (rappel) — cadence 3 touches ou 1 relance           | **Tranché par le code existant, pas par une question.** Les deux règles coexistent déjà et c'est juste : une séquence validée à N2 fait trois touches (`outreach-sequence.ts`), un playbook N5 en fait **une seule** (`PLAYBOOK_MAX_PER_TARGET = 1`). La différence n'est pas une préférence, c'est le niveau d'autonomie : ce qui part tout seul ne relance pas deux fois. |
| D39 | D8 (rappel) — Teams : message, notification ou tâche ? | **Message préparé, jamais « brouillon ».** Une messagerie d'équipe n'a pas de brouillon : le message part entier au clic. Le mot est déjà refusé par une garde de langage (`no-overpromise.test.ts:101`). Le canal annonce donc qu'il est **irréversible**, et l'email reste le défaut pour tout engagement client.                                                         |
| D40 | D31 — plafond de proactivité réglable ?                | **Oui, entre 1 et 5, défaut 3.** Le plafond protège l'utilisateur du produit ; le lui laisser régler est cohérent avec l'écran Routines, qui lui laisse déjà choisir ses horaires. Les messages au-delà du seuil sont **supprimés**, jamais mis en file — une file produit un rattrapage massif le lendemain, c'est-à-dire exactement le bruit qu'on voulait éviter.        |
| D41 | D32 — N5 activable par `admin` ou par `owner` ?        | **`owner` uniquement.** Une automatisation N5 atteint un client sans qu'un humain relise. C'est la seule catégorie dont la conséquence sort de l'entreprise.                                                                                                                                                                                                                |
| D42 | D33 — un espace peut-il créer ses propres chaînes ?    | **Non en V1 : catalogue fermé de 7.** Une chaîne éditable sans revue est un chemin d'exécution que personne ne relit — même raison que le catalogue de workflows, qui vit dans le code.                                                                                                                                                                                     |
| D43 | Le moteur de chaînes : différer ou livrer ?            | **Tout livrer** — les 7 chaînes, leurs étapes, les portes, l'écran. Décision assumée contre la recommandation : le troisième moteur d'exécution est le prix, et il est accepté. ⚠️ Le PDF donne les compteurs d'étapes et les portes, **jamais le contenu des 142 étapes** : elles sont composées à partir de ce que le produit sait RÉELLEMENT faire, jamais inventées.    |
| D44 | Combien d'outils copilote ajouter ?                    | **Les 17 noms du PDF**, sauf `get_thread` — refus permanent : le corps des messages ne sort jamais de la messagerie.                                                                                                                                                                                                                                                        |
| D45 | Les quatre promesses avant le clic                     | **Les quatre** : les 4 défauts de `resolveChannel`, les 3 libellés honnêtes, l'écran de signature, et le log d'envoi dans `activities`.                                                                                                                                                                                                                                     |
| D46 | Renommer les portes G5-G8 pour coller au PDF ?         | **Non.** Le journal `decision_gate_crossings` est une trace d'audit ; la réécrire pour aligner un vocabulaire ferait perdre ce qu'elle sert à garder. Les chaînes référencent les portes par leur clé RÉELLE, et toute porte manquante s'ajoute **en fin d'énumération** (garde GA-08).                                                                                     |

---

## 5. Ce qu'on ne promet pas

- **`get_thread` — lire le corps des messages.** Refus permanent du dépôt : la messagerie remonte
  l'interlocuteur, l'objet et l'ancienneté du silence, jamais le contenu. Le PDF le liste parmi les
  outils de la famille Messagerie ; il ne sera pas livré.
- **Les 60 automatisations au complet.** 26 routines existent, et la règle du catalogue est
  écrite : « n'y figure que ce qui tourne RÉELLEMENT avec les capacités connectées ». Inscrire 34
  entrées de plus produirait des cases à cocher qui ne font rien — la version réglages du « Actif
  sans connecteur » que le produit s'interdit. Seules partiront celles dont le connecteur existe.
- **Le moteur de chaînes ordonnées dans son intégralité** (ticket 502, items 113-129). Sept
  chaînes, 142 étapes, quatre tables, un écran. Et surtout : le dépôt fait déjà tourner **deux**
  moteurs d'exécution (`workflow-runner.service.ts` et `routines.service.ts`) ; une chaîne serait
  le troisième, alors que le ticket 501 interdit lui-même « un second moteur d'exécution ». Voir
  la décision D43.
- **Le renommage des portes G5 à G8.** Le dépôt nomme G5 armement de playbook, G6 écriture ERP,
  G7 prêt à facturer, G8 clôture de projet ; le PDF attend go entretien, preuves suffisantes,
  risque, prêt à facturer. Renommer casserait le journal d'audit `decision_gate_crossings`, qui
  est précisément la trace qu'on ne réécrit pas.
- **Les 285 requêtes comme jeu d'entraînement.** Le produit n'entraîne aucun modèle. Les 285
  serviront de contenu à la bibliothèque de commandes et de jeu de recette — deux des trois usages
  que le PDF leur donne, pas le troisième.

---

## 6. État de livraison

**PR #1008, mergée sur `main` le 21/08/2026.** Onze lots partis sur douze ; le douzième (lot F, la
bibliothèque de commandes `/chat/commandes`) est reporté avec sa raison, ci-dessous.

| Lot | État       | Ce qui est parti                                                                                                                                                                            |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | ✅ livré   | Les 4 défauts de `resolveChannel` : capacité de chat réellement vérifiée (plus de webhook pris pour une messagerie d'équipe), portée `draft` du jeton lue, canal sans émetteur retiré       |
| B   | ✅ livré   | Trois canaux, trois libellés, trois promesses + mention « irréversible » ; garde `channel-labels.test.ts` qui refuse le mot « brouillon » sur un canal qui envoie                           |
| C   | ✅ livré   | `{{signature}}` retiré des deux modèles livrés + garde anti-marque-place ; `PUT /mailbox/signature` — la colonne était lue et rien ne l'écrivait                                            |
| D   | ✅ livré   | Compteur de proactivité : priorité 0-100 (produit et non somme), plafond 1-5 par utilisateur, suppression sans file, exemptions échecs + gestes de l'utilisateur, garde `proactivity-wired` |
| E   | ✅ livré   | Six outils copilote (vivier, missions, relevés, bloqueurs, preuves, interventions) via le pont existant, en lecture seule, `finance: false` en dur et verrouillé par un test                |
| F   | ⏸️ reporté | `/chat/commandes` — voir « ce qui reste » ci-dessous                                                                                                                                        |
| G   | ✅ livré   | `deriveCapabilityState` branché dans le registre (8 états morts) + routine `connector_health` qui notifie sur CHANGEMENT d'état, jamais en rappel quotidien                                 |
| H   | ✅ livré   | `activities.channel` et `activities.verdict` (migration `1789784612907`), trace écrite au dépôt d'un brouillon, `drafted` ≠ `sent`                                                          |
| I   | ✅ livré   | Les 12 attributs sur les 27 routines : niveau d'autonomie, condition, donnée lue, fallback, critère d'acceptation — plus une garde qui refuse un champ rempli de vide                       |
| J   | ⏸️ reporté | Le routeur d'intentions en code — voir ci-dessous                                                                                                                                           |
| K   | ⏸️ reporté | Le protocole de recette en enum — voir ci-dessous                                                                                                                                           |
| L   | ✅ livré   | Les 7 chaînes, `nextPosition` pure (12 tests), `chainProblems`, migration `1789789341052`, écran `/actions/chaines`, 3 portes ajoutées en fin d'énumération                                 |
| M   | ✅ livré   | 4 entrées de changelog FR+EN, i18n complet, parité démo (`chain_runs` classée vide à dessein avec sa raison), docblock périmé corrigé                                                       |

### Les étapes de chaîne, par rapport aux compteurs du document

Le §6.1 annonce 142 étapes et n'en décrit aucune. Ce qui est livré correspond à ce que le produit
sait RÉELLEMENT faire :

| Chaîne                 | Annoncé | Livré | L'écart                                                                                 |
| ---------------------- | ------- | ----- | --------------------------------------------------------------------------------------- |
| `ouverture_compte`     | 15      | 10    | Les 5 manquantes supposent une veille concurrentielle et un scoring de maturité absents |
| `acquisition`          | 30      | 8     | Le document parle de « 4 moteurs » sans les nommer ; un seul existe (séquences)         |
| `prospection_inversee` | 18      | 7     | Les étapes de ciblage multi-critères supposent un moteur de recommandation absent       |
| `sourcing_matching`    | 16      | 7     | Les 9 manquantes sont des sous-étapes du matching, déjà couvertes par ses douze axes    |
| `push_ao_conversion`   | 18      | 8     | La négociation détaillée n'a aucun objet en base                                        |
| `rang2_rang1`          | 23      | 6     | Le référencement grands comptes n'a aucun connecteur                                    |
| `onboarding_delivery`  | 22      | 8     | Les 14 manquantes exigent badge, VPN, matériel — aucun connecteur, refus déjà écrit     |

**Total : 54 étapes livrées sur 142 annoncées.** Chacune correspond à un geste possible ; les 88
autres attendent une capacité, et une chaîne s'allonge quand elle arrive.

### Ce qui reste, et pourquoi

- **Lot F — `/chat/commandes`** : la bibliothèque suppose les 285 requêtes classées, avec leurs
  connecteurs requis et leur disponibilité. Les six outils du lot E viennent de changer ce qui est
  atteignable ; construire le catalogue avant de mesurer ce que le copilote sait faire maintenant
  produirait une liste à refaire. À reprendre après une recette d'usage réel.
- **Lot J — le routeur d'intentions en code** : aujourd'hui la classification, la vérification de
  capacité et le format de réponse vivent dans le prompt. Les sortir demande de trancher ce qui
  reste au modèle et ce qui devient déterministe — un arbitrage produit, pas une tâche
  d'implémentation. La règle « une seule clarification, avec options cliquables » en dépend.
- **Lot K — les 4 verdicts en enum** : `PASS` / `FAIL` / `PARTIAL` / `BLOCKED` n'ont de sens que
  posés sur un jeu de recette qui n'existe pas encore. Les livrer seuls donnerait une énumération
  que rien ne remplit.

---

## 7. Ce que la recette live a trouvé

Quatre défauts, dont deux qu'aucun des 9 652 tests verts ne pouvait voir. Tous corrigés et
redéployés avant clôture.

### 7.1 Le panneau s'ouvrait hors de l'écran (PR #1008 corrigée sur place)

Cliquer sur une position de la première chaîne ouvrait un panneau rendu **après les sept pistes**,
donc plusieurs écrans plus bas. L'utilisateur clique, la page ne bouge pas, il conclut que le
bouton ne marche pas. Le panneau se rend désormais **dans la piste** à laquelle il appartient, et
un second clic sur la même position le referme.

### 7.2 `account` s'affichait tel quel

Le type de sujet d'un parcours sortait brut à l'écran. Traduit (`panel.subjects.*`),
`CHAIN_SUBJECT_TYPES` exporté et inscrit dans `enum-keys.test.ts` — la garde qui exige un libellé
FR+EN pour toute valeur d'énumération affichée.

### 7.3 L'outil vivier tombait à CHAQUE appel (PR #1009)

**Le défaut le plus grave du chantier, et le plus invisible.** Question posée au copilote en prod :
« Quels consultants sont disponibles, et à quel TJM ? ». Réponse : « échec technique — l'outil
vivier n'a pas répondu ».

Le pont composait sa requête à la main :

```ts
{ q: dto.query, availableWithinDays: dto.availableWithinDays, limit: 20 } as never
```

Trois champs, sans `skills` ni `page`. Or `TalentService.search` fait `query.skills.map(…)` et
`(query.page - 1) * query.limit` : **500 à chaque appel**. Aucune question sur le vivier n'a jamais
eu de réponse.

Trois choses ont conspiré, et c'est la leçon :

1. **Le `as never` a éteint le typage du contrat** — la seule chose qui l'aurait dit à la
   compilation.
2. **Le test regardait de loin** : `expect(talents.search).toHaveBeenCalledWith('w-1',
expect.anything(), { finance: false })`. Un `expect.anything()` sur l'argument qui porte tout le
   sens ne garde rien.
3. **Le service était mocké**, donc rien ne l'exécutait jamais avec cet objet.

La requête passe maintenant par `talentSearchQuerySchema.parse` — ses défauts arrivent avec, et
`.strict()` refuse un champ inventé. Les tests **parsent l'argument réel** contre le schéma du
service.

Deux points positifs à noter : le copilote a dit « échec technique », pas « aucun consultant » ; et
il a expliqué de lui-même que le TJM ne sort jamais de cet outil. Les deux règles produit ont tenu
là où le code cassait.

### 7.4 « Sous 30 jours » n'en était pas (PR #1009)

`CopilotMissionsDto.endingWithinDays` était déclaré et **jamais lu** : `renewalsToAct(userId)` rend
toutes les fenêtres actionnables, jusqu'à J+60. Le copilote titrait donc « Missions à échéance sous
30 jours » au-dessus d'une donnée qui ne portait pas ce périmètre — la même famille que le §7.3,
vue de l'autre côté : un paramètre d'outil ignoré en silence rend une réponse qui a l'air d'avoir
répondu.

`daysUntilEnd` sort de `renewalWindow` (contrat, pur, testé) pour permettre le resserrage. Une
mission **sans date de fin** reste rendue quelle que soit la fenêtre demandée : elle est justement
celle qu'on ne relance jamais à temps.

### 7.5 Ce qui a été vérifié EN VRAI

| Vérification                                         | Résultat                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/actions/chaines`                                   | Les 7 pistes, positions, portes marquées, boucles de retour                                                    |
| Parcours réel créé sur AIRBUS                        | Avancé 1→9, puis les trois règles du §6 vérifiées en direct                                                    |
| Porte sans réponse                                   | `9 / blocked` — le dossier attend, il ne passe pas pour actif                                                  |
| Refus sans motif                                     | `400 « Un refus se déclare avec son motif — c'est le seul moment où on l'obtient. »`                           |
| Refus motivé                                         | `4 / running` — renvoyé EN AMONT, comme la spécification l'exige                                               |
| `proactivity_cap`                                    | `3` rendu par `/notifications/preferences`                                                                     |
| `capability_state` (la fonction morte du croisement) | Dérivé en direct : `{operational: 7, not_connected: 24, read_only: 14, sync_late: 1}`                          |
| Outil copilote `search_missions`                     | Répond en prod, avec « non renseigné » / « aucune date de fin » / « inconnue » — jamais un zéro de remplissage |
| Outil copilote `search_talents`                      | **Cassé** → §7.3, corrigé                                                                                      |
| Balayage complet de la navigation (ZÉRO régression)  | Aucune régression                                                                                              |
