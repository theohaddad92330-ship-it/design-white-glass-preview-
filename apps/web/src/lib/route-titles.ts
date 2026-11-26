/**
 * One place that maps a route to its document title / meta description.
 *
 * Titles used to be set per route in `beforeLoad`, which left gaps (several
 * routes set none, so the tab kept the PREVIOUS screen's title — visible in the
 * tab bar, history and bookmarks) and never refreshed on a language switch,
 * since `beforeLoad` only runs on navigation.
 *
 * Adding a route without an entry here fails `route-titles.test.ts`, so a new
 * screen cannot silently inherit the previous one's title again.
 */

type RouteMeta = {
  /** i18n key for `document.title`. */
  titleKey: string
  /** i18n key for `<meta name="description">`, when the route has one. */
  descriptionKey?: string
}

export const ROUTE_META: Record<string, RouteMeta> = {
  '/': { titleKey: 'routes:home.title', descriptionKey: 'routes:home.description' },
  '/accounts/': { titleKey: 'routes:accounts.title', descriptionKey: 'routes:accounts.description' },
  '/accounts/$id': { titleKey: 'routes:accountDetail.title', descriptionKey: 'routes:accountDetail.description' },
  '/actions/': { titleKey: 'routes:actions.title', descriptionKey: 'routes:actions.description' },
  '/actions/$id': { titleKey: 'routes:actionDetail.title' },
  '/actions/sequences': { titleKey: 'routes:sequences.title', descriptionKey: 'routes:sequences.description' },
  // c128 (22/10/2026) — « Tes automatisations » est de nouveau un écran, troisième onglet d'Actions.
  '/actions/automatisations': {
    titleKey: 'routes:automations.title',
    descriptionKey: 'routes:automations.description',
  },
  // Théo C sequences-detail.R1 — la page d'une séquence.
  '/actions/sequences_/$id': { titleKey: 'routes:sequences.title' },
  // Théo C automations-* — tiret bas des fichiers de route (`automatisations_/*.tsx`) : `automatisations.tsx` est l’onglet.
  '/actions/automatisations_/bibliotheque': {
    titleKey: 'routes:automationLibrary.title',
    descriptionKey: 'routes:automationLibrary.description',
  },
  '/actions/automatisations_/journal': {
    titleKey: 'routes:automationJournal.title',
    descriptionKey: 'routes:automationJournal.description',
  },
  '/actions/automatisations_/$id': {
    titleKey: 'routes:automationEditor.title',
    descriptionKey: 'routes:automationEditor.description',
  },
  '/auth/callback': { titleKey: 'routes:authCallback.title', descriptionKey: 'routes:authCallback.description' },
  '/auth/reset-password': {
    titleKey: 'routes:resetPassword.title',
    descriptionKey: 'routes:resetPassword.description',
  },
  '/bak/home': { titleKey: 'routes:backoffice.title', descriptionKey: 'routes:backoffice.description' },
  '/billing/': { titleKey: 'routes:billing.title', descriptionKey: 'routes:billing.description' },
  '/chat/': { titleKey: 'routes:chat.title', descriptionKey: 'routes:chat.description' },
  '/contacts/': { titleKey: 'routes:contacts.title', descriptionKey: 'routes:contacts.description' },
  '/contacts/$id': { titleKey: 'routes:contactDetail.title', descriptionKey: 'routes:contactDetail.description' },
  // Théo B c6 — la page d'approche d'un contact (e-mail ou message), par canal.
  '/contacts/$id_/approach/$channel': {
    titleKey: 'routes:contactApproach.title',
    descriptionKey: 'routes:contactApproach.description',
  },
  // #2155.13 — « Mes cibles », troisième page du groupe Prospection.
  '/mes-cibles/': { titleKey: 'routes:targets.title', descriptionKey: 'routes:targets.description' },
  // Théo A signaux — la bibliothèque d'informations par compte, et ses veilles.
  '/signals/': { titleKey: 'routes:signals.title', descriptionKey: 'routes:signals.description' },
  '/signals/watches': { titleKey: 'routes:signalWatches.title', descriptionKey: 'routes:signalWatches.description' },
  // Atterrissage du lien de démo partagé — page publique, traversée en quelques
  // secondes avant la redirection dans l'app.
  '/demo': { titleKey: 'routes:demo.title', descriptionKey: 'routes:demo.description' },
  // #2705.1 — le formulaire obligatoire avant la démo, sorti du gabarit de
  // `/demo` (`demo_`, pas d'`<Outlet />` parent) : entrée séparée, sinon
  // l'onglet hérite du titre de la page précédente.
  '/demo_/acces': { titleKey: 'routes:demoAcces.title', descriptionKey: 'routes:demoAcces.description' },
  '/discover/': { titleKey: 'routes:discover.title', descriptionKey: 'routes:discover.description' },
  // #2293 — analyser une liste d'entreprises en un geste (lot multi-comptes).
  // Les deux écrans (liste et détail d'un lot) affichent le même titre côté
  // page (`CustomerPage pageTitle={t('batches.title')}` dans les deux routes),
  // donc le même titre d'onglet ici — pas un titre inventé qui diverge de ce
  // que l'écran montre.
  '/discover/lots/': { titleKey: 'discover:batches.title' },
  // #4282.10 (lot RADAR, 19/10/2026) — le radar par technologie, sous Découvrir.
  '/discover/radar': { titleKey: 'technologyRadar:pageTitle', descriptionKey: 'technologyRadar:intro' },
  '/discover/lots/$batchId': { titleKey: 'discover:batches.title' },
  '/accounts/$id_/brief': {
    titleKey: 'routes:brief.title',
    descriptionKey: 'routes:brief.description',
  },
  // Louis 14/10/2026, refonte Pilotage : la veille « Marché » est un onglet de
  // Comptes (`/accounts/marches`). La fiche d'une zone garde son propre titre.
  '/accounts/marches': {
    titleKey: 'routes:marketWatch.title',
    descriptionKey: 'routes:marketWatch.description',
  },
  '/accounts/marches_/$zoneId': {
    titleKey: 'routes:marketZone.title',
    descriptionKey: 'routes:marketZone.description',
  },
  '/accounts/partners': {
    titleKey: 'routes:partners.title',
    descriptionKey: 'routes:partners.description',
  },
  '/pilotage/pipe': {
    titleKey: 'routes:pilotagePipe.title',
    descriptionKey: 'routes:pilotagePipe.description',
  },
  '/pilotage/finance': {
    titleKey: 'routes:pilotageFinance.title',
    descriptionKey: 'routes:pilotageFinance.description',
  },
  '/pilotage/staffing': {
    titleKey: 'routes:pilotageStaffing.title',
    descriptionKey: 'routes:pilotageStaffing.description',
  },
  /** Retours d'expérience — même raison que ci-dessus : la copie de l'écran vit
   *  dans `pilotage:rex.*`, titre compris. */
  '/pilotage/rex': {
    titleKey: 'pilotage:rex.title',
    descriptionKey: 'pilotage:rex.metaDescription',
  },
  '/forgot-password': {
    titleKey: 'routes:forgotPassword.title',
    descriptionKey: 'routes:forgotPassword.description',
  },
  '/depot-piece/$token': {
    titleKey: 'routes:contractUpload.title',
    descriptionKey: 'routes:contractUpload.description',
  },
  '/integrations/': { titleKey: 'routes:integrations.title', descriptionKey: 'routes:integrations.description' },
  '/invitation/$token': { titleKey: 'routes:invitation.title', descriptionKey: 'routes:invitation.description' },
  '/login': { titleKey: 'routes:login.title', descriptionKey: 'routes:login.description' },
  '/projects/': { titleKey: 'routes:projects.title' },
  // Le DOSSIER d'un projet (#2801). Un titre à elle, même raison que
  // `/missions/$id` juste en dessous : sans entrée, l'onglet hérite du titre
  // de la liste qui a mené jusqu'ici.
  '/projects/$id': {
    titleKey: 'routes:projectDossier.title',
    descriptionKey: 'routes:projectDossier.description',
  },
  // #4197 (L6) — les Pistes à qualifier, ex-lentille `?lens=portfolio`.
  // Théo C projects-presentations (r22-ecran-c6) — l'écran Présentations d'Affaires.
  '/projects/presentations': {
    titleKey: 'routes:presentations.title',
    descriptionKey: 'routes:presentations.description',
  },
  '/projects/needs': { titleKey: 'routes:openNeeds.title', descriptionKey: 'routes:openNeeds.description' },
  // La FICHE d'un besoin. Le tiret bas est celui du fichier de route
  // (`needs_.$needId.tsx`) : il coupe l'imbrication sous la liste sans changer
  // le chemin. Un titre à elle, parce qu'un écran qui hérite du précédent se
  // retrouve dans l'historique du navigateur sous le nom de sa liste.
  '/projects/needs_/$needId': { titleKey: 'routes:needSheet.title', descriptionKey: 'routes:needSheet.description' },
  '/missions/': { titleKey: 'routes:missions.title' },
  // Le DOSSIER d'une mission. Un titre à elle, parce qu'un écran qui hérite du
  // précédent se retrouve dans l'historique du navigateur sous le nom de sa
  // liste — et c'est justement cet écran-là qu'on met en favori.
  '/missions/$id': {
    titleKey: 'routes:missionDossier.title',
    descriptionKey: 'routes:missionDossier.description',
  },
  // « Créer une mission » (31/08/2026) porte ses libellés dans SON espace de
  // noms — `missions`, comme `/missions/adv` et `/missions/cessions` — plutôt
  // que dans `routes`, où le même texte vivrait une seconde fois.
  '/missions/nouvelle': {
    titleKey: 'missions:createMission.title',
    descriptionKey: 'missions:createMission.description',
  },
  '/missions/cra': { titleKey: 'routes:missionsCra.title' },
  '/missions/facturation': { titleKey: 'routes:missionsInvoicing.title' },
  '/missions/factures': { titleKey: 'missions:invoices.title' },
  '/missions/encaissements': { titleKey: 'routes:missionsCollections.title' },
  // Les cessions (31/08/2026) portent leurs libellés dans LEUR espace de noms,
  // comme `/propositions/` juste en dessous et pour la même raison : `routes`
  // est un fichier que plusieurs chantiers modifient en même temps.
  '/missions/cessions': { titleKey: 'factoring:route.title', descriptionKey: 'factoring:route.description' },
  '/missions/finance': { titleKey: 'missions:financeView.title', descriptionKey: 'missions:financeView.lede' },
  '/expenses/': { titleKey: 'expenses:route.title', descriptionKey: 'expenses:route.description' },
  // Théo C missions-notes-de-frais.N1 — la même page, onglet de Missions.
  '/missions/notes-de-frais': { titleKey: 'expenses:route.title', descriptionKey: 'expenses:route.description' },
  // Le barème est un RÉGLAGE, pas un dossier : son titre le dit, sinon l'écran
  // hériterait de celui de la file des notes et l'onglet du navigateur
  // mentirait sur l'endroit où l'on est.
  '/expenses/bareme': { titleKey: 'expenses:policy.route.title', descriptionKey: 'expenses:policy.route.description' },
  /**
   * Les paiements SORTANTS (31/08/2026).
   *
   * ⚠️ Le titre vient de `payments:title` et NON de `routes:`, à dessein : le
   * namespace `routes` est hors du périmètre de ce lot, et pointer une clé
   * qu'il ne porte pas afficherait la CLÉ BRUTE dans l'onglet du navigateur —
   * le défaut déjà payé sur le bouton « Nouveautés ». `payments` est enregistré
   * dans `NAMESPACES` et `resources`, donc la clé résout en FR et en EN, ce que
   * `route-titles.test.ts` vérifie.
   */
  '/missions/paiements': { titleKey: 'payments:title' },
  '/missions/adv': { titleKey: 'adv:title', descriptionKey: 'adv:subtitle' },
  '/missions/suivi': { titleKey: 'missionTracking:page.title', descriptionKey: 'missionTracking:page.subtitle' },
  '/missions/planification': { titleKey: 'routes:missionsPlanning.title' },
  '/onboarding/': { titleKey: 'routes:onboarding.title', descriptionKey: 'routes:onboarding.description' },
  // Les clés vivent dans l'espace de noms `proposals`, pas dans `routes` : un
  // écran neuf porte ses libellés avec lui, et l'espace `routes` est un fichier
  // que six chantiers modifient en même temps.
  '/propositions/': { titleKey: 'proposals:route.title', descriptionKey: 'proposals:route.description' },
  '/onboarding/company': { titleKey: 'routes:onboarding.title', descriptionKey: 'routes:onboarding.description' },
  // Le choix de palier partage l'identité de l'onboarding : c'en est la première
  // étape, pas un écran à part. Sans cette ligne, un test de complétude échoue —
  // et l'onglet du navigateur n'aurait pas de titre.
  '/onboarding/plan': { titleKey: 'routes:onboarding.title', descriptionKey: 'routes:onboarding.description' },
  '/onboarding/$id/$stage/': { titleKey: 'routes:onboarding.title', descriptionKey: 'routes:onboarding.description' },
  '/onboarding/$id/$stage/$slug': {
    titleKey: 'routes:onboarding.title',
    descriptionKey: 'routes:onboarding.description',
  },
  // L'écran de relecture est un écran À PART de l'onboarding : il ne pose aucune
  // question, il rend les réponses déjà données. Ses libellés vivent avec lui
  // dans l'espace de noms `onboarding` — l'espace `routes` est modifié par
  // plusieurs chantiers en même temps, et une clé absente afficherait la CLÉ
  // BRUTE dans l'onglet du navigateur.
  '/onboarding/$id/review': {
    titleKey: 'onboarding:review.title',
    descriptionKey: 'onboarding:review.description',
  },
  // #2089.28 « écran de génération dédié » : à part de l'onboarding comme la
  // relecture, mêmes raisons. `titleGeneric` (pas `title`) parce que ce
  // dernier porte `{{esnName}}` — `t()` est appelé ici SANS variables
  // d'interpolation, la clé generique reste donc statique dans les deux langues.
  '/onboarding/$id/generating': {
    titleKey: 'onboarding:generating.titleGeneric',
    descriptionKey: 'onboarding:generating.subtitle',
  },
  '/search/': { titleKey: 'search:meta.pageTitle', descriptionKey: 'search:meta.pageDescription' },
  // ⚠️ `'/reverse-market'` a disparu d'ici avec la réparation de GA-288 : c'était
  //    l'identifiant RELATIF de la page quand le routeur en faisait un enfant de
  //    `/consultants/$id`. Elle est maintenant rattachée à la racine et porte son
  //    identifiant complet, plus bas dans ce fichier.
  '/settings/': { titleKey: 'routes:settings.title', descriptionKey: 'routes:settings.description' },
  '/settings/activity': {
    titleKey: 'routes:settingsActivity.title',
    descriptionKey: 'routes:settingsActivity.description',
  },
  '/privacy/': { titleKey: 'routes:privacy.title', descriptionKey: 'routes:privacy.description' },
  '/settings/catalogues': { titleKey: 'routes:catalogues.title', descriptionKey: 'routes:catalogues.description' },
  '/settings/legal-entities': {
    titleKey: 'routes:settingsLegalEntities.title',
    descriptionKey: 'routes:settingsLegalEntities.description',
  },
  '/settings/lexicon': {
    titleKey: 'routes:settingsLexicon.title',
    descriptionKey: 'routes:settingsLexicon.description',
  },
  '/settings/mcp': { titleKey: 'routes:settingsMcp.title', descriptionKey: 'routes:settingsMcp.description' },
  '/settings/memory': {
    titleKey: 'routes:settingsMemory.title',
    descriptionKey: 'routes:settingsMemory.description',
  },
  '/settings/laura-mode': {
    titleKey: 'routes:settingsLauraMode.title',
    descriptionKey: 'routes:settingsLauraMode.description',
  },
  '/settings/notifications': {
    titleKey: 'routes:settingsNotifications.title',
    descriptionKey: 'routes:settingsNotifications.description',
  },
  '/settings/profile/': {
    titleKey: 'routes:settingsProfile.title',
    descriptionKey: 'routes:settingsProfile.description',
  },
  '/settings/profile/$stage': {
    titleKey: 'routes:settingsProfileStage.title',
    descriptionKey: 'routes:settingsProfileStage.description',
  },
  '/settings/profile/audit': {
    titleKey: 'routes:settingsProfileAudit.title',
    descriptionKey: 'routes:settingsProfileAudit.description',
  },
  '/settings/profile/context': {
    titleKey: 'routes:settingsProfileContext.title',
    descriptionKey: 'routes:settingsProfileContext.description',
  },
  '/settings/profile/identity': {
    titleKey: 'routes:settingsProfileIdentity.title',
    descriptionKey: 'routes:settingsProfileIdentity.description',
  },
  '/settings/pipeline': {
    titleKey: 'routes:settingsPipelineSla.title',
    descriptionKey: 'routes:settingsPipelineSla.description',
  },
  // #2035.10 (vague 3, 21/09/2026) — Réglages › Marché inversé.
  '/settings/reverse-market': {
    titleKey: 'routes:settingsReverseMarket.title',
    descriptionKey: 'routes:settingsReverseMarket.description',
  },
  // #2035.11 (vague 3, 21/09/2026) — Réglages › Charge commerciale.
  '/settings/commercial-load': {
    titleKey: 'routes:settingsCommercialLoad.title',
    descriptionKey: 'routes:settingsCommercialLoad.description',
  },
  '/settings/branding': {
    titleKey: 'routes:settingsBranding.title',
    descriptionKey: 'routes:settingsBranding.description',
  },
  '/settings/mes-donnees': {
    titleKey: 'routes:settingsMyData.title',
    descriptionKey: 'routes:settingsMyData.description',
  },
  '/settings/mes-signalements': {
    titleKey: 'routes:settingsMyReports.title',
    descriptionKey: 'routes:settingsMyReports.description',
  },
  '/settings/security': {
    titleKey: 'routes:settingsSecurity.title',
    descriptionKey: 'routes:settingsSecurity.description',
  },
  '/settings/shortcuts': {
    titleKey: 'routes:settingsShortcuts.title',
    descriptionKey: 'routes:settingsShortcuts.description',
  },
  '/settings/do-not-contact': {
    titleKey: 'routes:settingsDoNotContact.title',
    descriptionKey: 'routes:settingsDoNotContact.description',
  },
  '/settings/team': { titleKey: 'routes:settingsTeam.title', descriptionKey: 'routes:settingsTeam.description' },
  '/settings/business-units': {
    titleKey: 'routes:settingsBusinessUnits.title',
    descriptionKey: 'routes:settingsBusinessUnits.description',
  },
  // #2081.14 — Réglages › Règles d'espace.
  '/settings/workspace-rules': {
    titleKey: 'routes:settingsWorkspaceRules.title',
    descriptionKey: 'routes:settingsWorkspaceRules.description',
  },
  // #4532 (Louis 24/10/2026, revient sur #3950) — l'adresse redirige vers Mes données ; l'entrée reste parce que
  // chaque route générée doit avoir un titre (jamais d'écran qui hérite du titre précédent).
  '/settings/vivier-export': {
    titleKey: 'routes:settingsVivierExport.title',
    descriptionKey: 'routes:settingsVivierExport.description',
  },
  '/settings/finance': {
    titleKey: 'routes:settingsFinance.title',
    descriptionKey: 'routes:settingsFinance.description',
  },
  '/share/$slug': { titleKey: 'routes:share.title', descriptionKey: 'routes:share.description' },
  '/signup': { titleKey: 'routes:signup.title', descriptionKey: 'routes:signup.description' },
  '/team/': { titleKey: 'routes:team.title' },
  // Alias FRANÇAIS de l'équipe : même écran, donc même titre.
  '/equipe': { titleKey: 'routes:team.title' },
  '/team/recherches': { titleKey: 'routes:teamSearches.title' },
  '/team/plans': { titleKey: 'routes:teamPlans.title' },
  '/team/business': { titleKey: 'routes:teamBusiness.title' },
  '/team/admin': { titleKey: 'routes:teamAdmin.title' },
  '/team/activite': { titleKey: 'routes:teamActivity.title' },
  '/team/member/$id': { titleKey: 'routes:teamMember.title' },
  '/settings/billing': { titleKey: 'routes:settingsBilling.title' },
  '/search/history': { titleKey: 'routes:searchHistory.title' },
  // #4658 — alias FR/EN du verbe principal : ils redirigent vers /search, ils portent donc son titre.
  '/analyse': { titleKey: 'search:meta.pageTitle', descriptionKey: 'search:meta.pageDescription' },
  '/analyze': { titleKey: 'search:meta.pageTitle', descriptionKey: 'search:meta.pageDescription' },
  // #4668 — alias de la section « Talents » : il redirige vers `/consultants`, il porte donc son titre.
  '/talents': { titleKey: 'routes:consultants.title' },
  // #4710 — alias français des écrans : chacun redirige, il porte donc le titre de sa destination.
  '/comptes': { titleKey: 'routes:accounts.title', descriptionKey: 'routes:accounts.description' },
  '/decouvrir': { titleKey: 'routes:discover.title', descriptionKey: 'routes:discover.description' },
  '/facturation': { titleKey: 'routes:billing.title', descriptionKey: 'routes:billing.description' },
  '/signaux': { titleKey: 'routes:signals.title', descriptionKey: 'routes:signals.description' },
  '/affaires': { titleKey: 'routes:projects.title' },
  '/vivier': { titleKey: 'routes:consultants.title' },
  // #4789 — l'adresse redirige vers le dossier du compte, elle porte donc son titre.
  // Alias FRANÇAIS de l'analyse : même écran que son homologue anglaise.
  '/accounts/$id_/analyse': {
    titleKey: 'routes:accountDetail.title',
    descriptionKey: 'routes:accountDetail.description',
  },
  '/accounts/$id_/analyze': {
    titleKey: 'routes:accountDetail.title',
    descriptionKey: 'routes:accountDetail.description',
  },
  '/contacts/lists': { titleKey: 'routes:contactLists.title' },
  '/contacts/imports': { titleKey: 'routes:contactImports.title' },
  '/contacts/import': { titleKey: 'routes:contactImport.title' },
  '/consultants/recrutement': { titleKey: 'routes:talentRecruitment.title' },
  '/onboarding/themes/': { titleKey: 'routes:onboardingThemes.title' },
  '/onboarding/themes/$themeId': { titleKey: 'routes:onboardingTheme.title' },
  // Théo D team-review — le point d'équipe en trois étapes.
  '/team/review/$step': { titleKey: 'routes:teamReview.title', descriptionKey: 'routes:teamReview.description' },
  '/verify-email': { titleKey: 'routes:verifyEmail.title', descriptionKey: 'routes:verifyEmail.description' },
  '/settings/routines': { titleKey: 'routes:routines.title', descriptionKey: 'routes:routines.description' },
  // La FICHE d'une automatisation (#2916). Tiret bas du fichier de route
  // (`routines_.$key.tsx`) : même raison que `/projects/needs_/$needId`.
  '/settings/routines_/$key': {
    titleKey: 'routes:routineSheet.title',
    descriptionKey: 'routes:routineSheet.description',
  },
  // #4533 — l'adresse redirige vers Mes données › Imports (même raison que `/settings/vivier-export`).
  '/settings/import': { titleKey: 'routes:import.title', descriptionKey: 'routes:import.description' },
  '/briefing/': { titleKey: 'routes:briefing.title', descriptionKey: 'routes:briefing.description' },
  '/mailbox/': { titleKey: 'routes:mailbox.title', descriptionKey: 'routes:mailbox.description' },
  // Pilotage (chantier méthodo) — livré sans titre de route, comme le Vivier.
  '/pilotage/': { titleKey: 'routes:pilotage.title' },
  '/settings/knowledge': { titleKey: 'routes:settingsKnowledge.title' },
  // Vivier de consultants (#780) — livré sans son titre de route, le test
  // « aucun écran n'hérite du titre précédent » le réclame.
  '/consultants/': { titleKey: 'routes:consultants.title' },
  '/consultants/$id': { titleKey: 'routes:consultants.detail' },
  // La prospection inversée vers le marché (§6.2) : livrée avec son écran,
  // sans son titre de route. Sans lui, l'onglet garde celui de l'écran
  // précédent — un titre hérité est pire qu'un titre générique, il désigne
  // le mauvais écran.
  '/consultants/$id_/reverse-market': { titleKey: 'routes:consultants.reverseMarket' },
  // Le DOSSIER d'un positionnement (#2953) : un titre à lui, sinon l'onglet
  // hérite du titre de la liste qui a mené jusqu'ici.
  '/submissions/$id': {
    titleKey: 'routes:submissionDossier.title',
    descriptionKey: 'routes:submissionDossier.description',
  },
  '/welcome': { titleKey: 'routes:welcome.title', descriptionKey: 'routes:welcome.description' },
}

/** Meta for the deepest matched route, or `null` when the id is unknown. */
export function routeMetaFor(routeIds: readonly string[]): RouteMeta | null {
  for (let index = routeIds.length - 1; index >= 0; index -= 1) {
    const meta = ROUTE_META[routeIds[index] ?? '']
    if (meta) return meta
  }
  return null
}
