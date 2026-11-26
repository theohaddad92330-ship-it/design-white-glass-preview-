import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /produit/onboarding — l'entonnoir d'onboarding par COHORTE MENSUELLE
 * D'ESPACES (jamais par personne) : la part qui a franchi chaque étape, et le
 * délai jusqu'à la première valeur. Masque les petites cohortes ET dit
 * pourquoi (anonymat, `COHORT_MIN_SPACES`).
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/onboarding/page.tsx` →
 * `_components/cohorts-table.tsx`.
 */
export const dmProduitOnboardingPage: PageSpec = {
  id: 'dm/produit-onboarding',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/onboarding/page.tsx',
  title: 'Entonnoir d’onboarding',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Entonnoir d’onboarding', style: 'title' },
      {
        type: 'text',
        text: 'Pour chaque cohorte mensuelle d’espaces, la part qui a franchi chaque étape du parcours et le délai jusqu’à la première valeur — jamais une métrique par personne.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [kpiGrid(2, [kpiTile('Espaces suivis', '—'), kpiTile('Cohortes', '—', { period: 'dont — masquée(s)' })])],
    primary: [
      sectionCard('Cohortes', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: [
                'Cohorte',
                'Espaces',
                'Onboarding démarré',
                'Intégration connectée',
                'Première analyse lancée',
                'Première action validée',
                'Deuxième session',
                'Actif à J30',
                'Onboarding terminé',
                'Délai médian · 1ʳᵉ valeur',
              ],
              rows: [['2026-08', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
            },
          },
        },
      ]),
      sectionCard('Cohortes masquées', [
        {
          type: 'text',
          text: 'Sous le seuil d’espaces, une part sur deux ou trois espaces désignerait ses membres : nommées ici sans être affichées.',
          style: 'caption',
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
          content: {
            title: 'Aucun espace client dans la base',
            description: 'Les espaces de démonstration sont exclus du calcul.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de lire l’entonnoir' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Trop tôt » n’est jamais 0 % : la cohorte n’a pas eu le temps matériel d’atteindre l’étape (délai de grâce). « Non instrumentée » est un autre cas : aucun espace, sur aucune cohorte, n’a jamais franchi l’étape — attendre ne rendra jamais ce zéro vrai.',
      source: 'apps/dashboard-manager/src/app/produit/onboarding/page.tsx:25',
    },
    {
      kind: 'decision',
      text: 'Les colonnes d’étapes ne sont ni ordonnées ni cumulatives : chaque colonne mesure une part indépendante — un espace peut apparaître dans « Deuxième session » sans apparaître dans « Première action validée ».',
      source: 'apps/dashboard-manager/src/app/produit/onboarding/page.tsx:138',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/produit/onboarding/page.tsx:75'),
  ],
}
