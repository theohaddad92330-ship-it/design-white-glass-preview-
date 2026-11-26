# PDF 1/9 — Architecture globale Operating System ESN — 19 août 2026

Source : `agent_docs/sources/pdf-1-architecture-globale-2026-08-19.pdf` (17 pages, lues
intégralement le 19/08/2026). Auteur annoncé : ORION — Product Architect BellumAI.

Ce PDF est le **socle** d'une série de 9. Il ne décrit aucune chaîne métier : il pose les
invariants, la carte des modules, 13 machines à états, 9 flux inter-modules, la matrice
d'intervention de l'IA, 15 points de log, 18 contrats partagés, 15 gardes CI
(GA-01→GA-15), 5 tickets (BEL-ARCH-001→005) et 10 décisions (D1→D10). **Les 8 autres PDF
ne sont pas encore fournis.**

## 0. Avertissement de méthode — le croisement a d'abord été faux

Le checkout `~/Desktop/belllum-monorepo` était **139 commits derrière `origin/main`** :
359 fichiers du chantier CRM/ATS T0→T11 (#944→#966) manquaient du disque. Les premiers
croisements ont donc rendu des « n'existe pas » faux (`wired-write-paths.spec.ts`,
`/projects`, module `playbooks`, `project.ts`…). Tout ce document est établi sur un
worktree neuf détaché sur `origin/main` (`7d504b58`). **Leçon à garder : vérifier
`git rev-list --count HEAD...origin/main` avant tout audit de dépôt.**

Deuxième constat de méthode : le PDF décrit le dépôt tel qu'il était **avant** T0→T11 sur
plusieurs points (« 3 rôles », « `member` à backfiller », « `no_feedback` à créer »). Ses
marqueurs `[Confirmé — repo]` ne sont donc pas fiables ; chaque ligne a été revérifiée.

---

> ⚠️ **Comptes corrigés le 25/08/2026**, en recroisant ce tracker avec sa source
> lors du chantier de l'archive `01`. Quatre totaux annoncés ici étaient faux, et
> un chiffre faux fait croire un inventaire complet : « 7 interdits » pour **9**,
> « 21 contrats » pour **18**, « 21 routes nouvelles » pour **16** (les 5
> restantes sont des clés de palier, déjà comptées à part à l'item 57), « cinq
> défauts » au-dessus d'un tableau de **six**. Deux routes rangées parmi les
> nouvelles ne le sont pas dans la source : `/missions/actives` et
> `/missions/facturation`. Le compte des clés de palier passe de 13 à **12**.
>
> Autre correction du même passage : l'affirmation « le PDF demande de créer
> `no_feedback` » est fausse — la source l'énonce comme un ACQUIS,
> `[Confirmé — repo]`. Et **D6** était rangé parmi les décisions « dans le sens
> que le PDF recommande » alors que ce tracker le tranchait à l'inverse ; le
> dépôt a depuis convergé vers la recommandation, mais par D58 (PDF 7, 21/08),
> pas par ce chantier.

## 1. Inventaire

Statuts : `LIVRÉ` (en prod, avec preuve) · `PARTIEL` · `ABSENT` · `PÉRIMÉ` (le PDF décrit
un état antérieur, ou une décision postérieure l'a tranché autrement) · `REFUS` ·
`DÉCISION`.

### §2.1 — Les 12 invariants

| #   | p.  | Invariant                                                                             | Statut  | Preuve / raison                                                                                                                                                                                                                                                        |
| --- | --- | ------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 1   | Projet = objet pivot unique, table `opportunities`                                    | LIVRÉ   | `apps/api/src/database/entities/project.entity.ts:9`, contrat `packages/contracts/src/schemas/project.ts` (579 l.)                                                                                                                                                     |
| 2   | 1   | Cycle Projet à 9 étapes, 5 visibles au pipe, renommables                              | LIVRÉ   | `project.ts:52-62` (9), `:71` (5), table `pipeline_stage_labels` — `migrations/1789344812907-ProjectPivot.ts:157`                                                                                                                                                      |
| 3   | 2   | Provenance par champ `human > connector > pipeline > model`, un blanc n'écrase jamais | LIVRÉ   | `packages/contracts/src/schemas/provenance.ts:32,37,88,128,170` ; table `field_provenance` — `migrations/1789301274613-CrmAtsSocle.ts:36`                                                                                                                              |
| 3b  | 2   | ↳ la garde `no-blind-record-writes.spec.ts` citée par le contrat                      | ABSENT  | `provenance.ts:161` la nomme, **le fichier n'existe pas**                                                                                                                                                                                                              |
| 4   | 2   | Disponibilité dérivée, jamais saisie ; `unknown` ≠ disponible                         | PARTIEL | `deriveStaffing` — `packages/contracts/src/schemas/staffing.ts:111` ✅ ; mais `consultants.availability` reste **saisie** et alimente matching et filtres (`consultants.service.ts:338`, `consultant-matching.ts:205`). `unknown` ≠ disponible est tenu des deux côtés |
| 5   | 2   | Aucune facture légale ; on s'arrête à `invoice_readiness`                             | LIVRÉ   | `packages/contracts/src/schemas/invoice-readiness.ts` ; refus explicite `delivery.service.ts:27-29`, `delivery.controller.ts:19` ; garde de langage `apps/web/src/i18n/no-overpromise.test.ts:103`                                                                     |
| 6   | 2   | Action OS N0→N5, réservation de crédits, outcome `unknown`                            | LIVRÉ   | `packages/contracts/src/schemas/action-os.ts:37-51` (6 niveaux), `:97-105` (7 issues) ; `apps/api/src/modules/action-os/credit-reservation.service.ts:27`                                                                                                              |
| 7   | 2   | Les 6 garde-fous playbook N5 non désactivables                                        | LIVRÉ   | `packages/contracts/src/schemas/playbook.ts:112-141` (`playbookVerdict`) ; constantes hors `updatePlaybookSchema` (`:44-51`, `.strict()` `:63`)                                                                                                                        |
| 8   | 2   | Tout chemin d'écriture a un appelant                                                  | PARTIEL | `apps/api/src/modules/wired-write-paths.spec.ts:31-73` — **3 méthodes en dur** (`reserveSend`, `proposeDuplicates`, `open`), pas de balayage générique                                                                                                                 |
| 9   | 2   | Toute table classée : seedée en démo ou vide à dessein                                | LIVRÉ   | `demo-coverage.ts` + `demo-coverage.spec.ts:36-80` + leak guard `demo-reset.service.spec.ts:155`                                                                                                                                                                       |
| 10  | 2   | Motifs de fin de positionnement = liste fermée dont `no_feedback`                     | LIVRÉ   | `packages/contracts/src/schemas/submission.ts:84-95` (9 motifs) + CHECK SQL `migrations/1789382641057-Submissions.ts:54`                                                                                                                                               |
| 11  | 2   | Doublons proposés, jamais fusionnés                                                   | LIVRÉ   | `apps/api/src/modules/crm-core/governance.service.ts:273,305-317` ; table `duplicate_pairs` — `migrations/1789411862049-Governance.ts:87`                                                                                                                              |
| 12  | 2   | 10 champs personnalisés maximum par entité                                            | LIVRÉ   | `packages/contracts/src/schemas/governance.ts:80-88` ; appliqué `governance.service.ts:140-151`                                                                                                                                                                        |

### §2.2 — Les 9 points d'extension

| #   | p.  | Point                                                                                     | Statut  | Preuve                                                                                                                                                                            |
| --- | --- | ----------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | 2   | Nouvel objet → migration + zod dans `packages/contracts`                                  | LIVRÉ   | convention tenue, 107 schémas                                                                                                                                                     |
| 14  | 2   | Nouveau statut → ajout **en fin d'enum uniquement**                                       | PARTIEL | convention documentée (`migrations/1785760000000-RbacRoles.ts:13`), **aucun test** ne la fait respecter → cf. GA-08                                                               |
| 15  | 2   | Nouvelle automatisation → catalogue de workflows                                          | LIVRÉ   | `workflow-catalog.ts` — **5 workflows** ; type `action-os.ts:231`                                                                                                                 |
| 16  | 2   | Nouvelle routine → `routine-catalog.ts` (« 23 routines »)                                 | LIVRÉ   | 23 routines exactement (`routine-catalog.ts:31→427`), miroir `routines.ts:35-84`. ⚠️ le docblock `:12` dit encore « huit routines » — commentaire périmé                          |
| 17  | 2   | Nouvelle nature d'intervention → `intervention-rules.ts` (« 6 natures »)                  | LIVRÉ   | 6 exactement (`intervention-rules.ts:78,121,156,196,234,276`) ; seuils `playbook.ts:241-263`                                                                                      |
| 18  | 2   | Nouvel outil copilote → `chat_tools.py`, appelle l'API Nest **jamais la base**            | PARTIEL | 12 outils (`chat_tools.py:423-436`). **6 lisent Supabase en direct** (`:516,597,874`), 4 passent par Nest (`bellum_api.py`), 2 sont purs. La règle du PDF n'est donc pas tenue    |
| 19  | 2   | Nouvelle capacité → `tool-registry` + `deriveCapabilityState`, état dérivé                | PARTIEL | `deriveCapabilityState` existe (`tool-registry.ts:167`), aucune colonne d'état en base ✅ — mais la fonction **n'est appelée nulle part en production** (seulement dans son test) |
| 20  | 2   | Nouveau score → colonne `*_score` **+** colonne `*_axes` (jsonb)                          | ABSENT  | 2 colonnes `%_score` (`priority_score`, `contact_score`), **0 colonne `%_axes`** dans les 207 migrations. La convention n'est appliquée nulle part                                |
| 21  | 2   | Nouvel écran → route + entrée de section ; aucune route en double, tout reste atteignable | LIVRÉ   | `apps/web/src/components/navigation/sections.ts:59` (9 sections) + garde `sections.test.ts:45-92` (atteignabilité **et** unicité)                                                 |

### §2.3 — Les 9 interdits en PR

| #   | p.  | Interdit                                    | Statut         | Preuve                                                                                                                                                                                                                 |
| --- | --- | ------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | 2   | Renommer/supprimer une valeur d'enum        | PARTIEL        | convention seule, pas de garde → GA-08                                                                                                                                                                                 |
| 23  | 2   | Modifier une migration appliquée            | LIVRÉ          | `apps/api/src/database/migrations.spec.ts` (collisions, renommage de classe)                                                                                                                                           |
| 24  | 3   | Migration qui promeut un état               | LIVRÉ          | tenu au dernier backfill (arbitrage n°12 du chantier CRM/ATS : « aucun projet promu par la migration »)                                                                                                                |
| 25  | 3   | Écrire en base depuis `apps/ia`             | ABSENT (violé) | `chat_tools.py` lit Supabase en direct (6 outils) ; en lecture seule, mais la frontière n'est pas gardée                                                                                                               |
| 26  | 3   | Second moteur d'envoi                       | ABSENT (violé) | **~16 points d'entrée sur 2 transports** ; garde-fous dupliqués, cf. item 61                                                                                                                                           |
| 27  | 3   | Contourner un test de garde avec `skip`     | LIVRÉ          | aucun `.skip` de garde constaté                                                                                                                                                                                        |
| 28  | 3   | Introduire `any`                            | ABSENT         | règle en `warn` non bloquante (`packages/tooling/eslint/base.mjs:11`) ; `noImplicitAny: false` sur l'API (`packages/tooling/typescript/nestjs.json:19`) ; 9 `any` API, 73 web                                          |
| 29  | 3   | Valeur de remplissage (0, "", date estimée) | PARTIEL        | règle écrite (`CLAUDE.md:154`) et ~15 tests locaux, **aucune garde transverse**                                                                                                                                        |
| 30  | 3   | Exposer un nom de fournisseur au client     | PARTIEL        | gardé côté **copilote** et **i18n** (`tool-capability-digest.spec.ts:159`, `no-vendor-names.test.ts`) ; **pas** sur les réponses REST — la provenance affiche délibérément Apollo/Pappers (`contactProvenance.ts:5-8`) |

### §3 — Carte des modules

| #   | p.  | Domaine                                                                                                | Statut         | Preuve                                                                                                                  |
| --- | --- | ------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 31  | 3   | Compte (`accounts`, `signal_history`, `attack_angles`, `account_vocabulary`)                           | LIVRÉ          | `migrations/1767225600000-Init.ts:79,138`, `1787952416309-SignalHistory.ts:34`, `1783400000000-AccountVocabulary.ts:19` |
| 32  | 3   | ↳ `account_entity` et `site` en tables                                                                 | ABSENT         | `account_entity` vit en JSONB (`org-graph.ts:138`), `site` n'existe nulle part                                          |
| 33  | 3   | Contact (`contacts`, `contact_lifecycle_transitions`, `contact_merges`)                                | LIVRÉ          | `1785600000000-ContactLifecycle.ts:33`, `1786709384712-ContactMergeAudit.ts:38`                                         |
| 34  | 4   | ↳ arêtes d'influence en table                                                                          | ABSENT         | JSONB `org-graph.ts:270`                                                                                                |
| 35  | 4   | Projet (`opportunities`, `project_needs`, `project_contacts`, `loss_reasons`, `pipeline_stage_labels`) | LIVRÉ          | `1789344812907-ProjectPivot.ts:109,135,157,170`                                                                         |
| 36  | 4   | AO (`rfps`)                                                                                            | PARTIEL        | table `1788280000000-RfpStudio.ts:26` ; exigences en JSONB assumé (`rfp.entity.ts:5-12`) ; **blocs de réponse absents** |
| 37  | 4   | Talent (`consultants`, `consultant_skills`, `consultant_documents`)                                    | LIVRÉ          | `1788013450112-Consultants.ts:26`, `1789374912846-TalentPool.ts:38,67`                                                  |
| 38  | 4   | ↳ `cv_version`                                                                                         | ABSENT         | `consultant_cv_rewrites` est un autre objet (`1788092461337-ConsultantCv.ts:26`)                                        |
| 39  | 4   | Positionnement (`submissions`, `interviews`, `submission_feedback`)                                    | LIVRÉ          | `1789382641057-Submissions.ts:30,72,93`                                                                                 |
| 40  | 4   | Matching (`match`, `shortlist`, module `consultant-matching`)                                          | ABSENT         | aucune table, aucun module — seulement des fonctions pures `apps/api/src/modules/consultants/consultant-matching.ts`    |
| 41  | 4   | Mission (`missions`, `mission_assignments`, `mission_commercial_terms`)                                | LIVRÉ          | `1788290000000-DeliveryOs.ts:28,53`, `1789389517264-MissionStaffing.ts:42`                                              |
| 42  | 4   | Finance (`mission_timesheets`, `invoice_readiness`)                                                    | LIVRÉ          | `1788290000000-DeliveryOs.ts:68`, `1789396183472-InvoiceReadiness.ts:26`                                                |
| 43  | 4   | ↳ `payment_event`                                                                                      | ABSENT         | aucun encaissement modélisé                                                                                             |
| 44  | 4   | **Capitalisation** (`rex`, `proof`, `testimonial`, `client_case`)                                      | ABSENT         | le PDF l'annonce absent — **confirmé**, zéro trace                                                                      |
| 45  | 4   | **Partenaire** (`partner`, `partner_placement`, `proof_pack`)                                          | ABSENT         | le PDF l'annonce absent — **confirmé**, zéro trace                                                                      |
| 46  | 4   | Action (`workflow_runs`, `approval_requests`, `credit_reservations`, `outreach_sequences`)             | LIVRÉ          | `1788270000000-ActionOs.ts:32,67,90`, `1785830000000-OutreachSequences.ts:21`                                           |
| 47  | 4   | Intégration (`integrations`, `integration_deliveries`, `crm_connections`, `sync_links`, `sync_runs`)   | LIVRÉ          | `1784200000000`, `1785940000000`, `1783900000000`, `1789403729518-CrmSyncLinks.ts:28,51`                                |
| 48  | 4   | Pilotage (`interventions`, `member_objectives`, `product_events`)                                      | LIVRÉ          | `1789419374625-PlaybooksInterventions.ts:68`, `1788230462911`, `1785600100000`                                          |
| 49  | 4   | ↳ `ritual`                                                                                             | ABSENT         | zéro occurrence dans le monorepo                                                                                        |
| 50  | 4   | Copilote (`chat_messages`, `conversation_summaries`, `memory_pinned_facts`)                            | LIVRÉ          | `1783600000000`, `1784900700000-LongMemory.ts:29,89`                                                                    |
| 51  | 4   | Transverse (`activities`, `tasks`, `notes`, `record_field_audit`, `field_provenance`, `credit_ledger`) | LIVRÉ          | `1789361427193`, `1789368204517`, `1789301274613:60,84,36`, `1784900500000`                                             |
| 52  | 4   | ↳ table `documents`                                                                                    | ABSENT         | absence **documentée et voulue** (`documents.module.ts:9-10`)                                                           |
| 53  | 4   | Indépendance des modules : aucun import d'un service d'un autre module                                 | ABSENT (violé) | **466 à 797 imports croisés** selon le comptage ; aucune règle ESLint, aucun test                                       |

### §4 — Navigation

| #   | p.  | Exigence                                                                                                                                                                                                                                                                                                                                                                                               | Statut  | Preuve                                                                                                                                                                                                                             |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 54  | 4-5 | 9 sections                                                                                                                                                                                                                                                                                                                                                                                             | LIVRÉ   | `sections.ts:59-172`, garde `sections.test.ts:32-39`                                                                                                                                                                               |
| 55  | 4-5 | 16 routes nouvelles (`/briefing/rituels`, `/accounts/partners`, `/projects/needs`, `/consultants/{submissions,pool,reverse}`, `/missions/{cra,renouvellements}`, `/actions/{sequences,chaines}`, `/chat/commandes`, `/pilotage/{kpi,rex}`, `/settings/{import,templates,catalogues}`) — ⚠️ `/missions/actives` et `/missions/facturation` figuraient ici et ne sont PAS marquées neuves dans la source | ABSENT  | 15 des 36 routes attendues existent ; les 16 autres n'ont aucun fichier de route                                                                                                                                                   |
| 56  | 5   | `/accounts/contacts`, `/actions/integrations`, `/pilotage/team` comme sous-routes                                                                                                                                                                                                                                                                                                                      | PÉRIMÉ  | le dépôt les sert comme **onglets** de section (`/contacts`, `/integrations`, `/team`) ; les renommer casserait l'invariant « toute route reste atteignable »                                                                      |
| 57  | 5   | 5 clés de palier nouvelles (`partner_graph`, `delivery_native`, `sequences`, `rex_capitalisation`, `import_migration`)                                                                                                                                                                                                                                                                                 | ABSENT  | `PLAN_FEATURE_KEYS` en compte 14 ; 8 des 12 citées existent                                                                                                                                                                        |
| 58  | 5   | Contrat de route déclaratif `{path, section, tab, requiredPlanFeature, requiredPermission, requiredCapability, degradesWithout}`                                                                                                                                                                                                                                                                       | ABSENT  | 0 occurrence ; l'information est éclatée en 4 sources (`sections.ts`, `PlanFeatureRoute`, `CustomerPage`, rien pour la capacité)                                                                                                   |
| 59  | 5   | 3 règles : palier verrouillé reste visible · permission → 403 API · capacité absente → écran ouvert + bandeau                                                                                                                                                                                                                                                                                          | PARTIEL | 403 réels des deux côtés (`plan-feature.guard.ts:55`, `workspace-permission.guard.ts:46`) ; palier visible ✅ ; **permission côté web = redirection silencieuse** (`CustomerPageContent.tsx:67`) ; capacité : aucun bandeau unifié |
| 60  | 5   | Ordre des guards `auth → workspace → plan_feature → permission → capability`                                                                                                                                                                                                                                                                                                                           | PARTIEL | pas de `CapabilityGuard` ; pas de guard workspace séparé ; **ordre incohérent** — 9 contrôleurs mettent `PlanFeatureGuard` avant `WorkspacePermissionGuard`, 3 l'inverse → message 403 différent selon le contrôleur               |
| 61  | 5   | `CapabilityBanner` réutilisable, 4 états                                                                                                                                                                                                                                                                                                                                                               | ABSENT  | 11 composants de bandeau distincts, aucun unifié                                                                                                                                                                                   |

### §5 — Les 13 machines à états

| #   | p.  | Machine                                                                            | Statut          | Preuve                                                                                                                                                                                                     |
| --- | --- | ---------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 62  | 5   | 5.1 Account priority gate (`pending → prioritised \| parked`)                      | ABSENT          | `priority_gate`/`gate_reason` : 0 occurrence                                                                                                                                                               |
| 63  | 5   | 5.2 Account lifecycle                                                              | PARTIEL         | 5 états d'un autre vocabulaire (`account.ts:52`), **pas de `dormant`**, aucune transition codée, aucun motif                                                                                               |
| 64  | 5   | 5.3 Contact lifecycle                                                              | PARTIEL         | 7 états FR (`classified-data.ts:632`), **`engaged`/`replied` absents**, état **dérivé** et non transitionnel (`:700-718`), journal sans motif                                                              |
| 65  | 5-6 | 5.4 Project stage, 9 valeurs                                                       | LIVRÉ           | `project.ts:52-62`                                                                                                                                                                                         |
| 66  | 6   | ↳ `won → autre` efface `closed_at` et `outcome`                                    | LIVRÉ           | `stageTransitionEffects` — `project.ts:567-578` ; SQL `projects.service.ts:199-220`                                                                                                                        |
| 67  | 6   | ↳ **motif obligatoire vers `lost`**                                                | ABSENT (défaut) | `project.ts:212` dit « Obligatoire pour `lost` », le champ est `nullish()` sans `.refine()`, et `projects.controller.ts:267` passe `?? null`. **Un projet peut être perdu sans motif**                     |
| 68  | 6   | 5.5 ProjectNeed                                                                    | PARTIEL         | 4 valeurs exactes (`project.ts:381`), aucune transition codée, pas de duplication                                                                                                                          |
| 69  | 6   | 5.6 Need staffable (porte G3)                                                      | ABSENT          | `staffable` : 0 occurrence                                                                                                                                                                                 |
| 70  | 6   | 5.7 Talent + `archived` + `consent_expired`                                        | ABSENT          | aucun enum de cycle de vie talent ; `consent_expired` : 0 occurrence (une purge par date existe à la place)                                                                                                |
| 71  | 6   | 5.8 Submission, cycle fermé, `rejected → shortlisted` interdit, motif à la clôture | LIVRÉ           | `submission.ts:62-74` (`ALLOWED_TRANSITIONS` + `canTransition`), `.refine()` motif `:155-158`, garde serveur `submissions.service.ts:170-175`, CHECK SQL. **C'est le modèle à répliquer**                  |
| 72  | 6   | 5.9 Mission, 12 colonnes                                                           | ABSENT          | 6 statuts d'un autre vocabulaire (`mission.ts:27-37`), **aucun board**. ⚠️ i18n désaligné : `missions.json:9-15` déclare `draft`/`at_risk` inconnus de l'enum et oublie `onboarding`/`paused`/`terminated` |
| 73  | 6   | 5.10 Timesheet (CRA), 6 statuts                                                    | PARTIEL         | 4 statuts d'un autre vocabulaire (`mission.ts:77`) ; `attendu`/`absent`/`non_requis` absents ; **aucun endpoint de validation ni de contestation**                                                         |
| 74  | 6   | 5.11 InvoiceReadiness                                                              | LIVRÉ           | 3 états + CHECK SQL ; état **dérivé** non forçable (`invoice-readiness.ts:110-152`) ; `invoiced` irréversible de fait                                                                                      |
| 75  | 6   | ↳ annulation motivée par un admin                                                  | ABSENT          | aucune route, aucun champ motif                                                                                                                                                                            |
| 76  | 6   | 5.12 Rfp                                                                           | PARTIEL         | 7 valeurs d'un autre vocabulaire (`rfp.ts:30-43`) ; **deadline dépassée n'a aucun effet** — `due_at` ne sert qu'au tri                                                                                     |
| 77  | 6   | 5.13 WorkflowRun outcome, `unknown → done` interdit                                | LIVRÉ           | 7 issues exactes (`action-os.ts:97-105`) ; `unknown` arrête la reprise (`workflow-runner.service.ts:377-385`) et compte comme échec (`:492`), testé `:247-253`                                             |
| 78  | 6   | ↳ réconciliation externe pour sortir de `unknown`                                  | ABSENT          | aucun chemin de sortie                                                                                                                                                                                     |

### §6 — Les 9 flux inter-modules

| #   | p.  | Flux                                                     | Statut  | Preuve                                                                                                                                                                                                                                                                       |
| --- | --- | -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 79  | 6-7 | Flux 1 Signal → Projet                                   | PARTIEL | déclenché par la **fin d'analyse** (`analysis.persistence.ts:289`), pas par `signal_history` ; pas de seuil de confiance ; pas de condition `prioritised`. Clé réelle `(account_id, kind, md5(label))` ≠ spec. **Garde tenue** : `qualified` inatteignable sans geste humain |
| 80  | 7   | Flux 2 Projet gagné → Mission                            | ABSENT  | aucun déclencheur sur `won`, aucune proposition ; `missions.opportunity_id` sans unicité                                                                                                                                                                                     |
| 81  | 7   | Flux 3 Besoin ouvert → Matching                          | PARTIEL | calcul pur à la demande (`GET`), **rien de persisté**, `project_needs.skills[]` jamais lu par le matching. Garde « aucun submission créé » tenue                                                                                                                             |
| 82  | 7   | Flux 4 Positionnement → Historique                       | PARTIEL | activité écrite sur **compte + projet** ; **impossible sur le talent** (`ACTIVITY_SCOPES` = account/contact/project, `activity.ts:204`). Idempotence conforme (`submission:{id}:{stage}`)                                                                                    |
| 83  | 7   | Flux 5 Mission → CRA                                     | ABSENT  | aucune clôture de période ; `attendu`/`non_requis` inexistants ; type de contrat absent de `missions` donc garde forfait inapplicable ; clé amputée d'`assignment_id`                                                                                                        |
| 84  | 7-8 | Flux 6 CRA validé → Prêt à facturer                      | LIVRÉ   | `invoice-readiness.service.ts:63-129` + `assessInvoiceReadiness` ; idempotence `(mission_id, period_month)` ; écart ≠ 0 bloque `ready` (`invoice-readiness.ts:138`) ; aucune facture                                                                                         |
| 85  | 8   | Flux 7 Mission terminée → REX                            | ABSENT  | aucune table `rex`                                                                                                                                                                                                                                                           |
| 86  | 8   | Flux 8 REX → Preuve → AO                                 | ABSENT  | aucune table `proof`                                                                                                                                                                                                                                                         |
| 87  | 8   | Flux 9 Activité externe → Timeline                       | LIVRÉ   | `activity-capture.service.ts:64-85`, 3 sources isolées ; idempotence `(workspace_id, source, external_id)` ; participants non écrits si doublon                                                                                                                              |
| 88  | 8   | ↳ garde « le corps jamais restitué **par le copilote** » | LIVRÉ   | pont sans champ `body` (`copilot-bridge/`), garde verrouillée `apps/ia/tests/test_chat_mailbox_tools.py:8`. La timeline montre le corps **à l'utilisateur**, ce que l'arbitrage n°9 du chantier CRM/ATS autorise explicitement                                               |
| 89  | 8   | Registre déclaratif des 9 flux                           | ABSENT  | les contrats vivent en docblock, service par service ; l'outbox existe (`modules/outbox/`) mais n'a **qu'un producteur et qu'un consommateur**, tous deux dans `analysis`                                                                                                    |

### §7 — Matrice d'intervention de l'IA

| #   | p.  | Exigence                                              | Statut  | Preuve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | --- | ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 90  | 8-9 | 5 niveaux I0→I4 avec contrôle et provenance           | PARTIEL | `model_policy.py:34-35` ne classe qu'en **2 niveaux** (`REASONING`/`EXTRACTION`) ; la provenance `human/connector/pipeline/model` existe côté champ (`provenance.ts:32`) mais n'est pas reliée aux niveaux                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 91  | 9   | Matrice par domaine (10 domaines, colonne « Jamais ») | ABSENT  | aucune table de ce type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 92  | 9   | Les 6 interdits absolus de l'IA                       | PARTIEL | (1) inconnu = `null` : garde forte — `provenance.ts:96-142`, métrique CI `no_invented_data` pondérée 0,15 (`apps/ia/app/eval/metrics.py:83`) · (2) `unknown` : garde forte — `action-os.ts:88-107`, `retryOnUnknown: false`, `message-send-provenance.ts:1-23` · (3) critères protégés : **seul des six SANS aucune garde** — respecté par accident de modélisation, pas par décision ; et `photo_url` **est** collecté et stocké (`contacts.service.ts:346-353`), `full_name` circule dans le matching et le prompt CV · (4) verbatim : partiel — REX saisi par l'humain (`consultant-push-feedback.entity.ts:40-42`), aucun test qu'un prompt ne le réécrit pas · (5) injection : garde forte — `apps/ia/app/prompts/fencing.py:15-56` + `test_copilote_security_eval.py` · (6) portes de décision : **aucune notion en code** |

### §8 — Format d'arborescence à 15 niveaux

| #   | p.   | Exigence                                        | Statut              | Raison                                                         |
| --- | ---- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| 93  | 9-10 | Format N1→N15 + 3 exemples + règle de rédaction | HORS PÉRIMÈTRE CODE | convention de rédaction des PDF 2 à 8, qui ne sont pas fournis |

### §9 — Orchestration

| #   | p.  | Exigence                                                                                                                                      | Statut  | Preuve                                                                                                                                                   |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 94  | 11  | Ordre d'écriture en 6 temps ; échec ≥ étape 3 ne perd pas l'objet                                                                             | PARTIEL | comportement de fait (les traces sont best-effort, `submissions.service.ts:398-400`), jamais formalisé                                                   |
| 95  | 11  | Les 6 clés d'idempotence                                                                                                                      | PARTIEL | **2 sur 6** implémentées conformément ; `source_url`, `signal_hash`, `criteria_hash`, `statement_hash`, `collected_from`, `assignment_id` : 0 occurrence |
| 96  | 11  | Compensation en 4 situations                                                                                                                  | PARTIEL | `unknown` traité (`workflow-runner`), `sync_link` en échec traité ; pas de compensation métier généralisée                                               |
| 97  | 11  | Budget : analyse 8 · rafraîchissement 1→4 · enrichissement 1 si trouvé · message/matching/copilote 0 · plafond copilote 50/24 h · réservation | LIVRÉ   | `packages/contracts/src/billing/credit-weights.ts:47-51` ; `CHAT_DAILY_MESSAGE_LIMIT` ; `credit-reservation.service.ts:27`                               |
| 98  | 11  | ↳ réservation utilisée par l'analyse                                                                                                          | ABSENT  | l'analyse **débite puis rembourse** (`analysis.service.ts:862,1029`), exactement ce que `credit-reservation.service.ts:11-13` désigne comme mauvais      |

### §10 — Les 15 points de log

| #   | p.    | Exigence                                                      | Statut  | Preuve                                                                                                                                                                                                                                                                               |
| --- | ----- | ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 99  | 11-12 | 15 points de log, chacun avec sa colonne « consultable dans » | PARTIEL | les objets existent pour la majorité (`activities`, `signal_history`, `contact_lifecycle_transitions`, `submissions`, `record_field_audit`, `invoice_readiness`) ; manquent les points 1 (`account.gate_reason`), 9 (journal de matching), 14 (REX/preuve) et 15 (porte de décision) |

### §11 — Les 18 contrats

| #   | p.  | Contrat                                                                                 | Statut  | Preuve                                                                                                                                                          |
| --- | --- | --------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100 | 12  | `account.ts` + `priority_gate`, `gate_reason`                                           | PARTIEL | fichier ✅, les 2 champs : 0 occurrence                                                                                                                         |
| 101 | 12  | `project.ts` + `staffable`, `staffable_reason`, `closing_chance`, `closing_chance_axes` | PARTIEL | fichier ✅, les 4 champs absents                                                                                                                                |
| 102 | 12  | `match.ts` — 12 axes, `matchResultSchema`, `EXCLUSION_REASONS`                          | ABSENT  | logique hors contrats, **6 axes** (`consultant-matching.ts:51-58`), pas 12                                                                                      |
| 103 | 12  | `shortlist.ts`                                                                          | ABSENT  | `CONSULTANT_PUSH_MAX = 2` est un autre objet                                                                                                                    |
| 104 | 12  | `cv-version.ts`                                                                         | ABSENT  | —                                                                                                                                                               |
| 105 | 12  | `mission-board.ts` — 12 colonnes FR/EN                                                  | ABSENT  | —                                                                                                                                                               |
| 106 | 12  | `board-move.ts` — `effectsForMove`                                                      | ABSENT  | `stageTransitionEffects` (`project.ts:567`) en est l'analogue côté Projet                                                                                       |
| 107 | 12  | `timesheet.ts` — 6 statuts, `expectedWorkingDays`, `dayGap`                             | PARTIEL | 4 statuts dans `mission.ts:77` ; les 2 fonctions : 0 occurrence                                                                                                 |
| 108 | 12  | `mission-score.ts` — 7 axes risque, 5 opportunité                                       | PARTIEL | `missionRisks` + `expansionSignalSchema` dans `mission.ts`, sans comptage ni agrégat                                                                            |
| 109 | 12  | `rex.ts` / `proof.ts`                                                                   | ABSENT  | —                                                                                                                                                               |
| 110 | 12  | `partner.ts`                                                                            | ABSENT  | —                                                                                                                                                               |
| 111 | 12  | `chain.ts` — 7 chaînes, `nextPosition`                                                  | PARTIEL | `pilotage.ts:12-21` porte **8 maillons de mesure**, pas 7 chaînes d'exécution                                                                                   |
| 112 | 12  | `ritual.ts`                                                                             | ABSENT  | —                                                                                                                                                               |
| 113 | 12  | `kpi.ts` — 60 KPI × 7 attributs                                                         | PARTIEL | `product-kpi.ts` — **22 KPI × 5 attributs**                                                                                                                     |
| 114 | 12  | `rbac.ts` — 8 rôles, permissions additives, `can()`                                     | PARTIEL | **7 rôles × 9 permissions** dans `workspace.ts:32,44`, matrice unique `ROLE_PERMISSIONS:88`, fonction `hasPermission:136`. **Permissions additives : absentes** |
| 115 | 12  | `import.ts` — 12 sources, ordre imposé, `SKIP_REASONS`                                  | PARTIEL | `sync.ts` — 5 sources, `SYNC_SKIP_REASONS`, dry-run ✅, pas d'ordre imposé                                                                                      |
| 116 | 12  | `tool-registry.ts` — état dérivé, dernière preuve, dernière erreur                      | LIVRÉ   | `tool-registry.ts:136-190`                                                                                                                                      |
| 117 | 12  | `message-studio.ts` — 8 types, variantes, verdicts                                      | ABSENT  | —                                                                                                                                                               |
| 118 | 12  | Règle : tout contrat portant un calcul expose une fonction pure                         | PARTIEL | 42 des 49 fichiers exportant une fonction ont un test collé ; **aucune garde ne l'impose**                                                                      |

### §13 — Gmail / Outlook / Teams

| #   | p.  | Exigence                                                                      | Statut          | Preuve                                                                                                                           |
| --- | --- | ----------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 119 | 13  | Teams n'a pas de brouillon ; ne jamais dire « brouillon Teams »               | LIVRÉ (de fait) | Teams n'existe que comme **webhook sortant de notification** (`integration-providers.ts:48`) ; aucun libellé « brouillon Teams » |
| 120 | 13  | Relance CRA : brouillon / message préparé / tâche interne selon le connecteur | ABSENT          | dépend du flux 5, absent                                                                                                         |
| 121 | 13  | Bandeau de capacité affiché avant le clic                                     | ABSENT          | cf. item 61                                                                                                                      |

### §14 — Les 15 gardes GA

| #   | p.  | Garde                          | Statut              | Preuve                                                                              |
| --- | --- | ------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| 122 | 13  | GA-01 chemins d'écriture       | PARTIEL             | 3 méthodes en dur                                                                   |
| 123 | 13  | GA-02 couverture démo          | LIVRÉ               | `demo-coverage.spec.ts`                                                             |
| 124 | 13  | GA-03 parité i18n              | LIVRÉ               | `parity.test.ts:32-62` + `enum-keys.test.ts`                                        |
| 125 | 14  | GA-04 isolation d'espace       | ABSENT (transverse) | helpers testés (`workspace-scoping.spec.ts`), aucun balayage des requêtes           |
| 126 | 14  | GA-05 guard par endpoint       | ABSENT              | **22 contrôleurs sur 98** portent un décorateur ; le guard laisse passer par défaut |
| 127 | 14  | GA-06 champs protégés          | ABSENT              | les champs n'existent pas ; garde purement préventive à créer                       |
| 128 | 14  | GA-07 indépendance des modules | ABSENT              | cf. item 53                                                                         |
| 129 | 14  | GA-08 enums additifs           | ABSENT              | aucun snapshot, aucune comparaison à l'état antérieur                               |
| 130 | 14  | GA-09 pas de `any`             | ABSENT              | `warn` non bloquant                                                                 |
| 131 | 14  | GA-10 provenance               | PARTIEL             | tests par chemin, pas de garde transverse                                           |
| 132 | 14  | GA-11 sommes (`null` ≠ 0)      | PARTIEL             | tests par écran                                                                     |
| 133 | 14  | GA-12 outcome `unknown`        | PARTIEL             | un seul moteur couvert                                                              |
| 134 | 14  | GA-13 noms de fournisseurs     | PARTIEL             | copilote + i18n gardés ; réponses REST non                                          |
| 135 | 14  | GA-14 idempotence, 6 clés      | ABSENT              | 2 sur 6                                                                             |
| 136 | 14  | GA-15 fonctions pures          | PARTIEL             | discipline, pas garde                                                               |

### §15 — Les 5 tickets

| #   | p.    | Ticket                                                                     | Statut                         | Preuve / écart                                                                                                                                                                                                                                                                                                                  |
| --- | ----- | -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 137 | 14-15 | **BEL-ARCH-001** matrice de permissions unique + guards généralisés        | PARTIEL — **prémisse périmée** | Le ticket dit « 3 rôles, permissions vérifiées de façon dispersée ». Le dépôt a **7 rôles**, **9 permissions**, une matrice unique et un guard. Restent vraiment à faire : les **permissions additives**, la garde **GA-05**, et le nettoyage des ~12 `role === …` en dur                                                       |
| 138 | 15    | ↳ backfill `member → sales` prescrit par le prompt                         | REFUS                          | ce serait une **révocation silencieuse** d'`integrations:manage` et `billing:manage` pour tous les sièges historiques (`workspace.ts:114` vs `:118-131`), l'inverse de la promesse de la migration RBAC (`1785760000000-RbacRoles.ts:13-19`)                                                                                    |
| 139 | 15    | ↳ edge case « membre supprimé avec portefeuille → réassignation proposée » | ABSENT (défaut réel)           | `removeMember` supprime sèchement (`workspace-team.service.ts:291-304`) : `assigned_to` garde un UUID non-membre, et le self-serve refuse la reprise (`account-assignment.service.ts:90-92`). Comptes **orphelins et verrouillés**                                                                                              |
| 140 | 15    | **BEL-ARCH-002** contrat de route unifié + `CapabilityBanner`              | ABSENT                         | cf. items 58-61                                                                                                                                                                                                                                                                                                                 |
| 141 | 15-16 | **BEL-ARCH-003** registre des flux inter-modules                           | ABSENT                         | cf. item 89                                                                                                                                                                                                                                                                                                                     |
| 142 | 16    | **BEL-ARCH-004** fonctions pures extraites dans les contrats               | PARTIEL                        | `deriveStaffing` ✅ (8 cas) ; `expectedWorkingDays`, `dayGap`, `effectsForMove`, `proofStrength`, `isProofUsable`, `partnerScore`, `rank1Recommendation`, `nextPosition` : **aucune n'existe**. Les 6 axes de matching sont purs et testés (23 cas) mais vivent dans `apps/api`, donc inutilisables par `apps/ia` et `apps/web` |
| 143 | 16    | **BEL-ARCH-005** journal des portes de décision                            | ABSENT                         | `gate_decision` : 0 occurrence ; 11 types d'activité d'espace (`workspace-activity.ts:18-40`), aucun de ce genre ; G1→G8 jamais nommées systématiquement                                                                                                                                                                        |

### §12 et §16 — Les 10 décisions

| #   | p.  | Décision                                            | Statut                         | Raison                                                                                                                                                                                                                                                                                                                 |
| --- | --- | --------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 144 | 12  | D1 coût du parsing CV / « cerveau conseil »         | PÉRIMÉ                         | tranché le 31/07 et livré : parsing/extraction **gratuit** (`talent.service.ts:185`, aucun `consume*`), réécriture de CV = **1 crédit** (`consultants.controller.ts:168`), copilote 0 crédit mais borné à 50/24 h. C'est exactement la reco du PDF                                                                     |
| 145 | 13  | D2 board Missions : 6 ou 12 colonnes                | DÉCISION                       | ouverte — aujourd'hui **ni l'un ni l'autre** : Missions est un écran à **2 lentilles** (`MissionsPage.tsx:58`), et le kanban à colonnes est celui des **Projets, 5 étapes figées**                                                                                                                                     |
| 146 | 13  | D3 cadence de relance : 1 ou 3 touches              | PÉRIMÉ                         | livré, et plus fin que la question : la cadence découle du **scénario relationnel** (`contact-cadence.ts:42-62` — `standard` 4 touches, `linkedin_3_touches`, `referral_short`, `reactivation`), une preuve neuve par touche ; côté autonome `PLAYBOOK_MAX_PER_TARGET = 1`                                             |
| 147 | 13  | D4 prévisionnel pondéré                             | PÉRIMÉ                         | tranché le 16/08 — arbitrage n°4 : « aucune probabilité, aucun forecast pondéré ». Réaffirmé `project.ts:513-514`, `projects.controller.ts:94-95`                                                                                                                                                                      |
| 148 | 13  | D5 cloisonnement de portefeuille                    | DÉCISION                       | ouverte — l'**attribution** existe (`assigned_to`, `PATCH /accounts/:id/assign`, écran `/team`), mais la **lecture reste entièrement ouverte à l'équipe, délibérément** (`shared-workspace-vision.md:272-282`, principe « ne pas se marcher dessus »). Rien n'est réglable par espace                                  |
| 149 | 13  | D6 connecteur : espace ou utilisateur               | PÉRIMÉ                         | tranché : **l'espace** porte le lien (`workspace_id` = scope de lecture partagé par l'équipe), `user_id` ne marque que « créé par » — `crm-connection.entity.ts:9-30`, `google-connection.entity.ts:13-30`, `microsoft-connection.entity.ts:12-25`                                                                     |
| 150 | 13  | D7 conserve-t-on le binaire d'un CV                 | PÉRIMÉ                         | tranché et documenté : **non conservé** — `consultant-document.entity.ts:4-10` (« on stocke le TEXTE extrait, jamais le fichier… garder le binaire multiplierait la surface de donnée personnelle sans usage en face »), + purge plafonnée à 2 ans                                                                     |
| 151 | 13  | D8 Teams : message / notification / tâche           | PÉRIMÉ                         | **message seulement** — Teams est un webhook de chat au même titre que Slack/Discord (`integration-providers.ts:49`) ; ni notification native ni tâche. Réponse imposée par l'API                                                                                                                                      |
| 152 | 13  | D9 multi-entité juridique dans un même espace       | DÉCISION                       | **ouverte, et rien en code** : un `workspace` = un abonnement, un pool. Aucune notion d'entité juridique multiple côté client, aucune décision antérieure dans `decisions-aout-2026.md` ni `crm-ats-plan.md`                                                                                                           |
| 153 | 13  | D10 score de chance de closing exposé au commercial | PÉRIMÉ (**dans l'autre sens**) | tranché : **interdit sur le deal** (cf. D4), **autorisé sur l'engagement** — `crm-pipeline.ts:67-85` expose un score d'engagement en bandes `hot/warm/cold/unknown`, décomposé, avec `score: null` quand rien n'est lisible. La reco du PDF (« oui, avec ses axes ») porte donc sur un objet que le produit s'interdit |
| 154 | 16  | §16 : D2, D3, D4 bloquent le démarrage              | PARTIEL                        | seul **D2** bloque encore ; D3 et D4 sont réglés. Les vraies questions ouvertes sont D2, D5 et **D9**                                                                                                                                                                                                                  |

---

## 2. Ce que le croisement a trouvé et que le PDF ne demandait pas

Six défauts réels, tous vérifiés au code. Ils ne sont pas dans le PDF, mais ils touchent
exactement les invariants qu'il pose.

| #   | Défaut                                                                                                                                                          | Preuve                                                                                                                                                                | Gravité                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| X1  | **Trois chemins d'envoi de mail ne consultent pas la liste d'opt-out** : digest des relances en retard, résumé hebdomadaire, notifications d'équipe             | `notifications.scheduler.ts:134` et `:319`, `workspace-team.service.ts:408` — aucun `isSuppressed`, et `mailer.service.ts:170` dit que c'est à l'appelant de vérifier | **Haute** — RGPD et réputation d'envoi                                                                                                            |
| X2  | **La CI ne garde pas la suite web** : `test-web` est dans `needs:` mais absent du tableau `results` évalué                                                      | `.github/workflows/ci.yml:303` vs `:309-318`                                                                                                                          | **Haute** — 312 fichiers de test ne gardent rien                                                                                                  |
| X3  | **Un projet peut être perdu sans motif** alors que le contrat affirme l'inverse                                                                                 | `project.ts:210-214` + `projects.controller.ts:267`                                                                                                                   | Moyenne                                                                                                                                           |
| X4  | **Le portefeuille d'un membre supprimé reste orphelin et verrouillé**                                                                                           | `workspace-team.service.ts:291-304`, `account-assignment.service.ts:90-92`                                                                                            | Moyenne                                                                                                                                           |
| X5  | **Les libellés i18n des missions sont désalignés de l'enum** : `draft` et `at_risk` n'existent pas, `onboarding`/`paused`/`terminated` n'ont aucun libellé      | `missions.json:9-15` vs `mission.ts:27-37`                                                                                                                            | Basse — mais affiche une clé brute à l'écran                                                                                                      |
| X6  | **Le kind d'activité `stage_change` est déclaré, contraint en SQL, et n'a AUCUN producteur** — changer l'étape d'un projet n'écrit ni activité ni ligne d'audit | `packages/contracts/src/schemas/activity.ts:53` + CHECK `migrations/1789361427193-ActivitiesTimeline.ts:47` vs `projects.service.ts:187-220`                          | Moyenne — c'est exactement la classe de défaut que `wired-write-paths.spec.ts` a été écrit pour attraper, et elle s'est déjà présentée trois fois |

Deux commentaires périmés, sans effet fonctionnel mais trompeurs pour la prochaine
lecture : `routine-catalog.ts:12` (« huit routines » alors qu'il y en a 23) et
`provenance.ts:161` (cite une garde qui n'existe pas).

---

## 3. Lots d'implémentation

Ordonnés par dépendance. Chaque lot est autonome et peut partir seul.

- **Lot A — Les 6 défauts trouvés** (X1→X6, items 67, 139) — dépend de : rien.
  C'est le lot à plus forte valeur : six régressions actives, toutes corrigeables sans
  décision produit. Inclut le durcissement du gate CI, sans lequel les lots suivants
  partiraient avec un filet troué.
- **Lot B — Gardes d'architecture bon marché** (GA-05, GA-06, GA-07 en constat, GA-08,
  GA-09) — dépend de : A.
  GA-05 et GA-08 sont les deux qui empêchent la classe de bug la plus chère
  (endpoint sans guard, enum amputé). GA-06 n'est pas décorative : `photo_url` **est**
  collecté et stocké, et rien n'empêche un futur moteur de sélection de le lire — c'est
  aujourd'hui le seul des six interdits de l'IA sans aucune garde. GA-07 est livré **en
  constat mesuré** et non en échec : 466 imports croisés existants, une garde bloquante
  casserait la CI dès le premier jour — elle fige donc le niveau actuel et interdit
  d'empirer.
- **Lot C — BEL-ARCH-005, journal des portes de décision** (items 143, 92-6, 99-15) —
  dépend de : rien.
  Le plus petit des cinq tickets, et celui dont dépendent les autres pour être
  observables.
- **Lot D — BEL-ARCH-003, registre des flux** (items 89, 95) — dépend de : C.
  Registre déclaratif en code, versionné, qui documente les 9 flux et **teste le rejeu**
  des clés réellement implémentées. Les 4 clés inexistantes sont déclarées comme telles,
  pas inventées.
- **Lot E — BEL-ARCH-002, contrat de route unifié** (items 58-61, 121) — dépend de : rien.
  Étend `sections.ts`, qui porte déjà `to`/`feature`/`managerOnly`.
- **Lot F — BEL-ARCH-001, ce qu'il reste** (items 137, 114, 126) — dépend de : E.
  Permissions additives + GA-05 + suppression des `role === …` en dur. **Sans** le
  backfill `member → sales` (item 138).
- **Lot G — BEL-ARCH-004, fonctions pures manquantes** (item 142) — dépend de : la
  décision D2 pour `effectsForMove`, de rien pour les autres.

Hors périmètre tant que les PDF 2 à 9 ne sont pas fournis : les domaines Capitalisation
(REX/preuves) et Partenaire, le board Missions à 12 colonnes, `message-studio.ts`,
`cv-version.ts`, les 16 routes nouvelles. Les construire depuis le seul PDF 1 reviendrait
à inventer les écrans que les PDF suivants doivent spécifier.

---

## 4. Décisions demandées à Louis

Sept des dix décisions du PDF sont déjà tranchées — cinq dans le sens qu'il recommande
(D1, D3, D4, D6, D7), une imposée par l'API (D8), et une **dans le sens inverse** (D10).
Il en reste **trois** :

| #   | Question                                   | Reco                                                                                                                                                                       | Réponse |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| D2  | Board Missions : 6 ou 12 colonnes          | 12 en **vue de projection** (lecture seule au-dessus de Projets + Missions), jamais une duplication d'étapes — sinon deux vérités de pipe, ce que l'invariant n°1 interdit |         |
| D5  | Cloisonnement de portefeuille              | Garder la lecture ouverte (principe « ne pas se marcher dessus »), ajouter un réglage par espace pour ceux qui veulent cloisonner                                          |         |
| D9  | Multi-entité juridique dans un même espace | Un espace par entité pour l'instant — rien à coder, à réévaluer quand un client le demande                                                                                 |         |

Une quatrième question porte sur la forme de BEL-ARCH-001 : le PDF demande 8 rôles nommés
(`manager`, `recruiter`, `ops`, `finance`), le dépôt en a 7 d'un autre vocabulaire
(`sales_ops`, `sales`, `tech_admin`). Ajouter des rôles et ajouter des **permissions
additives par membre** sont deux travaux différents.

---

## 5. Ce qu'on ne promet pas

- **Le backfill `member → sales`** (item 138) — révoque deux permissions à tous les sièges
  historiques. Si le besoin est de renommer, il faut ajouter un rôle, pas déplacer les
  membres.
- **Une garde GA-07 bloquante** — 466 imports croisés existent ; une garde en échec
  arrêterait la CI sans rien réparer. Livrée en constat figé.
- **Les 16 routes nouvelles** — leurs écrans sont spécifiés dans les PDF 2 à 8, non
  fournis. Créer les routes sans les écrans produirait exactement les « écrans livrés que
  personne n'ouvre » que `sections.ts:5-11` désigne comme le risque à éviter.
- **Renommer `/contacts` en `/accounts/contacts`** (item 56) — casserait des liens
  partagés et des favoris, contre l'invariant « toute route reste atteignable ».
- **Réécrire le vocabulaire des machines à états** (items 63, 64, 72, 73, 76) — renommer
  une valeur d'enum est le premier interdit du §2.3 du PDF lui-même.

---

## 6. État de livraison

Tous les lots sont sur la **PR #988** (`feat/pdf1-architecture-socle`), un commit
par lot.

| Lot | Contenu                                               | Mergé      | Vérifié en live |
| --- | ----------------------------------------------------- | ---------- | --------------- |
| A   | Les 6 défauts trouvés en croisant (X1→X6)             | en attente | en attente      |
| B   | Gardes GA-05, GA-06, GA-07, GA-08, GA-09              | en attente | en attente      |
| C   | BEL-ARCH-005 — journal des 8 portes de décision       | en attente | en attente      |
| D   | BEL-ARCH-003 — registre des 9 flux                    | en attente | en attente      |
| E   | BEL-ARCH-002 — contrat de route + bandeau unique      | en attente | en attente      |
| F   | BEL-ARCH-001 — 2 rôles métier + permissions additives | en attente | en attente      |
| G   | BEL-ARCH-004 — charge attendue et écart d'un CRA      | en attente | en attente      |
| H   | D2 — board Missions 12 colonnes, vue de projection    | en attente | en attente      |
| I   | D5 — cloisonnement de portefeuille réglable           | en attente | en attente      |
| J   | D9 — multi-entité juridique                           | en attente | en attente      |

Suites au dernier commit : **API 396 suites / 5050 tests**, **web 315 / 2581**,
**contrats 96 / 1173**, `check-types` 23/23. La vérification en Chrome (phase 5)
reste à faire APRÈS le merge et le déploiement.

### Phase 5 — la recette en production

Faite sur le lien de démonstration le 19/08/2026, une fois `396174e7` déployé sur
l'API **et** sur le service IA (vérifié en comparant `.commit` et `.ia.commit`
séparément : le service IA était à jour **une minute avant** l'API, et un `grep`
sur le corps entier aurait annoncé « déployé » à tort).

Exercé pour de vrai, pas seulement chargé :

- **X3** — le sélecteur d'étape d'un projet. « Marquer perdu » reste inerte tant
  que le motif est vide, la question s'ouvre AVANT tout envoi, et deux projets
  passés en perte ont bien persisté (le compteur d'entonnoir est tombé de 39 à
  37, et les pastilles affichent « Perdu » après rechargement).
- **Apprentissage** — les deux pertes remontent dans « Ce que Bellum a appris de
  tes usages » (« 1 déclaré obsolète »), donc le motif circule jusqu'au bout.
- **Balayage ZÉRO régression** — les treize entrées de nav et les dix écrans de
  Réglages ouverts un par un. Console sans erreur, tous les appels API en 200.

**Un seul écran cassé, et il ne venait pas de ce chantier** : Missions affichait
des lignes sans titre, toutes « Sans date de fin », et un badge `status.undefined`.
Deux types du MÊME nom avaient divergé — l'API imbriquait la mission sous une clé
`mission`, le web la lisait à plat. `apiFetch` typant par assertion, les deux
côtés compilaient et leurs tests passaient, chacun sur un contrat que l'autre ne
voyait pas. Corrigé et remis en production par la PR #989, avec un test qui fige
la forme du fil.

### Ce qui n'a PAS été fait, et pourquoi

- **La migration des onze bandeaux existants** vers `CapabilityBanner`. Chacun
  est monté dans un écran qui a ses propres tests ; les remplacer à l'aveugle
  échangerait un problème de cohérence contre un risque de régression.
- **Les cinq autres fonctions pures de BEL-ARCH-004** (`proofStrength`,
  `isProofUsable`, `partnerScore`, `rank1Recommendation`, `effectsForMove`).
  Elles portent sur les domaines Capitalisation et Partenaire, qui n'existent
  pas — les écrire sans consommateur produirait exactement le « livré mais
  jamais appelé » que ce chantier corrige par ailleurs.
- **Les 16 routes nouvelles du §4.1.** Leurs écrans sont spécifiés dans les
  PDF 2 à 8, non fournis.
- **La dette de formatage préexistante** (63 fichiers dont `CLAUDE.md` et les
  quatre catalogues du site) : reformater est une décision, pas une corvée.

### Dette préexistante sur `main`, constatée pendant le chantier

Deux gardes sont rouges **avant** ce chantier, sur des fichiers qu'il ne touche pas :

- `pnpm format:check` — 63 fichiers (`CLAUDE.md`, `docs/runbook.md`, les messages du
  site dans les 4 langues…). Le hook `pre-push` échoue pour la même raison.
- `pnpm lint:exports:types` — 26 exports de types sans consommateur, tous dans
  `apps/website/src/features/chatbot/`.

Non traitées ici : reformater `CLAUDE.md` et les quatre catalogues du site est une
décision, pas une corvée. Combiné à X2 (la suite web hors du gate) et au quota
GitHub Actions épuisé, cela veut dire que **la CI ne protégeait plus grand-chose**.

### Décisions de Louis, appliquées

- **D2** → board Missions à **12 colonnes en vue de projection**, jamais une duplication.
- **D5** → lecture ouverte conservée + **réglage par espace** pour ceux qui veulent cloisonner.
- **D9** → **construire le multi-entité juridique** (option lourde ; la réserve — cela touche
  facturation, crédits, sièges et marge sans client identifié qui le demande — a été posée
  avant l'arbitrage et n'a pas été retenue).
- **BEL-ARCH-001** → permissions additives + garde GA-05 + **ajout des rôles manquants**
  (`recruiter`, `finance`), sans le backfill `member → sales` (item 138).
