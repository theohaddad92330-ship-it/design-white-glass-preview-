import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, sectionCard } from './_shared'

/**
 * /produit/raisonnement — le raisonnement commercial de Laura mesuré sur le
 * trafic réel (#3223.4) : dix taux calculés depuis ce que chaque tour garde
 * déjà, la route des sources couche par couche, et la liste NOMMÉE de ce que
 * la trace ne porte pas encore. Même squelette que `laura-non-compris`.
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/raisonnement/page.tsx`.
 */
export const dmProduitRaisonnementPage: PageSpec = {
  id: 'dm/produit-raisonnement',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/raisonnement/page.tsx',
  title: 'Raisonnement de Laura',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Raisonnement de Laura', style: 'title' },
      {
        type: 'text',
        text: 'Dix taux calculés sur le trafic réel à partir de ce que chaque tour garde déjà : sources consultées, outils appelés, budget de tour.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Aucun espace, aucune personne, aucun texte de message — des faits de produit agrégés. Un taux sans assez de tours se dit « non mesuré », jamais zéro.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [kpiGrid(1, [kpiTile('Tours lus', '—', { period: '— j' })])],
    primary: [
      sectionCard('Taux du raisonnement', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Mesure', 'Valeur', 'Échantillon'],
              rows: [['—', 'non mesuré', '—']],
            },
          },
        },
      ]),
      sectionCard('Sources consultées, couche par couche', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Couche', 'Valeur', 'Échantillon'],
              rows: [['—', 'non mesuré', '—']],
            },
          },
        },
      ]),
      sectionCard('Pas encore mesuré', [
        {
          type: 'text',
          text: 'Ces mesures dépendent d’un jugement commercial que la trace du tour ne porte pas encore. Elles sont nommées, avec leur raison, jamais à zéro.',
          style: 'body',
          color: 'text/secondary',
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
          content: { title: 'Aucun tour lu sur la fenêtre' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire le raisonnement de Laura' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un taux sous le plancher d’échantillon s’affiche « non mesuré », jamais 0 ; les mesures que la trace ne porte pas sont listées avec leur raison plutôt que masquées.',
      source: 'apps/dashboard-manager/src/app/produit/raisonnement/page.tsx:8',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
  ],
}
