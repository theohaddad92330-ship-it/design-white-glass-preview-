/**
 * #4288.6 — une case « Sélectionner … » a une CIBLE de 44 × 44 px, mesurable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE (le brief la rattache à GA-35 / GA-32)
 * ─────────────────────────────────────────────────────────────────────────
 * Recette de production du 27/10 : les trois cases du classement de comptes de Laura mesurent 16 × 16 px.
 * Le composant `Checkbox` (`packages/ui`) étend sa zone de clic dans un pseudo-élément `after:` — invisible à
 * une mesure de boîte, et invisible à toute garde qui lit le JSX : AUCUNE garde ne voyait ces cases (GA-35
 * regarde les `div` cliquables, GA-32 les boutons icône). Une case de sélection pose donc sa cible EN CLAIR :
 * un `<label>` de 44 px (`size-11`) qui porte la case, la case restant petite à l'écran.
 *
 * Un cliquet : les cases de sélection de tableaux listées ci-dessous (hors du lot #4288) restent à porter ;
 * la liste ne grossit pas, et le bloc de chat n'en fait jamais partie.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Les fichiers dont une case « Sélectionner » n'a pas encore sa cible de 44 px. Ne grossit pas. */
const FROZEN_UNPORTED = new Set<string>([
  'features/accounts/view/accounts-list/AccountTableRow.tsx',
  'features/consultants/view/VivierCardList.tsx',
  'features/consultants/view/VivierTableRow.tsx',
  'features/consultants/view/reverse-market/ReverseMarketPage.tsx',
  'features/contacts/view/contacts-list/ContactTableRow.tsx',
])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/** Les cases de sélection (`aria-label` en `…selectAria`) qui n'ont pas de cible `size-11` juste autour d'elles. */
export function unportedSelectionCheckboxes(source: string): number {
  let missing = 0
  for (const match of source.matchAll(/<Checkbox\b/g)) {
    const at = match.index ?? 0
    const tag = source.slice(at, source.indexOf('/>', at) + 2)
    if (!/selectAria/.test(tag)) continue
    const before = source.slice(Math.max(0, at - 400), at)
    const wrapper = before.lastIndexOf('<label')
    if (wrapper < 0 || !/\bsize-11\b|\bmin-h-11\b[^"]*\bmin-w-11\b/.test(before.slice(wrapper))) missing += 1
  }
  return missing
}

describe('#4288.6 — la case de sélection a sa cible de 44 px', () => {
  it('sait dire NON : une case nue, une case dans une enveloppe trop petite', () => {
    expect(unportedSelectionCheckboxes(`<Checkbox aria-label={t('x.selectAria')} />`)).toBe(1)
    expect(
      unportedSelectionCheckboxes(`<label className="flex"><Checkbox aria-label={t('x.selectAria')} /></label>`),
    ).toBe(1)
  })

  it('sait dire OUI, et ignore une case qui ne sélectionne pas', () => {
    expect(
      unportedSelectionCheckboxes(
        `<label className="flex size-11 items-center"><Checkbox aria-label={t('x.selectAria')} /></label>`,
      ),
    ).toBe(0)
    expect(unportedSelectionCheckboxes(`<Checkbox aria-label={t('x.consent')} />`)).toBe(0)
  })

  it('lit quelque chose : le classement de comptes de Laura porte une case de sélection', () => {
    const file = join(SRC, 'features/chat/view/reply-blocks/AccountRankingCard.tsx')
    expect(readFileSync(file, 'utf8')).toMatch(/<Checkbox[\s\S]{0,300}selectAria/)
  })

  it('le bloc de chat a sa cible, et la liste des cases à porter ne grossit pas', () => {
    const offenders = new Set<string>()
    for (const file of sourceFiles(SRC)) {
      if (unportedSelectionCheckboxes(readFileSync(file, 'utf8')) > 0) offenders.add(relative(SRC, file))
    }
    expect([...offenders].filter(f => f.startsWith('features/chat/'))).toEqual([])
    expect([...offenders].filter(f => !FROZEN_UNPORTED.has(f))).toEqual([])
  })
})
