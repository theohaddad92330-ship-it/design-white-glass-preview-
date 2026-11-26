## Ce que je fais

1. #4599.4 — mesuré en prod (cfe0fedab2) : `GET /contacts?placeholderEmail=true` → 10 fiches à adresse gabarit encore en base (ex. prenom.nom@totalenergies.com) ; PlaceholderEmailCatchupService existe mais sa route est sous InternalSecretGuard → jamais lancée. ATTENDU : un ADMIN DE L'ESPACE peut déclencher le rattrapage DE SON espace : SIMULATION d'abord (compte des fiches concernées, sans écrire), puis exécution explicite bornée ≤ 100 fiches ; champ vidé, ancienne valeur + date AU JOURNAL (on archive, on ne supprime pas) ; jamais déclenché au déploiement ; n'écrase jamais une valeur gardée par un humain (keptByHuman). Point d'entrée minimal : endpoint + bouton dans l'écran d'admin/qualité de données EXISTANT ; si aucun écran n'existe, endpoint seul et dis-le.
2. #4603.5 — mesuré en prod : /accounts?q=veep → 0 actif, 3 « Veepee » archivés au lieu de 1 ; AccountsCrmFusionBanner (AccountsPage.tsx:550, conditionnée par counters.crm) n'apparaît pas → geste de fusion inatteignable. ATTENDU : trouver POURQUOI la bannière ne s'affiche pas (condition, compteur, donnée) et corriger pour qu'elle apparaisse dès qu'il existe des paires à proposer ; la fusion reste une PROPOSITION que l'utilisateur valide (doctrine : on ne fusionne JAMAIS seul) ; simulation comptée avant tout geste, borne ≤ 100.

## Je ne fais PAS

Je ne lance AUCUN rattrapage réel en prod (Louis le fera après lecture du chiffre de simulation). Aucune fusion automatique. Aucune migration destructive. Rien sur Découvrir ni Laura. Rien sous .claude/.

## Droits

- Voit et déclenche : admin de l'espace (owner/admin), sur SON espace seulement (filtre tenant au plus près de la donnée).
- REFUSÉ : membre simple (403), autre espace (403/404), non connecté (401). Un test prouve CHAQUE refus.
- La route interne InternalSecretGuard existante reste telle quelle.

## Je défais

Rien ; garde #4599 (garde d'entrée des gabarits) et #4603 (fusion proposée).

Périmètre : apps/api/src/modules/contacts/** · apps/api/src/modules/accounts/** · apps/web/src/** (bannière + bouton) · locales FR+EN · apps/api/src/modules/demo/** · CHANGELOG* · docs/briefs/**

## Méthode

- Antériorité : `git log -S` sur PlaceholderEmailCatchupService, AccountsCrmFusionBanner, counters.crm ; citer les #NNN touchés dans les commits.
- TDD : test qui échoue d'abord (jest API, vitest web). Tests de refus de droits obligatoires.
- Trace `// #<point> — <raison>`.
- Règles du dépôt (CLAUDE.md) : optional chaining sur données Supabase, aucune donnée fictive, démo couverte (demo-dataset.ts + demo-coverage.ts) si l'écran change.
- PR prête vers main, titre `Rattrapages de stock vus en recette 31/10 (#4599.4 #4603.5)`, corps = tableau + section Droits + « comment lancer la simulation », fin du body : `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
