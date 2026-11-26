import type { PageSpec } from '../../types'
import { GAIN_MASTER_DETAIL, responsiveDecision, responsiveEcartTable } from './_shared'

/**
 * /users — l'annuaire des utilisateurs : un compte par ligne, avec son
 * espace, son état et sa dernière connexion. L'annuaire est OBLIGATOIRE (une
 * panne se DIT, un tableau vide se lirait « aucun utilisateur ») ; les états
 * d'authentification sont un ENRICHISSEMENT dont la panne dégrade sans casser
 * (« non lu », jamais « actif » deviné ni « jamais connecté » supposé).
 *
 * Lu dans : `apps/dashboard-manager/src/app/users/page.tsx` →
 * `_components/users-table.tsx`.
 */
export const dmUsersPage: PageSpec = {
  id: 'dm/users',
  surface: 'dm',
  domain: 'users',
  route: 'apps/dashboard-manager/src/app/users/page.tsx',
  title: 'Utilisateurs',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Utilisateurs', style: 'title' },
      {
        type: 'text',
        text: 'Un compte par ligne, avec son espace, son état et sa dernière connexion. Une dernière connexion illisible s’affiche « non lu » : ce n’est pas « jamais ».',
        style: 'body',
        color: 'text/secondary',
      },
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
            props: { size: 'sm', content: { placeholder: 'Rechercher par email ou nom…' } },
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
            columns: ['Nom', 'Email', 'Espace', 'Rôle', 'Offre', 'Créé', 'Dernière connexion', 'État', 'Actions'],
            rows: [['Compte exemple', '—', '—', '—', '—', '—', 'non lu', '—', '—']],
          },
        },
      },
      {
        type: 'text',
        text: '200 lignes affichées sur — : affine la recherche pour voir les autres. Les comptes portent sur les lignes affichées, pas sur la population entière.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun utilisateur' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Annuaire indisponible', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’annuaire est OBLIGATOIRE (sa panne se DIT, jamais un tableau vide) ; les états d’authentification sont un ENRICHISSEMENT dont la panne dégrade en « non lu » sans casser l’écran.',
      source: 'apps/dashboard-manager/src/app/users/page.tsx:20',
    },
    {
      kind: 'decision',
      text: 'Une liste tronquée (200 lignes max) le DIT explicitement sous le tableau — un plafond silencieux se lirait comme un total, et les comptes des pilules seraient lus comme ceux de la population entière.',
      source: 'apps/dashboard-manager/src/app/users/page.tsx:31',
    },
    responsiveDecision(GAIN_MASTER_DETAIL),
    responsiveEcartTable(),
  ],
}
