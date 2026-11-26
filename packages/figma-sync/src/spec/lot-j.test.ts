import { describe, expect, it } from 'vitest'
import type { Block, PageSpec } from './types'
import { APP_PAGES } from './pages/app'

/**
 * Lot J — cinq specs trouvées incomplètes par l'audit (registre du lot) :
 * des sections/onglets entiers du code réel n'avaient aucune trace dans la
 * spec. Ce test compte les blocs attendus ; il échoue tant qu'ils manquent.
 */

const findPage = (id: string): PageSpec | undefined => APP_PAGES.find(page => page.id === id)

/** Le slot `primary`, quel que soit le gabarit de la page (tous ne le déclarent pas). */
const primaryOf = (page: PageSpec | undefined): Block[] | undefined =>
  (page?.slots as { primary?: Block[] } | undefined)?.primary

/** Compte tous les blocs de l'arbre (bloc courant inclus), récursivement. */
function countBlocks(blocks: readonly Block[] | undefined): number {
  if (!blocks) return 0
  let total = 0
  for (const block of blocks) {
    total += 1
    if (block.type === 'stack' || block.type === 'grid') total += countBlocks(block.children)
    if (block.type === 'component' && 'children' in block && Array.isArray(block.children)) {
      total += countBlocks(block.children as Block[])
    }
  }
  return total
}

/** Vrai si un bloc de l'arbre (à toute profondeur) satisfait le prédicat. */
function someBlock(blocks: readonly Block[] | undefined, predicate: (block: Block) => boolean): boolean {
  if (!blocks) return false
  for (const block of blocks) {
    if (predicate(block)) return true
    if (block.type === 'stack' || block.type === 'grid') {
      if (someBlock(block.children, predicate)) return true
    }
    if (block.type === 'component' && 'children' in block && Array.isArray(block.children)) {
      if (someBlock(block.children as Block[], predicate)) return true
    }
  }
  return false
}

describe('app/accounts-detail — les sept sections (D8, #2115)', () => {
  const sectionIds = [
    'app/accounts-detail',
    'app/accounts-detail-perimetres',
    'app/accounts-detail-opportunites',
    'app/accounts-detail-personnes',
    'app/accounts-detail-ecosysteme-acces',
    'app/accounts-detail-plan-action',
    'app/accounts-detail-historique-preuves',
  ]

  it.each(sectionIds)('%s existe, au gabarit `detail`, avec un contenu réel', id => {
    const page = findPage(id)
    expect(page, id).toBeDefined()
    expect(page?.template).toBe('detail')
    expect(countBlocks(primaryOf(page))).toBeGreaterThanOrEqual(4)
  })
})

describe('app/accounts-partners — les trois onglets (tome 4 §13)', () => {
  const tabIds = ['app/accounts-partners', 'app/accounts-partners-a-decouvrir', 'app/accounts-partners-sur-mes-comptes']

  it.each(tabIds)('%s existe avec un contenu réel', id => {
    const page = findPage(id)
    expect(page, id).toBeDefined()
    expect(countBlocks(primaryOf(page))).toBeGreaterThanOrEqual(3)
  })
})

describe('app/settings-knowledge — les cinq onglets', () => {
  const tabIds = [
    'app/settings-knowledge',
    'app/settings-knowledge-templates',
    'app/settings-knowledge-playbooks',
    'app/settings-knowledge-methode',
    'app/settings-knowledge-donnees-crm',
  ]

  it.each(tabIds)('%s existe avec un contenu réel', id => {
    const page = findPage(id)
    expect(page, id).toBeDefined()
    expect(countBlocks(primaryOf(page))).toBeGreaterThanOrEqual(3)
  })
})

describe('app/projects-needs-detail — le bloc « Laura recommande »', () => {
  it('la synthèse porte la recommandation de Laura', () => {
    const page = findPage('app/projects-needs-detail')
    expect(page).toBeDefined()
    const found = someBlock(primaryOf(page), block => {
      if (block.type === 'text') return block.text.includes('Laura recommande')
      if (block.type === 'component' && 'props' in block) {
        const content = (block.props as { content?: { title?: string } }).content
        return Boolean(content?.title?.includes('Laura recommande'))
      }
      return false
    })
    expect(found).toBe(true)
  })
})
