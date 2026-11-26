import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /about — l'histoire, les principes, l'équipe. Cinq sections dans l'ordre
 * réel de `apps/website/src/app/[locale]/about/page.tsx:25-38` : Hero, Story,
 * Principles, Team, Cta. Textes FR : `apps/website/messages/fr/about.json`.
 */

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  align: 'center',
  padding: '10',
  children: [
    { type: 'text', text: 'À propos', style: 'label', color: 'text/accent' },
    { type: 'text', text: 'BellumAI a été créé par des Sales, pour des Sales en ESN.', style: 'display' },
    {
      type: 'text',
      text: 'BellumAI est né de frustrations quotidiennes : recherches chronophages, informations dispersées, comptes difficiles à cartographier.',
      style: 'body',
      color: 'text/secondary',
    },
    { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Créer mon compte' } } },
  ],
}

const story: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    [
      "Le problème n'était pas le manque de données.",
      "Nous avions déjà accès à une quantité massive d'informations. Le vrai défi était ailleurs : transformer l'information en décision.",
    ],
    [
      'Nous avons voulu construire le copilote qui nous manquait.',
      'Un copilote capable de comprendre nos comptes, prioriser les signaux et recommander la bonne action, au bon moment.',
    ],
  ].map(
    ([title, body]): Block => ({
      type: 'stack',
      direction: 'column',
      gap: '2',
      children: [
        { type: 'text', text: title, style: 'heading' },
        { type: 'text', text: body, style: 'body', color: 'text/secondary' },
      ],
    }),
  ),
}

const principles: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  padding: '10',
  children: [
    { type: 'text', text: 'Une technologie utile doit rester simple.', style: 'title' },
    {
      type: 'component',
      component: 'FilterChips',
      props: {
        size: 'md',
        items: [
          'Partir du terrain',
          "Prioriser avant d'enrichir",
          'Expliquer les scores',
          'Préserver le temps',
          'Rester transparent',
        ],
      },
    },
  ],
}

const team: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    { type: 'text', text: '04', style: 'label', color: 'text/accent' },
    { type: 'text', text: "L'équipe", style: 'label', color: 'text/accent' },
    { type: 'text', text: 'Les visages derrière BellumAI.', style: 'title' },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        ['CEO & Co-fondateur', 'Ancien Sales en ESN. Porte la vision produit et la relation clients.'],
        ['CTO & Co-fondateur', "Construit le moteur d'analyse et l'infrastructure derrière chaque dossier."],
        ['Head of Sales', 'Déploie BellumAI sur le terrain, au contact des équipes commerciales.'],
      ].map(
        ([role, blurb]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: role as string, description: blurb as string } },
          children: [{ type: 'component', component: 'Avatar', props: { content: { initials: '··' } } }],
        }),
      ),
    },
  ],
}

const cta: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '4',
    align: 'center',
    padding: '10',
    children: [
      { type: 'text', text: 'Rejoignez les ESN qui prospectent mieux.', style: 'title' },
      { type: 'text', text: 'Sans engagement, résiliable à tout moment.', style: 'body', color: 'text/secondary' },
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Créer mon compte' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Essayer la démo' } },
          },
        ],
      },
    ],
  },
]

export const aboutPage: PageSpec = {
  id: 'site/about',
  surface: 'site',
  domain: 'a-propos',
  route: 'apps/website/src/app/[locale]/about/page.tsx',
  title: 'À propos',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [story, principles, team],
    cta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'La grille de l’équipe passe de 3 à 1 colonne sous 1024 px ; les deux paragraphes de « Story » restent en une seule colonne à toutes les largeurs.',
      'apps/website/src/features/about/Story.tsx:1',
    ),
    {
      kind: 'ecart',
      text: 'La phrase-clé sur le copilote diffère entre les deux pages qui la portent : l’accueil dit « Nous avons construit le copilote qui nous manquait » (fait accompli), /about dit « Nous avons voulu construire le copilote qui nous manquait » (intention) — même idée, verbe différent.',
      source: 'apps/website/messages/fr/about.json:19',
    },
  ],
}
