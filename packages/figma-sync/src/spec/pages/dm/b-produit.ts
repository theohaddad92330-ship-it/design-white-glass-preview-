import type { PageSpec } from '../../types'
import { GAIN_KPI_COLONNE, kpiGrid, kpiTile, responsiveDecision, responsiveEcartKpiGrid, sectionCard } from './_shared'

/**
 * /produit — le hub d'instrumentation produit : ce que le traceur mesure
 * vraiment, écran par écran, et ce qu'il ne mesure pas encore faute
 * d'émetteur câblé — jamais confondu avec « zéro cas ». Sept sections :
 * instrumentation, utilisation par écran (+ verdict), parcours, friction,
 * demande non couverte, croisement usage × demande, valeur, retours.
 *
 * Lu dans : `apps/dashboard-manager/src/app/produit/page.tsx` (733 lignes,
 * sept sous-composants).
 */
export const dmProduitPage: PageSpec = {
  id: 'dm/produit',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/produit/page.tsx',
  title: 'Produit — instrumentation et usage',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Produit — instrumentation et usage', style: 'title' },
      {
        type: 'text',
        text: 'Ce que le traceur produit mesure vraiment, écran par écran, et ce qu’il ne mesure pas encore faute d’émetteur câblé — jamais confondu avec « zéro cas ». L’unité d’analyse reste l’écran, jamais quelqu’un.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      kpiGrid(3, [
        kpiTile('Fenêtre couverte', '— j'),
        kpiTile('Écrans avec au moins une vue', '—'),
        kpiTile('Espaces distincts', '—'),
      ]),
    ],
    primary: [
      sectionCard('État de l’instrumentation', [
        { type: 'text', text: 'Les neuf natures d’événement, écrites au moins une fois ou non.', style: 'body' },
      ]),
      sectionCard('Utilisation par écran', [
        {
          type: 'text',
          text: 'Verdict par écran du catalogue produit : jamais ouvert, trop récent, non mesuré, ou une mesure réelle.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Écran', 'Vues', 'Verdict'], rows: [['/accounts', '—', '—']] } },
        },
      ]),
      sectionCard('Parcours', [
        {
          type: 'text',
          text: 'Sorties par écran — destination principale et part de fermeture pure.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Écran', 'Sorties', 'Sessions', 'Destination principale'],
              rows: [['—', '—', '—', '—']],
            },
          },
        },
        {
          type: 'text',
          text: 'Parcours les plus fréquents (3 écrans) — résidu « autres parcours » en dernier.',
          style: 'caption',
          color: 'text/muted',
        },
        { type: 'component', component: 'SegmentBar', props: { state: 'unmeasured', items: ['—'] } },
        {
          type: 'text',
          text: 'Parcours interrompus — action démarrée, jamais terminée ni abandonnée.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: {
            table: {
              columns: ['Action', 'Interrompues', 'Démarrées', 'Taux d’interruption'],
              rows: [['—', '—', '—', '—']],
            },
          },
        },
      ]),
      sectionCard('Friction', [
        {
          type: 'component',
          component: 'Table',
          props: {
            table: { columns: ['Écran', 'Répétition', 'Aller-retour', 'Erreur vue'], rows: [['—', '—', '—', '—']] },
          },
        },
      ]),
      sectionCard('Demande non couverte', [
        {
          type: 'text',
          text: 'Recherches sans résultat, jamais le texte cherché.',
          style: 'caption',
          color: 'text/muted',
        },
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Catégorie', 'Occurrences'], rows: [['—', '—']] } },
        },
      ]),
      sectionCard('Usage × demande', [
        {
          type: 'text',
          text: 'Ce qu’on a et que personne n’utilise, ce qu’on n’a pas et que tout le monde cherche.',
          style: 'caption',
          color: 'text/muted',
        },
      ]),
      sectionCard('Valeur', [
        {
          type: 'grid',
          columns: 3,
          gap: '4',
          children: [kpiTile('Premières questions', '—'), kpiTile('Utile', '—'), kpiTile('Brouillons repris', '—')],
        },
      ]),
      sectionCard('Retours utilisateurs par écran', [
        {
          type: 'component',
          component: 'Table',
          props: { table: { columns: ['Écran', 'Retours bêta'], rows: [['—', '—']] } },
        },
      ]),
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucune donnée produit sur la fenêtre' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Impossible de lire l’état de l’instrumentation',
            description: 'Les cinq routes internes ont échoué.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un écran sans émetteur câblé n’écrit pas « 0 cas » : il est nommé « pas encore instrumenté », et ce défaut d’émission ne rend jamais vrai un zéro sur les agrégats qui en dépendent plus bas dans la page.',
      source: 'apps/dashboard-manager/src/app/produit/page.tsx:226',
    },
    {
      kind: 'decision',
      text: 'Un écran absent du rapport de la fenêtre reçoit son propre verdict d’absence (jamais ouvert / trop récent / non mesuré) plutôt que de disparaître du catalogue produit connu.',
      source: 'apps/dashboard-manager/src/app/produit/page.tsx:334',
    },
    responsiveDecision(GAIN_KPI_COLONNE),
    responsiveEcartKpiGrid('apps/dashboard-manager/src/app/produit/page.tsx:311'),
  ],
}
