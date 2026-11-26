import type { PageSpec } from '../../types'

/**
 * /discover/lots — analyser une LISTE d'entreprises en un geste (#2293.2-4) :
 * coller des noms ou des SIREN, prévisualiser (entités résolues, ambiguïtés,
 * doublons, déjà analysées, analyses neuves, coût EXACT, limite,
 * parallélisme), puis UN clic lance le lot. La version « lot » du lanceur
 * `/search` — même doctrine (rien ne part ni n'est débité avant confirmation),
 * en masse plutôt qu'à l'unité.
 *
 * Lu dans : `apps/web/src/routes/discover/lots/index.tsx` →
 * `NewAnalysisBatch.tsx` (textarea, prévisualisation, lancement, lots
 * récents). Textes : `apps/web/src/i18n/locales/fr/discover.json`
 * (`batches.*`).
 */
export const discoverLotsPage: PageSpec = {
  id: 'app/discover-lots',
  surface: 'app',
  domain: 'discover',
  route: 'apps/web/src/routes/discover/lots/index.tsx',
  title: 'Analyser une liste d’entreprises',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Analyser une liste d’entreprises', style: 'title' },
      {
        type: 'text',
        text: 'Colle des noms ou des SIREN (un par ligne). Rien n’est lancé ni débité avant ton clic sur « Lancer le lot ».',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    progress: [
      {
        type: 'component',
        component: 'Textarea',
        props: { content: { label: 'Entreprises à analyser', placeholder: 'BPCE\nEiffage\nEngie\n552120222' } },
      },
      {
        type: 'text',
        text: '2 entreprise(s) au-delà de la limite de 50 par lot : elles ne sont pas incluses.',
        style: 'caption',
        color: 'soft/danger/text',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Prévisualiser' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Avant de lancer' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Entreprises identifiées', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'À confirmer (nom ambigu)', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Doublons retirés', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Déjà analysées — rouvertes sans débit', value: '—' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Analyses neuves', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Coût total', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Limite du lot', value: '50 entreprises' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Exécutions en parallèle', value: '—' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Durée', value: 'Non annoncée : aucune durée n’est mesurée à l’avance' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Entreprise', 'SIREN', 'État'],
            rows: [
              ['Entreprise exemple 1', '—', 'Identifiée'],
              ['Entreprise exemple 2', '—', 'À confirmer'],
            ],
          },
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'text',
            text: 'Solde insuffisant : — crédit(s) pour — annoncé(s).',
            style: 'caption',
            color: 'soft/danger/text',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Recharger des crédits' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Lots récents' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: '12/09/2026 14:32', value: '12 entreprise(s) · Terminé' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: '10/09/2026 09:05', value: '4 entreprise(s) · Terminé avec des échecs' } },
              },
            ],
          },
        ],
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'center',
        justify: 'between',
        children: [
          {
            type: 'text',
            text: 'Rien n’est lancé ni débité avant ton clic.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'lg', content: { label: 'Lancer le lot' } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'La prévisualisation n’a pas pu être calculée.',
            description: 'Rien n’a été lancé.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Gabarit `wizard`, comme `/search` : coller la liste → prévisualiser → lancer est le même parcours en étapes, en masse plutôt qu’à l’unité — un sous-job par entreprise, jamais un second formulaire qui diverge du lanceur à l’unité.',
      source: 'apps/web/src/features/analysis-batches/view/NewAnalysisBatch.tsx:23',
    },
    {
      kind: 'decision',
      text: 'Une ligne de la prévisualisation à zéro (résolues, à confirmer, doublons, déjà analysées) ne s’affiche pas — on n’affiche pas ce qu’on n’a pas — sauf le coût, la limite, le parallélisme et la durée, qui se disent toujours.',
      source: 'apps/web/src/features/analysis-batches/view/NewAnalysisBatch.tsx:181',
    },
    {
      kind: 'decision',
      text: 'Les entités déjà résolues par la prévisualisation repartent avec leur SIREN au lancement : le serveur ne refait pas la recherche au registre, et le lot lancé est exactement celui que la prévisualisation a montré.',
      source: 'apps/web/src/features/analysis-batches/view/NewAnalysisBatch.tsx:56',
    },
    {
      kind: 'decision',
      text: 'Responsive (320→3440), priorité bureau puis mobile : composeur, prévisualisation et lots récents restent mono-colonne à toutes les largeurs — un lancement de lot est un geste séquentiel, jamais deux blocs côte à côte qui inviteraient à sauter la prévisualisation. Le pied (rappel + « Lancer le lot ») reste visible en bas de viewport sur mobile. Au-delà de 1920, la page GAGNE de l’air autour de la colonne (marges), jamais une colonne étirée : le texte et le tableau de prévisualisation restent à leur largeur de lecture.',
      source: 'apps/web/src/features/analysis-batches/view/NewAnalysisBatch.tsx:67',
    },
  ],
}
