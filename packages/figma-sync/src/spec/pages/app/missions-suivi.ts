import type { PageSpec } from '../../types'

/**
 * /missions/suivi — « Suivi, facturation & automatisations » : la grande
 * table qui manquait (D-22-2, levée par Louis le 31/08/2026), les trois
 * colonnes du milieu ne recalculent RIEN et disent quand elles n'ont pas
 * l'information.
 *
 * Lu dans : `apps/web/src/routes/missions/suivi.tsx` →
 * `MissionTrackingPage.tsx` (entête, cinq tuiles, automatisations, table,
 * dérive, activité récente, rentabilité). Textes de
 * `apps/web/src/i18n/locales/fr/missionTracking.json`.
 */
export const missionsSuiviPage: PageSpec = {
  id: 'app/missions-suivi',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/suivi.tsx',
  title: 'Suivi, facturation & automatisations',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Ton suivi opérationnel', style: 'title' },
      {
        type: 'text',
        text: 'Voici ce qui nécessite une action pour sécuriser tes missions et ton cash.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Missions actives', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'CRA à valider', value: '—' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Prêt à facturer', value: '—' } } },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Paiements en retard', value: '—' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Marge commerciale', value: 'Montant réservé — demande l’accès financier' } },
          },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Gérer les automatisations' } },
      },
      {
        type: 'component',
        component: 'DropdownMenu',
        props: {
          content: { trigger: 'Colonnes' },
          items: ['Mission', 'Consultant', 'Client', 'Période', 'CRA', 'Facturation', 'Paiement', 'Prochaine action'],
        },
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher une mission, un client, un consultant…' } },
          },
          { type: 'component', component: 'TabNav', props: { variant: 'pill', items: ['À traiter', 'Tout le suivi'] } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Mission',
              'Consultant',
              'Client',
              'Période',
              'CRA',
              'Facturation',
              'Paiement',
              'Prochaine action',
            ],
            rows: [
              [
                'Mission exemple 1',
                'Personne d’affecté',
                'Compte exemple 1',
                'aucune date n’a été saisie sur cette mission',
                'À valider',
                'Bloqué',
                'En retard',
                'Aucune action planifiée',
              ],
            ],
          },
        },
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Missions qui dérapent',
            description:
              'Une mission n’est signalée qu’à partir de plusieurs signaux, sur au moins deux mois. Un mois d’écart n’est pas une dérive.',
          },
        },
      },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Activité récente' } },
            children: [
              {
                type: 'component',
                component: 'EmptyState',
                props: { size: 'sm', content: { title: 'Rien à montrer pour l’instant.' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Rentabilité des missions' } },
            children: [{ type: 'component', component: 'Tabs', props: { items: ['Mois', 'Trimestre', 'Année'] } }],
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
            title: 'Rien à traiter',
            description:
              'Aucune mission n’attend de relevé, de facture, de paiement ni d’action ouverte. « Tout le suivi » montre le portefeuille complet.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Le suivi des missions n’a pas pu être chargé',
            description: 'Ton portefeuille est toujours là — c’est la lecture qui a échoué.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'RUX-18 (`docs/revue-ux.md` §4) : l’état d’erreur portait le TITRE de l’état vide (« Aucune mission active pour l’instant. ») — une panne se lisait comme un portefeuille vide, la pire erreur possible pour la confiance d’un commercial. Corrigé : le titre nomme ce qui n’a pas pu être LU, jamais ce qui manque.',
      source: 'apps/web/src/features/mission-tracking/view/MissionTrackingPage.tsx:125',
    },
    {
      kind: 'ecart',
      text: 'L’état d’erreur réutilise le TITRE de l’état vide (« Aucune mission active pour l’instant. ») avec pour seule description « Une erreur est survenue » — exactement la confusion que la doctrine du produit interdit ailleurs (« un échec de lecture ne se rend jamais comme “aucune mission” »).',
      source: 'apps/web/src/features/mission-tracking/view/MissionTrackingPage.tsx:125',
    },
    {
      kind: 'decision',
      text: 'Par défaut la table s’ouvre sur « À traiter », pas sur le portefeuille entier : l’écran se repositionne sur ce qui bloque plutôt que de doubler la liste de missions actives déjà servie par /missions.',
      source: 'apps/web/src/features/mission-tracking/view/MissionTrackingPage.tsx:49',
    },
    {
      kind: 'decision',
      text: 'Les garde-fous d’automatisation ÉTEINTS se calculent sur la file « À traiter », jamais sur la vue courante : un manque ne doit ni disparaître au clic d’une tuile, ni gonfler quand on regarde tout le portefeuille.',
      source: 'apps/web/src/features/mission-tracking/view/MissionTrackingPage.tsx:72',
    },
    {
      kind: 'decision',
      text: 'Responsive : les cinq tuiles passent de 1 colonne sous 768 px à 2 (tablette) puis 5 à partir de 1024 px (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`) ; Activité récente et Rentabilité passent de 1 colonne à 2 à partir de 1024 px (`grid-cols-1 lg:grid-cols-2`). Au-delà de 1920 (2560/3440) : aucune sixième tuile ni troisième panneau — la table et les deux panneaux du bas s’étirent sans rien gagner de plus.',
      source: 'apps/web/src/features/mission-tracking/view/MissionTrackingTiles.tsx:82',
    },
  ],
}
