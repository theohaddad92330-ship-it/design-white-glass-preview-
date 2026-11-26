import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * 404 — toute route sous une locale qui ne correspond à aucune page réelle
 * (`apps/website/src/app/[locale]/[...rest]/page.tsx`) appelle `notFound()`
 * et rend l'écran `apps/website/src/app/[locale]/not-found.tsx`. Une seule
 * section centrée. Textes FR : `apps/website/messages/fr/common.json` (clé
 * `notFound`).
 */

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  align: 'center',
  padding: '16',
  children: [
    { type: 'text', text: '404', style: 'display' },
    { type: 'text', text: "Cette page n'existe pas.", style: 'title' },
    {
      type: 'text',
      text: 'Le lien est peut-être erroné ou la page a été déplacée. Revenez à l’accueil pour repartir du bon pied.',
      style: 'body',
      color: 'text/secondary',
    },
    { type: 'component', component: 'Button', props: { variant: 'default', content: { label: "Retour à l'accueil" } } },
  ],
}

export const notFoundPage: PageSpec = {
  id: 'site/not-found',
  surface: 'site',
  domain: '404',
  route: 'apps/website/src/app/[locale]/not-found.tsx',
  title: 'Page introuvable',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'La section reste centrée et à une seule colonne à toutes les largeurs ; sur très grand écran (≥1920 px), seul le halo de fond s’étire, jamais le bloc de texte (`max-w-lg`).',
      'apps/website/src/app/not-found.tsx:1',
    ),
    {
      kind: 'ecart',
      text: 'La section 404 localisée est dimensionnée en `min-h-[70vh]`, comme le repli global (`app/not-found.tsx:13`, `minHeight: 100vh`) — jamais en `dvh` : sur mobile, la barre d’adresse qui apparaît/disparaît fait varier la hauteur réelle du viewport et peut décentrer verticalement le bloc « 404 » (GA-30, « dvh jamais vh »).',
      source: 'apps/website/src/app/not-found.tsx:13',
    },
  ],
}
