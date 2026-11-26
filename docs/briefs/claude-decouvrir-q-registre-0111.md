# Lot Q — Découvrir : brancher P sur le chemin RÉEL (`/discover/registry`), Decathlon, Java HdF ≤ 60 s

Plafond : 300 tours. Modèle : sonnet. Brief autonome, lu sur `origin/claude/decouvrir-q-registre-0111`.

## Compris (recette prod 01/11 16:50 UTC, web 0ec240a310 / api 083654e1b0 / ia 9710fb9192 — journal `.claude/notes/registre-2026-11-01-recette-NOP.md` n'est PAS sur le dépôt, tout est recopié ici)

Les lots P (#5117) et N (#5111) sont fusionnés, mais une partie de ce qu'ils déclarent ne se voit pas en prod. Les causes ont été tracées sur `origin/main` :

1. **Onglet Comptes pollué** (FAIL) : la recherche « développeur Java dans les Hauts-de-France » affiche « Comptes (21) / Autres acteurs (46) », mais Comptes contient encore EXTIA, VIVERIS, RANDSTAD INHOUSE, DAVIDSON, LR TECHNOLOGIES, INFOTEL, DAVRICOURT, GESER, MAGELLAN, DAVEO et ICSIS. CAUSE : l'onglet se décide côté web (`Discover.tsx:1508` → `isOtherActor` dans `discover-other-actors.ts:19`, qui lit `actorKind` / `isEsnPeer` / `isIntermediary`). L'IA ne pose ces champs que dans `/discover/signals` (`discover_signals.py:~1866`), alors que la recherche passe par `/discover/registry` (`apps/ia/app/routers/discover.py:~1749`, candidats construits vers `:3960-4010`), qui n'en pose aucun. Le seul classement sur ce chemin vient de `intermediary_kind` (`discover_skill_offers.py:~1578-1587`) : il ne connaît que le NAF 620*/7022 et `competitor_intel.json`. Le NAF 78.20Z (intérim) manque dans `intermediation.py:~41`. Quand un NAF est résolu, le nom est ignoré (`intermediation.py:~259-275`) : RANDSTAD INHOUSE passe donc dans Comptes alors que RANDSTAD DIGITAL va bien dans Autres acteurs.
2. **Sans-NAF / sans-SIREN pas en bas** (FAIL) : CHANEL, DECATHLON FRANCE et ENEDIS sont aux rangs 9-11 sur 12, ORANGE en tête de la page 2. Le seul tri est par verdict / tranche / score / effectif (`discover.py:~4262`).
3. **Lieux tronqués** (FAIL, 6/21 « Hauts-de- ») : la valeur arrive déjà tronquée de la source, le test IA l'écrit même ainsi (`test_decouvrir_lieu_et_homonymes_4419_5_6.py:31`). P a ajouté `completePlace` (`discover-other-actors.ts:~110`), mais il n'est appelé que dans `OtherActorsTab.tsx` et `SkillSearch.tsx`, pas sur la ligne « Sites : » (`CandidateRow.tsx:~265` via `discover-site-cities.ts`).
4. **#4519 Data & IA + Île-de-France** (BLOCKED) : 0 compte et le bandeau « Résultat non vérifiable » (`network_error` avec 0 candidat, `Discover.tsx:~1999`) au bout de 20-24 s, sous le budget liste (~36,7 s, `discover.py:~548`). Deux causes compatibles : timeout registre de 8 s + réessai (`recherche_entreprises.py:~57, ~431`), ou coupe-circuit à 5 échecs / 30 s (`:~121`). Le point 6 du brief P (44 retenus / 0 affichés) n'a JAMAIS été livré : aucun commit sur `discover-filters.ts`, aucun test #4519.
5. **Decathlon** (FAIL) : une seule ligne, DECATHLON FRANCE, sans « + N entités du groupe ». Le web de N est correct (`CandidateRow.tsx:~573`) et l'IA appelle `group_by_brand` (`brand_grouping.py:67`, depuis `discover.py:~4066`). Mais il ne reçoit qu'un SIREN : les autres entités sont perdues AVANT (fetch registre, filtre secteur, qualification ou coupe, `discover.py:~3925-4030`).
6. **Java HdF prend 96-119 s** (budget tranché par Louis : ~55 s / couperet API 60 s). Quand `deadlineCut` est vrai (`discover_skill_offers.py:~1938`), le web rejoue la même recherche (`useDiscoverSearch.ts:~83`) avec un nouveau budget de 55 s : l'attente est doublée.
7. **« Choisir l'entreprise »** : bouton jamais vu. Le code est en place (`SkillSearch.tsx:~320`, il faut au moins 2 candidats), mais l'IA n'en envoie que pour les motifs `homonym` / `homonym_on_site` (`discover_skill_offers.py:~1657, ~740`). Ce n'est pas un défaut prouvé : NE PAS y toucher, sauf si le point 5 révèle des homonymes jetés.

Déjà PASS, à ne pas régresser : filtre entityType hors de « Tous les filtres », Lyon 25 km, Reims lu comme zone, budget TheirStack ≤ 301, 0 source nommée.

## Je fais

1. **Classement sur `/discover/registry`** : chaque candidat du chemin registry porte les MÊMES champs que `/discover/signals` (`actorKind` / `isEsnPeer` / `isIntermediary`), calculés par UNE fonction partagée (réutiliser `actor_typology.py` ; un réglage à un seul endroit, GA-26). Ajouter 78.20Z / 78.10Z / 78.30Z (intérim, placement) aux NAF d'intermédiaire. Le nom ne doit plus être ignoré quand le NAF est résolu : « INHOUSE », « DIGITAL », etc. d'une marque d'intérim connue → intermédiaire. Test de NON qui rejoue la liste prod (les 11 noms ci-dessus avec leurs NAF typiques 62.02A / 70.22Z / 78.20Z / 71.12B) : tous dans Autres acteurs ; ENEDIS, THALES, DECATHLON restent dans Comptes. NE PAS ajouter ces 11 noms en dur un par un : c'est le NAF et la règle qui décident. Un nom en dur n'est permis que pour une marque d'intérim/ESN déjà présente dans `competitor_intel.json`.
2. **Tri** : sans NAF ou sans SIREN ⇒ en bas de Comptes, sur toutes les pages (décision Louis 31/10, brief F §6 bis). Test.
3. **Lieux** : `completePlace` appliqué sur la ligne « Sites : » (`CandidateRow` / `discover-site-cities.ts`), ET corriger le test IA qui ÉCRIT la troncature. Si la source coupe, compléter côté IA (région connue par préfixe). Test « Lille, Hauts-de- » ⇒ « Lille, Hauts-de-France ».
4. **#4519** : reproduire en test (expertise Data & IA, region=11). Trancher la cause registre (timeout + réessai, ou coupe-circuit) en lisant le code et en doublant le client. Un registre lent ne doit plus rendre 0 compte : rendre les candidats déjà résolus + le bandeau qui nomme ce qui manque. Livrer le point 6 du brief P (44 retenus / 0 affichés : quel filtre web les jette). Tests de NON.
5. **Decathlon** : test IA avec une doublure du registre qui rend 4 SIREN « DECATHLON … » (FRANCE, SE, SAS de services, fondation) ⇒ la réponse `/discover/registry` doit porter une tête + ≥ 2 membres. Trouver l'étape qui les perd (secteur ? qualification ? coupe ?) et la corriger sans jamais fusionner (« on propose, on ne fusionne jamais »).
6. **≤ 60 s** : une recherche ne doit plus enchaîner deux passes bloquantes. La première passe rend ce qu'elle a à ~55 s. La suite (employeurs restant à vérifier) se complète EN ARRIÈRE-PLAN sans vider ni bloquer la liste affichée, avec un compteur « N employeurs en cours de vérification » sans chiffre inventé. Test web : `deadlineCut` ⇒ la liste reste affichée pendant le second appel.
7. Démo : les comptes ESN de la démo sont dans Autres acteurs, et un groupe dépliable est seedé (craft rule n°9, `demo-coverage.ts`). i18n toutes langues, mobile 390 px. Un test qui sait dire NON par point.

## Je ne fais PAS

TheirStack / budget (déjà PASS). « Data Nice » (le comportement est celui du brief N : mot-clé + suggestion « Chercher à Nice ? »). Market Memory. Le bouton « Choisir l'entreprise » hors point 5.

## Droits

Aucune nouvelle surface. Le choix d'homonyme reste cloisonné par espace.

## Je défais

Rien de décidé. Citer #4746, #4519, #4892, #4419 aux lignes touchées.

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/architecture/*`, `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/app/data/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/demo/*`, `packages/contracts/*`, `docs/briefs/*`, `changes/*`

## Règles communes

- Pars de `origin/main`. Push : `git push origin HEAD:refs/heads/claude/decouvrir-q-registre-0111` (push SIMPLE ; pre-push lancé en run_in_background puis attendu). Après chaque push, vérifier que `git ls-remote` = `git rev-parse HEAD`. Jamais main, jamais `--no-verify` / `--force`. Si le pre-push exige check-types, builder d'abord les dépendances (`pnpm --filter @bellum/contracts build`).
- PUSH APRÈS CHAQUE POINT VERT. PR PRÊTE vers main dès le premier point poussé. La PR liste honnêtement ce qui n'est PAS livré, point par point. Ne JAMAIS déclarer livré un point sans le fichier:ligne de l'APPELANT prod.
- Plafond 300 tours ; à 240 : commit, push, PR, rapport, stop. Tests CIBLÉS (≤ 5 specs, pytest ciblé) ; Prettier 3.9.10 ; tout nouveau test web ⇒ une ligne dans `tests-node.generated.ts`.
- Doctrine : jamais de donnée fictive ; jamais un SIREN deviné ; aucune source nommée ; une absence n'est jamais « 0 ».
- Rapport ≤ 12 lignes.
