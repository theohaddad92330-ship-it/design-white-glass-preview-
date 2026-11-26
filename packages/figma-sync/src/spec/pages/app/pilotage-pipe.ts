import type { PageSpec } from '../../types'

/**
 * /pilotage/pipe — Pipe (L2). Le pipe natif de l’espace, jamais pondéré : le
 * mouvement du pipe sur la période (waterfall), les opportunités ouvertes en
 * édition en place (catégorie déclarée, date de signature prévue) avec leurs
 * signaux de risque et leurs totaux par catégorie, les résultats par commercial,
 * le pipeline du CRM connecté et l’entonnoir du positionnement au placé. Aucun
 * pourcentage de réussite n’est appliqué ; un montant absent est « Non mesuré ».
 *
 * Lu dans : `apps/web/src/routes/pilotage/pipe.tsx:15` (garde d’offre
 * `manager_cockpit`) → `features/pilotage/pipe/PipeScreen.tsx:29` (CA probable `:46`, waterfall
 * `:47`, inspection `:48`, par commercial `:49`, CRM `:54`, entonnoir `:56`).
 * Textes de `apps/web/src/i18n/locales/fr/pilotagePipe.json`.
 */
export const pilotagePipePage: PageSpec = {
  id: 'app/pilotage-pipe',
  surface: 'app',
  domain: 'pilotage',
  route: 'apps/web/src/routes/pilotage/pipe.tsx',
  title: 'Pipe',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Pipe', style: 'title' },
      {
        type: 'text',
        text: 'Le pipe natif de l’espace : les opportunités saisies par l’équipe et leurs montants. Tous les totaux sont non pondérés — aucun pourcentage de réussite n’y est appliqué.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'placeholder',
        kind: 'custom',
        label:
          'CA probable du trimestre : total par devise avec son intervalle, puis chaque affaire datée dans le trimestre avec sa probabilité calibrée et ses axes ; ce qui n’est pas chiffrable est compté à part, jamais lu « 0 € »',
        height: 'lg',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mouvement du pipe' } },
        children: [
          { type: 'text', text: 'Du 1er au 14 octobre', style: 'caption', color: 'text/muted' },
          {
            type: 'placeholder',
            kind: 'chart',
            label:
              'Waterfall — Ouverture · Entrées dans le pipe · Montants relevés · Montants baissés · Perdues · Signées · Sorties sans issue · Écart non expliqué · Clôture',
            height: 'md',
          },
          {
            type: 'text',
            text: '12 opportunités ouvertes à l’ouverture, 14 à la clôture. Montants saisis, non pondérés.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: '2 opportunités ouvertes sans montant : elles restent hors de ces barres.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Opportunités ouvertes' } },
        children: [
          {
            type: 'text',
            text: 'Édition en place : la catégorie que tu déclares et la date de signature prévue.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Compte · Opportunité', value: 'Montant · Stade · Propriétaire · Dans le stade' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Catégorie déclarée', value: 'Sélecteur (édition en place)' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Signature prévue', value: 'Non fixée' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Aucune activité depuis 21 j' } },
              },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Date prévue dépassée de 6 j' } },
              },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Montant baissé' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Totaux par catégorie déclarée — opportunités ouvertes, montants non pondérés (« Non mesuré » sans montant).',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Par commercial' } },
        children: [
          { type: 'text', text: 'Pipe natif de l’espace — hors CRM tiers.', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Pipe ouvert', value: '84 000 € — 5 opportunités' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Signé sur la période', value: 'Aucune signature sur la période' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Taux de gain',
                    value: '3 signées sur 5 clôturées (90 j glissants) — base trop petite pour un pourcentage',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Cycle de vente médian', value: '42 jours — médiane de 3 signées sur 90 j' },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Pipeline du CRM connecté' } },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Pipeline du CRM branché (panneau dédié)', height: 'sm' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Du positionnement au placé' } },
        children: [
          {
            type: 'text',
            text: 'Les CV partis chez un client, tous projets confondus.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'secondary', content: { label: 'Positionné · 8' } },
              },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'secondary', content: { label: 'Placé · 2' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Voir les positionnements' } },
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucune opportunité ouverte dans le pipe.',
            description: 'Chaque bloc dit son absence, jamais un zéro.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Cette lecture n’a pas pu être chargée.',
            description: 'Rien n’est perdu : c’est la lecture qui a échoué.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Tous les totaux sont non pondérés : la catégorie est une DÉCLARATION du commercial, sans pourcentage de réussite (Louis 14/10/2026, L2).',
      source: 'apps/web/src/features/pilotage/pipe/PipeScreen.tsx:25',
    },
    {
      kind: 'decision',
      text: 'Un montant absent se dit « Non mesuré » et l’opportunité reste hors des barres et des totaux, avec son compte nommé — jamais « 0 ».',
      source: 'apps/web/src/features/pilotage/pipe/PipeInspection.tsx:145',
    },
    {
      kind: 'decision',
      text: 'Un taux de gain sur une base trop petite n’est pas affiché en pourcentage : on donne le compte (signées sur clôturées) et on dit pourquoi.',
      source: 'apps/web/src/features/pilotage/pipe/PipeByOwner.tsx:65',
    },
    {
      kind: 'decision',
      text: 'Le CA probable vit ICI et nulle part ailleurs (GA-26, Louis 14/10/2026) : il a quitté `/projects`. La page monte le panneau existant (`ProbableQuarterPanel`), elle n’en écrit pas une seconde version.',
      source: 'apps/web/src/features/pilotage/pipe/PipeScreen.tsx:23',
    },
  ],
}
