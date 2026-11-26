import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeDemoSeedFingerprint, DEMO_SEED_FINGERPRINT } from './demo-seed-fingerprint'

/**
 * L'empreinte de semis (#3135 — une salle re-déployée gardait l'ancien jeu
 * pour toujours). Ces tests portent sur la fonction PURE : ce qui compte, un
 * hash lui-même n'a pas de valeur attendue.
 */
describe('computeDemoSeedFingerprint', () => {
  it('rend la même empreinte pour le même build et le même jeu de données', () => {
    const a = computeDemoSeedFingerprint('sha-1', [{ company_name: 'SNCF' }])
    const b = computeDemoSeedFingerprint('sha-1', [{ company_name: 'SNCF' }])
    expect(a).toBe(b)
  })

  it('change quand le SHA de build change, à jeu de données identique', () => {
    // Le cas de l'incident : #3135 n'a rien changé dans DEMO_DOSSIERS, mais
    // l'API déployée n'était plus celle qui avait semé les salles existantes.
    const before = computeDemoSeedFingerprint('sha-before', [{ company_name: 'SNCF' }])
    const after = computeDemoSeedFingerprint('sha-after', [{ company_name: 'SNCF' }])
    expect(after).not.toBe(before)
  })

  it('change quand le jeu de données change, à build identique', () => {
    const before = computeDemoSeedFingerprint('sha-1', [{ company_name: 'SNCF' }])
    const after = computeDemoSeedFingerprint('sha-1', [{ company_name: 'SNCF', tags: ['nouveau'] }])
    expect(after).not.toBe(before)
  })

  it('DEMO_SEED_FINGERPRINT est calculée et stable au sein d’un même process', () => {
    expect(typeof DEMO_SEED_FINGERPRINT).toBe('string')
    expect(DEMO_SEED_FINGERPRINT.length).toBeGreaterThan(0)
  })

  /**
   * #3068 — LE DÉFAUT MESURÉ EN PROD LE 28/09 : une salle déjà semée gardait
   * ses onze profils du 27/09 (sans Léa Fontaine) MALGRÉ le correctif #3135
   * (daa03516f4/4d980ae035) déployé entre-temps.
   *
   * `DEMO_SEED_FINGERPRINT` (repli SANS `RAILWAY_GIT_COMMIT_SHA` — local, CI,
   * ou tout environnement où cette variable Railway ne porte rien) ne hachait
   * QUE `DEMO_DOSSIERS`. Léa Fontaine (`consultants`) et sa mission
   * interrompue (`DEMO_DELIVERY_CLIENT`, missions de livraison) vivent dans
   * DEUX AUTRES jeux de données de `demo-dataset.ts` — un changement qui ne
   * touche QU'EUX est donc invisible au repli de contenu : la salle se relit
   * « à jour » alors qu'elle ne porte ni le vivier ni les missions de
   * livraison courants. Le SHA de build reste le signal PRIMAIRE (il change à
   * chaque déploiement Railway, quel que soit l'endroit qui a bougé) — ce
   * test porte sur le REPLI, seul rempart hors Railway.
   */
  it('#3068 — le repli de contenu lit aussi DEMO_CONSULTANTS et DEMO_DELIVERY_CLIENT, pas seulement DEMO_DOSSIERS', () => {
    const source = readFileSync(join(__dirname, 'demo-seed-fingerprint.ts'), 'utf8')
    expect(source).toMatch(/DEMO_CONSULTANTS/)
    expect(source).toMatch(/DEMO_DELIVERY_CLIENT/)
  })

  /**
   * #3068 (généralisé, 28/09/2026 — défaut mesuré sur le dossier Société
   * Générale) — le même trou que #3068 documente pour DEMO_CONSULTANTS /
   * DEMO_DELIVERY_CLIENT existe encore pour TOUTE AUTRE export `DEMO_*` de
   * `demo-dataset.ts` que `DemoSeedService.seedWorkspace` consomme : la
   * démonstration SG était bien dans `DEMO_DOSSIERS` (donc déjà hachée), mais
   * rien ne garantissait qu'une prochaine export nouvellement seedée le
   * soit aussi — exactement la régression qui a fait manquer Léa Fontaine.
   *
   * GARDE DÉRIVÉE plutôt que recopiée (même doctrine que
   * `demoCompletenessProbes` dans `demo-reset.service.ts`) : elle lit
   * l'import réel de `demo-seed.service.ts` depuis `./demo-dataset` et exige
   * que chaque export DE DONNÉES (convention `DEMO_*`, jamais une fonction
   * `demoXxx` ni un `type`) soit AUSSI dans le tableau haché par
   * `computeDemoSeedFingerprint`. Une nouvelle table semée entre donc
   * d'office dans l'empreinte, sans qu'il faille y penser.
   */
  it('#3068 (généralisé) — chaque export DEMO_* que seedWorkspace lit depuis demo-dataset est dans l’empreinte', () => {
    const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    const closeIdx = seedSource.indexOf("} from './demo-dataset'")
    const openIdx = seedSource.lastIndexOf('import {', closeIdx)
    const importBlock = seedSource.slice(openIdx, closeIdx)
    const seededConstants = new Set(
      importBlock
        .split('\n')
        .map(line =>
          line
            .replace(/\/\/.*$/, '')
            .trim()
            .replace(/,$/, ''),
        )
        .filter(name => /^[A-Z][A-Z0-9_]*$/.test(name)),
    )
    expect(seededConstants.size).toBeGreaterThan(10)

    const fpSource = readFileSync(join(__dirname, 'demo-seed-fingerprint.ts'), 'utf8')
    const arrayMatch = /computeDemoSeedFingerprint\(buildIdentifier\(\),\s*\[([\s\S]*?)\]\)/.exec(fpSource)
    const hashed = new Set(
      (arrayMatch?.[1] ?? '')
        .split(',')
        .map(name => name.trim())
        .filter(Boolean),
    )

    const missing = [...seededConstants].filter(name => !hashed.has(name)).sort()
    expect(missing).toEqual([])
  })
})

describe('#3403 (X73) — les semis des voies d’accès personnelles sont dans l’empreinte', () => {
  it('la chaleur du lien (X68) change l’empreinte : une salle semée avant est re-semée', () => {
    const source = readFileSync(join(__dirname, 'demo-seed-fingerprint.ts'), 'utf8')
    expect(source).toMatch(/DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS/)
    expect(source).toMatch(/DEMO_PERSONAL_ACCESS_EXTRA_SEEDS/)
  })
})
