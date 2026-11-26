import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMORY_ITEM_EVENTS, MEMORY_LEDGER_SECTIONS, memoryLedgerSectionOf } from '@bellum/contracts'
import { DEMO_MEMORY_SECTION_COVERAGE, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_MEMORY_FACTS } from './demo-dataset'
import { DEMO_PURGE_TABLES } from './demo-reset.service'

/**
 * #1916 — LA DÉMO REMPLIT CHAQUE SECTION DE LA MÉMOIRE (craft rule n°9).
 *
 * Réglages › Mémoire de Laura se lit désormais par sections (préférences,
 * objectifs, règles de l'ESN, compte, corrections, documents, temporaires). Une
 * salle où une section serait vide montrerait « rien ici » devant un prospect
 * sur la question même que l'écran existe pour régler.
 *
 * La garde ne recopie PAS la règle de section : elle appelle la dérivation du
 * contrat (`memoryLedgerSectionOf`) sur le jeu, exactement comme l'écran.
 */
function sectionOfItem(item: (typeof DEMO_MEMORY_FACTS)[number]) {
  return memoryLedgerSectionOf({
    layer: 'facts',
    kind: item.kind,
    scope: item.scope,
    accountId: item.company ? `account:${item.company}` : null,
    expiresAt: item.expiresInDays === null ? null : new Date(Date.UTC(2026, 0, 1)).toISOString(),
  })
}

describe('#1916 — chaque section de la mémoire se voit en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('lit un corpus non vide', () => {
    expect(DEMO_MEMORY_FACTS.length).toBeGreaterThan(0)
  })

  it('chaque section du contrat est classée — seedée, ou renvoi, avec sa raison', () => {
    expect(Object.keys(DEMO_MEMORY_SECTION_COVERAGE).sort()).toEqual([...MEMORY_LEDGER_SECTIONS].sort())
    for (const entry of Object.values(DEMO_MEMORY_SECTION_COVERAGE)) {
      expect(entry.reason.trim().length).toBeGreaterThan(40)
    }
  })

  it('chaque section « seedée » est produite par au moins un élément du jeu, via la dérivation du contrat', () => {
    for (const section of MEMORY_LEDGER_SECTIONS) {
      if (DEMO_MEMORY_SECTION_COVERAGE[section]?.state !== 'seede') continue
      expect({ section, seeded: DEMO_MEMORY_FACTS.some(item => sectionOfItem(item) === section) }).toEqual({
        section,
        seeded: true,
      })
    }
  })

  it('hors « contexte d’un compte », une section ne tient à AUCUN compte — le semis saute proprement un compte introuvable', () => {
    for (const section of MEMORY_LEDGER_SECTIONS) {
      if (DEMO_MEMORY_SECTION_COVERAGE[section]?.state !== 'seede' || section === 'accountContext') continue
      expect({
        section,
        withoutAccount: DEMO_MEMORY_FACTS.some(item => sectionOfItem(item) === section && item.company === null),
      }).toEqual({ section, withoutAccount: true })
    }
    const onAccount = DEMO_MEMORY_FACTS.filter(item => sectionOfItem(item) === 'accountContext')
    const companies = new Set(DEMO_DOSSIERS.map(dossier => dossier.account.company_name))
    expect(onAccount.some(item => item.company !== null && companies.has(item.company))).toBe(true)
  })

  it('« Documents de référence » renvoie vers la base de connaissance, qui est SEMÉE dans la salle', () => {
    expect(DEMO_MEMORY_SECTION_COVERAGE.referenceDocuments.state).toBe('renvoi')
    expect(DEMO_SEEDED_TABLES).toContain('rag_documents')
  })

  it('#1916.24 — un élément ÉCHU est semé : la salle montre « non utilisé par Laura aujourd’hui », à côté d’éléments en service', () => {
    expect(DEMO_MEMORY_FACTS.some(item => item.expiresInDays !== null && item.expiresInDays < 0)).toBe(true)
    expect(DEMO_MEMORY_FACTS.some(item => item.expiresInDays !== null && item.expiresInDays > 0)).toBe(true)
    for (const item of DEMO_MEMORY_FACTS) {
      // Un élément échu l'est APRÈS sa création — sinon la salle raconte un geste impossible.
      if (item.expiresInDays !== null) expect(item.expiresInDays).toBeGreaterThan(-item.daysAgo)
    }
  })

  it('#1916.23 — un historique est semé, ses gestes sont ceux du contrat, et le semis l’écrit (purgé au reset)', () => {
    const withHistory = DEMO_MEMORY_FACTS.filter(item => (item.history ?? []).length > 0)
    expect(withHistory.length).toBeGreaterThan(0)
    for (const item of withHistory) {
      expect(item.company).toBeNull()
      for (const step of item.history ?? []) {
        expect(MEMORY_ITEM_EVENTS).toContain(step.event)
        // Un geste a lieu après la création de l'élément.
        expect(step.daysAgo).toBeLessThan(item.daysAgo)
      }
    }
    expect(seedSource).toContain('INSERT INTO memory_fact_events')
    expect(DEMO_SEEDED_TABLES).toContain('memory_fact_events')
    expect(DEMO_PURGE_TABLES).toContain('memory_fact_events')
  })

  it('Q1 — une note de Laura CONFIRMÉE et une note « à vérifier » sont semées, et le semis écrit la confirmation', () => {
    const notes = DEMO_MEMORY_FACTS.filter(item => item.origin === 'copilot')
    const confirmed = notes.filter(item => item.confirmedDaysAgo !== undefined)
    expect(confirmed.length).toBeGreaterThan(0)
    expect(notes.some(item => item.confirmedDaysAgo === undefined)).toBe(true)
    for (const item of confirmed) {
      // Sans compte : le semis ne peut pas la sauter. Et la confirmation EST une
      // réécriture du texte — l'historique semé le raconte, au même jour.
      expect(item.company).toBeNull()
      expect(
        (item.history ?? []).some(step => step.event === 'text_changed' && step.daysAgo === item.confirmedDaysAgo),
      ).toBe(true)
    }
    expect(seedSource).toContain('confirmed_at')
    expect(seedSource).toContain('item.confirmedDaysAgo')
  })
})
