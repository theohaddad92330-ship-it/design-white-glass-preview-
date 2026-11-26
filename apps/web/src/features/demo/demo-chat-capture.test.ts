import { parseChatImageObjects } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { demoTurn } from '@/features/chat/api/demo-turn'
import { DEMO_CHAT_CAPTURE } from './demo-chat-capture'

/**
 * #2433.12 (épopée #2876, lot P02 09/10) — la capture SEMÉE de la salle : la
 * seule voie par laquelle un prospect voit le recadrage proposé et le tableau
 * lu (le localiseur n'est jamais appelé en salle). Ses objets passent le MÊME
 * contrat que ceux du service IA — une capture que le contrat refuserait
 * n'afficherait rien en démonstration.
 */
describe('la capture semée de la salle (#2433.12)', () => {
  it('ses objets passent le contrat partagé, tels quels', () => {
    const wire = {
      document_bounds: DEMO_CHAT_CAPTURE.objects.documentBounds,
      table: {
        bounding_box: DEMO_CHAT_CAPTURE.objects.table?.boundingBox,
        rows: DEMO_CHAT_CAPTURE.objects.table?.rows,
      },
    }
    expect(parseChatImageObjects(wire)).toEqual(DEMO_CHAT_CAPTURE.objects)
  })

  it('propose un vrai recadrage (pas l’image entière) et garde une case VIDE, jamais « 0 »', () => {
    const bounds = DEMO_CHAT_CAPTURE.objects.documentBounds
    expect(bounds).not.toBeNull()
    expect((bounds?.w ?? 1) * (bounds?.h ?? 1)).toBeLessThan(1)
    const cells = DEMO_CHAT_CAPTURE.objects.table?.rows.flat() ?? []
    expect(cells).toContain(null)
    expect(cells).not.toContain('0')
    expect(DEMO_CHAT_CAPTURE.imageUrl.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('la question scriptée porte la capture ; une autre question, jamais', () => {
    expect(demoTurn('Lis le tableau de cette capture', 'hors script').imageCapture).toBe(DEMO_CHAT_CAPTURE)
    expect(demoTurn('Clôture ma journée', 'hors script').imageCapture).toBeUndefined()
    expect(demoTurn('une question libre', 'hors script').imageCapture).toBeUndefined()
  })
})
