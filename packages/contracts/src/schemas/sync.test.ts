import { describe, expect, it } from 'vitest'
import { decideSync, startSyncSchema, summarizeSync, type IncomingRecord } from './sync.js'

function index(
  over: { byExternalId?: [string, string][]; byEmail?: [string, string][]; linkedInternalIds?: string[] } = {},
) {
  return {
    byExternalId: new Map(over.byExternalId ?? []),
    byEmail: new Map(over.byEmail ?? []),
    linkedInternalIds: new Set(over.linkedInternalIds ?? []),
  }
}

function record(over: Partial<IncomingRecord> = {}): IncomingRecord {
  return { externalId: 'ext-1', email: 'marie@acme.fr', name: 'Marie Dupont', ...over }
}

describe('startSyncSchema', () => {
  it('est en SIMULATION par défaut', () => {
    // Un défaut à `false` ferait du premier appel exploratoire une écriture de
    // masse sur la base d'un client.
    expect(startSyncSchema.parse({ provider: 'hubspot' }).dryRun).toBe(true)
  })

  it('borne chaque exécution', () => {
    expect(startSyncSchema.parse({ provider: 'hubspot' }).limit).toBe(200)
    expect(() => startSyncSchema.parse({ provider: 'hubspot', limit: 5000 })).toThrow()
  })
})

describe('decideSync', () => {
  it('MET À JOUR quand le lien existe — c’est ce qui rend un import rejouable', () => {
    const decision = decideSync(record(), index({ byExternalId: [['ext-1', 'internal-1']] }))
    expect(decision).toEqual({ action: 'update', internalId: 'internal-1' })
  })

  it('CRÉE une ligne inconnue', () => {
    expect(decideSync(record(), index())).toEqual({ action: 'create' })
  })

  it('refuse une ligne SANS identifiant externe — un import sans clé se rejoue en double', () => {
    expect(decideSync(record({ externalId: '   ' }), index())).toEqual({
      action: 'skip',
      reason: 'no_identifier',
    })
  })

  it('signale un CONFLIT au lieu de fusionner quand la fiche est DÉJÀ liée ailleurs', () => {
    // Fusionner est irréversible côté CRM, et un faux positif détruit
    // l'historique d'un vrai client. C'est à un humain de trancher.
    //
    // Ce qui fait le conflit, c'est que `internal-1` porte DÉJÀ un identifiant
    // externe : deux lignes du CRM revendiquent alors la même fiche.
    const decision = decideSync(
      record({ externalId: 'ext-2' }),
      index({ byEmail: [['marie@acme.fr', 'internal-1']], linkedInternalIds: ['internal-1'] }),
    )
    expect(decision).toEqual({ action: 'skip', reason: 'already_linked_elsewhere' })
  })

  it('RATTACHE au lieu de recréer quand la fiche n’est liée à RIEN — la première résolution', () => {
    // Le défaut T-069 : `sync_links` n'était jamais écrit, donc AUCUNE fiche
    // n'était jamais « déjà liée ». Toute adresse connue partait alors en
    // conflit, à chaque import, indéfiniment — et la ligne n'était ni créée ni
    // mise à jour. Rattacher n'est pas fusionner : rien n'est détruit, un
    // identifiant externe est simplement posé sur la fiche qui porte EXACTEMENT
    // cette adresse.
    const decision = decideSync(record({ externalId: 'ext-2' }), index({ byEmail: [['marie@acme.fr', 'internal-1']] }))
    expect(decision).toEqual({ action: 'update', internalId: 'internal-1' })
  })

  it('compare les adresses sans tenir compte de la casse', () => {
    const decision = decideSync(
      record({ externalId: 'ext-2', email: 'Marie@ACME.fr' }),
      index({ byEmail: [['marie@acme.fr', 'internal-1']], linkedInternalIds: ['internal-1'] }),
    )
    expect(decision.action).toBe('skip')
  })

  it('accepte une ligne sans adresse MAIS avec un nom', () => {
    // Beaucoup de CRM stockent des contacts sans e-mail ; les refuser tous
    // amputerait la reprise d'une part importante de la base.
    expect(decideSync(record({ email: null }), index())).toEqual({ action: 'create' })
  })

  it('refuse une ligne sans adresse NI nom — une fiche vide ne se rattache jamais', () => {
    expect(decideSync(record({ email: null, name: '  ' }), index())).toEqual({
      action: 'skip',
      reason: 'no_identifier',
    })
  })

  it('préfère le LIEN à l’adresse quand les deux existent', () => {
    // Le lien est la vérité : l'adresse a pu changer chez le client.
    const decision = decideSync(
      record(),
      index({ byExternalId: [['ext-1', 'internal-1']], byEmail: [['marie@acme.fr', 'internal-2']] }),
    )
    expect(decision).toEqual({ action: 'update', internalId: 'internal-1' })
  })
})

describe('summarizeSync', () => {
  const meta = { provider: 'hubspot' as const, entityType: 'contact' as const, dryRun: true, truncated: false }

  it('compte créations, mises à jour et écarts AVEC leur raison', () => {
    // Un import qui annonce « 412 lignes traitées » sans dire que 90 ont été
    // ignorées laisse croire à une reprise complète.
    const outcome = summarizeSync(
      [
        { ref: 'a', decision: { action: 'create' } },
        { ref: 'b', decision: { action: 'update', internalId: 'i1' } },
        { ref: 'c', decision: { action: 'skip', reason: 'invalid_email' } },
      ],
      meta,
    )
    expect(outcome.created).toBe(1)
    expect(outcome.updated).toBe(1)
    expect(outcome.skipped).toEqual([{ ref: 'c', reason: 'invalid_email' }])
  })

  it('transporte `dryRun` tel quel — c’est ce qui dit si les nombres ont eu lieu', () => {
    expect(summarizeSync([], meta).dryRun).toBe(true)
    expect(summarizeSync([], { ...meta, dryRun: false }).dryRun).toBe(false)
  })

  it('transporte la troncature — « 500 importés » sur 3000 se lit comme une fin', () => {
    expect(summarizeSync([], { ...meta, truncated: true }).truncated).toBe(true)
  })

  it('rend un compte-rendu vide sans erreur', () => {
    const outcome = summarizeSync([], meta)
    expect(outcome.created).toBe(0)
    expect(outcome.skipped).toEqual([])
  })
})
