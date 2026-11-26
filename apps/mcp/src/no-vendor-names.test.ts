import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Aucun nom d'éditeur dans les descriptions d'outils MCP.
 *
 * Le serveur MCP est une SURFACE CLIENT : ces descriptions sont lues par
 * l'assistant IA d'un commercial, et récitées dans ses réponses. La règle du
 * 02/08 y vaut donc autant qu'à l'écran — l'application nomme la CAPACITÉ
 * (« ton CRM »), seul Réglages › Intégrations nomme l'outil.
 *
 * Elle était enfreinte : `log_to_crm` annonçait « le CRM connecté (HubSpot) »
 * alors que l'espace peut avoir branché n'importe lequel des quatre. Les trois
 * gardes existantes ne balayaient que les fichiers i18n du web et le prompt du
 * copilote — cette surface-ci n'était couverte par aucune.
 */
const VENDORS =
  /\b(hubspot|salesforce|pipedrive|attio|gmail|outlook|microsoft 365|apollo|dropcontact|salesql|hunter|lusha|kaspr|fullenrich|aircall|ringover|yousign|docusign|qonto|tiime|boondmanager)\b/i

describe('les descriptions d’outils MCP nomment la capacité, jamais l’éditeur', () => {
  it('aucun nom de fournisseur dans tools.ts', () => {
    const source = readFileSync(join(__dirname, 'tools.ts'), 'utf8')
    const offenders = source
      .split('\n')
      .map((line, index) => ({ line: index + 1, text: line }))
      .filter(entry => VENDORS.test(entry.text))
      .map(entry => `${entry.line}: ${entry.text.trim().slice(0, 80)}`)
    expect(offenders).toEqual([])
  })
})
