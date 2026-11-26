# Lot S — Découvrir : « Ma cible » en bascule (#4530) + paliers 25 → 50 km → département → région (#4429, #4515)

Plafond : 300 tours. Brief autonome.

## Compris (recette prod 01/11 10:28 UTC)

- **#4530.1 FAIL** : « Ma cible » ouvre « Ta cible couvre 9 secteurs » (choisir ≤ 5), une modale, au lieu d'une BASCULE en un clic. Critères #4530 :
  - bouton inactif → aucun critère du profil, mode Neutre ;
  - clic → mode `my_activity`, critères du profil posés ET visibles dans les filtres ; second clic → retirés, Neutre ;
  - `StartingPoint` et `SurfaceContextChip` ne sont plus rendus sur Découvrir ;
  - `?context=my_activity` → bouton activé.

  Si le profil couvre plus de 5 secteurs, la bascule pose quand même ses critères (aucune modale bloquante). Un lien discret « régler ma cible » peut mener au réglage (un réglage vit à UN endroit, GA-26).

- **#4429.1 PARTIAL** : le palier département est annoncé et nommé, MAIS il n'y a aucun palier 25 → 50 km avant, et le geste dit « Revenir à 100 km » au lieu de « Toulouse seule ». Décision Louis du 25/10 (lire l'issue en entier : `gh issue view 4429`) :
  - barreaux UN PAR UN, chacun nommé, arrêt dès que le seuil est atteint ;
  - AUCUN saut d'une ville à la région ou à la France ;
  - l'élargissement manuel de `Discover.tsx` cesse de vider ville + département + région d'un seul geste ;
  - Laura dit le palier appliqué dans sa réponse.
- **#4515** : le rayon de 25 km par défaut est PASS à l'écran. Restent :
  - rayon réellement envoyé et appliqué (test aller-retour URL, aucun « 25 » mal relu) ;
  - « Non appliqué » seulement si la source qui a RÉPONDU n'a pas appliqué la ville ;
  - les paliers de #4429 partent de 25 km.

## Je fais

1. **#4530** : la bascule + les 4 tests de l'issue ; démo (bascule visible, profil démo).
2. **#4429** : échelle 25 → 50 km → département → région, un barreau à la fois, chacun nommé à l'écran (« élargi à 50 km autour de Toulouse — N comptes »), avec un geste « Toulouse seule ».
   - Test de NON : au-dessus du seuil, la requête reste `commune_code` / 25 km.
   - Test : 0 résultat à 25 km ne saute jamais à la région sans passer par 50 km puis le département.
   - Même échelle côté Laura (outil de recherche de comptes), et Laura nomme le palier.
3. **#4515** : test aller-retour URL du rayon ; « Non appliqué » conditionné à la source qui a répondu.
4. Mobile 390 px, i18n fr/en, clair/sombre ; un test qui dit NON par point.

## Je ne fais PAS

Base commune / #4519 (lot R, en parallèle : rester étroit sur Discover.tsx). Classement ESN, Decathlon (lot Q).

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/lib/zones/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/architecture/*`, `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/demo/*`, `apps/api/src/modules/chat/**`, `packages/contracts/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` (contient le lot Q #5121, ea329980eb). Push `git push origin HEAD:refs/heads/claude/decouvrir-s-cible-paliers-0111` (push SIMPLE ; pre-push lancé en run_in_background puis attendu ; si check-types exige les dépendances : `pnpm --filter @bellum/contracts build`). Après chaque push, vérifier que `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify` / `--force`, jamais `.github/workflows`.
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré. Un point n'est livré que si son APPELANT prod est cité fichier:ligne.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS (≤ 5 specs, pytest ciblé) ; Prettier 3.9.10 ; tout nouveau test web ⇒ une ligne dans `apps/web/src/test/tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source ni fournisseur nommé à l'écran ; une absence n'est jamais « 0 » ; démo seedée (craft rule 9, `demo-coverage.ts`).
- Rapport ≤ 12 lignes.
