import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STORAGE_DOMAINS } from '@bellum/contracts'
import { DEMO_STORAGE_DOMAIN_COVERAGE } from './demo-coverage'

/**
 * #1939.10 — CE QUE LA SALLE DE DÉMONSTRATION RANGE, DOMAINE PAR DOMAINE.
 *
 * `storage_objects` est classée SEEDÉE au niveau de la TABLE : deux
 * justificatifs et deux pièces d'affaire y portent de vrais octets. La garde de
 * table ne peut donc rien dire d'un TROISIÈME domaine — le message vocal serait
 * « couvert » par des PDF de notes de frais. C'est le motif « la garde de parité
 * démo est aveugle à ce qui se range sous une table déjà classée ».
 *
 * La règle tenue ici : chaque domaine du stockage est soit SEMÉ (et le semis
 * l'écrit vraiment), soit VIDE À DESSEIN avec sa raison (et le semis ne l'écrit
 * pas). Le type (`Record<StorageDomain, …>`) empêche déjà d'oublier un domaine à
 * la compilation ; ce test empêche de mentir sur son état.
 */
const SEED = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
const CONTROLLER = readFileSync(join(__dirname, '..', 'ia-proxy', 'ia-proxy.controller.ts'), 'utf8')

/** Les domaines dont l'état déclaré contredit le semis réel. */
function misclassified(coverage: Readonly<Record<string, { state: string }>>, seedSource: string): string[] {
  return Object.entries(coverage)
    .filter(([domain, { state }]) => {
      const seeded = seedSource.includes(`domain: '${domain}'`)
      return state === 'seede' ? !seeded : seeded
    })
    .map(([domain]) => domain)
}

describe('#1939.10 — la couverture démo des domaines du stockage', () => {
  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(SEED.length).toBeGreaterThan(10_000)
    expect(SEED).toContain('seedStoredFile(')
    expect(STORAGE_DOMAINS.length).toBeGreaterThanOrEqual(3)
  })

  it('classe CHAQUE domaine, et rien d’autre', () => {
    expect(Object.keys(DEMO_STORAGE_DOMAIN_COVERAGE).sort()).toEqual([...STORAGE_DOMAINS].sort())
  })

  it('un domaine SEMÉ l’est vraiment, un domaine VIDE À DESSEIN ne l’est pas', () => {
    expect(misclassified(DEMO_STORAGE_DOMAIN_COVERAGE, SEED)).toEqual([])
  })

  it('SAIT DIRE NON — un état inversé est signalé, dans les deux sens', () => {
    expect(
      misclassified({ expense_receipt: { state: 'vide_a_dessein' }, chat_voice_message: { state: 'seede' } }, SEED),
    ).toEqual(['expense_receipt', 'chat_voice_message'])
  })

  it('le message vocal est VIDE À DESSEIN, avec une raison écrite', () => {
    const voice = DEMO_STORAGE_DOMAIN_COVERAGE.chat_voice_message
    expect(voice.state).toBe('vide_a_dessein')
    expect(voice.reason.trim().length).toBeGreaterThan(80)
    for (const { reason } of Object.values(DEMO_STORAGE_DOMAIN_COVERAGE))
      expect(reason.trim().length).toBeGreaterThan(40)
  })

  it('ce vide est VRAI — la capacité ET la transcription refusent la salle de démonstration', () => {
    const status = CONTROLLER.slice(
      CONTROLLER.indexOf('async voiceStatus('),
      CONTROLLER.indexOf('async transcribeVoiceMessage('),
    )
    const transcribe = CONTROLLER.slice(
      CONTROLLER.indexOf('async transcribeVoiceMessage('),
      CONTROLLER.indexOf('async listenVoiceMessage('),
    )
    expect(status.length).toBeGreaterThan(100)
    expect(transcribe.length).toBeGreaterThan(300)
    expect(status).toContain('isDemoWorkspace(')
    expect(transcribe).toContain('isDemoWorkspace(')
  })
})
