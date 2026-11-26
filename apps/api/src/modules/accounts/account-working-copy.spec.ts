import { buildWorkingCopyFields, WORKING_COPY_SUFFIX } from './account-working-copy'

const ARCHIVE = {
  label: 'Archive du dépôt fourni',
  period_from: '2026-09-30',
  period_to: '2026-10-01',
  scope_note: 'périmètre France',
  verified_online: false,
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-archive',
    user_id: 'u-1',
    workspace_id: 'ws-1',
    company_name: 'Groupe BPCE',
    siren: '123456789',
    registry_id: 'R-1',
    registry_country: 'FR',
    status: 'completed',
    commercial_status: 'inbox',
    created_at: new Date('2026-10-01'),
    updated_at: new Date('2026-10-02'),
    signals_refresh_lock_at: new Date('2026-10-02'),
    raw_analysis: { reference_archive: ARCHIVE, program_names: [{ name: 'Programme' }], recent_signals: [] },
    ...overrides,
  }
}

describe('buildWorkingCopyFields — Théo A comptes-fiche-reference.A2', () => {
  it('repart de l’archive : le contenu est repris, la portée figée ne l’est pas', () => {
    const copy = buildWorkingCopyFields(source() as never)
    expect(copy.raw_analysis?.['program_names']).toEqual([{ name: 'Programme' }])
    expect(copy.raw_analysis).not.toHaveProperty('reference_archive')
  })

  it('nomme l’archive d’origine et se distingue d’elle dans les listes', () => {
    const copy = buildWorkingCopyFields(source() as never)
    expect(copy.raw_analysis?.['working_copy_of']).toBe('acc-archive')
    expect(copy.company_name).toBe(`Groupe BPCE${WORKING_COPY_SUFFIX}`)
  })

  it('ne reprend ni l’identité, ni l’horodatage, ni un verrou : un seul compte actif par registre', () => {
    const copy = buildWorkingCopyFields(source() as never) as Record<string, unknown>
    for (const key of ['id', 'created_at', 'updated_at', 'siren', 'registry_id', 'signals_refresh_lock_at']) {
      expect(copy[key] ?? null).toBeNull()
    }
    expect(copy).not.toHaveProperty('id')
  })

  it('reste dans l’espace et chez l’auteur de l’archive, à trier comme un compte neuf', () => {
    const copy = buildWorkingCopyFields(source() as never)
    expect(copy.workspace_id).toBe('ws-1')
    expect(copy.commercial_status).toBe('inbox')
  })
})
