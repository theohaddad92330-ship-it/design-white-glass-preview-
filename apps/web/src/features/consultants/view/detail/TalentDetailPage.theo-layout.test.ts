import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Refonte Théo (PR12) — la grille de `c/talents-fiche` dans l'onglet Profil.
 * jsdom ne met rien en page : la garde lit l'ORDRE des blocs dans le source,
 * c'est ce qu'un relecteur poserait à côté de la maquette.
 */
const PAGE = readFileSync(resolve(__dirname, 'TalentDetailPage.tsx'), 'utf8')
const HEADER = readFileSync(resolve(__dirname, 'TalentDetailHeader.tsx'), 'utf8')

function profileBlock(source: string): string {
  const start = source.indexOf("activeGroup === 'profile'")
  const end = source.indexOf("activeGroup === 'documents'")
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

/**
 * L'ordre maquette (`c/talents-fiche`, version retenue à la fusion : `2dfc77e892`) : ligne de disponibilité →
 * deux colonnes « Expertise & qualification » | « Score consultant » → Missions pleine largeur.
 */
function layoutOrderHolds(source: string): boolean {
  const block = profileBlock(source)
  const marks = [
    '<TalentAvailabilityBadge',
    "t('detail.sections.expertise')",
    "t('detail.sections.score')",
    "t('detail.sections.missions')",
  ].map(mark => block.indexOf(mark))
  if (marks.some(position => position < 0)) return false
  if (![...marks].every((position, index) => index === 0 || position > (marks[index - 1] ?? -1))) return false
  // Les missions vivent HORS de la colonne d'appui (pleine largeur) : rien entre le score et son dernier bloc.
  const scoreAt = block.indexOf("t('detail.sections.score')")
  const side = block.slice(scoreAt, block.indexOf('<ImportedExtraCard'))
  return !side.includes("t('detail.sections.missions')")
}

describe('fiche talent — grille Théo de l’onglet Profil', () => {
  it('LIT le source (corpus non vide)', () => {
    expect(profileBlock(PAGE).length).toBeGreaterThan(1000)
  })

  it('l’ordre des blocs est celui de la maquette', () => {
    expect(layoutOrderHolds(PAGE)).toBe(true)
  })

  it('sait dire NON — des missions rangées dans la colonne d’appui sont attrapées', () => {
    const broken = PAGE.replace(
      '<ImportedExtraCard',
      "<Panel label={t('detail.sections.missions')} /><ImportedExtraCard",
    )
    expect(layoutOrderHolds(broken)).toBe(false)
  })

  it('un seul nom : l’en-tête de la fiche porte le h1, la coque ne le répète pas', () => {
    expect(PAGE).toMatch(/<CustomerPage\s+titleInScreen/)
    expect(HEADER).toMatch(/element="h1"/)
    expect(HEADER).not.toMatch(/element="h2"[^>]*>\s*\{talentName\}/)
  })

  it('l’en-tête est à plat (pas de carte encadrée), et garde `shrink-0` (GA-279)', () => {
    const card = HEADER.match(/<Card[\s\S]*?className="([^"]*)"/)?.[1] ?? ''
    expect(card).toContain('shrink-0')
    expect(card).toContain('bg-transparent')
  })

  // #4576 — « Consultant » une seule fois : la nature se dit dans la ligne d'identité de l'en-tête. La coque
  // (`CustomerPage`) est doublée dans `TalentDetail.test.tsx`, donc seule la lecture du source voit la puce isolée.
  const kindChipInShell = (source: string) => /pageTitleBadge=\{[\s\S]{0,200}t\(`kind\./.test(source)

  it('la nature n’est pas redite par une puce de la coque (#4576)', () => {
    expect(kindChipInShell(PAGE)).toBe(false)
    expect(HEADER).toMatch(/t\(`kind\.\$\{talent\.kind\}`\)/)
  })

  it('sait dire NON — une puce de nature remise dans la coque est attrapée', () => {
    const broken = PAGE.replace('<CustomerPage', '<CustomerPage pageTitleBadge={<b>{t(`kind.${talent.kind}`)}</b>}')
    expect(kindChipInShell(broken)).toBe(true)
  })
})
