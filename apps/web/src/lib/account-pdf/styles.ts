import { Font, StyleSheet } from '@react-pdf/renderer'

/*
 * @react-pdf/renderer ne lit pas le CSS @font-face — il faut enregistrer
 * chaque face via `Font.register()` avant le premier rendu. On pointe sur
 * le repo officiel Vercel (`vercel/geist-font`, OFL) miroite par jsDelivr
 * pour la stabilité CDN. La version est ÉPINGLÉE (`@1.8.2`, jamais `@main`) :
 * une URL tierce mutable n'a pas sa place dans la CSP d'une application de production.
 * Chaque origine ici DOIT figurer dans `connect-src` et `font-src` de la CSP de
 * `vercel.json` (garde `csp-apercu-pdf-polices-distantes.test.ts`, #4836).
 */
const GEIST_TTF_BASE = 'https://cdn.jsdelivr.net/gh/vercel/geist-font@1.8.2/fonts/Geist/ttf'
const GEIST_MONO_TTF_BASE = 'https://cdn.jsdelivr.net/gh/vercel/geist-font@1.8.2/fonts/GeistMono/ttf'

// `Geist` est une famille multi-face : tout style qui hérite seulement
// `fontFamily: 'Geist'` peut alors basculer sur Bold via `fontWeight` ou
// sur Italic via `fontStyle` sans avoir à pointer une famille distincte.
Font.register({
  family: 'Geist',
  fonts: [
    { src: `${GEIST_TTF_BASE}/Geist-Regular.ttf`, fontWeight: 400 },
    { src: `${GEIST_TTF_BASE}/Geist-Medium.ttf`, fontWeight: 500 },
    { src: `${GEIST_TTF_BASE}/Geist-SemiBold.ttf`, fontWeight: 600 },
    { src: `${GEIST_TTF_BASE}/Geist-Bold.ttf`, fontWeight: 700 },
    { src: `${GEIST_TTF_BASE}/Geist-Italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
    { src: `${GEIST_TTF_BASE}/Geist-BoldItalic.ttf`, fontWeight: 700, fontStyle: 'italic' },
  ],
})

// Alias single-face pour conserver le pattern hérité de Helvetica
// (`fontFamily: 'Helvetica-Bold'`) sans réécrire chaque style en
// `fontFamily: 'Geist', fontWeight: 700`. Pratique côté lecture.
Font.register({ family: 'Geist-Bold', src: `${GEIST_TTF_BASE}/Geist-Bold.ttf` })
Font.register({ family: 'Geist-Italic', src: `${GEIST_TTF_BASE}/Geist-Italic.ttf` })

Font.register({ family: 'Geist-Mono', src: `${GEIST_MONO_TTF_BASE}/GeistMono-Regular.ttf` })

const COLOR = {
  ink: '#111111',
  body: '#374151',
  muted: '#6B7280',
  ghost: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F3F4F6',
  surface: '#FAFAFA',
  brand: '#7C3AED',
  brandSoft: '#EDE9FE',
  brandInk: '#5B21B6',
  goBg: '#D1FAE5',
  goFg: '#047857',
  noGoBg: '#FEE2E2',
  noGoFg: '#B91C1C',
  // Severity uses soft pastel + matching dark ink — pill style, easier on the eye.
  criticalBg: '#FEE2E2',
  criticalFg: '#B91C1C',
  highBg: '#FFEDD5',
  highFg: '#C2410C',
  mediumBg: '#FEF3C7',
  mediumFg: '#A16207',
  lowBg: '#DCFCE7',
  lowFg: '#15803D',
  // Badge « rôle dans la décision » (focalOrgData.OrgDecisionBadge), page organigramme.
  // Sponsor réutilise le violet de marque (même convention que l'écran, `ROLE_COLORS.sponsor`
  // dans Badges.tsx) ; Opérationnel et Bloqueur réutilisent les tons neutre/rouge déjà déclarés
  // ci-dessus — seul l'Influenceur (bleu) est une paire neuve.
  influencerBg: '#DBEAFE',
  influencerFg: '#1D4ED8',
  // Trait de rattachement VÉRIFIÉ (plein) vs HYPOTHÈSE (pointillé) — la distinction que la
  // page organigramme du PDF ne doit jamais aplatir (docblock `AccountPdfDocument.tsx`).
  verifiedFg: '#047857',
  hypothesisFg: '#6B7280',
} as const

export const palette = COLOR

type SeverityPalette = { bg: string; fg: string }

// Shared layout for every PDF badge (score, severity chip, GO/NO-GO) — soft pill.
const BADGE_BASE = {
  fontFamily: 'Geist-Bold',
  paddingVertical: 4,
  paddingHorizontal: 10,
  borderRadius: 999,
  textAlign: 'center' as const,
  alignSelf: 'flex-start' as const,
}

export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontFamily: 'Geist',
    borderRadius: 8,
    fontSize: 10,
    color: COLOR.body,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    borderBottomStyle: 'solid',
  },
  title: {
    fontFamily: 'Geist-Bold',
    fontSize: 18,
    color: COLOR.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: COLOR.muted,
  },
  scoreBadge: {
    ...BADGE_BASE,
    marginTop: 10,
    backgroundColor: COLOR.brand,
    color: COLOR.brandSoft,
    fontSize: 10,
    paddingTop: 8,
  },
  sectionTitle: {
    fontFamily: 'Geist-Bold',
    fontSize: 13,
    color: COLOR.ink,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.divider,
    borderBottomStyle: 'solid',
  },
  subSectionTitle: {
    fontFamily: 'Geist-Bold',
    fontSize: 11,
    color: COLOR.ink,
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 4,
  },
  emptyParagraph: {
    color: COLOR.ghost,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  card: {
    backgroundColor: COLOR.surface,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderStyle: 'solid',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.divider,
    borderBottomStyle: 'solid',
  },
  infoRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    color: COLOR.muted,
    width: '35%',
  },
  infoValue: {
    color: COLOR.ink,
    fontFamily: 'Geist-Bold',
    width: '65%',
    textAlign: 'right',
  },
  itemTitle: {
    fontFamily: 'Geist-Bold',
    color: COLOR.ink,
    marginBottom: 2,
  },
  itemMeta: {
    color: COLOR.muted,
    fontSize: 9,
    marginBottom: 4,
  },
  itemBody: {
    color: COLOR.body,
    marginBottom: 2,
  },
  itemHighlight: {
    color: COLOR.brand,
    fontFamily: 'Geist-Italic',
    fontSize: 9,
    marginTop: 4,
  },
  bullet: {
    marginLeft: 8,
    marginBottom: 2,
  },
  severityChip: {
    ...BADGE_BASE,
    fontSize: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginRight: 6,
    paddingTop: 8,
  },
  table: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderStyle: 'solid',
    borderRadius: 3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.divider,
    borderBottomStyle: 'solid',
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLOR.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    borderBottomStyle: 'solid',
  },
  th: {
    fontFamily: 'Geist-Bold',
    color: COLOR.ink,
    padding: 6,
    fontSize: 9,
  },
  td: {
    padding: 6,
    fontSize: 9,
    color: COLOR.body,
  },
  decisionGo: {
    ...BADGE_BASE,
    backgroundColor: COLOR.goBg,
    color: COLOR.goFg,
    fontSize: 10,
    paddingTop: 8,
  },
  decisionNoGo: {
    ...BADGE_BASE,
    backgroundColor: COLOR.noGoBg,
    color: COLOR.noGoFg,
    fontSize: 10,
    paddingTop: 8,
  },
  /**
   * L'ABSENCE de verdict — ni vert, ni rouge.
   *
   * Un compte jamais évalué imprimait « NO-GO » en rouge sur un document envoyé
   * au client (31/08/2026). Le rouge est ici la moitié du défaut : il donne à
   * un silence l'apparence d'un jugement argumenté.
   */
  decisionPending: {
    ...BADGE_BASE,
    backgroundColor: COLOR.border,
    color: COLOR.muted,
    fontSize: 10,
    paddingTop: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: COLOR.ghost,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLOR.divider,
    borderTopStyle: 'solid',
  },
  pageNumber: {
    fontSize: 8,
    color: COLOR.ghost,
  },
  /* ---------------------------------------------------------------- */
  /*  Page « Organigramme de décision »                                */
  /* ---------------------------------------------------------------- */
  orgCoverageBanner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLOR.brandSoft,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  orgCoverageItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginRight: 14,
    marginBottom: 2,
  },
  orgCoverageValue: {
    fontFamily: 'Geist-Bold',
    fontSize: 10,
    color: COLOR.brandInk,
    marginRight: 3,
  },
  orgCoverageUnknown: {
    fontSize: 8,
    fontStyle: 'italic',
    color: COLOR.ghost,
    marginRight: 3,
  },
  orgCoverageLabel: {
    fontSize: 8,
    color: COLOR.brandInk,
  },
  orgColumns: {
    flexDirection: 'row',
    marginTop: 4,
  },
  orgPathColumn: {
    width: '30%',
    paddingRight: 10,
  },
  orgTreeColumn: {
    width: '70%',
  },
  orgPathStep: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  orgStepBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderStyle: 'solid',
    backgroundColor: COLOR.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginTop: 1,
  },
  orgStepBadgeText: {
    fontSize: 7,
    fontFamily: 'Geist-Bold',
    color: COLOR.body,
  },
  orgPathStepBody: {
    flex: 1,
  },
  orgPathStepName: {
    fontFamily: 'Geist-Bold',
    fontSize: 9,
    color: COLOR.ink,
  },
  orgPathStepTitle: {
    fontSize: 8,
    color: COLOR.muted,
    marginTop: 1,
  },
  orgPathStepObjective: {
    fontSize: 8,
    color: COLOR.body,
    marginTop: 2,
  },
  orgLevelRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  orgLevelLabel: {
    width: 62,
    paddingTop: 2,
  },
  orgLevelBadge: {
    ...BADGE_BASE,
    backgroundColor: COLOR.divider,
    color: COLOR.body,
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  orgLevelPeople: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  orgPersonCard: {
    width: 140,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderLeftWidth: 3,
    borderStyle: 'solid',
    borderRadius: 3,
    backgroundColor: COLOR.surface,
    padding: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  orgPersonBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  orgPersonBadge: {
    ...BADGE_BASE,
    fontSize: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginRight: 3,
    marginBottom: 2,
  },
  orgPersonName: {
    fontFamily: 'Geist-Bold',
    fontSize: 8,
    color: COLOR.ink,
  },
  orgPersonTitle: {
    fontSize: 7,
    color: COLOR.muted,
    marginTop: 1,
  },
  orgPersonReporting: {
    fontSize: 6.5,
    marginTop: 3,
  },
  orgRecommendationBanner: {
    backgroundColor: COLOR.brandSoft,
    borderRadius: 4,
    padding: 10,
    marginTop: 10,
  },
  orgRecommendationTitle: {
    fontFamily: 'Geist-Bold',
    fontSize: 10,
    color: COLOR.brandInk,
    marginBottom: 2,
  },
  orgRecommendationBody: {
    fontSize: 9,
    color: COLOR.body,
  },
  orgMoreContacts: {
    fontSize: 8,
    color: COLOR.muted,
    marginTop: 4,
  },
})

export function severityPalette(severity?: string): SeverityPalette {
  switch (severity) {
    case 'critical':
      return { bg: palette.criticalBg, fg: palette.criticalFg }
    case 'high':
      return { bg: palette.highBg, fg: palette.highFg }
    case 'medium':
      return { bg: palette.mediumBg, fg: palette.mediumFg }
    case 'low':
      return { bg: palette.lowBg, fg: palette.lowFg }
    default:
      return { bg: palette.divider, fg: palette.muted }
  }
}

/**
 * Le rôle dans la décision (`OrgDecisionBadge`, focalOrgData.ts), en pastille —
 * page « Organigramme de décision » du PDF. `null` = le graphe ne sait pas
 * situer la personne : la pastille n'est alors pas rendue (voir l'appelant),
 * jamais un badge neutre qui laisserait croire à un rôle « Opérationnel » deviné.
 */
export function decisionBadgePalette(badge: 'sponsor' | 'influencer' | 'operational' | 'blocker'): SeverityPalette {
  switch (badge) {
    case 'sponsor':
      // Même convention que l'écran (`ROLE_COLORS.sponsor` dans Badges.tsx) : violet de marque.
      return { bg: palette.brandSoft, fg: palette.brandInk }
    case 'influencer':
      return { bg: palette.influencerBg, fg: palette.influencerFg }
    case 'blocker':
      return { bg: palette.noGoBg, fg: palette.noGoFg }
    case 'operational':
    default:
      return { bg: palette.divider, fg: palette.muted }
  }
}

type OrgReportingLineStyle = { color: string; borderStyle: 'solid' | 'dashed' }

/**
 * Trait PLEIN (rattachement vérifié) vs trait POINTILLÉ (hypothèse) — la
 * distinction que la page « Organigramme de décision » du PDF ne doit jamais
 * aplatir (voir `AccountPdfDocument.tsx`, docblock de `OrgPersonNode`).
 *
 * Une fonction PURE et testée en isolation, exprès : une régression ici
 * ferait dessiner une hypothèse comme un fait sans qu'aucun test qui inspecte
 * les octets compressés du PDF ne puisse jamais l'attraper de façon fiable.
 *
 * `null` (aucun rattachement connu) rend le gris neutre par défaut — « le
 * silence est un état correct » (FocalOrgView.tsx) : pas de ligne inventée.
 */
export function reportingLineStyle(reporting: { verified: boolean } | null): OrgReportingLineStyle {
  if (!reporting) return { color: palette.border, borderStyle: 'solid' }
  return reporting.verified
    ? { color: palette.verifiedFg, borderStyle: 'solid' }
    : { color: palette.hypothesisFg, borderStyle: 'dashed' }
}
