import { describe, expect, it } from 'vitest'

import { RECIPES } from '../plugin/components'
import { SIDEBAR_ITEMS } from '../plugin/components/recipes/navigation'
import type { Part } from '../plugin/components/recipe'
import { visibleColumnIndices } from '../plugin/pages/render'
import { COMMON_RULES, LAYOUTS, RESPONSIVE_RULES } from '../plugin/templates/rules'
import { COMPONENTS } from './catalog'
import { OVERLAYS } from './overlays'
import { SETTINGS_SECTION_NAV } from './pages/app/settings-shared'
import { TOKENS_THEME_NOTE } from './pages/site/shared'
import { columnLabel, columnMobileRole, columnPriority } from './types'
import type { Block, PageSpec, TableColumn } from './types'
import { PAGES } from './pages'

/**
 * Lot « revue UX/UI critique » (`docs/revue-ux.md`, 25/09/2026) : les arbitrages du
 * fondateur (§6) et une partie du Top 20 (§4), appliqués à la MAQUETTE — la cible,
 * pas le miroir du code. Un test par décision appliquée dans ce lot.
 */

const findPage = (id: string): PageSpec | undefined => PAGES.find(page => page.id === id)

/** Tout le texte visible d'une page (slots + états), toutes profondeurs confondues. */
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

/** Tous les textes d'une page : ses slots ET ses états. */
function allPageTexts(page: PageSpec): string[] {
  const out: string[] = []
  for (const blocks of Object.values(page.slots)) collectTexts(blocks as Block[] | undefined, out)
  for (const blocks of Object.values(page.states)) collectTexts(blocks as Block[] | undefined, out)
  return out
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

describe('Q8 — le score RFP ne se lit plus sur 100 (rules-08)', () => {
  it('aucune page ne montre un score de fit « n/100 » (une ratio d’usage comme un quota reste hors de cette règle)', () => {
    for (const page of PAGES) {
      const hit = allPageTexts(page).find(t => /\bfit\b.*\d+\s*\/\s*100\b/i.test(t))
      expect(hit, `${page.id} : "${hit}"`).toBeUndefined()
    }
  })
})

describe('RUX-42 — trois intentions, trois libellés, trois destinations sur le site', () => {
  const BANNED = [
    'Demander une démo',
    'Voir la démo',
    'Explorer la démo',
    'Choisir une offre',
    'Choisir Growth',
    'Voir la démonstration',
  ]

  it('aucune page du site ne montre plus un des anciens libellés ambigus', () => {
    for (const page of PAGES.filter(p => p.surface === 'site')) {
      const texts = allPageTexts(page)
      for (const banned of BANNED) {
        expect(
          texts.some(t => t.includes(banned)),
          `${page.id} : "${banned}"`,
        ).toBe(false)
      }
    }
  })

  it('site/home montre les trois libellés canoniques', () => {
    const texts = allPageTexts(findPage('site/home') as PageSpec)
    for (const label of ['Créer mon compte', 'Essayer la démo', 'Parler à l’équipe']) {
      expect(
        texts.some(t => t.includes(label)),
        label,
      ).toBe(true)
    }
  })

  it('site/demo est devenu la page « Parler à l’équipe »', () => {
    const page = findPage('site/demo') as PageSpec
    expect(page.title).toBe('Parler à l’équipe')
    expect(allPageTexts(page).some(t => t.includes('Parler à l’équipe'))).toBe(true)
  })
})

describe('RUX-29/Q4 — on n’affiche pas ce qu’on n’a pas (docs/revue-ux.md T15)', () => {
  it('la règle du gabarit `dashboard` ne parle plus de « non mesuré » comme valeur affichée', () => {
    expect(LAYOUTS.dashboard.rule).not.toMatch(/s’écrit « non mesuré »/)
    expect(LAYOUTS.dashboard.rule).toMatch(/ne se dessine PAS/)
  })

  it('app/missions-cessions ne montre plus trois tuiles « Non mesuré » côte à côte', () => {
    const texts = allPageTexts(findPage('app/missions-cessions') as PageSpec)
    const unmeasuredCount = texts.filter(t => /non mesuré/i.test(t) && !/RUX-29/.test(t)).length
    expect(unmeasuredCount).toBe(0)
  })

  it('app/projects-needs-detail n’a plus de pastille « non mesuré » (une DataRow d’axe nommée la remplace)', () => {
    const page = findPage('app/projects-needs-detail') as PageSpec
    const summary = (page.slots as { summary?: Block[] }).summary
    const hasUnmeasuredBadge = someBlock(
      summary,
      b => b.type === 'component' && b.component === 'Badge' && Boolean(b.props.content?.label?.includes('non mesuré')),
    )
    expect(hasUnmeasuredBadge).toBe(false)
  })

  it('app/accounts : le tableau « Compte exemple N » n’est pas une violation — le pipeline de démo (`demo-fill.ts`, défaut B) le remplit à six comptes réels au rendu ; ce test le vérifie plutôt que de le réécrire en dur', () => {
    const page = findPage('app/accounts') as PageSpec
    const primary = (page.slots as { primary?: Block[] }).primary
    const table = primary?.find(b => b.type === 'component' && b.component === 'Table')
    expect(table?.type === 'component' && table.component === 'Table').toBe(true)
    const t = table && table.type === 'component' && table.component === 'Table' ? table.props.table : undefined
    expect(t?.rows.some(row => /^Compte exemple/.test(row[0]))).toBe(true)
    // Chaque colonne annoncée est couverte par le pipeline de démo (COLUMNS de demo-fill.ts) —
    // sinon une colonne resterait vide au rendu malgré le jeu de démonstration.
    const covered = [/compte/i, /score/i, /accessibilit/i, /derni[eè]re analyse/i, /signal/i, /prochaine action/i]
    for (const col of t?.columns ?? []) {
      const label = columnLabel(col)
      expect(
        covered.some(re => re.test(label)),
        `colonne non couverte par demo-fill : "${label}"`,
      ).toBe(true)
    }
  })
})

describe('Q6 — le site cible le thème clair, Geist, Clash Display au seul hero, violet primary-500', () => {
  it('site/home documente la décision (RUX-01 à 04) en uxNote sourcée', () => {
    const page = findPage('site/home') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('Clash Display'))
    expect(note, 'uxNote Q6 introuvable').toBeDefined()
    expect(note?.text).toMatch(/primary-500/)
    expect(note?.text).toMatch(/thème clair/)
    expect(note?.source).toMatch(/^[^:]+:\d+$/)
  })
})

describe('Q2/RUX-32 — le dossier de compte tient en cinq onglets stables', () => {
  const CANONICAL = ['Synthèse', 'Personnes', 'Plan d’action', 'Signaux', 'Historique']
  const SEVEN_SECTION_IDS = [
    'app/accounts-detail',
    'app/accounts-detail-perimetres',
    'app/accounts-detail-opportunites',
    'app/accounts-detail-personnes',
    'app/accounts-detail-ecosysteme-acces',
    'app/accounts-detail-plan-action',
    'app/accounts-detail-historique-preuves',
  ]

  const tabNavItems = (page: PageSpec): string[][] => {
    const tabs = (page.slots as { tabs?: Block[] }).tabs ?? []
    return tabs
      .filter(
        (b): b is Extract<Block, { type: 'component'; component: 'TabNav' }> =>
          b.type === 'component' && b.component === 'TabNav',
      )
      .map(b => b.props.items ?? [])
  }

  it.each(SEVEN_SECTION_IDS)('%s montre CINQ onglets stables, jamais sept', id => {
    const page = findPage(id) as PageSpec
    expect(page).toBeDefined()
    const [primaryTabs] = tabNavItems(page)
    expect(primaryTabs).toEqual(CANONICAL)
  })

  it('les onglets Synthèse et Personnes portent un sommaire d’ancres vers l’onglet absorbé qu’ils portent', () => {
    const synthese = findPage('app/accounts-detail') as PageSpec
    const personnes = findPage('app/accounts-detail-personnes') as PageSpec
    const syntheseTexts = allPageTexts(synthese)
    const personnesTexts = allPageTexts(personnes)
    expect(syntheseTexts.some(t => t.includes('Périmètres'))).toBe(true)
    expect(personnesTexts.some(t => t.includes('Écosystème & accès'))).toBe(true)
  })

  it('chaque frame absorbé documente son ancrage RUX-32 en uxNote decision', () => {
    for (const id of ['app/accounts-detail-perimetres', 'app/accounts-detail-ecosysteme-acces']) {
      const page = findPage(id) as PageSpec
      const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-32'))
      expect(note, `${id} : uxNote RUX-32 introuvable`).toBeDefined()
      expect(note?.text).toMatch(/bloc ANCRÉ/)
    }
  })

  it('« Opportunités » est devenue « Signaux » (même contenu, libellé aligné)', () => {
    const page = findPage('app/accounts-detail-opportunites') as PageSpec
    expect(page.title).toBe('Dossier compte — Signaux')
    expect(allPageTexts(page).some(t => t.includes('Signaux'))).toBe(true)
  })
})

describe('Q3 — « Envoyer » un e-mail reste par notre relais, inchangé', () => {
  it('le dialogue de confirmation d’envoi documente l’examen Q3 en uxNote decision', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/envoyer-email')
    expect(overlay, 'surcouche envoyer-email introuvable').toBeDefined()
    const note = overlay?.uxNotes.find(n => n.kind === 'decision' && n.text.includes('Q3'))
    expect(note, 'uxNote Q3 introuvable').toBeDefined()
    expect(note?.text).toMatch(/notre relais/i)
    expect(note?.source).toMatch(/^[^:]+:\d+$/)
  })

  it('la règle « Laura prépare, le commercial envoie » reste documentée sur ce dialogue', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/envoyer-email')
    const decisionTexts = overlay?.uxNotes.map(n => n.text).join(' ') ?? ''
    expect(decisionTexts).toMatch(/le commercial qui envoie/)
  })
})

describe('Q5/RUX-40 — onboarding « valeur d’abord » : deux champs, puis l’analyse', () => {
  it('app/onboarding-company lance directement l’analyse depuis son pied, jamais « Continuer » vers plus de questions', () => {
    const page = findPage('app/onboarding-company') as PageSpec
    const footerTexts = collectTexts((page.slots as { footer?: Block[] }).footer)
    expect(footerTexts.some(t => t.includes('Lancer ma première analyse'))).toBe(true)
    expect(footerTexts.includes('Continuer')).toBe(false)
  })

  it('app/onboarding-company porte le champ « rôle », son deuxième et dernier champ obligatoire', () => {
    const page = findPage('app/onboarding-company') as PageSpec
    const found = someBlock(
      (page.slots as { primary?: Block[] }).primary,
      b => b.type === 'component' && b.component === 'Select' && b.props.content?.label === 'Quel est ton rôle ?',
    )
    expect(found).toBe(true)
  })

  it('aucun écran de l’onboarding n’affiche de pourcentage de progression (jamais lu comme une chance)', () => {
    for (const id of ['app/onboarding-stage', 'app/onboarding-generating']) {
      const page = findPage(id) as PageSpec
      const hit = allPageTexts(page).find(t => /\d+\s*%/.test(t))
      expect(hit, `${id} : "${hit}"`).toBeUndefined()
    }
  })

  it('app/onboarding-stage compte les questions restantes et se documente comme facultatif (RUX-40)', () => {
    const page = findPage('app/onboarding-stage') as PageSpec
    expect(allPageTexts(page).some(t => /restantes?/.test(t))).toBe(true)
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-40'))
    expect(note, 'uxNote RUX-40 introuvable').toBeDefined()
    expect(note?.text).toMatch(/facultatif/)
  })

  it('app/onboarding-generating propose le profil commercial pendant l’attente, en questions restantes', () => {
    const page = findPage('app/onboarding-generating') as PageSpec
    expect(allPageTexts(page).some(t => /profil/i.test(t) && /attente/i.test(t))).toBe(true)
    expect(allPageTexts(page).some(t => /questions restantes/.test(t))).toBe(true)
  })
})

describe('RUX-18/19 — trois composants d’état, une erreur qui ne se déguise jamais en vide', () => {
  it('la règle commune du chargement interdit un texte brut et un `Loader2` en dur', () => {
    const rule = COMMON_RULES.join(' ')
    expect(rule).toMatch(/Loader2.*interdit/)
    expect(rule).toMatch(/RUX-18/)
    expect(rule).toMatch(/RUX-19/)
  })

  it('aucune page ne dessine son état `loading` avec un simple bloc `text`', () => {
    for (const page of PAGES) {
      const loading = (page.states as { loading?: Block[] }).loading
      if (!loading) continue
      const hit = loading.find(b => b.type === 'text')
      expect(hit, `${page.id} : loading en texte brut`).toBeUndefined()
    }
  })

  it('app/missions-suivi : l’erreur ne porte plus le titre de l’état vide (le bug T7 exact)', () => {
    const page = findPage('app/missions-suivi') as PageSpec
    const errorTexts = collectTexts((page.states as { error?: Block[] }).error)
    expect(errorTexts.some(t => t === 'Aucune mission active pour l’instant.')).toBe(false)
    expect(errorTexts.some(t => /n’a pas pu être charg/.test(t))).toBe(true)
  })

  it('les pages `admin-table` (DM) déclarent toujours `loading` ET `error` (RUX-19, jamais d’écran blanc)', () => {
    const dmPages = PAGES.filter(p => p.surface === 'dm')
    expect(dmPages.length).toBeGreaterThan(0)
    for (const page of dmPages) {
      const states = page.states as Record<string, unknown>
      expect(states.loading, `${page.id} : pas de loading`).toBeDefined()
      expect(states.error, `${page.id} : pas d’error`).toBeDefined()
    }
  })
})

describe('RUX-15 — `Table` à rôles mobiles, fin de la règle « 2 premières colonnes »', () => {
  it('la règle responsive ne parle plus des « 2 premières colonnes », mais de priorité et de rôle', () => {
    const rule = RESPONSIVE_RULES.join(' ')
    expect(rule).not.toMatch(/seules les 2 premières colonnes restent visibles/)
    expect(rule).toMatch(/est retirée/)
    expect(rule).toMatch(/RUX-15/)
    expect(rule).toMatch(/PRIORITÉ/)
  })

  it('une colonne sans rôle déclaré (simple chaîne) retombe sur sa position — compatibilité', () => {
    const cols: TableColumn[] = ['A', 'B', 'C', 'D', 'E', 'F']
    expect(columnLabel(cols[0] as TableColumn)).toBe('A')
    expect(columnPriority(cols[2] as TableColumn, 2)).toBe(3)
    expect(columnMobileRole(cols[0] as TableColumn)).toBeUndefined()
    // ≥ 1024 : toutes. 768–1023 : les 4 premières par position (priorité = position par défaut). < 768 : les 2 premières.
    expect(visibleColumnIndices(1440, cols)).toEqual(new Set([0, 1, 2, 3, 4, 5]))
    expect(visibleColumnIndices(900, cols)).toEqual(new Set([0, 1, 2, 3]))
    expect(visibleColumnIndices(390, cols)).toEqual(new Set([0, 1]))
  })

  it('une colonne de priorité haute mais en dernière position reste visible à 768–1023 (RUX-15)', () => {
    const cols: TableColumn[] = [
      { label: 'Compte' },
      { label: 'Score', priority: 5 },
      { label: 'Ville', priority: 6 },
      { label: 'Secteur', priority: 4 },
      { label: 'Effectif', priority: 3 },
      { label: 'Prochaine action', priority: 2 },
    ]
    // priorités : Compte(1, position par défaut), Prochaine action(2), Effectif(3), Secteur(4) — pas Score ni Ville.
    expect(visibleColumnIndices(900, cols)).toEqual(new Set([0, 3, 4, 5]))
  })

  it('sous 768, les colonnes de rôle title/meta forment la carte-ligne — jamais les colonnes hidden', () => {
    const cols: TableColumn[] = [
      { label: 'Compte', mobile: 'title' },
      { label: 'Interne', mobile: 'hidden' },
      { label: 'Prochaine action', mobile: 'meta' },
      { label: 'Secteur', mobile: 'field' },
    ]
    expect(visibleColumnIndices(390, cols)).toEqual(new Set([0, 2]))
  })
})

describe('RUX-35 — chaque maillon de la chaîne mission s’ouvre filtré sur la mission', () => {
  const CHAIN_LINK_IDS = [
    'app/missions-cra',
    'app/missions-facturation',
    'app/missions-encaissements',
    'app/missions-cessions',
  ]

  it.each(CHAIN_LINK_IDS)('%s porte une pastille retirable « Mission : <nom> »', id => {
    const page = findPage(id) as PageSpec
    expect(page).toBeDefined()
    expect(allPageTexts(page).some(t => t.startsWith('Mission : '))).toBe(true)
  })

  it.each(CHAIN_LINK_IDS)('%s documente RUX-35 en uxNote decision', id => {
    const page = findPage(id) as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-35'))
    expect(note, `${id} : uxNote RUX-35 introuvable`).toBeDefined()
    expect(note?.text).toMatch(/\?mission=<id>/)
  })

  it('app/mission-dossier documente que ses cinq maillons ouvrent filtrés (RUX-35)', () => {
    const page = findPage('app/mission-dossier') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-35'))
    expect(note, 'uxNote RUX-35 introuvable').toBeDefined()
    expect(note?.text).toMatch(/cinq maillons/)
  })
})

describe('RUX-06 (site) — une seule borne de coque, 768 px', () => {
  it('les pages du site ne documentent plus un écart de borne à 1280 px, mais la décision RUX-06', () => {
    const sitePages = PAGES.filter(p => p.surface === 'site')
    expect(sitePages.length).toBeGreaterThan(0)
    for (const page of sitePages) {
      const stale = page.uxNotes.find(n => n.kind === 'ecart' && /bascule en menu hamburger sous 1280/.test(n.text))
      expect(stale, `${page.id} : ancien écart 1280 px encore présent`).toBeUndefined()
      const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-06'))
      expect(note, `${page.id} : uxNote RUX-06 introuvable`).toBeDefined()
      expect(note?.text).toMatch(/768 px/)
    }
  })
})

describe('RUX-21 — deux modèles d’enregistrement, jamais un bouton par champ', () => {
  const FIXED_IDS = [
    'app/settings-finance',
    'app/settings-commercial-load',
    'app/settings-reverse-market',
    'app/settings-pipeline',
  ]

  it('la règle du gabarit `settings` décrit les deux modèles (RUX-21)', () => {
    expect(LAYOUTS.settings.rule).toMatch(/RUX-21/)
    expect(LAYOUTS.settings.rule).toMatch(/jamais un bouton par champ/)
  })

  it.each(FIXED_IDS)('%s ne montre plus un bouton « Enregistrer » par champ', id => {
    const page = findPage(id) as PageSpec
    const primary = (page.slots as { primary?: Block[] }).primary
    const saveButtons = (blocks => {
      let count = 0
      const walk = (bs: readonly Block[] | undefined): void => {
        if (!bs) return
        for (const b of bs) {
          if (b.type === 'component' && b.component === 'Button' && b.props.content?.label === 'Enregistrer') count += 1
          if (b.type === 'stack' || b.type === 'grid') walk(b.children)
          if (b.type === 'component' && 'children' in b && Array.isArray(b.children)) walk(b.children as Block[])
        }
      }
      walk(blocks)
      return count
    })(primary)
    expect(saveButtons, `${id} : ${saveButtons} bouton(s) « Enregistrer »`).toBe(1)
  })

  it.each(FIXED_IDS)('%s documente RUX-21 en uxNote decision', id => {
    const page = findPage(id) as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-21'))
    expect(note, `${id} : uxNote RUX-21 introuvable`).toBeDefined()
  })

  it('app/settings-reverse-market : la bascule s’enregistre immédiatement, indicateur « Enregistré », pas de bouton', () => {
    const page = findPage('app/settings-reverse-market') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t === 'Enregistré')).toBe(true)
  })
})

describe('RUX-09 — « Laura » dans la barre latérale, en première position (D82)', () => {
  it('la première entrée de la Sidebar est « Laura », plus « copilote »', () => {
    expect(SIDEBAR_ITEMS[0]?.[0]).toBe('Laura')
    expect(SIDEBAR_ITEMS.some(([label]) => label === 'copilote')).toBe(false)
  })
})

describe('RUX-05/26 — deux densités nommées, Confort (app) et Compact (DM)', () => {
  it('le catalogue expose `density` sur `Table` : `comfort` et `compact`, rien de plus', () => {
    expect(COMPONENTS.Table.variants.density).toEqual(['comfort', 'compact'])
  })

  it('la règle commune décrit les deux densités et interdit tout en dessous de 12 px', () => {
    const rule = COMMON_RULES.join(' ')
    expect(rule).toMatch(/RUX-05\/26/)
    expect(rule).toMatch(/Plus de 11 px nulle part/)
  })

  it('dm/audit déclare ses deux tableaux en densité `compact`', () => {
    const page = findPage('dm/audit') as PageSpec
    const primary = (page.slots as { primary?: Block[] }).primary
    const densities: unknown[] = []
    const walk = (bs: readonly Block[] | undefined): void => {
      if (!bs) return
      for (const b of bs) {
        if (b.type === 'component' && b.component === 'Table') densities.push(b.props.density)
        if (b.type === 'stack' || b.type === 'grid') walk(b.children)
        if (b.type === 'component' && 'children' in b && Array.isArray(b.children)) walk(b.children as Block[])
      }
    }
    walk(primary)
    expect(densities.length).toBeGreaterThan(0)
    expect(densities.every(d => d === 'compact')).toBe(true)
  })

  it('app/accounts déclare son tableau en densité `comfort` (le défaut app)', () => {
    const page = findPage('app/accounts') as PageSpec
    const primary = (page.slots as { primary?: Block[] }).primary
    const table = primary?.find(b => b.type === 'component' && b.component === 'Table')
    expect(table?.type === 'component' && table.component === 'Table' && table.props.density).toBe('comfort')
  })
})

describe('RUX-13 — grammaire de filtres en deux niveaux (Vues + FilterBar)', () => {
  it('la règle du gabarit `list` décrit les deux niveaux et interdit `Tabs` dans `actions`', () => {
    expect(LAYOUTS.list.rule).toMatch(/RUX-13/)
    expect(LAYOUTS.list.rule).toMatch(/`Tabs` est INTERDIT dans `actions`/)
  })

  it('app/accounts : `intro` porte UN `TabNav` underline de 5 vues + « Plus de vues ▾ », jamais un `pill` à 7', () => {
    const page = findPage('app/accounts') as PageSpec
    const intro = (page.slots as { intro?: Block[] }).intro ?? []
    const tabNavs = intro.filter(
      (b): b is Extract<Block, { type: 'component'; component: 'TabNav' }> =>
        b.type === 'component' && b.component === 'TabNav',
    )
    expect(tabNavs).toHaveLength(1)
    expect(tabNavs[0]?.props.variant).toBe('underline')
    const items = tabNavs[0]?.props.items ?? []
    expect(items.length).toBeLessThanOrEqual(6)
    expect(items.at(-1)).toBe('Plus de vues ▾')
  })

  it('app/accounts : `actions` ne porte plus de `Tabs` — un sous-ensemble n’est pas un verbe', () => {
    const page = findPage('app/accounts') as PageSpec
    const actions = (page.slots as { actions?: Block[] }).actions ?? []
    expect(actions.some(b => b.type === 'component' && b.component === 'Tabs')).toBe(false)
  })

  it('app/accounts documente RUX-13 en uxNote decision', () => {
    const page = findPage('app/accounts') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-13'))
    expect(note, 'uxNote RUX-13 introuvable').toBeDefined()
  })
})

describe('RUX-31 — une porte principale, « Analyser une entreprise », en tête de la Sidebar', () => {
  const findPart = (parts: readonly Part[], name: string): Part | undefined => {
    for (const p of parts) {
      if (p.name === name) return p
      if (p.kind === 'box') {
        const found = findPart(p.children, name)
        if (found) return found
      }
    }
    return undefined
  }

  it('expanded : un bouton `default` « Analyser une entreprise » sous le logo, avant la nav', () => {
    const tree = RECIPES.Sidebar.draw({ variant: 'sidebar', state: 'expanded' })
    const launch = findPart([tree], 'launch-analysis')
    expect(launch, 'bouton « Analyser une entreprise » introuvable').toBeDefined()
    expect(launch?.kind).toBe('ref')
    expect(launch?.kind === 'ref' ? launch.values?.size : undefined).toBe('default')
    expect(launch?.kind === 'ref' ? launch.content?.label : undefined).toBe('Analyser une entreprise')
  })

  it('réduite : le même bouton devient une icône `+`, sans libellé', () => {
    const tree = RECIPES.Sidebar.draw({ variant: 'sidebar', state: 'collapsed' })
    const launch = findPart([tree], 'launch-analysis')
    expect(launch?.kind === 'ref' ? launch.values?.size : undefined).toBe('icon')
    expect(launch?.kind === 'ref' ? launch.content?.label : undefined).toBeUndefined()
  })
})

describe('RUX-33 — une anatomie unique du panneau d’approche, quel que soit le canal', () => {
  it('app/overlays/panneau-approche existe : badge « Préparé par Laura », jamais « Envoyé par Laura »', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/panneau-approche')
    expect(overlay, 'surcouche panneau-approche introuvable').toBeDefined()
    const bodyTexts = (overlay?.body ?? []).flatMap(b =>
      b.type === 'component' ? Object.values(b.props.content ?? {}) : b.type === 'text' ? [b.text] : [],
    )
    expect(bodyTexts.some(t => t === 'Préparé par Laura')).toBe(true)
    expect(bodyTexts.some(t => t === 'Envoyé par Laura')).toBe(false)
  })

  it('les actions respectent l’ordre RUX-33 : action du canal → Ouvrir dans ma messagerie → Marquer comme fait', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/panneau-approche')
    const labels = overlay?.actions?.map(a => a.label) ?? []
    expect(labels).toEqual(['Marquer comme fait', 'Ouvrir dans ma messagerie', 'Envoyer'])
    // Le bouton primaire (dernier de l'ordre de lecture) est le geste du canal, jamais « Marquer comme fait ».
    expect(labels.at(-1)).toBe('Envoyer')
    expect(overlay?.actions?.at(-1)?.variant).toBe('default')
  })

  it('« Marquer comme fait » n’est jamais présenté avec un variant qui suggère une preuve d’envoi', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/panneau-approche')
    const markDone = overlay?.actions?.find(a => a.label === 'Marquer comme fait')
    expect(markDone?.variant ?? 'outline').not.toBe('default')
  })

  it('documente RUX-33 et la consolidation des cinq chemins', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/panneau-approche')
    const decisionTexts = overlay?.uxNotes.filter(n => n.kind === 'decision').map(n => n.text) ?? []
    expect(decisionTexts.some(t => t.includes('RUX-33') && t.includes('Copier le message'))).toBe(true)
    expect(decisionTexts.some(t => t.includes('cinq chemins'))).toBe(true)
  })
})

describe('RUX-11 — un titre à 24 px partout, une fiche d’entité comprise', () => {
  it('la règle commune décrit l’anatomie du titre et cite RUX-11', () => {
    const rule = COMMON_RULES.join(' ')
    expect(rule).toMatch(/RUX-11/)
    expect(rule).toMatch(/UNE fiche d’entité comprise/)
  })

  it('aucune page n’ouvre son `header` sur un texte de style `display` ou `heading` (seul `title` fait le h1)', () => {
    for (const page of PAGES) {
      const header = (page.slots as { header?: Block[] }).header
      const first = header?.[0]
      const label = first?.type === 'stack' ? first.children[0] : first
      if (label?.type === 'text' && (label.style === 'display' || label.style === 'heading')) {
        expect.fail(`${page.id} : titre en style « ${label.style} », attendu « title »`)
      }
    }
  })

  it('app/accounts-brief montre désormais son titre en `title` (24 px), documente RUX-11', () => {
    const page = findPage('app/accounts-brief') as PageSpec
    expect(allPageTexts(page).some(t => t.includes('ATOS FRANCE'))).toBe(true)
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-11'))
    expect(note, 'uxNote RUX-11 introuvable').toBeDefined()
  })
})

describe('RUX-10 (adapté Q1) — une seule liste de prochaines étapes, Laura reste l’arrivée', () => {
  it('app/dashboard devient « Ma trajectoire », dans Pilotage, plus « Tableau de bord »', () => {
    const page = findPage('app/dashboard') as PageSpec
    expect(page.title).toBe('Ma trajectoire')
    expect((page as { domain: string }).domain).toBe('pilotage')
  })

  it('app/dashboard n’a plus de bloc « Mes prochaines étapes » — un doublon avec le fil de Laura', () => {
    const page = findPage('app/dashboard') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t === 'Mes prochaines étapes')).toBe(false)
    expect(texts.some(t => t.includes('avec Laura'))).toBe(true)
  })

  it('app/dashboard documente RUX-10, adapté à Q1', () => {
    const page = findPage('app/dashboard') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-10'))
    expect(note, 'uxNote RUX-10 introuvable').toBeDefined()
    expect(note?.text).toMatch(/ADAPTÉ à Q1|adapté à Q1/)
  })

  it('app/chat (l’arrivée par défaut) porte la bannière « premier jour », pas app/briefing', () => {
    const page = findPage('app/chat') as PageSpec
    const texts = allPageTexts(page)
    expect(texts.some(t => t === 'Ton profil est prêt')).toBe(true)
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-10'))
    expect(note, 'uxNote RUX-10 introuvable sur app/chat').toBeDefined()
  })

  it('app/welcome documente sa repositions par RUX-10 : atteint depuis la bannière, plus un arrêt obligatoire', () => {
    const page = findPage('app/welcome') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-10'))
    expect(note, 'uxNote RUX-10 introuvable sur app/welcome').toBeDefined()
  })
})

describe('RUX-37/38 — réglages en quatre groupes, patron liste → page sous 768', () => {
  const groupTitles = (): string[] =>
    SETTINGS_SECTION_NAV.filter(
      (b): b is Extract<Block, { type: 'component'; component: 'SectionSidebarNav' }> =>
        b.type === 'component' && b.component === 'SectionSidebarNav',
    ).map(b => b.props.content?.title ?? '')

  it('la navigation de réglages tient en quatre groupes nommés, plus « Personnel »/« Espace de travail »', () => {
    expect(groupTitles()).toEqual(['Mon compte', 'Laura', 'Mon espace', 'Branchements et abonnement'])
  })

  it('les deux groupes réservés aux administrateurs portent un badge « Admin »', () => {
    const badges = SETTINGS_SECTION_NAV.filter(
      (b): b is Extract<Block, { type: 'component'; component: 'Badge' }> =>
        b.type === 'component' && b.component === 'Badge' && b.props.content?.label === 'Admin',
    )
    expect(badges).toHaveLength(2)
  })

  it('aucune entrée de l’ancienne barre n’est perdue dans le regroupement (28 entrées, une seule Facturation renommée)', () => {
    const allItems = SETTINGS_SECTION_NAV.filter(
      (b): b is Extract<Block, { type: 'component'; component: 'SectionSidebarNav' }> =>
        b.type === 'component' && b.component === 'SectionSidebarNav',
    ).flatMap(b => b.props.items ?? [])
    expect(allItems).not.toContain('Facturation')
    expect(allItems).toContain('Abonnement et crédits')
    expect(allItems.length).toBeGreaterThanOrEqual(24)
  })

  it('une page de chaque groupe documente RUX-37 en uxNote decision', () => {
    for (const id of [
      'app/settings-preferences',
      'app/settings-laura-mode',
      'app/settings-team',
      'app/settings-import',
    ]) {
      const page = findPage(id) as PageSpec
      const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-37'))
      expect(note, `${id} : uxNote RUX-37 introuvable`).toBeDefined()
    }
  })

  it('RUX-38 (patron liste → page sous 768) est cité par la note responsive commune', () => {
    const page = findPage('app/settings-preferences') as PageSpec
    const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-38'))
    expect(note, 'uxNote RUX-38 introuvable').toBeDefined()
    expect(note?.text).toMatch(/LISTE plein écran/)
  })
})

describe('RUX-07 — une palette de commandes ⌘K dans l’app', () => {
  const findPart = (parts: readonly Part[], name: string): Part | undefined => {
    for (const p of parts) {
      if (p.name === name) return p
      if (p.kind === 'box') {
        const found = findPart(p.children, name)
        if (found) return found
      }
    }
    return undefined
  }

  it('la Sidebar porte un déclencheur « Rechercher · ⌘K », sous le bouton d’analyse', () => {
    const tree = RECIPES.Sidebar.draw({ variant: 'sidebar', state: 'expanded' })
    const trigger = findPart([tree], 'search-trigger')
    expect(trigger, 'déclencheur de recherche introuvable').toBeDefined()
  })

  it('app/overlays/palette-commandes existe déjà : dialogue centré, « Analyser “<saisie>” » en dernière ligne', () => {
    const overlay = OVERLAYS.find(o => o.id === 'app/overlays/palette-commandes')
    expect(overlay, 'palette de commandes introuvable').toBeDefined()
    expect(overlay?.kind).toBe('command')
    const bodyTexts = (overlay?.body ?? []).flatMap(b => (b.type === 'text' ? [b.text] : []))
    expect(bodyTexts.some(t => t.startsWith('Analyser'))).toBe(true)
  })
})

describe('RUX-01/02/03/04 — une source de tokens, une police, le thème clair sur le site', () => {
  it('toutes les pages du site documentent RUX-01 à 04 (au moins « RUX-01 »)', () => {
    const sitePages = PAGES.filter(p => p.surface === 'site')
    expect(sitePages.length).toBeGreaterThan(10)
    for (const page of sitePages) {
      const note = page.uxNotes.find(n => n.kind === 'decision' && n.text.includes('RUX-01'))
      expect(note, `${page.id} : uxNote RUX-01 introuvable`).toBeDefined()
    }
  })

  it('aucune couleur brute (hex) n’apparaît dans le texte des pages du site — un seul jeu de tokens', () => {
    for (const page of PAGES.filter(p => p.surface === 'site')) {
      const hit = allPageTexts(page).find(t => /#[0-9a-fA-F]{6}\b/.test(t))
      expect(hit, `${page.id} : "${hit}"`).toBeUndefined()
    }
  })

  it('site/shared.ts documente la cible dans son en-tête (RUX-01 à 04)', () => {
    // Vérifié indirectement : la constante existe et sa décision cite les quatre RUX.
    expect(TOKENS_THEME_NOTE.text).toMatch(/RUX-01/)
    expect(TOKENS_THEME_NOTE.text).toMatch(/RUX-02/)
    expect(TOKENS_THEME_NOTE.text).toMatch(/RUX-03/)
    expect(TOKENS_THEME_NOTE.text).toMatch(/RUX-04/)
  })
})
