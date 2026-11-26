import { describe, expect, it } from 'vitest'
import {
  ANGLE_PROOF_STATUSES,
  angleProofState,
  attackAngleSchema,
  commentOuvrirCompteSchema,
  displayableAngleProof,
} from './strategy.js'

/**
 * #2116.17 — `comment_ouvrir_compte` arrive comme une string brute (la forme
 * MAJORITAIRE du pipeline actuel) ou comme l'objet structuré. Les deux
 * doivent survivre au contrat, TELLES QUELLES (le type reste l'union — voir
 * le docblock de `commentOuvrirCompteSchema` pour pourquoi une string n'est
 * PAS normalisée en objet ici) — et un item d'`entry_points` non conforme ne
 * doit jamais faire tomber le champ ENTIER (« deux lectures qui divergent » :
 * avant ce correctif, un item hétérogène faisait échouer tout le
 * `z.array(entryPointSchema)`, donc `parseAccountAnalysis` jetait
 * `comment_ouvrir_compte` en entier).
 */
describe('commentOuvrirCompteSchema — les deux formes réelles', () => {
  it('accepte une string réelle telle quelle — le contrat ne la normalise pas', () => {
    const result = commentOuvrirCompteSchema.parse(
      'Entrer par la DSI via la refonte du portail client, en citant la référence Renault.',
    )
    expect(result).toBe('Entrer par la DSI via la refonte du portail client, en citant la référence Renault.')
  })

  it('garde la forme objet bien formée inchangée', () => {
    const result = commentOuvrirCompteSchema.parse({
      strategy: 'Entrer par la refonte du portail',
      entry_points: [
        { label: 'Direction du portail client', target_profile: 'CTO', justification: 'Refonte en cours' },
      ],
    })
    expect(result).toEqual({
      strategy: 'Entrer par la refonte du portail',
      entry_points: [
        { label: 'Direction du portail client', target_profile: 'CTO', justification: 'Refonte en cours' },
      ],
    })
  })

  it('coerce un `entry_points` hétérogène ITEM PAR ITEM — jamais le champ entier jeté', () => {
    const result = commentOuvrirCompteSchema.parse({
      strategy: 'Entrer par la DSI',
      entry_points: ['Direction des systèmes d’information', { label: 'DSI' }, 42],
    })
    expect(result).toEqual({
      strategy: 'Entrer par la DSI',
      entry_points: [
        { label: 'Direction des systèmes d’information', target_profile: null, justification: null },
        { label: 'DSI' },
      ],
    })
  })
})

/**
 * La PREUVE d'un angle, et les quatre façons de ne pas en avoir (tome 5 §32.2).
 *
 * Ce qui se joue ici tient en une distinction : **« pas de preuve » et « pas
 * encore vérifié » ne sont pas la même chose**, et l'écran ne doit jamais dire
 * le premier quand il est dans le second — ce serait affirmer qu'on a regardé.
 * C'est la doctrine « non mesuré n'est jamais 0 » appliquée à une phrase.
 */

describe('angleProofState — quatre états, dont un pour l’absence de mesure', () => {
  it('rend le verdict porté par le service quand il existe', () => {
    expect(angleProofState({ proof_status: 'mobilisable' })).toBe('mobilisable')
    expect(angleProofState({ proof_status: 'absent' })).toBe('absent')
    expect(angleProofState({ proof_status: 'non_verifiable' })).toBe('non_verifiable')
  })

  it('rend « non_verifie » pour un angle SANS verdict — jamais « absent »', () => {
    // Le cas de tous les dossiers analysés avant le 29/08/2026. Les afficher
    // comme « aucune preuve » affirmerait une vérification qui n'a pas eu lieu.
    expect(angleProofState({ title: 'Un angle', proof: 'chez Decathlon' })).toBe('non_verifie')
    expect(angleProofState({})).toBe('non_verifie')
  })

  it('ne fait pas confiance à une valeur inconnue venue du JSONB', () => {
    // `raw_analysis` n'est validé par personne à la lecture : une valeur que le
    // contrat ne connaît pas est une non-mesure, pas un quatrième verdict.
    expect(angleProofState({ proof_status: 'formidable' })).toBe('non_verifie')
    expect(angleProofState({ proof_status: 42 })).toBe('non_verifie')
  })

  it('ne casse pas sur ce qui n’est pas un objet', () => {
    for (const junk of [null, undefined, 'texte', 7, []]) {
      expect(angleProofState(junk)).toBe('non_verifie')
    }
  })

  it('lit aussi la forme camelCase, au cas où le modèle la recopie', () => {
    expect(angleProofState({ proofStatus: 'mobilisable' })).toBe('mobilisable')
  })
})

describe('displayableAngleProof — ce que l’écran a le droit de répéter', () => {
  it('rend la preuve mobilisable, mot pour mot', () => {
    expect(displayableAngleProof({ proof: 'Mission chez Decathlon', proof_status: 'mobilisable' })).toBe(
      'Mission chez Decathlon',
    )
  })

  it('ne relaie PAS une preuve non vérifiable, même si le texte a survécu', () => {
    // Le service l'efface à la source ; si une ligne ancienne la porte encore,
    // l'écran ne la répète pas pour autant. Retirer le moyen, pas la permission.
    expect(displayableAngleProof({ proof: 'Mission chez Carrefour', proof_status: 'non_verifiable' })).toBeNull()
  })

  it('ne relaie PAS une preuve jamais vérifiée', () => {
    expect(displayableAngleProof({ proof: 'Mission chez Carrefour' })).toBeNull()
  })

  it('rend null sur un champ vide ou blanc', () => {
    expect(displayableAngleProof({ proof: '   ', proof_status: 'mobilisable' })).toBeNull()
    expect(displayableAngleProof({ proof_status: 'absent' })).toBeNull()
  })
})

describe('attackAngleSchema — le champ existe vraiment dans le contrat', () => {
  it('accepte un angle estampillé', () => {
    const parsed = attackAngleSchema.parse({
      title: 'Un play',
      proof: 'Mission chez Decathlon',
      proof_status: 'mobilisable',
    })
    expect(parsed.proof).toBe('Mission chez Decathlon')
    expect(parsed.proof_status).toBe('mobilisable')
  })

  it('accepte un angle ancien, sans preuve ni verdict', () => {
    // Un contrat qui exigerait le champ ferait disparaître tous les dossiers
    // produits avant lui — un enum ne perd jamais de valeur, un champ neuf ne
    // rend pas illisible ce qui existait.
    expect(() => attackAngleSchema.parse({ title: 'Un play' })).not.toThrow()
  })

  it('refuse un verdict que le contrat ne connaît pas', () => {
    expect(() => attackAngleSchema.parse({ title: 'x', proof_status: 'formidable' })).toThrow()
  })

  it('énumère exactement les trois verdicts du service', () => {
    expect([...ANGLE_PROOF_STATUSES]).toEqual(['absent', 'mobilisable', 'non_verifiable'])
  })
})
