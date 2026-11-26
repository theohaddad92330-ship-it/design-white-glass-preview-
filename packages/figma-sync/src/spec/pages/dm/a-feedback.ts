import type { PageSpec } from '../../types'

/**
 * `/feedback` — retours bêta : ce qui a été remonté (page, contexte, capture,
 * corrélation) et ce qui en a été fait. L'état vient des issues GitHub — fermer
 * ou répondre ici agit sur l'issue, pas sur une copie.
 *
 * Lu dans : `src/app/feedback/page.tsx` → `_components/feedback-card.tsx`
 * (capture à la demande, réponse publiée sur l'issue), `feedback-ecran-filter.tsx`.
 */
export const feedbackPage: PageSpec = {
  id: 'dm/feedback',
  surface: 'dm',
  domain: 'qualite',
  route: 'apps/dashboard-manager/src/app/feedback/page.tsx',
  title: 'Retours bêta',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Retours bêta', style: 'title' },
      {
        type: 'text',
        text: 'Ce qui a été remonté (page, contexte, capture, corrélation) et ce qui en a été fait. L’état vient des issues GitHub : fermer ou répondre ici agit sur l’issue, pas sur une copie.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      { type: 'component', component: 'Tabs', props: { items: ['À traiter (12)', 'Traités (48)', 'Tous (60)'] } },
      { type: 'component', component: 'TabNav', props: { variant: 'pill', items: ['Par date', 'Par écran'] } },
    ],
    filters: [{ type: 'component', component: 'FilterBar', props: { items: ['Tous les écrans'] } }],
    primary: [
      {
        type: 'text',
        text: 'Délai de première réponse — médiane : trop peu de retours répondus (3 sur 5 requis)',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            justify: 'between',
            children: [
              { type: 'text', text: 'Bug', style: 'caption' },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'en attente' } },
              },
            ],
          },
          { type: 'text', text: 'Le bouton « Exporter » ne répond pas sur Safari.', style: 'body' },
          {
            type: 'text',
            text: '••••@exemple.test · /clients · build 2026.09.24',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Textarea',
            props: { content: { placeholder: 'Répondre au retour (publié sur l’issue)' } },
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun retour dans cette vue' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger les retours' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Mesuré en production le 07/09/2026 : le filtre actif était illisible — `color: rgb(93,77,224)` sur `background: rgb(93,77,224)`, contraste 1,00:1 — sur le filtre PAR DÉFAUT, donc le tout premier écran vu par quiconque ouvre cette page. Corrigé depuis (inactif = `ghost`, actif = `.btn` plein, AA). La maquette montre l’état corrigé.',
      source: 'apps/dashboard-manager/src/app/feedback/page.tsx:89',
    },
    {
      kind: 'decision',
      text: 'Un retour SANS issue (intégration éteinte au moment du signalement) reste « à traiter » — il n’a été traité nulle part ; quand l’état des issues est illisible, l’écran montre tout plutôt que de classer au hasard.',
      source: 'apps/dashboard-manager/src/app/feedback/page.tsx:239',
    },
    {
      kind: 'decision',
      text: '« Trop peu de retours » n’est pas un chiffre déguisé : sous le seuil minimal, une médiane est la moyenne de deux valeurs qui bouge de moitié à chaque nouvelle réponse et se lirait pourtant comme un délai typique — l’écran nomme le seuil plutôt que d’afficher une médiane trompeuse.',
      source: 'apps/dashboard-manager/src/app/feedback/page.tsx:212',
    },
    {
      kind: 'decision',
      text: 'La capture d’écran est chargée à la DEMANDE (ouverture du `<details>`), jamais au chargement de la liste : mesuré en production, la liste rendait 32,6 Mo de captures base64 pour l’ouvrir. « Absente » (pas de capture) et « erreur » (capture illisible) sont deux états distincts, jamais confondus.',
      source: 'apps/dashboard-manager/src/app/feedback/_components/feedback-card.tsx:48',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 les cartes de retour gardent leur pleine largeur (colonne unique, pas de tableau à colonnes) ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) la liste passerait à deux colonnes de cartes plutôt que d’étirer chaque carte en largeur.',
      source: 'apps/dashboard-manager/src/app/feedback/page.tsx:159',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920, `.wrap` plafonne simplement à 1600 px — la liste reste sur une seule colonne, pas de bascule à deux colonnes mesurée aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
  ],
}
