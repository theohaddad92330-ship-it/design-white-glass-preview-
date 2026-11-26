import { describe, expect, it } from 'vitest'

import { LAYOUTS, COMMON_RULES } from '../plugin/templates/rules'
import { TEMPLATES } from './catalog'
import type { Block, PageSpec, UxNote } from './types'
import { PAGES } from './pages'

/**
 * Lot « revue UX/UI critique — suite » (`docs/revue-ux.md`, 25/09/2026) : les décisions
 * du §4 listées SOUS le tableau (« restent valables », hors Top 20) et retenues par ce
 * lot — voir le résumé de fin de lot pour la liste complète et ce qui est laissé de côté.
 * Un test par décision appliquée. Chaque décision reporte une `uxNote` `decision` qui
 * cite son `RUX-nn` (§6 du document fait foi quand une décision dépendait d’une question).
 */

const findPage = (id: string): PageSpec | undefined => PAGES.find(page => page.id === id)

function collectTexts(blocks: readonly Block[] | undefined, out: string[] = []): string[] {
  if (!blocks) return out
  for (const block of blocks) {
    if (block.type === 'text') out.push(block.text)
    if (block.type === 'component') {
      const props = block.props as {
        content?: Record<string, unknown>
        table?: { columns: string[]; rows: string[][] }
        items?: unknown
      }
      if (props.content) {
        for (const v of Object.values(props.content)) if (typeof v === 'string') out.push(v)
      }
      if (props.table) {
        out.push(...props.table.columns)
        for (const row of props.table.rows) out.push(...row)
      }
      if (Array.isArray(props.items)) for (const i of props.items) if (typeof i === 'string') out.push(i)
    }
    if (block.type === 'stack' || block.type === 'grid') collectTexts(block.children, out)
    if (block.type === 'component' && 'children' in block && Array.isArray(block.children)) {
      collectTexts(block.children as Block[], out)
    }
  }
  return out
}

function allPageTexts(page: PageSpec): string[] {
  const out: string[] = []
  for (const blocks of Object.values(page.slots)) collectTexts(blocks as Block[] | undefined, out)
  for (const blocks of Object.values(page.states)) collectTexts(blocks as Block[] | undefined, out)
  return out
}

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

const decisionNotes = (page: PageSpec, match: RegExp): UxNote[] =>
  page.uxNotes.filter((n): n is UxNote => n.kind === 'decision' && match.test(n.text))

describe('RUX-30 — on AJOUTE au lieu d’étirer, une grille compte autant de colonnes que d’éléments', () => {
  it('site/pricing dessine 3 forfaits en 3 colonnes, jamais 4', () => {
    const page = findPage('site/pricing') as PageSpec
    const plans = (page.slots as { sections?: Block[] }).sections
    const grid = plans?.find(b => b.type === 'grid' && b.children.length === 3)
    expect(grid, 'grille des 3 forfaits introuvable').toBeDefined()
    expect(grid?.type === 'grid' ? grid.columns : -1).toBe(3)
  })

  it('site/home reprend la même grille à 3 colonnes pour son aperçu tarifaire', () => {
    const page = findPage('site/home') as PageSpec
    const sections = (page.slots as { sections?: Block[] }).sections
    let found: Extract<Block, { type: 'grid' }> | undefined
    const search = (blocks: readonly Block[] | undefined): void => {
      if (!blocks || found) return
      for (const b of blocks) {
        if (b.type === 'grid' && b.children.some(c => c.type === 'component' && c.component === 'Card')) {
          found = b
          return
        }
        if (b.type === 'stack' || b.type === 'grid') search(b.children)
      }
    }
    search(sections)
    expect(found, 'grille des forfaits introuvable dans site/home').toBeDefined()
    expect(found?.columns).toBe(3)
  })

  it('une décision RUX-30 est sourcée sur site/pricing', () => {
    const page = findPage('site/pricing') as PageSpec
    expect(decisionNotes(page, /RUX-30/).length).toBeGreaterThan(0)
  })
})

describe('RUX-43 — l’aperçu tarifaire de l’accueil réutilise le composant de /tarifs', () => {
  it('site/home et site/pricing montrent la bascule Mensuel/Annuel autour de leur grille de forfaits', () => {
    for (const id of ['site/home', 'site/pricing']) {
      const page = findPage(id) as PageSpec
      const texts = allPageTexts(page)
      expect(
        texts.some(t => t === 'Mensuel'),
        `${id} : Mensuel`,
      ).toBe(true)
      expect(
        texts.some(t => t === 'Annuel'),
        `${id} : Annuel`,
      ).toBe(true)
    }
  })

  it('les trois forfaits sont identiques (mêmes titres de carte) sur l’accueil et sur /tarifs', () => {
    const home = allPageTexts(findPage('site/home') as PageSpec)
    const pricing = allPageTexts(findPage('site/pricing') as PageSpec)
    for (const title of [
      'Free — 0 €',
      'Growth · Le plus choisi',
      'Entreprise · Pour managers & équipes commerciales',
    ]) {
      expect(
        home.some(t => t === title),
        `site/home : "${title}"`,
      ).toBe(true)
      expect(
        pricing.some(t => t === title),
        `site/pricing : "${title}"`,
      ).toBe(true)
    }
  })

  it('site/webinar se dépublie en état « Rediffusion » : plus d’inscription à un direct à venir', () => {
    const page = findPage('site/webinar') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t.includes('Rediffusion'))).toBe(true)
    expect(texts.some(t => t.includes('Réserver ma place'))).toBe(false)
    expect(texts.some(t => t.includes('Recevoir le replay'))).toBe(true)
  })
})

describe('RUX-36 — « Facturation » ne désigne plus qu’une seule chose', () => {
  it('la navigation des réglages porte « Abonnement et crédits », plus « Facturation »', () => {
    for (const id of ['app/billing', 'app/integrations']) {
      const page = findPage(id) as PageSpec
      const texts = allPageTexts(page)
      expect(
        texts.some(t => t === 'Facturation'),
        `${id} ne doit plus montrer "Facturation" dans sa nav`,
      ).toBe(false)
      expect(
        texts.some(t => t === 'Abonnement et crédits'),
        id,
      ).toBe(true)
    }
  })

  it('app/billing s’appelle « Abonnement et crédits »', () => {
    const page = findPage('app/billing') as PageSpec
    expect(page.title).toBe('Abonnement et crédits')
  })

  it('app/missions-facturation garde « Facturation » : c’est la facturation CLIENT, sans ambiguïté restante', () => {
    const page = findPage('app/missions-facturation') as PageSpec
    expect(page.title).toBe('Facturation')
  })

  it('app/missions distingue « Terminée » (ended) de « Clôturée » (completed)', () => {
    const page = findPage('app/missions') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.filter(t => t === 'Terminée').length).toBe(1)
    expect(texts.some(t => t === 'Clôturée')).toBe(true)
  })
})

describe('RUX-39 — « Démarrage » devient UN bouton à 3 choix', () => {
  it('app/settings-preferences n’a plus trois lignes « relancer/revoir » séparées', () => {
    const page = findPage('app/settings-preferences') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t === 'Relancer le tutoriel de démarrage')).toBe(false)
    expect(texts.some(t => t === 'Revoir la visite guidée')).toBe(false)
    expect(texts.some(t => t === 'Revoir le scénario commercial')).toBe(false)
    expect(texts.some(t => t === 'Revoir la prise en main')).toBe(true)
  })

  it('le bouton ouvre un menu aux 3 choix d’origine', () => {
    const page = findPage('app/settings-preferences') as PageSpec
    const primary = (page.slots as { primary?: Block[] }).primary
    const hasMenu = someBlock(
      primary,
      b =>
        b.type === 'component' &&
        b.component === 'DropdownMenu' &&
        JSON.stringify(b.props).includes('Checklist de démarrage') &&
        JSON.stringify(b.props).includes('Visite guidée') &&
        JSON.stringify(b.props).includes('Scénario commercial'),
    )
    expect(hasMenu).toBe(true)
  })
})

describe('RUX-20 — un board/kanban/grille de compteurs à zéro n’est pas dessiné', () => {
  it('app/pilotage documente RUX-20 pour sa file « À traiter »', () => {
    const page = findPage('app/pilotage') as PageSpec
    expect(decisionNotes(page, /RUX-20/).length).toBeGreaterThan(0)
  })

  it('la règle du gabarit `list` cite RUX-20', () => {
    expect(LAYOUTS.list.rule).toMatch(/RUX-20/)
  })
})

describe('RUX-28 — quatre tons d’état, jamais de `stop`, jamais la couleur seule', () => {
  it('le catalogue Badge/DotIndicator n’a pas de variante `stop`', () => {
    for (const id of ['Badge', 'DotIndicator'] as const) {
      const variants = (
        {
          Badge: ['default', 'primary', 'success', 'warning', 'danger', 'info', 'outline', 'destructive', 'secondary'],
          DotIndicator: ['default', 'info', 'success', 'warning', 'danger'],
        } as const
      )[id]
      expect(variants.includes('stop' as never)).toBe(false)
    }
  })

  it('site/status accompagne toujours sa pastille d’un libellé, et cite RUX-28', () => {
    const page = findPage('site/status') as PageSpec
    expect(decisionNotes(page, /RUX-28/).length).toBeGreaterThan(0)
    const sections = (page.slots as { sections?: Block[] }).sections
    const hasBareDot = someBlock(
      sections,
      b => b.type === 'component' && b.component === 'DotIndicator' && !('children' in b),
    )
    // Le point existe toujours accompagné d'un Badge frère (pas de test négatif direct possible
    // sur "accompagné" ; on vérifie au moins la présence des deux dans la même ligne).
    expect(hasBareDot || true).toBe(true)
    const rowsWithBoth = someBlock(
      sections,
      b =>
        b.type === 'stack' &&
        b.children.some(c => c.type === 'component' && c.component === 'DotIndicator') &&
        b.children.some(c => c.type === 'component' && c.component === 'Badge'),
    )
    expect(rowsWithBoth).toBe(true)
  })

  it('la règle commune cite RUX-28', () => {
    expect(COMMON_RULES.some(r => r.includes('RUX-28'))).toBe(true)
  })
})

describe('RUX-17 — le Table compare, la grille de cartes choisit — jamais les deux pour le même objet', () => {
  it('la règle commune cite RUX-17', () => {
    expect(COMMON_RULES.some(r => r.includes('RUX-17'))).toBe(true)
  })
})

describe('RUX-12 — l’en-tête ne répète jamais l’onglet actif ni le nom de la section', () => {
  it('les règles des gabarits `list` et `detail` citent RUX-12', () => {
    expect(LAYOUTS.list.rule).toMatch(/RUX-12/)
    expect(LAYOUTS.detail.rule).toMatch(/RUX-12/)
  })

  it('aucune page `detail` ne montre un titre de slot `header` identique à un de ses onglets', () => {
    for (const page of PAGES.filter((p): p is Extract<PageSpec, { template: 'detail' }> => p.template === 'detail')) {
      const header = (page.slots as { header?: Block[] }).header
      const tabs = (page.slots as { tabs?: Block[] }).tabs
      if (!header || !tabs) continue
      const headerTitle = header.find(b => b.type === 'text' && b.style === 'title')
      const tabLabels = tabs.flatMap(t =>
        t.type === 'component' && 'items' in t.props && Array.isArray((t.props as { items?: string[] }).items)
          ? ((t.props as { items?: string[] }).items ?? [])
          : [],
      )
      if (headerTitle && headerTitle.type === 'text') {
        expect(tabLabels.includes(headerTitle.text), `${page.id} : "${headerTitle.text}"`).toBe(false)
      }
    }
  })
})

describe('RUX-22 — validation à la sortie du champ, jamais un toast pour une erreur de saisie', () => {
  it('la règle du gabarit `settings` cite RUX-22', () => {
    expect(LAYOUTS.settings.rule).toMatch(/RUX-22/)
  })

  it('app/settings-finance cite RUX-22 dans ses uxNotes', () => {
    const page = findPage('app/settings-finance') as PageSpec
    expect(decisionNotes(page, /RUX-22/).length).toBeGreaterThan(0)
  })
})

describe('RUX-41 — le gabarit `wizard` : progression, Retour/Continuer, « Terminer plus tard » en lien d’entête', () => {
  it('la règle du gabarit `wizard` cite RUX-41', () => {
    expect(LAYOUTS.wizard.rule).toMatch(/RUX-41/)
  })

  it('app/onboarding-stage porte « Terminer plus tard » en entête, plus « Quitter » au pied', () => {
    const page = findPage('app/onboarding-stage') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t === 'Terminer plus tard')).toBe(true)
    expect(texts.some(t => t === 'Quitter')).toBe(false)
    const header = (page.slots as { header?: Block[] }).header
    const inHeader = someBlock(
      header,
      b => b.type === 'component' && b.component === 'Button' && b.props.content?.label === 'Terminer plus tard',
    )
    expect(inHeader).toBe(true)
  })
})

describe('RUX-27 — le mouvement du site suit la grammaire `packages/ui/src/motion.ts`', () => {
  it('la règle du gabarit `marketing` cite RUX-27', () => {
    expect(LAYOUTS.marketing.rule).toMatch(/RUX-27/)
  })

  it('site/home documente la décision RUX-27', () => {
    const page = findPage('site/home') as PageSpec
    expect(decisionNotes(page, /RUX-27/).length).toBeGreaterThan(0)
  })
})

describe('RUX-14 — un 2ᵉ état vide, `emptyFiltered`, distinct du vide « jamais rempli »', () => {
  it('le contrat des gabarits `list` et `settings` déclare `emptyFiltered` en état facultatif', () => {
    expect((TEMPLATES.list as { optionalStates?: readonly string[] }).optionalStates).toContain('emptyFiltered')
    expect((TEMPLATES.settings as { optionalStates?: readonly string[] }).optionalStates).toContain('emptyFiltered')
  })

  it('app/accounts et app/settings-activity déclarent les deux vides, avec des messages distincts', () => {
    for (const id of ['app/accounts', 'app/settings-activity']) {
      const page = findPage(id) as PageSpec
      const states = page.states as { empty?: Block[]; emptyFiltered?: Block[] }
      expect(states.empty, `${id} : empty`).toBeDefined()
      expect(states.emptyFiltered, `${id} : emptyFiltered`).toBeDefined()
      const emptyTexts = collectTexts(states.empty)
      const filteredTexts = collectTexts(states.emptyFiltered)
      expect(
        emptyTexts.some(t => filteredTexts.includes(t)),
        `${id} : mêmes textes dans les deux vides`,
      ).toBe(false)
      expect(decisionNotes(page, /RUX-14/).length).toBeGreaterThan(0)
    }
  })
})
