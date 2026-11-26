# Brief cloud — suite des défauts r55-r60 (02/11/2026)

Plafond : 300 tours ; à 240, commit + push de ce qui est vert, rapport, stop.
Conception : #2074.16 étend le contrat « mouvement d'audit → action » (l'API ne connaît que `ruleId`) avec un risque de cycle ProfileContext ↔ ActionPlanItems — arbitrage d'implémentation.
Branche : `claude/defauts-suite-r55-r60-02-11`, créée depuis origin/main (elle CONTIENT main). Tu es le SEUL pousseur. Push SIMPLE après chaque point (jamais --force / --no-verify / rebase). AUCUNE PR : le fil l'ouvre.
Avant le premier push : `pnpm install --frozen-lockfile` puis `pnpm --filter @bellum/contracts build && pnpm --filter @bellum/shared build` (le pre-push lance check-types et exige les deps construites).
Rapport : `docs/briefs/claude-defauts-suite-r55-r60-02-11-rapport.md` (≤ 15 lignes : livrés avec SHA, non faits avec cause, écarts).

Ces points sont le RESTE du lot `claude/defauts-r55-r60-02-11` (son rapport : `docs/briefs/claude-defauts-r55-r60-02-11-rapport.md` sur cette branche-là, `git show origin/claude/defauts-r55-r60-02-11:docs/briefs/claude-defauts-r55-r60-02-11-rapport.md`). Cette branche-là n'est PAS fusionnée : ne la fusionne pas, ne recode pas ce qu'elle a livré ; si un point d'ici touche un fichier qu'elle a modifié (ex. `ApprovalTraceLine`, carte « À valider »), lis son diff (`git diff origin/main...origin/claude/defauts-r55-r60-02-11 -- <fichier>`) et écris un changement qui se fusionnera proprement avec elle — de préférence dans un fichier distinct, sinon le plus petit diff possible.

Périmètre : apps/web/src/features/action-os/**, apps/web/src/features/projects/**, apps/web/src/features/planning/**, apps/web/src/routes/contacts/imports.tsx, apps/web/src/features/contacts/**, apps/web/src/features/profile/** (ou là où vit l'écran d'audit du profil), apps/web/src/i18n/**, apps/web/src/locales/**, apps/api/src/modules/profile-context/**, apps/api/src/modules/actions/**, apps/api/src/modules/demo/**, apps/api/src/modules/laura/** (jobs démo seulement), packages/contracts/src/**, changes/defauts-suite-r55-r60-02-11.yml

## Contrat (validé par Louis, QCM 02/11 ~05h40 UTC)

1. **#2074.16** — « Valider » un mouvement d'audit n'écrit que `profiles.audit_move_decisions` (profile-context.service.ts ~157/325) ; `git grep audit_move apps/api/src/modules/actions` = 0. Je fais : valider crée l'action correspondante dans Actions (geste utilisateur = auto-approuvé), **idempotent** (re-valider ne la double pas : clé = utilisateur + ruleId + cible) ; « Écarter » n'en crée aucune. Étendre le contrat (contracts) pour que la requête porte ce qu'il faut pour créer l'action. Casser le cycle de modules par un port/jeton injecté ou un événement, jamais par `forwardRef` des deux côtés. Tests : valider → 1 action ; re-valider → toujours 1 ; écarter → 0.
2. **#2200.13** — carte « À valider » dit « Préparé par Laura », sa modale dit « Déclenchée par Louis Schlegel » (test : apps/web/src/features/action-os/view/ActionCenter.test.tsx:320). Les deux endroits disent LA MÊME chose avec la même formule : l'humain qui a déclenché + l'agent qui a préparé. Une seule fonction de formulation partagée (GA-26). Localise la modale (ouverte au clic sur la carte de /actions › Aujourd'hui).
3. **#2200.14 #2200.21 côté MODALE** — la modale de l'action à valider montre la source (`trace.trigger`) et la prochaine étape (`nextStepKey`) via le composant `ApprovalTraceLine` existant (pas de copie).
4. **/contacts/imports page blanche** (spinner, 0 contenu) au 2e chargement consécutif, vu en prod le 01/11 (r59). Lire `apps/web/src/routes/contacts/imports.tsx` et ses requêtes : chercher une requête jamais résolue au retour (clé de cache, `enabled` resté faux, suspense sans repli, état de chargement qui ne regarde pas `isFetched`). Test qui monte la page DEUX fois avec le même QueryClient et exige du contenu. Si la cause n'est pas trouvable par lecture : le dire au rapport, ne rien inventer.
5. **#4291.8** — tranché : le suivi d'un projet gagné vit dans **/planning** (`PlanningSignedProjects.tsx`, monté PlanningPage.tsx ~941) ; **/projects ne parle plus de mission** et y renvoie. Aujourd'hui `WonMissionTracking` (ProjectsPage.tsx:684) affiche sur /projects « suivi de mission » / « Mission à créer ». Je fais : sur /projects, cette section devient une ligne courte « N projets gagnés — suivis dans Planning » avec lien vers /planning (rien si N = 0). ⚠️ AVANT de retirer : `git grep` tout ce qu'on n'atteint QUE par `WonMissionTracking` — au minimum `WonMissionDetail` (ouvert au clic d'une ligne) : il doit rester atteignable depuis /planning (même clic sur la ligne du projet signé), sinon tu le branches là. Écris la liste au rapport. La règle PipelineBoard.tsx:169 (le gagné quitte le Kanban) reste.
6. **Démo** (craft rule 9) : semer un job Laura « Obsolète » et un « Brouillon » dans la démo (jobs démo en mémoire, `demo-turn` : localiser) pour que les états livrés par #2276.22/.29/.31 se voient en démo ; classer dans `demo-coverage.ts` si la garde l'exige.

## Droits

- #2074.16 : seul celui qui peut DÉJÀ valider un mouvement d'audit de ce profil le peut ; l'action créée appartient à cet utilisateur, dans son espace (filtre user/espace sur la lecture d'idempotence). Test : un autre utilisateur ne voit pas l'action créée.
- #2200 : trace visible de qui voit déjà l'action, même garde.
- #4291.8 : /planning garde ses droits actuels ; aucun nouveau chemin d'accès.

## Je ne fais pas

Rien sur /team ni Laura V8 (#5032-#5048, autre session) ; aucune migration (si #2074.16 en exige une : STOP sur ce point et rapport) ; aucun rejeu de donnée ; pas de route /dashboard ; ne pas fusionner les branches claude/defauts-r53-01-11, claude/defauts-r55-r60-02-11, claude/epopee-2843-routines-02-11.

## Je défais

#4291.8 : la section « suivi de mission » de /projects posée par #4270.4/#4291.8 est remplacée par un renvoi vers /planning (« revient sur #4291.8 » dans le commit, décision Louis 02/11). Le reste ne défait rien ; toute ligne modifiée qui porte un #NNN : « garde #NNN » dans le message de commit.

## Règles

- TDD, test qui sait dire NON ; trace `// #<point> — …` dans le code ; commits par point, numéros dans le sujet (scopes : web, api, contracts, tooling — jamais `briefs`), pied ≤ 100 car.
- Pièges CI : GA-252 ({{copilot}}, jamais « Laura » en dur dans une traduction), GA-251 (SelectField), GA-33 (aucune couleur hex, pas de `text-destructive` hors tokens autorisés), GA-34, GA-26, GA-18/19 (jamais « 0 » pour une absence), GA-07 (pas de nouvel import service→service : passer par un port), knip, `node scripts/classer-tests-node.mjs` dans apps/web si tu ajoutes un fichier de test web.
- Tests CIBLÉS (≤ 5 specs par passe) + `tsc --noEmit -p` du paquet touché. JAMAIS la suite complète ni le build.
- FR + EN pour tout libellé neuf ; fragment `changes/defauts-suite-r55-r60-02-11.yml`.
