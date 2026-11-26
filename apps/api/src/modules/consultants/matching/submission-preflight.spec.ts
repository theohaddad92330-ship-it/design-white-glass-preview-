import type { MatchNeed, MatchResult } from '@bellum/contracts'
import { submissionPreflight } from './submission-preflight'

const NOW = new Date('2026-09-01T10:00:00Z')

const NEED: MatchNeed = {
  needId: '11111111-1111-4111-8111-111111111111',
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountSector: 'énergie',
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: null,
  contractKind: null,
}

function result(flags: MatchResult['flags'] = []): MatchResult {
  return {
    consultantId: '22222222-2222-4222-8222-222222222222',
    axes: [],
    correspondenceScore: 84,
    pushableScore: 71,
    bucket: 'recommended',
    exclusions: [],
    skills: [],
    gaps: [],
    adjacency: [],
    questionsToValidate: [],
    flags,
  }
}

describe('la préflight du positionnement (§10.1)', () => {
  it('annonce ce qu’elle crée avant de rien faire', () => {
    const preflight = submissionPreflight(NEED, result(), {
      consentState: 'valid',
      consentExpiresAt: '2027-12-01T00:00:00.000Z',
      availabilityCheckedAt: '2026-08-30T00:00:00.000Z',
      now: NOW,
    })
    expect(preflight.creates).toHaveLength(2)
    expect(preflight.blocked).toBe(false)
  })

  it('ne coche d’avance AUCUNE action qui engage une suite', () => {
    const preflight = submissionPreflight(NEED, result(), {
      consentState: 'valid',
      consentExpiresAt: null,
      availabilityCheckedAt: null,
      now: NOW,
    })
    const checked = preflight.canPrepare.filter(action => action.defaultChecked).map(action => action.action)
    expect(checked).toEqual(['skills_dossier', 'client_message'])
  })

  it('REFUSE un consentement expiré — ce n’est pas un avertissement de plus', () => {
    const preflight = submissionPreflight(NEED, result(), {
      consentState: 'expired',
      consentExpiresAt: '2026-01-01T00:00:00.000Z',
      availabilityCheckedAt: null,
      now: NOW,
    })
    expect(preflight.blocked).toBe(true)
    expect(preflight.missing).toContain('consentement expiré')
  })

  it('n’empêche PAS un positionnement sur un refus antérieur — il le journalise', () => {
    const preflight = submissionPreflight(
      NEED,
      result([{ kind: 'previously_rejected_by_client', detail: 'refus antérieur chez ce client' }]),
      { consentState: 'valid', consentExpiresAt: null, availabilityCheckedAt: null, now: NOW },
    )
    expect(preflight.blocked).toBe(false)
    expect(preflight.missing).toContain('refus antérieur chez ce client')
  })

  it('compte les jours depuis la dernière revalidation', () => {
    const preflight = submissionPreflight(NEED, result(), {
      consentState: 'valid',
      consentExpiresAt: null,
      availabilityCheckedAt: '2026-06-19T10:00:00.000Z',
      now: NOW,
    })
    expect(preflight.checks.some(check => check.label.includes('74 jours'))).toBe(true)
  })

  it('ne reproche rien quand la disponibilité n’a jamais été revalidée', () => {
    // « Jamais demandé » n'est pas « il y a très longtemps ».
    const preflight = submissionPreflight(NEED, result(), {
      consentState: 'valid',
      consentExpiresAt: null,
      availabilityCheckedAt: null,
      now: NOW,
    })
    expect(preflight.missing).not.toContain('disponibilité non revalidée')
  })

  it('distingue « aucun consentement recueilli » de « consentement expiré »', () => {
    const none = submissionPreflight(NEED, result(), {
      consentState: 'none',
      consentExpiresAt: null,
      availabilityCheckedAt: null,
      now: NOW,
    })
    expect(none.blocked).toBe(false)
    expect(none.missing).toContain('consentement jamais recueilli')
  })

  // #2329.55 (épopée #2948) — l'état NO-GO explicite, en plus de `blocked`.
  it('porte un statut explicite ready/no_go, dérivé de blocked', () => {
    const ready = submissionPreflight(NEED, result(), {
      consentState: 'valid',
      consentExpiresAt: null,
      availabilityCheckedAt: null,
      now: NOW,
    })
    expect(ready.status).toBe('ready')

    const noGo = submissionPreflight(NEED, result(), {
      consentState: 'expired',
      consentExpiresAt: '2026-01-01T00:00:00.000Z',
      availabilityCheckedAt: null,
      now: NOW,
    })
    expect(noGo.status).toBe('no_go')
  })

  // #2329.35-.38 (épopée #2948) — le consentement à représenter est PAR
  // COMPTE, distinct du consentement global déjà géré par `consentState`.
  describe('le consentement à représenter CE compte', () => {
    it('REFUSE — un refus explicite du talent pour ce compte n’est pas un arbitrage commercial', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
        accountConsent: { canRepresent: false, restrictions: 'Pas de mission chez un ancien employeur' },
      })
      expect(preflight.blocked).toBe(true)
      expect(preflight.status).toBe('no_go')
      expect(preflight.missing).toContain('compte non autorisé par le talent')
    })

    it('avertit SANS bloquer quand ce compte n’a jamais été demandé — « jamais demandé » n’est pas un refus', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
        accountConsent: null,
      })
      expect(preflight.blocked).toBe(false)
      expect(preflight.status).toBe('ready')
      expect(preflight.missing).toContain('consentement par compte non recueilli')
    })

    it('nomme la restriction même quand le compte est autorisé — une restriction connue ne disparaît jamais', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
        accountConsent: { canRepresent: true, restrictions: 'Ne pas mentionner sa mission actuelle' },
      })
      expect(preflight.blocked).toBe(false)
      expect(
        preflight.checks.some(
          check => check.level === 'warning' && check.label.includes('Ne pas mentionner sa mission actuelle'),
        ),
      ).toBe(true)
    })
  })

  // #2948 (#2329.45-.51) — trois axes de plus de l'accord à 7 conditions :
  // TJM validé, CV validé, autres processus connus (dérivé, jamais un état
  // stocké deux fois).
  describe('l’accord à 7 conditions — TJM/CV validés, autres processus connus', () => {
    it('AVERTIT sans bloquer quand rien n’a été confirmé — même doctrine que le reste de la porte', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
        positioningAgreement: { tjmValidatedAt: null, cvValidatedAt: null, otherProcessesKnown: false },
      })
      expect(preflight.blocked).toBe(false)
      expect(preflight.status).toBe('ready')
      expect(preflight.missing).toEqual(
        expect.arrayContaining(['TJM non validé', 'CV non validé', 'autres processus non demandés']),
      )
    })

    it('ne reproche plus rien une fois les trois axes confirmés — c’est le test qui dit NON à la régression inverse', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
        positioningAgreement: {
          tjmValidatedAt: '2026-08-30T00:00:00.000Z',
          cvValidatedAt: '2026-08-30T00:00:00.000Z',
          otherProcessesKnown: true,
        },
      })
      expect(preflight.missing).not.toContain('TJM non validé')
      expect(preflight.missing).not.toContain('CV non validé')
      expect(preflight.missing).not.toContain('autres processus non demandés')
    })

    it('traite l’absence de `positioningAgreement` comme « rien de confirmé » — jamais un crash ni un « ok » deviné', () => {
      const preflight = submissionPreflight(NEED, result(), {
        consentState: 'valid',
        consentExpiresAt: null,
        availabilityCheckedAt: null,
        now: NOW,
      })
      expect(preflight.missing).toEqual(expect.arrayContaining(['TJM non validé', 'CV non validé']))
    })
  })
})
