import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_MIGRATION_KEYS, ROUTE_MIGRATION_REGISTRY } from './route-migration-registry.js'
import {
  MIGRATION_STAGES,
  ROUTE_MIGRATION_ROLLBACK,
  STAGE_5_DOCTRINE_BLOCK,
  routeMigrationRollbackEntrySchema,
  rollbackableRoutes,
} from './route-migration-rollback.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('rollback de déploiement — les cinq étapes de #2154 (FEATURE FLAGS)', () => {
  it('sont les cinq étapes VERBATIM, dans l’ordre du texte', () => {
    expect(MIGRATION_STAGES).toEqual([
      'nouvelle_navigation',
      'nouvelles_redirections',
      'nouvelles_maisons_canoniques',
      'suppression_anciens_onglets',
      'nettoyage_code',
    ])
  })
})

describe('registre de rollback — complétude et contrat', () => {
  it('couvre exactement les vingt-et-une routes du registre #2154.3/#2208, sans en redéclarer le contenu (GA-26)', () => {
    expect(ROUTE_MIGRATION_ROLLBACK).toHaveLength(ROUTE_MIGRATION_KEYS.length)
    expect(ROUTE_MIGRATION_ROLLBACK.map(entry => entry.key)).toEqual(ROUTE_MIGRATION_REGISTRY.map(entry => entry.key))
  })

  it('chaque entrée respecte le contrat', () => {
    for (const entry of ROUTE_MIGRATION_ROLLBACK) {
      expect(routeMigrationRollbackEntrySchema.safeParse(entry).success).toBe(true)
    }
  })

  it('une route non prouvée migrée n’a ni étape ni rollback', () => {
    const unproven = ROUTE_MIGRATION_ROLLBACK.filter(entry => entry.stageReached === null)
    expect(unproven.every(entry => entry.canRollback === false && entry.rollbackHolderFile === null)).toBe(true)
    // Les dix routes non `redirected` du registre — le même compte que
    // route-migration-registry.test.ts, jamais recalculé indépendamment (#4341/#4349 : 13 → 10, #4357 ; c130 : 10 → 11).
    expect(unproven).toHaveLength(11)
  })
})

describe('l’étape 5 (nettoyage du code) est bloquée par DOCTRINE, jamais par oubli', () => {
  it('cite « on archive, on ne supprime pas »', () => {
    expect(STAGE_5_DOCTRINE_BLOCK).toMatch(/on archive, on ne supprime pas/)
  })

  it('aucune des vingt-et-une routes n’atteint jamais l’étape 5', () => {
    expect(ROUTE_MIGRATION_ROLLBACK.every(entry => entry.stageReached !== 'nettoyage_code')).toBe(true)
  })
})

describe('les six routes redirigées — étape 4 VÉRIFIÉE, pas déclarée', () => {
  const sectionsPath = join(REPO_ROOT, 'apps/web/src/components/navigation/sections.ts')
  const sectionsSource = readFileSync(sectionsPath, 'utf8')
  const rollbackable = rollbackableRoutes()

  it('cinq routes peuvent être défaites — le même compte que les cinq `redirected` du registre (#4359 : par la table des anciennes adresses ; c130 : Automatisations est un vrai écran)', () => {
    expect(rollbackable).toHaveLength(5)
  })

  it("aucune de leurs anciennes routes n’est une destination de navigation active (`to: '…'`)", () => {
    const stillInNav = rollbackable.filter(entry => {
      const source = ROUTE_MIGRATION_REGISTRY.find(reg => reg.key === entry.key)
      return sectionsSource.includes(`to: '${source?.currentRoute}'`)
    })
    expect(stillInNav.map(entry => entry.key)).toEqual([])
  })

  it('chaque fichier de rollback cité existe et est un fichier de redirection à USAGE UNIQUE (rien d’autre à défaire)', () => {
    for (const entry of rollbackable) {
      const filePath = join(REPO_ROOT, entry.rollbackHolderFile as string)
      expect(existsSync(filePath)).toBe(true)
      const source = readFileSync(filePath, 'utf8')
      if (entry.rollbackHolderFile === 'apps/web/src/lib/legacy-addresses.ts') {
        // #4359 — le porteur est la table : UNE ligne par adresse, aucun fichier de route à défaire.
        const reg = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === entry.key)
        expect(source).toContain(`'${reg?.currentRoute}': '${reg?.newDestination}'`)
        continue
      }
      // Le fichier ne rend qu'un redirect — aucun second export, aucun composant
      // React à côté qui rendrait le rollback incomplet.
      expect(source).toMatch(/throw redirect\(/)
      expect(source).not.toMatch(/function \w+\(/)
    }
  })

  it('la garde sait dire NON — un fichier de rollback inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/lib/fichier-qui-nexiste-pas.ts'))).toBe(false)
  })
})
