# Bellum, espace de travail partagé d'une ESN

> Cadrage produit — demandé par Louis (2026-07-20) :
> _« l'écran équipe est trop succinct, faut vraiment que Bellum devienne aussi un espace de
> travail partagé ultra poussé, qu'une ESN se dise "ah ouais en fait j'ai besoin de mon CRM
> et de Bellum et c'est tout" »_
>
> Ce doc fait l'inventaire du collaboratif **réellement livré** (avec file:line), pose la
> frontière avec le CRM, puis classe les chantiers. Rien d'aspirationnel : chaque « déjà là »
> a été vérifié dans le code au 2026-07-20.

---

## 0. La thèse en une page

Une ESN n'achète pas « un outil de collaboration ». Elle achète **du CA sur des grands
comptes**. Le travail collectif qui produit ce CA est décrit noir sur blanc dans la méthode
de Théo (`agent_docs/kb/methode-plan-de-compte-esn.md`, `agent_docs/kb/modele-plan-de-compte.md`) :

- « Ressources à mobiliser : **équipe dédiée** (responsable compte, avant-vente, experts techniques) »
- « **Partage des informations** pertinentes avec l'équipe commerciale élargie »
- « Notre stratégie d'expansion est-elle documentée et **partagée avec l'équipe** ? »
- « Sources pour remplir la fiche : … **intelligence collective** (collègues ayant des infos/contacts) »
- « **Prospection inversée** — commencer par contacter des **consultants ayant déjà travaillé
  chez le compte cible** » (la technique d'ouverture n°1, illustrée par SG : 0 → 27 consultants en 18 mois)

Autrement dit : dans la méthode que Bellum outille déjà, **le compte appartient à l'équipe, pas
au commercial**. Aujourd'hui le produit fait l'inverse — il génère un dossier par personne et
affiche un tableau de bord de reporting. `/team` est un **compte-rendu**, pas un lieu de travail.

La bascule tient en une phrase :

> **Le CRM enregistre ce qui s'est passé. Bellum décide ce qu'on fait ensuite — et le
> « on » est une équipe.**

---

## 1. Inventaire — ce qui est déjà là

### 1.1 Le socle multi-utilisateur : solide, et sous-exploité

Les phases 1 à 6 de `agent_docs/multi-user-workspaces.md` sont **en prod**. Le partage de
données fonctionne réellement :

| Brique                                                       | État                   | Où                                                  |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------- |
| `workspaces` / `workspace_members` / `workspace_invitations` | ✅                     | migrations `1784000000000`+                         |
| Scoping workspace des tables métier                          | ✅ 9 tables `NOT NULL` | `workspace-scoping.ts`                              |
| RLS Supabase alignée appartenance                            | ✅ (backstop)          | migration `1784600000000`                           |
| Invitations email + accept + révocation                      | ✅                     | `workspace-team.service.ts:124-247`                 |
| Sièges (compte + plafond 402)                                | ✅                     | `workspace-team.service.ts:97-156`                  |
| Journal d'activité workspace                                 | ✅                     | `/settings/activity`, `workspace-activity.ts:18-41` |

**RBAC — 7 rôles, pas 3.** La source de vérité est le contrat zod, pas l'entité :
`packages/contracts/src/schemas/workspace.ts:32` →
`owner · admin · sales_ops · sales · tech_admin · member · viewer`, avec une matrice de
7 capacités (`analysis:run`, `contacts:enrich`, `data:export`, `messages:send`, `team:manage`,
`integrations:manage`, `billing:manage`) en `:70-99`, appliquée par
`WorkspacePermissionGuard` (`workspace-permission.guard.ts:26`) sur **33 routes**.

Trois défauts à corriger au passage (petits, mais ils sapent la crédibilité de l'écran) :

- `sales_ops` **détient** `team:manage` mais est refusé sur `/team` par un test en dur
  `role !== 'owner' && role !== 'admin'` (`manager.service.ts:29-31`) et sur le marché
  workspace (`workspace-market.service.ts:58`). Deux portes divergent de la matrice que le
  contrat déclare « source unique de vérité » (`workspace.ts:29-30`).
- L'UI connaît encore **3 rôles** : `ManagerDashboardPage.tsx:13` et
  `AcceptInvitationView.tsx:18` listent `['owner','admin','member']` → `sales_ops`, `sales`,
  `tech_admin`, `viewer` s'affichent en chaîne brute non traduite.
- `member` ≈ `admin` : le rôle legacy garde `billing:manage` **et** `integrations:manage`
  (`workspace.ts:96`), donc un simple membre peut lancer un checkout Stripe et brancher un CRM.
  Documenté comme volontaire, mais surprenant à la vente.

**Pas de switcher de workspace.** `resolveActiveWorkspace` (`workspace-context.service.ts:63-77`)
retourne d'abord la workspace **possédée**. Or la migration seed en crée une à chaque
inscription. Conséquence : **un utilisateur qui possède déjà une workspace ne pourra jamais
accéder à celle où on l'invite** — l'invitation ne fonctionne en pratique que pour un compte
créé via le lien. C'est un bug bloquant pour toute ESN qui invite des gens déjà inscrits.

### 1.2 Ce que voit B quand A analyse un compte

La bonne nouvelle, et elle est réelle : **la lecture du dossier est partagée.** Le compte, les
contacts, les angles, le plan, le vocabulaire, le chat, les faits épinglés, le feedback dossier,
les connexions CRM/Google/Microsoft, l'historique global — tout est lu par `workspace_id`. B voit
même **les messages rédigés par A verbatim** (`email_message`, `linkedin_message`, `phone_script`
sont des colonnes de `contacts`, donc workspace-lues) et son `email_sent_at`. Le cache de
résultat est workspace-scopé, donc B ne relance pas un run que A a déjà payé. Neuf tables sont
`NOT NULL` sur `workspace_id`, la RLS est réalignée sur l'appartenance.

La mauvaise : **dès qu'on quitte la lecture, on retombe en per-user, en silence.**

| Objet                                                                  | Partagé ?                             | Preuve                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| Compte, contacts, angles, plan, chat, messages rédigés, faits épinglés | ✅ workspace                          | scoping Phase 2                                                                |
| Historique d'actions global (`/historique`)                            | ✅ workspace                          | `actions.service.ts:143`                                                       |
| **Activité sur une fiche contact**                                     | ❌ **per-user**                       | `contacts.service.ts:909` `where: { contact_id, user_id }`                     |
| **Ancrage compte du copilote**                                         | ❌ **per-user**                       | `chat-context.service.ts:136` → `findOne(id, userId)`                          |
| **Relancer / patcher une analyse**                                     | ❌ per-user                           | `analysis.service.ts:216,622` ; `analysis-ondemand.service.ts:100,182,234,347` |
| **Supprimer / archiver un compte**                                     | ❌ per-user                           | `accounts.service.ts:755,768`                                                  |
| ~~**Grounding RAG de l'analyse**~~                                     | ✅ workspace (corrigé)                | `rag_service.py:_scope`, migration `1786970000000`                             |
| **Notification signal d'achat**                                        | ❌ **créateur du compte seul**        | `notifications.service.ts:160,168`                                             |
| **Fan-out intégrations `analysis.completed`**                          | ❌ user du job                        | `analysis.worker.ts:648-653`                                                   |
| Séquences outreach (mutations)                                         | ❌ strict-owner                       | `outreach.service.ts:251` `loadOwned`                                          |
| Items d'action du dashboard                                            | ❌ per-user                           | `action-plans.service.ts:43`                                                   |
| Profil ESN / ciblage                                                   | overlay perso sur canonique workspace | `esn-profile-workspace.resolver.ts:56-71`                                      |

Trois constats méritent d'être nommés, parce qu'ils ne sont pas des « features manquantes »
mais des **incohérences** :

1. **Les mêmes lignes `user_actions` sont lues avec deux portées selon l'écran.** Le mail que
   Marie a envoyé au DSI apparaît dans le flux « Historique » de l'équipe, mais **pas sur la
   fiche de ce contact** quand Paul l'ouvre. Paul lit « aucune activité » et écrit au même DSI.
   Le scénario que l'ESN veut éviter, produit par un `where` incohérent.

2. **La variante legacy `accounts.findOne(id, userId)` a encore 10 appelants vivants.**
   Conséquence la plus visible : sur un compte créé par A, le copilote de B perd **tout**
   l'ancrage (`chat-context.service.ts:141-155` dégrade silencieusement en
   `accountData: null`). B ouvre le fil partagé, lit les messages de A, et pose une question :
   l'assistant ne sait plus de quel compte on parle.

3. ~~**La base de connaissances est partagée à l'affichage, pas au moment où elle sert.**~~
   **CORRIGÉ** (PR « RAG workspace-scoped », migration `1786970000000`). Le constat d'origine :
   `apps/ia` n'avait aucune notion de workspace, le RAG y était lu ET écrit par `user_id`, donc
   l'ESN chargeait ses références dans `/knowledge`, l'équipe les voyait dans la liste, **et
   aucune analyse lancée par un autre membre ne s'en servait**.
   Depuis : `workspace_id` est threadé de NestJS jusqu'à l'IA (ingest, query, phases 1 et 4,
   chat, flywheel `rag_knowledge`), les DEUX backends de retrieval sont scopés (full-text ET
   pgvector via `match_rag_documents`), et les lignes historiques ont été rattachées à la
   workspace de leur propriétaire — celles dont la workspace est indéterminable restent
   privées à leur auteur plutôt que d'être rattachées à une workspace plausible.
   ⚠️ Sous-jacent découvert au passage, **non corrigé ici** (il touche le modèle workspace, cf.
   §4) : la policy RLS `workspace_members` (« Members read memberships ») se sous-requête
   elle-même → `infinite recursion` pour le rôle `authenticated`. Sans impact prod (l'API est
   `postgres`/BYPASSRLS, l'IA `service_role`, et la SPA ne lit aucune table en direct) et
   fail-closed, mais le backstop RLS de TOUTES les tables workspace-scopées est inopérant tant
   que ce n'est pas réparé.
   (Corollaire : `conversation_service.save_turn` insère sans `workspace_id` dans une colonne
   passée `NOT NULL` — l'écriture échoue à chaque appel, avalée par un `except` nu
   `conversation_service.py:45-46`. Écriture morte, pas de panne visible.)

### 1.3 Temps réel — une salle par compte, zéro présence

Deux gateways, même namespace `/` :
`AnalysisGateway` (`analysis.gateway.ts:21`, room = **`accountId` brut**) et `ProfilerGateway`
(`profiler.gateway.ts:33`, room = `profiler:<userId>`).

- **Aucune présence** — pas de `OnGatewayConnection`, pas de « qui regarde quoi », pas de
  liste de connectés. Rien à récupérer, tout est à construire.
- **Aucune invalidation live d'objet partagé.** La room est par compte, donc B _peut_
  recevoir le flux… mais seulement si son onglet a déjà `accountStatus === 'analyzing'`
  (`useAnalysisProgress.ts`). B qui charge la page une seconde trop tôt reste sur des
  données périmées **indéfiniment** : rien ne lui dit jamais de refetch. Sur les listes,
  le dashboard ou la veille, il n'existe aucune souscription.
- Deux émetteurs morts : `analysis:degraded` (`analysis.gateway.ts:118`) n'a **aucun
  appelant** alors que toute l'UI client existe (`AnalysisProgressCard.tsx:49-76`), et
  `emitHeartbeat` (`:89`) n'est jamais tiré.
- ⚠️ **Sécurité, hors périmètre de ce doc mais à traiter** : aucun des deux gateways n'est
  authentifié (pas de `JwtGuard`, pas de lecture `handshake.auth`). Connaître un UUID de
  compte suffit à streamer sa progression d'analyse. À corriger avant d'ajouter la moindre
  donnée d'équipe sur le socket.

Les notifications, elles, ne passent **pas** par le socket : polling HTTP 60 s
(`useNotifications.ts`), table `notifications` **sans colonne `workspace_id`**
(`notification.entity.ts:11`).

### 1.4 Fonctions échouées (backend livré, UI injoignable)

L'audit `ui-reachability-audit` est **périmé** : ses 10 orphelins sont tous câblés
aujourd'hui. Mais il reste **un cas inverse, et c'est le plus important du doc** :

> **`GET /workspace/members` n'existe pas.** `useWorkspaceMembers.ts:28` appelle cette route ;
> le seul contrôleur est `@Controller('workspaces')` (pluriel) et n'expose **aucune** route
> `GET` de membres. Le service qui le ferait — `WorkspaceContextService.listMembers`
> (`workspace-context.service.ts:106`) — existe, est complet, et est **du code mort**.

Impact : `ActionPlanBoard.tsx:43` fait `useWorkspaceMembers().data ?? []`, le `?? []` avale
le 404. Donc **le sélecteur d'assignation du plan d'action est vide en permanence**, et toute
la délégation `assigned_to` — service, migration `1784900800000`, validation d'appartenance
(`action-plan-items.service.ts:134`), filtre cockpit `assigned_to_me` (`:198`) — est
**construite de bout en bout et inexploitable**. La seule brique collaborative réellement
livrée du produit est débranchée par une faute de pluriel.

Autres orphelins mineurs : `POST /rag-documents/query` (la base de connaissances peut
ingérer mais pas chercher), `GET /privacy/retention`, `GET /outreach/sequences/:id`.

### 1.5 L'écran `/team` aujourd'hui

⚠️ Piège de nommage : `/team` = `ManagerDashboardPage` (analytique, lecture seule) ;
`/settings/team` = `TeamView` (gestion des membres). Deux écrans, deux buts.

`/team` (`ManagerDashboardPage.tsx`) rend, de haut en bas : en-tête, **4 cartes KPI**
(comptes, contacts, emails, analyses), **une barre pipeline** sur 7 statuts de contact, et un
**tableau membres** à 6 colonnes (membre, comptes, contacts, emails, analyses, dernière
activité). Une seule route l'alimente : `GET /manager/team-stats`
(`manager.controller.ts:15`) — le module n'expose rien d'autre.

Rien n'y est cliquable. On ne peut **rien décider** depuis cet écran. C'est le constat de Louis.

---

## 2. La frontière avec le CRM — et pourquoi elle doit tenir

La promesse « mon CRM + Bellum, c'est tout » n'est pas « Bellum remplace le CRM ». Elle est :
**il n'y a plus de troisième outil, ni de tableur.** Ce que les BM d'ESN ouvrent aujourd'hui
en plus des deux : Excel de plan de compte, Sales Navigator, Notion d'équipe, le Drive des
références clients, et le fil WhatsApp de l'équipe commerciale.

### Ce qu'un CRM fait, que Bellum ne doit pas refaire

Un CRM est un **système d'enregistrement** : comptes, contacts, opportunités, montants,
étapes, dates de closing, prévisions, tâches, journal d'activité, reporting de pipeline.
Il est bon à ça, il est déjà payé, et c'est lui que la direction regarde.

**Bellum ne doit donc jamais construire** : des opportunités/deals avec montants et prévisions,
un pipeline comme système de vérité, de la gestion de tâches générique, des notes-sur-tout.
Théo lui-même range l'historique d'interactions dans le CRM (« Historique des interactions
documenté **dans le CRM** », checkpoint §2) et fait de « consulter le CRM » l'étape 0 du plan
de compte.

> ⚠️ **Dette existante à ce titre** : la barre « Pipeline contacts » de `/team`
> (`new/contacted/replied/meeting/won/lost/archived`) **est** un pipeline CRM, en moins bien —
> pas de montant, pas de date, pas de prévision, et personne ne la tient à jour. Elle
> affaiblit la promesse au lieu de la servir. À remplacer par de l'état de **travail**
> (couverture du portefeuille, comptes sans owner, comptes qui décrochent), pas de l'état de
> **transaction**.

### Ce que Bellum fait, qu'aucun CRM ne fera

Un CRM ne sait que ce qu'on y a déjà tapé. Il est **aveugle sur ce qui n'est pas encore une
relation**. Il ne connaît ni les programmes IT du client, ni ses recrutements, ni ses appels
d'offres, ni les ESN déjà en place, ni la chaîne de décision, ni par quel angle entrer. Il ne
dit pas _qui_ appeler ni _pourquoi maintenant_, et il n'écrit pas le message.

**La ligne, à défendre telle quelle :**

|                                                                                                   | Propriétaire |
| ------------------------------------------------------------------------------------------------- | ------------ |
| Qui cibler, pourquoi maintenant, par quelle porte, avec quel message                              | **Bellum**   |
| Cartographie décisionnelle, entités, signaux, concurrence ESN en place                            | **Bellum**   |
| **Le plan de compte et son exécution collective** (portefeuille, threads, cadence, thread achats) | **Bellum**   |
| Le fait qu'un email/appel/RDV a eu lieu, l'opportunité, le montant, la prévision                  | **CRM**      |

Le collaboratif que ce doc propose se tient **entièrement du côté gauche**. C'est le test à
appliquer à chaque idée : _si Salesforce le fait déjà correctement, on ne le construit pas ;
on l'exporte._

---

## 3. Les chantiers, classés

Critère de classement : (valeur pour une ESN) × (levier sur le code existant) ÷ (taille).

### P1 — Portefeuille : le compte a un responsable ⭐ le premier à faire

**Quoi.** Une colonne `accounts.assigned_to` : chaque compte a un commercial responsable, ou
est explicitement « non attribué ». Le manager répartit depuis `/team` ; le commercial voit
« mes comptes ». `/team` devient un plan de charge : qui porte quoi, quels comptes ne sont
portés par personne, lesquels décrochent.

**Pourquoi une ESN.** C'est littéralement la méthode : « équipe dédiée (**responsable
compte**, avant-vente, experts techniques) ». Et c'est le prérequis structurel de trois autres
jobs : ne pas se marcher dessus, reprendre un compte quand quelqu'un part, voir qui est en
difficulté. Sans notion de responsable, un compte appartient à celui qui a tapé le nom — ce
qui n'est une règle d'attribution dans aucune ESN.

**Déjà là.** Le scoping workspace ; la matrice RBAC ; le module `manager` et son écran ;
le patron d'assignation déjà écrit pour les items de plan d'action
(`action-plan-items.service.ts:114-153`, validation d'appartenance en `:134`).
**Manque.** La colonne, l'endpoint d'attribution, l'UI, et — prérequis — la route membres.
**Taille.** M. **Dépend de.** Rien.

### P2 — Ne pas se marcher dessus : l'activité devient visible par l'équipe

**Quoi.** `findContactActivity` passe de `user_id` à `workspace_id` et expose **l'auteur**.
Sur une fiche contact : « Marie a envoyé un email il y a 3 jours ». Sur un compte déjà porté
par un collègue, un bandeau au lieu d'une découverte a posteriori.

**Pourquoi une ESN.** Deux BM qui écrivent au même DSI d'une banque à trois jours d'écart,
c'est le grand compte qui le remarque, et c'est le référencement qu'on abîme. Le risque est
structurel en ESN : les gros comptes sont travaillés par plusieurs BM sur des BU différentes.

**Déjà là.** Les lignes existent, workspace-stampées, et le flux global les lit déjà par
workspace (`actions.service.ts:262`). **Manque.** Un `where` cohérent + le nom de l'auteur +
le rendu. **Taille.** S — c'est le meilleur rapport valeur/effort du doc.
**Dépend de.** Rien. À faire même si tout le reste est reporté.

### P3 — Réparer le « partagé » qui ne l'est pas

**Quoi.** Trois incohérences de portée (§1.2), traitées comme un seul chantier de cohérence :
(a) **le grounding RAG devient workspace** — threader `workspace_id` jusqu'à `apps/ia`, qui
n'en a aujourd'hui aucune notion ; (b) **les 10 appelants de `accounts.findOne(id, userId)`**
passent en workspace, ce qui rend au copilote son ancrage compte pour un coéquipier et rouvre
relance/patch d'analyse à l'équipe ; (c) l'écriture morte `save_turn` côté IA.

**Pourquoi une ESN.** C'est le chantier qui rend vraie la promesse déjà affichée. Une ESN
charge ses références, ses cas clients et ses grilles **une fois**, par le manager — et
aujourd'hui aucune analyse d'un commercial ne s'en sert. C'est précisément ce qui distingue
« l'IA de tout le monde » d'un copilote qui connaît **notre** maison. On vend déjà cet écran ;
il ne fait pas ce qu'il dit.

**Déjà là.** Le RAG, `/knowledge`, l'ingestion Drive/Notion, le scoping NestJS, les helpers.
**Manque.** Un champ `workspace_id` dans le contrat API↔IA + les `where` côté IA + la reprise
des 10 appelants legacy. **Taille.** M. **Dépend de.** Rien — mais touche la frontière API↔IA,
où un autre agent travaille (cf. §4).
**Note.** C'est plus une dette qu'une feature. À mes yeux ça ne se « vend » pas, mais tant que
ce n'est pas fait, tout discours « espace de travail partagé » est démenti par le produit.

### P4 — Les signaux préviennent l'équipe, pas le créateur de la ligne

**Quoi.** `notifications` gagne `workspace_id` ; un signal d'achat notifie le **responsable
du compte** (P1) et, à défaut, les managers — plus « le user qui a tapé le nom ».
Idem pour le fan-out intégrations `analysis.completed` / `buy_signal` (Slack/Teams).

**Pourquoi une ESN.** La veille (`watchlist-refresh`, cron quotidien) est une des rares
briques qui travaillent **pendant que l'équipe dort**. Aujourd'hui son résultat part à une
seule personne, souvent celle qui a créé le compte il y a six mois. Un signal manqué est une
fenêtre de tir manquée — et la méthode est explicite : « Levée / acquisition → **timing
idéal** ».

**Déjà là.** Le système de notifications complet (table, préférences, cloche, cron) ; le
fan-out intégrations. **Manque.** `workspace_id` sur `notifications` + la règle de
destinataire. **Taille.** S/M. **Dépend de.** P1 pour le meilleur destinataire.

### P5 — Coaching sur la méthode (pas sur la personne)

**Quoi.** Pour chaque commercial, la **distribution de ses threads sur la matrice
Pouvoir × Intérêt** face au repère de la méthode, et son taux de réponse face aux
**benchmarks de Théo** (C-level 10-15 %, N-1 20-30 %, N-2 30-40 %).

**Pourquoi une ESN.** La méthode nomme explicitement l'erreur n°1 du commercial :
« Erreur = **80 % du temps sur Q3 sans pouvoir** ». C'est diagnosticable
automatiquement — Bellum calcule déjà la zone de chaque contact
(`prioritization.py`, `ZONE_ENGAGEMENT`). Un manager peut alors dire « tes 40 threads sont à
85 % sur des relais terrain, tu n'as aucun sponsor » — un constat **méthodologique et
actionnable**, pas un décompte d'activité.

**La forme juridique compte** (cf. §4) : on compare une pratique à un **référentiel métier
documenté**, on agrège, on ne chronomètre personne. Un tableau « qui a envoyé combien de mails
cette semaine » est une autre feature, avec un autre régime juridique, et un bien moindre
intérêt produit.

**Déjà là.** Zones et bandes d'accessibilité calculées ; grille contact /100 ; module manager.
**Manque.** L'agrégation par membre + le rendu + les repères. **Taille.** M.
**Dépend de.** P2 (pour un taux de réponse honnête).

### P6 — Pack vendor-ready partagé (thread achats)

**Quoi.** Un espace d'équipe pour les pièces exigées par les achats : présentation 2 pages,
références par secteur, CV types, RGPD, assurances RC Pro, ISO, NDA, MSA, grille TJM — plus
les scripts d'objection achats.

**Pourquoi une ESN.** La méthode impose d'ouvrir le thread achats **dès la semaine 2**, avec
un pack préparé **avant** la prospection. Ces pièces sont un actif **de l'entreprise**, pas du
commercial : aujourd'hui chacun rechercher la dernière version dans le Drive. Aucun CRM ne
porte ça.

**Déjà là.** `library_items` (CRUD réel), le RAG, l'ingestion Drive/Notion.
**Manque.** Une catégorie dédiée + le rendu + le rattachement au thread achats du plan.
**Taille.** S/M. **Dépend de.** Rien.

### P7 — Mémoire d'équipe sur le compte : l'intelligence collective, enfin outillée

**Quoi.** Un objet « ce qu'on sait déjà », partagé, structuré, sur le compte : **quels de nos
consultants y ont travaillé** (la prospection inversée), qui connaît qui, missions passées,
pourquoi on a perdu la dernière fois, quel est notre statut de référencement.

**Pourquoi une ESN.** C'est **la** technique d'ouverture n°1 de la méthode, et l'exemple
chiffré du doc (SG, 0 → 27 consultants) en dépend. C'est aussi ce qu'aucun CRM ne modélise :
un CRM connaît les _clients_, pas **les consultants de l'ESN et leur historique de mission
chez le prospect**. C'est l'actif propriétaire d'une ESN, et il vit aujourd'hui dans la tête
des gens et dans WhatsApp.

**Déjà là.** Plus qu'attendu : `memory_pinned_facts` (faits épinglés libres par
`(workspace_id, account_id)`, `memory.service.ts:109`) et `account_feedback` (feedback
structuré append-only, réinjecté dans les prompts via `directivesFor:163`) sont **déjà
workspace-scopés**. Le squelette du « ce qu'on sait déjà » existe donc, sans le vocabulaire
métier ESN.
**Manque.** Le modèle des missions/consultants, l'UI, et une décision produit : jusqu'où
modélise-t-on le staffing sans devenir un outil de staffing ?
**Taille.** M/L. **Dépend de.** Rien techniquement — mais mérite un cadrage avec Théo.
**Pourquoi si bas malgré sa valeur.** Il est le plus différenciant du doc, mais aussi le seul
dont la forme n'est pas déductible du code ou de la méthode : il faut décider ce qu'on
modélise. Le classer haut sans ce cadrage produirait une entité qu'on jetterait.

### P8 — Ce qui a marché devient le playbook de l'équipe

**Quoi.** Un message qui a obtenu une réponse remonte comme modèle réutilisable ; un angle qui
a converti devient un play d'équipe.

**Pourquoi c'est reporté malgré son attrait.** Deux verrous **structurels**, pas cosmétiques :

1. **On ne stocke pas les messages.** Il n'existe aucune table `messages`. Ce qui survit à un
   envoi : `contacts.email_sent_at` (un timestamp, un seul par contact **à vie**),
   `contacts.email_message` (le brouillon, **écrasé** à chaque envoi), et une ligne
   `user_actions` qui garde **le sujet mais pas le corps** (`contacts.service.ts:1420-1432`).
   Sans corps de message conservé, « le message qui a marché » n'existe pas.
2. **On ne capte pas les réponses.** Aucun inbound (Resend inbound / IMAP), donc « a obtenu
   une réponse » n'est pas mesurable. C'est déjà identifié en v1.1 du Palier 1
   (`vision-copilote-actions.md`).

**Taille.** L. **Dépend de.** Une table de messages + la capture des réponses. À traiter comme
un chantier à part entière, pas comme une extension de `/team`.

### Hors classement — les corrections de justesse à embarquer au passage

Peu coûteuses, mais chacune fait mentir un écran :

- **`GET /workspace/members` 404** → débloque l'assignation du plan d'action, déjà livrée (§1.4).
- **Pas de switcher** → une invitation à un utilisateur déjà inscrit ne fonctionne pas (§1.1).
- **`sales_ops` refusé sur `/team`** malgré `team:manage` (§1.1).
- **Listes de rôles périmées** dans deux écrans (§1.1).
- **Gmail/Outlook n'incrémentent aucun compteur** : ni `email_sent_at`, ni `user_actions`.
  Une équipe qui passe par Gmail voit ses « emails envoyés » à zéro. Trois écrans comptent
  déjà les envois sur **trois sources différentes** (`dashboard-roi.service`,
  `manager.service`, `actions.service`) et peuvent légitimement diverger.
- **Sockets non authentifiés** (§1.3) — bloquant avant tout ajout d'équipe sur le socket.
- **La base de connaissances ne peut pas être cherchée** : `POST /rag-documents/query` existe
  et n'est appelé par personne — `/knowledge` liste et ingère, mais ne cherche pas.
- **Les exports CRM ne poussent pas les mêmes champs** : HubSpot 7 champs, Salesforce 5
  (perd `company` et LinkedIn), Pipedrive perd le poste et LinkedIn, Attio le téléphone hors
  format `+`. L'UI les présente comme interchangeables. À afficher honnêtement.

---

## 4. Contraintes dures — à ne pas contourner

**Facturation au siège.** Le collaboratif augmente mécaniquement le nombre de sièges utiles
(un manager qui ne prospecte pas veut quand même son accès). Les sièges sont comptés
`membres + invitations en attente` et plafonnés en 402
(`workspace-team.service.ts:117,147-156`) — un rôle `viewer` **consomme un siège plein**
alors qu'il n'a aucune permission. Si `/team` devient l'écran du manager, il faut trancher :
le manager en lecture est-il un siège facturé ? (Défaut recommandé : oui, mais le dire.)

**Mutualisation du quota — ⚠️ dépendance active.** Le quota d'analyses est un pool workspace,
et **un autre agent unifie le compteur de crédits en ce moment même**. Ce doc ne propose
**aucun modèle de crédits concurrent** et n'en propose délibérément pas. Toute idée du type
« budget d'enrichissement par commercial » est **hors périmètre tant que le compteur unifié
n'a pas atterri**. À reprendre après.

**Chantiers concurrents — à ne pas percuter.** Au moment d'écrire ce doc, d'autres agents
travaillent sur : la comptabilité crédits + compteur unifié, le provisionnement client manuel
du DM (**qui touche workspaces et sièges** — donc P1 et §4 sièges), la frontière événementielle
IA→API (**donc P3**), Prettier, l'herméticité des tests IA, et les overlays/popovers de
`apps/web` (**donc toute UI `/team`**). P1 et P3 ont chacun un recouvrement réel : à
séquencer, pas à résoudre en silence.

**RLS sur chaque table.** Toute table neuve (mémoire d'équipe P7, messages P8) doit arriver
avec sa policy d'appartenance workspace, sur le modèle de la migration `1784600000000`. La
barrière primaire reste le service layer — l'API tourne en `postgres` BYPASSRLS — mais le
backstop n'est pas optionnel.

**RGPD — la donnée d'activité d'un membre est une donnée personnelle.** C'est le point le
plus sérieux du doc, et il conditionne la **forme** de P5.

Un tableau qui affiche, par salarié nommé, son volume d'activité et son horodatage de
dernière action est un **traitement de surveillance de l'activité des employés**. En droit
français/européen cela emporte des obligations concrètes : finalité déterminée et légitime,
**minimisation**, information préalable des personnes, consultation du CSE (art. L2312-38 du
Code du travail dès qu'un dispositif permet le contrôle de l'activité), inscription au
registre des traitements, durée de conservation bornée, et souvent une AIPD. Un usage
disciplinaire d'un outil présenté comme un outil d'aide à la vente est un risque réel pour le
client — donc pour nous.

Ce n'est **pas** une raison de ne pas faire P5. C'est une raison de le faire dans la bonne
forme :

- **Coacher sur la méthode, pas chronométrer la personne.** « 85 % de tes threads sont en
  Q3 » est un constat méthodologique face à un référentiel documenté. « 14 mails lundi contre
  31 pour Marie » est un classement de productivité — autre finalité, autre régime.
- **Agréger et borner.** Fenêtres glissantes, pas de timeline à la minute. Se rappeler que
  `/team` expose déjà `last_activity_at` par personne : c'est déjà de la donnée de
  surveillance, aujourd'hui sans cadre.
- **Symétrie.** Le commercial voit sur lui-même exactement ce que son manager voit sur lui.
  C'est la meilleure garantie d'acceptabilité, et ça coûte un `role` dans une requête.
- **Documenter.** Une entrée dans `agent_docs/legal/privacy-retention-policy.md` + une
  mention dans la DPA, au moment où P5 part — pas après.

**Règle produit permanente.** i18n FR + EN livrées ensemble ; jamais de donnée inventée — un
état vide affiche « aucune donnée », jamais un nombre plausible ; entrée changelog FR+EN pour
toute feature visible ; chaque module NestJS reste indépendant (règle #7).

---

## 5. Séquence recommandée

```
P1  Portefeuille (responsable de compte) + route membres        ← fait /team un lieu de travail
P2  Activité partagée sur contact                               ← le meilleur ratio du doc, indépendant
P3  Cohérence workspace (RAG grounding, copilote, 10 appelants) ← dette : rend vraie la promesse actuelle
P4  Notifications d'équipe (signaux → responsable/managers)
P5  Coaching méthode (zones Pouvoir×Intérêt vs benchmarks)      ← cadre RGPD à poser AVEC
P6  Pack vendor-ready partagé (thread achats)
P7  Mémoire d'équipe / prospection inversée                     ← cadrage Théo d'abord
P8  Playbook « ce qui a marché »                                ← après table messages + capture réponses
```

P1, P2 et P3 sont indépendants et parallélisables. P4 gagne à suivre P1 (il lui donne un
destinataire juste). P5 dépend de P2 pour un taux de réponse honnête. P7 et P8 méritent chacun
leur propre cadrage.

**Si un seul chantier passe : P1.** C'est celui que Louis a demandé (« que `/team` arrête
d'être un compte-rendu ») et le seul qui débloque structurellement trois autres jobs.
**Si deux : P1 + P2** — P2 coûte peu et supprime le risque le plus embarrassant vis-à-vis du
client final.

**Ce qui est livré dans la PR qui accompagne ce doc : P1** (+ la correction de la route
membres, qui débloque au passage l'assignation du plan d'action). Le reste attend l'arbitrage
de Louis.

---

## 6. Décisions à trancher

1. **P1** — qui peut attribuer un compte ? (défaut proposé : `team:manage` attribue à
   n'importe qui ; un commercial peut se saisir d'un compte **non attribué**, mais pas
   déposséder un collègue.) Un compte peut-il avoir plusieurs responsables (BM + avant-vente) ?
2. **P1** — que fait-on des comptes existants à la migration ? (défaut proposé :
   `assigned_to = NULL`, « non attribué », plutôt que de présumer que le créateur est le
   responsable — présumer produirait une répartition fausse le jour 1 sur des workspaces
   à un seul membre historique.)
3. **`viewer` consomme-t-il un siège facturé ?** (§4)
4. **P5** — valide-t-on le cadre « coaching méthode » plutôt que « reporting d'activité » ?
   Et informe-t-on les membres dans l'app au moment où l'écran arrive ?
5. **P7** — jusqu'où modélise-t-on nos consultants sans devenir un outil de staffing ?
6. **Switcher de workspace** — le corriger maintenant (une ESN qui invite des inscrits est
   bloquée) ou après ?
7. **La barre « Pipeline contacts » de `/team`** — §2 argumente qu'elle duplique le CRM et
   devrait céder la place à de l'état de travail. La PR qui accompagne ce doc **ne la retire
   pas** (elle ajoute la couverture portefeuille au-dessus) : supprimer un élément déjà livré
   est un arbitrage produit, pas une décision d'implémentation. À trancher.

---

## 7. Ce qui est livré avec ce doc (P1)

Périmètre exact de la PR, pour que la lecture du doc ne laisse pas croire à plus :

- `accounts.assigned_to` (migration `1786958241077`), **sans backfill** — tout part
  « non attribué », cf. décision 2.
- `PATCH /accounts/:id/assign` dans un module autonome `assignment/` (règle #7 — il ne touche
  pas `accounts.service.ts`). Droits lus dans la matrice RBAC : manager = alloue ; commercial =
  se saisit d'un compte libre, libère le sien ; `viewer`/`tech_admin` refusés.
- `GET /workspaces/members` — la route manquante. Elle **rebranche au passage la délégation
  d'action du plan de compte**, livrée mais inexploitable (§1.4).
- `/team` : couverture du portefeuille, file « à attribuer » avec attribution en un clic,
  colonnes **Portefeuille** et **En veille** (14 j) dans le tableau des membres, et les 7 rôles
  RBAC enfin traduits.

**Non livré, et volontairement** : P2 à P8, le switcher de workspace, la levée du gate
`owner|admin` sur `/team` (elle mérite sa propre PR — elle change qui voit l'écran), et le
retrait de la barre pipeline.
