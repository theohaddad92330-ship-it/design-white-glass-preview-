import { CRM_LINKED_ACCOUNT_PREDICATE, IMPORTED_ACCOUNT_PREDICATE } from './account-crm-linked'

/**
 * #4526.2 — « Mon CRM » : le prédicat qui isole la base client déjà connue du commercial.
 * Calculé à la LECTURE : aucune écriture de `origin` (garde `account.entity.ts`, « une origine rétroactive
 * inventerait l'histoire »).
 */
describe('#4526.2 — CRM_LINKED_ACCOUNT_PREDICATE', () => {
  // #4597.2 — RENVERSEMENT assumé de #4526.4 (« sources crm + import ») : un fichier importé n'est pas un CRM.
  it("ne compte QUE le CRM : l'origine `import` et la source `import` en sortent (#4597.2)", () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/account\.origin\s*=\s*'crm'/)
    expect(CRM_LINKED_ACCOUNT_PREDICATE).not.toContain("'import'")
  })

  it("inclut un compte sans origine qui porte une affaire ou une activité CRM, bornées à l'espace", () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/account\.origin IS NULL/)
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(
      /FROM crm_deals \w+ WHERE \w+\.account_id = account\.id AND \w+\.workspace_id = account\.workspace_id/,
    )
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(
      /FROM crm_activities \w+ WHERE \w+\.account_id = account\.id AND \w+\.workspace_id = account\.workspace_id/,
    )
  })

  it("inclut un compte sans origine dont un contact vient du CRM (id d'enregistrement ou source)", () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/FROM contacts \w+ WHERE \w+\.account_id = account\.id/)
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/crm_record_id IS NOT NULL/)
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/source = 'crm'/)
  })

  it('EXCLUT origin=discover (le lien CRM ne vaut que pour origin NULL) et reste sans valeur littérale injectée', () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).not.toContain('discover')
    // le lien par EXISTS est sous la branche `origin IS NULL`, jamais en OR nu
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(/OR \(account\.origin IS NULL AND \(/)
  })
})

describe('#4597.1 — IMPORTED_ACCOUNT_PREDICATE : « Importés »', () => {
  it("couvre l'origine `import`, et — sans origine — un compte qui porte un contact importé", () => {
    expect(IMPORTED_ACCOUNT_PREDICATE).toMatch(/account\.origin\s*=\s*'import'/)
    expect(IMPORTED_ACCOUNT_PREDICATE).toMatch(/account\.origin IS NULL/)
    expect(IMPORTED_ACCOUNT_PREDICATE).toContain('account.import_job_id IS NOT NULL')
    expect(IMPORTED_ACCOUNT_PREDICATE).toMatch(
      /FROM contacts \w+ WHERE \w+\.account_id = account\.id AND \(\w+\.source = 'import'\)/,
    )
  })

  it('ne ramasse ni le CRM ni la découverte', () => {
    expect(IMPORTED_ACCOUNT_PREDICATE).not.toContain('crm_deals')
    expect(IMPORTED_ACCOUNT_PREDICATE).not.toContain("'crm'")
    expect(IMPORTED_ACCOUNT_PREDICATE).not.toContain('discover')
  })
})

// #4526.1 — l'origine CRM est une facette distincte du statut d'analyse : un compte sans origine que la synchro d'un
// connecteur a rattaché (`sync_links`) est « Mon CRM » ; le lien posé par un FICHIER (`csv`) ne l'est jamais.
describe("#4526.1 — « Mon CRM » ne retient que ce qu'un connecteur prouve", () => {
  it('un lien de synchro de compte, hors fichier, prouve le connecteur (origine inconnue)', () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).toMatch(
      /FROM sync_links \w+ WHERE \w+\.workspace_id = account\.workspace_id AND \w+\.entity_type = 'account' AND \w+\.internal_id = account\.id AND \w+\.provider <> 'csv'/,
    )
  })

  it('sait dire NON : « Importé par fichier » et « Mon CRM » ne partagent aucune preuve', () => {
    expect(CRM_LINKED_ACCOUNT_PREDICATE).not.toEqual(IMPORTED_ACCOUNT_PREDICATE)
    expect(IMPORTED_ACCOUNT_PREDICATE).not.toContain('sync_links')
    expect(CRM_LINKED_ACCOUNT_PREDICATE).not.toContain('import_job_id')
    expect(CRM_LINKED_ACCOUNT_PREDICATE).not.toContain("'import'")
  })
})
