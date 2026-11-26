import { crmSyncDisabled, maxContactsPerWorkspace, overwriteRemoteValues } from './crm-sync.config'

const OLD_ENV = process.env

describe('crm-sync config — des défauts qui ne coupent pas la boucle par accident', () => {
  beforeEach(() => {
    process.env = { ...OLD_ENV }
    delete process.env['CRM_SYNC_MAX_CONTACTS']
    delete process.env['CRM_SYNC_DISABLED']
    delete process.env['CRM_SYNC_OVERWRITE']
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('sans variable, la borne vaut son défaut — PAS zéro', () => {
    // Le bug attrapé en écrivant les tests du service : `Number('')` vaut 0 et
    // non NaN, donc lire la variable sans tester d'abord sa présence mettait la
    // borne à zéro et désactivait silencieusement toute la synchronisation.
    // Une boucle qui ne tourne pas sans que rien ne le dise est le pire mode de
    // défaillance possible pour une tâche de fond.
    expect(maxContactsPerWorkspace()).toBe(200)
    process.env['CRM_SYNC_MAX_CONTACTS'] = '   '
    expect(maxContactsPerWorkspace()).toBe(200)
  })

  it('un zéro DÉLIBÉRÉ coupe bien', () => {
    // La distinction compte : « absent » veut dire « je n'ai pas d'avis », et
    // « 0 » veut dire « je veux couper ». Les confondre retire à l'opérateur
    // l'un des deux gestes.
    process.env['CRM_SYNC_MAX_CONTACTS'] = '0'
    expect(maxContactsPerWorkspace()).toBe(0)
  })

  it('une valeur illisible retombe sur le défaut', () => {
    process.env['CRM_SYNC_MAX_CONTACTS'] = 'beaucoup'
    expect(maxContactsPerWorkspace()).toBe(200)
    process.env['CRM_SYNC_MAX_CONTACTS'] = '-5'
    expect(maxContactsPerWorkspace()).toBe(200)
  })

  it('la boucle est active par défaut, et l’écrasement ne l’est pas', () => {
    // L'asymétrie est le cœur du réglage : synchroniser est sûr, écraser la
    // donnée d'un client ne l'est pas.
    expect(crmSyncDisabled()).toBe(false)
    expect(overwriteRemoteValues()).toBe(false)
  })

  it('les deux interrupteurs n’acceptent que « true »', () => {
    for (const value of ['1', 'oui', 'TRUE ', 'yes']) {
      process.env['CRM_SYNC_DISABLED'] = value
      expect(crmSyncDisabled()).toBe(value.trim().toLowerCase() === 'true')
    }
  })
})
