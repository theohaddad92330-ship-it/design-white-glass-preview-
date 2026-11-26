import type { PageSpec } from '../../types'

/**
 * /discover/radar — le radar par technologie de Découvrir (#4282.10, décision
 * Louis 19/10 n°16 ; route gardée par Louis le 20/10 comme exception à
 * « aucune page neuve »). Une technologie, la France entière : où placer un
 * consultant maintenant, quels comptes attaquer, avec la preuve. Les mêmes
 * comptes, dans le même ordre, que Laura.
 *
 * Lu dans : `apps/web/src/routes/discover/radar.tsx` →
 * `TechnologyRadarScreen.tsx` (liste fermée de technologies, saisie libre en
 * repli) → `TechnologyRadarView.tsx` (blocs du radar). Textes de
 * `apps/web/src/i18n/locales/fr/technologyRadar.json`.
 */
export const discoverRadarPage: PageSpec = {
  id: 'app/discover-radar',
  surface: 'app',
  domain: 'discover',
  route: 'apps/web/src/routes/discover/radar.tsx',
  title: 'Radar par technologie',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Radar par technologie', style: 'title' },
      {
        type: 'text',
        text: 'Une technologie, la France entière : où placer un consultant maintenant, quels comptes attaquer, avec la preuve. Les mêmes comptes, dans le même ordre, que Laura.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      { type: 'text', text: 'Technologies suivies', style: 'caption', color: 'text/secondary' },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'md', items: ['SAP', 'Salesforce', 'ServiceNow'] },
      },
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'md', content: { placeholder: 'Une autre technologie…' } },
      },
    ],
    primary: [
      {
        type: 'placeholder',
        kind: 'custom',
        label:
          'Blocs du radar : missions plaçables maintenant, comptes les plus chauds, routes de rang 2, besoins historiques, relais et prescripteurs, empreinte par compte, classement en trois poches — chaque ligne avec sa preuve et sa fraîcheur, et « Ce qui n’a pas pu être évalué » nommé',
        height: 'lg',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'text',
        text: 'Choisis une technologie pour afficher son radar.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'Le radar n’a pas pu être construit.', description: 'Réessaie dans un instant.' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La technologie vit dans l’URL (`?technology=`) : le lien que Laura rend rouvre le MÊME radar, mêmes comptes, même ordre. Un lien collé de travers rouvre l’écran vide, jamais cassé.',
      source: 'apps/web/src/routes/discover/radar.tsx:14',
    },
    {
      kind: 'decision',
      text: 'La liste fermée des technologies passe en premier, la saisie libre n’est qu’un repli. La collecte est mise en cache 30 jours côté IA : relancer la même technologie ne recollecte rien.',
      source: 'apps/web/src/features/technology-radar/view/TechnologyRadarScreen.tsx:20',
    },
  ],
}
