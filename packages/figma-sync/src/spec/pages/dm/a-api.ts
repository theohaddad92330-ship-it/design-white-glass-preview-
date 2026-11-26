import type { PageSpec } from '../../types'

/**
 * `/api` — le testeur de requêtes admin (#1667.3) : appelle
 * `GET /internal/telemetry` (proxifié côté serveur, le secret ne part jamais
 * au navigateur), et sous le testeur, le volume par endpoint et le p95 lus
 * `apiTelemetrySnapshot` — EN MÉMOIRE du process Next.js depuis son dernier
 * redéploiement, jamais une comptabilité agrégée.
 *
 * Lu dans : `src/app/api/page.tsx`. ⚠️ Écran écrit en HTML/CSS inline, hors du
 * système de design (`packages/ui`) — voir `uxNotes`.
 */
export const apiConsolePage: PageSpec = {
  id: 'dm/api',
  surface: 'dm',
  domain: 'system',
  route: 'apps/dashboard-manager/src/app/api/page.tsx',
  title: 'API · tester des requêtes',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'API · tester des requêtes', style: 'title' },
      {
        type: 'text',
        text: 'Appelle l’endpoint opérateur GET /internal/telemetry (proxifié côté serveur — le secret ne part jamais au navigateur).',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        align: 'end',
        children: [
          {
            type: 'component',
            component: 'Select',
            props: {
              size: 'sm',
              content: { label: 'Endpoint' },
              items: ['GET /internal/telemetry (liste)', 'GET /internal/telemetry/:id (détail)'],
            },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'limit', value: '50' } } },
          { type: 'component', component: 'Button', props: { content: { label: 'Envoyer' } } },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Résultat' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: '200 OK' } } },
              { type: 'text', text: '124 ms · /internal/telemetry', style: 'caption', color: 'text/muted' },
            ],
          },
          { type: 'placeholder', kind: 'custom', label: 'Corps JSON de la réponse (lecture seule)', height: 'md' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Volume par endpoint' } },
        children: [
          {
            type: 'text',
            text: 'Depuis le dernier redéploiement de cette instance, en mémoire — un ordre de grandeur lisible en direct, pas une comptabilité.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Méthode', 'Endpoint', 'Volume', 'p95', 'Erreurs'],
                rows: [['GET', '/internal/telemetry', '—', '—', '—']],
              },
            },
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
          content: {
            title: 'Aucun appel admin observé',
            description: 'Depuis le dernier redémarrage de cette instance.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Indisponible', description: 'La requête a échoué.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Tout l’écran est du HTML/CSS inline (`<main className="wrap">`, styles `style={{ … }}`) : aucun composant du système de design n’est réellement utilisé. La maquette cible ici le système de design — c’est le plus grand écart entre le code et cette page.',
      source: 'apps/dashboard-manager/src/app/api/page.tsx:92',
    },
    {
      kind: 'decision',
      text: 'La télémétrie par endpoint ne compte que les appels PASSÉS PAR CETTE INSTANCE depuis son dernier redéploiement — aucune donnée nominative, des identifiants réduits à `:id`. Ce n’est jamais présenté comme un total agrégé.',
      source: 'apps/dashboard-manager/src/app/api/page.tsx:17',
    },
  ],
}
