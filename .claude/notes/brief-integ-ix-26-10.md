# Brief — INTÉGRATEUR vague IX (local)

Local : 19 branches à fusionner en UNE passe dans un worktree ; le cloud coûte ~15 min par branche
(mémoire `integration-en-local-23-10`), et les tests ciblés veulent les dépendances déjà installées ici.
Conception : fusion sémantiquement dure — TROIS branches touchent le moteur Découvrir
(`decouvrir-rail-4572-4574`, `decouvrir-restes`, `signaux-hors-metier`), DEUX la fiche Talent / le vivier
(`talent-fiche-4576-4577`, `talents-vivier-4500`), et `laura-process-achat` modifie un fichier que
`main` porte déjà. Garder les DEUX côtés et comprendre ce que chaque côté voulait.

## Le socle, exactement

```sh
cd /Users/louisschlegel/Desktop/belllum-monorepo
git fetch origin
git rev-parse origin/main            # DOIT rendre d7e6ab017acd18592fbf78ce6670e613c3bf52bc
git worktree add /private/tmp/claude-501/wt-integ-ix -b claude/integ-2510-ix origin/main
cd /private/tmp/claude-501/wt-integ-ix
```

Base = `origin/main` @ `d7e6ab017acd18592fbf78ce6670e613c3bf52bc`. Branche d'intégration :
`claude/integ-2510-ix`. **Un SHA se lit par `git rev-parse`, il ne se complète jamais de mémoire.**

## Les 19 branches, dans cet ordre (du plus gros au plus petit, les familles collées)

Moteur Découvrir d'abord, puis Talent/vivier, puis le reste :

1. `origin/claude/decouvrir-rail-4572-4574-2610` (13 f. / +538)
2. `origin/claude/decouvrir-restes-2510` (19 f. / +541)
3. `origin/claude/signaux-hors-metier-4403-2510` (4 f. / +65)
4. `origin/claude/talent-fiche-4576-4577-2610` (13 f. / +299)
5. `origin/claude/talents-vivier-4500-2510` (17 f. / +270)
6. `origin/claude/contexte-original-4573-2610` (32 f. / +1436 — migration + seau privé + URL signée + RGPD)
7. `origin/claude/boites-mail-4546-2510` (10 f. / +425)
8. `origin/claude/declinaison-competence-4579-2610` (9 f. / +370)
9. `origin/claude/secu-idor-4559-2510` (10 f. / +248)
10. `origin/claude/fiche-contact-finitions-2510` (8 f. / +242)
11. `origin/claude/mise-en-ligne-4575-4578-2610` (8 f. / +232)
12. `origin/claude/laura-process-achat-4408-2510` (4 f. / +107)
13. `origin/claude/cv-lecture-4401-2510` (5 f. / +60)
14. `origin/claude/restes-4531-4567-2610` (1 test python + rapport)
15. `origin/claude/erreurs-prod-c-2610` — **rapport seul**
16. `origin/claude/beeper-4406-2510` — **rapport seul**
17. `origin/claude/selection-ia-4409-4408-2510` — **rapport seul**
18. `origin/claude/lemlist-4427-2510` — **rapport seul**
19. `origin/claude/import-contexte-4426-2510` — **rapport seul**

Les cinq « rapport seul » n'ajoutent qu'un `docs/briefs/*-rapport.md` : aucun conflit attendu, on les prend
pour garder la trace dans `main`. Si l'une porte autre chose que son rapport, le DIRE dans le rapport final.

## Les règles de fusion

- `git merge --no-ff origin/<branche>` une par une, **jamais un octopus**. Après chaque fusion :
  `git grep -n '<<<<<<<\|>>>>>>>\|=======' -- . | head` doit être vide.
- **Un conflit garde les DEUX intentions** : deux listes de clés i18n se concatènent, deux entrées de
  catalogue se gardent toutes les deux, deux gardes se gardent toutes les deux. Jamais `--ours` en masse.
- **`laura_acts.py` / `purchasing_process_filter.py`** : `main` porte déjà ces fichiers (lot SELECTION-IA
  fusionné). La branche 12 les COMPLÈTE (+18 lignes) : fusionner, ne pas écraser, et vérifier que le
  filtre garde « sans donnée de taille = gardé et dit non vérifié ».
- `pnpm-lock.yaml` conflictuel : prendre `origin/main` puis relancer `pnpm install --lockfile-only`.
- Fichier de migration : horodatage RÉEL, jamais rond, et strictement > `max(main)` (mémoire
  `une-migration-prend-un-horodatage-reel-jamais-rond`). Deux migrations qui se marchent dessus = renuméroter.
- **Interdit** : `--no-verify`, `$queryRawUnsafe`, une clé API côté client, `where { id }` sans filtre
  d'espace, une réponse qui inclut `passwordHash`, une donnée fictive hors semis de démo.

## Les portes, ciblées — la suite complète est le travail de la CI, jamais le tien

1. `node scripts/garde-derive-doc.mjs "origin/main...HEAD"` — c'est CE job qui a mis la vague VIII au rouge
   (GA-413 / #4117). Toute fiche `agent_docs/*.md` dont un fichier `sources:` a bougé doit suivre :
   soit la fiche décrit encore juste le comportement et on remet son empreinte à jour, soit elle est
   devenue fausse et on corrige SON TEXTE. Jamais retirer la source pour faire taire la garde.
2. `cd apps/api && node --max-old-space-size=8192 node_modules/typescript/lib/tsc.js --noEmit -p .`
   puis **compter les lignes `error TS`** — `npx tsc` nu tombe en OOM à 4 Go et imprime « No errors found »
   quand même (mémoire `tsc-oom-rend-un-faux-vert`).
3. `cd apps/web && npx tsc --noEmit -p .` ; `cd packages/contracts && npx tsc --noEmit -p .`
4. Les specs **touchées par les fusions seulement** (≤ 5 fichiers par paquet), + `demo-coverage.spec.ts`
   (craft n°9) + les gardes GA touchées. Rien d'autre : pas de suite complète, pas de build, pas de
   `check-types` racine.
5. Python : `apps/ia` a un venv dans le dépôt principal — **jamais `uv run` dans un worktree**
   (`.venv` vide = faux rouge en 0 s). Lancer les tests ciblés avec le python du dépôt principal.

## Le push, et le piège qui a déjà menti deux fois

```sh
git push origin HEAD:refs/heads/claude/integ-2510-ix
git ls-remote origin claude/integ-2510-ix      # LA preuve, pas le message de la porte
```

La porte `porte-avant-push.py` annonce parfois « refusé » **alors que le push est parti**
(mémoire `porte-push-message-ne-bloque-pas-git-c`). Ne jamais conclure sur son message : lire `ls-remote`.
Si la porte refuse pour de vrai et que tu ne peux pas la satisfaire : **rendre la main, ne pas contourner**.

## La PR

`gh pr create --base main --head claude/integ-2510-ix --title "integ: vague IX — 19 lots, ..." --body-file <fichier>`
— **prête, jamais en brouillon** (une PR en brouillon ne lance pas la CI). Corps : un tableau
branche → issues → ce qui change pour l'utilisateur, et la liste des conflits résolus avec l'intention gardée.
Puis **STOP** : la CI est suivie par un script, pas par toi. Ne fusionne pas, ne relance pas la CI.

## Cadre

- Plafond : **300 tours**. À 240, tu commits ce qui est vert, tu pousses, tu rends ton rapport, tu t'arrêtes.
- Rapport final ≤ 15 lignes : SHA de tête poussé (lu par `git rev-parse`), numéro de PR, conflits par famille,
  portes lancées avec leur compte de verts, et **ce que tu n'as PAS fait**.
- Aucun sous-agent.
