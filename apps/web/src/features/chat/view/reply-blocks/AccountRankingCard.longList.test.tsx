import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'

const downloadCSV = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export-csv', () => ({ downloadCSV }))

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')
const renderReply = (text: string) => renderWithRouter(<StructuredReply text={text} />)

/** Un classement de `count` comptes synthétiques — noms inventés, aucune donnée réelle. */
const rankingOf = (count: number) => ({
  type: 'account_ranking',
  title: 'Liste de Laura',
  axes: ['Signal daté'],
  items: Array.from({ length: count }, (_, i) => ({
    name: `Société Test ${String(i + 1).padStart(3, '0')}`,
    why: ['Signal.'],
  })),
})

const fileOf = (count: number) => ({
  type: 'file_export',
  title: 'Fichier de Laura',
  filename: 'liste.csv',
  columns: ['Nom', 'Ville'],
  rows: Array.from({ length: count }, (_, i) => ({ cells: [`Ligne ${String(i + 1).padStart(3, '0')}`, 'Lyon'] })),
})

const csvRows = (csv: string) => csv.split(/\r?\n/).filter(Boolean).length - 1

/**
 * #4748 — « le tableau n'en montre que 3, il en annonce ~100 ; Télécharger n'en prend que 3 ».
 * Cause mesurée : `TopThenRest` (ReplyCard.tsx) replie la liste sur 3 lignes, sans dire combien le bloc en porte,
 * et les boutons d'export ne disaient pas combien de lignes partent. Le bloc, lui, porte tout ce qu'il reçoit.
 */
describe('#4748 — une liste de plus de 20 comptes ne contredit jamais son propre écran', () => {
  beforeEach(() => downloadCSV.mockClear())

  it('replié, la carte DIT « 3 sur 20 affichés » et ne laisse pas un autre nombre faire foi', async () => {
    renderReply(fence(rankingOf(20)))
    const card = await screen.findByRole('group', { name: 'Liste de Laura' })
    expect(within(card).getAllByRole('article')).toHaveLength(3)
    expect(within(card).getByText('3 sur 20 affichés')).toBeInTheDocument()
    expect(within(card).getByText('20 comptes dans cette liste')).toBeInTheDocument()
  })

  it('déplié, le tableau rend autant de lignes que la carte en annonce', async () => {
    const user = userEvent.setup()
    renderReply(fence(rankingOf(20)))
    const card = await screen.findByRole('group', { name: 'Liste de Laura' })
    await user.click(within(card).getByRole('button', { name: 'Afficher les 17 autres résultats' }))
    expect(within(card).getAllByRole('article')).toHaveLength(20)
    expect(within(card).queryByText(/sur 20 affichés/)).not.toBeInTheDocument()
  })

  it('le bouton d’export dit combien de comptes partent, et le fichier en contient autant', async () => {
    const user = userEvent.setup()
    renderReply(fence(rankingOf(20)))
    const card = await screen.findByRole('group', { name: 'Liste de Laura' })
    await user.click(within(card).getByRole('button', { name: 'Exporter les 20 comptes en CSV' }))
    const [csv] = downloadCSV.mock.calls[0]!
    expect(csvRows(csv)).toBe(20)
    expect(csv).toContain('Société Test 020')
  })

  it('coché, le libellé annonce la sélection — un export partiel est un CHOIX nommé', async () => {
    const user = userEvent.setup()
    renderReply(fence(rankingOf(20)))
    const card = await screen.findByRole('group', { name: 'Liste de Laura' })
    for (const n of ['001', '002', '003']) {
      await user.click(within(card).getByRole('checkbox', { name: `Sélectionner Société Test ${n}` }))
    }
    await user.click(within(card).getByRole('button', { name: 'Enregistrer les 3 sélectionnés' }))
    expect(csvRows(downloadCSV.mock.calls[0]![0])).toBe(3)
  })

  // MESURE (#4748) : au-delà du plafond du contrat (20, miroir de `_ACCOUNT_SEARCH_MAX_ITEMS`) le bloc est REFUSÉ
  // par `replyBlockSchema` (reply-blocks.ts, `.max(20)`) et ressort en texte — aucun nom n'est perdu, aucun n'est inventé.
  it('MESURE : 25 comptes dépassent le contrat, ressortent en texte, tous présents', async () => {
    const user = userEvent.setup()
    renderReply(fence(rankingOf(25)))
    await user.click(await screen.findByRole('button', { name: /^Voir les \d+ autres$/ }))
    expect(await screen.findByText('Société Test 025')).toBeInTheDocument()
    expect(screen.getByText('Société Test 001')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Liste de Laura' })).not.toBeInTheDocument()
  })

  it('NON : une liste de 2 comptes n’affiche aucune mention d’écart', async () => {
    renderReply(fence(rankingOf(2)))
    const card = await screen.findByRole('group', { name: 'Liste de Laura' })
    expect(within(card).queryByText(/sur 2 affichés/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/affichés/)).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /autres? résultats?/ })).not.toBeInTheDocument()
  })
})

describe('#4748 — le fichier de Laura : le téléchargement contient ce que le tableau montre', () => {
  beforeEach(() => downloadCSV.mockClear())

  it('un tableau de 25 lignes les rend toutes, et « Télécharger les 25 lignes » les exporte toutes', async () => {
    const user = userEvent.setup()
    renderReply(fence(fileOf(25)))
    const card = await screen.findByRole('group', { name: 'Fichier de Laura' })
    expect(within(within(card).getByRole('table')).getAllByRole('row')).toHaveLength(26)
    await user.click(within(card).getByRole('button', { name: 'Télécharger les 25 lignes' }))
    expect(csvRows(downloadCSV.mock.calls[0]![0])).toBe(25)
  })

  it('NON : une seule ligne se dit au singulier, sans mention d’écart', async () => {
    renderReply(fence(fileOf(1)))
    const card = await screen.findByRole('group', { name: 'Fichier de Laura' })
    expect(within(card).getByRole('button', { name: 'Télécharger la ligne' })).toBeInTheDocument()
  })
})
