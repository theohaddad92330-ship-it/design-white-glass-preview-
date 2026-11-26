import { filterEligibleContacts, type EligibilityRow } from './contact-eligibility'

/**
 * #2295.3 — l'éligibilité se décide AVANT le rang. Un contact qui échoue à la
 * porte ne reçoit pas un mauvais score : il ne participe pas au classement, et
 * la raison voyage avec lui.
 */

let seq = 0
function row(patch: Partial<EligibilityRow> = {}): EligibilityRow {
  seq += 1
  return {
    id: `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`,
    full_name: 'Jean Dupont',
    entity: 'Groupe',
    hidden: false,
    excluded_at: null,
    ...patch,
  }
}

describe('filterEligibleContacts — #2295.3', () => {
  it('un contact ÉCARTÉ (excluded_at) ne participe pas au classement, et la raison se dit', () => {
    const excluded = row({ excluded_at: '2026-09-01T00:00:00.000Z' })
    const res = filterEligibleContacts([excluded], null)
    expect(res.eligible).toEqual([])
    expect(res.excluded).toEqual([{ contact_id: excluded.id, reason: 'permission_denied' }])
  })

  it('un contact MASQUÉ (hidden) est écarté pour permission, pas noté', () => {
    const hidden = row({ hidden: true })
    const res = filterEligibleContacts([hidden], null)
    expect(res.excluded).toEqual([{ contact_id: hidden.id, reason: 'permission_denied' }])
  })

  it('une entité hors périmètre du compte (bruit) est écartée avant le rang', () => {
    const raw = { entities_exhaustive: [{ name: 'Filiale Bruit', relevance: 'noise' }] }
    const noisy = row({ entity: 'Filiale Bruit' })
    const res = filterEligibleContacts([noisy], raw)
    expect(res.eligible).toEqual([])
    expect(res.excluded).toEqual([{ contact_id: noisy.id, reason: 'entity_mismatch' }])
  })

  it('une entité P1 connue de la cartographie reste éligible', () => {
    const raw = { priority_perimeters: [{ name: 'Groupe', tier: 'P1' }] }
    const clean = row({ entity: 'Groupe' })
    const res = filterEligibleContacts([clean], raw)
    expect(res.eligible).toEqual([clean])
    expect(res.excluded).toEqual([])
  })

  it('deux contacts du même compte au même nom normalisé sont des homonymes non résolus — les deux sortent', () => {
    const a = row({ full_name: 'Sébastien Chauffray' })
    const b = row({ full_name: 'Sebastien Chauffray' })
    const res = filterEligibleContacts([a, b], null)
    expect(res.eligible).toEqual([])
    expect(res.excluded.map(x => x.contact_id).sort()).toEqual([a.id, b.id].sort())
    expect(res.excluded.every(x => x.reason === 'homonym_conflict')).toBe(true)
  })

  it('un contact éligible traverse la porte inchangé', () => {
    const clean = row()
    const res = filterEligibleContacts([clean], null)
    expect(res.eligible).toEqual([clean])
    expect(res.excluded).toEqual([])
  })

  // #2160.53 — une personne HISTORIQUE (ex-employé, `lifecycle_state='historique'`,
  // dérivé de `employerMismatch` par `computeContactLifecycleState`) n'est pas mal
  // classée : elle ne participe pas au classement du tout, comme les autres portes.
  it('un contact au lifecycle HISTORIQUE (ex-employé) est écarté avant le rang', () => {
    const former = row({ lifecycle_state: 'historique' })
    const res = filterEligibleContacts([former], null)
    expect(res.eligible).toEqual([])
    expect(res.excluded).toEqual([{ contact_id: former.id, reason: 'former_employee' }])
  })

  it('un contact au lifecycle actuel (non historique) reste éligible', () => {
    const current = row({ lifecycle_state: 'actionnable' })
    const res = filterEligibleContacts([current], null)
    expect(res.eligible).toEqual([current])
    expect(res.excluded).toEqual([])
  })

  // #2160.60 — « Autoriser la recommandation » : une correction humaine, posée sur
  // la fiche, lève UN doute d'identité précis — jamais une permission ni un fait de
  // cycle de vie, et jamais une raison autre que celle pour laquelle elle a été posée.
  describe('#2160.60 — autorisation de recommandation', () => {
    it('un homonyme AUTORISÉ pour homonym_conflict traverse la porte', () => {
      const a = row({ full_name: 'Sébastien Chauffray', recommendation_authorized_reason: 'homonym_conflict' })
      const b = row({ full_name: 'Sebastien Chauffray' })
      const res = filterEligibleContacts([a, b], null)
      expect(res.eligible).toEqual([a])
      expect(res.excluded).toEqual([{ contact_id: b.id, reason: 'homonym_conflict' }])
    })

    it('une entité hors périmètre AUTORISÉE pour entity_mismatch traverse la porte', () => {
      const raw = { entities_exhaustive: [{ name: 'Filiale Bruit', relevance: 'noise' }] }
      const authorized = row({ entity: 'Filiale Bruit', recommendation_authorized_reason: 'entity_mismatch' })
      const res = filterEligibleContacts([authorized], raw)
      expect(res.eligible).toEqual([authorized])
      expect(res.excluded).toEqual([])
    })

    it('une autorisation posée pour la MAUVAISE raison ne lève rien', () => {
      const raw = { entities_exhaustive: [{ name: 'Filiale Bruit', relevance: 'noise' }] }
      const mismatched = row({ entity: 'Filiale Bruit', recommendation_authorized_reason: 'homonym_conflict' })
      const res = filterEligibleContacts([mismatched], raw)
      expect(res.eligible).toEqual([])
      expect(res.excluded).toEqual([{ contact_id: mismatched.id, reason: 'entity_mismatch' }])
    })

    it('une autorisation ne lève jamais un ÉCART de permission (excluded_at/hidden)', () => {
      const excluded = row({
        excluded_at: '2026-09-01T00:00:00.000Z',
        recommendation_authorized_reason: 'homonym_conflict',
      })
      const res = filterEligibleContacts([excluded], null)
      expect(res.eligible).toEqual([])
      expect(res.excluded).toEqual([{ contact_id: excluded.id, reason: 'permission_denied' }])
    })

    it('une autorisation ne lève jamais le lifecycle HISTORIQUE (ex-employé)', () => {
      const former = row({ lifecycle_state: 'historique', recommendation_authorized_reason: 'entity_mismatch' })
      const res = filterEligibleContacts([former], null)
      expect(res.eligible).toEqual([])
      expect(res.excluded).toEqual([{ contact_id: former.id, reason: 'former_employee' }])
    })
  })

  describe('#2126.56/.58 (épopée #2787) — une fiche marquée `incorrect_contact`', () => {
    it('est écartée du classement, raison NOMMÉE', () => {
      const flagged = row()
      const res = filterEligibleContacts([flagged], null, new Set([flagged.id]))
      expect(res.eligible).toEqual([])
      expect(res.excluded).toEqual([{ contact_id: flagged.id, reason: 'flagged_incorrect_contact' }])
    })

    it('un appelant qui ne lit pas encore les outcomes garde le comportement d’avant (défaut : ensemble vide)', () => {
      const untouched = row()
      const res = filterEligibleContacts([untouched], null)
      expect(res.eligible).toEqual([untouched])
      expect(res.excluded).toEqual([])
    })

    it('ne fait AUCUNE ligne à un contact qui n’est pas dans l’ensemble flaggé', () => {
      const clean = row({ full_name: 'Claire Martin' })
      const flagged = row({ full_name: 'Bruno Petit' })
      const res = filterEligibleContacts([clean, flagged], null, new Set([flagged.id]))
      expect(res.eligible).toEqual([clean])
      expect(res.excluded).toEqual([{ contact_id: flagged.id, reason: 'flagged_incorrect_contact' }])
    })
  })
})
