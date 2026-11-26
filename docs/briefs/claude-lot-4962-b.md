# Lot B — fiche compte + préparer l'appel (retours bêta, contrat validé par Louis le 31/10/2026)

Compris : sur la fiche compte, les scores et recommandations ne disent rien au commercial (« 17 sur 25 », pilote générique au CDO, tout en réserve) ; dans « préparer l'appel », ouverture et objections sont mêlées, les objections sont hors sujet et le pitch ignore l'offre déclencheuse.
Je fais :

- #4991 onglet évaluation : le score dit en MOTS ; « méthodo sales ESN p25 » disparaît ; le détail /25 passe dans un repli (cohérent avec la décision Louis du 23/10 : plus de points en en-tête).
- #4990 liste des comptes : quand aucun compte n'est « agir maintenant », un résumé « aucun compte à attaquer : N en réserve, raison principale : … ». Les SEUILS ne changent PAS. Légende des 5 verdicts.
- #4995 génération du plan : le pilote « livrable en 6 semaines » n'est plus imposé à chaque play (`apps/ia/app/prompts/bellum_strategy.py:~121`) ; le message vise le rôle le plus proche de l'offre ; le CDO reste VISIBLE dans la structure (#4923.14, `head_recall.py` et golden inchangés dans leur intention — adapter seulement si l'attendu portait le pilote).
- #4965 sections secondaires de l'analyse pliables, état plié/déplié MÉMORISÉ (localStorage par section) — revient sur le contrat « jamais persisté » de `CollapsedSection.tsx` POUR CES SECTIONS seulement (arbitrage Louis 31/10, malgré #4399 : écrire « revient sur #4399 » dans le commit).
- #4988.1 en-tête de compte : ligne « Groupe X · entité analysée Y » quand le compte est une entité d'un groupe connu ; rien sinon.
- #4975 pitch d'appel en DEUX blocs : ouverture générale, puis objections séparées (les « Objections : … » du brief n'alimentent que le bloc objections).
- #4976 objections plausibles pour le compte (pas génériques) + bouton « Autre approche » qui régénère.
- #4977 l'ouverture cite l'offre d'emploi déclencheuse quand elle existe ; sinon une phrase dit qu'aucune offre ne sert de point d'appui (pas d'offre inventée).
- #4981 page d'approche contact : un bouton unique « Enrichir puis préparer » (confirmation, enrichissement, puis préparation) ; si aucun e-mail trouvé, message + bascule LinkedIn.
  Je ne fais PAS : changer les seuils de score ; retirer le CDO ; #4994 et #4993 (en attente de capture client) ; #4980 (attente capture) ; envoyer un message (le commercial envoie).

## Droits

Aucun : pas de menu, route ni permission. L'enrichissement garde ses crédits implicites existants (jamais de chiffre de crédits affiché).
Je défais : #4399 pour la persistance du pliage (arbitré). Garder #4923.14, #2633.
Je mesure : sans objet.
Périmètre : apps/web/src/_, packages/i18n/_, packages/contracts/src/schemas/account-score.ts, apps/ia/app/prompts/_, apps/ia/eval/_, apps/ia/tests/_, apps/api/src/modules/demo/_, docs/briefs/*

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-b` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-b`. Tu ne pousses QUE sur `claude/lot-4962-b`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-b`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-b-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #4965 Analyse de compte, sections pliables

écran : /accounts/$id (TabOverview) · points : 3 · taille : M
| 4965.1 | sections secondaires repliées par défaut | retenu | TabOverview.tsx:268-513 utilise déjà `CollapsedSection` (défaut `defaultOpen` par section : :346, :366, :411, :446) ; liste « secondaires » à fixer | seules les secondaires repliées | prod : fiche compte, repli visible | non | non | liste à fixer par Louis (propose : données publiques, historique, structure tech) |
| 4965.2 | verdict + phrase d'action restent visibles | retenu | AccountVerdictSummary.tsx:72 (appelant non vérifié) | — | verdict visible replié | non | non | — |
| 4965.3 | état mémorisé par utilisateur et section | retenu (arbitré Q11) | CollapsedSection.tsx:38,103 : contrat « jamais restauré depuis localStorage, jamais persisté » → à changer pour ces sections ; précédent localStorage : contact-group-mode.ts:30 | plié/déplié retrouvé | replier, recharger, retrouvé | non | non (localStorage) ou oui si par compte utilisateur | — |
antériorité : #4399 (close 25/10, besoins dépliés, écart assumé), #4598 ouverte ; contrat CollapsedSection.tsx:103.

## #4975 Séparer ouverture et objections

écran : /contacts/$id/approach/call · points : 2 · taille : M
| 4975.1 | « Objections : … » du brief n'alimente que le bloc objections | à trancher | texte du brief → `context` (ComposerDock.tsx) ; Drive : message.py:232-238 « suis sa trame et réponds aux objections » ; CallApproachBody.tsx:85 objections lues du dossier | ouverture générale + bloc objections séparé | même brief, deux blocs | non | non | Q: Théo préfère l'attaque directe (Simon) ? Reco: deux blocs, Louis tranche |
| 4975.2 | deux blocs à l'écran | retenu (partiel déjà là) | CallApproachBody.tsx:62-85,330,345 : ouverture / questions / objections déjà trois zones ; le défaut est dans la génération | idem | idem | non | non | — |
antériorité : #3697 close (préparer l'appel), #4525 ouverte.

## #4976 Objections hors sujet + « Autre approche »

écran : /contacts/$id/approach/call, panneau compte · points : 3 · taille : M
| 4976.1 | objection étayée par le dossier (pas « pas référencés » pour un client) | retenu | objections lues du dossier : message.ts:28 `readObjections` ; génération au dossier : emplacement à relire (« message.py:236 » cité est en fait la trame Drive, sans lien) | objections plausibles | compte client : pas d'objection « pas référencés » | non | non | — |
| 4976.2 | champ d'angle renommé + bouton « Autre approche » | retenu | engagement.json:163 placeholder « Décris l'angle… » ; précédent accountDetail.json:597 « Générer un autre angle » | bouton Autre approche | appel : bouton présent | non | non | — |
| 4976.3 | libellés non contradictoires | retenu | engagement.json:166-167 « N objection(s) à anticiper » vs champ d'angle | idem | panneau lu | non | non | — |
antériorité : #3637 close (objectionsGap), issue sœur #4975.

## #4977 Pitch depuis l'offre déclencheuse

écran : /contacts/$id/approach/call · points : 2 · taille : L
| 4977.1 | script cite l'offre (poste, ville) | retenu | ancrage : approach-grounding.ts:13 types account_signal/contact_signal/contact_need ; aucune offre d'emploi comme fait cochable (grep job_offer dans contacts : 0) ; monté ApproachPage.tsx:146 | ouverture cite l'offre | depuis une offre d'un compte, script citant poste+ville | non | non (lecture des offres) | — |
| 4977.2 | sans offre liée, l'écran le dit | retenu | — | message d'absence | contact sans offre | non | non | — |
antériorité : #4524 ouverte (signaux e-mail ; l'appel utilise déjà useApproachGrounding), #3697 close, #3695 close ; à vérifier : #3697 ne couvre pas l'offre.

## #4981 Contact — un bouton unique « Enrichir puis préparer »

écran : /contacts/$id/approach · points : 3 · taille : M
| 4981.1 | enrichir puis préparer en un geste | retenu | ApproachPage.tsx:531 <ContactEnrichButton> séparé ; useContactEnrich (ContactEnrichButton.tsx:~95 confirmEnrich) ne déclenche rien ensuite ; la préparation est un autre geste | un bouton qui, après confirmation et enrichissement réussi, lance la préparation | contact sans e-mail : 1 clic → confirmation coût → message préparé | non | non | — (arbitrage Q5 déjà rendu) |
| 4981.2 | coût annoncé et confirmé avant | déjà là | EnrichConfirmDialog.tsx:110 monté par useContactEnrich (confirmOpen/setConfirmOpen ContactEnrichButton.tsx:~100), appelant ApproachPage.tsx:531 ; garde crédit useCreditGate | à conserver tel quel | dialogue de coût visible avant débit | non | non | — |
| 4981.3 | sans e-mail trouvé : le dire + LinkedIn | retenu | engagement.json « linkedinOnly » (“À approcher via LinkedIn — aucun e-mail ni téléphone connu”) existe côté composer ; chaîne d'issue de l'enrichissement vide non reliée à ApproachPage | message « aucun e-mail trouvé » + bascule LinkedIn | enrichir un contact sans e-mail → écran propose LinkedIn | non | non | — |
antériorité : #4062 (CLOSED 12/10, commentaire « #AM.36 (#4062) » ApproachPage.tsx:529) ; doctrine coût = geste explicite confirmé (conservée) ; le copilote n'envoie jamais d'e-mail.

## #4988 Analyse — quelle entité du groupe est analysée

écran : /accounts/$id (en-tête) + onboarding · points : 2 · taille : M
| 4988.1 | nommer groupe et entité | retenu | AccountDetailHeroIdentity.tsx : aucune occurrence parent/group (grep) ; monté AccountScopePanel.tsx:12 → AccountDetailHero.tsx:310. EntityResolutionPanel (TabOverview.tsx:469) existe déjà (résolution d'entité, onglet Vue d'ensemble) | ligne « Groupe X · entité Y » dans l'en-tête | fiche d'un compte filiale | non | non | — |
| 4988.2 | entité suggérée + pourquoi ; effectif 0 holding | à trancher | écran de Maeva inconnu (À préciser) ; #4892 OPEN (Découvrir) | « suggérée : … parce que … » ; effectif 0 = « holding, non mesuré » | création de compte multi-entités | non | non | Q: quel écran propose les entités ? Reco: demander à Maeva ; sinon traiter dans #4892 |
antériorité : #4996 (une équipe sur le compte groupe — modèle, hors périmètre) ; #4892 open.

## #4990 Scores — « en réserve » partout, aucun vert

écran : /accounts · points : 2 · taille : M
| 4990.1 | légende des verdicts dans la liste | retenu | libellés ci-dessous construits par namedAccountVerdict (packages/contracts/src/schemas/account-score.ts:172-195 : PRUDENT→RÉSERVE, NO-GO sans déclencheur→ÉCARTER POUR CET OBJECTIF, GO→AGIR MAINTENANT) ; liste : accounts-list/types.ts:295 ; aucune légende trouvée | légende « AGIR MAINTENANT / RÉSERVE / METTRE EN VEILLE / ÉCARTER POUR CET OBJECTIF / QUALIFIER » | /accounts : légende au clic | non | non | — |
| 4990.2 | au moins un « à attaquer » ou dire pourquoi aucun | à trancher | produit un message de portefeuille, pas le scoring (hors périmètre) ; « tout en réserve à l'onboarding » non reproduit (écran inconnu) | « aucun compte à attaquer : n en réserve, raison dominante » | portefeuille de 10 | non | non | Q: afficher un résumé honnête ou revoir les seuils ? Reco: résumé seulement (pas de probabilité, pas de bonification promise) |
antériorité : #2932 (verdict nommé, merge fix/verdict-liste-2932), #3818, #3912 (CLOSED 08/10), #4598 ; doctrine « jamais de probabilité ».

## #4991 Analyse — « 17 sur 25 » ne dit rien

écran : /accounts/$id (onglet évaluation) · points : 1 · taille : M
| 4991.1 | score en mots + barème visible, sans « méthodo p25 » | à trancher | CAUSE : ScoreSummaryCard.tsx:44 (gaugeSuffix '/25'), :147/:176/:415, accountDetail.json:122 verdictRule « règle /25 (méthodo sales ESN p25) » ; appelants TabEvaluation.tsx:31, AccountKnowledgeCounters.tsx:143. CONTRADICTION : AccountVerdictSummary.tsx (~139-146) « Louis 23/10 — plus de 15/25 : aucun score en points » | retirer « méthodo sales ESN p25 » ; dire le barème en mots | onglet évaluation | non | non | Q: supprimer les points de l'onglet (cohérent 23/10) ou garder + barème ? Reco: mots d'abord (cohérent 23/10), détail /25 replié |
antériorité : Louis 23/10 (AccountVerdictSummary.tsx), #3912 (CLOSED 08/10), #3524.

## #4995 Analyse — recommandations génériques (pilote 6 semaines au CDO)

écran : /accounts/$id (onglet plan) · points : 1 · taille : M
| 4995.1 | viser le rôle proche de l'offre, pas de pilote générique au CDO | à trancher | CAUSE probable : IA/prompts/bellum_strategy.py:121 « livrable en 6 semaines » imposé à chaque play + :126 « STRATEGIE SANDWICH… C-level sponsorise » ; rendu AttackAnglesSection.tsx (TabPlan.tsx:209). CONTRADICTION possible : IA/eval/head_recall.py + golden axa/decathlon (#4923.14, Julien Laszlo 30/10) attendent CDO/Head of Data comme têtes à remonter | play spécialisé IA/Data, CDO = relais, rôle proche de l'offre = porte n°1 | rejouer un compte IA/Data | non | non | Q: CDO reste-t-il visible (structure, #4923.14) mais plus cible du pilote ? Reco: oui — structure inchangée, ciblage du message vers le rôle proche de l'offre |
antériorité : #2633 (CLOSED 21/09 spécialiste IA/Data), #2628 (CLOSED 21/09), #4923.14 ; régression non prouvée (À préciser de l'issue).

# Diagnostic #4996-#5012 (17 issues, 43 points) — lu sur origin/main, 31/10/2026

Légende : AE=apps/web/src/features/accounts/view/account-detail/tabs ; DV=apps/web/src/features/discover/view ; DL=apps/web/src/features/discover/lib
