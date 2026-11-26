import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /laura-site — le tunnel du chatbot public de BellumAI (visiteurs → widget →
 * conversation → qualification → RDV pris), en lecture seule.
 *
 * Lu dans : `apps/dashboard-manager/src/app/laura-site/page.tsx` →
 * `_components/funnel.logic.ts` pour les phrases. Agrégé par ÉTAPE, jamais
 * par personne (doctrine `c64_analytique_produit`).
 */
export const dmLauraSitePage: PageSpec = {
  id: 'dm/laura-site',
  surface: 'dm',
  domain: 'laura-site',
  route: 'apps/dashboard-manager/src/app/laura-site/page.tsx',
  title: 'Laura · Site',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Laura · Site', style: 'title' },
      {
        type: 'text',
        text: 'Le tunnel du chatbot public — visiteurs, widget ouvert, conversation, qualification, rendez-vous pris — avec le taux de passage entre chaque étape et la médiane du score. Écran de pilotage : tout y est agrégé par étape, jamais par personne.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'end',
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Période', value: '30d' } } },
          { type: 'component', component: 'Button', props: { variant: 'secondary', content: { label: 'Actualiser' } } },
        ],
      },
    ],
    kpis: [
      kpiGrid(4, [
        kpiTile('Conversations', '—'),
        kpiTile('Handoff humain', '—'),
        kpiTile('Refus', '—'),
        kpiTile('Abandon', '—'),
      ]),
    ],
    primary: [
      {
        type: 'text',
        text: 'Les largeurs comparent les étapes ENTRE ELLES — le dénominateur de la barre est la somme des étapes dessinées, pas la population du site.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'SegmentBar',
        props: {
          state: 'unmeasured',
          items: ['Widget vu', 'Ouvert', 'Première réponse', 'Démo cliquée', 'Calendly cliqué', 'RDV tenu'],
        },
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Étape',
              'Occurrences',
              'Sessions distinctes',
              'Taux depuis l’étape précédente',
              'Part de l’entrée',
            ],
            rows: [
              ['Widget vu', '—', '—', '—', '—'],
              ['Ouvert', '—', '—', '—', '—'],
              ['Première réponse', '—', '—', '—', '—'],
            ],
          },
        },
      },
      sectionCard('Médiane du score de qualification', [{ type: 'text', text: '—', style: 'heading' }]),
    ],
    secondary: [
      sectionCard('Autres jalons observés', [
        {
          type: 'text',
          text: 'Le clic vers la démo (hors chemin du rendez-vous) et le rendez-vous TENU (que le site ne peut pas observer).',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Jalon', 'Compte', 'Non mesuré'],
              rows: [
                ['Démo cliquée', '—', '—'],
                ['RDV tenu', '—', 'non observable'],
              ],
            },
          },
        },
      ]),
      sectionCard('Essais A/B', [
        {
          type: 'text',
          text: 'Aucun « gagnant » n’est annoncé — seul le meilleur taux OBSERVÉ, et seulement au-dessus du seuil de lecture.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Variante', 'Expositions', 'Succès', 'Taux', 'Manquant'],
              rows: [['a', '—', '—', '—', '—']],
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
            title: 'La mesure n’est pas branchée',
            description:
              'PLAUSIBLE_API_KEY ou PLAUSIBLE_SITE_ID ne sont pas définies côté API — tout ci-dessous est « non mesuré », pas « zéro ».',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          size: 'md',
          content: { title: 'Erreur', description: 'Message technique renvoyé tel quel.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Page serveur asynchrone sans `loading.tsx` ni `Suspense` : rien ne s’affiche pendant le chargement (pas de Skeleton visible aujourd’hui, contrairement à l’état « loading » de la maquette).',
      source: 'apps/dashboard-manager/src/app/laura-site/page.tsx:64',
    },
    {
      kind: 'decision',
      text: 'Écran de lecture seule : aucun taux n’est calculé ici, l’API les rend déjà agrégés par étape — jamais par personne (doctrine `c64_analytique_produit`).',
      source: 'apps/dashboard-manager/src/app/laura-site/page.tsx:30',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/laura-site/page.tsx:229'),
  ],
}
