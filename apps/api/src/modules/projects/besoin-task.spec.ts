import type { ProjectRow } from '@bellum/contracts'
import { buildBesoinTask } from './besoin-task'
import { DEFAULT_BRAND_NAME } from '@bellum/contracts'

const row = (patch: Partial<ProjectRow>): ProjectRow => ({
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'TF1',
  sector: 'Média',
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Régie publicitaire vieillissante',
  detail: 'La stack adtech est en fin de vie',
  offer: 'Data / Adtech',
  source: 'pain',
  confidence: 'high',
  urgency: 'high',
  stage: 'detected',
  stage_entered_at: '2026-07-21T09:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-21T09:00:00.000Z',
  updated_at: '2026-07-21T09:00:00.000Z',
  ...patch,
})

describe('buildBesoinTask', () => {
  it('compose un sujet « Besoin — <compte> : <label> » et un corps factuel', () => {
    const task = buildBesoinTask(row({}), DEFAULT_BRAND_NAME)

    expect(task.subject).toBe('Besoin — TF1 : Régie publicitaire vieillissante')
    expect(task.body).toContain('La stack adtech est en fin de vie')
    expect(task.body).toContain('Offre ESN pertinente : Data / Adtech')
    expect(task.body).toContain('Source : pain')
    expect(task.body).toContain('Confiance : high')
    expect(task.body).toContain('Détecté le 21/07/2026')
    expect(task.body).toContain(`Détecté par ${DEFAULT_BRAND_NAME}.`)
    // Le nom du compte voyage pour le rattachement CRM best-effort (deal↔company / note parent).
    expect(task.company).toBe('TF1')
    // Un besoin n'a pas de date d'échéance inhérente → aucune date inventée.
    expect(task.dueDate).toBeUndefined()
  })

  it('omet les champs absents plutôt que d’inventer un placeholder', () => {
    const task = buildBesoinTask(
      row({ company_name: null, detail: null, offer: null, source: null, confidence: null }),
      DEFAULT_BRAND_NAME,
    )

    expect(task.subject).toBe('Besoin : Régie publicitaire vieillissante')
    // Compte absent → company null (jamais un placeholder inventé).
    expect(task.company).toBeNull()
    expect(task.body).not.toContain('Offre ESN')
    expect(task.body).not.toContain('Source :')
    expect(task.body).not.toContain('Confiance :')
    // Le label et le pied « Détecté par BellumAI » restent toujours présents.
    expect(task.body).toContain('Régie publicitaire vieillissante')
    expect(task.body).toContain(`Détecté par ${DEFAULT_BRAND_NAME}.`)
  })

  it('borne la longueur du sujet (une ligne)', () => {
    const task = buildBesoinTask(row({ label: 'x'.repeat(400) }), DEFAULT_BRAND_NAME)
    expect(task.subject.length).toBeLessThanOrEqual(250)
  })
})
