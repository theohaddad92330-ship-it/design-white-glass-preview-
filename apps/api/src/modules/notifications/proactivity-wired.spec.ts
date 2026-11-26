import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le plafond de proactivité a des appelants, et il en a les bons.
 *
 * Le §7 du PDF 6 protège l'utilisateur du produit : « sans plafond, il coupe
 * tout ». Vingt-six routines postent des notifications, chacune raisonnable
 * prise seule ; personne ne comptait le total.
 *
 * Deux vérifications que ni un type ni un test de comportement ne peuvent
 * faire, parce qu'elles portent sur ce qui MANQUE :
 *
 *  1. les routines — le seul émetteur réellement proactif du dépôt — déclarent
 *     bien `origin: 'proactive'` ; sans ce marqueur, le plafond ne s'applique à
 *     rien et le code du §7 serait décoratif ;
 *  2. le plafond est appliqué dans `createNotification` et nulle part ailleurs.
 *     Le mettre plus haut obligerait chaque émetteur à s'en souvenir, et c'est
 *     précisément ce genre de discipline distribuée qui finit par avoir un trou.
 */
describe('le plafond de proactivité est branché', () => {
  const MODULES = join(__dirname, '..')

  const read = (relative: string): string => readFileSync(join(MODULES, relative), 'utf8')

  it('les routines déclarent leurs messages comme proactifs', () => {
    const source = read('routines/routines.service.ts')
    // Deux chemins, tous deux proactifs : l'unitaire (routine CONTINUE, une
    // occurrence par objet) et le LOT du balayage, arbitré ensemble pour que la
    // priorité serve enfin à quelque chose.
    const unitary = source.split('createNotification(').length - 1
    const batched = source.split('createProactiveBatch(').length - 1
    const proactive = source.split("origin: 'proactive'").length - 1
    expect(unitary + batched).toBeGreaterThan(0)
    // Le lot est proactif PAR CONSTRUCTION : la méthode n'accepte pas d'autre
    // origine, donc il n'a pas à le déclarer ligne par ligne.
    expect(proactive).toBe(unitary)
  })

  it('le lot du balayage passe par le MÊME arbitrage, dans le même service', () => {
    const source = read('notifications/notifications.service.ts')
    expect(source).toContain('createProactiveBatch')
    // Un second chemin d'arbitrage serait exactement le défaut que la garde
    // ci-dessous interdit aux autres modules.
    expect(source.split('decideProactivity(').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('le plafond vit dans `createNotification`, en un seul endroit', () => {
    expect(read('notifications/notifications.service.ts')).toContain('decideProactivity')
  })

  it('aucun autre module ne décide du plafond dans son coin', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
        if (full.includes('/notifications/')) continue
        if (readFileSync(full, 'utf8').includes('decideProactivity')) {
          offenders.push(full.slice(full.indexOf('/modules')))
        }
      }
    }
    walk(MODULES)
    expect(offenders).toEqual([])
  })
})
