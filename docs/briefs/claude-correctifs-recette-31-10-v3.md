# Brief — correctifs vus en recette prod 31/10, vague 3 (#4197.2 #4167.3 #4197.4 #2732.1 #2732.2 #5022.1 #2276.61 brouillon Laura)

Contrat VALIDÉ par Louis le 31/10/2026 — rien à redemander.

## Ce que je fais — défauts mesurés en production (prod = cfe0fedab2)

1. #4197.2 + #4167.3 — ANCIENNES ADRESSES avalées par une route `$id` : /missions/board → « Mission introuvable » ; /actions/chaines → « Action introuvable ». apps/web/src/lib/legacy-addresses.ts n'a pas d'entrée pour elles. ATTENDU : chaque ancienne adresse redirige vers sa nouvelle place (#4197.2 : la vue tableau/kanban des missions ; #4167.3 : Pilotage › Pipe, où vit le tableau Parcours). CHERCHER LES JUMEAUX : lister par `git log -S` / git grep toutes les routes retirées ou déplacées depuis septembre dont le chemin tombe sous un `$id` (missions, actions, accounts, contacts, projects, consultants) et les déclarer toutes ; test : chaque ancienne adresse listée → redirection, jamais l'écran « introuvable ». Une redirection se fait par le mécanisme EXISTANT de legacy-addresses.ts (pas de <Navigate>).
2. #4197.4 — /missions/planification : une seule puce « 30 j », pas de 60/90, pas de colonne Renouvellement. ATTENDU : puces 30 / 60 / 90 j (filtrent les missions finissant dans la fenêtre) + colonne « Renouvellement » (état du renouvellement de la mission, « — » si inconnu, jamais 0).
3. #2732.1 + #5022.1 — import de MISSION (SKAIZen) : l'écran ne dit pas les formats acceptés, et l'import n'écrit pas la mission. ATTENDU : l'écran d'import dit les formats acceptés avant le dépôt ; un fichier valide crée réellement la ou les missions (visibles dans /missions) ; une ligne refusée est NOMMÉE avec sa raison, jamais un silence. Réutiliser les chemins d'écriture existants (`CreateMissionFromDocumentDialog` → POST /delivery/missions, `useCreateMission`) ; WRITABLE_IMPORT_OBJECTS (packages/contracts/src/schemas/import.ts:172) exclut mission PAR DESIGN dans le wizard générique : si tu dois l'élargir, la contrainte SQL/contrat d'abord (GA-11), et dis-le au rapport.
4. #2732.2 — import de VIVIER : un fichier de consultants crée réellement les consultants dans /consultants (CvZipImportDialog.tsx:32, appelé ConsultantsPage.tsx:393) ; mêmes formats dits, mêmes messages de refus que les missions. Si c'est déjà juste, prouve-le (test) et dis-le.
5. #2276.61 — un job composé de Laura (LauraJobService, apps/api/src/modules/action-os/laura-job.executor.ts) arrive à l'état terminal, l'accusé `laura.job.completed` part par LONG_JOB_NOTIFIER, mais RIEN n'apparaît dans la cloche Notifications de l'app (mesuré en prod : panneau ouvert 2-3 min après « Terminé », aucune ligne). ATTENDU : la fin du job (terminé / échoué / partiel, statut dit tel quel) crée une notification in-app dans la cloche, avec lien vers la conversation. Test : job terminé → une notification in-app pour l'utilisateur qui l'a lancé, et pour lui seul.
6. Brouillon de Laura PARTAGÉ entre onglets : deux onglets sur /chat mélangent leur saisie (brouillon en localStorage sous une clé unique). ATTENDU : un brouillon PAR CONVERSATION (clé = id de conversation ; nouvelle conversation = clé « new » propre à l'onglet) ; revenir sur une conversation retrouve son brouillon ; un envoi efface le brouillon de CETTE conversation seulement.

## Je ne fais PAS

Aucune nouvelle route, aucune page retirée, aucun droit changé, aucune donnée réécrite (pas de rattrapage), rien sur Découvrir ni sur les prompts de Laura. #2276.48 (coût) et #2276.49 (durée) : NE PAS TOUCHER (arbitrage Louis : crédits jamais affichés, durée seulement si mesurée). Rien sous .claude/.

## Je défais

Rien. Garde #4197, #4167, #4468, #1451.1.

## Droits

Aucun accès modifié : mêmes rôles, mêmes routes. Notification #2276.61 : seul l'utilisateur qui a lancé le job la reçoit (test de refus : un autre membre de l'espace ne la voit pas).

Périmètre : apps/web/src/** · locales FR+EN · apps/api/src/modules/action-os/** · apps/api/src/modules/notifications/** · apps/api/src/modules/delivery/** · apps/api/src/modules/consultants/** · apps/api/src/modules/import/** · packages/contracts/src/schemas/import.ts · apps/api/src/modules/demo/** · CHANGELOG* · packages/contracts/src/changelog/** · docs/briefs/**

## Méthode

- Antériorité d'abord : `git log --oneline -S '<symbole>' origin/main | head` sur chaque fichier touché ; toute ligne qui porte un #NNN se cite dans le commit (« garde #N » / « revient sur #N »).
- TDD : par point, un test qui ÉCHOUE d'abord (vitest + Testing Library ; jest côté API).
- Règles design (CLAUDE.md) : pas de hex en JSX, échelle typo, dvh, pas de <Navigate>, cibles ≥ 44 px, icône nommée, mouvement via packages/ui/src/motion.ts. FR + EN pour tout texte. Changelog si user-facing. Démo : si un écran change ce qu'il affiche, demo-dataset.ts + demo-coverage.ts.
- Trace `// #<point> — <raison>`. Commits par écran avec les numéros dans le sujet.
- PR prête vers main, titre `Correctifs vus en recette prod 31/10, vague 3 (#4197 #4167 #2732 #5022 #2276 brouillon Laura)`, corps = tableau point → ce qui change → test, fin du body : `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
