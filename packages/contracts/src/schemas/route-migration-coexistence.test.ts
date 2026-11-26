import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_MIGRATION_KEYS, ROUTE_MIGRATION_REGISTRY } from './route-migration-registry.js'
import {
  COEXISTENCE_MODES,
  ROUTE_MIGRATION_COEXISTENCE,
  routeMigrationCoexistenceEntrySchema,
} from './route-migration-coexistence.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('registre de coexistence — complétude et contrat', () => {
  it('couvre exactement les vingt-et-une routes du registre #2154.3/#2208, sans en redéclarer le contenu (GA-26)', () => {
    expect(ROUTE_MIGRATION_COEXISTENCE).toHaveLength(ROUTE_MIGRATION_KEYS.length)
    expect(ROUTE_MIGRATION_COEXISTENCE.map(entry => entry.key)).toEqual(
      ROUTE_MIGRATION_REGISTRY.map(entry => entry.key),
    )
  })

  it('chaque entrée respecte le contrat', () => {
    for (const entry of ROUTE_MIGRATION_COEXISTENCE) {
      expect(routeMigrationCoexistenceEntrySchema.safeParse(entry).success).toBe(true)
    }
  })

  it('deux modes possibles, les deux réellement utilisés (#4197 : plus de `vue_partagee`)', () => {
    expect(new Set(ROUTE_MIGRATION_COEXISTENCE.map(entry => entry.mode))).toEqual(new Set(COEXISTENCE_MODES))
  })
})

describe('#4197 — plus aucune vue partagée : Positionnements a sa route, le Vivier n’a plus de vues', () => {
  // #4349 (Louis 19/10/2026, renverse #4197) — Talents = le Vivier seul : Positionnements n'a plus
  // d'écran à lui ; #4359 (Louis 20/10/2026) : sa route est retirée, la section vit dans le Vivier.
  it('Positionnements n’a plus de fichier de route (#4349, #4359)', () => {
    const entry = ROUTE_MIGRATION_COEXISTENCE.find(candidate => candidate.key === 'positionnements')
    expect(entry?.mode).toBe('redirection_pure')
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/routes/consultants/submissions.tsx'))).toBe(false)
  })

  it('chaque source de donnée canonique citée existe VRAIMENT comme appel API réel', () => {
    const submissionsApi = readFileSync(join(REPO_ROOT, 'apps/web/src/features/submissions/api.ts'), 'utf8')
    expect(submissionsApi).toMatch(/apiFetch/)
    expect(submissionsApi).toMatch(/\/submissions/)

    const talentApi = readFileSync(join(REPO_ROOT, 'apps/web/src/features/consultants/talent-api.ts'), 'utf8')
    expect(talentApi).toMatch(/apiFetch/)
  })
})

describe('`redirection_pure` — l’ancienne projection est VRAIMENT retirée, rien ne coexiste', () => {
  const pureRedirects = ROUTE_MIGRATION_COEXISTENCE.filter(entry => entry.mode === 'redirection_pure')

  it('dix routes : Chaînes (→ Pipe), Veille, Favoris, Mémoire collective, Besoins, Écritures, Intégrations, Réactivation (#3962), Appels d’offres (#4341), Positionnements (#4349) — Automatisations n’en fait plus partie (c130, 22/10 : un vrai écran)', () => {
    expect(pureRedirects.map(entry => entry.key).sort()).toEqual(
      [
        'appels_offres',
        'positionnements',
        'besoins',
        'chaines',
        'ecritures',
        'favoris',
        'integrations',
        'memoire_collective',
        'reactivation',
        'veille',
      ].sort(),
    )
  })

  it('aucune n’a de source de donnée canonique déclarée — rien à partager', () => {
    expect(pureRedirects.every(entry => entry.canonicalDataSource === null)).toBe(true)
  })

  it('leur fichier ne rend VRAIMENT aucun écran — une seule projection vivante', () => {
    for (const entry of pureRedirects) {
      const registryEntry = ROUTE_MIGRATION_REGISTRY.find(reg => reg.key === entry.key)
      if (registryEntry?.targetStatus === 'removed') {
        // #4359 — plus de fichier de route : rien ne peut rendre un écran caché.
        for (const file of [
          `apps/web/src/routes${registryEntry.currentRoute}.tsx`,
          `apps/web/src/routes${registryEntry.currentRoute}/index.tsx`,
        ]) {
          expect(existsSync(join(REPO_ROOT, file)), file).toBe(false)
        }
        continue
      }
      const filePath = join(REPO_ROOT, registryEntry?.holderFile as string)
      const source = readFileSync(filePath, 'utf8')
      if (registryEntry?.holderFile === 'apps/web/src/lib/legacy-addresses.ts') {
        // #4359 — la table est une donnée : aucun JSX, une ligne par adresse.
        expect(source).toContain(`'${registryEntry.currentRoute}': '${registryEntry.newDestination}'`)
        continue
      }
      expect(source).toMatch(/throw redirect\(/)
      // Aucun JSX rendu à côté du redirect : pas de second écran caché qui
      // ferait de « redirection pure » un mensonge.
      expect(source).not.toMatch(/return \(?\s*</)
    }
  })
})

describe('`non_verifiable` — hérite honnêtement le gap du registre, ne l’invente pas', () => {
  it('onze routes, le même compte que les onze non `redirected` du registre (#2958 ; #4341/#4349 : 13 → 10, #4357 ; c130 : 10 → 11)', () => {
    const nonVerifiable = ROUTE_MIGRATION_COEXISTENCE.filter(entry => entry.mode === 'non_verifiable')
    expect(nonVerifiable).toHaveLength(11)
    for (const entry of nonVerifiable) {
      const registryEntry = ROUTE_MIGRATION_REGISTRY.find(reg => reg.key === entry.key)
      expect(entry.evidence).toContain(registryEntry?.gap)
    }
  })
})
