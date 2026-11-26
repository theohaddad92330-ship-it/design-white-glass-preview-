import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORG_REBUILD_JOB_OPTIONS } from '../modules/analysis/org-rebuild.queue'

/**
 * GA-211 — reprendre une reconstruction d'organigramme ne veut JAMAIS dire la
 * rejouer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE NOMMÉ (mission du planificateur d'enrichissement, §11 FINAL)
 * ─────────────────────────────────────────────────────────────────────────────
 * `org-rebuild.queue.ts` pose délibérément `attempts: 1` sur la reconstruction
 * du graphe : « JAMAIS de retry : chaque tentative relance un fan-out LLM
 * complet ». Le planificateur d'enrichissement (`org-enrichment-planner
 * .service.ts`, `confirmWave`) construit SA notion de reprise sur ce même
 * principe, mais AUTREMENT : relancer le même mode ne retente jamais une vague
 * déjà tentée — il recalcule la sélection, qui exclut par construction tout
 * contact déjà classé (`family IS NULL` est le seul filtre d'entrée de
 * `selectEnrichmentCandidates`). Cette garde protège le choix ORIGINAL,
 * `attempts: 1` sur la file voisine, dont ce chantier s'est explicitement
 * engagé à ne PAS le défaire — la reprise du planificateur s'ajoute À CÔTÉ,
 * elle ne le remplace pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `ORG_REBUILD_JOB_OPTIONS.attempts` vaut RÉELLEMENT `1` — importé depuis
 *     le vrai fichier, jamais recopié ;
 *  2. le commentaire qui explique CE choix (« fan-out LLM complet ») est
 *     toujours présent dans le fichier source — sans lui, un futur lecteur qui
 *     verrait `attempts: 1` sans raison pourrait le « corriger » en `attempts: 3`
 *     en toute bonne foi ;
 *  3. `enrichOrganigramWave` (le chemin que `confirmWave` appelle pour lancer
 *     UNE vague) ne construit AUCUNE option BullMQ avec un `attempts` différent
 *     de 1 — il n'utilise même aucune file (c'est un appel synchrone), donc le
 *     fichier ne doit contenir ni `attempts:` ni `.add(` d'un job.
 */

const QUEUE_FILE = join(__dirname, '..', 'modules', 'analysis', 'org-rebuild.queue.ts')
const WAVE_METHOD_FILE = join(__dirname, '..', 'modules', 'analysis', 'analysis-ondemand.service.ts')

/** Un `attempts:` qui vaudrait autre chose que 1 — la garde le SAIT reconnaître
 *  (test « sait dire NON » ci-dessous), même si elle ne le voit nulle part en
 *  vigueur aujourd'hui. */
function attemptsValueOf(source: string): number | null {
  const match = source.match(/attempts\s*:\s*(\d+)/)
  return match ? Number(match[1]) : null
}

describe('GA-211 — attempts: 1 sur la reconstruction du graphe n’est pas défait', () => {
  it('ORG_REBUILD_JOB_OPTIONS.attempts vaut 1, importé depuis le vrai fichier', () => {
    expect(ORG_REBUILD_JOB_OPTIONS.attempts).toBe(1)
  })

  it('le commentaire qui explique CE choix est toujours dans le fichier source', () => {
    const source = readFileSync(QUEUE_FILE, 'utf8')
    expect(attemptsValueOf(source)).toBe(1)
    expect(source).toMatch(/fan-out LLM complet/)
  })

  it('enrichOrganigramWave (le chemin de confirmWave) ne pose aucune file ni option attempts', () => {
    // La reprise du planificateur ne passe PAS par une nouvelle file BullMQ —
    // c'est un appel synchrone au même service que le bouton « Enrichir
    // l'organigramme ». Si un jour quelqu'un l'enfile, cette garde doit le
    // FORCER à documenter le nombre de tentatives choisi, pas le laisser
    // implicite (le défaut BullMQ est `attempts: 1`, silencieusement).
    const source = readFileSync(WAVE_METHOD_FILE, 'utf8')
    const waveMethodStart = source.indexOf('async enrichOrganigramWave(')
    expect(waveMethodStart).toBeGreaterThan(-1)
    const nextMethodStart = source.indexOf('\n  private async classifyAndPersist(', waveMethodStart)
    const waveMethodBody = source.slice(waveMethodStart, nextMethodStart === -1 ? undefined : nextMethodStart)
    expect(waveMethodBody).not.toMatch(/attempts\s*:/)
    expect(waveMethodBody).not.toMatch(/\.add\(/)
  })

  it('sait dire NON — un attempts relevé à 3 serait détecté', () => {
    const mutated = `
      export const ORG_REBUILD_JOB_OPTIONS = {
        attempts: 3,
        removeOnComplete: { age: 3_600 },
      }
    `
    expect(attemptsValueOf(mutated)).toBe(3)
    expect(attemptsValueOf(mutated)).not.toBe(1)
  })

  it('sait dire NON — un fichier sans le commentaire de justification serait détecté', () => {
    const undocumented = `
      export const ORG_REBUILD_JOB_OPTIONS = { attempts: 1 }
    `
    expect(undocumented).not.toMatch(/fan-out LLM complet/)
  })
})
