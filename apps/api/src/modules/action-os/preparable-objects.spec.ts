import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { intentSite } from '@bellum/contracts'
import { PREPARABLE_OBJECTS, type PreparableObject } from './preparable-objects'
import { authorizeAtActionLevel } from './copilot-action-gate'

/**
 * #2449.8-.15 — LES HUIT PRÉPARATIONS DU NIVEAU « PRÉPARER », ET OÙ LE PRODUIT
 * LES RÉALISE VRAIMENT.
 *
 * La porte dit la RÈGLE (« ce niveau crée à l'intérieur de BellumAI et nulle
 * part ailleurs ») ; ces huit lignes disent ce que la règle recouvre. Sans
 * elles, « le niveau 2 peut créer une shortlist interne » reste une phrase que
 * personne ne peut confronter au produit — et le jour où l'artefact disparaît
 * ou déménage, la phrase reste vraie en apparence.
 *
 * La garde LIT le disque : chaque artefact nommé doit exister. Et elle sait
 * dire NON — un chemin inventé rougit, sans qu'on touche à la table réelle.
 */

const API_SRC = join(__dirname, '../..')

/** Les artefacts d'une table dont le fichier manque — la table est fausse. */
export function missingArtifacts(objects: Readonly<Record<string, PreparableObject>>): string[] {
  return Object.values(objects)
    .filter(object => !existsSync(join(API_SRC, object.realizedBy)))
    .map(object => object.realizedBy)
}

describe('#2449.8-.15 — « préparer » crée huit choses, et chacune existe', () => {
  it('les huit points du registre sont couverts, un par un', () => {
    expect(Object.values(PREPARABLE_OBJECTS).map(object => object.point)).toEqual([
      '2449.8',
      '2449.9',
      '2449.10',
      '2449.11',
      '2449.12',
      '2449.13',
      '2449.14',
      '2449.15',
    ])
  })

  it('LIT vraiment : les huit artefacts nommés existent sur le disque', () => {
    expect(missingArtifacts(PREPARABLE_OBJECTS)).toEqual([])
  })

  it('sait dire NON : un artefact qui n’existe pas est signalé', () => {
    expect(
      missingArtifacts({
        fantome: {
          point: '2449.99',
          realizedBy: 'modules/action-os/un-fichier-qui-nexiste-pas.ts',
          why: 'témoin négatif',
        },
      }),
    ).toEqual(['modules/action-os/un-fichier-qui-nexiste-pas.ts'])
  })

  it('chacune porte une raison écrite, jamais un chemin nu', () => {
    for (const object of Object.values(PREPARABLE_OBJECTS)) {
      expect(object.why.length).toBeGreaterThan(40)
    }
  })

  it('celles qu’un intent réalise sont bien de site `bellum`, donc permises au niveau « préparer »', () => {
    for (const object of Object.values(PREPARABLE_OBJECTS)) {
      if (!object.intentType) continue
      expect(intentSite(object.intentType)).toBe('bellum')
      expect(
        authorizeAtActionLevel({
          level: 'prepare',
          gesture: { intentType: object.intentType, targetCount: 1 },
          backedByUserGesture: false,
        }),
      ).toEqual({ verdict: 'allowed', preparedInBellum: true })
    }
  })
})
