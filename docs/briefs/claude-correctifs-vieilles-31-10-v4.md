## Ce que je fais — écarts mesurés en recette prod (prod = 7df6c1773c)

1. #2160.9 — fiche contact : le RESPONSABLE du contact (owner) n'apparaît que dans « Informations clés » (« Responsable du contact : Non attribué »). ATTENDU : il s'affiche aussi dans l'EN-TÊTE de la fiche contact (nom du responsable, ou « Non attribué » si personne). Il reste dans Informations clés (rien retiré).
2. #2197.9 — /missions/facturation : la colonne « Société facturante » porte `hidden 2xl:table-cell` (apps/web/src/features/**/InvoiceReadinessTable.tsx:79) donc invisible à 1512 px. ATTENDU : visible dès `xl` (1280 px). Vérifier que le tableau ne déborde pas (pas de défilement horizontal du corps) ; si une autre colonne doit passer en `2xl` pour tenir, la nommer au rapport.
3. #2200.13 / .14 / .21 — /actions, onglet « À valider » : une carte de type Séquence n'a ni auteur, ni source, ni prochaine action ; seule `ApprovalTraceLine` (approbations Action OS) les affiche. ATTENDU : toute carte à valider, Séquence comprise, nomme son AUTEUR (humain ou Laura), sa SOURCE (d'où elle vient : séquence, plan, Laura…) et sa PROCHAINE ACTION, par le même composant ou la même ligne que les cartes Action OS. Une valeur inconnue ne fait AUCUNE ligne (doctrine : on n'affiche pas ce qu'on n'a pas, jamais « 0 » ni vide).
4. #2395.8 — objectif et résultat attendu ne sont exigés QUE pour les appels (outreach-canonical.ts:1028-1030). ATTENDU : la création d'un élément de plan (`plan_item`) et d'une tâche exige aussi un OBJECTIF et un RÉSULTAT ATTENDU (pas un verbe seul) : validation au contrat (Zod) + message d'erreur nommé à l'écran de création. ⚠️ Les éléments EXISTANTS sans objectif ne sont ni réécrits ni bloqués en lecture (pas de migration de données) ; seule la création/modification l'exige. Si un chemin de création automatique (Laura, routine) produit des plan_item sans objectif, il doit en fournir un ou être nommé au rapport (ne pas casser la génération).
5. Doctrine c80 — packages/contracts/src/schemas/doctrine-registry.ts:~2582 dit `codeState: 'absent'` alors que `markInvoiced` écrit `invoiced_declared` (apps/api/src/modules/**/invoice-readiness.service.ts:596-620, controller:236, UI missionChain.ts:663, tests spec:687-718). ATTENDU : codeState mis à jour avec ses preuves, au format des autres entrées ; la garde GA-38 reste verte.

## Je ne fais PAS

Aucune nouvelle donnée collectée, aucun droit changé, aucune page retirée, rien sur /chat ni sur les prompts de Laura, aucune migration de données existantes. Le basculement des autres écrans sur la projection d'action commune (#2395.1/.5/.11) n'est PAS dans ce lot.

## Je défais

Rien. Garde #2160, #2197, #2200, #2395, #2197.41 (c80).

## Droits

Aucun accès modifié.

## Démo (craft rule n°9)

Responsable de contact affiché en en-tête et carte Séquence à valider avec auteur/source/prochaine action : semer dans apps/api/src/modules/demo/demo-dataset.ts (+ DemoSeedService) si absents, et classer dans demo-coverage.ts.

Périmètre : apps/web/src/** · locales FR+EN · apps/api/src/modules/contacts/** · apps/api/src/modules/action-os/** · apps/api/src/modules/actions/** · apps/api/src/modules/plans/** · apps/api/src/modules/tasks/** · apps/api/src/modules/demo/** · packages/contracts/src/** · CHANGELOG* · docs/briefs/** (si un autre module API est nécessaire pour plan_item/tâche, le nommer au rapport)

## Méthode

- Antériorité d'abord : `git log --oneline -S '<symbole>' origin/main | head` sur chaque fichier touché ; toute ligne qui porte un #NNN se cite dans le commit (« garde #N » / « revient sur #N »).
- TDD : par point, un test qui ÉCHOUE d'abord (vitest + Testing Library ; jest côté API).
- Règles design (CLAUDE.md) : pas de hex en JSX, échelle typo, dvh, pas de <Navigate>, cibles ≥ 44 px, icône nommée, mouvement via packages/ui/src/motion.ts, tutoiement en FR. FR + EN pour tout texte. Changelog si user-facing.
- Trace `// #<point> — <raison>`. Commits par écran avec les numéros dans le sujet.
