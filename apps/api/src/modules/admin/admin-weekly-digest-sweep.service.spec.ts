import { ConflictException } from '@nestjs/common'
import { AdminWeeklyDigestSweepService, isInheritedWeeklyDigest } from './admin-weekly-digest-sweep.service'

/**
 * #balayage-weekly-digest — 15/09/2026. `1785890000000-WeeklyDigestPreference`
 * a ajouté `weekly_digest` en `NOT NULL DEFAULT true`, additive, donc rien
 * réécrit : les lignes déjà là ont reçu `true` du BACKFILL, jamais d'un
 * consentement. Règle du dépôt pour toute écriture de masse : « le compte
 * s'affiche avant d'écrire » — `audit()` compte sans écrire, `sweep()` refuse
 * (409) si ce compte a bougé entre-temps.
 *
 * Le critère (`isInheritedWeeklyDigest`) reconnaît une ligne héritée par DEUX
 * signatures prouvées, jamais devinées :
 *  (A) elle porte `newsletter_last_entry_id` — seul écrivain de cette colonne,
 *      `ChangelogNewsletterService.stampMarker`, dont le `.insert()` omet
 *      `weekly_digest` (deux colonnes seulement) : Postgres l'a rempli par le
 *      DEFAULT de la colonne, jamais un choix (`weekly-digest-insert-default.db.spec.ts`) ;
 *  (B) sa `created_at` précède l'exécution de la migration qui a ajouté la
 *      colonne — elle n'existait nulle part dans l'app à ce moment, donc AUCUN
 *      chemin n'a pu y écrire une valeur.
 * Dans les deux cas, `updated_at === created_at` est EXIGÉ : la ligne n'a
 * jamais été réécrite depuis sa création — pas seulement sur ce champ (un
 * autre champ touché ne prouve rien sur celui-ci, leçon déjà payée dans ce
 * dépôt : `mission-drift.service.ts` sur `updated_at`), donc on ne s'en sert
 * QUE dans le sens sûr : « zéro écriture depuis la création ».
 */

function row(overrides: Partial<Parameters<typeof isInheritedWeeklyDigest>[0]> = {}) {
  const createdAt = overrides.createdAt ?? new Date('2026-08-01T00:00:00.000Z')
  return {
    id: 'row-1',
    userId: 'u1',
    weeklyDigest: true,
    newsletterLastEntryId: null,
    createdAt,
    // Défaut : jamais retouchée depuis sa création — SAUF si le test le
    // surcharge explicitement (le témoin « retouchée » ci-dessous).
    updatedAt: createdAt,
    ...overrides,
  }
}

const COLUMN_ADDED_AT = new Date('2026-08-10T00:00:00.000Z')

describe('isInheritedWeeklyDigest — le critère, en isolation', () => {
  it('(A) reconnaît la signature du semis newsletter : newsletter_last_entry_id posé, jamais retouchée', () => {
    const r = row({ newsletterLastEntryId: 'entry-42', createdAt: new Date('2026-09-01') })
    expect(isInheritedWeeklyDigest(r, COLUMN_ADDED_AT)).toBe(true)
  })

  it('(B) reconnaît une ligne antérieure à la migration qui a ajouté la colonne, jamais retouchée', () => {
    const r = row({ createdAt: new Date('2026-08-01'), newsletterLastEntryId: null })
    expect(isInheritedWeeklyDigest(r, COLUMN_ADDED_AT)).toBe(true)
  })

  it('sait dire NON — témoin légitime voisin : la ligne porte la signature (A) mais a été RETOUCHÉE depuis (updated_at ≠ created_at) — pas attrapée', () => {
    const createdAt = new Date('2026-09-01')
    const r = row({ newsletterLastEntryId: 'entry-42', createdAt, updatedAt: new Date('2026-09-05') })
    expect(isInheritedWeeklyDigest(r, COLUMN_ADDED_AT)).toBe(false)
  })

  it('sait dire NON — un choix RÉEL récent : créée après que la colonne existe, sans signature de semis — pas attrapée', () => {
    const r = row({ createdAt: new Date('2026-09-10'), newsletterLastEntryId: null })
    expect(isInheritedWeeklyDigest(r, COLUMN_ADDED_AT)).toBe(false)
  })

  it('sait dire NON — weekly_digest déjà false : rien à balayer', () => {
    const r = row({ weeklyDigest: false, newsletterLastEntryId: 'entry-42' })
    expect(isInheritedWeeklyDigest(r, COLUMN_ADDED_AT)).toBe(false)
  })

  it('sans date de migration lisible (colonne introuvable dans _migrations), (B) ne s’applique jamais — fail closed', () => {
    const r = row({ createdAt: new Date('2020-01-01'), newsletterLastEntryId: null })
    expect(isInheritedWeeklyDigest(r, null)).toBe(false)
  })
})

type Row = {
  id: string
  user_id: string
  weekly_digest: boolean
  created_at: Date
  updated_at: Date
  newsletter_last_entry_id: string | null
}

function repo(rows: Row[], migrationTimestamp: string | null = String(COLUMN_ADDED_AT.getTime())) {
  const update = jest.fn().mockResolvedValue({ affected: 1 })
  const find = jest.fn().mockResolvedValue(rows.filter(r => r.weekly_digest))
  const manager = {
    query: jest.fn().mockResolvedValue(migrationTimestamp === null ? [] : [{ timestamp: migrationTimestamp }]),
  }
  return { find, update, manager }
}

function makeService(rows: Row[], migrationTimestamp: string | null = String(COLUMN_ADDED_AT.getTime())) {
  const prefs = repo(rows, migrationTimestamp)
  const service = new AdminWeeklyDigestSweepService(prefs as never)
  return { service, prefs }
}

const INHERITED_SEED: Row = {
  id: 'r-seed',
  user_id: 'seed-user',
  weekly_digest: true,
  created_at: new Date('2026-09-01'),
  updated_at: new Date('2026-09-01'),
  newsletter_last_entry_id: 'entry-42',
}

const INHERITED_PREDATES: Row = {
  id: 'r-predates',
  user_id: 'predates-user',
  weekly_digest: true,
  created_at: new Date('2026-08-01'),
  updated_at: new Date('2026-08-01'),
  newsletter_last_entry_id: null,
}

const REAL_CHOICE_RECENT: Row = {
  id: 'r-real',
  user_id: 'real-user',
  weekly_digest: true,
  created_at: new Date('2026-09-12'),
  updated_at: new Date('2026-09-12'),
  newsletter_last_entry_id: null,
}

const ALREADY_OFF: Row = {
  id: 'r-off',
  user_id: 'off-user',
  weekly_digest: false,
  created_at: new Date('2026-08-01'),
  updated_at: new Date('2026-08-01'),
  newsletter_last_entry_id: null,
}

describe('AdminWeeklyDigestSweepService.audit — le compte s’affiche avant d’écrire', () => {
  it('lit un corpus non vide et compte séparément les deux signatures, sans jamais écrire', async () => {
    const { service, prefs } = makeService([INHERITED_SEED, INHERITED_PREDATES, REAL_CHOICE_RECENT, ALREADY_OFF])
    const report = await service.audit()
    expect(report.eligibleCount).toBe(2)
    expect(report.bySeedSignatureCount).toBe(1)
    expect(report.byPredatesColumnCount).toBe(1)
    expect(report.trueCount).toBe(3) // les trois `weekly_digest = true`, éligibles ou non
    expect(prefs.update).not.toHaveBeenCalled()
  })

  it('rend zéro sur un stock qui ne porte que des choix réels ou déjà OFF', async () => {
    const { service } = makeService([REAL_CHOICE_RECENT, ALREADY_OFF])
    const report = await service.audit()
    expect(report.eligibleCount).toBe(0)
  })
})

describe('AdminWeeklyDigestSweepService.sweep — refuse d’écrire si le compte a bougé', () => {
  it('409 si `confirmCount` ne correspond plus au compte actuel', async () => {
    const { service } = makeService([INHERITED_SEED, INHERITED_PREDATES])
    await expect(service.sweep(1)).rejects.toBeInstanceOf(ConflictException)
  })

  it('n’écrit rien quand `confirmCount` a bougé', async () => {
    const { service, prefs } = makeService([INHERITED_SEED])
    await expect(service.sweep(0)).rejects.toBeInstanceOf(ConflictException)
    expect(prefs.update).not.toHaveBeenCalled()
  })

  it('balaie UNIQUEMENT les lignes éligibles : weekly_digest → false, weekly_digest_swept_at posé — jamais les choix réels ni les lignes déjà OFF', async () => {
    const { service, prefs } = makeService([INHERITED_SEED, INHERITED_PREDATES, REAL_CHOICE_RECENT, ALREADY_OFF])
    const report = await service.sweep(2)
    expect(prefs.update).toHaveBeenCalledTimes(2)
    expect(prefs.update).toHaveBeenCalledWith(
      { id: 'r-seed' },
      { weekly_digest: false, weekly_digest_swept_at: expect.any(Date) },
    )
    expect(prefs.update).toHaveBeenCalledWith(
      { id: 'r-predates' },
      { weekly_digest: false, weekly_digest_swept_at: expect.any(Date) },
    )
    expect(report.results.map(r => r.userId).sort()).toEqual(['predates-user', 'seed-user'])
    expect(report.results.every(r => r.outcome === 'balaye')).toBe(true)
  })

  it('rend « échec » avec sa raison quand l’écriture rejette, sans arrêter le reste du lot', async () => {
    const { service, prefs } = makeService([INHERITED_SEED, INHERITED_PREDATES])
    prefs.update.mockRejectedValueOnce(new Error('base injoignable'))
    const report = await service.sweep(2)
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: 'echec', reason: expect.stringContaining('base injoignable') }),
        expect.objectContaining({ outcome: 'balaye' }),
      ]),
    )
  })
})
