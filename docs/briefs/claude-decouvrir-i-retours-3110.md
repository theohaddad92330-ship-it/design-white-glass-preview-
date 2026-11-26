# Lot I — Découvrir : six retours récents (#5002 #4997 #5001 #4999 #5006 #4973)

Branche : `claude/decouvrir-i-retours-3110`

## Étape 0 — antériorité (OBLIGATOIRE, avant tout code)

Pour CHAQUE issue : `gh issue view <n>` en entier, puis `git log --oneline --grep '#<n>' origin/main` et `git grep -n '#<n>' origin/main`. Ce qui est déjà livré ne se recode pas : le dire dans la PR (« déjà là : fichier:ligne »). Les lots D/E (fusionnés) et F (en cours, branche `claude/decouvrir-f-siren-3110` : onglets Comptes/Autres acteurs, SIREN, tableaux compacts, champs du rail) touchent Découvrir : ne refais rien de F.

## Je fais (contrat validé par Louis 31/10 soir)

1. **#5002** « Data Strasbourg » : une ville du référentiel nommée SEULE en fin de phrase (sans « à ») devient la zone ; le reste = mots-clés. Lieu inconnu ⇒ reste mot-clé (règle #4841). Lecteur : `apps/web/src/features/discover/lib/discover-needs-freetext.ts` (`extractFreetextZone`) et IA `apps/ia/app/services/discover_request_reading.py` si le même trou y est. Tests : « Data Strasbourg » ⇒ ville Strasbourg, keywords data ; « Python Software » reste un NOM (#4842) ; « java atlantide » ⇒ atlantide reste mot-clé et est dit.
2. **#4997** filtres qui vident : quand la liste est vide (ou < 3) et que ≥ 2 filtres sont posés, l'écran DIT quel filtre la vide (« sans le filtre Taille ≥ 1000 : N comptes ») — calcul sur les candidats déjà reçus quand c'est possible (aucun appel payant en plus). Rejouer les combinaisons de l'issue (ferroviaire + IDF ; routier/maritime + IDF 50 km + 1000+) en test sur `discover-filters.ts:336`.
3. **#5001** « 23 contacts » : le libellé de l'onglet dit ce qu'il compte (ex. « 23 contacts sur 11 comptes ») ; chaque ligne montre la disponibilité e-mail / téléphone (icône + texte accessible) AVANT le clic, sans révéler la valeur ni débiter de crédit. `ContactResultRow.tsx:40`, `discover.json:362-383`. Une disponibilité inconnue ne s'affiche pas « 0 ».
4. **#4999** puce « Uniquement freelance » à côté de « CDI seul » (`FilterRail.tsx:668`) : restreint les besoins aux offres dont le CONTRAT est freelance/mission/indépendant selon le champ réel de la source (`discover-normalize.ts:201` ne garde que CDI : étendre au type de contrat réel, ex. France Travail `typeContrat` MIS/LIB/FRA, TheirStack `employment_statuses` contract/freelance). Aucune déduction depuis le texte libre seul ; si aucune source ne porte le signal pour la recherche, l'écran le dit. CDI seul et Freelance seul sont exclusifs.
5. **#5006** badge « hors cible » (Louis : critère = MOINS DE 20 SALARIÉS seulement) : un compte dont la tranche d'effectif du registre est < 20 porte un badge « hors cible » avec la raison (« moins de 20 salariés ») ; effectif inconnu ⇒ AUCUN badge (on ne devine pas). Aucun filtre posé par défaut, rien de caché. Recherche par compétence ET liste principale.
6. **#4973** secteurs de l'onboarding : Découvrir propose/pré-sélectionne dans le rail les secteurs choisis à l'onboarding de l'espace (lire où l'onboarding les stocke) — PROPOSÉS, pas posés en filtre d'office (#4529 « arrivée neutre » garde). Test de NON : un espace sans secteurs d'onboarding ne voit rien de pré-coché.
7. i18n toutes langues, démo (`demo-coverage.ts`) pour ce qui s'affiche, une ligne `tests-node.generated.ts` par test web ajouté.

## Je ne fais PAS

Ce que fait F ; nouvelles sources payantes ; Laura (lot J).

## Droits

Aucune surface d'accès. #5001 : la disponibilité ne révèle jamais la valeur (e-mail/téléphone) avant le geste qui la paie.

## Je défais

Rien. Lignes touchées portant `#NNN` (#4841, #4842, #4529, #4304, #3512) : les citer (« garde #N »).

Périmètre : `apps/web/src/features/discover/*`, `apps/web/src/features/onboarding/*` (lecture), `apps/web/src/i18n/*`, `apps/web/src/test/tests-node.generated.ts`, `apps/ia/app/services/*`, `apps/ia/app/routers/discover.py`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/demo/*`, `packages/contracts/*`, `docs/briefs/*`, `agent_docs/*`, `changes/*`

## Règles communes

- Pars de `origin/main` ; push `git push origin HEAD:refs/heads/claude/decouvrir-i-retours-3110` APRÈS CHAQUE POINT VERT (pre-push en fond + Monitor). Jamais main, jamais `--no-verify`.
- Plafond 300 tours (à 240 : commit, push, PR, rapport, stop). TDD, trace `// #<issue>.<n> — …`.
- Doctrine : jamais de donnée fictive, absence jamais « 0 », aucune source nommée sur une ligne.
- Tests CIBLÉS ; Prettier 3.9.10 ; fiche `agent_docs/*` couvrant un fichier touché ⇒ à jour.
- PR PRÊTE vers main dès le premier point poussé, corps = points + `fichier:ligne` + « déjà là » + ce qui reste. Rapport ≤ 15 lignes.
