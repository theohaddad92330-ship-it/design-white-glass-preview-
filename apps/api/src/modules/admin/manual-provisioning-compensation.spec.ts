import {
  buildFailureReport,
  decideCompensation,
  outcomeOfFailure,
  type CompensationDecision,
} from './manual-provisioning-compensation'

/**
 * La DÉCISION de défaire une écriture, prouvée hors de toute base.
 *
 * Le service prouve qu'elle est APPELÉE (`manual-provisioning.service.spec.ts`,
 * bloc « tout ou rien ») ; ce fichier prouve qu'elle est JUSTE — y compris dans
 * les deux cas où le geste correct est de ne rien faire, qui sont ceux qu'on
 * écrit rarement et qu'on regrette toujours.
 */
describe('la compensation du provisionnement (#1665, règle 1)', () => {
  const USER = '11111111-1111-4111-8111-111111111111'
  const enVol = (code: string) => Object.assign(new Error('fetch failed'), { cause: { code } })

  describe('la seule question : la requête a-t-elle pu PARTIR ?', () => {
    it('une connexion jamais établie est un ÉCHEC — rejouable', () => {
      expect(outcomeOfFailure(enVol('ECONNREFUSED'))).toBe('failed')
      expect(outcomeOfFailure(enVol('ENOTFOUND'))).toBe('failed')
    })

    it('⚠️ `UND_ERR_CONNECT_TIMEOUT` porte le mot « timeout » et n’en est pas un', () => {
      // Délai d'ÉTABLISSEMENT : la connexion n'a jamais abouti, donc rien n'a pu
      // être appliqué par le distant.
      expect(outcomeOfFailure(enVol('UND_ERR_CONNECT_TIMEOUT'))).toBe('failed')
    })

    it('une requête partie sans réponse est un `unknown`', () => {
      expect(outcomeOfFailure(enVol('ETIMEDOUT'))).toBe('unknown')
      expect(outcomeOfFailure(enVol('ECONNRESET'))).toBe('unknown')
      expect(outcomeOfFailure(enVol('UND_ERR_HEADERS_TIMEOUT'))).toBe('unknown')
    })
  })

  describe('ce qu’on défait, et ce qu’on refuse de défaire', () => {
    it('rien à défaire quand la transaction a été commise', () => {
      const decision = decideCompensation({ ownerAccountCreatedHere: true, ownerUserId: USER, sqlOutcome: 'done' })
      expect(decision.action).toBe('nothing')
    })

    it('T1 — un compte créé à l’instant est supprimé quand la transaction échoue', () => {
      const decision = decideCompensation({ ownerAccountCreatedHere: true, ownerUserId: USER, sqlOutcome: 'failed' })
      expect(decision).toMatchObject({ action: 'delete_owner_account', userId: USER })
    })

    it('un compte PRÉEXISTANT n’est jamais supprimé — ce n’est pas le nôtre', () => {
      const decision = decideCompensation({ ownerAccountCreatedHere: false, ownerUserId: USER, sqlOutcome: 'failed' })
      expect(decision.action).toBe('nothing')
    })

    it('⚠️ `unknown` ARRÊTE la compensation — la transaction a peut-être été commise', () => {
      // Le geste dangereux est ici la SUPPRESSION : elle détruirait le
      // propriétaire d'un espace bien réel, avec ses membres et son abonnement.
      const decision = decideCompensation({ ownerAccountCreatedHere: true, ownerUserId: USER, sqlOutcome: 'unknown' })
      expect(decision.action).toBe('stop')
    })

    it('sans identifiant de compte, il n’y a rien à supprimer', () => {
      const decision = decideCompensation({ ownerAccountCreatedHere: true, ownerUserId: null, sqlOutcome: 'failed' })
      expect(decision.action).toBe('nothing')
    })
  })

  describe('le compte rendu — « tout a été annulé » est une phrase de confiance', () => {
    const suppression: CompensationDecision = {
      action: 'delete_owner_account',
      userId: USER,
      reason: 'peu importe ici',
    }

    it('dit « annulé » quand la compensation a réellement abouti', () => {
      const report = buildFailureReport({
        cause: 'Provisionnement interrompu : deadlock.',
        decision: suppression,
        compensationOutcome: 'done',
        ownerEmail: 'theo@skaizen.fr',
      })
      expect(report.fullyRolledBack).toBe(true)
      expect(report.manualCleanup).toEqual([])
      expect(report.message).toContain('Tout a été annulé')
    })

    it('ne dit PAS « annulé » quand la suppression a échoué — et nomme le compte', () => {
      const report = buildFailureReport({
        cause: 'Provisionnement interrompu : deadlock.',
        decision: suppression,
        compensationOutcome: 'failed',
        ownerEmail: 'theo@skaizen.fr',
      })
      expect(report.fullyRolledBack).toBe(false)
      expect(report.message).toContain('peut subsister')
      expect(report.manualCleanup[0]).toContain('theo@skaizen.fr')
      expect(report.manualCleanup[0]).toContain(USER)
    })

    it('distingue « la suppression a échoué » de « on ne sait pas »', () => {
      const inconnu = buildFailureReport({
        cause: 'Provisionnement interrompu : deadlock.',
        decision: suppression,
        compensationOutcome: 'unknown',
        ownerEmail: 'theo@skaizen.fr',
      })
      expect(inconnu.message).toContain('peut-être')
      expect(inconnu.fullyRolledBack).toBe(false)
    })

    it('un arrêt volontaire demande une vérification humaine, pas un rejeu', () => {
      const report = buildFailureReport({
        cause: 'Provisionnement interrompu : timeout.',
        decision: { action: 'stop', reason: 'la transaction est partie sans réponse' },
        compensationOutcome: null,
        ownerEmail: 'theo@skaizen.fr',
      })
      expect(report.fullyRolledBack).toBe(false)
      expect(report.manualCleanup).toHaveLength(1)
      expect(report.message).toContain('Vérifiez à la main')
    })

    it('« rien à défaire » se dit sans alarmer, et sans nettoyage', () => {
      const report = buildFailureReport({
        cause: 'Provisionnement interrompu : contrainte violée.',
        decision: { action: 'nothing', reason: 'le compte existait déjà.' },
        compensationOutcome: null,
        ownerEmail: 'theo@skaizen.fr',
      })
      expect(report.fullyRolledBack).toBe(true)
      expect(report.manualCleanup).toEqual([])
    })
  })
})
