import type { PageSpec } from '../../types'

/**
 * /briefing — « Ma journée », le brief du matin. Pas de gating de palier :
 * c'est la première chose qu'un commercial ouvre, et elle ne coûte aucun
 * crédit.
 *
 * Lu dans : `apps/web/src/routes/briefing/index.tsx` → `BriefingPage.tsx`
 * (À faire maintenant, Ce qui a bougé, Agenda, Messagerie, Comptes qui ont
 * bougé, Alertes de Découvrir, Tâches, Sources utilisées, Ce qui bloque).
 * Textes : `apps/web/src/i18n/locales/fr/briefing.json` et `chains.json`.
 */
export const briefingPage: PageSpec = {
  id: 'app/briefing',
  surface: 'app',
  domain: 'briefing',
  route: 'apps/web/src/routes/briefing/index.tsx',
  title: 'Aujourd’hui',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Bonjour Louis.', style: 'title' },
      {
        type: 'text',
        text: 'Voilà ce qui a changé, ce qui est urgent et ce que Laura te recommande de faire ensuite.',
        style: 'body',
        color: 'text/secondary',
      },
      { type: 'text', text: 'Actualisé à 08:14', style: 'caption', color: 'text/muted' },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Actualiser' } },
      },
    ],
    kpis: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'À faire maintenant' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Action recommandée', value: '—' } },
              },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce qui a bougé depuis ta dernière visite' } },
        children: [{ type: 'text', text: 'Depuis le 24/09', style: 'caption', color: 'text/muted' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ton agenda' } },
        children: [
          { type: 'component', component: 'FilterChips', props: { size: 'sm', items: ['À préparer', 'Conflits'] } },
          { type: 'placeholder', kind: 'custom', label: 'Rendez-vous du jour, avec bouton Rejoindre', height: 'sm' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ta messagerie' } },
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Sans réponse', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Réponses favorables', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Non lus', value: '—' } } },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Comptes qui ont bougé' } },
        children: [
          {
            type: 'text',
            text: 'Aucun nouveau signal sur tes comptes suivis depuis 48 heures.',
            style: 'body',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Alertes de Découvrir' } },
        children: [
          { type: 'text', text: 'Aucun déclenchement depuis qu’on surveille.', style: 'body', color: 'text/muted' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce qui bloque' } },
        children: [{ type: 'text', text: 'Rien ne bloque dans tes parcours.', style: 'body', color: 'text/muted' }],
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Tes tâches' } },
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'En retard', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Pour aujourd’hui', value: '—' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter une tâche' } },
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Sources utilisées aujourd’hui' } },
        children: [
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Agenda', 'Messagerie', 'Découvrir'] },
          },
        ],
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
          content: { title: 'Ta journée est calme avec les sources actuellement lisibles.' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Spinner', props: {} }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger ton brief du jour.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« Aucune action à te proposer » se distingue de « ta journée est calme » : le premier dit que les sources ne sont pas toutes connectées, le second qu’elles le sont et qu’il n’y a réellement rien à faire — deux causes, jamais confondues sous un même silence.',
      source: 'apps/web/src/i18n/locales/fr/briefing.json:12',
    },
    {
      kind: 'decision',
      text: '« Le journal n’a pas répondu » est distingué de « rien n’a bougé » : une lecture en échec ne se lit jamais comme une mesure à zéro.',
      source: 'apps/web/src/i18n/locales/fr/briefing.json:128',
    },
    {
      kind: 'decision',
      text: 'Chaque bloc nomme ses SOURCES (agenda, messagerie, tâches) et se tait plutôt que d’agréger silencieusement des sources partiellement connectées — la bande « Sources utilisées aujourd’hui » les rend explicites en un seul endroit.',
      source: 'apps/web/src/features/briefing/view/SourcesStrip.tsx:187',
    },
    {
      kind: 'decision',
      text: 'Responsive : les sept sections (À faire, Ce qui a bougé, Agenda, Messagerie, Comptes, Alertes, Ce qui bloque) s’empilent en une colonne à toutes les largeurs — un brief du matin se lit de haut en bas, jamais en grille à balayer. Tâches et Sources passent en panneau latéral (`secondary`/`aside`) seulement à partir de 1280 px ; en dessous, ils suivent sous les sections principales. Au-delà de 1920, les panneaux gardent une largeur fixe et l’air se répartit sur les côtés plutôt que d’étirer le texte.',
      source: 'apps/web/src/features/briefing/view/BriefingPage.tsx:1',
    },
  ],
}
