import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

/**
 * #4966 (recoupe #4944 / #4788, ouvertes) — une réponse de Laura ne fait jamais défiler la PAGE en X.
 * jsdom ne mesure aucune mise en page : on prouve donc la BORNE posée sur chaque contenu qui peut
 * dépasser (tableau large, bloc de code, URL longue, code en ligne) — le défilement, s'il y en a un,
 * reste DANS le bloc ; le texte, lui, se coupe où il faut.
 */
const LONG_URL = `https://exemple.test/${'segment-tres-long/'.repeat(12)}fin`
const WIDE_ROW = Array.from({ length: 14 }, (_, i) => `colonne-${i}-avec-un-intitulé-large`)

const MARKDOWN = [
  `Voir ${LONG_URL} pour le détail, ou [${LONG_URL}](${LONG_URL}).`,
  '',
  `Un identifiant \`${'identifiant_sans_espace_'.repeat(8)}\` en ligne.`,
  '',
  `| ${WIDE_ROW.join(' | ')} |`,
  `| ${WIDE_ROW.map(() => '---').join(' | ')} |`,
  `| ${WIDE_ROW.map((_, i) => `valeur-${i}`).join(' | ')} |`,
  '',
  '```',
  `${'x'.repeat(300)}`,
  '```',
].join('\n')

describe('#4966 — contenu large dans une réponse', () => {
  let container: HTMLElement
  beforeEach(() => {
    container = render(<>{renderMarkdown(MARKDOWN)}</>).container
  })

  it('le tableau défile dans son cadre, pas dans la page', () => {
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.parentElement?.className).toContain('overflow-x-auto')
  })

  it('le bloc de code défile dans son cadre', () => {
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto')
  })

  it('le texte se coupe n’importe où plutôt que de pousser la colonne (URL, code en ligne)', () => {
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('[overflow-wrap:anywhere]')
    const link = container.querySelector('a')
    expect(container.textContent).toContain(LONG_URL)
    expect(link?.className).toContain('[overflow-wrap:anywhere]')
    const inlineCode = container.querySelector('p code, div > code, span code, code:not(pre code)')
    expect(inlineCode?.className).toContain('[overflow-wrap:anywhere]')
  })
})
