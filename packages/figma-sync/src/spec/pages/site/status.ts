import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /status — état des services en temps réel. Deux sections dans l'ordre réel
 * de `apps/website/src/app/[locale]/status/page.tsx:31-33` : Hero, Board.
 * Textes FR : `apps/website/messages/fr/status.json`.
 *
 * La page s'actualise toutes les 30 s (fetch client) : la maquette montre
 * l'état « opérationnel », le plus fréquent, et nomme les trois autres
 * états possibles à côté (jamais simultanés à l'écran réel).
 */

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '4',
  padding: '10',
  children: [
    { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Statut système' } } },
    { type: 'text', text: 'État des services BellumAI', style: 'display' },
    {
      type: 'text',
      text: "Cette page reflète l'état de nos services en temps réel. Elle s'actualise automatiquement toutes les 30 secondes.",
      style: 'body',
      color: 'text/secondary',
    },
  ],
}

const board: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    {
      type: 'component',
      component: 'InfoBanner',
      props: { variant: 'success', size: 'md', content: { title: 'Tous les systèmes sont opérationnels' } },
    },
    {
      type: 'stack',
      direction: 'column',
      gap: '2',
      children: [
        ['Application & API', 'Connexion, comptes et dossiers de conquête'],
        ['Base de données', 'Stockage de vos comptes, contacts et analyses'],
        ['Files de traitement & temps réel', 'Analyses en arrière-plan et notifications'],
        ['Moteur IA', "Génération des dossiers et de l'intelligence commerciale"],
      ].map(
        ([name, desc]): Block => ({
          type: 'stack',
          direction: 'row',
          gap: '3',
          align: 'center',
          justify: 'between',
          children: [
            { type: 'component', component: 'DataRow', props: { content: { label: name, value: desc } } },
            { type: 'component', component: 'DotIndicator', props: { variant: 'success', size: 'sm' } },
            {
              type: 'component',
              component: 'Badge',
              props: { variant: 'success', content: { label: 'Opérationnel' } },
            },
          ],
        }),
      ),
    },
    {
      type: 'text',
      text: 'Autres états possibles du bandeau : « Dégradation partielle en cours », « Incident majeur en cours », « Impossible de joindre nos services » — jamais affichés en même temps que « opérationnel ».',
      style: 'caption',
      color: 'text/muted',
    },
    { type: 'text', text: 'Dernière vérification : {time}', style: 'caption', color: 'text/muted' },
    { type: 'text', text: 'Actualisation automatique toutes les 30 secondes.', style: 'caption', color: 'text/muted' },
    {
      type: 'text',
      text: "Historique de disponibilité et journal des incidents : bientôt disponibles. Cette page affiche pour l'instant l'état en temps réel.",
      style: 'caption',
      color: 'text/muted',
    },
  ],
}

export const statusPage: PageSpec = {
  id: 'site/status',
  surface: 'site',
  domain: 'statut',
  route: 'apps/website/src/app/[locale]/status/page.tsx',
  title: 'Statut des services',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [board],
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'La liste des quatre composants reste en une colonne à toutes les largeurs ; seul le libellé de statut peut passer sous l’icône sur mobile.',
      'apps/website/src/features/status/StatusBoard.tsx:117',
    ),
    {
      kind: 'ecart',
      text: 'Les couleurs de statut (points et textes) sont des classes Tailwind directes (`bg-emerald-400`, `bg-amber-400`, `bg-red-400`), pas des tokens `Color` de l’app (`soft/success/*`, `soft/warning/*`, `soft/danger/*`) — à réaligner sur la palette sémantique du contrat (D79, GA-33).',
      source: 'apps/website/src/features/status/StatusBoard.tsx:34',
    },
    {
      kind: 'decision',
      text: 'RUX-28 (docs/revue-ux.md T14, addenda au Top 20) : quatre tons d’état et leur triplet `soft/{tone}/{bg,border,text}`, identiques sur les trois surfaces — `success`, `warning`, `danger`, `info`, plus `neutral` ; jamais de `stop` (c’est `danger`). Une pastille d’état (`DotIndicator`) est toujours accompagnée d’un libellé (`Badge`) — la couleur ne porte jamais seule l’information, ici « Opérationnel » à côté du point vert, jamais le point seul.',
      source: 'apps/website/src/features/status/StatusBoard.tsx:34',
    },
  ],
}
