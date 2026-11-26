import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { demoTurn } from '@/features/chat/api/demo-turn'
import { StructuredReply } from '@/features/chat/view/StructuredReply'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const downloadCSV = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export-csv', () => ({ downloadCSV }))

/** #4748 — la liste longue de la salle : 24 lignes rendues, 24 annoncées au bouton, 24 dans le fichier. */
describe('#4748 — la liste longue de Laura, en salle de démonstration', () => {
  const reply = demoTurn('Donne-moi en fichier la liste complète des PME industrielles à suivre', 'REPLI').reply

  it('le tableau rend les 24 lignes, le bouton le dit et le fichier en porte 24', async () => {
    expect(reply).not.toBe('REPLI')
    renderWithRouter(<StructuredReply text={reply} />)
    const card = await screen.findByRole('group', { name: 'PME industrielles à suivre' })
    expect(within(within(card).getByRole('table')).getAllByRole('row')).toHaveLength(25)
    await userEvent.click(within(card).getByRole('button', { name: 'Télécharger les 24 lignes' }))
    const csv = downloadCSV.mock.calls[0]![0] as string
    expect(csv.split(/\r?\n/).filter(Boolean)).toHaveLength(25)
  })
})
