import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toolLatencyKnownSchema } from '@bellum/contracts'
import { TOOL_CATALOG } from './tool-catalog'

/**
 * #2261.13 (décision Louis 21/09/2026, QCM) — « remplir depuis la
 * DOCUMENTATION PUBLIQUE de chaque outil, laisser explicitement NON VÉRIFIÉ
 * ce qu'elle ne dit pas » (même méthode que le connecteur Odoo, #2565.10/D4).
 *
 * Un contrat d'API non vérifiable ne se devine pas (doctrine) : toute latence
 * `source: 'declared'` posée dans ce catalogue DOIT porter, à côté de la
 * valeur, l'URL de la doc publique lue et une date — jamais un texte qui a
 * l'air d'une déclaration mais qu'on aurait inventé. Ce test ROUGIT si un
 * futur connecteur ajoute une entrée `declared` sans ces deux preuves à
 * proximité immédiate dans le SOURCE du fichier (pas seulement dans un
 * commentaire lointain qu'un rebase pourrait décrocher de la valeur).
 */
describe('#2261.13 (21/09) — toute latence DÉCLARÉE cite sa source et sa date', () => {
  const source = readFileSync(join(__dirname, 'tool-catalog.ts'), 'utf8')
  const URL_RE = /https?:\/\/\S+/
  const DATE_RE = /\d{2}\/\d{2}\/2026|\d{4}-\d{2}-\d{2}/

  it('trouve au moins une déclaration (HubSpot, à ce jour) — le test ne doit pas passer par vide', () => {
    const declaredBlocks = [...source.matchAll(/source:\s*'declared'\s*as\s*const/g)]
    expect(declaredBlocks.length).toBeGreaterThan(0)
  })

  it('rougit si un bloc `declared` du catalogue n’a ni URL de doc publique ni date à proximité', () => {
    const declaredBlocks = [...source.matchAll(/source:\s*'declared'\s*as\s*const/g)]
    for (const match of declaredBlocks) {
      const start = Math.max(0, (match.index ?? 0) - 2000)
      const window = source.slice(start, match.index)
      expect(window).toMatch(URL_RE)
      expect(window).toMatch(DATE_RE)
    }
  })

  it('HUBSPOT_LATENCY_DECLARED (catalogue) parse le contrat `toolLatencyKnownSchema`, jamais `window_days`/`sample_count` (réservés à une mesure)', () => {
    const hubspot = TOOL_CATALOG.find(entry => entry.provider === 'hubspot')
    expect(hubspot?.latency).toBeDefined()
    const parsed = toolLatencyKnownSchema.safeParse(hubspot?.latency)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.source).toBe('declared')
    expect(parsed.data.value.fr.length).toBeGreaterThan(0)
    expect(parsed.data.value.en.length).toBeGreaterThan(0)
    expect(parsed.data.as_of.length).toBeGreaterThan(0)
    expect(parsed.data.window_days).toBeUndefined()
    expect(parsed.data.sample_count).toBeUndefined()
  })

  it('les six autres outils branchables (#2261.8/.13/.16) restent sans `latency` déclarée — doc publique muette ou inaccessible le 21/09', () => {
    const stillUndeclared = ['salesforce', 'gmail', 'google-calendar', 'google-drive', 'notion', 'microsoft']
    for (const provider of stillUndeclared) {
      const entry = TOOL_CATALOG.find(e => e.provider === provider)
      expect(entry?.latency).toBeUndefined()
    }
  })
})
