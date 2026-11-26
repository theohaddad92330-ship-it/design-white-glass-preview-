# Lot #4817 — le blocage de `/onboarding/$id/review` NOMME chaque réponse manquante et y renvoie

Périmètre : apps/web/src/features/onboarding/components/FramingValidationBlock.tsx,apps/web/src/features/onboarding/lib/missing-essentials.ts,apps/web/src/features/onboarding/lib/missing-essentials.test.ts,apps/web/src/features/onboarding/components/FramingValidationBlock.test.tsx,apps/web/src/features/onboarding/view/OnboardingReviewPage.tsx,apps/web/src/i18n/locales/fr/onboarding.json,apps/web/src/i18n/locales/en/onboarding.json,*claude/notes/brief-4817-blocage-nomme.md

## Le défaut, mesuré

Client réel : hicham.satoura@verhelia.fr, espace VERHELIA, onboarding `5f898604-e2bf-4abe-a4bd-2bedd009f4a2`.
Sur `/onboarding/<id>/review` : « Cadrage validé le 29/10/2026 » ET « Ton cadrage est validé, mais il manque encore
des réponses essentielles pour ouvrir ton espace. Complète-les puis reviens ici. » — aucune réponse nommée, aucun
lien. L'utilisateur retourne au cadrage, ne distingue pas l'exigé du facultatif, revient, boucle.

L'API SAIT lesquelles manquent et le dit (`onboarding.service.ts:362-371` → `Réponses manquantes : <clés>`,
400 par `onboarding.controller.ts:50-54`). Le front jette le corps :
`FramingValidationBlock.tsx:65-70`, `catch { setError('complete') }`.

Et la phrase MENT dans l'autre sens : `completeError` s'affiche aussi pour `persist_failed` (503) et
`invalid_transition` (400) — « il manque des réponses essentielles » alors que rien ne manque.

## Écarté d'abord (demande de Louis) : l'incarnation n'est pas la cause

`/onboarding` n'est PAS dans `BLOCKED_PREFIXES` (`apps/api/src/modules/auth/impersonation-policy.ts:45-59`).
`POST /onboarding/complete` passe donc en incarnation comme hors d'elle : le cul-de-sac existe pour Hicham
hors incarnation. La bande « achats, membres, clés, envois et intégrations bloqués »
(`fr/impersonation.json:4`) est un décor, pas le verrou.

## L'arbitrage de ce lot

**Le front DÉRIVE la liste manquante du MÊME contrat que la porte serveur, au lieu de parser une phrase française.**
`TEMPS1_REQUIRED_KEYS`, `isAnswerFilled` et `isPersonalAnswerKey` viennent tous de `@bellum/contracts` — un seul
registre (GA-26), celui que le serveur applique. Aucune liste recopiée à la main : ajouter une clé exigée au
contrat la fait apparaître ici sans second geste.

Conséquences, dans cet ordre :
1. La liste est affichée **avant** le clic, dès qu'il manque quelque chose — ce qui tue la boucle de Hicham, dont le
   cadrage est DÉJÀ validé : il n'a plus rien à cliquer pour apprendre ce qui bloque.
2. Chaque entrée porte le **libellé de sa question** (clé i18n du catalogue), jamais le nom de colonne
   (`main_sales_pain`), et un bouton qui ouvre la sous-étape qui la pose (`stageCode` + `slug` lus dans
   `TEMPS1_CATALOGUE_SUBSTEPS`, `questions/index.ts:289-300`).
3. **Rien ne manque ⇒ pas de blocage** : `completeError` est réécrit en échec d'enregistrement honnête
   (« L'ouverture de ton espace a échoué… »), et ne prétend plus qu'il manque une réponse. La phrase « il manque
   des réponses essentielles » n'existe plus que portée par la liste qui les nomme.
4. Une liste vide ne rend AUCUNE ligne (GA-18/GA-19, « on n'affiche pas ce qu'on n'a pas »).

### Décisions touchées, nommées

- **garde `#4158.12`** — un membre qui attend son administrateur n'est tenu qu'à ses clés PERSONNELLES. Le front
  refait exactement ce filtre (`awaiting_company_admin` du state + `isPersonalAnswerKey`) : sans lui, il nommerait à
  un membre invité des réponses ENTREPRISE que l'API ignore de toute façon.
- **garde `#2626.1`** — le catalogue (`TEMPS1_CATALOGUE_SUBSTEPS`) est lu, jamais touché : une clé exigée dont la
  question est reposée au Temps 2 garde son lien. On lit le CATALOGUE, pas le parcours.
- **garde `#2023.5`** — on ne renvoie jamais vers une question que le branchement ne pose pas ; les dix clés exigées
  sont par construction hors branchement conditionnel, et un test l'atteste.
- **garde Théo O onboarding-relecture.N2/N3/R5** — valider n'autorise NI accès, NI dépense, NI envoi, et la case se
  redemande quand l'empreinte change : aucun de ces comportements n'est modifié, seule la branche d'ERREUR l'est.
- `#4817` est l'issue de ce lot ; `#4818` (l'exigé indiscernable du facultatif DANS le cadrage) part en lot séparé.

## Ce que ce lot NE fait PAS

- Il ne touche pas la porte serveur (`onboarding.service.ts`) ni `isAnswerFilled` : la règle de ce qui bloque ne
  change pas, elle est seulement DITE.
- Il ne règle pas la cause possible du manque chez VERHELIA : « Je ne sais pas encore » sur une clé exigée de type
  liste écrit `[]` (`answer-status.ts:54-57`), que la porte compte vide. C'est un arbitrage produit (le cadrage
  refuse l'incertitude sur une exigée, OU la porte l'accepte) — ouvert à part : **#4875**. Avec ce lot, ce cas
  n'est plus un cul-de-sac muet : la clé est nommée et reliée.
- Il ne distingue pas l'exigé du facultatif DANS le cadrage (#4818).

## Droits

Aucune surface d'accès touchée : pas de route neuve (le lien réutilise `/onboarding/$id/$stage/$slug`, déjà gardée
par `beforeLoad` dans `routes/onboarding/$id/$stage/route.tsx`), pas de garde, pas de rôle, pas de nouvel appel
réseau. La dérivation est locale aux réponses DÉJÀ chargées dans le store par la page (`state.answers`), celles de
l'utilisateur courant — `getAnswers(userId)` côté API. Aucun identifiant d'un autre espace n'est lisible d'ici.
Test de cette absence de surface : `missing-essentials.test.ts` prouve que la dérivation ne lit QUE les réponses
qu'on lui passe (aucune requête, aucun accès au store global).

## Tests d'abord

1. `missing-essentials.test.ts`
   - deux clés exigées vides ⇒ deux entrées, dans l'ordre du contrat, chacune avec son libellé et sa cible
     `{stage, slug}` ;
   - tout rempli ⇒ liste VIDE (aucune ligne, GA-18) ;
   - `awaitingCompanyAdmin: true` ⇒ les clés ENTREPRISE sortent du dénominateur, les personnelles restent
     (garde #4158.12) ;
   - garde de couverture : **les dix** `TEMPS1_REQUIRED_KEYS` sont localisables dans le catalogue — si quelqu'un
     ajoute une clé exigée sans question, le test dit NON.
2. `FramingValidationBlock.test.tsx`
   - deux réponses manquantes ⇒ les deux libellés à l'écran + un clic par entrée appelle `onModify` avec la bonne
     cible ;
   - échec de complétion SANS réponse manquante ⇒ la phrase « il manque des réponses essentielles » n'apparaît pas.

## Gate ciblée (jamais la suite complète, jamais le build)

- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json`
- `pnpm --filter @bellum/web exec vitest run <les deux fichiers>`
- `node node_modules/prettier/bin/prettier.cjs --list-different <fichiers touchés>`
- `pnpm lint:exports:types` jusqu'au vert
