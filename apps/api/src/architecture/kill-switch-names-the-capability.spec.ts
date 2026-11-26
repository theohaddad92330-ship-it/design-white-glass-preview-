import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API_KILL_SWITCHES, IA_KILL_SWITCHES, killSwitchReport } from '../common/kill-switches'

/**
 * GA-85 — l'état publié nomme une CAPACITÉ, jamais une variable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * On vient d'ouvrir un chemin qui va de l'environnement des serveurs jusqu'à un
 * écran. C'est utile — sans lui, un interrupteur posé en incident ne se voit
 * nulle part. C'est aussi une porte : **la seule chose qui doit la traverser est
 * l'ÉTAT d'une capacité.** Pas un nom de variable, pas une valeur.
 *
 * Un écran opérateur qui listerait `LANGFUSE_SECRET_KEY` serait un défaut plus
 * grave que celui qu'on corrige. Et il ne s'écrirait pas d'un coup : il
 * commencerait par un `envVar` ajouté « pour aider l'astreinte », puis par un
 * second champ. Cette garde refuse le premier.
 *
 * Elle prolonge `copilot-payload-names-the-capability.spec.ts` — même principe,
 * autre charge utile : on nomme ce que la chose FAIT, jamais comment elle est
 * câblée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La charge utile RÉELLE, construite par `killSwitchReport`, dans les trois
 * états qu'elle peut prendre (tout actif · tout coupé · moteur injoignable) —
 * pas une maquette. Une garde qui inspecterait le TYPE laisserait passer un
 * champ ajouté à l'objet sans être déclaré ; une garde qui inspecterait un objet
 * écrit à la main ne prouverait rien du code de production.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const ALL = [...API_KILL_SWITCHES, ...IA_KILL_SWITCHES]

/** Les trois charges utiles possibles, sérialisées comme sur le réseau. */
function payloads(): { label: string; json: string }[] {
  const ORIGINAL = { ...process.env }
  try {
    const iaAll = (cut: boolean) => Object.fromEntries(IA_KILL_SWITCHES.map(s => [s.id, cut]))
    const clear = () => {
      for (const sw of API_KILL_SWITCHES) delete process.env[sw.envVar]
    }

    // 1. Rien de posé nulle part, moteur joignable : tout est actif.
    clear()
    const allActive = JSON.stringify(killSwitchReport({ ia: iaAll(false) }))

    // 2. Tout coupé, des deux côtés.
    for (const sw of API_KILL_SWITCHES) process.env[sw.envVar] = 'true'
    const allCut = JSON.stringify(killSwitchReport({ ia: iaAll(true) }))

    // 3. Rien de posé côté API, moteur INJOIGNABLE — l'état où l'on ne SAIT PAS,
    //    et le seul qui doit produire des `unknown`.
    clear()
    const iaUnknown = JSON.stringify(killSwitchReport({ ia: null }))

    return [
      { label: 'tout actif', json: allActive },
      { label: 'tout coupé', json: allCut },
      { label: 'moteur injoignable', json: iaUnknown },
    ]
  } finally {
    process.env = ORIGINAL
  }
}

describe('GA-85 — l’état publié nomme une capacité, jamais une variable', () => {
  const built = payloads()

  it('construit de vraies charges utiles, non vides', () => {
    // Non-vacuité : une garde qui inspecte une chaîne vide passe pour rien.
    expect(built).toHaveLength(3)
    for (const { label, json } of built) {
      expect(json.length).toBeGreaterThan(500)
      // Et elle porte bien ce qu'on croit : toutes les capacités déclarées.
      for (const sw of ALL) expect(`${label}: ${json}`).toContain(sw.id)
    }
    // Témoin positif du DISCRIMINANT : les trois états sont bien distincts,
    // donc les vérifications ci-dessous portent sur trois contenus différents.
    expect(new Set(built.map(b => b.json.replace(/"measuredAt":"[^"]*"/, ''))).size).toBe(3)
    // Et le troisième est bien celui où l'on ne sait pas — « non mesuré n'est
    // jamais 0 » : un moteur muet ne rend pas ses capacités « actives ».
    expect(built[2]?.json).toContain('"state":"unknown"')
    expect(built[2]?.json).toContain('"iaReachable":false')
    expect(built[0]?.json).not.toContain('"state":"unknown"')
  })

  it('ne laisse passer aucun nom de variable d’environnement', () => {
    for (const { label, json } of built) {
      const leaks = [...json.matchAll(/[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+/g)].map(m => m[0])
      expect(`${label} → ${leaks.join(', ')}`).toBe(`${label} → `)
    }
  })

  it('ne laisse passer aucune valeur d’environnement, même posée à une chaîne bavarde', () => {
    const ORIGINAL = { ...process.env }
    try {
      // Une valeur qu'on reconnaîtrait entre mille si elle fuyait.
      for (const sw of API_KILL_SWITCHES) process.env[sw.envVar] = 'true-POSE-PAR-LASTREINTE-2026'
      const json = JSON.stringify(killSwitchReport({ ia: null }))
      expect(json).not.toContain('POSE-PAR-LASTREINTE')
    } finally {
      process.env = ORIGINAL
    }
  })

  it('n’expose pas `envVar` dans le type publié — la fuite n’a pas de champ où passer', () => {
    const source = readFileSync(join(REPO_ROOT, 'apps', 'api', 'src', 'common', 'kill-switches.ts'), 'utf8')
    // ⚠️ `export` est OPTIONNEL dans le motif : le type a cessé d'être exporté
    // (knip — un type consommé dans son seul fichier ne s'exporte pas), et la
    // garde est devenue AVEUGLE sur-le-champ. C'est son propre contrôle de
    // non-vacuité qui l'a rattrapée, deux minutes après. Elle reste ici comme
    // rappel : un extracteur qui vise une forme de déclaration précise cesse de
    // voir dès qu'on la reformule.
    const type = source.match(/(?:export )?type KillSwitchStatus = \{([\s\S]*?)\n\}/)
    expect(type?.[1]).toBeDefined()
    // Témoin positif : le bloc lu est bien celui qu'on croit.
    expect(type?.[1]).toContain('state:')
    expect(type?.[1]).not.toContain('envVar')
    expect(type?.[1]).not.toContain('match')
  })

  it('dit « coupée exprès », pas « en panne » — le vocabulaire est celui d’une décision', () => {
    // Un interrupteur ÉTEINT n'est pas une panne : il a été éteint exprès. Les
    // trois états le disent, et aucun n'emprunte le vocabulaire de l'erreur.
    const states = new Set(JSON.parse(built[1]?.json ?? '{}').switches.map((s: { state: string }) => s.state))
    expect([...states]).toEqual(['cut'])
    for (const { json } of built) {
      expect(json).not.toMatch(/"state":"(error|failed|down|broken)"/)
    }
  })
})
