# Lot H — Laura : dire ce qu'elle sait et ce qu'elle n'a pas lu (retours bêta, contrat validé par Louis le 31/10/2026)

Compris : Laura ignore la classe d'accès des comptes (A-D) qu'affiche Découvrir, ne dit pas qu'elle n'a pas lu le CRM quand il n'est pas importé, et répond « ce compte prend des consultants sans service achats » sans fait.
Je fais :

- #5013 Laura connaît la classe d'accès A-D (`access_scoring.py:~373`, `account-access.service.ts:~868`) : l'outil de Laura qui liste/filtre les comptes l'expose ; « les comptes les plus faciles où entrer » = tri par cette classe, avec la raison factuelle.
- #5014 quand l'espace n'a AUCUN import CRM (`portfolio-priorities.ts` champ `imported`), Laura le dit : « je n'ai pas lu ton CRM : il n'est pas importé » (distinct de « aucun CRM connecté », `context_transparency.py:~373`). Antériorité #4054.
- #5012 « qui prend des consultants » : Laura ne répond qu'avec des faits DÉJÀ collectés (recours à la régie/freelance, ESN en place #2291.2) et cite le signal ; jamais « sans service achats » deviné ; sinon « je n'ai pas de signal établi ».
- #5008 côté Laura : quand elle cite un compte, elle dit le siège et les implantations comme la carte Découvrir (`discover-geography.ts`).
  Je ne fais PAS : #5011 (accompagnement selon l'avancement, vague suivante) ; #5019 (rattaché à #4421) ; nommer un fournisseur ; afficher une probabilité.

## Droits

Aucun : Laura lit les seules données de l'espace (filtre `workspace_id` existant).
Je défais : rien ; garde #4054, #2291.
Je mesure : sans objet.
Périmètre : apps/ia/app/_, apps/ia/tests/_, apps/ia/eval/_, apps/api/src/modules/accounts/_, apps/api/src/modules/chat/_, apps/web/src/_, packages/i18n/_, docs/briefs/_

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-h` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-h`. Tu ne pousses QUE sur `claude/lot-4962-h`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-h`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-h-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #5008 Zone — siège et implantations de chaque compte

écran : /discover + /chat · points : 3 · taille : S (Découvrir) + M (Laura)

| point                                                | demande                                             | état                                 | preuve/cause                                                                                                                                                                                                                                                                                                                                                                                                                                                           | livre                                                       | recette                                                                                                   | droits | donnée | question |
| ---------------------------------------------------- | --------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ | ------ | -------- |
| 5008.1                                               | Afficher « siège X · N implantations dans la zone » | déjà là (Découvrir) / retenu (Laura) | DL/discover-geography.ts:25-42 (`candidateGeographyLine`) ; clés discover.json:751-755 (« Siège à {{city}} ({{department}}) · implantée dans la zone (N établissements) ») ; rendu CandidateRow.tsx:348-353 (`candidate-geography`), monté Discover.tsx:2086. Reste : sans département connu → « Implantée dans la zone » sans siège (discover-geography.ts:36) ; pas de mot « magasins » ni ville de la zone ; Laura : chat_tools.py:14483-14491 ne donne que la base | Carte + réponse Laura disent le siège même sans département | /discover zone Lille : Promod/Décathlon portent « Siège à … · implantée dans la zone (N établissements) » | non    | non    | —        |
| 5008.2                                               | La zone continue de filtrer sur l'implantation      | déjà là                              | chat_tools.py:14472-14491 (#3983 défaut implantation)                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                           | —                                                                                                         | non    | non    | —        |
| 5008.3                                               | Aucune implantation sans source                     | déjà là                              | discover-geography.ts:20 (« null quand le registre ne prouve rien »)                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                           | —                                                                                                         | non    | non    | —        |
| antériorité : #3983 (fermée 19/10), #4706 (ouverte). |

## #5012 Laura — comptes qui prennent des consultants sans service achats

écran : /chat + /discover · points : 2 · taille : L

| point                                                                            | demande                                                                     | état       | preuve/cause                                                                                                                                                                                                               | livre                              | recette                                     | droits | donnée       | question                                                                                                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- | ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5012.1                                                                           | Répondre « qui achète de la prestation sans service achats » avec le signal | à trancher | Aucun signal « achète de la prestation » trouvé (issue : recherche faite, non prouvé livré) ; régime proche #3705/#4408 « petite structure sans gros process achat » ; LinkedIn = #2634 (fermée 31/10 : arbitrage rouvert) | Laura cite le signal qui l'établit | /chat : la question → comptes + signal cité | non    | oui (signal) | Q: quel signal ? Reco: ne répondre qu'avec des faits déjà collectés (recourt à la régie/freelance, ESN en place via #2291.2) ; ne pas déduire « sans service achats » |
| 5012.2                                                                           | Jamais « sans service achats » sans preuve                                  | retenu     | doctrine « jamais de donnée fictive »                                                                                                                                                                                      | —                                  | —                                           | non    | non          | —                                                                                                                                                                     |
| antériorité : #3705, #4408, #2634 (fermée 31/10/2026 — lire la décision), #4747. |

# Diagnostic #4996-#5012 (17 issues, 43 points) — lu sur origin/main, 31/10/2026

Légende : AE=apps/web/src/features/accounts/view/account-detail/tabs ; DV=apps/web/src/features/discover/view ; DL=apps/web/src/features/discover/lib

## #5013 (diagnostic condensé)

- #5013 (M, /chat + /discover, 3 pts, retenu) : classe A-D existe (access_scoring.py:373, account-access.service.ts:868, Discover.tsx:1372) ; aucun appel dans chat_tools.py → Laura ne la connaît pas. Réf. #4470 inexacte.

## #5014 (diagnostic condensé)

- #5014 (S, /chat, retenu) : portfolio-priorities.ts (`imported` :65) ; aucun signal « aucun import » rendu à Laura (bellum_advisor.py:1166). « Aucun CRM connecté » existe (context_transparency.py:373) ≠ « CRM non importé ». Antériorité #4054 (fermée).
