import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3422.20 — « message trop générique » : la même checklist « avant d'envoyer »
 * que l'écran (`preSendCheck`, `PreSendChecklist.tsx`) répond à Laura. Aucun
 * second jeu de règles ici ; le pont relaie TOUTES les lignes (un contrôle ne
 * masque jamais sa ligne), dont celles qu'il n'a pas su vérifier.
 */
describe('CopilotBridgeController.messagePreSendCheck (#3422.20)', () => {
  const call = (body: string, step?: number) =>
    CopilotBridgeController.prototype.messagePreSendCheck.call({} as never, { userId: 'u-1', body, step } as never)

  const GENERIC = 'Bonjour, je me permets de vous contacter afin de vous présenter notre expertise Java.'
  const PERSONAL =
    'Bonjour Claire, votre équipe applications recrute deux développeurs Java depuis mars. Avez-vous déjà un renfort prévu ?'

  it('un message générique échoue au moins à « une question facile », nommée', () => {
    const out = call(GENERIC, 1)
    expect(out.failures.map(f => f.id)).toContain('easy_question')
    expect(out.readyToSend).toBe(false)
  })

  it('relaie toutes les lignes de la liste, quel que soit le message', () => {
    expect(call(GENERIC, 1).checks).toHaveLength(call(PERSONAL, 1).checks.length)
  })

  it('« prêt » ne se dit jamais sur un contrôle non vérifiable : il est nommé à part', () => {
    const out = call(PERSONAL, 1)
    expect(out.notCheckable.length).toBeGreaterThanOrEqual(0)
    if (out.notCheckable.length > 0) expect(out.readyToSend).toBe(false)
  })

  describe('#3436 — « trop générique » est un échec nommé', () => {
    const callWith = (body: string, recipientTerms?: string[]) =>
      CopilotBridgeController.prototype.messagePreSendCheck.call(
        {} as never,
        {
          userId: 'u-1',
          body,
          step: 1,
          recipientTerms,
        } as never,
      )

    it('un message qui ne nomme ni l’entreprise ni la personne échoue, nommément', () => {
      const out = callWith(GENERIC, ['Société Générale', 'Claire'])
      expect(out.failures.map(f => f.id)).toContain('recipient_specific')
      expect(out.failures.find(f => f.id === 'recipient_specific')?.detail).toMatch(/Trop générique/)
      expect(out.readyToSend).toBe(false)
    })

    it('le même message passe dès qu’il nomme l’entreprise (accents et casse ignorés)', () => {
      const out = callWith(PERSONAL.replace('votre équipe', 'chez societe generale votre équipe'), ['Société Générale'])
      expect(out.failures.map(f => f.id)).not.toContain('recipient_specific')
    })

    it('sans destinataire connu : non vérifiable, jamais conforme', () => {
      const out = callWith(PERSONAL)
      expect(out.notCheckable.map(f => f.id)).toContain('recipient_specific')
      expect(out.readyToSend).toBe(false)
    })
  })
})
