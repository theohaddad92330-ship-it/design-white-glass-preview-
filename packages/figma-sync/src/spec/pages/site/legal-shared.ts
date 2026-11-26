import type { Block, PageSpec, Surface, UxNote } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * Gabarit commun aux six pages légales (`LegalPage.tsx`) : kicker, titre,
 * date de mise à jour, sommaire (TOC) puis sections numérotées. Un seul
 * générateur (GA-26) plutôt que six copies quasi identiques — seul le
 * contenu change (`legal-<slug>.ts` d'origine dans chaque page réelle).
 */

interface LegalSection {
  id: string
  title: string
  /** Premier paragraphe réel de la section (texte intégral tronqué pour la maquette). */
  text: string
}

const legalHero = (title: string, lastUpdated: string): Block[] => [
  { type: 'text', text: 'Documentation légale', style: 'label', color: 'text/muted' },
  { type: 'text', text: title, style: 'display' },
  { type: 'text', text: `Dernière mise à jour : ${lastUpdated}`, style: 'caption', color: 'text/muted' },
]

const toc = (sections: LegalSection[]): Block => ({
  type: 'stack',
  direction: 'column',
  gap: '2',
  children: [
    { type: 'text', text: 'Sur cette page', style: 'label', color: 'text/muted' },
    ...sections.map(
      (s, i): Block => ({
        type: 'text',
        text: `${String(i + 1).padStart(2, '0')} · ${s.title}`,
        style: 'caption',
        color: 'text/secondary',
      }),
    ),
  ],
})

const article = (sections: LegalSection[]): Block => ({
  type: 'stack',
  direction: 'column',
  gap: '8',
  children: sections.map(
    (s, i): Block => ({
      type: 'stack',
      direction: 'column',
      gap: '2',
      children: [
        { type: 'text', text: `${String(i + 1).padStart(2, '0')} · ${s.title}`, style: 'heading' },
        { type: 'text', text: s.text, style: 'body', color: 'text/secondary' },
      ],
    }),
  ),
})

export function buildLegalPage(params: {
  slug: string
  domain: string
  route: string
  title: string
  lastUpdated: string
  sections: LegalSection[]
  extraUxNotes?: UxNote[]
}): PageSpec {
  const surface: Surface = 'site'
  return {
    id: `${surface}/${params.slug}`,
    surface,
    domain: params.domain,
    route: params.route,
    title: params.title,
    template: 'marketing',
    viewports: ['desktop', 'mobile'],
    slots: {
      nav: SITE_NAV,
      hero: legalHero(params.title, params.lastUpdated),
      sections: [
        {
          type: 'grid',
          columns: 2,
          columnsMobile: 1,
          gap: '10',
          children: [toc(params.sections), article(params.sections)],
        },
      ],
      footer: SITE_FOOTER,
    },
    states: {},
    uxNotes: [
      HEADER_BREAKPOINT_NOTE,
      TOKENS_THEME_NOTE,
      responsiveNote(
        'Le sommaire (colonne de gauche) et l’article (colonne de droite, largeur de lecture ~42rem/70 caractères, D81) passent de 2 colonnes à 1 seule sous 1024 px — le sommaire descend alors au-dessus du texte plutôt que de disparaître.',
        'apps/website/src/features/legal/LegalPage.tsx:49',
      ),
      {
        kind: 'ecart',
        text: 'Le sommaire (TOC) est entièrement masqué sous 1024 px (`hidden lg:block`), y compris sur tablette (768-1023) : aucun repli en menu déroulant, la promesse de navigation à deux colonnes disparaît sans équivalent mobile.',
        source: 'apps/website/src/features/legal/LegalPage.tsx:50',
      },
      ...(params.extraUxNotes ?? []),
    ],
  }
}
