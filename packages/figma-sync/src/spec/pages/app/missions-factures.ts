import type { PageSpec } from '../../types'

/**
 * /missions/factures — les factures, de la préparation au solde : quatre tuiles, états filtrables, tableau
 * des documents. Bellum PRÉPARE la pièce, il ne l'émet ni ne la comptabilise (le numéro légal et les avoirs
 * viennent de l'outil branché).
 *
 * Lu dans : `apps/web/src/routes/missions/factures.tsx` → `InvoicesPage.tsx`. Textes de
 * `apps/web/src/i18n/locales/fr/missions.json` (`invoices.*`).
 */
export const missionsFacturesPage: PageSpec = {
  id: 'app/missions-factures',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/factures.tsx',
  title: 'Factures',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Factures', style: 'title' },
      {
        type: 'text',
        text: 'Les factures, de la préparation au solde. Bellum prépare la pièce : il ne l’émet ni ne la comptabilise — le numéro légal et les avoirs viennent de l’outil branché.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Paramètres de facturation' } },
      },
    ],
    intro: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 1,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Brouillons', value: 'Préparés, jamais émis — hors créances' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Émis', value: 'Montant facturé, déclaré ou prouvé' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Reste à recevoir', value: 'Après règlements constatés' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Documents en litige', value: '—' } },
          },
        ],
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
            props: { size: 'sm', content: { placeholder: 'Rechercher un client, une mission, un numéro' } },
          },
          { type: 'component', component: 'Select', props: { size: 'sm', content: { placeholder: 'Tous' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['N°', 'Client', 'Mission', 'Période', 'Montant', 'Échéance', 'État / solde'],
            rows: [['Sans numéro', 'Compte exemple 1', 'Mission exemple 1', '—', '—', '—', 'Brouillon']],
          },
        },
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Voir les encaissements' } },
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
            title: 'Aucune facture préparée ni émise sur cette fenêtre.',
            description: 'Une pièce apparaît ici dès qu’une facture est préparée pour une mission.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les factures n’ont pas pu être chargées' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un brouillon n’a pas de numéro (« Sans numéro ») et reste HORS créances : « facturé » ne se gagne que sur preuve du connecteur de l’outil branché. Une pièce figée après émission ne se recalcule pas ; une correction passe par un avoir émis dans l’outil branché.',
      source: 'apps/web/src/features/missions/view/InvoicesPage.tsx:58',
    },
    {
      kind: 'decision',
      text: 'Un montant non mesuré s’écrit « montant non mesuré sur ces documents », jamais « 0 € » (GA-18/19) ; une ligne sans compte ni mission le dit au lieu de rester vide.',
      source: 'apps/web/src/features/missions/view/InvoicesPage.tsx:93',
    },
  ],
}
