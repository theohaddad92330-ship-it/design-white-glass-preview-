# PRD Design Produit — BellumAI V2.3 (distillé)

> Distillé du "PRD Design System Produit BellumAI V2.3" (Google Drive). Source de cadrage UI/produit.
> Ici on garde UNIQUEMENT ce qui contraint la SORTIE / le livrable que voit un commercial : pages, sections, blocs visibles et contrats de données. Le styling pur (couleurs, spacing, recettes CSS, tokens, typo) est volontairement écarté.
> Aucune donnée personnelle. Les noms d'exemple du PRD (Nordia Group, Marc Lefebvre…) sont des fixtures, pas des données réelles.

## TL;DR — pourquoi ce doc contraint les prompts

Le PRD définit ~20 pages produit. Chaque page exige 4 niveaux de lecture : **décision → justification → preuve → action**. Toute donnée affichée doit être prouvable (source, fraîcheur, agent, confiance) et actionnable. Donc chaque prompt doit produire des objets structurés qui remplissent ces écrans : pas de prose décorative, pas de KPI sans action, jamais de données fictives — si une donnée manque, état contrôlé ("Non détecté" / "Non renseigné"), pas un tiret brut ni un fallback inventé.

Règles de fond transverses (impactent directement le contenu généré) :

- **Court / précis / actionnable / prouvé** : 1 phrase de description par bloc, 2 lignes max par carte. Toujours nommer le compte, le contact, le signal ou l'action. Chaque insight doit pouvoir afficher source + fraîcheur + agent/confiance.
- **Interdits de copy** : "super opportunité", "IA magique", "insight intéressant", "une opportunité intéressante est disponible", badges "new/hot/boost/AI powered". Pas d'enthousiasme artificiel, pas de ton chatbot, pas d'emoji.
- **Score** : toujours un label lisible **GO / WATCH / NO_GO** (80-100 GO, 55-79 WATCH, 0-54 NO_GO).
- Une carte = décision + justification + preuve + action. Une carte principale par page.

## Contrats TypeScript de base (cités par le PRD)

Ces types sont le socle de sortie attendu côté produit (les prompts doivent produire de quoi les remplir) :

- `Account` : `id, name, sector?, status?("new"|"watch"|"priority"|"archived"), score?, scoreLabel?("GO"|"WATCH"|"NO_GO"), lastAnalysisAt?`
- `Contact` : `id, accountId?, firstName, lastName, role?, email?, phone?, linkedinUrl?, persona?("sponsor"|"decision_maker"|"influencer"|"relay"|"unknown"), score?, enrichmentStatus("not_started"|"partial"|"enriched"|"failed"), verifiedEmail?, verifiedPhone?`
- `Signal` : `id, accountId, title, summary, category("job"|"news"|"tech"|"organization"|"finance"|"other"), strength("low"|"medium"|"high"), sourceName?, sourceUrl?, detectedAt, commercialImplication?`
- `AgentRun` : `id, agentName("watch"|"contacts"|"score"|"export"|"jobs"|"pdf"), status("queued"|"running"|"completed"|"failed"), startedAt?, completedAt?, outputSummary?, errorMessage?`

## Templates dynamiques validés (forme exacte des phrases générées)

| Contexte            | Template                                                                     |
| ------------------- | ---------------------------------------------------------------------------- |
| Compte prioritaire  | `{accountName} montre une fenêtre commerciale exploitable à court terme.`    |
| Signal détecté      | `Signal {strengthLabel} détecté sur {accountName}.`                          |
| Contact recommandé  | `{contactName} est la meilleure porte d'entrée identifiée.`                  |
| Action              | `Préparer une approche centrée sur {salesAngle}.`                            |
| Veille vide         | `BellumAI n'a pas détecté de changement exploitable sur ce compte.`          |
| Contact vide        | `Lancez un enrichissement pour identifier les portes d'entrée commerciales.` |
| Export indisponible | `Le dossier pourra être généré dès que l'analyse compte sera complète.`      |

## Pages produit — structure + données attendues

Chaque page a 4 états obligatoires (loading / empty / error / filled). Ci-dessous : sections visibles + contrat de données (= ce que les prompts/back doivent fournir).

### / — Nouvelle analyse (page d'entrée)

- Sections : Hero + formulaire ; agents mobilisés (Veille, Contacts, Score, Export) ; analyses récentes ; bloc "Ce que BellumAI produit" = `Dossier compte, contacts recommandés, plan d'action, export commercial`.
- Données : `RecentAnalysis[]`, `AnalysisRequest { query }` (nom d'entreprise, URL ou SIREN).

### /analysis/:analysisId/running — Analyse en cours

- Sections : header compte analysé ; progression globale ; timeline agents (Veille = sources/signaux, Contacts = profils/portes d'entrée, Score = priorisation) ; rail sources en cours.
- Données : `AgentRun[]`, `AnalysisProgress { percent, currentStep, estimatedRemainingSeconds }`. Logs techniques cachés au 1er niveau.

### /cockpit — Cockpit

- Sections : 4 KPI max (`Comptes prioritaires, Actions à lancer, Contacts à enrichir, Exports prêts`) ; DecisionCard priorité du jour ; NextActionCard ; file "Actions à lancer" (5 max) ; table comptes prioritaires ; bande agents actifs.
- Données : `CockpitSummary { metrics, priorityAccount, nextAction, actionQueue, priorityAccounts, agentRuns }`. Chaque KPI lié à une action.

### /accounts — Comptes

- Sections : tabs `Tous / Prioritaires / À suivre / Archivés` ; recherche+filtres ; table enrichie 8 colonnes : **Compte, score, fraîcheur, signal principal, contact recommandé, prochaine action, statut, ouvrir**.
- Données : `AccountRow[]` (score, signal dominant, contact recommandé, nextAction). Donnée absente → "Non détecté".

### /accounts/:accountId — Compte / Vue d'ensemble (PAGE MODÈLE)

- Sections : header compte + badges (secteur, statut) ; **Lecture BellumAI** + score ; **Justification** ; metric strip 4 (`Potentiel estimé, signaux récents, contacts clés, fraîcheur`) ; 3 cartes : **Meilleure porte d'entrée** (contact), **Signal principal**, **Prochaine action** ; section "Pourquoi maintenant ?" ; rail (comptes similaires, sources, agents).
- Données : `AccountOverview { aiReading, score, metrics, recommendedContact, mainSignal, nextAction, similarAccounts, sources, agentRuns }`.

### /accounts/:accountId/contacts — Contacts recommandés

- Sections : hero "Votre chemin d'accès recommandé" (séquence d'approche en 3 étapes) ; **≤4** ContactPathCards (contact = nom + persona/rôle + CTA générer message/enrichir/voir fiche) ; segmented control par entité/persona/technologie ; accordéons entités ; CTA "Étendre la recherche au groupe".
- Données : `RecommendedContactPath { steps[] }` + `ContactSummary[]`. NE PAS afficher la base contacts complète ici.

### /accounts/:accountId/orgchart — Organigramme

- Sections : canvas nodes ; rail lecture (meilleur point d'entrée + accélérateur) ; légende `Sponsor, décideur, influenceur, relais` ; CTA "Ajouter au plan d'action".
- Données : `OrgChartData { nodes, edges }`. Edge type : `hierarchy | influence | recommended_path`.

### /accounts/:accountId/watch — Veille & signaux

- Sections : 4 KPI ; timeline signaux ; rail implications + sources + comptes à analyser ; filtres par catégorie.
- Données : `Signal[]` avec `commercialImplication`. **Chaque signal affiché doit avoir une implication commerciale** (sinon le signaler proprement, pas d'actu brute).

### /accounts/:accountId/sites — Sites [circuit à préparer]

- Sections : 4 KPI (`Sites détectés, sites prioritaires, régions couvertes, potentiel terrain`) ; carte (MapFranceLite) ; table sites (`Ville, type, score, signal, action`) ; rail "Pourquoi ces sites".
- Données : `SitePriority[] { city, region, type, priorityScore, potentialLevel, coordinates?, signals }`. Jamais de géoloc inventée.

### /accounts/:accountId/action-plan — Plan d'action

- Sections : résumé décisionnel (objectif + angle) ; timeline d'actions datées ; rail objectifs/risques/dépendances ; action bar export.
- Données : `ActionPlan { objective, angle, steps[] }` ; chaque step : `status, dueInDays, relatedContactId?`. Chaque action liée à un contact/signal/objectif (pas une todo générique).

### /contacts — Contacts globaux

- Sections : 4 KPI (`Contacts détectés, contacts enrichis, à enrichir, contacts clés`) ; recherche+filtres ; table (`Contact, compte, persona, score, statut, dernier signal, action`) ; selection panel (voir fiche / générer message / ajouter au plan / enrichir).
- Données : `ContactRow[] { accountName, persona, score, enrichmentStatus, lastSignal }`.

### /contacts/:contactId — Fiche contact

- Sections : header enrichi + sous-titre (rôle - compte) ; score + badges vérification (`Sponsor, email vérifié, téléphone vérifié, contact clé`) ; actions (générer message / ajouter au plan / enrichir) ; 3 cartes : **Informations clés**, **Pourquoi ce contact est clé**, **Signaux liés** ; timeline activité.
- Données : `ContactDetail { verification, signals, relations, activity }`. Champ absent → "Non renseigné". Badges non vérifiés ne doivent jamais paraître vérifiés.

### /watch — Veille globale

- Sections : 4 KPI ; filtres catégories (`Tous, recrutement, actualités, organisation, technologie, finance`) ; timeline globale (`Signal, compte lié, force, implication, source, action`) ; rail implications prioritaires + comptes à relancer + agents actifs.
- Données : `Signal[]` global (avec `accountId`), triable par strength et fraîcheur.

### /sites — Sites globaux [circuit à préparer]

- Sections : KPI (`Sites détectés, régions actives, sites prioritaires, comptes multi-sites`) ; carte ; table (`Site, compte, région, score, signal, action`) ; rail régions chaudes.
- Données : `SitePriority[]` global.

### /action-plan — Plans d'action globaux

- Sections : KPI ; kanban léger / table par statut (`À lancer, en cours, bloqué, terminé`) ; panel détail ; filtres compte/propriétaire/échéance. Action card = `Titre, compte, contact lié, échéance, statut`.
- Données : `ActionPlanSummary[]` + `ActionStep[]`. Pas de propriétaire → "Non assigné".

### /exports — Exports

- Sections : KPI (`Exports prêts, exports en cours, comptes couverts, dernier export`) ; table (`Dossier, compte, sections, statut, créé le, action`) ; preview rail.
- Données : `ExportSummary[] { status, sections, createdAt, accountId, fileUrl? }`.

### /exports/:accountId — Export dossier compte (livrable PDF commercial)

- Sections : panel d'options à gauche ; preview PDF ; action bar sticky.
- **Sections du dossier sélectionnables (= structure du livrable PDF vendable)** : `Résumé exécutif, Battle card, Contacts, Organigramme, Veille, Plan d'action`.
- Options : `Inclure sources, inclure pagination, masquer données incomplètes`.
- Données : `PdfExportConfig { sections[], includeSources, includePagination, hideIncompleteData }`. Jamais de PDF avec données fictives.

### /agents — Agents

- Sections : KPI ; cards agents `Veille, Contacts, Score, Jobs, PDF, Export` (chaque card : statut, dernière exécution, sortie produite, échec éventuel) ; table dernières exécutions ; panel erreurs.
- Données : `AgentRun[]` + `AgentDefinition[]`. Logs détaillés en accordéon secondaire. Ne pas cacher les échecs.

### /workspace — Workspace [circuit à préparer]

- Sections : colonnes `Messages générés, dossiers exportés, notes de compte, brouillons à relire` ; rail contexte compte ; recherche globale. Card message = `Compte, contact, angle, statut, dernière modification`.
- Données : `WorkspaceItem[] { type, accountId, contactId, title, status, updatedAt }`. Chaque item relié à un compte ou une action.

### /settings — Paramètres

- Sections : `Profil, entreprise, thème, crédits, sources, exports, sécurité`. Clés API et sources masquées.
- Données : `UserSettings, WorkspaceSettings, Billing/Credits`.

## Synthèse — ce que les prompts doivent produire pour remplir ces écrans

Champs/sections de sortie attendus (mapping prompt → écran) :

1. **Lecture BellumAI** (`aiReading`) + **Justification** — 1-2 phrases nommant le compte → Compte/Vue d'ensemble, Cockpit DecisionCard.
2. **Score commercial** + **label GO/WATCH/NO_GO** (Go/No-Go argumenté) — partout (Account, Contact, Site).
3. **Signaux** typés (`category`, `strength`, `sourceName/Url`, `detectedAt`) AVEC **`commercialImplication`** obligatoire — Veille (compte + globale), section Veille du PDF.
4. **Contact recommandé / chemin d'accès** : `RecommendedContactPath.steps[]` + persona + email/tel vérifiés + "pourquoi ce contact est clé" — Contacts recommandés, Fiche contact, Organigramme.
5. **Organigramme** : nodes (persona/rôle) + edges typés `hierarchy|influence|recommended_path` — Organigramme.
6. **Prochaine action** + **Plan d'action** : `objective, angle, steps[]` datés et liés à contact/signal — Plan d'action, Cockpit NextActionCard.
7. **Sites** : `SitePriority[]` (ville, région, type, score, niveau, signaux) — pages Sites (back à venir).
8. **Sources & fraîcheur** par insight (preuve), **outputSummary par agent** (`AgentRun`) — rails + page Agents.
9. **Sélection de sections d'export** assemblées en dossier PDF : Résumé exécutif, Battle card, Contacts, Organigramme, Veille, Plan d'action.

Règle d'or pour tout prompt : si une donnée n'existe pas, renvoyer un état contrôlé ("Non détecté" / "Non renseigné" / "à qualifier"), jamais un tiret brut ni une donnée inventée — chaque élément visible doit être traçable à une source.
