# Lot N — Decathlon : les entités du groupe dépliables ; « Data Nice » sans faux lieu

Branche : `claude/decouvrir-n-marque-ville-0111`

## Compris

- Recette prod 31/10 18:21 UTC (après lot E) : `?freetext=Decathlon` → 1 ligne DECATHLON, 0 bruit phonétique (PASS), MAIS 0 entité dépendante visible : BEL DECATHLON, FONDATION D'ENTREPRISE DECATHLON, SCI DECATHLON - SALVA… ne sont ni listées ni DÉPLIABLES sous la tête. Le brief E disait « regroupées sous UNE tête, les autres dépliables ». Code : IA `apps/ia/app/routers/discover.py:4039` (#4892.3 pose `brandGroup`), web `apps/web/src/features/discover/lib/discover-brand-group.ts:11` RETIRE les membres de la liste (`filter(... role === 'member' ...)`) — rien ne les ré-affiche.
- Recette 01/11 (#5002.3) : « Data Strasbourg » → zone Strasbourg PASS ; mais la seule garde est « un mot avant la ville » (`discover-needs-freetext.ts:236-247`) : « Data Nice », « Java Orange »… → Nice/Orange deviennent des zones même quand le mot est un mot courant ou une marque.

## Je fais

1. **#4892.3 dépliable** — la ligne tête d'un `brandGroup` porte « + N entités du groupe » (N = membres reçus) ; un clic DÉPLIE les membres sous la tête (nom, SIREN, ville, effectif), replié par défaut. Aucun membre perdu : un membre dont la tête n'est pas dans la liste reste une ligne normale (comportement actuel gardé). Toujours PROPOSÉ, jamais fusionné. Toutes les langues ; démo : si un `brandGroup` existe dans le semis, il se déplie, sinon classer dans `demo-coverage.ts` avec raison. Si les membres n'arrivent pas jusqu'au web (IA ou API les retire), les transmettre (test pytest/jest). Test de NON : l'ancien code (membres filtrés, sans dépli) échoue.
2. **#5002.3 ville ambiguë** — une commune en fin de phrase SANS marqueur (« à », « sur », « près de ») devient la zone SAUF si son nom est un mot courant ou une marque : liste NOMMÉE et courte, à un seul endroit (ex. Nice, Orange, Tours, Vienne, Grasse — critère écrit : mot courant FR/EN ou marque connue). Dans ce cas le mot reste MOT-CLÉ et l'écran PROPOSE « Chercher à <Ville> ? » (puce suggestion, un clic pose la zone). Tests : « Data Strasbourg » → zone ; « Data Nice » → mot-clé + suggestion ; « développeur à Nice » → zone (inchangé).
3. Tests qui savent dire NON, un par point.

## Je ne fais PAS

Lot F (onglets, SIREN), lot M (Laura, Jobintree, total affiché).

## Droits

Aucune surface d'accès touchée.

## Je défais

Rien de décidé ; citer « garde #4892.3 », « garde #5002 » aux lignes touchées.

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/lib/zones/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/ia/app/routers/discover.py`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/demo/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/decouvrir-n-marque-ville-0111` (SIMPLE ; pre-push en run_in_background puis attendu) ; après chaque push `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify`/`--force`.
- PUSH APRÈS CHAQUE POINT VERT ; PR PRÊTE vers main dès le premier point poussé.
- Plafond 200 tours. Tests CIBLÉS seulement ; Prettier 3.9.10 ; nouveau test web ⇒ une ligne dans `tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; aucune source nommée ; une absence n'est jamais « 0 » ; on PROPOSE une fusion, jamais on ne fusionne.
- Rapport ≤ 10 lignes.
