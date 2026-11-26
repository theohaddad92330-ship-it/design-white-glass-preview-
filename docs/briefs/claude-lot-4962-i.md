# Lot I — comptes et contacts par zone, ESN de rang 2 (retours bêta, contrat validé par Louis le 31/10/2026)

Compris : le commercial ne peut pas trier ses contacts ni filtrer son portefeuille par zone géographique, et sur un grand compte il ne voit pas les contacts des ESN de rang 2 qu'il a déjà.
Je fais :

- #4982.1 tri « zone » sur la liste de contacts (proches d'abord, selon la zone du profil) ; #4982.2 regroupement par ville/région (PAS de carte). #4982.3 côté Laura : rattaché à #4794, ne pas dupliquer.
- #4989.1 filtre ville/département sur le portefeuille /accounts ; #4989.2 le filtre porte aussi sur les implantations quand elles sont connues (sinon le siège seul, et c'est dit).
- #4987 sur un grand compte (onglet partenaires), les contacts DÉJÀ en base de chaque ESN de rang 2 (compte ESN existant dans l'espace) + bouton « Préparer un message » ; sinon la phrase « aucun contact connu pour cette ESN ». Aucune collecte nouvelle.
  Je ne fais PAS : une carte géographique ; collecter des contacts d'ESN ; nommer un fournisseur ; l'équipe de compte (#4996, rattachée à #4731).

## Droits

Aucun nouveau : les contacts d'ESN restent ceux de l'espace (filtre `workspace_id`), jamais ceux d'un autre espace (garde GA-43 : rien ne s'agrège entre espaces).
Je défais : rien ; garde #5008 (siège + implantations), #4794.
Je mesure : sans objet.
Périmètre : apps/web/src/_, packages/i18n/_, packages/contracts/src/schemas/_, apps/api/src/modules/contacts/_, apps/api/src/modules/accounts/_, apps/api/src/modules/demo/_, docs/briefs/*

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-i` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-i`. Tu ne pousses QUE sur `claude/lot-4962-i`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-i`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-i-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #4982 Contacts — trier et cartographier par zone géographique

écran : /contacts et /accounts/$id (contacts) · points : 3 · taille : M
| 4982.1 | trier les contacts par zone | retenu | contactGeoTier A/modules/contacts/contact-seller-focus.ts:60 ne sert qu'au classement « recommandés » (contacts.service.ts:2381) ; ContactsPageContent.tsx n'a que locationFilter (:46,:105), pas de tri par zone | tri « zone » (proche d'abord) sur la liste | liste contacts → trier par zone | non | non | — |
| 4982.2 | vue par zone (ville/région) | à trancher | aucune vue groupée trouvée | regroupement par ville/région | idem, vue groupée | non | non | Q: « cartographier » = carte ou regroupement (À préciser) ? Reco: regroupement par ville/région, pas de carte |
| 4982.3 | Laura donne la même vue | à trancher | recoupe #4794 (OPEN) | Laura : « mes contacts à Lille » | /chat | non | non | Q: porté par #4794 ? Reco: oui, ne pas dupliquer |
antériorité : #2544 (CLOSED 19/09, filtre géo Découvrir) ; #3762 hors périmètre ; #4794 open ; #5008 (zone = implantation, pour comptes ; ici lieu du contact).

## #4987 Grand compte — contacts des ESN de rang 2

écran : /accounts/$id (onglet partenaires) · points : 3 · taille : L
| 4987.1 | contacts des ESN rang 2 | à trancher | TabPartners.tsx:669 liste le rang ; seul `relation.contactName` (:1255) ; AccountPartner ne porte aucun contact ; appelant AccountDetailTabContent.tsx:355 | contacts connus par ESN | fiche grand compte → partenaires → contacts | non | oui probable | Q: source des contacts rang 2 ? Reco: seulement les contacts déjà en base pour l'ESN (compte existant dans l'espace), sinon « aucun contact connu » |
| 4987.2 | préparer un message vers l'ESN | à trancher | pas de geste ; dépend 4987.1 | bouton « Préparer un message » sur un contact connu | idem | non | non | Q: couvert par .1 ? Reco: oui |
| 4987.3 | aucun contact inventé | retenu | doctrine « jamais de donnée fictive » ; état vide à écrire | phrase « aucun contact connu » | ESN sans contact | non | non | — |
antériorité : #2646.1 (décision Louis 20/09, accès nommé direct/rang2 : TabAccess.tsx:151) ; #4311, #4923 ; #1624.6 (rang observé ≠ « rang 2 disponible », TabPartners.tsx:669).

## #4989 Comptes — filtre géographique sur le portefeuille

écran : /accounts · points : 2 · taille : M (L si implantations)
| 4989.1 | filtre de zone sur la liste | retenu | AccountsFiltersDialog.tsx:70-110 (allFields sans zone) ; portfolioFilters.ts sans zone ; appelant AccountsPage.tsx ; données `headquarters` account.ts:285 | filtre ville/département | /accounts → Filtrer → zone | non | non (siège) | — |
| 4989.2 | zone = implantation, pas siège seul | retenu | dépend #5008 (OPEN, siège + implantations) ; implantations non exposées sur la ligne compte | filtre sur implantations | compte multi-sites filtré sur Lille | non | oui (#5008) | — (arbitrage Q7 rendu) |
antériorité : #2544 (CLOSED 19/09), #5008 open, #3983 CLOSED (localisation des établissements).
