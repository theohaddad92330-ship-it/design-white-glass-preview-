import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCOPE_GAP_PROVIDERS } from './connector-scope-registry'

/**
 * « Du code juste, testé, que personne n'appelle » : chaque connecteur surveillé DOIT appeler le
 * récepteur au retour du consentement. Sans cet appelant, l'écart se mesure et ne se voit jamais.
 */
const SERVICE_FILE: Record<(typeof SCOPE_GAP_PROVIDERS)[number], string> = {
  hubspot: 'crm/crm.service.ts',
  pipedrive: 'pipedrive/pipedrive.service.ts',
  zoho: 'zoho/zoho.service.ts',
  google: 'google/google.service.ts',
  microsoft: 'microsoft/microsoft.service.ts',
}

describe('SCOPES-I — chaque callback OAuth surveillé déclare ses portées accordées', () => {
  for (const provider of SCOPE_GAP_PROVIDERS) {
    it(`${provider} appelle recordGrant depuis handleCallback`, () => {
      const source = readFileSync(join(__dirname, '..', SERVICE_FILE[provider]), 'utf8')
      const callback = source.slice(source.indexOf('async handleCallback('))
      expect(callback.slice(0, callback.indexOf('\n  }\n'))).toContain(`recordGrant('${provider}'`)
    })
  }
})
