import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as dataset from './demo-dataset'

/**
 * Recette prod 05/10 — CGI et Groupe INTM apparaissaient dans /accounts comme
 * deux COMPTES quasi vides (cellules « - »). Décision Louis : une ESN partenaire
 * n'est PAS un compte prospect, on n'affiche pas un compte vide.
 *
 * - CGI : `account_partners` (BNP Paribas) porte le partenaire ; la ligne
 *   `accounts` n'existait que pour le badge « partenaire déclaré ». Plus de ligne.
 * - Groupe INTM : `consultants.partner_account_id` référence `accounts(id)` (FK) :
 *   la ligne reste, mais en statut `deleted` — le mécanisme existant que la
 *   liste, les compteurs et Découvrir excluent (`DELETED_ACCOUNT_STATUS`).
 */
const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
const accountsService = readFileSync(join(__dirname, '..', 'accounts', 'accounts.service.ts'), 'utf8')

describe('démo — une ESN partenaire n’est pas un compte de la liste', () => {
  it('CGI n’a plus de ligne accounts : ni constante, ni semis de compte', () => {
    expect(Object.keys(dataset)).not.toContain('DEMO_DECLARED_PARTNER_ACCOUNT')
    expect(seed).not.toContain('seedDeclaredPartnerAccount')
  })

  it('le partenaire déclaré reste porté par account_partners (la fonction partenaire est intacte)', () => {
    expect(dataset.DEMO_SPRINT_PARTNER_ROUTE_PARTNER.name).toBe('CGI')
    expect(dataset.DEMO_SPRINT_PARTNER_ROUTE_PARTNER.relationship).toBe('partner')
  })

  it('Groupe INTM n’est qu’une ancre de clé étrangère : statut `deleted`, exclu de /accounts', () => {
    expect(accountsService).toMatch(/const DELETED_ACCOUNT_STATUS = 'deleted'/)
    // I31 : l'ancre naît dans `ensurePartnerAnchor`, partagée par le vivier et le sourcing externe.
    expect(seed).toMatch(/company_name: companyName,\s*status: 'deleted'/)
    expect(seed).toMatch(/ensurePartnerAnchor\(workspaceId, ownerUserId, DEMO_EXTERNAL_SOURCING_PARTNER_NAME\)/)
    // Sait dire NON : plus aucun `completed` posé sur l'ESN partenaire.
    expect(seed).not.toMatch(/company_name: companyName,\s*status: 'completed'/)
  })

  it('le banc partenaire garde son ancre (partner_account_id) — la sonde de complétude reste satisfaite', () => {
    expect(seed).toMatch(/partner_account_id: persona\.sourceKind === 'partner_bench' \? partnerAccount\.id : null/)
  })

  // #3294 — le semis « comptes ouverts non étendus » avait posé cinq ESN en comptes ouverts quasi vides.
  it('sait dire NON : aucune ESN connue n’est un compte ouvert semé (#3294)', () => {
    const esn = /\b(Inetum|Aubay|Talan|SII|Devoteam|CGI|Capgemini|Sopra Steria|Groupe INTM)\b/
    for (const account of dataset.DEMO_EXTENSION_ACCOUNTS) expect(account.company_name).not.toMatch(esn)
    for (const dossier of dataset.DEMO_DOSSIERS) {
      if (['watching', 'opportunity'].includes(dossier.account.commercial_status)) {
        expect(dossier.account.company_name).not.toMatch(esn)
      }
    }
  })

  // #2972 — Anthony Vasseur pointe l'ancre qui EXISTE, pas CGI.
  it('le consultant en sous-traitance pointe l’ancre Groupe INTM, dont la ligne est semée (#2972)', () => {
    const subcontractors = dataset.DEMO_CONSULTANTS.filter(c => c.partner_account)
    expect(subcontractors.length).toBeGreaterThan(0)
    for (const consultant of subcontractors) {
      expect(consultant.partner_account).toBe(dataset.DEMO_EXTERNAL_SOURCING_PARTNER_NAME)
    }
    expect(seed).toMatch(/a\.company_name = \$3/)
  })
})
