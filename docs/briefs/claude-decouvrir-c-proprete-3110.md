# Lot C — Découvrir : une liste propre

Branche : `claude/decouvrir-c-proprete-3110`

Un lot AB parallèle touche la collecte, l'élargissement et les budgets du même `discover.py` : reste dans les filtres de qualité, le dédoublonnage et l'affichage ; modifications de `discover.py` minimales et localisées.

## Compris

Les comptes rendus doivent être des clients plausibles, une ligne par entreprise, sans faux positifs.

## Je fais (décisions Louis 31/10, tranchées) — lire chaque issue avec `gh issue view <n>` d'abord, et vérifier sur origin/main que le point n'est pas déjà livré (si oui : le prouver par `fichier:ligne` au rapport, ne pas recoder)

1. **#4842.1** — Un compte ne sort pas par son nom seul : sans besoin observé ni critère satisfait, pas de carte.
2. **#4892.1** — Une marque = une ligne : plusieurs entités juridiques d'une même marque (ex. Décathlon ×2) fusionnent en une ligne (siège/entité principale), les autres entités dépliables. On PROPOSE, on ne fusionne jamais en base (doctrine).
3. **#4469.1** — La compétence « cloud » ne ramène plus des offres situées à Saint-Cloud (un mot de compétence trouvé seulement dans le LIEU ne compte pas).
4. **#4945.1** — Une zone non reconnue dans la phrase libre est DITE à l'écran (reliquat #4841), jamais ignorée en silence.
5. **#4746.1** — « Clients finaux uniquement » retire les ESN des résultats.
6. **#4814.1 / #4626.1 / #4733.1** — Intégrer dans ta branche les PR déjà ouvertes #4952 (`claude/lot740-4814-decouvrir-clients-finaux`) et #4896 (`claude/lot585-d-couvrir-9-issues-vierges`) : `git merge origin/<branche>`, conflits résolus en gardant les deux côtés ; ta PR les remplace (le dire dans son corps : « remplace #4952 et #4896 »).

## Je ne fais PAS

Volume (lot B), base commune (lot A), nouvelles sources, l'onglet Signaux du compte.

## Droits

Aucune surface d'accès touchée.

## Je défais

Rien de décidé ; si une ligne touchée porte un `#NNN`, le citer.

Périmètre : `apps/ia/app/routers/discover.py`, `apps/ia/app/services/*`, `apps/ia/tests/*`, `apps/api/src/modules/ia-proxy/*`, `apps/api/src/modules/demo/*`, `apps/web/src/features/discover/*`, `apps/web/src/i18n/*`, `packages/contracts/*`, `docs/briefs/*`

## Règles communes (lire avant tout)

- Dépôt `Bellum-AI/belllum-monorepo`. Pars de `origin/main` (base daac70db04 ou plus récent). Tu travailles sur la branche indiquée en tête (elle existe déjà et porte ce brief), et tu pousses UNIQUEMENT sur elle : `git push origin HEAD:refs/heads/<branche>`. Jamais main.
- **Plafond : 300 tours.** À 240 tours : commit de ce qui est vert, push, PR, rapport, stop.
- **Tu livres TOUS les points du lot**, pas un seul. Chaque point = un test qui sait dire NON (écrit AVANT le code, TDD) + le code + la trace `// #<issue>.<n> — …` à l'endroit du comportement. Un point non fini se NOMME au rapport.
- **Antériorité** : avant d'éditer une ligne, `git blame` ; tout `#NNN` touché se cite dans le commit (« revient sur #N » / « garde #N »). Les décisions ci-dessous sont TRANCHÉES par Louis le 31/10 : ne pas les re-questionner.
- **Doctrine** (CLAUDE.md du dépôt) : jamais de donnée fictive, une absence ne s'affiche jamais « 0 », les sources (DataForge, Market Memory, nom de CRM, « base commune ») ne se NOMMENT JAMAIS sur une ligne ou une carte, aucune probabilité affichée.
- **Craft rule n°9** : toute nouveauté visible est semée en démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`).
- **Tests CIBLÉS seulement** : `cd apps/<x> && npx tsc --noEmit -p .` (jamais à la racine, jamais via rtk), les specs liées (≤ 5 fichiers), `pytest` ciblé côté IA. Suites complètes, check-types racine, build = CI.
- Commits groupés par fichier/écran, numéros dans le sujet. À la fin : `gh pr create --base main --head <branche>` PRÊTE (pas draft), corps = liste des points avec `fichier:ligne` + ce qui reste.
- Rapport final ≤ 15 lignes : branche, SHA, PR, points livrés / non livrés.
