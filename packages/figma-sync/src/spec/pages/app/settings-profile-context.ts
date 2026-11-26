import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/profile/context — Ton profil BellumAI. Lu dans
 * `apps/web/src/routes/settings/profile/context.tsx` →
 * `ProfileContextSubPage.tsx` : résumé du profil, personnalisation,
 * coaching, historique des versions ; un sommaire (`aside`, ≥1280 px
 * seulement, `xl:block`) quand au moins deux sections existent. Textes de
 * `i18n/locales/fr/profile.json` (`context.*`).
 */
export const settingsProfileContextPage: PageSpec = {
  id: 'app/settings-profile-context',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/profile/context.tsx',
  title: 'Ton profil BellumAI',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'ghost', size: 'sm', content: { label: 'Retour' } } },
      { type: 'text', text: 'Ton profil BellumAI', style: 'title' },
      {
        type: 'text',
        text: 'Ce que les agents utilisent pour personnaliser tes analyses.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Résumé' } },
        children: [
          { type: 'text', text: 'Compte exemple — résumé du profil.', style: 'body', color: 'text/secondary' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Personnalisation' } },
        children: [
          {
            type: 'grid',
            columns: 2,
            columnsMobile: 1,
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: { content: { title: 'Ton, longueur', description: '—' } },
              },
              { type: 'component', component: 'Card', props: { content: { title: 'Priorités', description: '—' } } },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Coaching' } },
        children: [
          { type: 'text', text: 'Point faible principal, conseil clé.', style: 'body', color: 'text/secondary' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Versions',
            description: 'Historique de ton contexte IA. Restaure une version précédente à tout moment.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Version', 'Statut', ''],
                rows: [
                  ['Version 3', 'Actuelle', '—'],
                  ['Version 2', 'Remplacée', 'Restaurer'],
                ],
              },
            },
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionSidebarNav',
        props: { content: { title: 'Sommaire' }, items: ['Résumé', 'Personnalisation', 'Coaching'] },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger ton profil.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Le sommaire du code (`xl:block`, visible seulement à partir de 1280 px et seulement si `tocSections.length >= 2`) va dans le slot `aside` du gabarit `settings` — la PREUVE que le seuil ≥1280 px de la note responsive partagée est déjà appliqué dans le code, pas seulement une intention.',
      source: 'apps/web/src/features/profile/view/ProfileContextSubPage.tsx:114',
    },
    {
      kind: 'decision',
      text: 'Aucun profil généré n’affiche jamais une section vide silencieuse : un bandeau nommé explique « Aucun profil généré pour le moment » avec le geste qui répare (régénérer).',
      source: 'apps/web/src/features/profile/view/ProfileContextSubPage.tsx:70',
    },
  ],
}
