# ⚠️ Un second clic pendant qu'un rafraîchissement d'axe tourne débite une seconde fois

> Titre d'origine, gardé pour la trace : « Un rafraîchissement d'axe annonce 1 crédit et en débite 2 ». La mesure l'a corrigé — voir « Cause établie » plus bas.

base : 6771c0206 — 18/09/2026, MESURÉ EN PRODUCTION sur l'espace réel de Louis

## Ce qui a été mesuré, pas supposé

Recette écran du 18/09/2026 au soir, production (`6771c0206`), espace de Louis :

| geste | annoncé AVANT le clic | débité | conforme ? |
| --- | --- | --- | --- |
| Compte THALES → « … » → Rafraîchir → axe **Signaux** | **1 crédit** | **2** (248 → 246) | 🔴 NON |
| Fiche contact → « Compléter/Enrichir » | 1 crédit, « aucun crédit débité si rien n'est trouvé » | 1 (246 → 245) | ✅ oui |
| Même contact, second essai immédiat | — | 0, bloqué par l'idempotence, date de réessai affichée | ✅ oui |

Solde de départ 248, solde final 245.

## Pourquoi c'est grave

« **Un acte payant annonce son coût AVANT** » est une règle du produit. Un coût
annoncé qui ment est PIRE qu'un coût non annoncé : l'utilisateur a pris sa
décision sur un chiffre faux. Et c'est de la facturation — ça ne se suppose pas,
ça se mesure et ça se dit.

Les deux autres gestes mesurés le même soir sont conformes, y compris
l'idempotence. **L'écart ne concerne que le rafraîchissement d'axe**, ce qui
désigne un chemin précis plutôt qu'un défaut général du compteur de crédits.

## Ce qui n'est PAS établi

L'écart n'est pas expliqué. Deux hypothèses ont été formulées par le recetteur —
un double appel, ou une interface figée avant la mise à jour du solde — et
**aucune des deux n'est vérifiée**. Une hypothèse présentée comme une cause
ferait écrire un correctif contre la mauvaise ligne.

Un vérificateur trace en lecture seule : où est calculé le coût ANNONCÉ, où est
calculé le coût DÉBITÉ, les deux lisent-ils la même source (GA-26), y a-t-il un
double appel, l'axe « signaux » est-il un cas particulier, et une reprise
peut-elle refacturer.

## Cause établie — 18/09/2026, par la trace, pas par hypothèse

**Le prix annoncé est juste : 1 crédit PAR CLIC.** Les deux crédits viennent de
**deux clics**, pas d'un clic facturé deux fois.

1. **Le journal des crédits** (`/billing`, carte « Mouvements de crédits », lu
   par un recetteur le 18/09 au soir) porte exactement deux lignes
   `refresh:signals` ce jour-là, à **18:00 et 18:01 heure de Paris**, −1 chacune.
   Aucune autre ligne entre 15:30 et 16:45 — ce créneau était en UTC dans le
   rapport d'origine, d'où la première lecture « aucune ligne ».
2. **La transcription du recetteur d'origine** montre deux clics sur « Signaux »
   dans le menu « Rafraîchir » : à **15:59:00 UTC**, puis, après être sorti de la
   fiche et y être revenu, à **15:59:50 UTC** — cinquante secondes plus tard.
3. **Le code** (vérificateur en lecture seule) débite exactement une fois par
   appel réussi : `analysis-refresh.service.ts`, `consumeEnrichmentCredit` avec
   `cost: REFRESH_DIMENSION_CREDIT_COST[dimension]`, la même table que l'écran
   (GA-26 tenue). Aucune reprise automatique.

**Le vrai défaut est ailleurs, et il est plus précis.** Le service porte déjà une
règle anti-double-clic — « cliquer deux fois de suite débitait deux crédits pour
rejouer exactement la même phase » — via `refreshedTooRecently` (6 h,
`REFRESH_MIN_INTERVAL_MS`). Mais la date qu'elle lit n'est écrite **qu'APRÈS**
la phase (`analysis-refresh.service.ts:282`, après `runDimension` et après le
débit). Pendant toute la durée de la phase — ici environ une minute — un second
clic sur le même axe du même compte **passe la règle**, rejoue la phase et
débite. Le verrou côté écran (`useCtaClickGuard`) ne couvre qu'un même montage :
sortir de la fiche et revenir le réarme.

La règle existe, elle est juste, et elle a un trou exactement de la taille de la
phase qu'elle protège.

| numéro | demande en huit mots | sujet | mesure | état | preuve |
| --- | --- | --- | --- | --- | --- |
| 2650.1 | Le coût annoncé d'un rafraîchissement est le coût débité | api:credits | annoncé 1, débité 2 sur l'axe Signaux, compte THALES, mesuré en production le 18/09/2026 | recetté | RECETTÉ EN PROD 18/09 nuit (web T, API U 5f9d8f281) — THALES, menu … › Rafraîchir › Contacts : 1er clic accepté (toast « Contacts rafraîchi · 244 crédit(s) restant(s) », 245→244), 2e essai : « Rafraîchir » désactivé = refusé, UN seul débit. Carte : « Confiance non recalculée : ce rafraîchissement n'a repris que Contacts. Dernier calcul réel le 18/09/2026. » 1 crédit dépensé. |
| 2650.2 | Louis a-t-il été débité de crédits indus | api:credits | 1 crédit d'écart constaté sur un geste ; ampleur sur l'historique non mesurée | livré | LIVRÉ 19/09 lot L, branche feat/un-rafraichissement-deja-paye-se-rembourse-19-09 @63b396762 (fenêtre par PHASE, REFRESH_DIMENSION_PHASE source unique partagée avec le verrou 2650.1) : refresh-refund.ts (fenêtre glissante par compte et par phase, REFRESH_MIN_INTERVAL_MS), refresh-refund.service.ts (ligne refund_enrichment par débit indu, idempotence verrou + index unique partiel, migration 1789810829875), POST /internal/admin/credits/refresh-refunds (InternalSecretGuard, dryRun par défaut), relevé de crédits « Remboursement : rafraîchissement déjà payé dans les 6 h ». NON EN PROD ; après déploiement : dryRun sur l'espace de Louis (3 lignes attendues), puis réel. APPELANT NOCTURNE ajouté 21/09 (décision Louis 21/09 midi), branche feat/le-remboursement-passe-seul-21-09 : `RefreshRefundSweepService.runNightlySweep` (`apps/api/src/modules/credits/refresh-refund-sweep.service.ts:66-68`, `@Cron('13 3 * * *', { timeZone: 'Europe/Paris' })`) appelle `RefreshRefundService.run` en mode RÉEL (dryRun:false), PAR ESPACE (liste tirée d'un `DISTINCT workspace_id` sur les débits `refresh:%`, jamais agrégée — GA-43), verrouillé par `withSingletonLock` (`LocksModule` déjà importé dans `credits.module.ts`), câblé comme provider de `CreditsModule` (`credits.module.ts:19,56`). Idempotence et saut d'un espace en échec (jamais de remboursement deviné sur timeout) prouvés par 4 tests rejouant le passage deux fois (`refresh-refund-sweep.service.spec.ts`). Gardes GA-76/GA-77 (`scheduled-jobs-locked-or-reasoned.spec.ts`) vertes sur ce cron. ‖ ⚠️ 21/09/2026 — la mention « NON EN PROD » de cette ligne est PÉRIMÉE : le commit cité est ancêtre du SHA SERVI en production (`813241ceb`, api ET ia). Le code EST déployé, donc ce point est RECETTABLE. L'état ne change pas pour autant : il lui manque sa PREUVE ÉCRAN, pas son déploiement. |
