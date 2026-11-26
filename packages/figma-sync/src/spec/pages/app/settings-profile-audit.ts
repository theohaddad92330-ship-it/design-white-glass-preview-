import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/profile/audit — Audit commercial (#2071-#2075, #2090 « premier
 * effet waouh »). Lu dans
 * `apps/web/src/routes/settings/profile/audit.tsx` →
 * `CommercialAuditScreen.tsx` : un récit en un seul ordre narratif (verdict,
 * chaîne commerciale, maturité, décisions, stratégie, mémoire marché,
 * priorité de la semaine, signaux déclarés, conséquences, charge active,
 * plan à 4 semaines, premiers mouvements, hypothèses, ce qui n'a pas pu être
 * établi, puis la collaboration EN DERNIER). Textes de
 * `i18n/locales/fr/commercialAudit.json`.
 */
export const settingsProfileAuditPage: PageSpec = {
  id: 'app/settings-profile-audit',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/profile/audit.tsx',
  title: 'Audit commercial',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Audit commercial', style: 'title' },
      {
        type: 'text',
        text: 'Voici ce que le produit a compris de ton activité.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Verdict' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Chaîne commerciale' } },
        children: [{ type: 'text', text: 'Entrées → … → Capitalisation', style: 'caption', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Maturité commerciale' } },
        children: [{ type: 'text', text: '12 axes, toujours nommés.', style: 'caption', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Décisions' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Voies d’entrée' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Combinaison stratégique' } },
        children: [{ type: 'text', text: 'Générée, lecture seule.', style: 'caption', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mémoire marché' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Priorité de la semaine' } },
        children: [
          { type: 'text', text: 'Une seule carte, une seule action.', style: 'caption', color: 'text/secondary' },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que tes réponses disent' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Conséquences' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Charge active' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Plan à 4 semaines' } },
        children: [
          {
            type: 'text',
            text: 'Aucune action ouverte ne permet encore de produire ce plan.',
            style: 'caption',
            color: 'text/secondary',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Premiers mouvements' } },
        children: [{ type: 'text', text: 'Trois au plus, un par genre.', style: 'caption', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Hypothèses' } },
        children: [{ type: 'text', text: '—', style: 'body', color: 'text/secondary' }],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Ce qui n’a pas pu être établi',
            description: 'Cette partie du profil n’a pas été établie.',
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Un collègue gère-t-il une partie de ces comptes ?' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Répondre' } },
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
        props: { content: { title: 'Je n’ai pas pu charger ton audit.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Si le profil n’a jamais été établi, l’écran entier est remplacé par une porte nommée (« Ton profil n’a pas encore été établi » + bouton « Répondre au questionnaire ») — jamais un écran de cases vides qui ressemblerait à une panne.',
      source: 'apps/web/src/features/commercial-audit/view/CommercialAuditScreen.tsx:69',
    },
    {
      kind: 'decision',
      text: 'La carte de collaboration (« un collègue gère-t-il une partie de ces comptes ? ») se propose TOUJOURS EN DERNIER, une fois que l’audit a montré ce qu’il sait — jamais avant (lot FD, arrêt levé par Louis le 18/09/2026).',
      source: 'apps/web/src/features/commercial-audit/view/CommercialAuditScreen.tsx:166',
    },
    {
      kind: 'decision',
      text: '« Ce qui n’a pas pu être établi » est dérivé de TOUS les blocs de l’écran : il ne peut jamais conclure « tout établi » pendant qu’un bloc voisin dit « non mesuré » — placé après les mouvements, en pied de page d’honnêteté et non un temps du récit.',
      source: 'apps/web/src/features/commercial-audit/view/CommercialAuditScreen.tsx:162',
    },
  ],
}
