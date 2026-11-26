/**
 * LE CONTRAT DE BOUTON DU DOSSIER COMPTE — #2116.28 à .37 et .44 à .47
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Retour bêta #2116 : « chaque bouton visible doit dire ce qu'il fait ». Le
 * balayage du 14/09/2026 a trouvé qu'aucun mécanisme du dépôt ne répondait aux
 * neuf questions qu'un commercial se pose AVANT de cliquer sur la barre
 * d'actions d'un dossier — effet exact, objet concerné, destination, permission,
 * confirmation, résultat attendu, état de succès, état d'échec, preuve du
 * résultat. Chaque bouton portait un libellé, et rien d'autre.
 *
 * Un exemple suffit à montrer pourquoi ça compte : « Actualiser l'analyse »
 * n'actualise rien — il NAVIGUE vers la recherche pré-remplie
 * (`useAccountRelaunch`). Le libellé promet une mutation, le code fait un
 * déplacement. Le contrat ci-dessous rend ce genre d'écart LISIBLE, et une
 * garde d'architecture (`dossier-cta-contract.test.ts`) interdit qu'un bouton
 * neuf arrive sans réponse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE REGISTRE NE DUPLIQUE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le LIBELLÉ du bouton n'est pas ici : il vit déjà à un seul endroit, le JSX,
 * et deux gardes i18n existantes prouvent qu'il se résout (`keys-resolve`,
 * `parity`). Le registre porte les quatre textes qui n'existaient NULLE PART —
 * ce qui va se passer, ce que dit le succès, ce que dit l'échec, où voir le
 * résultat — et il les porte en CLÉS i18n, jamais en français : un libellé
 * écrit dans un contrat est français pour toujours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « null » VEUT DIRE, ET CE QU'IL NE VEUT PAS DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un `successStateKey` à `null` n'est pas un trou : c'est la forme des gestes
 * dont la RÉUSSITE EST LA SURFACE ATTEINTE. Une navigation qui aboutit se
 * prouve par la page ; lui coller un toast « c'est fait » ajouterait du bruit
 * et une phrase à traduire qui ne dit rien. Inventer quarante messages jamais
 * lus aurait été la version « non mesuré rendu 0 » de ce registre. La règle est
 * donc testée dans les deux sens (`cta-contract.test.ts`) :
 *   • un effet `mutate` DOIT porter succès, échec ET preuve ;
 *   • un effet `navigate` / `open-*` / `dismiss` ne porte PAS de succès.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTÉE — fermée, et extensible sans rien réécrire
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce lot ferme LA BARRE D'ACTIONS du dossier compte et la porte de
 * priorisation : les quatre fichiers listés dans `DOSSIER_CTA_SCOPE_FILES`.
 * Les onglets et les dialogues qu'ils ouvrent rejoindront le registre par leur
 * `section` — la garde lit la liste de fichiers, pas un chiffre figé, donc
 * élargir la portée se fait en ajoutant un fichier et ses entrées.
 * `external` est réservé au lot suivant (#2116.38-43) : un bouton qui SORT du
 * produit (site public, envoi) se déclare, il ne se devine pas.
 */

/** L'effet EXACT d'un clic — #2116.28. Ce que le bouton fait, pas ce qu'il promet. */
export const dossierCtaEffectValues = [
  /** Change de page ou d'écran. La destination est une route. */
  'navigate',
  /** Écrit côté serveur. La destination est la requête (méthode + chemin). */
  'mutate',
  /** Fabrique quelque chose sans écrire au serveur (un PDF, un brouillon, un champ pré-rempli). */
  'prepare',
  /** Ouvre un dialogue ou un panneau. */
  'open-dialog',
  /** Ouvre un menu ou un popover. Distinct de `open-dialog` : rien n'est modal, rien n'est à confirmer. */
  'open-menu',
  /** Ferme la surface courante sans rien changer. */
  'dismiss',
] as const
export type DossierCtaEffect = (typeof dossierCtaEffectValues)[number]

/** L'objet CONCERNÉ — #2116.29. Sur quoi le clic agit. */
export const dossierCtaObjectValues = [
  'account',
  'analysis',
  'contact',
  'action',
  'note',
  'export',
  'share-link',
] as const
export type DossierCtaObject = (typeof dossierCtaObjectValues)[number]

/** Où le bouton vit dans le dossier. Sert au lot suivant pour élargir sans tout relire. */
export const dossierCtaSectionValues = ['hero', 'gate', 'more-actions', 'refresh'] as const
export type DossierCtaSection = (typeof dossierCtaSectionValues)[number]

/**
 * #2117.6, .25-29 — L'ÉTAT DU DOSSIER qui fait apparaître un geste.
 *
 * Le hero portait UN bouton statique — « Actualiser l'analyse » — quel que soit
 * l'endroit où en était le compte. Un dossier jamais terminé, un dossier
 * complet sans plan et un dossier avec un rendez-vous jeudi recevaient le même
 * conseil. Les cinq états ci-dessous sont les cinq situations que le retour
 * #2117 nomme, et chacun a SON geste principal.
 *
 * ⚠ Ils sont MUTUELLEMENT EXCLUSIFS : `heroPrimaryAction` (côté web) en choisit
 * exactement un, donc les cinq entrées qui les portent ne sont jamais rendues
 * ensemble et comptent pour UN seul geste principal au hero (#2116.42). C'est
 * pourquoi le champ existe : sans lui, la règle « un seul geste principal au
 * hero » compterait cinq boutons là où l'écran n'en montre qu'un.
 */
export const dossierHeroStateValues = [
  /** L'analyse n'est pas allée au bout (jamais lancée, en cours, en erreur). */
  'analysis-incomplete',
  /** Le dossier est complet, mais rien n'a encore été décidé à faire. */
  'no-plan',
  /** Une prochaine action existe dans le plan : il reste à la faire. */
  'plan-active',
  /** Un rendez-vous est posé à l'agenda sur ce compte. */
  'meeting-booked',
  /** Le compte est mis en veille : on le regarde, on ne le travaille pas. */
  'watching',
] as const
export type DossierHeroState = (typeof dossierHeroStateValues)[number]

/**
 * La permission REQUISE — #2116.31. Une clé du modèle de rôles de l'espace
 * (`records:write`, `data:export`, …) ou `none` quand le geste n'en demande
 * aucune. `none` est une RÉPONSE, pas une absence de réponse : c'est ce qui
 * distingue « ce bouton n'exige rien » de « personne n'a regardé ».
 */
export const dossierCtaPermissionValues = ['none', 'records:write', 'data:export', 'contacts:enrich'] as const
export type DossierCtaPermission = (typeof dossierCtaPermissionValues)[number]

export type DossierCtaContract = {
  /** Identifiant stable, porté par le bouton dans le JSX (`cta="…"`). */
  id: string
  section: DossierCtaSection
  effect: DossierCtaEffect
  object: DossierCtaObject
  /**
   * #2116.30 — la page ou l'action de destination. Une route (`/accounts/$id/brief`),
   * une requête (`PATCH /accounts/:id/gate`), ou la surface ouverte
   * (`dialog:gate.parkDialog`). Jamais un libellé : la destination se vérifie.
   */
  destination: string
  permission: DossierCtaPermission
  /** #2116.33 — le geste passe-t-il par une confirmation explicite avant d'agir. */
  confirmation: boolean
  /** #2116.34 — clé i18n : ce que le clic va produire, rendu en description accessible. */
  expectedResultKey: string
  /** #2116.35 — clé i18n du message de succès. `null` ⟺ la surface atteinte EST le succès. */
  successStateKey: string | null
  /** #2116.36 — clé i18n de l'échec. Le texte de l'API, quand il existe, passe devant. */
  failureStateKey: string | null
  /** #2116.37 — clé i18n : où voir ce qui a été fait. `null` ⟺ la destination est la preuve. */
  proofKey: string | null
  /**
   * #2116.52 — le geste FAIT SORTIR quelque chose du produit vers un tiers :
   * un lien public qu'on met au monde, une écriture dans le CRM de l'espace,
   * un envoi. Obligatoire (`true` ou `false`, jamais l'absence) dès que
   * l'objet est `share-link` ou `export` : c'est là que la question se pose,
   * et le silence y est la seule réponse inacceptable.
   *
   * ⚠ Un fichier qui descend sur le disque de CELUI QUI CLIQUE n'est pas une
   * sortie vers un tiers : le destinataire est l'utilisateur lui-même, et le
   * clic EST sa décision (doctrine « une écriture passe par une porte » :
   * geste d'utilisateur = auto-approuvé). Ce qui sort vers un tiers demande,
   * lui, une confirmation explicite — `external: true` ⟹ `confirmation: true`,
   * tenu par `cta-contract.test.ts`.
   */
  external?: boolean
  /**
   * #2116.42 — geste PRINCIPAL du dossier : il se rend au premier niveau, pas
   * sous « … ». `primary` ⟹ jamais `section: 'more-actions'`, et le `hero`
   * n'en porte qu'UN (au-delà, deux boutons se disputent le même regard).
   * Les secondaires ne portent rien : `primary` est une DÉCLARATION, pas un
   * défaut de style.
   */
  primary?: true
  /**
   * #2117.25-29 — l'ÉTAT du dossier qui fait apparaître CE geste. Les entrées
   * qui en portent un forment un groupe mutuellement exclusif : une seule est
   * rendue à la fois. Absent ⟺ le geste est rendu quel que soit l'état.
   */
  state?: DossierHeroState
  /**
   * #2116.38, .49 — le fichier, relatif à `apps/web/src`, qui IMPLÉMENTE la
   * destination : le fichier de route pour une navigation, le composant qui
   * rend la surface pour un `open-*` / `dismiss`, le hook qui écrit ou
   * fabrique pour un `mutate` / `prepare`. Une destination sans implémentation
   * est exactement le défaut n°1 du dépôt vu de l'autre côté — un bouton qui
   * n'ouvre rien. La garde vérifie que le fichier EXISTE sur le disque.
   */
  wiredBy: string
}

/**
 * #2116.44-47 — un bouton désactivé n'est tolérable que s'il est COMPRÉHENSIBLE.
 * Trois textes, et les trois sont obligatoires : la raison ne suffit pas si on
 * ne sait pas quoi faire ensuite. Le mécanisme généralise `ActionPlanBoard`
 * (`disabledReason: crmConnected ? … : …`), qui nommait déjà l'élément manquant
 * mais pour un seul bouton.
 */
export type DossierCtaBlockedReason = {
  /** Pourquoi le bouton est inerte. */
  whyKey: string
  /** Ce qui MANQUE, nommé. */
  missingKey: string
  /** Le geste concret qui débloque. */
  unblockKey: string
}

/** Les fichiers dont TOUS les boutons doivent figurer au registre. La garde les lit. */
export const DOSSIER_CTA_SCOPE_FILES = [
  'features/accounts/view/account-detail/components/AccountDetailHero.tsx',
  // #2117.36-38, Q-1816 renversée (14/09/2026) — `AccountDetailHeaderActions.tsx`
  // (jamais monté ailleurs dans le dépôt) est SUPPRIMÉ, pas seulement retiré
  // d'ici : le garder aurait laissé un fichier mort porter un commentaire qui
  // ne serait plus vrai (« ce menu, optionnel, ne le fournit pas encore »).
  'features/accounts/view/account-detail/components/AccountDetailMoreActionsMenu.tsx',
  'features/accounts/view/account-detail/components/AccountRefreshMenu.tsx',
  'features/accounts/gate/AccountGateControl.tsx',
  // #2117.6, .25-30 — le geste principal par ÉTAT et l'action secondaire vivent
  // dans leur propre fichier : cinq boutons mutuellement exclusifs plus
  // « Demander à Laura » dans le corps du hero l'auraient rendu illisible. La
  // garde lit une LISTE de fichiers, pas un chiffre : élargir la portée, c'est
  // ajouter une ligne ici.
  'features/accounts/view/account-detail/components/AccountDetailHeroPrimaryAction.tsx',
  // #4459.3 — « Compléter le compte », à côté du geste principal (le dialogue qu'il ouvre est hors portée).
  'features/accounts/view/account-detail/components/CompleteCrmAccountButton.tsx',
] as const

export const DOSSIER_CTA_CONTRACTS: readonly DossierCtaContract[] = [
  // ── La porte de priorisation (PDF 2 §4.4 B2) ──────────────────────────────
  {
    id: 'dossier.gate.open',
    section: 'gate',
    // #2116.42 — geste PRINCIPAL : la porte de priorisation commande toutes
    // les autres actions du dossier, elle se rend au premier niveau. #1816
    // (Louis, 10/09/2026) l'a explicitement gardée hors du menu « … ».
    primary: true,
    effect: 'open-menu',
    object: 'account',
    destination: 'popover:accounts.gate',
    wiredBy: 'features/accounts/gate/AccountGateControl.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.gate.open.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.gate.prioritise',
    section: 'gate',
    effect: 'mutate',
    object: 'account',
    destination: 'PATCH /accounts/:id/gate { gate: prioritised }',
    wiredBy: 'features/accounts/gate/useAccountGate.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.gate.prioritise.expected',
    successStateKey: 'accounts:gate.done.prioritised',
    failureStateKey: 'accounts:gate.failed',
    proofKey: 'accounts:cta.gate.prioritise.proof',
  },
  {
    id: 'dossier.gate.park',
    section: 'gate',
    effect: 'open-dialog',
    object: 'account',
    destination: 'dialog:accounts.gate.parkDialog',
    wiredBy: 'features/accounts/gate/AccountGateControl.tsx',
    permission: 'records:write',
    // Écarter est le seul des trois choix à passer par un formulaire : le motif
    // est précisément ce qu'on voudra relire dans six mois.
    confirmation: true,
    expectedResultKey: 'accounts:cta.gate.park.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.gate.reopen',
    section: 'gate',
    effect: 'mutate',
    object: 'account',
    destination: 'PATCH /accounts/:id/gate { gate: pending }',
    wiredBy: 'features/accounts/gate/useAccountGate.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.gate.reopen.expected',
    successStateKey: 'accounts:gate.done.pending',
    failureStateKey: 'accounts:gate.failed',
    proofKey: 'accounts:cta.gate.reopen.proof',
  },
  {
    id: 'dossier.gate.park.reason',
    section: 'gate',
    effect: 'prepare',
    object: 'account',
    destination: 'field:accounts.gate.parkDialog.reason',
    wiredBy: 'features/accounts/gate/AccountGateControl.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.gate.parkReason.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.gate.park.cancel',
    section: 'gate',
    effect: 'dismiss',
    object: 'account',
    destination: 'dialog:accounts.gate.parkDialog',
    wiredBy: 'features/accounts/gate/AccountGateControl.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.gate.parkCancel.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.gate.park.confirm',
    section: 'gate',
    effect: 'mutate',
    object: 'account',
    destination: 'PATCH /accounts/:id/gate { gate: parked, reason }',
    wiredBy: 'features/accounts/gate/useAccountGate.ts',
    permission: 'records:write',
    confirmation: true,
    expectedResultKey: 'accounts:cta.gate.parkConfirm.expected',
    successStateKey: 'accounts:gate.done.parked',
    failureStateKey: 'accounts:gate.failed',
    proofKey: 'accounts:cta.gate.parkConfirm.proof',
  },

  // ── La barre d'actions, premier niveau ────────────────────────────────────
  {
    id: 'dossier.analysis.relaunch',
    section: 'hero',
    // #2117.6 — il N'EST PLUS le geste principal, et il n'a pas bougé pour
    // autant : #1816 le garde au premier niveau du hero (geste quotidien). Ce
    // qui change, c'est qu'un dossier a désormais un geste principal qui
    // DÉPEND de son état (`dossier.hero.*` en fin de registre) — « Actualiser
    // l'analyse » redevient ce qu'il est : le geste qu'on fait quand on veut
    // rafraîchir, pas la réponse à « qu'est-ce que je fais de ce compte
    // maintenant ? ».
    // Q-2116.50 (14/09/2026) — le doublon avec `dossier.analysis.relaunchFromMenu`
    // est TRANCHÉ, pas seulement nommé : l'entrée du menu « … » est retirée
    // (elle ne faisait que dupliquer ce bouton, jamais visible en même temps
    // que lui). `DOSSIER_CTA_DUPLICATE_EXCEPTIONS` ne porte donc plus
    // d'exception pour la relance.
    // NAVIGATE, et c'est le point : le libellé dit « Actualiser l'analyse »,
    // le code ouvre la recherche pré-remplie. Rien n'est relancé au clic.
    effect: 'navigate',
    object: 'analysis',
    destination: '/search?accountId&company',
    wiredBy: 'routes/search/index.tsx',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.analysis.relaunch.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.moreActions.open',
    section: 'more-actions',
    effect: 'open-menu',
    object: 'account',
    destination: 'menu:accounts.moreActions',
    wiredBy: 'features/accounts/view/account-detail/components/AccountDetailMoreActionsMenu.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.open.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },

  // ── Q-1816 renversée (14/09/2026, #2117) — DES LIVRABLES, PAS UN MENU ─────
  // Les quatre entrées ci-dessous vivaient sous le menu « … » depuis #1816
  // (troisième tour). Elles en sont sorties : `AccountDetailHero.tsx` les
  // rend en boutons icône visibles, à côté d'« Actualiser l'analyse ». La
  // `section: 'more-actions'` reste inchangée ici — c'est une catégorie
  // (« geste occasionnel, pas quotidien »), pas un pointeur vers un composant
  // précis, et `wiredBy` continue de nommer le fichier qui rend la SURFACE
  // atteinte (la feuille, le dialogue, la route), pas le bouton qui y mène.
  {
    id: 'dossier.pdf.preview',
    section: 'more-actions',
    // #2116.52 — rien ne sort : l'aperçu rend le PDF DANS une feuille latérale,
    // aucun fichier n'est écrit. La question se pose (l'objet est un export),
    // la réponse est NON — et elle est écrite, pas devinée.
    external: false,
    effect: 'open-dialog',
    object: 'export',
    destination: 'sheet:accounts.pdfPreview',
    wiredBy: 'features/accounts/view/account-detail/components/AccountPdfPreviewSheet.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.pdf.preview.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.pdf.export',
    section: 'more-actions',
    // #2116.52 — PAS une sortie vers un tiers : le fichier descend sur le
    // disque de celui qui clique, à sa demande. Le destinataire est
    // l'utilisateur lui-même, et le clic EST sa décision. Ce qui devrait être
    // confirmé, c'est un envoi ou une publication — pas un téléchargement que
    // `cta.pdf.export.expected` annonce mot pour mot avant le clic.
    external: false,
    // Le PDF est fabriqué DANS le navigateur : aucun serveur n'écrit.
    effect: 'prepare',
    object: 'export',
    destination: 'download:dossier.pdf',
    wiredBy: 'features/accounts/hooks/useAccountPdfExport.ts',
    permission: 'data:export',
    confirmation: false,
    expectedResultKey: 'accounts:cta.pdf.export.expected',
    successStateKey: 'accounts:toast.pdfDownloaded',
    failureStateKey: 'accounts:toast.pdfError',
    proofKey: 'accounts:cta.pdf.export.proof',
  },
  {
    id: 'dossier.brief.open',
    section: 'more-actions',
    effect: 'navigate',
    object: 'account',
    destination: '/accounts/$id/brief',
    wiredBy: 'routes/accounts/$id_.brief.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.brief.open.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.share.open',
    section: 'more-actions',
    // #2116.52 — ce bouton n'expose RIEN : il ouvre la fenêtre de partage.
    // C'est le geste qui MET AU MONDE le lien public, à l'intérieur de
    // `AccountShareDialog`, qui est externe — et ce dialogue est hors de la
    // portée de ce lot (`DOSSIER_CTA_SCOPE_FILES`). Il déclarera
    // `external: true` en y entrant ; le marquer ici ferait porter la
    // confirmation au mauvais bouton.
    external: false,
    effect: 'open-dialog',
    object: 'share-link',
    destination: 'dialog:accounts.share',
    wiredBy: 'features/accounts/view/account-detail/components/AccountShareDialog.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.share.open.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },

  // ── Le rafraîchissement par axe ───────────────────────────────────────────
  {
    id: 'dossier.refresh.menu',
    section: 'refresh',
    effect: 'open-menu',
    object: 'analysis',
    destination: 'menu:accounts.refreshDimension',
    wiredBy: 'features/accounts/view/account-detail/components/AccountRefreshMenu.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.refresh.menu.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.refresh.dimension',
    section: 'refresh',
    effect: 'mutate',
    object: 'analysis',
    // UNE entrée pour les quatre axes : c'est UN bouton rendu quatre fois, pas
    // quatre contrats. Les décliner aurait obligé à écrire l'identifiant du
    // bouton de façon dynamique — ce qu'aucune garde ne peut relire.
    destination: 'POST /analysis/:id/refresh { dimension }',
    wiredBy: 'features/accounts/hooks/useRefreshDimension.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.refresh.dimension.expected',
    successStateKey: 'accounts:toast.dimensionRefreshed',
    failureStateKey: 'accounts:toast.refreshError',
    proofKey: 'accounts:cta.refresh.dimension.proof',
  },

  // ── LE GESTE PRINCIPAL DU HERO, PAR ÉTAT (#2117.6, .25-29) ────────────────
  // Ajoutées en FIN de liste, jamais au milieu : le registre est un inventaire
  // et son ordre est lu par des humains. Les cinq portent `state` et sont donc
  // mutuellement exclusives — `heroPrimaryAction` en choisit UNE, l'écran n'en
  // rend jamais deux. Chacune dit ce qu'elle promet : aucune ne lance
  // d'analyse, aucune ne débite ; ce sont cinq DÉPLACEMENTS vers l'endroit où
  // le geste se fait.
  {
    id: 'dossier.hero.finishAnalysis',
    section: 'hero',
    primary: true,
    state: 'analysis-incomplete',
    // Même destination que « Actualiser l'analyse » — et c'est voulu : un
    // dossier dont l'analyse n'est pas allée au bout se termine là où elle se
    // lance. Le libellé, lui, dit la vérité de l'état (« Terminer », pas
    // « Actualiser »). Doublon déclaré plus bas : les deux ne sont JAMAIS
    // rendus ensemble (le hero cache la relance tant qu'il n'y a rien à
    // rafraîchir), c'est le registre qui les voit voisins, pas l'écran.
    effect: 'navigate',
    object: 'analysis',
    destination: '/search?accountId&company',
    wiredBy: 'routes/search/index.tsx',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.finishAnalysis.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.hero.preparePlan',
    section: 'hero',
    primary: true,
    state: 'no-plan',
    effect: 'navigate',
    object: 'action',
    destination: '/accounts/$id?tab=plan',
    wiredBy: 'routes/accounts/$id.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.preparePlan.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.hero.continueNextAction',
    section: 'hero',
    primary: true,
    state: 'plan-active',
    // Même destination que `preparePlan`, même SECTION : ce n'est pas un
    // doublon entre deux sections (les deux états s'excluent), c'est le même
    // écran atteint depuis deux situations et sous deux promesses différentes.
    effect: 'navigate',
    object: 'action',
    destination: '/accounts/$id?tab=plan',
    wiredBy: 'routes/accounts/$id.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.continueNextAction.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.hero.prepareMeeting',
    section: 'hero',
    primary: true,
    state: 'meeting-booked',
    effect: 'navigate',
    object: 'account',
    destination: '/accounts/$id/brief',
    wiredBy: 'routes/accounts/$id_.brief.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.prepareMeeting.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    id: 'dossier.hero.seeChanges',
    section: 'hero',
    primary: true,
    state: 'watching',
    effect: 'navigate',
    object: 'account',
    destination: '/accounts/$id?tab=veille',
    wiredBy: 'routes/accounts/$id.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.seeChanges.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
  {
    // #2117.30 — l'action SECONDAIRE du hero, en clair et jamais sous « … ».
    // Elle ne porte pas `primary` : deux gestes principaux se disputeraient le
    // même regard (#2116.42). Elle ouvre le copilote DÉJÀ cadré sur ce compte,
    // par le même chemin que la liste des comptes (`/chat?accountId=…`) —
    // l'entrée existait, elle n'est pas réinventée ici.
    id: 'dossier.hero.askLaura',
    section: 'hero',
    effect: 'navigate',
    object: 'account',
    destination: '/chat?accountId',
    wiredBy: 'routes/chat/index.tsx',
    permission: 'none',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.askLaura.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },

  // ── #2117.36-38 — LE VOLET ADMINISTRATIF DU MENU « … » ────────────────────
  // Archiver / détacher / supprimer. Les trois écritures existent déjà côté
  // API (`POST :id/archive`, `POST :id/detach`, `DELETE :id` — un
  // archivage/détachement/suppression DOUX : la ligne reste, seul le statut
  // change, doctrine « on archive, on ne supprime pas » tenue). Ajoutées en
  // FIN de registre, jamais au milieu (même règle que le hero par état).
  {
    id: 'dossier.moreActions.archive',
    section: 'more-actions',
    effect: 'mutate',
    object: 'account',
    destination: 'POST /accounts/:id/archive',
    // Le hook DÉDIÉ à ce menu, pas `hooks/useArchiveAccount.ts` (celui de la
    // liste) : son toast générique (« Compte archivé ») ne nomme pas le
    // compte — #2116.40 l'exige dès qu'un bouton porte un contrat `dossier.*`
    // — et ce hook est hors du périmètre de fichiers de ce lot.
    wiredBy: 'features/accounts/hooks/useAccountAdminActions.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.archive.expected',
    successStateKey: 'accounts:cta.moreActions.archive.success',
    failureStateKey: 'accounts:toast.archiveError',
    proofKey: 'accounts:cta.moreActions.archive.proof',
  },
  {
    id: 'dossier.moreActions.detach',
    section: 'more-actions',
    // Rendu SEULEMENT quand ce dossier appartient à un groupe (#1111) — même
    // condition que le bouton déjà livré sur `LinkedAccountsCard.tsx`, lu
    // depuis le menu « … » du hero plutôt que réservé à la carte de contexte.
    effect: 'mutate',
    object: 'account',
    destination: 'POST /accounts/:id/detach',
    wiredBy: 'features/accounts/hooks/useAccountAdminActions.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.detach.expected',
    successStateKey: 'accounts:cta.moreActions.detach.success',
    failureStateKey: 'accounts:detach.toast.error',
    proofKey: 'accounts:cta.moreActions.detach.proof',
  },
  {
    id: 'dossier.moreActions.delete',
    section: 'more-actions',
    // « Supprimer » est un archivage DOUX (`status → 'deleted'`, ligne
    // conservée) : la doctrine « on archive, on ne supprime pas » est tenue
    // par la route elle-même, pas par ce registre. Pas de confirmation à
    // part : le geste est au bout d'un menu déjà ouvert délibérément, comme
    // « Archiver » juste au-dessus, avec lequel il partage l'irréversibilité
    // APPARENTE (côté utilisateur, le dossier quitte le portefeuille actif).
    effect: 'mutate',
    object: 'account',
    destination: 'DELETE /accounts/:id',
    wiredBy: 'features/accounts/hooks/useAccountAdminActions.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.delete.expected',
    successStateKey: 'accounts:cta.moreActions.delete.success',
    failureStateKey: 'accounts:toast.deleteError',
    proofKey: 'accounts:cta.moreActions.delete.proof',
  },
  // #2165.13 — la SOURCE du preset Découvrir « Proches de mes meilleures
  // références » : un commercial marque le compte-CLIENT qui lui sert de
  // référence, jamais un calcul. Geste HUMAIN auto-approuvé (le clic EST la
  // décision, doctrine sur les écritures CRM) : pas de confirmation.
  {
    id: 'dossier.moreActions.bestReference',
    section: 'more-actions',
    effect: 'mutate',
    object: 'account',
    destination: 'PATCH /accounts/:id/best-reference',
    wiredBy: 'features/accounts/hooks/useBestReference.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.bestReference.expected',
    successStateKey: 'accounts:cta.moreActions.bestReference.success',
    failureStateKey: 'accounts:bestReference.errorToast',
    proofKey: 'accounts:cta.moreActions.bestReference.proof',
  },
  // #3245 (#3209.6) — le profil de pari DÉCLARÉ (horizon, taille, accès,
  // ressource), lu par `get_portfolio_priorities` pour nommer un portefeuille
  // trop homogène. Geste HUMAIN auto-approuvé : le clic EST la déclaration.
  {
    id: 'dossier.moreActions.betProfile',
    section: 'more-actions',
    effect: 'mutate',
    object: 'account',
    destination: 'PATCH /accounts/:id/bet-profile',
    wiredBy: 'features/accounts/hooks/useBetProfile.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.betProfile.expected',
    successStateKey: 'accounts:cta.moreActions.betProfile.success',
    failureStateKey: 'accounts:betProfile.errorToast',
    proofKey: 'accounts:cta.moreActions.betProfile.proof',
  },
  // #2164.44 — target-lists.service.ts existait déjà (#2155/#2156), sans
  // appelant depuis le dossier compte : le correctif de lecture inerte cité
  // au registre #2164.
  {
    id: 'dossier.moreActions.createTarget',
    section: 'more-actions',
    effect: 'mutate',
    object: 'account',
    destination: 'POST /target-lists → POST /target-lists/:id/items',
    wiredBy: 'features/target-lists/useCreateTargetFromAccount.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.createTarget.expected',
    successStateKey: 'accounts:cta.moreActions.createTarget.success',
    failureStateKey: 'accounts:cta.moreActions.createTarget.error',
    proofKey: 'accounts:cta.moreActions.createTarget.proof',
  },
  {
    // Épopée #2853 (#2157.7) — même geste que `dossier.moreActions.createTarget`
    // ci-dessus, depuis les données CRM branchées plutôt que le dossier
    // d'analyse : rendu seulement quand `CrmPresenceBadge` confirme une
    // correspondance (`matched: true`) — sans connecteur ou sans
    // correspondance, l'entrée reste absente (no-op strict).
    id: 'dossier.moreActions.createTargetFromCrm',
    section: 'more-actions',
    effect: 'mutate',
    object: 'account',
    destination: 'POST /target-lists → POST /target-lists/:id/items',
    wiredBy: 'features/target-lists/useCreateTargetFromCrmPresence.ts',
    permission: 'records:write',
    confirmation: false,
    expectedResultKey: 'accounts:cta.moreActions.createTargetFromCrm.expected',
    successStateKey: 'accounts:cta.moreActions.createTargetFromCrm.success',
    failureStateKey: 'accounts:cta.moreActions.createTargetFromCrm.error',
    proofKey: 'accounts:cta.moreActions.createTargetFromCrm.proof',
  },
  {
    // #4459.3 — « Compléter le compte » : sur un compte VENU DU CRM et analysé (`canCompleteCrmAccount`),
    // ouvre l'APERÇU des contacts apportés par l'analyse. Comme « Partager », ce bouton n'écrit rien : l'envoi
    // (sortie vers le CRM du client) se confirme DANS le dialogue, par la porte d'écriture `POST /crm/push`.
    id: 'dossier.hero.completeAccount',
    section: 'hero',
    external: false,
    effect: 'open-dialog',
    object: 'export',
    destination: 'dialog:crm.completeAccount',
    wiredBy: 'features/crm/view/CompleteCrmAccountDialog.tsx',
    permission: 'data:export',
    confirmation: false,
    expectedResultKey: 'accounts:cta.hero.completeAccount.expected',
    successStateKey: null,
    failureStateKey: null,
    proofKey: null,
  },
]

export const DOSSIER_CTA_IDS: readonly string[] = DOSSIER_CTA_CONTRACTS.map(cta => cta.id)

/** Le contrat d'un bouton, ou `undefined` — jamais un contrat inventé. */
export function dossierCta(id: string): DossierCtaContract | undefined {
  return DOSSIER_CTA_CONTRACTS.find(cta => cta.id === id)
}

/**
 * #2116.39 — les destinations GÉNÉRIQUES tolérées, avec leur raison.
 *
 * Un `navigate` doit porter l'objet : un segment de paramètre (`$id`) ou un
 * paramètre de requête qui nomme le compte. « Actualiser l'analyse » va sur
 * `/search` PRÉ-REMPLI — l'objet voyage, donc c'est admis par la règle
 * elle-même, sans exception. Une destination nue (`/dashboard`, `/accounts`)
 * ramène le commercial à un écran qui ne parle plus de ce qu'il regardait :
 * elle est refusée, et si elle devait exister un jour, elle se DÉCLARE ici
 * avec sa raison. La liste est vide aujourd'hui, et ce n'est pas un trou :
 * c'est l'état mesuré des deux navigations du dossier.
 */
export const DOSSIER_CTA_GENERIC_DESTINATION_EXCEPTIONS: readonly { id: string; reason: string }[] = []

/**
 * #2116.50 — les doublons d'action ASSUMÉS, avec leur raison et leur date.
 *
 * Deux entrées de même (effet, objet, destination) dans deux sections
 * différentes sont un doublon : le même geste proposé deux fois (loi 4 du
 * tome 7). Une entrée ici n'est pas une absolution — c'est une question
 * ouverte qui a un nom, pour que la garde n'ait pas à choisir à la place de
 * Louis quel bouton retirer.
 */
export const DOSSIER_CTA_DUPLICATE_EXCEPTIONS: readonly {
  /**
   * Les entrées en double. Une LISTE, pas une paire : le même geste peut être
   * proposé par trois portes (c'est le cas de la relance depuis #2117.6), et
   * une exception qui n'en nomme que deux laisserait la troisième invisible.
   */
  ids: readonly string[]
  reason: string
}[] = [
  {
    ids: ['dossier.brief.open', 'dossier.hero.prepareMeeting'],
    reason:
      "#2117.28 (14/09/2026), mis à jour Q-1816 renversée — « Préparer le rendez-vous » et « Brief » ouvrent la MÊME page de brief du dossier. Depuis Q-1816 renversée, « Brief » est un bouton PERMANENT et visible du hero (plus seulement une entrée de menu) : quand un rendez-vous est posé à l'agenda, les DEUX sont donc désormais visibles côte à côte — « Préparer le rendez-vous » (geste principal, l'action à faire) et « Brief » (icône, la même destination, toujours là). Ce n'est pas une porte de trop : ils se nomment par des promesses différentes (l'action à faire / le document permanent), et fusionner priverait d'accès au brief les dossiers sans rendez-vous. Le doublon visuel qui en résulte n'a pas été revérifié dans un navigateur réel — c'est un arbitrage produit, il est NOMMÉ ici, pas effacé.",
  },
]
