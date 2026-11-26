===== BRIEF (contrat VALIDÉ par Louis le 31/10/2026 — rien à redemander) =====

## Ce que je fais — 7 défauts mesurés en production (prod = cfe0fedab2)

1. #4523.1 — /contacts/<id> à 1512×828 : l'aside droit (290 px) a `position: sticky; top: 16px` mais son top = 1432 px à scrollTop 0 (≈1 400 px vides en haut de la colonne droite), puis -68 @1500, -1568 @3000 : jamais épinglé. ATTENDU : la colonne droite commence en haut à côté du contenu et reste épinglée en défilant (sticky sur un enfant direct d'une grille `items-start`, pas étiré, pas précédé d'un bloc haut) ; < 768 px inchangé.
2. #4193.2 — /projects : en-tête « 23 affaires dans cette vue » = 23 lignes du tableau, mais colonnes ouvertes du kanban 6+6+3+4 = 19 : 4 GAGNÉES comptées dans l'en-tête et le tableau, hors kanban. ATTENDU : en-tête, kanban et tableau comptent la MÊME chose (affaires actives ; les gagnées sortent du compte ou sont nommées à part, jamais mêlées) ; libellé « N actives ».
3. #3803.2 — visionneuse de document (CSV/xlsx déposés, ex. /settings/knowledge) : CSV fraîchement déposé → aperçu texte brut + « Original non conservé », aucune grille ni onglets. ATTENDU : CSV/xlsx déposé s'affiche en GRILLE (en-têtes + lignes ; onglets pour xlsx) ; si l'original n'est pas conservé au dépôt, trace pourquoi et corrige pour les dépôts NEUFS seulement (aucun rattrapage).
4. #2408.81 — /missions?vue=liste, menu de chaque ligne : 6 items, aucun « Demander à Laura » ; MissionsTable.tsx sans AskLaura ; présent par ligne seulement dans MissionTrackingTable.tsx:475. ATTENDU : le menu de ligne de MissionsTable porte « Demander à Laura » avec le contexte de LA mission, même composant/comportement que MissionTrackingTable.tsx:475 (ouvre la bulle si montée, cf. #4345).
5. #4526.3 — /accounts?crm=only&lens=followed : puces « Suivis » + « HubSpot 4 » pressées → 3 comptes (AUREOSYS, SERVICES LOGICIELS D'INTE…, BENETEAU), aucun des 4 CRM ; AccountsPage.tsx:381/505 `followedLens` = liste des suivis à part. ATTENDU : les filtres se COMBINENT (intersection Suivis ∩ CRM), l'URL garde les deux, compteurs cohérents.
6. #2212.15 — guide « Découvrir des comptes » : guide-registry.ts:159-164 pas sans `actions` (retrait VOULU par #3646) ; type `fill-and-advance` (guide-store.ts:51) plus utilisé ; clé guide.json:96 « Écrire moi-même » orpheline. ATTENDU : GARDER #3646 (pas d'exemple remis) ; retirer le type mort et les clés orphelines FR+EN ; test qui prouve qu'aucun pas ne référence une action inexistante.
7. #3586.9 — changelog : entrée FR/EN absente pour #3586. ATTENDU : entrée CHANGELOG FR + EN du changement livré par #3586 (lis l'issue si gh disponible, sinon git log --grep 3586).

## Je ne fais PAS

Aucune donnée réécrite, aucun droit modifié, aucune migration, rien sur Découvrir (moteur, filtres, zone) ni sur Laura (prompts, outils). Rien sous .claude/.

## Je défais

Rien. #3646 est GARDÉ.

## Droits

Aucun accès modifié : mêmes rôles, mêmes routes.

Périmètre : apps/web/src/** · locales FR+EN · apps/api/src/modules/projects/** et apps/api/src/modules/accounts/** (seulement si le compte #4193.2 / l'intersection #4526.3 se calcule côté API) · module API des documents/knowledge (#3803.2 seulement) · apps/api/src/modules/demo/** · CHANGELOG* · docs/briefs/**

## Méthode

- Antériorité d'abord : `git log --oneline -S '<symbole>' origin/main | head` sur chaque fichier touché ; toute ligne qui porte un #NNN se cite dans le commit (« garde #N » / « revient sur #N »).
- TDD : par point, un test qui ÉCHOUE d'abord (vitest + Testing Library ; jest côté API). #4523.1 : jsdom ne met rien en page → teste la STRUCTURE (classes grille/items-start/sticky) et dis-le au rapport.
- Règles design (CLAUDE.md) : pas de hex en JSX, échelle typo, dvh, pas de <Navigate>, cibles ≥ 44 px, mouvement via packages/ui/src/motion.ts. Démo : si un écran change ce qu'il affiche, demo-dataset.ts + demo-coverage.ts.
- Trace `// #<point> — <raison>`. Commits par écran : `fix(web): … (#4526.3)`.
- PR prête vers main, titre `Correctifs vus en recette prod 31/10, vague 2 (#4523 #4193 #3803 #2408 #4526 #2212 #3586)`, corps = tableau point → ce qui change → test, fin du body : `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
