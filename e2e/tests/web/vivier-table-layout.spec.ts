import { expect, test, type Page } from '@playwright/test'

/**
 * #2737 — LE TABLEAU DU VIVIER TIENT À TOUTE LARGEUR : LA PREUVE DE MISE EN PAGE.
 *
 * Fermée une première fois sur une mesure prise à UNE largeur (1 512 px), puis
 * rouverte par Louis le 25/09/2026 sur une capture de /consultants à ~1 000 px :
 * en-têtes coupés lettre par lettre (« Co/m/pl/ét/ud/e »), Statut et
 * Disponibilité superposés, « 20/100 » débordant sur la colonne suivante,
 * quatre icônes d'action empilées (lignes de ~220 px), six puces de compétences
 * sur plusieurs lignes.
 *
 * jsdom ne met RIEN en page : ces défauts sont invisibles à vitest. Ils se
 * mesurent ici, dans un vrai Chromium (build de production servi par
 * `vite preview`, API morte — voir `playwright.config.ts`), avec la session et
 * les réponses de l'API simulées au plus près du contrat (`TalentPage`).
 *
 * Cinq mesures, à 900, 1 100, 1 280 et 1 512 px :
 *  1. aucun en-tête ne tient sur plus d'UNE ligne ;
 *  2. aucun contenu ne sort VISIBLEMENT de sa cellule (boîte hors de la
 *     cellule, ou texte qui déborde de sa boîte, sans ancêtre qui le rogne) ;
 *  3. aucune ligne ne dépasse 96 px de haut (Théo C talents-vivier.R3 : nom, métier, score et relation,
 *     puis la disponibilité déclarée et son planning — quatre lignes de texte `xs`/`sm` au plus) ;
 *  4. ni la page ni le tableau ne défilent horizontalement ;
 *  5. au tactile, chaque cible d'action fait ≥ 44 px dans les deux dimensions.
 *
 * #2737 (rouvert le 25/09/2026, PR #3025) — la mesure 2 avait un faux
 * positif : la zone de clic tactile de la case de sélection (un enfant
 * `position: absolute` invisible, `checkbox.tsx`) gonfle le `scrollWidth`
 * mesuré sans qu'aucun pixel ne sorte visuellement de sa boîte. La sonde
 * ignore désormais ce cas précis — voir `hasOutOfFlowContributor` /
 * `inFlowContentFitsBox` dans `measure` ci-dessous, et le témoin en bas de
 * fichier qui prouve qu'elle attrape toujours un débordement réel.
 */

const WEB_ORIGIN = 'http://127.0.0.1:4311'
const USER_ID = '4b7a4b1e-2222-4a11-9c33-7c1c9a2f2737'
const MAX_ROW_PX = 96
const MIN_TARGET_PX = 44

type Skill = { skill: string; label: string; level: 'expert' | 'confirme' | 'intermediaire'; source: 'cv' }

function skill(label: string): Skill {
  return { skill: label.toLowerCase().replace(/\s+/g, '-'), label, level: 'confirme', source: 'cv' }
}

function talent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    kind: 'candidate',
    fullName: null,
    title: null,
    seniority: 'inconnu',
    declaredAvailability: 'unknown',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: null,
    minTjmCents: null,
    costCents: null,
    financeVisible: false,
    contractType: 'inconnu',
    engagementKind: 'inconnu',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: true,
    workMode: null,
    photoUrl: null,
    updatedAt: '2026-09-20T10:00:00.000Z',
    ...overrides,
  }
}

/** Quatre lignes : une vide de presque tout, une à seize compétences aux
 *  libellés longs, une complète, une au nom très long et occupée. */
const ROWS = [
  talent({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Ingénieur DevOps plateforme cloud souveraine',
    reviewStatus: 'needs_review',
    source: 'cv',
  }),
  talent({
    id: '22222222-2222-4222-8222-222222222222',
    title: 'AI Engineer — agents, RAG et évaluation',
    zones: ['Paris (75)', 'Lyon', 'full remote'],
    topSkills: [
      skill('API REST'),
      skill('Architectures multi agents'),
      skill('chunking et provenance par champ'),
      skill('documentation et playbooks'),
      skill('évaluation et audit de cohérence des sorties'),
    ],
    skillCount: 16,
  }),
  talent({
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'consultant',
    fullName: 'Bastien Colin',
    title: 'Ingénieur DevOps',
    seniority: 'senior',
    declaredAvailability: 'immediate',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 660,
    zones: ['IDF'],
    engagementKind: 'salarie',
    workMode: 'sur_site',
    lastContactAt: '2026-09-10T09:00:00.000Z',
    submissions: { open: 1, total: 3 },
    topSkills: [skill('Datadog'), skill('GitLab CI'), skill('Kubernetes'), skill('Python'), skill('Terraform')],
    skillCount: 5,
  }),
  talent({
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Marie-Hélène Dupont-Lefebvre de la Tour',
    title: 'Architecte solutions data et intelligence artificielle',
    seniority: 'expert',
    declaredAvailability: 'immediate',
    staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-12-31', assignments: 1 },
    tjm: 1250,
    zones: ['Bordeaux', 'Toulouse'],
    engagementKind: 'freelance',
    workMode: 'hybride',
    lastContactAt: '2026-03-02T09:00:00.000Z',
    lastMission: { label: 'Refonte plateforme data', accountName: 'Compagnie Générale des Transports', endsOn: null },
    submissions: { open: 2, total: 7 },
    topSkills: [skill('Snowflake'), skill('dbt'), skill('Apache Airflow')],
    skillCount: 9,
  }),
]

/**
 * #2737 (recette PROD du 25/09/2026, 1 512 × 827, 32 talents) — le jeu
 * ci-dessus était trop sage : en prod, 8 lignes sur 20 montaient à 76-96 px
 * (compétences + « +N autres » sur deux étages) et une cellule Nom était rognée
 * de 2 px, là où ce spec mesurait « 0 ». Ce jeu-ci reproduit le vivier réel :
 * vingt fiches, des compétences LONGUES, des dizaines de compétences à compter,
 * des noms et des titres complets, des positionnements, des placements, des
 * missions, des disponibilités datées.
 */
const LONG_SKILLS = [
  'Architecture microservices',
  'Amazon Web Services (AWS)',
  'Kubernetes',
  'Intégration continue GitLab CI',
  'Spring Boot',
  'Apache Kafka',
  'Pilotage de projet agile (Scrum)',
  'Terraform',
  'TypeScript',
  'Gouvernance des données',
  'Power BI',
  'Java',
  'Go',
]
const FIRST = [
  'Pierre',
  'Marie-Hélène',
  'Jean-Baptiste',
  'Sophie',
  'Maximilien',
  'Inès',
  'Alexandre',
  'Léa',
  'Christophe',
  'Amélie',
]
const LAST = [
  'Vasseur',
  'Dupont-Lefebvre',
  'Martin',
  'de La Rochefoucauld',
  'Nguyen',
  'Bernard',
  'Lemaître',
  'Fontaine',
  'Rousseau',
  'Moreau',
]
const REAL_ROWS = Array.from({ length: 20 }, (_, index) =>
  talent({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
    kind: index % 3 === 0 ? 'candidate' : 'consultant',
    fullName: index === 7 ? null : `${FIRST[index % FIRST.length]} ${LAST[(index * 3) % LAST.length]}`,
    title: [
      'Architecte cloud senior',
      'Consultant data & BI',
      'Développeur full stack Java / Angular',
      'Chef de projet MOA',
    ][index % 4],
    seniority: ['junior', 'confirme', 'senior', 'expert'][index % 4],
    declaredAvailability: index % 2 === 0 ? 'immediate' : 'sous_1_mois',
    staffing:
      index % 3 === 0
        ? { availability: 'busy', loadPercent: 100, freeFrom: '2026-12-31', assignments: 1 }
        : { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: index % 5 === 0 ? null : 450 + index * 37,
    zones: index % 4 === 0 ? [] : ['Île-de-France', 'Lyon', 'Nantes'].slice(0, (index % 3) + 1),
    engagementKind: ['salarie', 'freelance', 'portage'][index % 3],
    workMode: ['hybride', 'sur_site', 'full_remote', null][index % 4],
    lastContactAt: index % 6 === 0 ? null : '2026-09-12T09:00:00.000Z',
    lastMission:
      index % 2 === 0
        ? { label: 'Migration cloud', accountName: 'Banque Populaire Rives de Paris', endsOn: '2026-06-30' }
        : null,
    submissions: { open: index % 3, total: (index % 3) * 4 + 1 },
    reviewStatus: index % 7 === 0 ? 'needs_review' : 'qualified',
    topSkills: LONG_SKILLS.slice(index % 7, (index % 7) + 5).map(skill),
    skillCount: 5 + index * 2,
  }),
)

async function mockVivier(page: Page, rows: readonly Record<string, unknown>[] = ROWS): Promise<void> {
  await page.context().addCookies([{ name: `loggedIn:${USER_ID}`, value: '1', url: WEB_ORIGIN }])
  await page.route('**/auth/session', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: USER_ID,
          email: 'e2e-vivier@bellum-ai.com',
          created_at: '2026-01-01T00:00:00.000Z',
          roles: ['customer'],
        },
      }),
    }),
  )
  await page.route('**/onboarding/state', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: USER_ID,
        status: 'completed',
        current_stage_code: null,
        stages: [],
        answers: {},
        skipped_at: null,
        inherited_answer_keys: [],
        active_import_session_id: null,
        joined_workspace: null,
        effectif_observed_at: {},
      }),
    }),
  )
  // Le rôle de l'espace : sans lui l'écran reste en ATTENTE (inconnu n'est
  // pas « aucun droit », `useCurrentRouteAccess`), et ne rend jamais le tableau.
  await page.route('**/workspaces/me', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        workspace: { id: '9b1c2d3e-4f50-4a61-8b72-2737aa000001', name: 'ESN e2e', role: 'owner', memberCount: 1 },
        members: [],
      }),
    }),
  )
  // Les crédits : l'offre ouvre le vivier (`talent_pool`), et une réponse
  // immédiate évite d'attendre les reprises de la lecture en échec.
  await page.route('**/credits', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: ['talent_pool'] }) }),
  )
  await page.route(/\/talents\?/, route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: rows, total: rows.length, page: 1, limit: 20 }),
    }),
  )
  // Les placements (« placé N fois ») : absents du premier jeu, présents en prod.
  await page.route('**/delivery/propagation', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accounts: [],
        contacts: [],
        consultants: rows
          .filter((_, index) => index % 2 === 1)
          .map(row => ({
            consultantId: row.id,
            placements: 2,
            source: { kind: 'missions', href: `/missions?consultantId=${String(row.id)}`, label: 'missions' },
          })),
      }),
    }),
  )
}

type Layout = {
  headerLines: string[]
  overflows: string[]
  tallRows: string[]
  pageScroll: { scrollWidth: number; innerWidth: number }
  tableScroll: { scrollWidth: number; clientWidth: number }
  containerWidth: number
  columns: number
}

/** Tout se mesure DANS la page : `getBoundingClientRect`, jamais une classe lue. */
async function measure(page: Page): Promise<Layout> {
  return page.evaluate(maxRow => {
    const table = document.querySelector('table')
    if (!table) throw new Error('aucun <table> à l’écran')

    /** Les lignes de TEXTE d'un élément — nœuds texte seuls : une case à
     *  cocher posée à côté du libellé n'est pas une seconde ligne. Deux
     *  fragments dont les sommets diffèrent de moins d'une demi-ligne sont sur
     *  la même ligne. */
    const lineCount = (element: Element): number => {
      const tops: number[] = []
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node.textContent ?? '').trim()) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width === 0 || rect.height === 0) continue
          if (!tops.some(top => Math.abs(top - rect.top) < rect.height / 2)) tops.push(rect.top)
        }
      }
      return tops.length
    }

    const headerLines = Array.from(table.querySelectorAll('thead th'))
      .map(th => ({ text: (th.textContent ?? '').trim(), lines: lineCount(th) }))
      .filter(entry => entry.lines > 1)
      .map(entry => `« ${entry.text} » sur ${entry.lines} lignes`)

    const clips = (element: Element): boolean => {
      const style = getComputedStyle(element)
      return style.overflowX !== 'visible' || style.overflowY !== 'visible'
    }
    /**
     * Un ancêtre STRICTEMENT DANS la cellule (ni l'élément, ni la cellule) qui
     * rogne. ⚠️ Recette prod du 25/09/2026 : la cellule elle-même porte
     * `overflow-hidden` ; la compter excusait TOUT son contenu, et la mesure
     * rendait « 0 débordement » sur une cellule Nom rognée de 2 px.
     */
    const clippedWithin = (element: Element, cell: Element): boolean => {
      let current = element.parentElement
      while (current && current !== cell) {
        if (clips(current)) return true
        current = current.parentElement
      }
      return false
    }

    /**
     * #2737 (rouvert le 25/09/2026, PR #3025) — faux positif mesuré sur la
     * case de sélection (colonne Nom) : la zone de clic tactile ≥ 44 px est
     * une pseudo-boîte `::after` posée en `position: absolute` avec des
     * `inset` négatifs (`after:-inset-x-3…`, `checkbox.tsx`). Elle n'est
     * peinte NULLE PART (`content: ''`, aucun fond, aucune bordure) mais un
     * élément non clippé dont un enfant — réel ou généré — est hors flux
     * gonfle SON PROPRE `scrollWidth` (spec CSSOM), et celui de tout ancêtre
     * non clippé au-dessus : la case (`<button>`, 14 px) et sa case
     * (`<div role="none">`, 16 px) mesuraient toutes deux « déborde » sans
     * qu'un seul pixel ne sorte visuellement de leur boîte.
     *
     * Un élément hors flux (position `absolute`/`fixed`, réel OU généré par
     * `::before`/`::after`) existe-t-il dans le sous-arbre de `element` ?
     */
    const hasOutOfFlowContributor = (element: Element): boolean => {
      const pseudoIsOutOfFlow = (el: Element): boolean =>
        (['::before', '::after'] as const).some(pseudo => {
          const style = getComputedStyle(el, pseudo)
          return style.content !== 'none' && (style.position === 'absolute' || style.position === 'fixed')
        })
      if (pseudoIsOutOfFlow(element)) return true
      return Array.from(element.querySelectorAll('*')).some(descendant => {
        const position = getComputedStyle(descendant).position
        return position === 'absolute' || position === 'fixed' || pseudoIsOutOfFlow(descendant)
      })
    }

    /**
     * Le contenu EN FLUX de `element` (texte et éléments ni `absolute` ni
     * `fixed`, sous-arbres hors flux exclus) tient-il dans sa boîte ? Ne
     * regarde ni les pseudo-éléments (jamais mesurables par
     * `getBoundingClientRect`) ni ce qu'un descendant hors flux affiche —
     * exactement ce qu'un `scrollWidth` ne sait pas distinguer, et exactement
     * ce qu'un vrai débordement (texte trop large, image trop grande) laisse
     * quand même voir : AUCUN témoin réel ne passe par cette sortie « vrai ».
     */
    const inFlowContentFitsBox = (element: Element): boolean => {
      const isOutOfFlow = (el: Element): boolean => {
        const position = getComputedStyle(el).position
        return position === 'absolute' || position === 'fixed'
      }
      let minLeft = Infinity
      let maxRight = -Infinity
      const consider = (rect: DOMRect): void => {
        if (rect.width === 0 && rect.height === 0) return
        minLeft = Math.min(minLeft, rect.left)
        maxRight = Math.max(maxRight, rect.right)
      }
      const walk = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (!(node.textContent ?? '').trim()) return
          const range = document.createRange()
          range.selectNodeContents(node)
          Array.from(range.getClientRects()).forEach(consider)
          return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const el = node as Element
        if (isOutOfFlow(el)) return // le sous-arbre part avec lui, hors flux
        consider(el.getBoundingClientRect())
        Array.from(el.childNodes).forEach(walk)
      }
      Array.from(element.childNodes).forEach(walk)
      if (minLeft === Infinity) return true // rien en flux : le débordement n'est pas dedans
      return maxRight - minLeft <= element.clientWidth + 1
    }

    const overflows: string[] = []
    Array.from(table.querySelectorAll('tbody tr')).forEach((row, rowIndex) => {
      Array.from(row.querySelectorAll(':scope > td')).forEach((cell, cellIndex) => {
        const box = cell.getBoundingClientRect()
        // Ce que la cellule CACHE : un contenu plus large qu'elle, rogné par
        // son propre `overflow-hidden` — invisible à `getBoundingClientRect`.
        if (cell.scrollWidth > cell.clientWidth + 1) {
          overflows.push(
            `ligne ${rowIndex + 1}, cellule ${cellIndex + 1} (${cell.getAttribute('data-column')}) rogne son contenu (${cell.scrollWidth} > ${cell.clientWidth})`,
          )
        }
        // Les compétences tiennent sur UNE ligne : aucune pastille ni « +N » plus bas que la première.
        if (cell.getAttribute('data-column') === 'skills') {
          const tops = Array.from(cell.querySelectorAll(':scope > div > *')).map(child =>
            Math.round(child.getBoundingClientRect().top),
          )
          if (tops.length > 0 && Math.max(...tops) - Math.min(...tops) > 4) {
            overflows.push(`ligne ${rowIndex + 1} : les compétences passent à la ligne (${tops.join(', ')})`)
          }
        }
        for (const element of Array.from(cell.querySelectorAll('*'))) {
          if (clippedWithin(element, cell)) continue
          const rect = element.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue
          const label = `ligne ${rowIndex + 1}, cellule ${cellIndex + 1} : <${element.tagName.toLowerCase()}> « ${(element.textContent ?? '').trim().slice(0, 40)} »`
          if (
            rect.left < box.left - 1 ||
            rect.right > box.right + 1 ||
            rect.top < box.top - 1 ||
            rect.bottom > box.bottom + 1
          ) {
            overflows.push(
              `${label} sort de sa cellule (${Math.round(rect.left)}→${Math.round(rect.right)} dans ${Math.round(box.left)}→${Math.round(box.right)})`,
            )
            continue
          }
          const style = getComputedStyle(element)
          const isBox = style.display !== 'inline' && element.clientWidth > 0
          if (
            isBox &&
            !clips(element) &&
            element.scrollWidth > element.clientWidth + 1 &&
            !(hasOutOfFlowContributor(element) && inFlowContentFitsBox(element))
          ) {
            overflows.push(`${label} déborde de sa boîte (${element.scrollWidth} > ${element.clientWidth})`)
          }
        }
      })
    })

    const tallRows = Array.from(table.querySelectorAll('tbody tr'))
      .map((row, index) => ({ index, height: row.getBoundingClientRect().height }))
      .filter(entry => entry.height > maxRow)
      .map(entry => `ligne ${entry.index + 1} : ${Math.round(entry.height)} px`)

    const scroller = table.parentElement as HTMLElement
    return {
      headerLines,
      overflows,
      tallRows,
      pageScroll: { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth },
      tableScroll: { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth },
      containerWidth: Math.round(scroller.getBoundingClientRect().width),
      columns: table.querySelectorAll('thead th').length,
    }
  }, MAX_ROW_PX)
}

const DATASETS = [
  { name: 'jeu court', rows: ROWS },
  { name: 'vivier réel', rows: REAL_ROWS },
] as const

for (const dataset of DATASETS)
  for (const width of [900, 1100, 1280, 1512]) {
    test(`#2737 — ${dataset.name} à ${width} px : en-têtes sur une ligne, rien ne déborde, lignes ≤ ${MAX_ROW_PX} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 827 })
      await mockVivier(page, dataset.rows)
      await page.goto('/consultants')
      await expect(page.locator('table tbody tr')).toHaveCount(dataset.rows.length, { timeout: 30_000 })

      const layout = await measure(page)
      console.log(
        `[#2737] ${dataset.name} ${width} px — conteneur ${layout.containerWidth} px, ${layout.columns} colonnes, ` +
          `${layout.headerLines.length} en-têtes enroulés, ${layout.overflows.length} débordements, ${layout.tallRows.length} lignes trop hautes`,
      )

      expect(layout.headerLines, layout.headerLines.join('\n')).toEqual([])
      expect(layout.overflows, layout.overflows.join('\n')).toEqual([])
      expect(layout.tallRows, layout.tallRows.join('\n')).toEqual([])
      expect(layout.pageScroll.scrollWidth, 'la page défile horizontalement').toBeLessThanOrEqual(
        layout.pageScroll.innerWidth,
      )
      expect(layout.tableScroll.scrollWidth, 'le tableau défile horizontalement').toBeLessThanOrEqual(
        layout.tableScroll.clientWidth + 1,
      )
    })
  }

test.describe('au tactile', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1100, height: 900 } })

  test('#2737 — chaque cible d’action d’une ligne fait ≥ 44 px', async ({ page }) => {
    await mockVivier(page)
    await page.goto('/consultants')
    await expect(page.locator('table tbody tr')).toHaveCount(ROWS.length)

    const targets = await page
      .locator('table tbody tr')
      .first()
      .locator('td:last-child')
      .locator('button, a')
      .evaluateAll(elements =>
        elements.map(element => {
          const rect = element.getBoundingClientRect()
          return { name: element.getAttribute('aria-label') ?? '', width: rect.width, height: rect.height }
        }),
      )
    expect(targets.length).toBeGreaterThan(0)
    const small = targets.filter(target => target.width < MIN_TARGET_PX || target.height < MIN_TARGET_PX)
    expect(small, small.map(target => `${target.name} : ${target.width}×${target.height}`).join('\n')).toEqual([])
  })
})

test.describe('sous 768 px', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('#2737 — le vivier se lit en cartes : pas de tableau, pas de défilement horizontal, cibles ≥ 44 px', async ({
    page,
  }) => {
    await mockVivier(page)
    await page.goto('/consultants')
    const cards = page.locator('ul > li').filter({ has: page.getByRole('link', { name: /Où placer/ }) })
    await expect(cards).toHaveCount(ROWS.length, { timeout: 30_000 })
    await expect(page.locator('table')).toHaveCount(0)

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth, 'la page défile horizontalement').toBeLessThanOrEqual(innerWidth)

    const targets = await cards
      .first()
      .locator('a[aria-label], button[aria-label]')
      .evaluateAll(elements =>
        elements.map(element => {
          const rect = element.getBoundingClientRect()
          return { name: element.getAttribute('aria-label') ?? '', width: rect.width, height: rect.height }
        }),
      )
    const actionTargets = targets.filter(target => /Où placer|Autres actions/.test(target.name))
    expect(actionTargets).toHaveLength(2)
    const small = actionTargets.filter(target => target.width < MIN_TARGET_PX || target.height < MIN_TARGET_PX)
    expect(small, small.map(target => `${target.name} : ${target.width}×${target.height}`).join('\n')).toEqual([])
  })
})

test.describe('la sonde de débordement', () => {
  /**
   * #2737 (rouvert le 25/09/2026, PR #3025) — témoin direct de `measure`, sur
   * une page vide plutôt que sur `/consultants` : prouve que l'exception
   * ajoutée pour le faux positif (zone de clic invisible, `position:
   * absolute`) ne rend pas la sonde aveugle à un vrai débordement — y
   * compris un débordement réel qui coexiste avec une zone hors flux dans la
   * MÊME boîte, le cas qui casserait une exception trop large.
   */
  test('#2737 — ignore une zone de clic hors flux, attrape un débordement réel', async ({ page }) => {
    await page.setContent(`
      <table>
        <thead><tr><th>Colonne</th></tr></thead>
        <tbody>
          <tr>
            <td data-column="zone-hors-flux" style="width: 60px; padding: 24px; overflow: hidden;">
              <div style="position: relative; width: 16px; height: 16px; overflow: visible;">
                <div style="position: absolute; inset: -4px;"></div>
              </div>
            </td>
          </tr>
          <tr>
            <td data-column="debordement-reel" style="width: 60px; padding: 24px; overflow: hidden;">
              <div style="width: 16px; height: 16px; overflow: visible; white-space: nowrap;">
                DÉBORDEMENT RÉEL VISIBLE
              </div>
            </td>
          </tr>
          <tr>
            <td data-column="mixte-zone-et-debordement" style="width: 60px; padding: 24px; overflow: hidden;">
              <div style="position: relative; width: 16px; height: 16px; overflow: visible; white-space: nowrap;">
                <div style="position: absolute; inset: -4px;"></div>
                MIXTE DÉBORDEMENT
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    `)

    const layout = await measure(page)

    expect(
      layout.overflows.some(entry => entry.includes('ligne 1,')),
      layout.overflows.join('\n'),
    ).toBe(false)
    expect(
      layout.overflows.some(entry => entry.includes('ligne 2,')),
      layout.overflows.join('\n'),
    ).toBe(true)
    expect(
      layout.overflows.some(entry => entry.includes('ligne 3,')),
      layout.overflows.join('\n'),
    ).toBe(true)
  })
})
