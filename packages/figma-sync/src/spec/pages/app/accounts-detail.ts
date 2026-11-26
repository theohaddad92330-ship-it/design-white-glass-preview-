import type { Block, PageSpec } from '../../types'

/** L'entête (identité du compte) répétée sur les sept frames de section. */
function accountsDetailHeader(): Block[] {
  return [
    {
      type: 'stack',
      direction: 'row',
      gap: '3',
      align: 'center',
      children: [
        { type: 'component', component: 'EntityAvatar', props: { size: 'lg', content: { name: 'AF' } } },
        {
          type: 'stack',
          direction: 'column',
          gap: '1',
          children: [
            { type: 'text', text: 'ATOS FRANCE', style: 'title' },
            {
              type: 'stack',
              direction: 'row',
              gap: '2',
              align: 'center',
              children: [
                { type: 'text', text: 'Secteur — Services numériques', style: 'caption', color: 'text/secondary' },
                { type: 'text', text: 'SIREN 123 456 789', style: 'caption', color: 'text/accent' },
              ],
            },
          ],
        },
        {
          type: 'component',
          component: 'Badge',
          props: { variant: 'success', content: { label: 'Analyse : Terminé' } },
        },
      ],
    },
  ]
}

/**
 * La barre des CINQ onglets stables (RUX-32/Q2, arbitrage Louis 25/09/2026, `docs/revue-ux.md` §6) :
 * Synthèse · Personnes · Plan d’action · Signaux · Historique — répétée sur les sept frames. Les deux
 * anciens onglets qui n'ont pas de tuile propre (Périmètres, Écosystème & accès) restent des frames
 * Figma séparés pour rester lisibles, mais deviennent des blocs ANCRÉS : atteints depuis le sommaire
 * d'ancres de l'`aside` de leur onglet porteur (Synthèse pour Périmètres, Personnes pour Écosystème &
 * accès), jamais depuis cette barre. « Opportunités » est devenue « Signaux » (le contenu — pistes
 * détectées, preuve, fraîcheur — EST un signal d'achat, D82 mis à part le renommage ne change aucune
 * donnée). Les anciens libellés restent lisibles par grep dans ce commentaire, pas dans la barre.
 */
function accountsDetailTabs(): Block[] {
  return [
    {
      type: 'component',
      component: 'TabNav',
      props: {
        variant: 'underline',
        items: ['Synthèse', 'Personnes', 'Plan d’action', 'Signaux', 'Historique'],
      },
    },
  ]
}

/** Le sommaire d'ancres de RUX-32 : les anciens onglets absorbés, atteints depuis l'`aside` de leur onglet porteur. */
function anchorSummary(title: string, anchors: readonly string[]): Block[] {
  return [
    {
      type: 'component',
      component: 'SectionCard',
      props: { content: { title } },
      children: anchors.map(label => ({
        type: 'text' as const,
        text: label,
        style: 'body',
        color: 'text/accent',
      })),
    },
  ]
}

/**
 * /accounts/$id — le dossier d'un compte. Le plus dense de l'app : sept
 * SECTIONS (D8, #2115) qui absorbent quatorze anciens onglets — décision
 * révisée par RUX-32/Q2 (Louis 25/09/2026, `docs/revue-ux.md` §6) : la BARRE
 * visible ne montre plus que CINQ onglets stables (Synthèse · Personnes ·
 * Plan d'action · Signaux · Historique), les deux qui restent (Périmètres,
 * Écosystème & accès) devenant des blocs ancrés. Écrit pour être lu, pas
 * effacé : les sept frames Figma restent (lisibilité), D8 ne porte plus que
 * leur ANATOMIE interne, pas leur nombre dans la navigation.
 *
 * Lu dans : `apps/web/src/routes/accounts/$id.tsx` → `AccountDetailPage.tsx`
 * → `AccountDetailPageContent.tsx` → `AccountDetail.tsx` (hero, verdict,
 * bannières, bande de contexte, barre de sections) → `AccountDetailTabsBar.tsx`
 * (les sept sections, réorganisées en cinq onglets — RUX-32). Chaque section se rend comme un FRAME séparé
 * (`app/accounts-detail-<section>`, ce fichier) plutôt qu'un slot de plus sur
 * la même page : le gabarit `detail` n'a qu'un seul slot `primary`, et sept
 * sections dans un seul frame auraient été illisibles côte à côte dans Figma.
 * La maquette « Synthèse » (ce frame) montre l'entête et la barre d'onglets
 * communs aux sept ; les six autres frames les répètent, comme
 * `settings-profile-*` le fait déjà pour les pages de réglages.
 *
 * Textes : `apps/web/src/i18n/locales/fr/accounts.json` (tabs, tabSections,
 * hero, moreActions, notFound), `accountDetail.json` (dossierRead.axis,
 * verdictSummaryLabel, worthTitle).
 */
export const accountsDetailPage: PageSpec = {
  id: 'app/accounts-detail',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        children: [
          { type: 'component', component: 'EntityAvatar', props: { size: 'lg', content: { name: 'AF' } } },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              { type: 'text', text: 'ATOS FRANCE', style: 'title' },
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Secteur — Services numériques', style: 'caption', color: 'text/secondary' },
                  { type: 'text', text: 'SIREN 123 456 789', style: 'caption', color: 'text/accent' },
                ],
              },
              {
                type: 'component',
                component: 'FilterChips',
                props: { size: 'sm', items: ['Grand compte', 'Client actif'] },
              },
            ],
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'success', content: { label: 'Analyse : Terminé' } },
          },
        ],
      },
    ],
    actions: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Actualiser l’analyse' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Brief' } },
          },
          {
            type: 'component',
            component: 'DropdownMenu',
            props: {
              content: { trigger: 'Plus d’actions' },
              items: [
                'Aperçu PDF',
                'Télécharger PDF',
                'Relancer',
                'Créer une cible',
                'Archiver',
                'Détacher',
                'Supprimer',
              ],
            },
          },
        ],
      },
    ],
    summary: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        radius: 'lg',
        stroke: 'border/default',
        fill: 'surface/1',
        padding: '3',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { value: '7', label: 'Verdict' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'primary', content: { label: 'À prioriser' } } },
          {
            type: 'text',
            text: 'Compte à fort potentiel, adéquation de l’offre confirmée sur deux signaux récents.',
            style: 'body',
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: { title: 'Aucun collègue dessus', description: 'Tu es seul·e sur ce dossier pour l’instant.' },
        },
      },
    ],
    tabs: [
      ...accountsDetailTabs(),
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Vue d’ensemble', 'Score'] },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce compte mérite-t-il ton temps ?' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Adéquation de l’offre', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Potentiel commercial', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Fraîcheur actuelle', value: '—' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Accessibilité', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Capacité d’achat externe', value: '—' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Concurrence', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Qualité des preuves', value: '—' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'default',
          size: 'sm',
          content: { description: 'Cette analyse est antérieure à la lecture en sept axes.' },
        },
      },
      {
        type: 'placeholder',
        kind: 'graph',
        label: 'Organigramme (si le compte en porte un) — onglet d’arrivée conditionnel',
        height: 'md',
      },
    ],
    aside: anchorSummary('Dans cet onglet', ['Périmètres — couverture décisionnelle et zones blanches']),
  },
  states: {
    loading: [{ type: 'component', component: 'BrailleLoader', props: { variant: 'grid-searching' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’onglet d’arrivée n’est pas toujours « Vue d’ensemble » : un compte qui porte un organigramme réel (65,8 % de la base au 09/09/2026) atterrit directement sur Organigramme — jamais sur un état vide qui réclamerait un crédit par défaut.',
      source: 'apps/web/src/features/accounts/view/AccountDetail.tsx:58',
    },
    {
      kind: 'decision',
      text: 'Quatre bandes (notifications, contexte, collaboration, recherche du dossier) tiennent sur UNE ligne qui passe en `nowrap` dès 1024 px plutôt que quatre lignes pleine largeur empilées — mesuré en production, chacune tronque plutôt que de forcer le retour à la ligne.',
      source: 'apps/web/src/features/accounts/view/AccountDetail.tsx:243',
    },
    {
      kind: 'ecart',
      text: 'Le chargement du dossier utilise un loader animé (`BrailleLoader`) hors du catalogue de composants — non représentable fidèlement en maquette, remplacé ici par `Spinner`.',
      source: 'apps/web/src/features/accounts/view/account-detail/states/AccountDetailLoading.tsx:6',
    },
    {
      kind: 'decision',
      text: 'Responsive : le hero empile son identité et ses actions en colonne jusqu’à 1024 px puis passe en ligne (`lg:flex-row`) — même carte, densité identique du mobile à 1920. La barre de sections devient un menu déroulant (`SelectField`) sous 768 px au lieu des cinq onglets soulignés (RUX-32) ; la sous-barre de pastilles défile horizontalement dans son propre conteneur (`overflow-x-auto`) à toutes les largeurs, jamais la page entière. Sous 1280, l’`aside` (sommaire d’ancres) passe SOUS `primary`, comme le prévoit le gabarit `detail` (§3.2).',
      source: 'apps/web/src/features/accounts/view/account-detail/components/AccountDetailHero.tsx:107',
    },
    {
      kind: 'ecart',
      text: 'Aucun débordement horizontal ni `100vh` trouvés dans le hero, la bande de contexte ou la barre de sections — RAS sur ce point à 360/390/768/1024/1280/1440/1920.',
      source: 'apps/web/src/features/accounts/view/account-detail/components/AccountDetailTabsBar.tsx:298',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 (`docs/revue-ux.md` §4 et §6, arbitrage Louis 25/09/2026) : le dossier de compte passe de sept sections (D8, #2115) à CINQ onglets stables — Synthèse · Personnes · Plan d’action · Signaux · Historique. Périmètres (ex-2ᵉ onglet) devient un bloc ANCRÉ sous Synthèse, atteint depuis le sommaire d’ancres de l’`aside` ; Écosystème & accès devient un bloc ancré sous Personnes ; Opportunités est renommée Signaux (même contenu — une piste détectée EST un signal). Les sept frames Figma restent séparés (lisibilité), seule la barre d’onglets visible en haut change : cinq entrées, pas sept.',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}

/**
 * Section « Périmètres » — `TabCoverage.tsx`. La carte de couverture
 * décisionnelle (familles × niveaux) et les zones blanches priorisées.
 */
export const accountsDetailPerimetresPage: PageSpec = {
  id: 'app/accounts-detail-perimetres',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Périmètres',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Couverture décisionnelle', description: 'Sur les familles et niveaux ciblés.' } },
        children: [
          {
            type: 'component',
            component: 'Progress',
            props: { variant: 'default', size: 'md', content: { value: '72' } },
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Contacts engagés', value: '14 sur 18 visés' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Entités couvertes', value: '3 sur 5 — Direction Technique, DSI Groupe, Achats' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Rôles couverts', value: '4 sur 7 — manque Juridique, Sécurité IT' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Confiance donnée', value: '68 sur 100' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Champions identifiés', value: '2' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Carte de couverture — familles × niveaux' },
          table: {
            columns: ['Famille', 'Direction', 'Manager', 'Opérationnel'],
            rows: [
              ['Direction générale', 'Couvert', 'Couvert', 'Non prioritaire'],
              ['DSI', 'Couvert', 'Zone blanche', 'Couvert'],
              ['Achats', 'Zone blanche', 'Zone blanche', 'Non prioritaire'],
              ['Juridique', 'Zone blanche', 'Non prioritaire', 'Non prioritaire'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Zones blanches prioritaires' },
          table: {
            columns: ['Famille', 'Niveau', 'Priorité', 'Piste suggérée'],
            rows: [
              ['Achats', 'Direction', 'Priorité 1', 'Directeur des Achats Groupe'],
              ['Juridique', 'Manager', 'Priorité 2', 'Responsable Juridique Contrats'],
              ['Sécurité IT', 'Opérationnel', 'Priorité 3', 'RSSI Adjoint'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'default',
          size: 'sm',
          content: {
            title: 'Familles observées par la mémoire marché',
            description:
              'Sécurité IT, Juridique — des rôles observés ailleurs dans l’écosystème, hors calcul de couverture.',
          },
        },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un axe non mesuré (« rôles couverts » sans numérateur, par exemple) est NOMMÉ, jamais absorbé dans un « 0 sur N » : « X sur N » suppose que X a été calculé (GA-18/19).',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabCoverage.tsx:285',
    },
    {
      kind: 'decision',
      text: 'Une famille SUPPORT (non ciblée) n’apparaît dans la matrice que si elle est effectivement couverte — jamais comme une zone blanche à ouvrir (#2308.45).',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabCoverage.tsx:135',
    },
    {
      kind: 'decision',
      text: 'Les familles de rôles observées par la mémoire marché n’entrent dans AUCUN calcul de couverture — une troisième nature de preuve, distincte des contacts propres au dossier, repliée par défaut.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabCoverage.tsx:540',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 : « Périmètres » n’est plus un onglet de premier niveau — c’est un bloc ANCRÉ sous l’onglet « Synthèse », atteint depuis son sommaire d’ancres (`aside`). Ce frame reste séparé dans Figma pour rester lisible ; la barre visible en haut montre les cinq onglets stables, pas ce nom.',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}

/**
 * Onglet « Signaux » (RUX-32/Q2 : ex-« Opportunités ») — `tabs/opportunities/QualificationLeadsQueue.tsx`.
 * La file des pistes à qualifier avant qu’elles ne deviennent des besoins : une piste détectée EST un
 * signal d’achat, le renommage aligne le libellé sur ce que le contenu montre déjà.
 */
export const accountsDetailOpportunitesPage: PageSpec = {
  id: 'app/accounts-detail-opportunites',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Signaux',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'text',
        text: 'Une piste n’est pas encore une opportunité qualifiée : ce que Laura a détecté, d’où ça vient, et la vérification suivante.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Actives (5)', 'En veille (2)', 'Écartées (3)'] },
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Pistes à qualifier' },
          table: {
            columns: ['Piste', 'Preuve', 'Détectée le', 'Action suggérée'],
            rows: [
              [
                'Migration ERP SAP S/4HANA annoncée sur le site carrières',
                'Offre d’emploi',
                '12/03/2026',
                'Qualifier maintenant',
              ],
              [
                'Levée de fonds de 8 M€ pour accélérer la roadmap data',
                'Communiqué de presse',
                '28/02/2026',
                'Créer un besoin',
              ],
              [
                'Recrutement d’un directeur de la transformation digitale',
                'Publication LinkedIn',
                '05/01/2026',
                'Analyser le compte',
              ],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Pourquoi ce rang ?' } },
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { value: '74', label: 'Rang sur 100' } },
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Adéquation de l’offre', value: 'Mesurée — SAP figure au catalogue' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Fraîcheur du signal', value: 'Moins de 30 jours' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Présence d’un contact', value: 'Non mesuré — aucun contact DSI enrichi' } },
              },
            ],
          },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Convertir en opportunité' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Mettre en veille' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Écarter' } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Aucune probabilité de closing : le rang est un score DÉCOMPOSÉ sur des axes nommés, et un axe non évaluable sort du dénominateur en étant nommé — jamais une chance de closing.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/opportunities/QualificationLeadsQueue.tsx:40',
    },
    {
      kind: 'decision',
      text: 'L’écartement d’une piste exige un motif obligatoire, parmi sept motifs nommés — « écartée sans raison » ne se relit pas dans six mois.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/opportunities/QualificationLeadsQueue.tsx:510',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 : « Opportunités » devient « Signaux », l’un des cinq onglets stables — aucun contenu ne change, seul le libellé s’aligne sur ce que la file montre (une piste détectée, sa preuve, sa fraîcheur).',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}

/**
 * Section « Personnes » — `TabContacts.tsx`. L’entonnoir de contacts, le
 * chemin prioritaire, et la liste groupée par entité.
 */
export const accountsDetailPersonnesPage: PageSpec = {
  id: 'app/accounts-detail-personnes',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Personnes',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'text',
        text: '57 contacts détectés → 41 vérifiés → 23 pertinents → 14 enrichis chez Atos France.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Par entité', 'Par organigramme'] },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Chemin prioritaire', description: 'L’ordre d’approche recommandé.' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: '1. Camille Roussel — DSI Groupe', value: 'Décideur final' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: '2. Karim Belaïd — Directeur des Achats', value: 'Valide le budget' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: '3. Élodie Faure — Transformation digitale', value: 'Sponsor probable' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Contacts par entité' },
          table: {
            columns: ['Nom', 'Fonction', 'Entité', 'Niveau', 'Email'],
            rows: [
              ['Camille Roussel', 'DSI Groupe', 'Direction Technique', 'N-1', 'Vérifié'],
              ['Karim Belaïd', 'Directeur des Achats', 'Direction Achats', 'N-1', 'Non vérifié'],
              ['Élodie Faure', 'Resp. Transformation Digitale', 'Direction Générale', 'N-2', 'Vérifié'],
            ],
          },
        },
      },
    ],
    aside: anchorSummary('Dans cet onglet', ['Écosystème & accès — verrou d’entrée, adressabilité, portes']),
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La barre d’actions de cet onglet (enrichir, importer un CSV) a été remontée dans l’en-tête de la section Personnes plutôt que dupliquée en haut de cet onglet — depuis que la section empile l’organigramme au-dessus, elle serait à plus de trois écrans de défilement.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabContacts.tsx:222',
    },
    {
      kind: 'decision',
      text: 'Le niveau L0-L4 d’un contact n’existe QUE sur le graphe d’organigramme, jamais recalculé sur `Contact` — un dossier sans graphe rend un filtre « Niveau » sans aucune option, jamais un niveau deviné.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabContacts.tsx:155',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 : « Écosystème & accès » n’est plus un onglet de premier niveau — c’est un bloc ANCRÉ sous « Personnes » (le verrou d’entrée et l’adressabilité parlent des mêmes personnes), atteint depuis le sommaire d’ancres.',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}

/**
 * Section « Écosystème & accès » — `TabAccess.tsx`. Le verrou d’entrée, la
 * barrière d’achat, l’adressabilité en cinq axes, et les sept portes.
 */
export const accountsDetailEcosystemeAccesPage: PageSpec = {
  id: 'app/accounts-detail-ecosysteme-acces',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Écosystème & accès',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Accès' } },
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'primary', content: { label: 'Rang 2 — via partenaire' } },
          },
          {
            type: 'text',
            text: 'Sopra Steria détient le cadre historique ; un accès passe aujourd’hui par une sous-traitance ou une introduction relationnelle.',
            style: 'caption',
            color: 'text/secondary',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Barrière d’achat' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Centralisation des achats', value: '+2,4' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Cycle de décision', value: '+1,1' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Historique fournisseurs', value: '-0,8' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Maturité digitale', value: '-1,6' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Procédure formalisée', value: 'Non mesuré' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Adressabilité' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Verrou', value: '3,2 points' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Proportion adressable', value: '2,5 points' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Chemin', value: 'Non mesuré — aucune observation de la mémoire marché' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Relation', value: '1,8 point — un chemin existe dans ton équipe' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Coût d’accès', value: '1 200 € déclarés par le commercial' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Les sept portes d’entrée' },
          table: {
            columns: ['Mode', 'Faisabilité'],
            rows: [
              ['Référence directe', 'Faisable'],
              ['Direct hors panel', 'Faisable'],
              ['Filiale ou BU', 'Faisable'],
              ['Sous-traitance rang 2', 'Faisable'],
              ['Portage ou marketplace', 'Bloquée'],
              ['Cotraitance', 'Faisable'],
              ['Introduction relationnelle', 'Faisable'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Densité d’écosystème' } },
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'outline', content: { label: 'ESN observées autour de ce compte' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Voir dans Partenaires' } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le coût d’accès se déclare, il ne s’estime JAMAIS (D60) — une moyenne de marché appliquée à un cas particulier serait un chiffre inventé, et c’est sur ce chiffre qu’on négocie.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:804',
    },
    {
      kind: 'decision',
      text: 'Un axe d’adressabilité non mesurable est NOMMÉ avec sa raison, jamais absorbé dans le score — le dénominateur ne compte que les axes effectivement mesurés.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:471',
    },
    {
      kind: 'decision',
      text: 'La liste des ESN en place vit dans l’onglet Partenaires, pas ici : deux listes de la même chose sur deux onglets donneraient deux vérités.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:111',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 : « Écosystème & accès » n’est plus un onglet de premier niveau — c’est un bloc ANCRÉ sous « Personnes », atteint depuis son sommaire d’ancres (`aside`).',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}

/**
 * Section « Plan d’action » — `TabPlan.tsx`. Les six sections nommées du
 * plan vivant, ses prochains mouvements, et le tableau des actions.
 */
export const accountsDetailPlanActionPage: PageSpec = {
  id: 'app/accounts-detail-plan-action',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Plan d’action',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'component',
        component: 'Badge',
        props: { variant: 'success', content: { label: 'Plan généré le 14/01/2026 — à jour' } },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Prochains mouvements' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Relancer Camille Roussel (DSI)', value: 'Avant le 30/09/2026' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Si pas de réponse', value: 'Solliciter Karim Belaïd (Achats)' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Plan d’action' },
          table: {
            columns: ['Semaine', 'Action', 'Statut', 'Échéance'],
            rows: [
              ['Semaine 1', 'Envoyer la synthèse de cadrage à Karim Belaïd', 'À faire', '02/10/2026'],
              ['Semaine 2', 'Organiser un atelier découverte avec la DSI', 'Planifié', '09/10/2026'],
              ['Semaine 3', 'Présenter le chiffrage à la Direction Achats', 'À faire', '16/10/2026'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Angles d’attaque' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Réduction des coûts d’exploitation cloud', value: 'Retenu' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Sécurisation de la migration SAP', value: 'Retenu' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Formation des équipes internes', value: 'Écarté — hors périmètre ESN' } },
              },
            ],
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Résumé de l’attaque' } },
        children: [
          {
            type: 'text',
            text: 'Deux angles retenus, trois actions ouvertes, prochaine échéance le 02/10/2026.',
            style: 'caption',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Livrables du dossier' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Dossier de conquête', value: 'PDF prêt' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Présentation client', value: 'PDF prêt' } },
              },
            ],
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un plan est un objet VIVANT (tome 5 §37) : le badge de fraîcheur s’affiche MÊME quand le plan est périmé — le masquer ferait croire qu’il n’y en a pas, et l’utilisateur en redemanderait un sans savoir qu’il en avait déjà un.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabPlan.tsx:34',
    },
    {
      kind: 'decision',
      text: 'Le plan ouvre sur ses sections nommées dans un ORDRE FIXE : le commercial sait par quoi commencer, et ce qui manque le DIT au lieu de disparaître.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabPlan.tsx:68',
    },
    {
      kind: 'decision',
      text: 'Le corps du plan (angles, préparation du rendez-vous, chronologie) et le rail latéral (résumé, livrables) suivent ce qui se LIT longuement d’un côté et ce qui se consulte d’un coup d’œil de l’autre — jamais un partage esthétique.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabPlan.tsx:50',
    },
  ],
}

/**
 * Section « Historique & preuves » — `TabProofs.tsx`. Missions livrées,
 * preuves capitalisées, témoignages et retours terrain.
 */
export const accountsDetailHistoriquePreuvesPage: PageSpec = {
  id: 'app/accounts-detail-historique-preuves',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/$id.tsx',
  title: 'Dossier compte — Historique',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: accountsDetailHeader(),
    tabs: accountsDetailTabs(),
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Missions livrées' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Mission', 'Statut', 'Début', 'Fin'],
                rows: [
                  ['Refonte du SI RH', 'Terminée', '03/2024', '11/2024'],
                  ['Migration Cloud Azure', 'Terminée', '01/2025', '06/2025'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Preuves capitalisées' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Preuve', 'Force', 'Portée', 'Technologies'],
                rows: [
                  [
                    'Réduction de 30 % du temps de traitement paie',
                    'Forte',
                    'Citation autorisée',
                    'SAP SuccessFactors',
                  ],
                  ['Migration réalisée sans interruption de service', 'Moyenne', 'Usage interne', 'Azure, Terraform'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Témoignages clients' } },
        children: [
          {
            type: 'text',
            text: '« Une équipe réactive et rigoureuse sur un planning serré. » — Élodie Faure, Directrice Transformation Digitale (citation publiable)',
            style: 'body',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Retours terrain' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Mission', 'Ce qui a marché', 'Recueilli le'],
                rows: [['Migration Cloud Azure', 'Astreinte 24/7 appréciée par la DSI', '15/07/2025']],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'En attente de retour' },
          table: {
            columns: ['Mission', 'Terminée le'],
            rows: [['Audit cybersécurité filiale Sud', '20/08/2026']],
          },
        },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Compte introuvable', description: 'Le compte est introuvable' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Quatre blocs tenus séparés : ce qu’on a LIVRÉ (des faits), ce qu’on peut MONTRER (des preuves relues), ce qui ATTEND d’être recueilli (des missions finies sans retour), et ce qu’un client a ACCEPTÉ de dire.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabProofs.tsx:87',
    },
    {
      kind: 'decision',
      text: 'La portée d’une preuve (interne / citation autorisée) est TOUJOURS affichée, et jamais « citation interdite » : personne n’a refusé, personne n’a vérifié — ce n’est pas la même chose.',
      source: 'apps/web/src/features/accounts/view/account-detail/tabs/TabProofs.tsx:241',
    },
    {
      kind: 'decision',
      text: 'RUX-32/Q2 : « Historique & preuves » devient « Historique », l’un des cinq onglets stables — le libellé raccourcit, le contenu (faits, preuves, à recueillir, cité) ne change pas.',
      source: 'packages/figma-sync/docs/revue-ux.md:879',
    },
  ],
}
