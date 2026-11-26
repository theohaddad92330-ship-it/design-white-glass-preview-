# Lot A — correctifs sûrs (retours bêta clients, contrat validé par Louis le 31/10/2026)

Compris : douze gestes empêchés, petits, chacun sur un écran : un bouton hors d'atteinte au zoom, un libellé incompris, un texte trop petit, une liste qui ne se met pas à jour.
Je fais :

- #4968 le bouton « Renseigner mon contexte » de l'onboarding reste atteignable au zoom 150-200 % (défilement du panneau). Cause non reproduite par le diagnostic : mesurer d'abord (hauteur du conteneur, overflow) et le dire.
- #4970 une phrase sous ce bouton qui dit ce que « renseigner mon contexte » apporte.
- #4978 dans le pitch d'appel, questions et objections à la même taille que l'ouverture (`CallApproachBody.tsx`, `text-sm` → aligné sur l'ouverture).
- #4983 un profil dont la zone est « France » classe les contacts hors France en dernier (`contact-seller-focus.ts`, `NON_ZONE_WORDS`). ORDRE seulement, aucun contact retiré.
- #4984 le niveau hiérarchique ciblé suit la taille du compte : 3 paliers (< 1 000 / 1 000-10 000 / > 10 000 salariés), ORDRE seulement ; effectif inconnu = ordre actuel inchangé ; phrase « classé pour une entreprise de N personnes » (rien si effectif inconnu).
- #4985 une explication de « Bloqueur » sur chaque badge (info-bulle accessible au clavier), texte : « personne susceptible de freiner ou refuser l'achat — souvent pas le profil le plus recherché ».
- #4992 sous chaque contact recommandé, une ligne rôle/zone/raison du rang ; vide si inconnu (rien d'inventé).
- #4979 « Planifier cet appel » distingué de « J'ai passé cet appel — consigner » ; toast et bouton figé avec lien « Voir dans Appels à passer ».
- #5001 Découvrir onglet Contacts : « 23 contacts de ton espace, liés aux 11 entreprises de cette recherche » (pluriels gérés).
- #5023 « fait » sur /actions invalide aussi la clé de la fiche compte (`useCompleteRelance.ts` : ajouter `actionOsKeys.actions` comme `usePlanItems.ts`).
- #5025 libellé fr/en « Affaires à qualifier » aligné, sous-titre de colonne qui dit ce qu'elle contient, tri : la plus ancienne non regardée d'abord.
  Je ne fais PAS : refondre ces écrans ; changer un score ; retirer un contact d'une liste ; toucher la navigation.

## Droits

Aucun : aucun menu, route, permission ni rôle touché. Si un point en exige, STOP et question.
Je défais : rien. Garder #4923.14 (structure des têtes), #3788.
Je mesure : sans objet (affichage et ordre).
Périmètre : apps/web/src/_, packages/i18n/_, apps/api/src/modules/contacts/_, apps/api/src/modules/demo/_, docs/briefs/*

## Règles communes (lot d'écrivain cloud — lire en entier, une fois)

- Dépôt `Bellum-AI/belllum-monorepo`. Tu travailles sur la branche `claude/lot-4962-a` (déjà créée, elle porte ce brief). `git fetch origin && git checkout claude/lot-4962-a`. Tu ne pousses QUE sur `claude/lot-4962-a`. Jamais main, jamais de PR (le fil principal intègre), jamais de force-push.
- **Plafond : 300 tours.** À 240 : commit + push de ce qui est vert, rapport, STOP.
- Lis d'abord `CLAUDE.md` du dépôt (doctrine, craft rules, design rules) et `agent_docs/chantiers-livres.md` pour ton sujet. Chaque point a un diagnostic ci-dessous (cause fichier:ligne lue sur main le 31/10) : **revérifie-le avant de coder** (le code a pu bouger), et si un point est déjà là sur main, note-le `déjà là <fichier:ligne de l'appelant>` dans le rapport au lieu de le recoder.
- **TDD** : test qui échoue d'abord, puis le code. Le test doit savoir dire NON.
- **Tests CIBLÉS seulement** : ≤ 5 fichiers de spec liés + `pnpm --filter <paquet> exec tsc -p . --noEmit` du paquet touché (ou `pytest <fichier>` pour apps/ia). JAMAIS la suite complète, jamais `check-types` racine, jamais de build : c'est la CI.
- **Compagnons d'un changement visible** : toutes les langues i18n (fr + en au minimum, les mêmes clés partout), le semis de démo si l'écran affiche une donnée neuve (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`), l'APPELANT (le composant monté dans une route), gardes d'architecture `apps/web/src/architecture/` (aucune couleur hex dans le JSX, plancher 12 px, cibles ≥ 44 px, « non mesuré » ≠ 0).
- **Trace** : commentaire `// #<issue>.<point> — <raison>` à l'endroit du comportement.
- **Commits** groupés par écran, numéros dans le sujet : `fix(web): … (#4968, #4970)`. **Push après chaque point vert** (`git push origin claude/lot-4962-a`), jamais tout à la fin.
- Hooks git : si un hook pre-commit/pre-push lance une suite longue, `GARDE_PORTE_PUSH=0 git push …` est permis ; ne jamais `--no-verify` un test qui échoue réellement.
- Interdits : `git stash`, `reset --hard`, `checkout -- .`, `skip`/`.only` de test, migration qui supprime/renomme (ajout seulement), donnée fictive en dehors du semis de démo, nommer un fournisseur à l'écran, afficher une probabilité.
- Hors périmètre (ligne `Périmètre :`) = ne pas toucher ; si c'est indispensable, l'écrire en QUESTION dans le rapport.
- **Rapport** : écris `docs/briefs/claude-lot-4962-a-rapport.md` (≤ 15 lignes : par point `livré <sha> <fichier:ligne>` / `déjà là <preuve>` / `bloqué <raison>` ; tests lancés et leur résultat ; questions), commit + push. Puis STOP.

## Diagnostic par issue (vérificateur, lu sur main le 31/10 — à revérifier)

## #4968 Onboarding, pas de défilement au zoom

écran : /onboarding (panneau lauraPanel « Renseigner mon contexte ») · points : 1 · taille : S
| 4968.1 | atteindre le bouton à tout zoom | retenu | le bouton = `welcome.v23.lauraPanel.next` (onboarding.json:173), rendu par OnboardingAccueilTemps.tsx:247 dans OnboardingWelcomePage (route routes/onboarding/index.tsx:125) via FramingPage, qui a DÉJÀ `overflow-y-auto` (FramingLayout.tsx:26) ; cause non reproduite ; OnboardingWizard.tsx:149 n'est pas cet écran | bouton atteignable | 125/150/200 % | non | non | — |
antériorité : #2639 ouverte (volet .1 corrigé OnboardingWelcomePage.tsx:293), #4748.

## #4970 Clarifier « Renseigner mon contexte »

écran : /onboarding · points : 1 · taille : S
| 4970.1 | dire ce que « contexte » recouvre + durée | retenu | onboarding.json:173 ; durée déjà dite ailleurs (onboarding.json:16, :35) mais pas sous ce bouton ; OnboardingAccueilTemps.tsx:247 | phrase sous le bouton | bouton avec phrase | non | non | — |
antériorité : #4366 (hors périmètre).

## #4978 Texte du pitch trop petit

écran : /contacts/$id/approach/call · points : 1 · taille : S
| 4978.1 | script lisible pendant l'appel | retenu | ouverture déjà `text-lg` (CallApproachBody.tsx:309) ; questions et objections en `text-sm` (:330, :345) = candidates ; EngagementMessage.tsx:223 n'est pas un texte de script | questions/objections en taille alignée | 13 pouces 100 % | non | non | Q: quel écran ? Reco: aligner questions/objections sur l'ouverture, pas d'autre question |
antériorité : #4523 indépendante.

# Diagnostic lot 4962 — issues #4979 à #4995 (origin/main, lecture seule, 31/10/2026)

Préfixe fichiers : apps/web/src = W, apps/api/src = A, apps/ia/app = IA.

## #4979 Appels — clarifier « appels passés / à passer / Consigner »

écran : /accounts/$id (composer contact) + /contacts/$id/approach · points : 3 · taille : S

| point                                                                                                                                                      | demande                                  | état   | preuve/cause                                                                                                                                                                                                                                                                         | livre                                                             | recette                                                        | droits | donnée | question |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ------ | -------- |
| 4979.1                                                                                                                                                     | deux gestes, libellés distincts          | retenu | W/i18n/locales/fr/engagement.json:477 « Ajouter aux appels à passer », :352 « Consigner le résultat » (appelants EngagementMessage.tsx:223, CallApproachBody.tsx:376). Aucune chaîne « appels passés » dans les locales fr : la confusion vient de la lecture, pas d'un libellé faux | « Planifier cet appel » vs « J'ai passé cet appel — consigner »   | composer d'un contact : les 2 boutons ne se lisent plus pareil | non    | non    | —        |
| 4979.2                                                                                                                                                     | dire où l'appel est retrouvable (lien)   | retenu | EngagementCreateCallTask.tsx onSuccess : toast sans lien (callTask.created engagement.json:479) ; l'appel vit dans « Appels à passer » /actions/sequences (outreach.json:362/828) et ContactCallTaskCard.tsx:14 (#3697.7)                                                            | toast + bouton figé portent un lien « Voir dans Appels à passer » | clic « Ajouter » → lien → /actions/sequences ouvre la ligne    | non    | non    | —        |
| 4979.3                                                                                                                                                     | rejeu nouvel utilisateur ne confond plus | retenu | geste de recette, pas de code                                                                                                                                                                                                                                                        | —                                                                 | rejeu avec un nouvel utilisateur                               | non    | non    | —        |
| antériorité : #4525 (open, appel en onglet, mêmes écrans) ; #3697.7 (retrouvabilité, commentaire code) ; gh closed search lancée : rien de contradictoire. |

## #4983 Contacts recommandés — pas d'étrangers hors du profil

écran : /accounts/$id (contacts recommandés) · points : 2 · taille : S
| 4983.1 | top 10 sans étrangers (profil France) | retenu | CAUSE : sellerFocusFrom contact-seller-focus.ts:35-46 renvoie null quand geoZone = « France » (NON_ZONE_WORDS :30 contient 'france' ⇒ zoneTokens vide) et profil non industriel ⇒ sellerFocusTiers (:121) null ⇒ aucune rétrogradation des étrangers. Appelant contacts.service.ts:1367/2381. Le test étranger (:63-72) existe mais n'est jamais atteint | un profil « France » classe les contacts hors France en dernier | compte avec contacts DE/BE : les 10 premiers recommandés sont en France | non | non (dépend de geoZone du profil, À préciser) | — |
| 4983.2 | étrangers atteignables en « Tous » | déjà là | ContactsRecommendedToggle.tsx:32 monté ContactContent.tsx:1363 ; le tri ne retire personne (docblock contact-seller-focus.ts:8) | — | bascule « Tous » | non | non | — |
antériorité : #2621 (CLOSED 21/09, /discover seulement) ; #2628 ; doctrine « le rôle change l'ordre, jamais le contenu » respectée.

## #4984 Contacts — niveau hiérarchique adapté à la taille

écran : /accounts/$id (contacts recommandés) · points : 2 · taille : M
| 4984.1 | niveau ciblé suit la taille du compte | à trancher | contactFunctionTier contact-seller-focus.ts:107-115 : ne connaît que le pack industriel, aucun effectif dans SellerFocus (:17) ; effectif compte existe (account.employees, TabOverview.tsx:479) | l'ordre des contacts monte jusqu'au DSI sur 500 salariés, jusqu'au COMEX sur 20 000 | 2 comptes de taille différente : le premier contact recommandé change | non | non | Q: seuils de taille ? Reco: 3 paliers (<1 000 / 1 000–10 000 / >10 000), ordre seulement, effectif inconnu = ordre actuel (« non mesuré » ≠ 0) |
| 4984.2 | seuil affiché dans l'explication | retenu | zone_status déjà nommé (PriorityPathSection.tsx:494-500), modèle à suivre | phrase « classé pour une entreprise de 500 personnes » | carte contact | non | non | — |
antériorité : #3754 (CLOSED 07/10 niveau décideur), #2628 (CLOSED 21/09 rôle proche de l'offre, pas le plus senior — cohérent) ; doctrine ordre/pas contenu.

## #4985 Contact — expliquer « Bloqueur »

écran : /accounts/$id (comité, organigramme) · points : 2 · taille : S
| 4985.1 | explication partout où le libellé apparaît | retenu | libellés accountOrg.json:827/972/1059/1121, accountDetail.json:1163 sans explication ; description existe contacts.json:99-106 (« Peut freiner le projet… risque et conformité »), lue par getRoleDescription (contactRoles.ts:179) en survol seulement : FocalOrgView.tsx:940-941, ContactCommercialUtility.tsx:81. committeeScreenData.ts:36 : pas de description | info-bulle/phrase sur chaque badge | survol/appui du badge Bloqueur dans comité | non | non | Q: texte (Louis : « souvent pas les profils les plus recherchés » ≠ description actuelle) ? Reco: aligner sur la définition de l'issue |
| 4985.2 | dire que le contact reste dans la structure | déjà là | accountOrg.json:1065 « gardé dans la structure », appelants FocalOrgView.tsx:827, OrgPersonNode.tsx:175 ; :1046 FocalOrgView.tsx:480 | — | organigramme | non | non | — |
antériorité : #4679 (organigramme CISO) ; aucune contradiction.

## #4992 Compte — de quoi dépend la pertinence des contacts

écran : /accounts/$id (contacts) · points : 1 · taille : M
| 4992.1 | ligne « pourquoi ce contact » sur chaque recommandé | retenu | DÉJÀ LÀ pour le chemin prioritaire : PriorityPathSection.tsx:494-500 (zone_status), :517-521 (why_contact). ABSENT de CompactContactRow.tsx:65-140 (liste) | ligne rôle/zone/raison sur la liste, vide si inconnue (rien d'inventé) | liste contacts du compte | non | non (why_contact stocké) | — |
antériorité : #3912 (CLOSED, « Confiance »/« 35/85 »), #4923 open ; #4432.4 (zone nommée).

## #5001 Découvrir — « 23 contacts » pour 11 comptes

écran : /discover (onglet Contacts) · points : 2 · taille : S

| point                                                        | demande                             | état    | preuve/cause                                                                                                                                                                                                   | livre                                            | recette                                    | droits | donnée | question                                                                                           |
| ------------------------------------------------------------ | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------ | ------ | -------------------------------------------------------------------------------------------------- |
| 5001.1                                                       | Libellé dit ce que compte le total  | retenu  | ContactsResults affiche `resultType.count` = « N résultats » générique : ProjectionResults.tsx:359 (clé discover.json:386-387) ; hint contacts discover.json:371 dit « personnes que ton espace connaît déjà » | « 23 contacts liés aux 11 entreprises trouvées » | /discover onglet Contacts : texte du total | non    | non    | Q: libellé exact ? Reco: « 23 contacts de ton espace, liés aux 11 entreprises de cette recherche » |
| 5001.2                                                       | Dispo e-mail/tél visible avant clic | déjà là | DV/ContactResultRow.tsx:92-106 (`channels.email`/`phone`, « disponibilité jamais valeur »), appelant ProjectionResults.tsx:312 (ContactsResults), importé Discover.tsx:256                                     | —                                                | —                                          | non    | non    | —                                                                                                  |
| antériorité : #4522 (fermée 26/10), #4770 (ouverte, 69 773). |

## #5023 (diagnostic condensé)

- #5023 (S, retenu) : useCompleteRelance.ts:62-63 n'invalide que ['plan-items'] et ['dashboard'] ; fiche compte lit ['action-os','actions','account',id] (api.ts:234 ← ActionPlanBoard.tsx:151). Ajouter invalidation actionOsKeys.actions (comme usePlanItems.ts:84). Appelants : MyRelancesList.tsx:85 ← ActionCenter.tsx:730 ; useTodayGestures.ts:75.

## #5025 (diagnostic condensé)

- #5025 (S) : fr « Affaires à qualifier » vs en « Deals to qualify » (projects.json:702). Sous-titre colonne retenu. Tri à trancher (aucun tri). Reco : plus ancien non regardé d'abord.
