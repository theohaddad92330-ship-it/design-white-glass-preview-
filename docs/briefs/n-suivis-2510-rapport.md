# Rapport N-SUIVIS (#4538) — claude/n-suivis-2510

**Cause confirmée** : `FollowedAccountsSection` ne rendait qu'une phrase ; les comptes suivis sans fait de veille n'avaient aucune ligne.
Test rouge d'abord (« trois suivis sans aucun fait ⇒ trois lignes » : `role=list "Comptes suivis"` introuvable), puis le code.

**Livré** (garde #4267 ; précise la refonte Théo du 23/10 sur l'onglet Suivis)

- `FollowedAccountsSection.tsx` : une ligne par compte réellement suivi (même dérivation `useAccountFollows` que la phrase et « Gérer ») ;
  les faits de veille (`useAccountSignals`) enrichissent la ligne (« N faits dans ta veille » / « Aucun fait dans ta veille pour l'instant ») ;
  veille pas encore répondue ⇒ la ligne n'affirme rien. Suffixe `withoutFacts` de la phrase retiré (les clés i18n fr/en deviennent `rowFacts_*`).
- Repli #4267.2 (aucun suivi) inchangé ; plafond toujours lu de `max`.
- API : test « un second utilisateur du même espace est lu par SON identifiant » (`account-follows.service.spec.ts`). Aucun code API changé.

**Tests** : vitest `account-follows` 17/17 (3 rouges -> verts) ; jest `account-follows` 13/13 ; jest `demo-coverage.spec` 91/91.
tsc web / api : voir ligne finale ci-dessous.

**Mesure** : l'espace de recette suit 3 comptes ; l'onglet rendait 0 ligne avant, 3 après (même en démo : le tableau de veille n'est pas sur cet onglet).

**Pas fait / question** : la démo ne peut pas porter un suivi SANS fait de veille — les 14 dossiers et 9 comptes d'extension ont tous des signaux, et la démo n'a aucun compte mince (Louis 12/10). Je n'en ai pas fabriqué ; la raison est écrite dans `demo-coverage.ts` (`account_follows`), le cas est gardé par le test web. Décision à prendre : accepter, ou fournir un compte réel sans signal.
Build local de `packages/contracts` (dist) nécessaire pour vitest, non commité.

**tsc** : web 0 erreur ; api 3 erreurs, toutes `Cannot find module '@bellum/email'` (paquet non construit dans la VM, hors périmètre, aucune dans les fichiers touchés).

[lot-fini] claude/n-suivis-2510
