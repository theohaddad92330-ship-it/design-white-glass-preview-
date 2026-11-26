# PR 12C — classement d'antériorité (porte-lot, 24/10)

Base origin/main..c34771a0f9 :

## Antériorité

(base : origin/main...HEAD c34771a0f9 ; lignes du brief = pr12c-brief-union.md)

- garde #782 — avatar, nom, layout row conservés (CandidateRow.tsx:186-195)
- revient sur #795 — trois groupes remplacés par six rubriques, brief l.94 (#4494.1)
- garde #858 — tutoiement conservé (« Tape un mot-clé… », discover.json rail.needCriterion)
- garde #1180 — filtres atteignent la recherche ; garde-fou étendu à toutes rubriques (discover-filters-reach-the-search.test.tsx:675-690)
- garde #1488 — secteurs précis multi-sélection, Discover.test.tsx:176-190
- garde #1766 — même garde-fou architecture, rubriques parcourues une à une (:675-690)
- revient sur #1796 — rail repliable remplacé par barre toujours visible, brief l.88 (#4493.2)
- revient sur #1812 — même commit 5fa096d57 que #1796 (rattachement par ligne, titre sans rapport), brief l.88
- RÉGRESSION #1912 — voir section (compteurs « inconnu » partenaires : tests perdus)
- garde #2107 — grille 3 colonnes gardée dès sm (WatchlistSignalDetail.tsx:240), empile en mobile
- revient sur #2151 — sous-titre #2165.3 remplacé par celui de la maquette, brief l.87 (#4493.1)
- garde #2166 — logo jamais deviné, CompanyAvatar (CandidateRow.tsx:195)
- garde #2291 — critère recours freelance en rubrique Expertises (FilterRail.tsx:563 ; Discover.contractRecourse.test.tsx:149-153)
- garde #2466 — grille auto-fit gardée, familles auto-fit (SectorPicker.tsx layout families)
- revient sur #2467 — rail replié par défaut remplacé par barre toujours visible, brief l.88
- garde #2486 — territoire retiré de la lecture ; test affiné /^territoire$/ (Discover.commandes.test.tsx:132)
- garde #2489 — Suivre/Écarter côte à côte, déplacés dans l'aperçu (CandidateRow.details.test.tsx:374-390)
- garde #2493 — « Ta cible / Laisse Bellum trouver » assertion gardée (Discover.test.tsx:~162)
- garde #2503 — aucun jeu d'exemples ; clé freetext absente (architecture ...exemples-quune-fois.test.ts:106)
- revient sur #2505 — pied « Appliquer » devient « Appliquer et explorer », brief l.96 (#4494.3)
- garde #2506 — secteurs cherchables, pastilles/familles, plafond (SectorPicker.tsx)
- garde #2517 — filtres partenaires conditionnels conservés (FilterRail.tsx:686-766)
- garde #2546 — « aucun signal » mesuré à zéro (CandidateRow.tsx:283)
- garde #2616 — modalités CDI sous le signal Recrutement (FilterRail.tsx:605-612 ; test :331-343)
- garde #2617 — rayon autour de la ville conservé (FilterRail.tsx:467-479)
- garde #2621 — filtre pays/monde inchangé (ProjectionResults.tsx:269,454)
- garde #2642 — régions multiples + « Toute la France » (FilterRail.tsx:511-530 ; test :402)
- garde #2652 — colonnes auto-fit/minmax conservées (FieldGrid/SectorPicker)
- garde #2680 — départements et secteurs exclus distincts (FilterRail.tsx:377-385,480)
- garde #3011 — idem #2107 (grille responsive)
- garde #3082 — plancher identité = minmax(15rem,1fr) assertion (CandidateRow.layout.test.tsx:~66)
- garde #3092 — préréglage Startup posé/retiré (FilterRail.test.tsx:415)
- garde #3096 — politique télétravail filtrable (FilterRail.tsx:612-624)
- garde #3097 — séniorité filtrable (FilterRail.tsx:625-637)
- garde #3203 — delivery fit filtrable (FilterRail.tsx:638-651)
- garde #3226 — delivery fit externe sous Recrutement (FilterRail.tsx:638)
- garde #3237 — idem #3203
- garde #3528 — plafond 5 secteurs, désactivé à 5/5 (SectorPicker.tsx families, disabled={atCap…})
- garde #3705 — lien de groupe conservé, déplacé dans l'aperçu (CandidateRow.tsx:489)
- garde #3815 — groupe/secteur désactivé à 5/5 avec raison (SectorPicker.tsx families)
- garde #3819 — bloc d'actions rétrécit (min-w-0 flex-wrap, CandidateRow.tsx:300)
- garde #3873 — vidage des secteurs lève la cible (Discover.tsx:588,912)
- garde #3877 — nombre d'établissements gardé, dans l'aperçu (CandidateRow.tsx:483)
- garde #3878 — « Trop de filtres empilés » toujours testé (Discover.emptyFiltersStacked.test.tsx:156)
- garde #3879 — secteur coché lisible sur la puce (Discover.filterRailCollapse.test.tsx:~50)
- garde #3901 — homonymes nommés (CandidateRow.tsx homonym)
- garde #3907 — « secteur · ville » sur la carte (CandidateRow.tsx:230-235)
- garde #3908 — plusieurs tailles cumulées (FilterRail.test.tsx:389)
- garde #3983 — base géographique siège/implantation, dans l'aperçu (CandidateRow.tsx:393)
- garde #4045 — mots-clés n'agissent pas « inertes » ; test gardé (architecture ...reach-the-search.test.tsx:742)
- garde #4047 — bouton actualiser/organigramme inchangé ; ajout badge CRM seulement
- garde #4049 — cartes cliquables gardées (HierarchyOrgView.tsx:359 ajout crmMatch)
- garde #4061 — ouvrir la fiche au clic inchangé (OrgHierarchyTree.tsx, ajout crmMatch)
- garde #4067 — deux recrutements max ; test déplacé vers l'aperçu (CandidateRow.collapse.test.tsx:197-205)
- garde #4286 — mention « sans signal » conservée (CandidateRow.tsx:283)
- RÉGRESSION #4299 — voir section (4 tests de lisibilité perdus)
- garde #4302 — aide de vue et secteurs exclus distincts (FilterRail.tsx:377-385)
- garde #4303 — zone non reconnue ne lance pas (FilterRail.tsx hasUnrecognizedZone)
- garde #4307 — historique complet gratuit, lu dans l'aperçu (CandidateRow.history.test.tsx:62-70)
- garde #4312 — dernière recherche mémorisée (Discover.lastSearch.test.tsx:93-127)
- revient sur #4315 — voir section RÉGRESSIONS (libellés gardés, test des phrases perdu)
- garde #4316 — un seul champ Compétences (FilterRail.tsx:536-545)
- garde #4317 — Réinitialiser vide le brouillon (Discover.profileReset.test.tsx:115-118)
- garde #4358 — origine du classement secteur, dans l'aperçu (CandidateRow.tsx:470)
- garde #4361 — Middle market + exclure cotées (FilterRail.test.tsx:247,427)
- garde #4363 — étapes d'avancement intactes (DiscoverLoading.test.tsx, useDiscoverSearch.test.tsx:152)
- revient sur #4413 — haut de modale zone/secteur/taille remplacé par rubriques, brief l.94 (#4494.1)
- garde #4429 — palier d'élargissement dit (CandidateRow.tsx:288)
- garde #4430 — provenance offres récentes (CandidateRow.tsx:293)
- garde #4433 — chip d'élargissement (CandidateRow.tsx:292)
- garde #4436 — taille non publiée jamais « 0 » (CandidateRow.tsx:263)
- garde #4437 — provenance/élargissement (CandidateRow.tsx:292-293)

## RÉGRESSIONS

Aucune fonctionnalité retirée sans contrat ; trois pertes de GARDE-FOU (test supprimé sans équivalent, comportement encore présent dans le code) :

1. #4299 — FilterRail.test.tsx (avant :868-922) : 4 tests supprimés (libellés --text-secondary, gras des libellés, aucune aide muted/ghost dans la modale, valeur saisie en gras). Code vivant : filter-controls.tsx:52-53,111. À rétablir sur la modale « Cadrer la recherche ».
2. #4315 (.3) — FilterRail.test.tsx (avant :816-832) : test « chaque signal porte sa phrase, description accessible + focus affiche signal-hint » supprimé. Code vivant : SignalChips.tsx, filter-controls.tsx:179. Aucun test ne le couvre (pas de SignalChips.test).
3. #1912 (rattaché par ligne à #2151.32/c65) — FilterRail.test.tsx (avant :391-424) : 2 tests du compteur « inconnu » (clients observés, ne s'affiche que filtre coché ET compte > 0) supprimés ; code vivant FilterRail.tsx:723-734, mais le test partenaires (:345-366) ne vérifie que les libellés.
   Aussi non reprises (mineur) : #3092 « le champ se nomme Registre » et « texte du préréglage » ; #4301.3 résumé retient/écarte (reste testé dans discover-filters-summary.test.ts).

Base c34771a0f9..HEAD (6 lots du matin) :

## Antériorité (lots 24/10 matin)

(base : c34771a0f9..HEAD de wt-pr12c ; lots tutoiement, anteriorite, api, bugs, arbitrages, am58 ; briefs = origin/claude/pr12c-briefs)

- garde #82 — filtre statut côté serveur conservé, devenu IN multi (accounts.service.ts:1317-1318, brief api pt 3 #4498.a)
- garde #263 — compte « supprimé » toujours exclu hors filtre explicite (accounts.service.ts:1235-1238)
- garde #353 — import CSV : lot écrit en entier, la ligne en conflit écartée (contacts.service.ts:7561, helper existant insertToleratingDuplicates:7281)
- garde #372 — branche « MCP non configuré / Bientôt » conservée (AiAssistantView.tsx:344-357), clés d'API ajoutées dessous
- garde #599 — « viewingFailures » : échecs masqués sauf filtre error/canceled (accounts.service.ts:1489)
- garde #835 — gating par offre `!mcp.allowed` conservé (AiAssistantView.tsx:310-318)
- garde #899 — « chaque personne du graphe est un contact seedé » conservé, exemption NOMMÉE étroite (demo-org-graphs.spec.ts:104-109, brief arbitrages pt 3)
- revient sur #906 — titre « Clés d'API » (families.apiKeys) quitte /integrations, ApiKeysCard déplacée Outils › MCP (arbitrages pt 5 ; écran unique conservé)
- garde #1315 — recherche q sur nom ET secteur conservée, signaux ajoutés en OR (accounts.service.ts:1302, brief api pt 2)
- garde #1316 — même ligne que #1315 : secteur toujours cherché (accounts.service.ts:1302)
- revient sur #1325 — origine et doc d'alerte quittent la carte du pipe, rendues au détail (arbitrages pt 4a ; PipelineBoard.tsx retire ProjectOriginBadge/STALE_TONE)
- revient sur #1326 — alerte de stagnation + geste retirés de la carte, texte déplacé au détail (arbitrages pt 4a ; ProjectPropertiesContent.tsx)
- revient sur #1445 — bloc « Par quoi commencer » retiré de /integrations (arbitrages pt 5, décision Louis 24/10)
- revient sur #1448 — StarterSteps (design final Intégrations) retiré sous la grille (arbitrages pt 5)
- garde #1466 — secteur lisible/cherché : filtre sector ILIKE conservé (accounts.service.ts:1356 pour liste multi)
- garde #1475 — paliers de stagnation et geste inchangés, seul `export` des types retiré (stale-alert.ts:82,110) ; staleOf lu au détail
- revient sur #1536 — même commit que #1448 : StarterSteps retiré (arbitrages pt 5)
- garde #1575 — clic « parcours observés » (headline) toujours sérialisé dans l'URL (accounts/api.ts:111-130)
- revient sur #1946 — mesure « connecteur activé après recommandation » retirée avec « Par quoi commencer » (décision Louis 24/10, nettoyage en issue)
- garde #2018 — lien d'accueil vers les notifications conservé (dashboard/components/NotificationsSettingsLink.tsx:31), seule la carte d'Intégrations part
- revient sur #2085 — carte « notifications Laura » retirée de /integrations, accès par Réglages (arbitrages pt 5 ; IntegrationCenterPage.structure.test.tsx prouve /settings/notifications atteignable)
- garde #2117 — gestes du dossier : Aperçu PDF/Brief/Partager/Exporter visibles comme avant #4507 ; commentaire réécrit (AccountDetailHero.tsx:50-54,191-232)
- garde #2130 — tracking export_previewed (#2130.65) conservé, déplacé sur le bouton Aperçu visible (AccountDetailHero.tsx:195-203)
- garde #2159 — filtre étiquette par clé insensible à la casse conservé, en liste (accounts.service.ts:1370-1380)
- revient sur #2170 — badge de niveau de preuve quitte la carte, passe au détail (arbitrages pt 4a, décision Louis 24/10 ; PipelineBoard.test.tsx:239 inversé, ProjectPropertiesContent.tsx)
- revient sur #2172 — objectif retiré de la carte, rendu au détail (arbitrages pt 4a ; ProjectPropertiesContent.tsx)
- garde #2357 — cloisonnement BU conservé : businessUnitScopeOf toujours passé (contacts.controller.ts:215-221)
- revient sur #2382 — « (le vôtre) » devient « (le tien) » dans le centre d'approbation (tutoiement pt 2, OutreachApprovalCenter.test.tsx:135)
- garde #2553 — import d'organigramme : lot créé en entier, doublon de nom écarté (contacts.service.ts:7654)
- garde #2627 — tri par décision issu du contrat conservé (accountsSearch.ts:~58 sort: accountSortKeySchema)
- garde #2777 — critère pur de doublon conservé, clé base ajoutée en plus (meeting-notes.service.ts:1055-1062)
- garde #2927 — assistant d'import : résolution d'une fiche connue conservée, nom normalisé ajouté (universal-import.service.ts:518-523)
- garde #2949 — Laura par carte vit dans le panneau (ProjectsPage.tsx:678, pipeCardLauraQuestion) ; la ligne 568 n'était que la fermeture du bloc objectif
- revient sur #2958 — marqueur `<StarterSteps` retiré du registre de migration (route-migration-empty-states.ts:357-364, arbitrages pt 5), 2 marqueurs restent
- garde #3405 — le motif de la dernière perte arrive au message, via l'API réelle not_is/order(ascending) (message.py:176-178, supabase_client.py:88, brief bugs pt 1 #4478)
- garde #3407 — niveau d'effort + repli du secteur entier conservés (AccountRowFacts.tsx:~118-121 foldedSector)
- garde #3490 — rattachés/archivés exclus mais comptés, lecture paginée (duplicates.sweeper.ts:291-312, brief bugs pt 4 #4471)
- garde #3551 — même ligne de faits AccountRowFacts : texte visible identique sans ville (AccountRowFacts.tsx:115-118)
- garde #3700 — imports de SequencesPage étendus, gestion dans Actions inchangée (SequencesPage.tsx:54)
- garde #3740 — import d'organigramme en contacts : même ligne que #2553 (contacts.service.ts:7654)
- garde #3758 — tri par date décroissante conservé, API réelle ascending=False (chat_tools.py:11191)
- garde #4016 — tableau DPA sous-traitants conservé, Railway « à confirmer » → europe-west4 (dpa-a-signer.md:29-33, brief bugs pt 10 #4472)
- garde #4053 — compte archivé jamais listé sauf filtre « Archivés » (accounts.service.ts:1238-1242)
- garde #4072 — récupération des documents d'organigramme triée par date décroissante, API réelle (rag_service.py:1428)
- garde #4166 — import de campaign-prefill étendu, tests playbook inchangés (campaign-prefill.test.ts:2-9)
- revient sur #4187 — carte d'entrée Notifications (alignée à gauche) supprimée avec son test (arbitrages pt 5)
- revient sur #4191 — badge d'origine de la carte (E6 : lisible, passe à la ligne) retiré de la carte, origine au détail (arbitrages pt 4a ; ProjectProvenanceLine)
- revient sur #4291 — niveau de preuve d'une carte en cours n'est plus affiché (signed.test:87-96 inversé), badge « Signé » gardé (arbitrages, rapport : revient sur #4291.8)
- garde #4331 — bouton Contacter : min-h-11 conservé, shrink-0/gap-2 ajoutés (ContactChannelMenu.tsx:91-96, brief bugs pt 8 #4474)
- revient sur #4336 — origine en pied de carte retirée (import describeOrigin sorti de PipelineBoard.tsx:29) ; table et fiche la gardent (arbitrages pt 4a)
- garde #4404 — ordre email, téléphone, LinkedIn conservé ; test seulement dotté de doublures (ContactKeyInfo.coordinates-order.test.tsx:3-15)
