import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { describe, expect, it } from 'vitest'

import { extractTokens, readSources, REPO_ROOT } from '../extract/tokens'
import { COMPONENTS, TEMPLATES } from './catalog'
import { PAGES } from './pages'
import { renderTokenNames } from './render-token-names'
import type { Block, PageSpec } from './types'
import { validatePage, validatePages } from './validate'

/** Une page valide minimale — chaque test la casse d'UNE façon. */
const base = (): PageSpec => ({
  id: 'app/test',
  surface: 'app',
  domain: 'test',
  route: 'apps/web/src/routes/accounts/index.tsx',
  title: 'Test',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Titre', style: 'title' }],
    primary: [{ type: 'component', component: 'Table', props: { table: { columns: ['Nom'], rows: [['A']] } } }],
  },
  states: {
    empty: [{ type: 'component', component: 'EmptyState', props: { content: { title: 'Rien' } } }],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [{ type: 'component', component: 'GenericProblemMessage', props: {} }],
  },
  uxNotes: [],
})

/** Force une page invalide à travers le typage — c'est précisément ce que la validation runtime attrape. */
const broken = (patch: (p: Record<string, unknown>) => void): PageSpec => {
  const p = base() as unknown as Record<string, unknown>
  patch(p)
  return p as unknown as PageSpec
}

describe('validatePage', () => {
  it('accepte une page conforme', () => {
    expect(validatePage(base())).toEqual([])
  })

  it('refuse un composant inconnu', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).primary = [{ type: 'component', component: 'Carousel', props: {} }]
    })
    expect(validatePage(page).join('\n')).toMatch(/composant inconnu « Carousel »/)
  })

  it('refuse une variante qui n’existe pas dans le code', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).primary = [
        { type: 'component', component: 'Button', props: { variant: 'primary', content: { label: 'Go' } } },
      ]
    })
    expect(validatePage(page).join('\n')).toMatch(/Button\.variant « primary »/)
  })

  it('refuse un token de couleur, d’espacement ou de style de texte inconnu', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).header = [
        { type: 'text', text: 'x', style: 'huge', color: '#ff0000' },
        { type: 'stack', direction: 'row', gap: '7', children: [] },
      ]
    })
    const errors = validatePage(page).join('\n')
    expect(errors).toMatch(/style de texte inconnu « huge »/)
    expect(errors).toMatch(/couleur inconnue « #ff0000 »/)
    expect(errors).toMatch(/espacement inconnu « 7 »/)
  })

  it('refuse un slot que le gabarit ne déclare pas', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).hero = []
    })
    expect(validatePage(page).join('\n')).toMatch(/slot « hero » absent du gabarit « list »/)
  })

  it('refuse une page sans un slot obligatoire', () => {
    const page = broken(p => {
      delete (p.slots as Record<string, unknown[]>).primary
    })
    expect(validatePage(page).join('\n')).toMatch(/slot obligatoire « primary »/)
  })

  it('refuse une page sans un état obligatoire (c’est là que vit l’harmonisation)', () => {
    const page = broken(p => {
      delete (p.states as Record<string, unknown[]>).error
    })
    expect(validatePage(page).join('\n')).toMatch(/état obligatoire « error »/)
  })

  it('refuse une note UX sans source fichier:ligne', () => {
    const page = broken(p => {
      p.uxNotes = [{ kind: 'ecart', text: 'x', source: 'AccountContent.tsx' }]
    })
    expect(validatePage(page).join('\n')).toMatch(/source « AccountContent\.tsx »/)
  })

  it('accepte une source de note UX sous une route dynamique ([id], [locale], [...rest])', () => {
    const page = broken(p => {
      p.uxNotes = [
        { kind: 'ecart', text: 'x', source: 'apps/web/src/routes/accounts/[id]/index.tsx:12' },
        { kind: 'decision', text: 'y', source: 'apps/web/src/routes/[locale]/[...rest].tsx:3' },
      ]
    })
    expect(validatePage(page)).toEqual([])
  })

  it('refuse une barre d’onglets mobile qui n’a pas exactement quatre onglets', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).footer = [
        { type: 'component', component: 'MobileTabBar', props: { items: ['a', 'b', 'c'] } },
      ]
    })
    expect(validatePage(page).join('\n')).toMatch(/MobileTabBar attend 4 éléments/)
  })

  it('refuse des enfants sur un composant qui n’en porte pas', () => {
    const page = broken(p => {
      ;(p.slots as Record<string, unknown[]>).primary = [
        { type: 'component', component: 'Badge', props: {}, children: [{ type: 'text', text: 'x', style: 'body' }] },
      ]
    })
    expect(validatePage(page).join('\n')).toMatch(/Badge ne porte pas d’enfants/)
  })

  it('accepte une grille de 5 colonnes (5 KPI), refuse 7', () => {
    const grid = (columns: number) =>
      broken(p => {
        ;(p.slots as Record<string, unknown[]>).primary = [{ type: 'grid', columns, gap: '4', children: [] }]
      })
    expect(validatePage(grid(5))).toEqual([])
    expect(validatePage(grid(7)).join('\n')).toMatch(/colonnes/)
  })

  it('dashboard : un slot `bulk` pour les actions de masse', () => {
    const page = broken(p => {
      p.template = 'dashboard'
      ;(p.slots as Record<string, unknown[]>).bulk = [{ type: 'text', text: '3 sélectionnés', style: 'body' }]
    })
    expect(validatePage(page)).toEqual([])
  })

  it('settings : `aside` et l’état `empty` FACULTATIF — déclaré s’il a un sens, jamais exigé', () => {
    const settings = (withEmpty: boolean) =>
      broken(p => {
        p.template = 'settings'
        const slots = p.slots as Record<string, unknown[]>
        slots.sectionNav = [{ type: 'component', component: 'SectionSidebarNav', props: {} }]
        slots.aside = [{ type: 'text', text: 'Aide', style: 'body' }]
        const states = p.states as Record<string, unknown[]>
        if (!withEmpty) delete states.empty
      })
    expect(validatePage(settings(true))).toEqual([])
    expect(validatePage(settings(false))).toEqual([])
  })
})

describe('le TYPE impose les tokens (vérifié par `pnpm check-types`, les @ts-expect-error cassent si le type se relâche)', () => {
  it('refuse valeur brute, variante inventée, enfants hors conteneur, slot hors gabarit', () => {
    const blocks: Block[] = [
      // @ts-expect-error — une couleur brute n'est pas un ColorToken
      { type: 'text', text: 'x', style: 'body', color: '#ffffff' },
      // @ts-expect-error — un espacement en px n'est pas un SpaceToken
      { type: 'stack', direction: 'row', gap: '16px', children: [] },
      // @ts-expect-error — `primary` n'est pas une variante de Button dans button.tsx
      { type: 'component', component: 'Button', props: { variant: 'primary' } },
      // @ts-expect-error — un Badge ne contient pas de blocs
      { type: 'component', component: 'Badge', props: {}, children: [] },
    ]
    // @ts-expect-error — `hero` est un slot de `marketing`, pas de `list`
    const page: PageSpec = { ...base(), template: 'list', slots: { hero: [] } }
    expect(blocks).toHaveLength(4)
    expect(validatePage(page).join('\n')).toMatch(/slot « hero »/)
  })
})

describe('le registre des pages', () => {
  it('toutes les pages enregistrées sont valides et d’identifiant unique', () => {
    expect(validatePages(PAGES)).toEqual([])
  })

  it('contient la page exemple /accounts, en gabarit `list`', () => {
    const accounts = PAGES.find(p => p.id === 'app/accounts')
    expect(accounts?.template).toBe('list')
    expect(accounts?.route).toBe('apps/web/src/routes/accounts/index.tsx')
  })

  it('chaque route et chaque source de note UX pointe un fichier qui existe', () => {
    for (const page of PAGES) {
      expect(existsSync(resolve(REPO_ROOT, page.route)), page.route).toBe(true)
      for (const note of page.uxNotes) {
        const [file, line] = note.source.split(':')
        const path = resolve(REPO_ROOT, file ?? '')
        expect(existsSync(path), note.source).toBe(true)
        expect(readFileSync(path, 'utf8').split('\n').length).toBeGreaterThanOrEqual(Number(line))
      }
    }
  })
})

describe('le catalogue', () => {
  it('chaque composant pointe un fichier source qui existe', () => {
    for (const [id, def] of Object.entries(COMPONENTS)) {
      expect(existsSync(resolve(REPO_ROOT, def.source)), `${id} → ${def.source}`).toBe(true)
    }
  })

  it('chaque gabarit déclare ses slots obligatoires parmi ses slots', () => {
    for (const [id, def] of Object.entries(TEMPLATES)) {
      for (const slot of def.required) expect(def.slots as readonly string[], `${id}.${slot}`).toContain(slot)
    }
  })

  it('les noms de tokens typés sont à jour avec tokens.css', async () => {
    const file = resolve(REPO_ROOT, 'packages/figma-sync/src/spec/token-names.generated.ts')
    const options = (await resolveConfig(file)) ?? {}
    const expected = await format(renderTokenNames(extractTokens(readSources())), { ...options, filepath: file })
    expect(readFileSync(file, 'utf8')).toBe(expected)
  })
})
