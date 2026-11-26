import type { PageSpec } from '../../types'

/**
 * /actions/sequences — le cockpit des séquences de prospection : canaux
 * branchés, délivrabilité, centre d'approbation, quatre compteurs qui
 * filtrent (jamais deux vérités), tableau des séquences par contact.
 *
 * Lu dans : `apps/web/src/routes/actions/sequences.tsx` →
 * `SequencesPage.tsx` (entête + créer, bandeau capacité messagerie, blocs
 * canaux/délivrabilité, centre d'approbation, KPI-filtres, filtre de
 * campagne, tableau). Textes de `apps/web/src/i18n/locales/fr/outreach.json`.
 */
export const actionsSequencesPage: PageSpec = {
  id: 'app/actions-sequences',
  surface: 'app',
  domain: 'actions',
  route: 'apps/web/src/routes/actions/sequences.tsx',
  title: 'Séquences',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes séquences de prospection, {{name}}', style: 'title' },
      {
        type: 'text',
        text: 'Planifie tes prises de contact et tes relances, puis vois qui attend un message, qui a répondu et ce qui est bloqué.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Créer une séquence' } },
      },
    ],
    intro: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            description:
              'Connecte ta messagerie pour que je puisse préparer tes envois. Sans elle, chaque message reste copiable à la main.',
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Canaux branchés' } },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Délivrabilité' } },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Centre d’approbation' } },
      },
    ],
    filters: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Séquences actives', value: '—' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'À faire aujourd’hui', value: '—' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Réponses reçues', value: '—' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Bloquées', value: '—' } },
          },
        ],
      },
      { type: 'component', component: 'FilterChips', props: { size: 'sm', items: ['Campagne exemple'] } },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Séquence', 'Contact', 'Compte', 'Prochaine étape', 'Progression', 'Échéance', 'Statut'],
            rows: [
              ['Relance après démo', 'Contact exemple 1', 'Compte exemple 1', 'E-mail 2/3', '—', '—', 'Active'],
              ['Prise de contact', 'Contact exemple 2', 'Compte exemple 2', 'Rappel', '—', '—', 'Bloquée'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Demander à Laura de préparer une cadence' } },
      },
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
            title: 'Tu n’as encore aucune séquence.',
            description:
              'Commence depuis tes contacts, importe une liste, ou demande à Laura de préparer ta première cadence.',
            action: 'Choisir des contacts',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Tu n’as encore aucune séquence.', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Pas de bouton « Créer une séquence » répété dans l’état vide : le bouton de l’entête reste la seule porte, l’état vide porte l’AUTRE geste (choisir des contacts, ou connecter la messagerie selon la cause).',
      source: 'apps/web/src/features/outreach/view/SequencesPage.tsx:270',
    },
    {
      kind: 'decision',
      text: 'Les quatre compteurs (actives, à faire, réponses, bloquées) et le filtre partagent la MÊME fonction `bucketCounts`/`filterByBucket` : un compteur ne peut jamais promettre un filtre qui compte différemment.',
      source: 'apps/web/src/features/outreach/view/SequencesPage.tsx:70',
    },
    {
      kind: 'decision',
      text: 'La fenêtre de création affiche le contexte de campagne mais ne l’impose pas : l’audience et le gabarit restent modifiables, et la création reste un geste par contact — Laura prépare, la personne envoie.',
      source: 'apps/web/src/features/outreach/view/SequencesPage.tsx:391',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 1024 px (`lg`), le tableau masque Compte et Prochaine étape ; sous 768 px (`md`) il masque en plus Progression et Échéance — Séquence, Contact et Statut restent seuls visibles sur mobile, dans un conteneur à défilement horizontal. Tablette (768-1194) et desktop (1195-1920) affichent les mêmes colonnes dès 1024 px. Au-delà de 1920 px (2560, 3440) : la fiche d’une séquence (ouverte par clic sur une ligne) reste un panneau latéral posé À CÔTÉ du tableau plutôt qu’au-dessus — c’est le gain, un maître-détail liste + fiche côte à côte, sans qu’aucune colonne du tableau ne s’étire au-delà de sa largeur de contenu.',
      source: 'apps/web/src/features/outreach/view/SequencesPage.tsx:354',
    },
  ],
}
