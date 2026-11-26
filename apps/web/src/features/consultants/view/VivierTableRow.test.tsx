import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Table, TableBody } from '@bellum/ui'
import type { TalentRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { chipsThatFit } from './VivierRowParts'
import { VivierTableRow } from './VivierTableRow'

vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

beforeAll(() => {
  window.scrollTo = vi.fn()
})

function row(over: Partial<TalentRow> = {}): TalentRow {
  return {
    id: 'c1',
    kind: 'consultant',
    fullName: 'Yanis Berthier',
    title: 'Ingénieur plateforme',
    seniority: 'senior',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 620,
    financeVisible: false,
    contractType: 'cdi',
    engagementKind: 'salarie',
    zones: [],
    lastMission: null,
    submissions: { open: 2, total: 5 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: false,
    workMode: 'hybride',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

function renderRow(
  over: Partial<TalentRow> = {},
  options: {
    isSelected?: boolean
    onSelectionChange?: (selected: boolean) => void
    onOpenRecord?: (id: string) => void
  } = {},
) {
  return renderWithRouter(
    <Table>
      <TableBody>
        <VivierTableRow
          row={row(over)}
          onEdit={() => {}}
          onDelete={() => {}}
          onOpenSkills={() => {}}
          isSelected={options.isSelected}
          onSelectionChange={options.onSelectionChange}
          onOpenRecord={options.onOpenRecord}
        />
      </TableBody>
    </Table>,
  )
}

/**
 * #4500 (Louis 23/10/2026, refonte V22) — « rien de tronqué au point de ne plus se lire ».
 *
 * #2500.1 posait un `title` sur chaque cellule tronquée ; la refonte retire la troncature elle-même : le titre, le
 * type de contrat, la localisation, le mode de travail et le suivi PASSENT À LA LIGNE et se lisent en entier. Le TJM
 * et la séniorité quittent la liste (maquette), comme le dernier échange, la dernière mission et le dernier TJM vendu.
 */
describe('VivierTableRow — rien de tronqué, peu de colonnes (#4500)', () => {
  it('le TJM, le coût et la séniorité ne sont plus dans la ligne', async () => {
    const { container } = renderRow({ tjm: 620, financeVisible: true, costCents: 45000, seniority: 'senior' })
    await screen.findByText('Yanis Berthier')
    expect(container.querySelector('td[data-column="tjm"]')).toBeNull()
    expect(container.querySelector('td[data-column="seniority"]')).toBeNull()
    expect(screen.queryByText(/620/)).toBeNull()
    expect(screen.queryByText(/450/)).toBeNull()
    expect(screen.queryByText('Senior')).toBeNull()
  })

  it('le mode de travail, le type de contrat et le titre se lisent EN ENTIER : ils passent à la ligne', async () => {
    renderRow({ workMode: 'hybride', engagementKind: 'salarie' })
    for (const text of ['Hybride', 'Salarié', 'Ingénieur plateforme']) {
      const node = await screen.findByText(new RegExp(`^${text}`))
      expect(node.className).not.toMatch(/\btruncate\b/)
      expect(node.className).toMatch(/\bbreak-words\b/)
    }
  })

  it('« Suivi » : les présentations en entier, le détail en cours dans l’infobulle', async () => {
    renderRow({ submissions: { open: 2, total: 5 } })
    const submissions = await screen.findByText('5 présentations')
    expect(submissions.className).not.toMatch(/\btruncate\b/)
    expect(submissions.getAttribute('title')).toContain('en cours sur 5')
  })

  it('« Suivi » ne porte plus le dernier échange, la dernière mission ni le dernier TJM vendu', async () => {
    const { container } = renderRow({
      lastContactAt: '2026-10-01T09:00:00.000Z',
      lastMission: { label: 'TMA', accountName: 'SNCF', endsOn: '2026-12-31', dailyRate: 650 },
    })
    await screen.findByText('Yanis Berthier')
    const followUp = container.querySelector('td[data-column="followUp"]')?.textContent ?? ''
    expect(followUp).not.toMatch(/SNCF|dernier TJM vendu|Dernier échange/i)
  })

  // Théo C talents-vivier.N4 — le référent se NOMME dans « Suivi » ; absent, il ne fait aucune ligne.
  it('« Suivi » : le référent est nommé quand il existe, et ne fait aucune ligne sinon', async () => {
    const { container } = renderRow({ ownerName: 'Maëlle Lorquin' })
    await screen.findByText('Yanis Berthier')
    expect(container.querySelector('td[data-column="followUp"]')?.textContent).toContain('Maëlle Lorquin')
    cleanup()
    const absent = renderRow({ ownerName: null })
    await screen.findByText('Yanis Berthier')
    expect(absent.container.querySelector('td[data-column="followUp"]')?.textContent).not.toContain('Maëlle')
  })
})

/**
 * #4500 — maquette V22 `talents-vivier.html` (L22.SCORE · A6) : sous le métier, la pastille « 70 /100 · 3 axes sur 4 »,
 * ouvrable sur ses axes. `TalentScorePill` existait, sans appelant (lot pr12c-talents, point 3 non fait).
 */
describe('VivierTableRow — la pastille de score de la maquette, sous le métier (#4500)', () => {
  it('le score se lit /100 avec son nombre d’axes, dans la cellule Personne, et s’ouvre sur ses axes', async () => {
    const { container } = renderRow({ fullName: 'Yanis Berthier', hasCv: true, skillCount: 6, tjm: 620 })
    await screen.findByText('Yanis Berthier')
    const pill = screen.getByTestId('vivier-score-pill')
    expect(container.querySelector('td[data-column="name"]')?.contains(pill)).toBe(true)
    expect(pill.textContent).toMatch(/^(\d+ \/100 · \d axes? sur 4|Score non évaluable)$/)
    fireEvent.click(pill)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Compétences prouvées')
  })

  it('sait dire NON : une fiche sans aucun axe évaluable lit « Score non évaluable », jamais « 0 /100 »', async () => {
    renderRow({
      fullName: null,
      hasCv: false,
      skillCount: 0,
      tjm: null,
      reviewStatus: 'needs_review',
      staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    })
    const pill = await screen.findByTestId('vivier-score-pill')
    expect(pill.textContent).not.toMatch(/\b0 \/100/)
  })
})

/**
 * #2526.2 (mesuré en recette le 17/09/2026) — panneau de correspondance
 * ouvert, le badge « À confirmer » recouvrait le TJM. La protection posée
 * pour #2500 (`min-w-0` + `truncate` DANS `TalentAvailabilityBadge`) ne
 * dépend pas de la largeur déclarée de la colonne : elle tient donc aussi en
 * mode `compact` (#2526), où la colonne `availability` est même PLUS large
 * qu'à plein écran (`vivierColumnCompactOverride('availability')`,
 * `xl:w-[12%]` contre `xl:w-[10%]`). Ce témoin le vérifie directement plutôt
 * que de le déduire — la garde GA-350 ne rend rien, elle ne lit que des
 * bornes déclarées.
 */
describe('VivierTableRow — mode compact, le badge de disponibilité ne recouvre jamais le TJM (#2526.2)', () => {
  it('#3488 / #4500 — la disponibilité INCONNUE se lit EN ENTIER : « Non renseignée », rien de supposé', async () => {
    renderRow({
      staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    })
    const badge = await screen.findByText('Non renseignée')
    expect(badge.className).not.toMatch(/\btruncate\b/)
    expect(badge.className).toMatch(/\bwhitespace-normal\b/)
    const line = screen.getByText('Rien de déclaré, rien de supposé')
    expect(line.className).toMatch(/\bbreak-words\b/)
    expect(line.className).not.toMatch(/\btruncate\b/)
  })

  it('#4500 — la déclaration gagne : le badge la dit, le planning descend en ligne secondaire, sans déborder', async () => {
    renderRow({
      declaredAvailability: 'immediate',
      staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 },
    })
    expect(await screen.findByText('Disponible')).toBeInTheDocument()
    const planning = screen.getByText('Planning : en mission, sans fin prévue')
    expect(planning.className).toMatch(/\bbreak-words\b/)
    expect(planning.parentElement?.className).toMatch(/\bmin-w-0\b/)
  })
})

describe('VivierTableRow — le score sous le métier, jamais nu (#4500, maquette V22)', () => {
  it('une fiche non évaluable ÉCRIT « Score non évaluable » (pas un tiret) et s’ouvre sur ses quatre axes nommés', async () => {
    renderRow({ reviewStatus: 'needs_review' })
    const pill = await screen.findByRole('button', { name: /Voir les axes du score de Yanis Berthier/ })
    expect(pill).toHaveTextContent('Score non évaluable')
    fireEvent.click(pill)
    const dialog = screen.getByRole('dialog')
    for (const axis of ['Fiche complète', 'Compétences prouvées', 'Disponibilité confirmée', 'Retours de mission']) {
      expect(dialog).toHaveTextContent(axis)
    }
    expect(dialog).not.toHaveTextContent(/\b0 ?\/ ?100/)
  })
})

/**
 * #2662.1 — LA SÉLECTION, dans la colonne « Nom ».
 *
 * Même patron que `ContactTableRow.tsx` (#2465) : la case tient DANS la
 * colonne existante, jamais une quatorzième — ce qui aurait rouvert le
 * débordement que #2662.4 tient à 100 % par palier.
 */
describe('VivierTableRow — la sélection ne recode pas une colonne (#2662.1)', () => {
  it('rend une case DÉCOCHÉE par défaut', async () => {
    renderRow({ fullName: 'Camille Novak' })
    const checkbox = await screen.findByRole('checkbox', { name: 'Sélectionner Camille Novak' })
    expect(checkbox.getAttribute('aria-checked')).toBe('false')
  })

  it('rend la case COCHÉE quand `isSelected` est vrai', async () => {
    renderRow({ fullName: 'Camille Novak' }, { isSelected: true })
    const checkbox = await screen.findByRole('checkbox', { name: 'Sélectionner Camille Novak' })
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
  })

  it('appelle `onSelectionChange(true)` au clic sur une case décochée', async () => {
    const onSelectionChange = vi.fn()
    renderRow({ fullName: 'Camille Novak' }, { onSelectionChange })
    const checkbox = await screen.findByRole('checkbox', { name: 'Sélectionner Camille Novak' })
    fireEvent.click(checkbox)
    expect(onSelectionChange).toHaveBeenCalledWith(true)
  })

  it('marque la ligne `data-state=selected` quand elle est cochée — le même repère que ContactTableRow', async () => {
    const { container } = renderRow({ fullName: 'Camille Novak' }, { isSelected: true })
    await screen.findByRole('checkbox', { name: 'Sélectionner Camille Novak' })
    expect(container.querySelector('tr[data-state="selected"]')).not.toBeNull()
  })
})

/**
 * #2737 — rouverte le 25/09/2026 sur une capture : quatre icônes d'action
 * empilées (ligne de ~220 px), six pastilles de compétences sur cinq lignes,
 * « non mesuré » répété dans chaque cellule.
 */
describe('VivierTableRow — une ligne de hauteur constante (#2737)', () => {
  it('montre UNE action et un menu « … » nommé, plus quatre boutons', async () => {
    renderRow()
    await screen.findByText('Yanis Berthier')
    expect(screen.getByRole('link', { name: 'Où placer Yanis Berthier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autres actions pour Yanis Berthier' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retirer du vivier' })).toBeNull()
  })

  it('met le titre en 2ᵉ ligne du nom — plus de colonne « Titre »', async () => {
    const { container } = renderRow()
    await screen.findByText('Yanis Berthier')
    const nameCell = container.querySelector('td[data-column="name"]')
    expect(nameCell?.textContent).toContain('Ingénieur plateforme')
    expect(container.querySelector('td[data-column="title"]')).toBeNull()
  })

  it('trois pastilles de compétences au plus, sur une ligne, puis « +N » compté sur la fiche', async () => {
    const skills = ['A', 'B', 'C', 'D', 'E'].map(label => ({
      skill: label,
      label: `Compétence ${label}`,
      level: 'confirme' as const,
      source: 'cv' as const,
    }))
    const { container } = renderRow({ topSkills: skills, skillCount: 16 })
    await screen.findByText('Compétence A')
    expect(screen.queryByText('Compétence D')).toBeNull()
    // Combien tiennent dépend de la largeur de la colonne (`chipsThatFit`) ;
    // « +N » compte toujours TOUT le reste de la fiche.
    const chips = container.querySelectorAll('td[data-column="skills"] [title*=" — "] > span').length
    expect(chips).toBeGreaterThanOrEqual(1)
    expect(chips).toBeLessThanOrEqual(3)
    expect(screen.getByText(`+${16 - chips} autres`)).toBeInTheDocument()
    // #4500 — une pastille retenue se lit en entier : la rangée passe à la ligne plutôt que de la couper.
    const line = container.querySelector('td[data-column="skills"] > div > div')
    expect(line?.className).toMatch(/\bflex-wrap\b/)
    expect(container.querySelector('td[data-column="skills"] span.truncate')).toBeNull()
  })

  it('une absence reste « non mesuré » pour le lecteur d’écran, en tiret à l’œil — jamais 0', async () => {
    const { container } = renderRow({ zones: [] })
    await screen.findByText('Yanis Berthier')
    const cell = container.querySelector('td[data-column="location"]')
    expect(cell?.querySelector('[aria-hidden="true"]')?.textContent).toBe('—')
    expect(cell?.textContent).toContain('non mesuré')
    expect(cell?.textContent).not.toMatch(/\b0\b/)
  })

  it('« Nom non renseigné » reste écrit en toutes lettres', async () => {
    renderRow({ fullName: null })
    expect(await screen.findByText('Nom non renseigné')).toBeInTheDocument()
  })

  // #3883 (recette prod 09/10 : 124 px pour un texte de 129 px, ×8 lignes) — ce libellé est la
  // seule façon de reconnaître une fiche sans nom : il passe à la ligne, il ne s'achève jamais en « … ».
  it('#3883 — « Nom non renseigné » n’est jamais tronqué en ellipse : il s’enroule', async () => {
    renderRow({ fullName: null })
    const label = await screen.findByText('Nom non renseigné')
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.className).toMatch(/\bbreak-words\b/)
  })

  it('#4500 — un vrai nom non plus n’est jamais tronqué : il passe à la ligne', async () => {
    renderRow({})
    const label = await screen.findByText('Yanis Berthier')
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.className).toMatch(/\bbreak-words\b/)
  })
})

describe('chipsThatFit — autant de pastilles ENTIÈRES que la colonne en tient (#2737)', () => {
  const skill = (label: string) => ({ skill: label, label, level: 'confirme' as const, source: 'cv' as const })
  const many = { topSkills: ['Kubernetes', 'Terraform', 'Python'].map(skill), skillCount: 9 }

  it('sans mesure, trois au plus', () => {
    expect(chipsThatFit(many, 0)).toBe(3)
  })

  it('dans une colonne étroite, moins de pastilles plutôt que des pastilles réduites à une lettre', () => {
    expect(chipsThatFit(many, 200)).toBe(1)
    expect(chipsThatFit(many, 280)).toBe(2)
    expect(chipsThatFit(many, 400)).toBe(3)
  })

  it('toujours au moins une, même trop longue pour la colonne', () => {
    expect(
      chipsThatFit({ topSkills: [skill('évaluation et audit de cohérence des sorties')], skillCount: 16 }, 180),
    ).toBe(1)
  })
})

describe('VivierTableRow — le nom mène à la fiche, le reste de la ligne ouvre le panneau (#4194)', () => {
  it('le clic sur le NOM ne passe pas par le panneau : le lien navigue vers la fiche', async () => {
    const onOpenRecord = vi.fn()
    renderRow({}, { onOpenRecord })
    const link = (await screen.findAllByRole('link')).find(a => a.getAttribute('href') === '/consultants/c1')
    if (!link) throw new Error('lien vers la fiche introuvable')
    fireEvent.click(link)
    expect(onOpenRecord).not.toHaveBeenCalled()
  })

  it('le clic sur le reste de la ligne ouvre le panneau sur ce consultant', async () => {
    const onOpenRecord = vi.fn()
    const { container } = renderRow({}, { onOpenRecord })
    await screen.findByText('Yanis Berthier')
    const cell = container.querySelector('td[data-column="name"]')
    expect(cell).not.toBeNull()
    fireEvent.click(cell as Element)
    expect(onOpenRecord).toHaveBeenCalledWith('c1')
  })

  it('le clic sur la case à cocher n’ouvre pas le panneau', async () => {
    const onOpenRecord = vi.fn()
    renderRow({}, { onOpenRecord })
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(onOpenRecord).not.toHaveBeenCalled()
  })
})
