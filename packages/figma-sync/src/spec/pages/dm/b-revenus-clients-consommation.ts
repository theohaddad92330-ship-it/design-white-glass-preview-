import type { PageSpec } from '../../types'
import { GAIN_MASTER_DETAIL, kpiGrid, kpiTile, responsiveDecision, responsiveEcartTable } from './_shared'

/**
 * /revenus/clients/consommation — les crédits par espace ET par utilisateur
 * (#4467). Les crédits sont implicites côté client (#4468) : cet écran est le
 * SEUL endroit où ils se voient. Il n'écrit rien — l'ajustement d'un solde
 * passe par la fiche du propriétaire.
 *
 * Lu dans : `apps/dashboard-manager/src/app/revenus/clients/consommation/page.tsx`
 * → `_components/consommation-tables.tsx`.
 */
export const dmRevenusClientsConsommationPage: PageSpec = {
  id: 'dm/revenus-clients-consommation',
  surface: 'dm',
  domain: 'revenus',
  route: 'apps/dashboard-manager/src/app/revenus/clients/consommation/page.tsx',
  title: 'Consommation',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Consommation', style: 'title' },
      {
        type: 'text',
        text: 'Les crédits ne s’affichent plus chez le client : cet écran est le seul endroit où ils se voient. Une consommation non mesurée s’écrit « — », jamais « 0 ».',
        style: 'body',
        color: 'text/secondary',
      },
      kpiGrid(3, [
        kpiTile('Espaces', '—', { period: 'tous' }),
        kpiTile('Espaces à solde épuisé', '—', { period: 'le frein doux est actif' }),
        kpiTile('Comptes concernés', '—', { period: 'membres de ces espaces' }),
      ]),
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un espace…' } },
          },
          { type: 'component', component: 'Button', props: { variant: 'secondary', content: { label: 'Rechercher' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Espace', 'Offre', 'Solde restant', 'Consommé (30 j)', 'Renouvellement', 'Membres', 'Solde'],
            rows: [['Espace exemple', '—', '—', '—', '—', '—', 'Ajuster']],
          },
        },
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Utilisateur', 'Espace', 'Consommé (30 j)', 'Solde du pool', 'Renouvellement', 'Solde'],
            rows: [['utilisateur@exemple.fr', 'Espace exemple', '—', '—', '—', 'Ajuster le pool']],
          },
        },
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun compte à solde épuisé.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Consommation indisponible', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les crédits sont implicites chez le client (#4468) : ni compteur, ni coût annoncé, ni solde sur la facturation. Cet écran est le seul endroit où la donnée se voit — le manager de l’ESN cliente ne la voit pas non plus.',
      source: 'apps/dashboard-manager/src/app/revenus/clients/consommation/page.tsx:7',
    },
    {
      kind: 'decision',
      text: 'Le solde est celui du POOL de l’espace, partagé : il n’existe pas de solde individuel. Ajuster un solde, c’est ajuster le pool, donc la fiche du propriétaire — l’écran n’écrit rien.',
      source: 'apps/dashboard-manager/src/app/revenus/clients/consommation/_components/consommation-tables.tsx:17',
    },
    {
      kind: 'decision',
      text: 'Une panne d’API se DIT : elle n’affiche jamais un tableau vide, qui se lirait « personne n’a rien consommé ».',
      source: 'apps/dashboard-manager/src/app/revenus/clients/consommation/page.tsx:34',
    },
    responsiveDecision(GAIN_MASTER_DETAIL),
    responsiveEcartTable(),
  ],
}
