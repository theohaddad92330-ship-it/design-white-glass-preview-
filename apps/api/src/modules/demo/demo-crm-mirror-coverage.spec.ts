import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CRM_MIRROR_ACTIVITY_KINDS, CRM_MIRROR_DEAL_STATUSES } from '@bellum/contracts'
import { DEMO_CRM_DEALS, DEMO_CRM_MIRROR } from './demo-dataset'

// SYNC-A (craft rule n°9) — le miroir CRM est REMPLI en démo, sur le compte réel des affaires déjà semées.
describe('le miroir CRM est rempli en démo (SYNC-A A.6)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('le semis est APPELÉ par celui des affaires (même compte, Société Générale)', () => {
    expect(seed).toMatch(/await this\.seedCrmMirror\(workspaceId, now, accountId\)/)
    for (const table of ['crm_owners', 'crm_pipelines', 'crm_stages', 'crm_deals', 'crm_activities'])
      expect(seed).toContain(`INSERT INTO ${table}`)
  })

  it('chaque affaire semée trouve son étape dans le pipeline semé, et chaque activité son affaire', () => {
    const labels = DEMO_CRM_MIRROR.pipeline.stages.map(stage => stage.label)
    for (const deal of DEMO_CRM_DEALS.deals) expect(labels).toContain(deal.stage_label)
    const dealIds = DEMO_CRM_DEALS.deals.map(deal => deal.deal_id as string)
    for (const activity of DEMO_CRM_MIRROR.activities) expect(dealIds).toContain(activity.deal_id)
  })

  it('les valeurs semées passent les CHECK de la migration', () => {
    for (const activity of DEMO_CRM_MIRROR.activities) expect(CRM_MIRROR_ACTIVITY_KINDS).toContain(activity.kind)
    for (const stage of DEMO_CRM_MIRROR.pipeline.stages) expect(CRM_MIRROR_DEAL_STATUSES).toContain(stage.status)
  })

  it('aucune activité ne porte de corps (doctrine c96)', () => {
    for (const activity of DEMO_CRM_MIRROR.activities) expect(Object.keys(activity)).not.toContain('body')
  })

  // #4604 — la fiche de démonstration MONTRE la provenance par champ : le nom de Société Générale vient du CRM
  // fictif de la salle (`connector`), jamais une correction humaine inventée (c'est le geste du visiteur).
  it('#4604 — la provenance `connector` du nom est semée sur le compte du miroir, jamais une ligne `human`', () => {
    const block = seed.slice(seed.indexOf('private async seedCrmMirror'))
    expect(block).toMatch(/INSERT INTO field_provenance[\s\S]*'company_name', 'connector'/)
    expect(block).not.toMatch(/INSERT INTO field_provenance[^;]*'human'/)
  })

  // #4604.4 — le bloc « Ce que dit ton CRM » montre des champs personnalisés en salle : semés sur les affaires du
  // miroir, en texte ou nombre lisible (jamais un corps de note), et écrits par le semis dans `crm_custom_fields`.
  it('#4604.4 — des champs personnalisés sont semés sur les affaires du miroir, et le semis les écrit', () => {
    const dealIds = DEMO_CRM_DEALS.deals.map(deal => deal.deal_id as string)
    const entries = Object.entries(DEMO_CRM_MIRROR.dealCustomFields)
    expect(entries.length).toBeGreaterThan(0)
    for (const [dealId, fields] of entries) {
      expect(dealIds).toContain(dealId)
      for (const value of Object.values(fields)) {
        expect(['string', 'number']).toContain(typeof value)
        if (typeof value === 'string') expect(value).not.toMatch(/[\r\n]/)
      }
    }
    const block = seed.slice(seed.indexOf('private async seedCrmMirror'))
    expect(block).toMatch(/crm_custom_fields/)
    expect(block).toMatch(/dealCustomFields/)
  })
})
