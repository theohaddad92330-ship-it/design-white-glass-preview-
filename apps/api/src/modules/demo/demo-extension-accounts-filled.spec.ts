import { readFileSync } from 'fs'
import { join } from 'path'
import { DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'

/**
 * D13 (Louis 06/10/2026) — les cinq comptes d'extension (#3294) apparaissaient dans /accounts quasi vides : score et
 * accessibilité « - », alors que « Dernière analyse » disait aujourd'hui. On les REMPLIT (jamais on ne les retire) :
 * faits PUBLICS et durables, score au palier 5 « non arbitré » (D10), et le MÊME chemin d'écriture que les dossiers
 * des briefs (`seedDossier`) — pas un second INSERT.
 *
 * Ce qui reste interdit : un effectif, un chiffre d'affaires, un SIREN, un montant, un signal daté.
 *
 * LOUIS 12/10/2026 — RETRAIT ASSUMÉ (craft rule n°9) : plus aucun compte d'extension à un siège sans nom (« ça n'arrive
 * jamais dans la vraie vie »). Il ne reste qu'Orange, riche. L'exemple #3682 « compte sans nouveauté » (un fait de 2024
 * archivé) qui reposait sur un compte mince est retiré avec lui : l'état « Contexte historique » reste porté par le
 * signal archivé de Société Générale (`DEMO_SG_SIGNALS`).
 */
/** 15/10/2026 — les comptes d'extension alimentés par un dossier de compte de Théo (`dossierAccountFacts`). */
const ACCOUNT_DOSSIERS_15_10 = ['Crédit Agricole', 'VINCI', 'Enedis', 'Safran']

describe('#3682 — plus de compte d’extension porteur de l’exemple « sans nouveauté »', () => {
  it('aucun compte d’extension ne porte de fait archivé inventé', () => {
    // 13/10/2026 (parité Orange / BPCE) — EXEMPTION NOMMÉE : Orange porte des faits PUBLICS anciens et réels (plan
    // « Lead the Future » 2023-2025, cloud de confiance de 2024…), classés `archive` à bon droit. Aucun fait inventé.
    for (const account of DEMO_EXTENSION_ACCOUNTS.filter(candidate => candidate.company_name !== 'Orange'))
      for (const signal of account.recent_signals) expect(signal.freshness).not.toBe('archive')
  })
})

describe('D13 — les comptes d’extension sont des fiches remplies de faits publics', () => {
  it('chaque compte porte le palier 5 marqué « non arbitré » (D10)', () => {
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      expect(account.priority_score).toBe(5)
      expect(account.raw_analysis['score_unarbitrated']).toBe(true)
      expect(account.raw_analysis['demo_seed']).toBe(true)
    }
  })

  it('chaque compte nomme ses activités / périmètres publics (filiales ou divisions) et une lecture de compte', () => {
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      // #3895 — SEULE exception, nommée : une entité sœur d'un groupe de la salle (`filiale`) est elle-même un
      // périmètre du groupe ; lui en inventer sous elle serait une donnée fictive de plus.
      if (account.group_role !== 'filiale') expect(account.subsidiaries.length).toBeGreaterThanOrEqual(2)
      expect(account.priority_justification.length).toBeGreaterThan(80)
      expect(account.priority_justification).toContain(account.company_name)
    }
  })

  it('sait dire NON : aucun effectif, chiffre d’affaires, SIREN, NAF ni signal daté inventé', () => {
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      expect(account.employees).toBe('')
      expect(account.revenue).toBe('')
      expect(account.siren).toBeNull()
      expect(account.naf_code).toBeNull()
      // #3682 — seule exception : l'exemple « sans nouveauté » (un fait ANCIEN, archive, source de la salle).
      // 12/10/2026 — Orange : les projets de son dossier de compte, jamais une date inventée (`undated`).
      // 13/10/2026 — Orange (parité BPCE) : les projets du dossier restent `undated` ; les offres d'emploi sont `current`
      // (datées au semis, relativement à l'ouverture) et les plans publics datés `archive`/`current`. Jamais de fait inventé.
      // 15/10/2026 — Crédit Agricole, VINCI, Enedis, Safran : les projets et signaux de leur dossier de compte, datés comme
      // le dossier les date (sinon `undated`), jamais une date inventée.
      const dossier = account.company_name === 'Orange' || ACCOUNT_DOSSIERS_15_10.includes(account.company_name)
      for (const signal of account.recent_signals)
        expect(dossier ? ['undated', 'current', 'archive'] : ['archive']).toContain(signal.freshness)
      if (account.company_name === 'Orange') {
        expect(account.recent_signals.filter(signal => signal.freshness === 'undated')).toHaveLength(7)
        // Les besoins d'Orange sont des HYPOTHÈSES commerciales explicitement dites sans budget confirmé.
        expect(account.it_challenges.length).toBeGreaterThan(0)
      } else {
        expect(account.it_challenges).toEqual([])
      }
      expect(JSON.stringify(account.priority_justification)).not.toMatch(
        /\d[\d\s.,]*\s?(M€|Md€|milliards?|millions?|salariés)/i,
      )
    }
  })

  it('sait dire NON : aucun compte d’extension à un seul contact ni à siège sans nom (Louis 12/10/2026)', () => {
    // 15/10/2026 — les quatre dossiers de compte de Théo rejoignent Orange : tous RICHES (des dizaines de contacts nommés).
    expect(DEMO_EXTENSION_ACCOUNTS.map(account => account.company_name)).toEqual(['Orange', ...ACCOUNT_DOSSIERS_15_10])
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      expect(account.contacts.length).toBeGreaterThan(1)
      for (const contact of account.contacts) expect(contact.full_name).not.toBe(contact.title)
    }
  })

  it('chaque compte porte UNE action à venir : « À programmer » ne contredit plus « Dernière analyse »', () => {
    for (const account of DEMO_EXTENSION_ACCOUNTS) {
      expect(account.nextAction.title).toContain(account.company_name)
      expect(account.nextAction.dueInDays).toBeGreaterThan(0)
      expect(account.nextAction.objective.length).toBeGreaterThan(10)
      expect(account.nextAction.expectedResult.length).toBeGreaterThan(10)
    }
  })

  it('le semis passe par `seedDossier` (le chemin des briefs), pas par un second INSERT', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const start = seed.indexOf('private async seedExtensionAccounts(')
    const body = seed.slice(start, seed.indexOf('\n  }\n', start))
    expect(body).toContain('this.seedDossier(')
    expect(body).not.toContain('INSERT INTO accounts')
  })
})
