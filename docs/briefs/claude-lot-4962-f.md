# Lot F — fiches consultants (#5016, #5017, #5018 ; contrat validé par Louis le 31/10/2026)

Compris : les compétences d'un consultant diffèrent entre Profil, Compétences et vivier (deux sources) ; les secteurs affichés sont déduits par l'IA ; le placeholder « 620 » passe pour une valeur saisie.
Je fais :

- #5016 `consultant_skills` FAIT FOI ; `consultants.stack` s'y synchronise à chaque écriture (création, modification, commit de CV — `consultants.service.ts:~504,~631`, `cv-parse.service.ts:~500`). Rattrapage CIBLÉ des seules fiches divergentes : un script en SIMULATION par défaut (`--appliquer` explicite), qui AFFICHE le compte de fiches touchées avant d'écrire, n'écrase jamais une correction humaine, idempotent. Le script n'est PAS lancé en production par toi.
- #5017 secteurs du consultant : seulement ceux CITÉS par le CV (une expérience nommée chez un client de ce secteur), jamais un secteur deviné (`apps/ia/app/prompts/bellum_cv_parse.py:~44` « secteurs DÉDUITS » → « secteurs cités ») ; les faire ressortir sur la fiche compte quand ils croisent le secteur du compte (`consultant-matching.ts`).
- #5018 `ConsultantFormDialog.tsx` : placeholders « 620 » et « 8 » remplacés par un exemple visiblement indicatif (« ex. 620 ») ou une aide, jamais une valeur qui semble saisie.
  Je ne fais PAS : migration de schéma (ajout seulement si indispensable — sinon aucune) ; supprimer `stack` ; lancer le rattrapage.

## Droits

Aucun nouveau : les écritures restent filtrées par `workspace_id` comme aujourd'hui ; le script de rattrapage filtre par espace et ne traverse jamais deux espaces.
Je défais : rien ; garde #3812, #3811, #4401.
Je mesure : le script en simulation sur la démo — nombre de fiches divergentes, dans le rapport.
Périmètre : apps/web/src/_, packages/i18n/_, apps/api/src/modules/consultants/_, apps/api/src/modules/cv_, apps/api/scripts/_, apps/ia/app/prompts/_, apps/ia/tests/_, apps/api/src/modules/demo/_, docs/briefs/*

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-f` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-f`. Tu ne pousses QUE sur `claude/lot-4962-f`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-f`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-f-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #5016 (diagnostic condensé)

- #5016 (M, retenu) : deux sources — consultants.stack → consultant_skills seulement création/modif (consultants.service.ts:504,:631) ; commit CV écrit consultant_skills à part (cv-parse.service.ts:500) ; onglet lit consultant_skills (TalentDetailPage.tsx:166). Redite #3812 (fermée). Q : source qui fait foi ? Reco consultant_skills.

## #5017 (diagnostic condensé)

- #5017 (M) : 17.1 déjà là partiel (TalentProfileTab.tsx:143 ← cv-parse.service.ts:907) mais bellum_cv_parse.py:44 « secteurs DÉDUITS » contredit « hors périmètre : secteurs déduits sans source » → à trancher. 17.2 retenu (fiche compte : seul consultant-matching.ts:206 lit les secteurs). 17.3 déjà là.

## #5018 (diagnostic condensé)

- #5018 (S, retenu) : ConsultantFormDialog.tsx:394 placeholder="620", :350 "8".
