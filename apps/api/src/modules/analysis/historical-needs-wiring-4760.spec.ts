import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #4760 — garde de câblage : `readSignalLayers` est testé seul (accounts.service.spec), donc
// retirer son appelant ne cassait aucun test — la promesse « l'analyse intègre son historique »
// s'est perdue deux fois (#4070, #4307). Ces tests échouent si le lecteur n'a plus d'appelant.
const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8')

describe('#4760 — le lecteur de signal_layers a un appelant', () => {
  it("le worker d'analyse lit les besoins historiques après chaque run", () => {
    const worker = read('analysis.worker.ts')
    expect(read('research-followups.ts')).toContain('deps.persistence.readSignalLayers(')
    expect(worker).toMatch(/void this\.recordHistoricalNeeds\(accountId\)/)
  })

  it('la persistance délègue au lecteur du module accounts', () => {
    expect(read('analysis.persistence.ts')).toContain('this.accounts.readSignalLayers(')
  })

  it('le worker ÉCRIT les besoins historiques dans le dossier (pas seulement au journal)', () => {
    expect(read('research-followups.ts')).toContain('deps.persistence.saveHistoricalNeeds(')
    expect(read('analysis.persistence.ts')).toContain("jsonb_build_object('historical_needs', $1::jsonb)")
  })
})

// Lot 762 P4 — l'ACTUALISATION fait la même chose que l'analyse : sans ces appels, `historical_needs` reste périmé.
describe('lot 762 P4 — l’actualisation réécrit les besoins historiques (parité avec l’analyse)', () => {
  it('runResearch appelle le chemin partagé, après la persistance', () => {
    const svc = read('analysis-ondemand.service.ts')
    expect(svc).toContain('recordHistoricalNeedsFor(')
    expect(svc).toContain('recordNeedProposalsFor(')
    expect(svc).toContain('guardResearchForPersistence(')
    expect(svc.indexOf('this.accounts.refreshResearch(')).toBeLessThan(svc.indexOf('recordHistoricalNeedsFor('))
  })
})

// Lot 762 P5 — le rattachement des deals CRM est rejoué à l'analyse ET à l'actualisation.
describe('lot 762 P5 — le rattachement deal → compte est rejoué par les deux chemins', () => {
  it('worker (analyse) et runResearch (actualisation) appellent linkCrmDealsFor', () => {
    expect(read('analysis.worker.ts')).toContain('linkCrmDealsFor(')
    expect(read('analysis-ondemand.service.ts')).toContain('linkCrmDealsFor(')
  })
})
