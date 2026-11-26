import type { PageSpec } from '../../types'

/**
 * /accounts/marches/$zoneId — la fiche d'une zone de marché.
 *
 * ⚠️ GA-288 : le fichier porte un underscore final sur le segment parent (`marches_.$zoneId.tsx`) — sans lui,
 * l'URL matcherait mais rendrait la LISTE du parent à la place de la fiche.
 *
 * Lu dans : `apps/web/src/routes/accounts/marches_.$zoneId.tsx` → `MarketZoneScreen.tsx`. Textes : `marketBrief.json`.
 */
export const accountsMarchesDetailPage: PageSpec = {
  id: 'app/accounts-marches-detail',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/marches_.$zoneId.tsx',
  title: 'Marché local — zone',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Marché local — Zone exemple', style: 'title' }],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Prix du marché' } },
        children: [{ type: 'text', text: 'Grille de prix de la zone.', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Clients de la zone' } },
        children: [{ type: 'text', text: 'Clients connus de la zone.', style: 'body', color: 'text/secondary' }],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Cette zone n’a pas pu être lue.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une zone sans fiche (ou une fiche invalide) le dit dans un bandeau nommé plutôt que d’afficher des sections vides.',
      source: 'apps/web/src/features/market-brief/view/MarketZoneScreen.tsx:81',
    },
  ],
}
