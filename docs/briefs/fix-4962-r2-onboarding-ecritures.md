# Lot cloud — fix/4962-r2-onboarding-ecritures (recette du lot #4962, 01/11/2026)

- Plafond : 300 tours.
- Un livrable, puis STOP.
- Rapport : 15 lignes au plus, dans `docs/briefs/fix-4962-r2-onboarding-ecritures-rapport.md`, inclus dans le push.

## Contexte

Les deux défauts ci-dessous ont été VUS en production le 01/11, dans l'espace de Louis, en recette.

- Un retour est un SYMPTÔME, pas une spécification.
- La doctrine est dans `CLAUDE.md` : elle ne se re-litige pas.
- Avant de coder, `git log origin/main --oneline --grep <n>` et `git grep` : le défaut est peut-être déjà corrigé, ou mal branché. Cherche l'APPELANT.

## Défaut 1 — #4969 : génération du profil en échec, sans raison

- Constat : `/settings/profile`, bloc « Résumé, personnalisation et coaching », affiche « Échec — raison non enregistrée ».
  - Libellé : `apps/web/src/i18n/locales/fr/profile.json:253`, clé `failed`.
  - `/settings/profile/audit` reste sur « Lecture de ton profil… ».
- Issue #4969 : « génération sans erreur », relue sur l'onboarding.
- À faire, dans l'ordre :
  1. Trouver où l'état d'échec est écrit (API et/ou IA : la génération du résumé, de la personnalisation et du coaching). Établir pourquoi la RAISON n'est pas enregistrée.
  2. Faire enregistrer la raison réelle au moment de l'échec, sans jamais exposer de secret ni de corps de message. Afficher une raison lisible, plus un geste de relance si elle existe.
  3. Si la cause de l'échec se lit dans le code (timeout, schéma, champ manquant), la corriger. Sinon, le dire dans le rapport.
  4. `/settings/profile/audit` bloqué en chargement : trouver pourquoi (requête qui échoue en silence ?). Un échec doit se DIRE, jamais tourner indéfiniment.

## Défaut 2 — #5028 : /actions/ecritures rend « Action introuvable »

- Constat : en production, `/actions/ecritures` affiche « Action introuvable ». La route `apps/web/src/routes/actions/$id.tsx` lit « ecritures » comme un id.
- `apps/web/src/features/action-os/view/ActionCenter.tsx`, lignes 251 et 702 : la page autonome `/actions/ecritures` devait être REDIRIGÉE vers le centre d'actions. Cette redirection n'existe plus, ou n'est plus branchée.
- `apps/web/src/components/navigation/sections.test.ts:406` en parle aussi.
- À faire :
  - rétablir une redirection propre (pas `<Navigate>`, interdit par GA-27 : utiliser `redirect` dans `beforeLoad`) vers l'endroit où vivent les écritures CRM ;
  - ajouter un test qui fait échouer la CI si l'URL retombe sur « introuvable ».

## Méthode

1. Branche : CETTE branche, `fix/4962-r2-onboarding-ecritures`.
2. TDD.
3. Respecter les gardes `apps/web/src/architecture/` : i18n fr + en, pas de `<Navigate>`.
4. Tests CIBLÉS seulement : au plus 5 specs, plus `tsc -p` du paquet. Jamais la suite complète ni le build.
5. Commits conventionnels :
   - scope `web`, `api` ou `ia` ;
   - lignes de moins de 100 caractères ;
   - aucune ligne de corps qui commence par `#` ;
   - pied `Refs #4969` ou `Refs #5028`.
6. Push SIMPLE : `git push origin HEAD`. Pas de PR. Ne ferme ni ne commente aucune issue.
