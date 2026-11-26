# Lot 400 — Analyser / dossier — 8 issues

Périmètre : `apps/web/src/lib/account-pdf/styles.ts` ; `apps/web/vercel.json` ; `apps/web/src/architecture/csp-apercu-pdf-polices-distantes.test.ts`

## Ce que le lot fait

- **#4836** : `cdn.jsdelivr.net` ajouté à `connect-src` ET `font-src` (seule origine distante de `account-pdf/styles.ts`) ; version Geist épinglée `@1.8.2` (7 faces vérifiées HTTP 200) au lieu de `@main` ; garde `csp-apercu-pdf-polices-distantes.test.ts` qui LIT les deux fichiers et échoue (contrôles négatifs synthétiques) si l'origine est retirée de l'une des directives, si une origine non déclarée est ajoutée, ou si une référence `@main` revient.

## Déjà livré sur main — clos par la preuve, pas recodé

- **#4786** : `getAccountLinks` porte le périmètre BU, repli `findOne(accountId, userId)` retiré (`df3fc38b`, #4820) ; entrée retirée de `APPELANTS_SANS_PERIMETRE` (`business-unit-read-coverage.spec.ts:133`).
- **#4717** : catalogue `contact_job_change` dit ses écritures en fr/en (`routine-catalog.ts:651-654`), garde `routine-catalog-writes.spec.ts` (`833cfe60`, #4858).
- **#4770** : le segment « Tous » nomme ce qu'il compte (`3d0952e6`, #4856), test `ContactsRecommendedToggle.test.tsx:37`.
- **#4805** : garde + cliquet + `NamedAbsence` + sites corrigés (`8206a991`, #4865) ; `HierarchyOrgView` volontairement laissé à #4749.

## Ce que le lot NE fait PAS — QUESTIONS pour Louis

- **#4684** : geste humain (rattacher DHL/STEF/STG/Dachser à l'espace de Julien) — rien à corriger dans le code.
- **#4801** : « organigramme enrichi » n'a aucune spécification (enrichi avec QUOI ?) — à écrire avant de coder.
- **#4799** : choix de la source de changements de poste = arbitrage produit (coût, fraîcheur, propreté).
- Aucune migration, route, garde d'accès, ni `.github/workflows`. Aucune issue fermée.

## Ce que le lot DÉFAIT

Rien (la référence `@main` mutable disparaît, c'est le but de #4836).

## Décisions touchées

garde #4686, garde #4700, garde #4702 (lignes du commentaire de `styles.ts` réécrites : l'aperçu PDF et ses polices ne changent pas de comportement) ; débloque #4292.13 et #4293.7.

## Droits

Aucune page, route, garde ni rôle neuf. `vercel.json` change seulement la CSP : une origine de polices en lecture (`connect-src`, `font-src`) — c'est un ÉLARGISSEMENT d'une origine tierce épinglée, refusé pour toute autre origine par `csp-apercu-pdf-polices-distantes.test.ts` (test ajouté, contrôles négatifs inclus).

## Démo (règle n°9)

Aucune donnée affichée nouvelle : rien à seeder.
