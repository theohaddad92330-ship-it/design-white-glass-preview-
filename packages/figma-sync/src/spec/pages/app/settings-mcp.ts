import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/mcp — Assistant IA (MCP). Lu dans
 * `apps/web/src/routes/settings/mcp.tsx` → `AiAssistantView.tsx` : connecter
 * BellumAI comme serveur MCP (URL + copier), le guide pas à pas (Claude
 * Desktop, Claude.ai, Cursor), des exemples de demandes, et les applications
 * autorisées. Textes de `i18n/locales/fr/settings.json` (`mcp.*`).
 */
export const settingsMcpPage: PageSpec = {
  id: 'app/settings-mcp',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/mcp.tsx',
  title: 'Assistant IA (MCP)',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Assistant IA (MCP)', style: 'title' },
      {
        type: 'text',
        text: 'Interroge BellumAI depuis ton propre assistant via le protocole MCP.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: {
              content: {
                title: 'Connecter BellumAI à ton assistant IA',
                description:
                  'Ajoute BellumAI comme serveur MCP à Claude Desktop, Claude.ai, Cursor ou tout client compatible.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'CopyField',
                props: { content: { label: 'URL du serveur MCP', value: '—' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SectionCard',
            props: { content: { title: 'Mise en place — pas à pas' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Claude Desktop' } },
              },
              { type: 'text', text: 'Claude.ai', style: 'label' },
              { type: 'text', text: 'Cursor', style: 'label' },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Exemples de demandes' } },
        children: [
          {
            type: 'text',
            text: '« Montre-moi mes comptes prioritaires dans BellumAI. »',
            style: 'body',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '« Analyse Thales et donne-moi les décideurs clés avec leur rôle. »',
            style: 'body',
            color: 'text/secondary',
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Applications autorisées' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', align: 'start', content: { title: 'Aucune application connectée pour l’instant.' } },
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
        props: { content: { title: 'Je n’ai pas pu charger cet écran.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'ecart',
      text: 'Une grille `xl:grid-cols-2` (≥1280 px) pour connecter/guide, mais rien au-delà de 1920 — même famille que l’écart largeur partagé, ici avec un point de rupture propre au composant.',
      source: 'apps/web/src/features/settings/view/AiAssistantView.tsx:322',
    },
  ],
}
