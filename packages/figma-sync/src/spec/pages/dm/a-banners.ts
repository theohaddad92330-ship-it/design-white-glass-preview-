import type { PageSpec } from '../../types'

/**
 * `/banners` — bandeaux/annonces programmables, bilingues FR/EN, affichés en
 * haut de l'app et/ou du site public : création, et liste live/programmé/expiré
 * avec bascule et suppression.
 *
 * Lu dans : `src/app/banners/page.tsx` → `_components/banner-form.tsx` (création
 * et édition) et `_components/banner-card.tsx` (une ligne : statut, actions).
 */
export const bannersPage: PageSpec = {
  id: 'dm/banners',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/banners/page.tsx',
  title: 'Bandeaux / Annonces',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Bandeaux / Annonces', style: 'title' },
      {
        type: 'text',
        text: 'Bandeaux persistants en haut d’écran (application + site public) : annonces, maintenance, offres. Programmables, bilingues FR/EN, activables/désactivables.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Nouveau bandeau' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '4',
            children: [
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Type', placeholder: 'Annonce' },
                  items: ['Annonce', 'Maintenance', 'Offre / promo'],
                },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Sévérité', placeholder: 'Info' },
                  items: ['Info', 'Succès', 'Attention', 'Critique'],
                },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Portée', placeholder: 'Application' },
                  items: ['Application', 'Site public', 'Les deux'],
                },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Audience', placeholder: 'Tout le monde' },
                  items: ['Tout le monde', 'Connectés'],
                },
              },
            ],
          },
          { type: 'component', component: 'Textarea', props: { content: { label: 'Message (FR)' } } },
          { type: 'component', component: 'Textarea', props: { content: { label: 'Message (EN)' } } },
          { type: 'component', component: 'Switch', props: { checked: 'on', content: { label: 'Actif' } } },
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Créer' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: {},
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'live' } } },
              { type: 'text', text: 'Bandeau exemple — message affiché aux utilisateurs.', style: 'body' },
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                children: [
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'sm', content: { label: 'Désactiver' } },
                  },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'sm', content: { label: 'Modifier' } },
                  },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'destructive', size: 'sm', content: { label: 'Supprimer' } },
                  },
                ],
              },
            ],
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
          content: { title: 'Aucun bandeau', description: 'Crée le premier ci-dessus.' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Impossible de joindre l’endpoint admin de l’API',
            description: 'Vérifie API_BASE_URL et INTERNAL_API_SECRET.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Une suppression demande une confirmation navigateur (`window.confirm`) — le seul garde-fou avant un `DELETE` définitif, pas de `ConfirmationDialog` du catalogue ici.',
      source: 'apps/dashboard-manager/src/app/banners/_components/banner-card.tsx:76',
    },
    {
      kind: 'decision',
      text: 'Statut dérivé (live / programmé / expiré) affiché en badge coloré à partir des dates, jamais stocké tel quel — un bandeau créé « actif » avec une date future apparaît « programmé », pas « live ».',
      source: 'apps/dashboard-manager/src/lib/banners.ts:1',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 les colonnes secondaires de la liste (portée, audience) se replient dans le corps de la carte plutôt que de rester en tête ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le formulaire de création et la liste passeraient côte à côte (maître-détail) plutôt que d’étirer les cartes.',
      source: 'apps/dashboard-manager/src/app/banners/page.tsx:50',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920 rien ne change, le formulaire reste empilé au-dessus de la liste comme à 1280 — pas de maître-détail mesuré aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
