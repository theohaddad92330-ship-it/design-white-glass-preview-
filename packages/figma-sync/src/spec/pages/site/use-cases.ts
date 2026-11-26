import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /use-cases — les cas d'usage par rôle. Quatre sections dans l'ordre réel de
 * `apps/website/src/app/[locale]/use-cases/page.tsx:23-27` : Hero, Liste,
 * Personas, CTA. Textes FR : `apps/website/messages/fr/useCases.json`.
 */

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  align: 'center',
  padding: '10',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: "Cas d'usage" } } },
    {
      type: 'text',
      text: "Conçu pour les ESN qui veulent ouvrir plus de comptes - et mieux exploiter ceux qu'elles ont déjà.",
      style: 'display',
    },
    {
      type: 'text',
      text: "Des cas d'usage concrets pour chaque rôle clé de votre organisation.",
      style: 'body',
      color: 'text/secondary',
    },
    { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Créer mon compte' } } },
  ],
}

const list: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    {
      type: 'grid',
      columns: 1,
      gap: '6',
      children: [
        [
          'Ouvrir un nouveau compte',
          "Frustration · Vous connaissez le nom d'une entreprise mais vous ignorez les bonnes directions, les décideurs et les projets en cours.",
          "Avec BellumAI · BellumAI rassemble le potentiel, les signaux récents, les entités utiles, les sites, les contacts, l'organigramme et le plan d'action.",
          'Analyser un nouveau compte',
        ],
        [
          'Développer un compte existant',
          'Frustration · Votre ESN travaille déjà avec une équipe mais ne parvient pas à ouvrir de nouvelles directions.',
          'Avec BellumAI · BellumAI met en évidence les entités complémentaires, les autres sites, les nouveaux décideurs et les opportunités de multi-threading.',
          'Développer un compte existant',
        ],
        [
          'Préparer un rendez-vous',
          "Frustration · Vous reconstruisez l'historique du compte dans l'urgence avant chaque rendez-vous.",
          'Avec BellumAI · BellumAI génère un résumé exécutif, les signaux récents, les enjeux, les contacts clés et une battle card partageable.',
          'Préparer un rendez-vous',
        ],
        [
          'Positionner un consultant',
          'Frustration · Vous avez un excellent profil mais vous ignorez quelles entreprises peuvent avoir besoin de ses compétences.',
          "Avec BellumAI · BellumAI repère les offres d'emploi, les technologies demandées, les équipes qui recrutent, les sites adaptés et les décideurs à approcher.",
          'Identifier les comptes adaptés',
        ],
        [
          "Piloter l'équipe commerciale",
          'Frustration · Chaque commercial travaille avec sa propre méthode et les informations ne sont pas capitalisées.',
          "Avec BellumAI · BellumAI structure un portefeuille partagé, des dossiers, des historiques, des plans d'action et des exports.",
          'Parler à l’équipe',
        ],
      ].map(
        ([title, frustration, solution, ctaLabel]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string } },
          children: [
            { type: 'text', text: frustration as string, style: 'body', color: 'text/muted' },
            { type: 'text', text: solution as string, style: 'body', color: 'text/secondary' },
            {
              type: 'component',
              component: 'Button',
              props: { variant: 'outline', content: { label: ctaLabel as string } },
            },
          ],
        }),
      ),
    },
  ],
}

const personas: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Par rôle' } } },
    { type: 'text', text: 'Une promesse claire pour chaque rôle.', style: 'title' },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '4',
      children: [
        [
          'Business Manager',
          'Gagnez du temps.',
          ['Gagner du temps', 'Visualiser les décideurs', 'Détecter les opportunités'],
        ],
        [
          'Directeur commercial',
          'Structurez le grand compte.',
          ["Structurer l'approche grand compte", "Capitaliser sur l'historique", 'Piloter avec des données fiables'],
        ],
        [
          'Fondateur / dirigeant',
          'Gardez la vision.',
          ['Vision claire du portefeuille', 'Accélérer la croissance', 'Aligner les équipes'],
        ],
      ].map(
        ([badge, title, points]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: title as string } },
          children: [
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'outline', content: { label: badge as string } },
            },
            ...(points as string[]).map(
              (p): Block => ({ type: 'text', text: p, style: 'caption', color: 'text/secondary' }),
            ),
          ],
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
      { type: 'text', text: 'Trouvez votre prochain compte.', style: 'title' },
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

export const useCasesPage: PageSpec = {
  id: 'site/use-cases',
  surface: 'site',
  domain: 'cas-d-usage',
  route: 'apps/website/src/app/[locale]/use-cases/page.tsx',
  title: "Cas d'usage",
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [list, personas],
    cta,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'La liste des cinq cas d’usage reste en une colonne à toutes les largeurs ; la grille des trois personas passe de 3 à 1 colonne sous 1024 px.',
      'apps/website/src/features/use-cases/UseCasesList.tsx:1',
    ),
    {
      kind: 'ecart',
      text: 'Cette page ne s’anime pas en `Reveal` comme les autres pages marketing (Hero, Liste, Personas, CTA tous rendus sans fondu) : incohérence de grammaire de mouvement entre pages (GA-25). Le composant existe (`Reveal.tsx`) mais n’est importé sur aucune section de /use-cases.',
      source: 'apps/website/src/features/landing/Reveal.tsx:6',
    },
    {
      kind: 'decision',
      text: 'Les points forts de chaque persona reprennent mot pour mot ceux de la section « Cas d’usage » de l’accueil, qui lit `home.useCases.personas` — contenu dupliqué assumé entre les deux pages plutôt que renvoyé par lien.',
      source: 'apps/website/src/features/landing/UseCasesPreview.tsx:41',
    },
  ],
}
