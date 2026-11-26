# Lot D — Découvrir : la phrase libre est LUE (métier, techno, zone), la base commune et les offres répondent

Branche : `claude/decouvrir-d-lecture-3110`

## Compris (recette prod du 31/10 sur cfe0fedab2)

- « développeur Java dans les Hauts-de-France » → 0 compte : lu comme NOM d'entreprise ; bandeau « « s Hauts-de-France » n'a pas été reconnu comme zone ». Log IA `registry=5 offers=0 common_base=0`.
- « développeur à Lyon » → 25 raisons sociales contenant « DEVELOPPER ». Log `registry=25 offers=0 common_base=0`.
- « Decathlon » → 13 lignes DECATHLON, aucune regroupée.
  Objectif de Louis : 50 à 100 comptes PERTINENTS par recherche, nourris par les offres et la base commune.

## Causes mesurées (diagnostic sur origin/main cfe0fedab2 — à revérifier avant d'éditer)

1. Web : `freetextSkillAndCity` (`apps/web/src/features/discover/lib/discover-needs-freetext.ts:272-287`, appelée `Discover.tsx:969`) exige une zone DANS le reste ; or `extractFreetextZone` (`Discover.tsx:927`) a déjà retiré la zone → `null`. Un métier seul (`ROLE_WORDS` :253) vide la liste de compétences → `null`.
2. IA : `read_request` (`apps/ia/app/services/discover_request_reading.py:478`) ne lit `_PROFILE_WORDS` (:145, « developpeur », « java »…) qu'avec l'intention `hiring` ; sinon `leftover` → nom `q` (`discover.py` ~1000-1004). `skill_read` (~1030) n'en pose que si TOUT le reste est un alias du référentiel.
3. Web : `UNKNOWN_ZONE_RE` (`discover-needs-freetext.ts:347`) : `le` avant `les` dans l'alternation + `\s*` ⇒ capture « s Hauts-de-France » ; `SearchReadingNotice.tsx:40` relit le texte brut et affiche le message alors que la région est posée.
4. Base commune : critères calculés par l'API sur les filtres BRUTS avant la lecture IA (`ia-proxy.controller.ts:1163-1171`, `discover-sources.service.ts:228-246`) ; `discoverBaseCriteria` (`base-matches-source.ts:50`) ignore `freetext` ⇒ entrées vides ⇒ `return []`. Et un code RÉGION (« 32 ») passe dans `placePatterns` (`base-reader.sql.ts:59`) comme un département (`%(32)%` = Gers).
5. Offres : `_discover_by_skill` ne part que si `skill_terms(keywords, technologiesObserved)` est non vide.
6. Marque : `group_by_brand` (`apps/ia/app/services/brand_grouping.py:36-50`) seau = (brand_key, ville) ⇒ jamais 2 SIREN dans un seau.

## Je fais (décisions tranchées — Louis 31/10 + « tranché sans toi » nommés)

1. **Lecture** : un métier (« développeur », « dev », « data engineer », « chef de projet »…) et/ou une techno (« Java », « Vue ») dans la phrase libre sont lus comme besoin → `keywords`/métier, chemin OFFRES, JAMAIS comme raison sociale — avec ou sans zone, avec ou sans « recrute ». Corriger côté IA (`read_request` sans exiger `hiring` quand le reste est métier/techno) ET côté web (reparser le reste après `extractFreetextZone`, accepter un métier seul). Garder les témoins existants : « Capgemini », « Python Software » restent des NOMS (#4842).
2. **Zone** : « dans les Hauts-de-France », « en Île-de-France », « dans le Nord », « à Lyon » posent la zone ; `UNKNOWN_ZONE_RE` ordonné `les|le|la|l'` avec `\s+`, et le message « non reconnue » ne s'affiche JAMAIS quand `extractFreetextZone` a posé une zone. Le bandeau ne se contredit plus (« filtrés sur X » ET « X non reconnu » interdits ensemble).
3. **Base commune après lecture** : les critères de la base commune sont calculés APRÈS la lecture de la phrase (métier/techno/zone lus), pas sur les filtres bruts — soit en appelant la base commune depuis l'IA après `_apply_reading`, soit en lisant la phrase côté API ; choisir le plus simple qui garde UN seul lecteur (garde GA-26 : la requête reste dans `base-reader.sql.ts`). Les codes RÉGION sont convertis en départements/libellés avant `placePatterns`. Toujours sans espace (cloisonnement #4791.3 inchangé).
4. **Marque (tranché sans Louis)** : regrouper par marque sur TOUTES les villes : clé = `brand_key`, et si le premier mot significatif fait ≥ 6 lettres, clé = ce premier mot (« DECATHLON LOGISTIQUE » ⇒ DECATHLON) ; ≥ 2 SIREN distincts ; tête = plus grande entité ; les autres dépliables. Toujours PROPOSÉ, jamais fusionné en base.
5. **Pastille** « Signaux en cours de recherche » : disparaît quand la recherche des signaux est finie (y compris quand elle finit sans rien).
6. Tests qui savent dire NON, un par point, dont : les 3 phrases de la recette (rejeu de la lecture : « développeur Java dans les Hauts-de-France » ⇒ keywords contient java, région 32, pas de `q` ; « développeur à Lyon » ⇒ métier, ville Lyon, pas de `q`) ; critères base commune non vides pour ces deux phrases ; « 32 » ⇒ départements 02/59/60/62/80 ; 13 DECATHLON de villes différentes ⇒ 1 tête + 12 dépliés.
7. Démo : si un affichage change (pastille, bandeau), vérifier `demo-coverage.ts`.

## Je ne fais PAS

Market Memory comme source (lot suivant), nouvelles sources, budgets/volumes (déjà livrés), onglet Signaux du compte.

## Droits

Aucune surface d'accès touchée. La lecture base commune ne reçoit toujours AUCUN espace.

## Je défais

Rien de décidé. Si une ligne touchée porte un `#NNN` (#4842, #4945, #4892, #4791, #4792), le citer (« garde #N » / « revient sur #N »).

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/base-reader/*`, `apps/api/src/modules/demo/*`, `apps/web/src/features/discover/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/web/src/i18n/*`, `packages/contracts/*`, `docs/briefs/*`, `agent_docs/*`

## Règles communes (lire avant tout)

- Pars de `origin/main` (≥ cfe0fedab2), branche ci-dessus (elle existe, porte ce brief) ; push `git push origin HEAD:refs/heads/claude/decouvrir-d-lecture-3110`. Jamais main.
- **Plafond : 300 tours.** À 240 : commit du vert, push, PR, rapport, stop.
- **TOUS les points**, chacun : test AVANT le code (TDD), code, trace `// #<issue>.<n> — …` (issues : #4419 lecture, #4945 zone, #4793 base commune, #4892 marque, #4677 pastille).
- Doctrine : jamais de donnée fictive, une absence n'est jamais « 0 », aucune source nommée sur une carte.
- Tests CIBLÉS seulement (`cd apps/<x> && npx tsc --noEmit -p .`, specs liées, pytest ciblé) ; rtk masque/ment sur jest/pytest/prettier : `rtk proxy …`. Prettier = la version du pnpm-lock (3.9.10). Un nouveau test web s'inscrit dans `apps/web/src/test/tests-node.generated.ts` (UNE ligne par test ajouté). Une fiche `agent_docs/*` qui couvre un fichier touché se met à jour (garde « la doc suit le code »).
- PR PRÊTE vers main à la fin, corps = points + `fichier:ligne` + ce qui reste. Rapport ≤ 15 lignes.
