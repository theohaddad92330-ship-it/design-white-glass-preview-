import { describe, expect, it } from 'vitest'
import type { DiscoverCallListRow } from '../../discover/lib/discover-call-list'
import {
  buildProspectingSession,
  mergeSessionCollisions,
  prospectingSessionCsv,
  PROSPECTING_SESSION_MODES,
} from './prospecting-session'

function row(overrides: Partial<DiscoverCallListRow> = {}): DiscoverCallListRow {
  return {
    key: overrides.key ?? 'k1',
    siren: '123456789',
    accountId: 'acc-1',
    portfolioState: 'new',
    company: 'ACME',
    website: null,
    reason: null,
    signal: null,
    city: null,
    department: null,
    contactLocation: null,
    confidence: null,
    contactId: 'contact-1',
    fullName: 'Marie Dupont',
    title: 'DSI',
    level: null,
    expertise: null,
    email: 'marie@acme.fr',
    phone: '0102030405',
    unknown: [],
    ...overrides,
  }
}

describe('PROSPECTING_SESSION_MODES — les sept modes du corps de l’issue #2375', () => {
  it('porte exactement les sept modes, dans cet ordre', () => {
    expect(PROSPECTING_SESSION_MODES).toEqual([
      'appels',
      'linkedin',
      'email',
      'mixte',
      'reactivation',
      'compte',
      'talent',
    ])
  })
})

describe('buildProspectingSession — #2375.1 une session, pas une liste', () => {
  it('rend un OBJET session — objectif, durée, mode — pas seulement des lignes', () => {
    const session = buildProspectingSession([row()], { mode: 'appels', durationMinutes: 60, objective: 'Qualifier' })
    expect(session.mode).toBe('appels')
    expect(session.objective).toBe('Qualifier')
    expect(session.durationMinutes).toBe(60)
    expect(session.contacts).toHaveLength(1)
  })

  it('écarte une ligne « entreprise seule », sans personne identifiée — rien à appeler', () => {
    const session = buildProspectingSession([row({ key: 'k2', fullName: null, title: null, contactId: null })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'Qualifier',
    })
    expect(session.contacts).toHaveLength(0)
  })
})

describe('buildProspectingSession — #2375.3 sept modes, sept comportements distincts', () => {
  it('Appels vise le TÉLÉPHONE — prêt seulement si un numéro est connu', () => {
    const session = buildProspectingSession([row({ key: 'a', phone: null }), row({ key: 'b', phone: '0102030405' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    expect(session.contacts.find(c => c.key === 'a')?.ready).toBe(false)
    expect(session.contacts.find(c => c.key === 'b')?.ready).toBe(true)
    expect(session.contacts.every(c => c.channel === 'call')).toBe(true)
  })

  it('Email vise l’E-MAIL — prêt seulement si une adresse est connue', () => {
    const session = buildProspectingSession([row({ email: null })], {
      mode: 'email',
      durationMinutes: 60,
      objective: 'x',
    })
    expect(session.contacts[0]?.channel).toBe('email')
    expect(session.contacts[0]?.ready).toBe(false)
  })

  it('Mixte s’ADAPTE : téléphone si connu, sinon e-mail, sinon LinkedIn', () => {
    const session = buildProspectingSession(
      [
        row({ key: 'tel', phone: '0102030405', email: 'x@y.fr' }),
        row({ key: 'mail', phone: null, email: 'x@y.fr' }),
        row({ key: 'ln', phone: null, email: null }),
      ],
      { mode: 'mixte', durationMinutes: 60, objective: 'x' },
    )
    expect(session.contacts.find(c => c.key === 'tel')?.channel).toBe('call')
    expect(session.contacts.find(c => c.key === 'mail')?.channel).toBe('email')
    expect(session.contacts.find(c => c.key === 'ln')?.channel).toBe('linkedin')
  })

  it('LinkedIn et Talent ne demandent ni téléphone ni e-mail pour être « prêts »', () => {
    const session = buildProspectingSession([row({ phone: null, email: null })], {
      mode: 'linkedin',
      durationMinutes: 60,
      objective: 'x',
    })
    expect(session.contacts[0]?.ready).toBe(true)
  })

  it('Compte regroupe les lignes par ENTREPRISE, plusieurs personnes d’un même compte adjacentes', () => {
    const session = buildProspectingSession(
      [
        row({ key: '1', company: 'ACME', fullName: 'A' }),
        row({ key: '2', company: 'BETA', fullName: 'B' }),
        row({ key: '3', company: 'ACME', fullName: 'C' }),
      ],
      { mode: 'compte', durationMinutes: 60, objective: 'x' },
    )
    expect(session.contacts.map(c => c.company)).toEqual(['ACME', 'ACME', 'BETA'])
  })
})

describe('buildProspectingSession — #2375.4 pitch et première question par contact', () => {
  it('le pitch reprend la raison SUGGÉRÉE réelle, jamais un texte inventé', () => {
    const session = buildProspectingSession([row({ reason: 'Poste DSI ouvert depuis 3 mois' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    expect(session.contacts[0]?.pitch).toContain('Poste DSI ouvert depuis 3 mois')
  })

  it('sans raison ni signal, un pitch générique nommé — jamais vide', () => {
    const session = buildProspectingSession([row({ reason: null, signal: null })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    expect(session.contacts[0]?.pitch.length).toBeGreaterThan(0)
  })

  it('chaque contact porte une première question, jamais vide', () => {
    const session = buildProspectingSession([row()], { mode: 'appels', durationMinutes: 60, objective: 'x' })
    expect(session.contacts[0]?.firstQuestion.length).toBeGreaterThan(0)
  })
})

describe('buildProspectingSession — #2375.6 une heure ne propose jamais cinquante appels', () => {
  it('borne le nombre de contacts PRÊTS au temps disponible, et COMPTE l’excédent', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ key: `k${i}`, fullName: `Contact ${i}` }))
    const session = buildProspectingSession(rows, { mode: 'appels', durationMinutes: 60, objective: 'x' })
    // 4 min/contact estimées pour un appel → 15 contacts au plus en 60 min.
    expect(session.contacts.filter(c => c.ready).length).toBeLessThanOrEqual(15)
    expect(session.boundedOut).toBe(50 - session.contacts.filter(c => c.ready).length)
  })

  it('LinkedIn, plus rapide, tient plus de contacts dans le même créneau', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ key: `k${i}`, fullName: `Contact ${i}` }))
    const appels = buildProspectingSession(rows, { mode: 'appels', durationMinutes: 60, objective: 'x' })
    const linkedin = buildProspectingSession(rows, { mode: 'linkedin', durationMinutes: 60, objective: 'x' })
    expect(linkedin.contacts.filter(c => c.ready).length).toBeGreaterThan(appels.contacts.filter(c => c.ready).length)
  })
})

describe('buildProspectingSession — #2375.7 signale les contacts incomplets', () => {
  it('compte numéros connus, e-mails seuls, et identités à vérifier', () => {
    const rows = [
      row({ key: '1', phone: '0102030405', email: 'a@a.fr' }),
      row({ key: '2', phone: null, email: 'b@b.fr' }),
      row({ key: '3', phone: null, email: null, unknown: ['person'] }),
    ]
    const session = buildProspectingSession(rows, { mode: 'appels', durationMinutes: 60, objective: 'x' })
    expect(session.missing.phonesAvailable).toBe(1)
    expect(session.missing.emailsOnly).toBe(1)
    expect(session.missing.toVerify).toBe(1)
  })
})

describe('buildProspectingSession — #2386.6 porte le contactId, brut de la ligne', () => {
  it('reprend `contactId` sans le recalculer — `null` quand la ligne n’en porte pas', () => {
    const session = buildProspectingSession(
      [row({ key: '1', contactId: 'contact-9' }), row({ key: '2', contactId: null })],
      {
        mode: 'appels',
        durationMinutes: 60,
        objective: 'x',
      },
    )
    expect(session.contacts.find(c => c.key === '1')?.contactId).toBe('contact-9')
    expect(session.contacts.find(c => c.key === '2')?.contactId).toBeNull()
  })
})

describe('mergeSessionCollisions — #2386.6 la collision entre commerciaux, dans la session', () => {
  it('attache la collision RENDUE par le serveur au contact dont l’id correspond', () => {
    const session = buildProspectingSession([row({ key: '1', contactId: 'contact-9' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    const merged = mergeSessionCollisions(session, {
      'contact-9': { colleague: { user_id: 'u-7', name: 'Sarah Nasri' }, lastTouchOn: '2026-09-20', withinDays: 7 },
    })
    expect(merged.contacts[0]?.collision).toEqual({
      colleague: { user_id: 'u-7', name: 'Sarah Nasri' },
      lastTouchOn: '2026-09-20',
      withinDays: 7,
    })
  })

  it('un contact VÉRIFIÉ sans collision porte `null`, jamais `undefined`', () => {
    const session = buildProspectingSession([row({ key: '1', contactId: 'contact-9' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    const merged = mergeSessionCollisions(session, { 'contact-9': null })
    expect(merged.contacts[0]?.collision).toBeNull()
  })

  it('un contact ABSENT de la réponse reste `undefined` — non vérifié, jamais deviné', () => {
    const session = buildProspectingSession([row({ key: '1', contactId: 'contact-9' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    const merged = mergeSessionCollisions(session, {})
    expect(merged.contacts[0]?.collision).toBeUndefined()
  })
})

describe('prospectingSessionCsv — #2375.8 export checklist avec pitch et question', () => {
  it('exporte le pitch et la première question, dans l’ordre affiché', () => {
    const session = buildProspectingSession([row({ reason: 'Angle réel' })], {
      mode: 'appels',
      durationMinutes: 60,
      objective: 'x',
    })
    const csv = prospectingSessionCsv(session, {
      company: 'Entreprise',
      fullName: 'Nom',
      title: 'Fonction',
      channel: 'Canal',
      pitch: 'Pitch',
      firstQuestion: 'Première question',
      ready: 'Prêt',
    })
    expect(csv).toContain('Angle réel')
    expect(csv.split('\n')[0]).toContain('"Entreprise","Nom","Fonction","Canal","Pitch","Première question","Prêt"')
  })
})
