import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, sectionCard } from './_shared'

/**
 * /produit/laura-non-compris — les demandes que Laura n'a pas su router,
 * telles que le produit a le droit de les lire : le texte est déjà masqué en
 * amont par le moteur IA, l'API retient tout groupe sous le plancher de
 * sessions distinctes (GA-267). L'écran dit ce qui est retenu, et pourquoi.
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/laura-non-compris/page.tsx`.
 */
export const dmProduitLauraNonComprisPage: PageSpec = {
  id: 'dm/produit-laura-non-compris',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/laura-non-compris/page.tsx',
  title: 'Laura — demandes non comprises',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Laura — demandes non comprises', style: 'title' },
      {
        type: 'text',
        text: 'Aucun espace, aucune personne : la trace n’en porte pas la colonne. Ce que Laura n’a pas su router, groupé et masqué en amont.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      kpiGrid(3, [
        kpiTile('Traces sur la fenêtre', '—', { period: '— j' }),
        kpiTile('Demandes publiées', '—'),
        kpiTile('Retenues sous le plancher', '—'),
      ]),
    ],
    primary: [
      sectionCard('Demandes assez répétées pour être lues', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Demande (masquée)', 'Occurrences distinctes', 'Pourquoi', 'Écrans', 'Langues'],
              rows: [['[texte masqué]', '—', '—', '—', '—']],
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
          content: { title: 'Aucune demande n’atteint le plancher de publication' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire les demandes non comprises' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’écran ne masque rien ni n’agrège rien lui-même : le moteur IA masque le texte en amont, l’API retient tout groupe sous le plancher de sessions distinctes. L’écran ajoute une phrase : ce qui est retenu, et pourquoi.',
      source: 'apps/dashboard-manager/src/app/produit/laura-non-compris/page.tsx:21',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    {
      kind: 'ecart',
      text: 'La rangée de KPI porte `className="kpis"`, mais `globals.css` ne définit aucune règle `.kpis` : à aucune largeur (1280 à 3440) les trois tuiles ne forment une grille — elles s’empilent en flux normal, sans grille ni colonne à perdre ou à gagner.',
      source: 'apps/dashboard-manager/src/app/produit/laura-non-compris/page.tsx:59',
    },
  ],
}
