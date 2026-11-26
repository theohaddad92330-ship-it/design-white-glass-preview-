import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /produit/adoption — l'adoption des FONCTIONS DU PALIER (celles qui
 * distinguent Growth d'Entreprise, `PLAN_FEATURE_KEYS`) : paie-t-on une
 * fonction dont on ne se sert pas ? Jamais les actions d'un écran, jamais les
 * écrans eux-mêmes — le catalogue est nommé, jamais un espace client.
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/adoption/page.tsx` →
 * `_components/adoption-table.tsx`.
 */
export const dmProduitAdoptionPage: PageSpec = {
  id: 'dm/produit-adoption',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/adoption/page.tsx',
  title: 'Adoption — les fonctions du palier',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Adoption — les fonctions du palier', style: 'title' },
      {
        type: 'text',
        text: 'La question commerciale derrière ce dossier : paie-t-on une fonction dont on ne se sert pas ? Chaque pourcentage porte son dénominateur : les espaces qui ont le DROIT à la fonction, jamais tous les espaces.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      kpiGrid(3, [
        kpiTile('Fonctions gatées par l’offre', '—'),
        kpiTile('Abonnements, tous paliers confondus', '—'),
        kpiTile('Fonctions sans espace éligible aujourd’hui', '—'),
      ]),
    ],
    primary: [
      sectionCard('Mesure d’usage : disponible pour N sur M fonctions', [
        {
          type: 'text',
          text: 'Chaque fonction sans signal encore mesurable est nommée avec sa raison — jamais fondue dans le total.',
          style: 'caption',
          color: 'text/secondary',
        },
      ]),
      sectionCard('Répartition des fonctions — les quatre seaux de l’issue, et le résidu', [
        {
          type: 'component',
          component: 'SegmentBar',
          props: {
            state: 'unmeasured',
            items: ['Adoptée (≥ 60 %)', 'Confidentielle (10-60 %)', 'Ignorée (< 10 %)', 'Morte (0, ≥ 60 j)', 'résidu'],
          },
        },
      ]),
      sectionCard('Le détail, fonction par fonction', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Fonction', 'Ouverte par', 'Espaces éligibles (dénominateur)', 'Adoption'],
              rows: [['Fonction exemple', 'Entreprise', '— sur — abonnements', 'Adoptée']],
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
        props: { size: 'md', align: 'center', content: { title: 'Aucune fonction gatée par l’offre' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire le catalogue des paliers ou la distribution des abonnements' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une « fonction » est une fonction GATÉE PAR L’OFFRE (celle qui distingue Growth d’Entreprise) — jamais « les actions d’un écran » ni « les écrans du produit » eux-mêmes.',
      source: 'apps/dashboard-manager/src/app/produit/adoption/page.tsx:25',
    },
    {
      kind: 'decision',
      text: 'Le résidu honnête (« pas encore mesurable », « aucun espace éligible ») se dessine EN DERNIER dans la barre segmentée — un fourre-tout en tête mangerait la lecture des quatre seaux réels.',
      source: 'apps/dashboard-manager/src/app/produit/adoption/page.tsx:51',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/produit/adoption/page.tsx:154'),
  ],
}
