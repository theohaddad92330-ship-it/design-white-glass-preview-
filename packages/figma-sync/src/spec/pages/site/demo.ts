import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /demo — demande de démo personnalisée. Une seule section deux colonnes
 * (intro + formulaire), `apps/website/src/app/[locale]/demo/page.tsx:20-32`.
 * Textes FR : `apps/website/messages/fr/demo.json`.
 */

const intro: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Parler à l’équipe' } } },
    { type: 'text', text: 'Parlez à l’équipe BellumAI.', style: 'display' },
    {
      type: 'text',
      text: "Pour un pilotage à plusieurs commerciaux, une intégration sur mesure ou simplement une question avant de vous décider — l'équipe vous répond sous un jour ouvré.",
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'stack',
      direction: 'column',
      gap: '2',
      children: [
        'Une analyse en direct sur un compte de votre portefeuille.',
        'Les bons décideurs et signaux, expliqués pour votre contexte.',
        "Un plan d'action concret pour passer à l'action dès la semaine suivante.",
      ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/secondary' })),
    },
    { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Créer mon compte' } } },
  ],
}

const form: Block = {
  type: 'component',
  component: 'Card',
  props: { content: { title: 'Parler à l’équipe', description: 'Réponse sous un jour ouvré.' } },
  children: [
    {
      type: 'component',
      component: 'Input',
      props: { state: 'default', content: { label: 'Votre nom', placeholder: 'Votre nom' } },
    },
    {
      type: 'component',
      component: 'Input',
      props: { state: 'default', content: { label: 'Email professionnel', placeholder: 'vous@entreprise.com' } },
    },
    {
      type: 'component',
      component: 'Input',
      props: { state: 'default', content: { label: 'Société', placeholder: 'Nom de votre entreprise' } },
    },
    {
      type: 'component',
      component: 'Select',
      props: {
        size: 'md',
        state: 'default',
        content: { label: 'Taille de votre équipe', placeholder: 'Sélectionnez…' },
        items: ['1 - 5', '6 - 20', '21 - 50', '50+'],
      },
    },
    {
      type: 'component',
      component: 'Select',
      props: {
        size: 'md',
        state: 'default',
        content: { label: 'Votre enjeu principal', placeholder: 'Sélectionnez…' },
        items: [
          'Ouvrir de nouveaux comptes',
          'Développer mes comptes existants',
          'Préparer mes rendez-vous',
          'Positionner des consultants',
          'Piloter mon équipe',
        ],
      },
    },
    { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Parler à l’équipe' } } },
    {
      type: 'stack',
      direction: 'row',
      gap: '3',
      children: ['Sans engagement', 'Hébergé en Europe'].map(
        (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
      ),
    },
  ],
}

export const demoPage: PageSpec = {
  id: 'site/demo',
  surface: 'site',
  domain: 'demo',
  route: 'apps/website/src/app/[locale]/demo/page.tsx',
  title: 'Parler à l’équipe',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [
      {
        type: 'stack',
        direction: 'column',
        gap: '1',
        padding: '10',
        children: [{ type: 'grid', columns: 2, columnsMobile: 1, gap: '10', children: [intro, form] }],
      },
    ],
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'La section passe de 2 colonnes (argumentaire + formulaire) à 1 colonne sous 1024 px.',
      'apps/website/src/features/demo/DemoForm.tsx:1',
    ),
    {
      kind: 'ecart',
      text: 'La section est fixée en `h-screen` (100vh, comme le `min-h-screen` qui enveloppe chaque page dans `SiteLayout.tsx`) plutôt qu’en `dvh` : sur mobile, la barre d’adresse qui apparaît/disparaît réduit le viewport visible après le chargement et peut couper le bas du formulaire (GA-30, « dvh jamais vh »).',
      source: 'apps/website/src/components/SiteLayout.tsx:13',
    },
    {
      kind: 'decision',
      text: 'RUX-42 (docs/revue-ux.md §2 P5) : « Demander une démo » disparaît — il désignait à la fois cette page et la démo libre-service. Cette page EST la troisième intention du site, « Parler à l’équipe » : un formulaire répondu par un humain sous un jour ouvré, pour un pilotage à plusieurs commerciaux ou une question avant de se décider — jamais la démo produit elle-même (« Essayer la démo », qui ne passe par aucun formulaire). Le code rattrape la maquette en renommant la route `/demo` → `/contact`, notée ici en écart plutôt qu’en décision tant que la route réelle n’a pas bougé.',
      source: 'apps/website/src/features/pricing/PricingCta.tsx:26',
    },
    {
      kind: 'ecart',
      text: 'La route réelle reste `/demo` (`apps/website/src/app/[locale]/demo/page.tsx`) : le renommage en `/contact` (RUX-42) n’a pas encore été fait côté code — cette spec continue de pointer sur le fichier réel, seul son CONTENU cible le nouveau libellé.',
      source: 'apps/website/src/app/[locale]/demo/page.tsx:1',
    },
  ],
}
