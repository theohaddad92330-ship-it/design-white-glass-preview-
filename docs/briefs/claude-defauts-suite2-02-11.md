# Brief cloud — défauts r55-r60, 3e passe (02/11/2026)

Conception : migration (élargir `tasks_source_check` + index unique d'idempotence) et contrat « mouvement d'audit → action » entre deux modules (risque de cycle).
Plafond : 300 tours ; à 240, commit + push de ce qui est vert, rapport, stop.
Branche : `claude/defauts-suite2-02-11`, créée depuis origin/main (elle CONTIENT main). SEUL pousseur. Push SIMPLE après chaque point (jamais --force / --no-verify / rebase). AUCUNE PR.
Avant le premier push : `pnpm install --frozen-lockfile` puis `pnpm --filter @bellum/contracts build && pnpm --filter @bellum/shared build`.
Rapport : `docs/briefs/claude-defauts-suite2-02-11-rapport.md` (≤ 15 lignes : livrés avec SHA, non faits avec cause, écarts).

Contexte : suite du lot `claude/defauts-suite-r55-r60-02-11` (rapport : `git show origin/claude/defauts-suite-r55-r60-02-11:docs/briefs/claude-defauts-suite-r55-r60-02-11-rapport.md`). Cette branche-là et `claude/defauts-r55-r60-02-11` sont en cours d'INTÉGRATION ailleurs : ne les fusionne pas, n'y touche pas ; écris des diffs qui se fusionnent proprement avec elles (fichiers distincts quand c'est possible).

Périmètre : apps/api/src/migrations/**, apps/api/src/modules/profile-context/**, apps/api/src/modules/actions/**, apps/api/src/modules/tasks/**, apps/api/src/architecture/check-constraints-cover-enums.spec.ts, packages/contracts/src/**, apps/web/src/features/missions/view/PlanningPage.tsx, apps/web/src/features/missions/view/PlanningSignedProjects.tsx (+ tests), apps/web/src/features/demo/demo-chat-script.ts, apps/web/src/features/profile/** (écran d'audit), apps/web/src/i18n/**, apps/api/src/modules/demo/**, changes/defauts-suite2-02-11.yml

## Contrat (validé par Louis, QCM 02/11 ~05h40 et ~09h55 UTC)

1. **#2074.16** — « Valider » un mouvement d'audit (profile-context.service.ts ~157/325, n'écrit que `profiles.audit_move_decisions`) crée l'action correspondante dans Actions (geste utilisateur = auto-approuvé) ; idempotent (re-valider ne la double pas) ; « Écarter » n'en crée aucune. Le lot précédent a mesuré : `action_plan_items.account_id` est NOT NULL (un mouvement d'audit n'a pas de compte) ⇒ écrire une **tâche** (`tasks`), pas un action_plan_item ; `tasks.source` est bornée par `tasks_source_check` (`manual|lead_conversion|action_os_approval|plan_callback`). Je fais : migration ADDITIVE horodatée APRÈS la dernière de main (modèle : `1796436512337-TaskSourcePlanCallback.ts`) qui élargit la contrainte à `audit_move` ET pose un index unique partiel d'idempotence (espace, propriétaire, source, clé = ruleId+cible) ; migration AVANT le code qui écrit (GA-11/GA-12) ; `check-constraints-cover-enums.spec.ts` à jour ; puis le code. Casser le cycle de modules par un port injecté (jeton) ou un événement, jamais `forwardRef` des deux côtés, aucun import service→service nouveau (GA-07). Tests : valider → 1 tâche ; re-valider → 1 ; écarter → 0 ; un autre utilisateur ne la voit pas.
2. **#4291.8 en RÉGIE** (tranché Louis 02/11 ~09h55 : « liste aussi en régie ») — `PlanningSignedProjects` (monté PlanningPage.tsx ~942) ne s'affiche qu'en espace forfait/conseil. Je fais : la liste des projets SIGNÉS s'affiche aussi en régie, même composant, même rendu ; rien si aucun projet signé (pas de « 0 », GA-18/19). Test : espace régie avec 1 projet signé ⇒ la ligne est visible ; 0 ⇒ rien.
3. **Démo** (craft rule 9) — semer dans `apps/web/src/features/demo/demo-chat-script.ts` (à côté de `DEMO_LAURA_JOB`, ~l.404) un job Laura « Obsolète » (remplacé dans le même fil) et un « Brouillon » (paramètres incomplets), pour que les états livrés par #2276.22/.29/.31 se voient en démo ; classer dans `demo-coverage.ts` si la garde l'exige.

## Droits

- #2074.16 : seul qui peut DÉJÀ valider un mouvement d'audit de ce profil ; la tâche appartient à cet utilisateur, dans son espace (filtre user/espace sur la lecture d'idempotence) ; test du refus (autre utilisateur ne la voit pas).
- #4291.8 : /missions/planification garde ses droits actuels ; aucun nouveau chemin.

## Je ne fais pas

Rien sur /team, Laura V8 (#5032-#5048), Découvrir ; aucun rejeu de donnée ; aucune autre migration que celle du point 1.

## Je défais

#4291.8 : la restriction forfait/conseil de `PlanningSignedProjects` est levée (« revient sur #4291.8 », décision Louis 02/11). Toute autre ligne modifiée qui porte un #NNN : « garde #NNN » dans le commit.

## Règles

- TDD, test qui sait dire NON ; trace `// #<point> — …` ; commits par point (scopes web, api, contracts, tooling — jamais `briefs`), pied ≤ 100 car.
- Pièges CI : GA-252, GA-251, GA-33, GA-34, GA-26, GA-18/19, GA-07, GA-11/12, knip, `node scripts/classer-tests-node.mjs` dans apps/web si nouveau fichier de test web.
- Tests CIBLÉS (≤ 5 specs par passe) + `tsc --noEmit -p` du paquet touché. JAMAIS la suite complète ni le build.
- FR + EN pour tout libellé neuf ; fragment `changes/defauts-suite2-02-11.yml`.
