# Brief — lot L8a : Laura lit la base (#4791 et ses enfants)

Branche : `claude/laura-lit-la-base-l8a` (ce fichier est déjà dessus). Base `origin/main`.
Agent : écrivain. **Plafond : 300 tours.** À 240 : commit et push du vert, rapport, stop. **≤ 40 points** : si les issues en portent plus, livre les plus fermants d'abord et liste le reste.

## Les issues (lis chacune EN ENTIER, avec ses commentaires, par `gh api repos/Bellum-AI/belllum-monorepo/issues/<N>` et `/comments`)

- **#4791** — Épopée : la base est une source de PREMIER RANG (besoins, comptes, consultants déjà en base). Chapeau : lis-la pour le cadre, ne la ferme pas.
- **#4759** — Laura reçoit un oui/non au lieu de l'historique des besoins.
- **#4794** — Laura interroge la base : « les besoins Java sur Lille », « les consultants qui ont bossé à Lille ».
- **#4421** — « trouve-moi des missions » pour un consultant : agir sans questionner (comptes avec besoins et contacts).
- **#4563** — « trouve-moi des offres <compétence> sur <ville> » ne rend aucune offre : elle retombe sur la recherche web.
- **#4760** — Analyser : prouver que l'historique décoté entre vraiment dans l'analyse.
- **#5014** — Laura annonce qu'elle n'a pas lu le CRM quand il n'est pas importé.

**Antériorité d'abord** (mesuré : 4 lots sont partis recoder du livré) : pour chaque issue, `git log --oneline -S <symbole> origin/main` et `git grep` AVANT de coder ; si c'est déjà livré, écris la preuve `fichier:ligne` et ne code rien. Chaque demande d'une issue = un point `#N.k` dans ton rapport.

## Contrat

**Je fais** : les outils de Laura (`apps/ia/app/services/chat_tools.py`, `apps/api/src/modules/chat/` — `chat-context.service.ts`, `laura-probe.service.ts`) lisent la base de l'espace comme source de premier rang : historique des besoins (pas un oui/non), recherche de besoins par compétence + ville, consultants par lieu de mission passée, missions pour un consultant (comptes avec besoins + contacts, sans questionner quand la demande est claire), offres par compétence + ville depuis la base avant le web. Laura DIT quand une source n'est pas branchée (CRM non importé : elle le nomme, sans nommer nos fournisseurs).

**Je ne fais PAS** : pas d'interface nouvelle (le rendu passe par les cartes existantes) ; pas de nouvelle collecte ni de nouveau fournisseur payant ; pas de borne d'âge sur l'historique (décision Louis 31/10 : signaux et besoins, zéro borne d'âge) ; aucune donnée inventée (échec = erreur claire).

**Droits** : la base est lue **dans l'espace de l'utilisateur seulement** (filtre de tenant au plus près de la donnée, jamais `where: { id }` seul). Un test prouve qu'un utilisateur d'un autre espace ne lit rien (le test qui dit NON).

**Je défais** : nomme dans un commit (« revient sur #N » / « garde #N ») chaque `#N` que `git blame` attache aux lignes modifiées.

## Pièges

- Doctrine : on nomme ce que l'espace a BRANCHÉ, jamais nos fournisseurs ; le coût ne s'agrège jamais entre espaces ; pertinence avant coût.
- Python : chaque outil touché a son test pytest (`apps/ia/tests/`), ciblé (`cd apps/ia && python -m pytest <fichiers> -q`).
- API : jest ciblé (`cd apps/api && node node_modules/jest/bin/jest.js <specs>`), `pnpm --filter @bellum/api check-types:tests` si des specs changent.
- Démo (craft rule 9) : si une réponse nouvelle est visible en démo, réponse scriptée dans `features/demo/` ou `apps/api/src/modules/demo/`, classée dans `demo-coverage.ts`.
- Évals : si un prompt change, la porte qualité IA est un gate CI bloquant (`apps/ia/evals/`) ; ne baisse aucun seuil.

## Périmètre

Périmètre : apps/ia/app/**, apps/ia/tests/**, apps/ia/evals/**, apps/api/src/modules/chat/**, apps/api/src/modules/ia/**, apps/api/src/modules/demo/**, apps/web/src/features/demo/**, packages/contracts/src/**

## TDD et gates — CIBLÉS

- Tests d'abord, par point. pytest ciblé, jest ciblé, `tsc -p` du paquet touché.
- **JAMAIS** la suite complète, le `check-types` racine, le build, ni `pnpm ci:local`.

## Livrer

Commits (sujet ≤ 100 caractères, scope ia/api/contracts/tooling), numéros dans le sujet. Trace `# #N.k` / `// #N.k` au comportement. **Push** : `GARDE_PORTE_PUSH=0 git push --no-verify origin HEAD:claude/laura-lit-la-base-l8a` après chaque point vert, puis `git ls-remote` pour prouver l'arrivée. **N'ouvre PAS de PR.**

Rapport (≤ 15 lignes) : SHA, points livrés (`fichier:ligne`), déjà là (preuve), non faits + raison, fichiers hors périmètre. Puis STOP.
