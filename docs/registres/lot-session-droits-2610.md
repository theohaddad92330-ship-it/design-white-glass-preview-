# Registre — lot SESSION-DROITS (26/10/2026)

Branche `claude/session-droits-2610`, base `origin/main` (48861cd00). Pas de PR.
La question posée à chaque point : **est-ce que je RÉPARE un comportement déjà décidé, ou est-ce que j'en DÉCIDE un nouveau ?**

| Point                                 | État                                                 | En une ligne                                                                                                     |
| ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| #4608 démo détruit la session réelle  | `retenu`                                             | La destruction EST la politique écrite « un navigateur = une identité ». L'isoler, c'est la changer.             |
| #4629 espace neuf « essai terminé »   | `retenu`                                             | « Verrouillé dès la première seconde » EST la décision du 02/09 (migration NoFreeTrial). Seul le texte est faux. |
| #4630 onglet Imports vu par un membre | `retenu` — **ARRÊT**                                 | **Le back LAISSE PASSER** : un `member` peut appeler `/import/*`. Rien touché.                                   |
| #4559 identifiants étrangers          | `déjà là` (6/6) + `livré` (cas jumeau + signalement) | Garde d'écriture + filtre de lecture déjà sur main (#4606).                                                      |

---

## #4608 — `retenu`

**Cause.** Deux purges serveur, toutes deux ÉCRITES comme politique :

1. `apps/api/src/common/interceptor/refresh-cookie.interceptor.ts:266` — à chaque session émise,
   `clearOtherUsers` expire les cookies `session:*`, `uploadsSig:*`, `loggedIn:*` de **tout autre utilisateur**
   (commentaire : « Un navigateur = UNE identité »). `POST /demo/session` passe par ce même intercepteur
   (`apps/api/src/modules/demo/demo.controller.ts:102`) : **entrer en démo efface les cookies du vrai compte**.
2. `refresh-cookie.interceptor.ts:333` — `ClearRefreshCookieInterceptor` (déconnexion) expire **tous** les cookies
   d'auth du navigateur. « Quitter la démonstration » (`apps/web/src/features/auth/hooks/useExitDemo.ts:44`) appelle
   `logout()` puis `/login`.

Côté onglet, `DemoEntryPage.tsx:117` remplace l'identité de l'onglet (`bellum.tab.user`) par celle du visiteur démo
sans retenir la précédente. Ce troisième point seul ne suffit pas : sans les cookies, il n'y a rien à restaurer.
L'incarnation (`imp_session`) n'est pas purgée par ces intercepteurs, mais le cookie `loggedIn:{id}` qu'elle pose,
lui, l'est (purge 1).

**Pourquoi retenu.** Les cookies nommés par utilisateur (`scoped-session-cookie.ts`) et la purge
« un navigateur = une identité » coexistent dans le dépôt : c'est la seconde qui est appliquée sur le chemin de la
démo. Isoler la session de démo, c'est faire une EXCEPTION à une politique de session écrite. Ce n'est pas une
réparation. `tranché sans toi : retenu, parce que le correctif change ce que détruit l'émission d'une session et
ce que détruit une déconnexion.`

**Diff proposé** (non appliqué) :

```diff
--- a/apps/api/src/common/interceptor/refresh-cookie.interceptor.ts
+++ b/apps/api/src/common/interceptor/refresh-cookie.interceptor.ts
@@ intercept() — AttachRefreshCookieInterceptor
-        this.clearOtherUsers(req, res, userId, cookieDomain)
+        // #4608 — une session de DÉMONSTRATION cohabite avec la session réelle :
+        // elle ne purge pas les cookies des autres identités (marqueur posé par la route démo).
+        if (!this.reflector.get<boolean>(DEMO_SESSION_KEY, handler)) {
+          this.clearOtherUsers(req, res, userId, cookieDomain)
+        }
@@ intercept() — ClearRefreshCookieInterceptor
-        for (const name of Object.keys(cookies)) {
+        // #4608 — l'onglet a déclaré son identité : seule CELLE-CI est déconnectée.
+        const hint = readSessionScopeHint(req.headers)
+        for (const name of Object.keys(cookies)) {
+          if (hint && !name.toLowerCase().endsWith(`:${hint}`)) continue
--- a/apps/api/src/modules/demo/demo.controller.ts
+++ b/apps/api/src/modules/demo/demo.controller.ts
   @UseInterceptors(AttachRefreshCookieInterceptor)
+  @DemoSession()
   async session(...)
--- a/apps/web/src/features/demo/view/DemoEntryPage.tsx
+++ b/apps/web/src/features/demo/view/DemoEntryPage.tsx
+        // #4608 — retenir l'identité réelle de l'onglet et l'écran d'où l'on vient.
+        if (!wasDemoTab) rememberIdentityBeforeDemo(readTabIdentity(), document.referrer)
         rememberTabIdentity(session?.user?.id)
--- a/apps/web/src/features/auth/hooks/useExitDemo.ts
+++ b/apps/web/src/features/auth/hooks/useExitDemo.ts
-    window.location.assign('/login')
+    const before = takeIdentityBeforeDemo()
+    if (before) rememberTabIdentity(before.userId)
+    window.location.assign(before?.path ?? '/login')
```

**Question pour Louis.** Une session de démonstration peut-elle cohabiter avec la session réelle dans le même
navigateur (exception à « un navigateur = une identité »), et une déconnexion déclarée par un onglet ne
déconnecte-t-elle plus que l'identité de cet onglet ?

---

## #4629 — `retenu`

**Cause.** Le prédicat `isTrialExpired` (`apps/api/src/modules/credits/credits.service.ts:368`) est juste. C'est la
donnée qui dit « verrouillé » dès la création, PAR DÉCISION : `apps/api/src/migrations/1791593847216-NoFreeTrial.ts:56`
pose `('decouverte', 0, 0, now())` à l'inscription. Le commentaire de la migration : « `trial_end` immédiat : il n'y a
rien à laisser expirer, l'état est verrouillé dès la première seconde » (arbitrage Louis 02/09/2026, « il n'y a plus
d'essai gratuit »). L'abonnement se lit sur le PROPRIÉTAIRE de l'espace (`resolveBillingSubscription`, `:502`) : un
espace neuf hérite de l'état de son propriétaire, pas d'un compteur à zéro jour.

Ce qui est faux, c'est **le texte** : `apps/web/src/i18n/locales/fr/billing.json:166`, « Ton essai est terminé »,
pour quelqu'un qui n'a jamais eu d'essai (il n'en existe plus). Le chat répond parce qu'il ne consomme pas de crédit ;
le verrou porte sur les crédits (0).

**Pourquoi retenu.** Corriger le prédicat pour qu'un espace neuf ne soit pas « expiré », c'est rouvrir une fenêtre
gratuite : une règle d'essai, interdite. Le texte touche l'écran de facturation (arrêt obligatoire « facturation »).
`tranché sans toi : retenu, parce que le seul défaut réparable est un libellé de facturation, et le choisir est un
arbitrage produit.`

**Diff proposé** (non appliqué) :

```diff
--- a/apps/web/src/i18n/locales/fr/billing.json
+++ b/apps/web/src/i18n/locales/fr/billing.json
-    "expiredTitle": "Ton accès est verrouillé",
-    "expiredBody": "Ton essai est terminé. Abonne-toi pour continuer à utiliser {{brand}}.",
+    "expiredTitle": "Aucune licence active sur cet espace",
+    "expiredBody": "Choisis une offre pour lancer tes analyses sur {{brand}}.",
```

(+ la clé `en` correspondante.)

**Question pour Louis.** Le bandeau d'un espace sans licence doit-il parler d'« essai terminé » ? Si non, quel texte ?

---

## #4630 — `retenu` — ARRÊT : LE BACK LAISSE PASSER

**Le serveur ne refuse PAS les imports à un membre.** `apps/api/src/modules/import/import.controller.ts:41` protège
tout `/import/*` par `@RequirePermission('data:export')` (le rollback `:208` par `records:write`), et le rôle `member`
porte les deux (`packages/contracts/src/schemas/workspace.ts:255-262`). La règle « Imports réservé aux gestionnaires »
(#4533.4, `team:manage`) n'existe QUE dans l'écran (`apps/web/src/features/settings/view/MyDataTabs.tsx:34-36`). Un
membre qui voit l'onglet peut donc s'en servir. **Ce n'est pas qu'un défaut d'affichage. Je n'ai rien touché.**

Cause de l'affichage, pour mémoire : `useTeam` lit un cache sous une clé qui ne dépend pas de l'espace
(`apps/web/src/features/team/hooks/useTeam.ts:17`, `['workspace-team']`). Après un changement d'espace, le rôle de
l'espace précédent décide un rendu.

`tranché sans toi : retenu sans correctif, parce que le brief l'ordonne et qu'une permission serveur ne se change pas sans toi.`

**Diff proposé** (non appliqué ; serveur d'abord, écran ensuite) :

```diff
--- a/apps/api/src/modules/import/import.controller.ts
+++ b/apps/api/src/modules/import/import.controller.ts
 @Controller('import')
 @UseGuards(JwtGuard, WorkspacePermissionGuard)
-@RequirePermission('data:export')
+@RequirePermission('team:manage')
--- a/apps/web/src/features/team/hooks/useTeam.ts
+++ b/apps/web/src/features/team/hooks/useTeam.ts
-    queryKey: TEAM_KEY,
+    queryKey: [...TEAM_KEY, activeWorkspaceId],
```

**Question pour Louis.** L'assistant d'import `/import/*` doit-il être refusé côté serveur à un `member` (aligner sur
`team:manage`, comme l'écran depuis #4533.4) ? Attention : `/import/universal` est sous `records:write`, et l'import en
masse de contacts sous `data:export` : la même question se pose pour eux.

---

## #4559 — `déjà là` (6/6) + `livré`

**Déjà là** (intégration #4606, rapport `docs/briefs/secu-idor-4559-2510-rapport.md`) : garde d'écriture et filtre de
lecture pour `manager_id`, `opportunity_id`, `need_id` ×2, et `cv-studio` `needSkills` / `assertOpportunityReachable`
en fail-closed. Tests de refus présents.

**Livré ici** :

1. `cv-studio.service.ts` `assertRfpReachable` : même défaut conditionnel (`workspaceId` nul, donc requête sans filtre
   et `rfpId` étranger stocké sur la version). Fail-closed, comme l'opportunité. Test rouge → vert
   (`cv-studio.service.spec.ts`, « refuse (422) un appel d'offres… »).
2. Signalement en LECTURE SEULE des lignes déjà stockées : `apps/api/src/modules/workspace/foreign-reference-audit.ts`
   et `apps/api/scripts/foreign-reference-audit.ts`. Ils rendent des comptes par cas (lignes, espaces). Aucun
   identifiant, aucune écriture, rien effacé ni remplacé. **Non lancé** : la VM n'a pas accès à la base.

`tranché sans toi : assertMissionComparable n'est PAS touché, parce que sa requête sans espace reste liée à une
affectation du consultant, déjà cloisonné par applyConsultantScope. Ce n'est pas la même fuite, et la fermer
pourrait refuser un usage hérité.`
