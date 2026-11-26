# Sentry à zéro — vague 2 (20/10/2026, après le déploiement de #4379)

Source : org Sentry `bellumai`, relevé le 20/10 à 13 h 45 UTC, après la mise en production de `cbe00e7941` (PR #4379). La vague 1 (`docs/briefs/sentry-20-10.md`) est livrée. Au relevé, une seule issue a été vue sur la nouvelle version : API-D.

## Règles communes (tous les lots)

- Branche `claude/sentry2-<lot>-20-10`, partie de `origin/main` (qui contient #4379). **Jamais main**, jamais de PR (le coordinateur intègre). Push explicite : `git push origin HEAD:refs/heads/claude/sentry2-<lot>-20-10`.
- **Plafond 300 tours.** Un livrable, puis STOP. Aucun sous-agent. **Jamais de commande en arrière-plan** : tout en avant-plan, borné par `timeout 570`.
- TDD : un test qui reproduit le défaut AVANT le correctif. Tests **ciblés** seulement (≤ 5 fichiers de spec, `npx tsc --noEmit -p .` dans le paquet touché, compter les erreurs). Avant de tester : `pnpm install --frozen-lockfile && pnpm --filter "./packages/**" -r build`.
- **Toute spec qui simule (`vi.mock`/`jest.mock`) un module dont tu changes l'appelant doit suivre** : `grep -rn "<module simulé>" apps/*/src --include=*.test.* --include=*.spec.*`, puis lance ces specs. (Vague 1 : 101 tests web ont cassé parce que le hook remplacé restait simulé.)
- Une route neuve = une déclaration GA-05 (`@RequirePermission` ou `@WorkspaceRead`) **et** une ligne dans les listes de `apps/api/src/architecture/endpoint-guards.spec.ts`. Ne touche jamais un seuil ou un compteur de gel.
- Un fichier couvert par une fiche `agent_docs/` (`sources:`) qui bouge : mets à jour la fiche, ou ajoute `Doc-inchangée: <fiche> — <raison>` dans le message de commit.
- Ne touche ni `.github/workflows/`, ni `.claude/`. Scope commitlint parmi : api, web, ia, contracts, tooling…
- Doctrine : jamais de donnée inventée, un échec reste nommé ; jamais `Sentry.captureException` en direct (passer par le logger). **Un vrai défaut se CORRIGE, il ne se rétrograde pas en warning.** Une dégradation ATTENDUE et gérée (source externe en 429, timeout, utilisateur qui annule), ou un signal MÉTIER qui n'est pas une panne, passe en `warn`.
- Rapport final ≤ 15 lignes : branche + SHA, et par point : cause, correctif, test, ou « non corrigé : raison ».

## Lot TRANSPORT — branche `claude/sentry2-transport-20-10` (apps/api)

1. **Cause racine de BELLUM-API-7 (110 évts, 15 causes dans UNE issue).** `apps/api/src/sentry/sentry-winston.transport.ts` : quand Nest appelle `logger.error(message, stack)`, `stack` arrive en tableau, `errLike` n'est pas une `Error`, et la branche `captureException(new Error(message_), { extra: { original } })` crée l'erreur DANS le transport. Tous les événements ont donc la même pile (`sentry-winston.transport.js:54 < :79`), Sentry les range dans une seule issue, et `original.stack` arrive en `["[Object]"]`. Correctif :
   - **Empreinte par cause** : `scope.setFingerprint(['winston', <logger_context ou ''>, <message normalisé>])`. Normaliser = remplacer UUID, nombres, dates, e-mails et le texte entre parenthèses par un jeton fixe, pour que « Contrat sur facture à traiter — Tech4KIN : … » et « — Keyrus : … » tombent dans la même issue.
   - **Garder le détail** : la pile reçue en tableau ou en chaîne est jointe proprement en `extra.stack` (jamais `[Object]`). Si une `Error` se trouve dans les métadonnées (`err`, `error`, `cause`, ou un élément de `stack`), capture CETTE erreur, avec sa vraie pile.
   - Tests dans `sentry-winston.transport.spec.ts` (créer si absent) : deux messages différents → deux empreintes différentes ; deux messages qui ne diffèrent que par l'ID → la même empreinte ; `stack` en tableau → `extra.stack` est une chaîne lisible.
2. **Signaux métier envoyés au niveau `error` — DÉCISION TRANCHÉE : passer en `warn`** (ce ne sont pas des pannes, ils ont leur propre écran ou leur propre envoi) :
   - « Contrat sur facture à traiter — <client> : invoice_missing(…) » (34 évts, chaque nuit vers 05 h 10 UTC) ;
   - « Laura — espace en risque de churn critique » (13 évts, `POST /laura/plan`).
     Retrouve-les par `grep -rn` du texte dans `apps/api/src`. Si un test vérifie le niveau, mets-le à jour. Si l'un de ces logs est AUSSI le seul canal qui prévient un humain (aucun écran, aucun e-mail, aucune notification), garde `error` et dis-le dans le rapport.
3. **À GARDER en `error`** (alarmes voulues ; ne pas les toucher) : « Alertes d'observabilité aveugles », « Fuites d'identité détectées dans un corpus partagé », « System status down — down: database ».

## Lot API-DÉFAUTS — branche `claude/sentry2-api-defauts-20-10` (apps/api)

Ces causes étaient cachées dans BELLUM-API-7. Les journaux Railway d'avant le déploiement ne sont plus lisibles : pars du code (`grep -rn "<message>" apps/api/src`). Pour chacune, trouve dans quel cas le log part, puis : vrai défaut → test qui le reproduit, puis correctif ; échec externe attendu et déjà nommé à l'écran → `warn` avec la raison dans les métadonnées (jamais un secret ni un jeton).

1. « Failed to seed default library items » (3 évts, `GET /library-items`, le dernier à 13 h 33 UTC le 20/10, pendant le déploiement). Hypothèse à vérifier : semis concurrent de deux requêtes ou de deux répliques (contrainte d'unicité), ou semis tenté pendant une migration. Un semis doit être idempotent (`ON CONFLICT DO NOTHING` ou équivalent).
2. « rejectionReasonsTally error » (4 évts, dernier le 19/10).
3. « Écriture CRM non aboutie » (4 évts, dernier le 18/10) : si c'est le refus d'un CRM tiers déjà rendu à l'écran (porte d'écriture CRM, doctrine), `warn` ; si c'est notre code, corrige.
4. « Attio OAuth callback failed » et « Pipedrive OAuth callback failed » (2 + 2 évts le 19/10 à 07 h 24 UTC, même minute) : un utilisateur qui annule ou un `state` expiré = `warn` ; un échange de code cassé chez nous = défaut. Ne logue jamais `code`, `state` ni un jeton.
5. « Lecture de routine vivier en échec » et « Lecture de routine CRM en échec » (1 + 1, le 19/10 à 07 h 00 UTC).
6. « Import de sociétés interrompu » (1, le 18/10).
7. « Analysis stream ended without a terminal event (flux SSE tronqué) » (1, le 20/10 à 07 h 15 UTC).
   Ne pas toucher au transport Sentry (lot TRANSPORT).

## Lot N1-IA — branche `claude/sentry2-n1-ia-20-10` (apps/web, apps/api, apps/ia)

1. **BELLUM-WEB-3** — N+1 `GET /api/plan-items?account_id=*` sur la page `/actions/`. Même défaut que WEB-1 (vague 1) : un appel par ligne. Réutilise le regroupeur livré en vague 1 (`apps/web/src/features/briefing/lib/account-last-outcome-batch.ts`, `useAccountLastOutcome`, route `GET /plan-items/last-outcomes`) si le besoin est le même (le dernier résultat d'un compte). Sinon, un seul appel qui rend la liste. Craft rule 9 : l'écran reste rempli en démo.
2. **BELLUM-API-G** — N+1 `pg-pool.connect` sur `POST /laura/plan`. Lis le handler : une boucle `for … await repo.find…` → regroupe en `IN (…)` ; des requêtes indépendantes en `Promise.all` → laisse, et dis-le.
3. **BELLUM-IA-K** — « Consecutive HTTP » sur `/phase/4/plan` : appels `POST https://api.openai.com/v1/chat/completions` à la suite. S'ils sont indépendants, lance-les en parallèle (`asyncio.gather`, borné par le sémaphore ou la limite du module s'il y en a une). S'ils dépendent l'un de l'autre, laisse et dis pourquoi.
4. **BELLUM-IA-M** — log « Tour de copilote SANS ISSUE — ni action, ni réponse (cid=…, 2 outil(s) appelé(s)) », `/chat/message`, vu une fois à 10 h 05 UTC, AVANT le déploiement du correctif IA-9 (le dernier appel au modèle sans outils, livré dans #4379). Vérifie si ce correctif couvre ce chemin. Si oui, un test qui le prouve. Sinon, applique la même parade à ce chemin.
