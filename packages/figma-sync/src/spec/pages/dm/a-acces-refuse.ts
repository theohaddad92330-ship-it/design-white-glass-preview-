import type { PageSpec } from '../../types'

/**
 * `/acces-refuse` — l'écran qu'on voit quand son rôle ne suffit pas (#1669).
 * Une phrase, pas une page blanche : nomme l'écran demandé si connu, dit à qui
 * demander, renvoie vers le cockpit de télémétrie IA (`/monitoring?view=cockpit`,
 * le lien permanent du rail latéral — pas le Cockpit business de `/`).
 *
 * Lu dans : `src/app/acces-refuse/page.tsx`.
 */
export const accesRefusePage: PageSpec = {
  id: 'dm/acces-refuse',
  surface: 'dm',
  domain: 'auth',
  route: 'apps/dashboard-manager/src/app/acces-refuse/page.tsx',
  title: 'Accès refusé',
  template: 'auth',
  viewports: ['desktop', 'mobile'],
  slots: {
    primary: [
      { type: 'text', text: 'Accès refusé', style: 'title' },
      {
        type: 'text',
        text: 'Cet écran est réservé au rôle « propriétaire ». Ton rôle te donne accès au reste de la console, en lecture comme en action — seule la trésorerie est fermée.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Écran demandé : facturation',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'Si tu dois y accéder, demande à un propriétaire de changer ton rôle dans la liste d’accès du back-office.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    footer: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Retour au cockpit' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Page indisponible', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le bouton « Retour au cockpit » pointe `/monitoring?view=cockpit` (télémétrie IA), jamais `/` (le Cockpit business #1646) : les deux cockpits coexistent, chacun à son URL, et cet écran ne redirige que vers celui qu’il fermait déjà.',
      source: 'apps/dashboard-manager/src/app/acces-refuse/page.tsx:29',
    },
    {
      kind: 'ecart',
      text: 'Page statique (pas d’appel réseau) : les états « chargement » et « erreur » qu’exige le gabarit `auth` n’ont pas de pendant réel à l’écran, ils sont projetés par contrat.',
      source: 'apps/dashboard-manager/src/app/acces-refuse/page.tsx:10',
    },
    {
      kind: 'decision',
      text: 'Responsive : carte de message centrée, plafonnée à 520 px (`.wrap--etroit`) à 1280 comme à 3440 — jamais étirée horizontalement. Rien à gagner au-delà de 1920 : un écran d’une seule phrase n’a pas besoin de plus de largeur.',
      source: 'apps/dashboard-manager/src/app/globals.css:950',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920 rien ne change, `.wrap--etroit` reste à 520 px comme à 1280 — cohérent ici (rien à gagner), mais ce n’est nulle part une décision explicite, seulement l’absence de toute règle large-écran.',
      source: 'apps/dashboard-manager/src/app/globals.css:950',
    },
  ],
}
