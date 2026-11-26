import { beforeAll, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Table, TableBody } from '@bellum/ui'
import type { TalentRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { VivierTableRow } from './VivierTableRow'

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

// Le vivier RÉEL : une fiche placée porte « placé N fois » (le premier jeu de
// test n'en avait aucune, d'où un vert qui ne voyait pas la prod).
vi.mock('@/features/propagation/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/propagation/hooks')>()),
  useConsultantPlacementsIndex: () =>
    new Map([
      [
        'c1',
        {
          consultantId: 'c1',
          placements: 2,
          source: { kind: 'missions', href: '/missions?consultantId=c1', label: 'missions' },
        },
      ],
    ]),
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
})

const LONG_SKILLS = [
  'Architecture microservices',
  'Amazon Web Services (AWS)',
  'Intégration continue GitLab CI',
  'Pilotage de projet agile (Scrum)',
  'Gouvernance des données',
]

function row(over: Partial<TalentRow> = {}): TalentRow {
  return {
    id: 'c1',
    kind: 'consultant',
    fullName: 'Pierre Vasseur',
    title: 'Développeur full stack Java / Angular',
    seniority: 'senior',
    declaredAvailability: 'immediate',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 620,
    financeVisible: false,
    contractType: 'cdi',
    engagementKind: 'salarie',
    zones: ['Île-de-France', 'Lyon'],
    lastMission: null,
    submissions: { open: 2, total: 9 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: LONG_SKILLS.map(label => ({ skill: label, label, level: 'confirme', source: 'cv' })),
    skillCount: 27,
    hasCv: true,
    workMode: 'hybride',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

/** Un élément ne passe JAMAIS à la ligne : tronqué, ou explicitement `nowrap`. */
function cannotWrap(element: Element): boolean {
  return /\b(truncate|whitespace-nowrap)\b/.test(element.getAttribute('class') ?? '')
}

/** Tous les textes d'une ligne : chaque feuille porteuse de texte, et chacun de ses ancêtres jusqu'à la ligne. */
function wrappableTexts(line: Element): string[] {
  const offenders: string[] = []
  for (const element of Array.from(line.querySelectorAll('*'))) {
    const ownText = Array.from(element.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim(),
    )
    if (!ownText) continue
    let current: Element | null = element
    let protectedLine = false
    while (current && current !== line.parentElement) {
      if (cannotWrap(current)) {
        protectedLine = true
        break
      }
      current = current.parentElement
    }
    if (!protectedLine) offenders.push(`« ${(element.textContent ?? '').trim()} »`)
  }
  return offenders
}

function renderRow() {
  return renderWithRouter(
    <Table>
      <TableBody>
        <VivierTableRow row={row()} onEdit={() => {}} onDelete={() => {}} onOpenSkills={() => {}} />
      </TableBody>
    </Table>,
  )
}

/**
 * #2737 (recette PROD du 25/09/2026, 1 512 × 827, 32 talents) — 8 lignes sur
 * 20 montaient à 76-96 px. Dans une ligne `flex`, la réinitialisation globale
 * `:where(.flex) > * { min-width: 0 }` (index.css) laisse TOUT enfant se
 * rétrécir sous son texte : un texte sans `nowrap` ni `truncate` s'enroule
 * alors sur deux ou trois étages (« placé / 2 / fois », « +22 / autres »).
 * jsdom ne met rien en page : ce test vérifie la RÈGLE qui rend la largeur
 * sans objet — chaque texte des lignes qui doivent tenir sur une ligne est
 * tronqué ou `nowrap`. La mesure réelle vit dans
 * `e2e/tests/web/vivier-table-layout.spec.ts` (jeu « vivier réel »).
 */
describe('VivierTableRow — les UNITÉS ne se coupent jamais, la ligne se lit en entier (#2737, #4500)', () => {
  // #4500 (Louis 23/10/2026, refonte V22) — « rien de tronqué au point de ne plus se lire » : les pastilles RETENUES
  // passent à la ligne entières au lieu d'être rognées. Ce qui reste insécable, c'est l'unité de #2737 : « +N autres »
  // ne s'écrit jamais « +22 / autres ».
  it('compétences : les pastilles passent à la ligne entières, « +N autres » reste insécable', async () => {
    const { container } = renderRow()
    await screen.findByText('Pierre Vasseur')
    const line = container.querySelector('td[data-column="skills"] > div > div')
    expect(line?.className).toMatch(/\bflex-wrap\b/)
    expect(line?.querySelector('.truncate')).toBeNull()
    const more = screen.getByText(/^\+\d+ autres$/)
    expect(more.className).toMatch(/\bwhitespace-nowrap\b/)
    expect(more.className).toMatch(/\bshrink-0\b/)
  })

  it('suivi : « placé N fois » reste insécable, les présentations se lisent en entier (jamais « … »)', async () => {
    const { container } = renderRow()
    await screen.findByText('Pierre Vasseur')
    const placed = screen.getByText(/placé 2 fois/i)
    const unit = placed.closest('.whitespace-nowrap')
    expect(unit).not.toBeNull()
    expect(wrappableTexts(unit!)).toEqual([])
    const followUp = container.querySelector('td[data-column="followUp"] > div')
    expect(followUp?.querySelector('.truncate')).toBeNull()
  })

  it('sait dire NON : un texte nu dans une ligne flex est NOMMÉ', () => {
    const line = document.createElement('div')
    line.className = 'flex'
    line.innerHTML = '<span class="shrink-0">+22 autres</span><span class="truncate">ok</span>'
    expect(wrappableTexts(line)).toEqual(['« +22 autres »'])
  })
})
