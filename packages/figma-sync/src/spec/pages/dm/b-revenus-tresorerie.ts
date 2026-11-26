import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartTable, sectionCard } from './_shared'

/**
 * /revenus/tresorerie — le solde, le burn et le runway de BellumAI, saisis à
 * la main (aucune connexion bancaire n'existe). Écran RÉSERVÉ AU
 * PROPRIÉTAIRE : c'est le compte en banque de l'entreprise.
 *
 * Lu dans : `apps/dashboard-manager/src/app/revenus/tresorerie/page.tsx` →
 * `_components/treasury-form.tsx` (saisie), `treasury-months.tsx` (historique).
 */
export const dmRevenusTresoreriePage: PageSpec = {
  id: 'dm/revenus-tresorerie',
  surface: 'dm',
  domain: 'revenus',
  route: 'apps/dashboard-manager/src/app/revenus/tresorerie/page.tsx',
  title: 'Trésorerie',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Trésorerie', style: 'title' },
      {
        type: 'text',
        text: 'Le solde, les dépenses et les encaissements du mois, saisis à la main. Le burn et le runway en sont DÉRIVÉS — un solde inventé serait pire que rien.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      kpiGrid(4, [
        kpiTile('Solde bancaire', '—', { period: 'aucun mois saisi' }),
        kpiTile('Burn du mois', '—', { period: 'aucun mois saisi' }),
        kpiTile('Burn moyen', '—'),
        kpiTile('Runway', '—'),
      ]),
    ],
    primary: [
      sectionCard('Saisie du mois', [
        {
          type: 'grid',
          columns: 2,
          gap: '4',
          children: [
            { type: 'component', component: 'Input', props: { content: { label: 'Solde bancaire au 1er (€)' } } },
            { type: 'component', component: 'Input', props: { content: { label: 'Dépenses fixes (€)' } } },
            { type: 'component', component: 'Input', props: { content: { label: 'Dépenses variables (€)' } } },
            { type: 'component', component: 'Input', props: { content: { label: 'Encaissements du mois (€)' } } },
          ],
        },
        { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Enregistrer' } } },
      ]),
      sectionCard('Historique', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Mois', 'Solde au 1er', 'Fixes', 'Variables', 'Encaissements', 'Burn'],
              rows: [['—', '—', '—', '—', '—', '—']],
            },
          },
        },
      ]),
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
            title: 'Aucun mois saisi',
            description: 'Le burn et le runway resteront « non mesurés » tant qu’il n’y en a pas deux.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Chiffres indisponibles', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une panne d’API n’affiche jamais des zéros : un « 0 € » serait indiscernable d’une entreprise sans trésorerie. Chaque case absente affiche « — », et c’est cette colonne qui dit ce qu’il reste à saisir.',
      source: 'apps/dashboard-manager/src/app/revenus/tresorerie/page.tsx:49',
    },
    {
      kind: 'decision',
      text: 'Le bandeau MRR a déménagé sur `/revenus` (#1651) : cette page ne porte plus que ce qui n’a jamais été du MRR — solde bancaire, dépenses, encaissements.',
      source: 'apps/dashboard-manager/src/app/revenus/tresorerie/page.tsx:19',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartTable(),
  ],
}
