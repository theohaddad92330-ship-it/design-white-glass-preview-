import type { OpenNeedRow } from '@bellum/contracts'
import { needRowsToCsv, needRowsToJson, orderLikeSelection } from './need-export'

function row(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Dév Java senior',
    urgency: 'high',
    skills: [
      { term: 'Java', required: true },
      { term: 'Kafka', required: false },
    ],
    seniority: 'senior',
    headcount: 2,
    target_tjm_cents: 65000,
    start_on: '2026-11-02',
    duration_months: 6,
    location: 'Lyon',
    contract_kind: 'regie',
    deadline_at: '2026-10-20',
    status: 'qualified',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: null,
    project_label: null,
    project_stage: null,
    account_id: '22222222-2222-4222-8222-222222222222',
    account_name: 'Acme; SA',
    entity_id: null,
    entity_name: null,
    ...over,
  } as OpenNeedRow
}

describe('#4016 L11 — le fichier d’export des besoins', () => {
  it('CSV : point-virgule, BOM, tout cité — une raison sociale à point-virgule ne casse pas la ligne', () => {
    const csv = needRowsToCsv([row()])
    expect(csv.startsWith('﻿')).toBe(true)
    const [header, line] = csv.slice(1).trim().split('\r\n')
    expect(header).toContain('"Besoin";"Compte"')
    expect(line).toContain('"Dév Java senior";"Acme; SA"')
    // Compétences : obligatoires et souhaitées, dites comme telles.
    expect(line).toContain('"Java, Kafka (souhaitée)"')
    // Le TJM en euros, pas en centimes.
    expect(line).toContain('"650"')
  })

  it('CSV : une valeur absente reste une cellule VIDE, jamais « 0 »', () => {
    const csv = needRowsToCsv([row({ target_tjm_cents: null, duration_months: null, urgency: null, location: null })])
    const line = csv.slice(1).trim().split('\r\n')[1] ?? ''
    expect(line).not.toMatch(/"0"/)
    expect(line).toMatch(/;;/)
  })

  it('JSON : les champs nommés, les absences en `null`, jamais un 0 inventé', () => {
    const parsed = JSON.parse(needRowsToJson([row({ target_tjm_cents: null })], new Date('2026-10-11T10:00:00Z')))
    expect(parsed.exported_at).toBe('2026-10-11T10:00:00.000Z')
    expect(parsed.count).toBe(1)
    expect(parsed.needs[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Dév Java senior',
      account_name: 'Acme; SA',
      target_tjm_eur: null,
      skills: [
        { term: 'Java', required: true },
        { term: 'Kafka', required: false },
      ],
    })
  })

  it('rend les lignes dans l’ordre de la SÉLECTION, et tait celles que l’espace ne voit pas', () => {
    const a = row({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: 'A' })
    const b = row({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', title: 'B' })
    const ordered = orderLikeSelection([a, b], [b.id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', a.id])
    expect(ordered.map(r => r.title)).toEqual(['B', 'A'])
  })
})

describe('Théo C projects-besoins — export pour un partenaire (sans tarif ni porteur)', () => {
  it('CSV partenaire : aucune colonne de tarif, aucune valeur de tarif', () => {
    const csv = needRowsToCsv([row()], 'partner')
    expect(csv).not.toContain('TJM')
    expect(csv).not.toContain('650')
    expect(csv).toContain('Dév Java senior')
  })
  it('CSV équipe (défaut) : le tarif cible reste', () => {
    expect(needRowsToCsv([row()])).toContain('TJM cible')
  })
  it('JSON partenaire : pas de target_tjm_eur', () => {
    const parsed = JSON.parse(needRowsToJson([row()], new Date(), 'partner')) as { needs: Record<string, unknown>[] }
    expect(parsed.needs[0]).not.toHaveProperty('target_tjm_eur')
    expect(parsed.needs[0]).not.toHaveProperty('owner_id')
  })
})

describe('#4295.14 — les en-têtes du CSV des besoins suivent la langue de l’interface', () => {
  const headerOf = (csv: string) => csv.slice(1).trim().split('\r\n')[0] ?? ''
  it('FR par défaut, EN sur demande — même nombre de colonnes dans les deux langues', () => {
    const fr = headerOf(needRowsToCsv([row()]))
    const en = headerOf(needRowsToCsv([row()], 'team', 'en'))
    expect(fr).toContain('"Compétences"')
    expect(en).toContain('"Skills"')
    expect(en).toContain('"Target daily rate (€)"')
    expect(en).not.toContain('Compétences')
    expect(en.split(';')).toHaveLength(fr.split(';').length)
  })
  it('EN partenaire : toujours aucune colonne de tarif', () => {
    expect(needRowsToCsv([row()], 'partner', 'en')).not.toContain('rate')
  })
  it('la mention « souhaitée » suit la langue', () => {
    expect(needRowsToCsv([row()], 'team', 'en')).toContain('Kafka (nice to have)')
    expect(needRowsToCsv([row()])).toContain('Kafka (souhaitée)')
  })
})
