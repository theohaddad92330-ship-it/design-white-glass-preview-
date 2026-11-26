import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/mes-signalements — Mes signalements (#1960.10, décision Louis
 * 13/09/2026). Lu dans `apps/web/src/routes/settings/mes-signalements.tsx` →
 * `MyReportsView.tsx` : entête + légende des états, liste des signalements de
 * la personne connectée (référence, résumé, catégorie, date, état). Textes de
 * `i18n/locales/fr/feedback.json` (`myReports.*`).
 */
export const settingsMesSignalementsPage: PageSpec = {
  id: 'app/settings-mes-signalements',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/mes-signalements.tsx',
  title: 'Mes signalements',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Mes signalements', style: 'title' },
      { type: 'text', text: 'Ce que tu as signalé, et où en est chacun.', style: 'body', color: 'text/secondary' },
      {
        type: 'text',
        text: '« En cours » : quelqu’un s’en occupe. « Fermé sans suite » : clos sans correction.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Référence', 'Résumé', 'Catégorie', 'Envoyé le', 'État'],
            rows: [
              ['Signalement n° 913', 'Compte exemple 1', '—', '—', 'Reçu'],
              ['Signalement n° 907', 'Compte exemple 2', '—', '—', 'En cours'],
              ['Sans numéro', 'Compte exemple 3', '—', '—', 'État indisponible'],
            ],
          },
        },
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
            title: 'Aucun signalement',
            description:
              "Tu n'as encore rien signalé. Un signalement apparaît ici dès qu'il est envoyé, avec son état.",
            action: 'Signaler un problème',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Tes signalements n’ont pas pu être chargés.',
            description: 'Réessaie.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: "`empty` est un état FACULTATIF du gabarit `settings` (`catalog.ts` TEMPLATES.settings.optionalStates) : déclaré ici, car cette page a un vrai état vide dans le code (`screenState === 'empty_never'`, un signalement est une LISTE avant d’être un réglage).",
      source: 'apps/web/src/features/feedback/MyReportsView.tsx:100',
    },
    {
      kind: 'decision',
      text: 'Un état non lu ne se devine jamais « Reçu » : `status: null` s’affiche « État indisponible » (badge neutre), jamais une couleur d’état.',
      source: 'apps/web/src/features/feedback/MyReportsView.tsx:164',
    },
  ],
}
