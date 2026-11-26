import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/vivier-export — Export du vivier (#3950, 08/10/2026 ; posture
 * Laura #3950.1, décision Louis 09/10/2026, lot G01). Lu dans
 * `apps/web/src/routes/settings/vivier-export.tsx` → `VivierExportView.tsx`,
 * qui rend tel quel le `VivierExportMenu` déplacé depuis /consultants
 * (`VivierIoMenus.tsx`) : AUCUNE option supprimée, même bouton « Exporter »,
 * même modale à deux options (export ATS, export en lot). Textes de
 * `i18n/locales/fr/consultants.json` (`settingsExport`, `ioMenu.export`).
 *
 * Remplace l'exception TEMPORAIRE posée en intégration Y (08/10/2026) dans
 * `route-exceptions.ts` — maintenant qu'une spec existe, la route en sort.
 */
export const settingsVivierExportPage: PageSpec = {
  id: 'app/settings-vivier-export',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/vivier-export.tsx',
  title: 'Export du vivier',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Export du vivier', style: 'title' },
      {
        type: 'text',
        text: 'Exporte le vivier au format ATS ou en lot CSV — les deux options que portait le bouton « Exporter » sur l’écran du vivier.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', content: { label: 'Exporter' } },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu lire la règle d’export.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'ecart',
      text: 'Le clic sur « Exporter » ouvre une modale à deux options (export ATS, export en lot, chacune avec son propre bouton de déclenchement) — non capturée comme un second état ici, même limite que les autres écrans de Réglages : aucune recette de ce catalogue ne rend un `Dialog` ouvert. Décision Louis 09/10/2026 (#3950.1) : Laura peut aussi déclencher ce même bouton depuis la conversation, par le MÊME service — ce geste n’a pas de représentation graphique propre, c’est une carte du fil (`PendingActionCard`, hors de ce catalogue de pages).',
      source: 'apps/web/src/features/consultants/view/VivierIoMenus.tsx:81',
    },
  ],
}
