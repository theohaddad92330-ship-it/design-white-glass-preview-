# Lot E — Découvrir : la base commune répond, la marque se regroupe sous le nom cherché, Market Memory devient source

Branche : `claude/decouvrir-e-base-mm-3110`

## Compris (recette prod du 31/10 15:37-15:42 UTC sur c1250a36b7, lot D servi)

- « développeur Java dans les Hauts-de-France » → 24 comptes ; « développeur à Lyon » → 22 comptes (9 Lyon + 13 élargis). Les offres répondent (log IA `offers=23`). MAIS **`common_base=0` sur TOUTES les recherches**.
- Logs API (correlation d859e463…, 9736adfc…) : `[WARN] Découvrir — source « base_reader » illisible (non-fatal, non mesurée) {"error":"could not determine data type of parameter $3"}` — `discover-sources.service.ts:206` (`port.read(...)`). La lecture `common_base` (`commonBaseCandidates`, :228) ne logue AUCUN warn ⇒ elle tourne et rend 0 ligne, ou sort tôt (critères vides :244).
- « Decathlon » (`?freetext=Decathlon`) → 12 lignes plates : DECATHLON FRANCE, BEL DECATHLON, FONDATION D'ENTREPRISE DECATHLON, MONTPELLIER DECATHLON ELITE, SCI DECATHLON - SALVA + 7 bruits phonétiques (LORIBAM, DECAILLON ROMAIN, DECATRON, EDUCATHLON, LUCATHLON, MECATHLON, S.N.C. DECAILLON). Aucun groupe : la règle du lot D (premier mot ≥ 6 lettres) ne voit qu'UNE clé DECATHLON.
- Bandeau « Recherche des offres d'emploi en cours — les cartes se mettent à jour toutes seules » resté affiché alors que la liste est complète (recherche « développeur à Lyon »).
- Section « Marché observé » (Market Memory, noms SANS SIREN ni date) sous la liste : Louis veut la RETIRER une fois ses comptes dans la liste.
  Objectif Louis : 50 à 100 comptes PERTINENTS par recherche, nourris par offres + base commune (DataForge + Market Memory).

## Je fais (décisions tranchées — Louis 31/10)

1. **#4793.3 base_reader `$3`** : trouver la requête de `port.read` (lecteur commun `apps/api/src/modules/base-reader/*`) dont le paramètre `$3` n'a pas de type (tableau vide / null sans cast `::text[]` ou `::uuid[]`…). Cast explicite. Test qui REJOUE la requête sur une vraie base de test si le dépôt en a une (`*.db.spec.ts`), sinon test sur le SQL généré (chaque `$n` casté).
2. **#4793.4 `common_base=0`** : prouver POURQUOI 0. Lire `commonBaseCandidates` (`discover-sources.service.ts:228-280`) et `commonBaseCandidatesQuery` (`base-reader.sql.ts:140-179`) avec les filtres réels des 2 phrases (`region=32, keywords=Java, technologiesObserved=Java` ; `city=Lyon, keywords=développeur`). Vérifier : critères non vides ? `placePatterns` d'une région ⇒ départements (lot D) mais `s.headquarters`/`nd.location` contiennent-ils un code ou un nom ? `termPatterns` vs contenu de `dataforge_needs.title/technologies` ? Le résultat API arrive-t-il à l'IA (`common_base` compté côté IA, `discover.py`) ? Corriger la cause, test qui dit NON sur l'ancien comportement. Si la cause est l'ABSENCE de données, l'écrire dans la PR avec la preuve (requête de comptage lue en code, jamais inventée) — ne pas maquiller.
3. **#4892.3 marque sous le nom cherché** : quand la recherche est un NOM (`q`), toutes les lignes dont la raison sociale CONTIENT le nom cherché en mot entier (« BEL DECATHLON », « FONDATION D'ENTREPRISE DECATHLON », « SCI DECATHLON - SALVA ») se regroupent sous UNE tête (la plus grande entité), les autres dépliables. Toujours PROPOSÉ, jamais fusionné en base. Garder la règle du lot D (premier mot ≥ 6 lettres) pour les listes non nominatives.
4. **#4842.2 bruit phonétique** : une recherche par NOM ne garde que les raisons sociales qui contiennent le nom cherché (mot entier, accents/casse ignorés) — DECAILLON, EDUCATHLON, LUCATHLON, MECATHLON, DECATRON, LORIBAM sortent. Test avec ces 7 noms exacts.
5. **#4677.2 bandeau offres** : « Recherche des offres d'emploi en cours » s'éteint quand la relecture est finie (même source que la pastille corrigée par le lot D : `useJobsPendingRetry` / `jobsSearching`).
6. **#4791.2 Market Memory source** : apparier chaque entrée Market Memory (nom d'entreprise) à un SIREN — réutiliser la résolution d'identité EXISTANTE (`discover_skill_offers.py` : cache « nom normalisé → identité registre », `_IDENTITY_NAMESPACE`/`TTL_EMPLOYER_IDENTITY`) avant d'écrire quoi que ce soit de neuf. Un nom non apparié avec certitude n'entre PAS (jamais deviné). Les comptes appariés entrent dans la LISTE comme candidats, avec leur besoin observé DATÉ si l'entrée porte une date ; sans date, AUCUN besoin affiché (doctrine : une absence ne fait aucune ligne). Lire d'abord `apps/api/src/modules/market-memory/market-memory.service.ts` et `apps/web/src/features/discover/lib/market-context.ts`.
7. **#4791.5 retirer « Marché observé »** (Louis 31/10) : APRÈS le point 6, retirer la section de Découvrir (`discover.json` clé `title: "Marché observé"` ~:1513, composant qui la rend, `market-context.ts` si plus appelé). Démo : mettre à jour `demo-coverage.ts` et `demo-discover-market-observed-coverage.spec.ts` (retrait assumé, raison écrite, jamais « vide à dessein » pour faire passer). Avant de retirer : `git grep` de tout ce qu'on n'atteignait QUE par cette section ; le nommer dans la PR.
8. Tests qui savent dire NON, un par point.

## Je ne fais PAS

Nouvelles sources payantes, budgets/volumes (livrés), versement des offres TheirStack dans la base commune (question ouverte à Louis), onglet Signaux du compte, la fiche compte.

## Droits

Aucune surface d'accès touchée. La lecture base commune ne reçoit toujours AUCUN espace (cloisonnement #4791.3 inchangé) ; le CRM d'un espace ne nourrit jamais un autre espace.

## Je défais

« Marché observé » (section posée par les lots Market Memory antérieurs) — retrait décidé par Louis le 31/10 ; citer chaque `#NNN` des lignes retirées (« revient sur #N »). Règle de marque du lot D étendue, pas remplacée (« garde #4892 »).

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/base-reader/*`, `apps/api/src/modules/market-memory/*`, `apps/api/src/modules/demo/*`, `apps/web/src/features/discover/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/i18n/*`, `packages/contracts/*`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes (lire avant tout)

- Pars de `origin/main` (≥ e0a952e28a, contient lot D + porte cloud #5055), branche ci-dessus (elle existe, porte ce brief) ; push `git push origin HEAD:refs/heads/claude/decouvrir-e-base-mm-3110`. Jamais main, jamais `--no-verify`.
- **PUSH APRÈS CHAQUE POINT VERT** (pas à la fin) : un commit non poussé meurt avec la VM. La porte pre-push saute les tests en cloud depuis #5055 (format, lint, types, doc restent) : elle doit passer en quelques minutes ; si elle échoue, corriger le format/lint/type signalé, jamais la contourner.
- **Plafond : 300 tours.** À 240 : commit du vert, push, PR, rapport, stop.
- TDD, trace `// #<issue>.<n> — …` à l'endroit du comportement.
- Doctrine : jamais de donnée fictive, une absence n'est jamais « 0 », aucune source nommée sur une carte.
- Tests CIBLÉS seulement (`npx tsc --noEmit -p .` du paquet, specs liées, pytest ciblé) ; `rtk proxy …` si rtk masque. Prettier = version du pnpm-lock (3.9.10). Nouveau test web ⇒ UNE ligne dans `apps/web/src/test/tests-node.generated.ts`. Fiche `agent_docs/*` couvrant un fichier touché ⇒ mise à jour.
- PR PRÊTE vers main dès le point 1 poussé (puis la compléter), corps = points + `fichier:ligne` + ce qui reste. Rapport ≤ 15 lignes.
