import { describe, expect, it } from 'vitest'
import {
  MESSAGE_STYLE_IMPORT_KINDS,
  MESSAGE_STYLE_SOURCE_TYPES,
  analyzeMessageStyleImport,
  createMessageStyleImportSchema,
  messageStyleImportKindSchema,
  messageStyleImportSchema,
  messageStyleSourceTypeSchema,
} from './message-style-import.js'

// #2369.2 — les quinze sources de style ADMISES, littérales (LAU-FINAL-084).
describe('MESSAGE_STYLE_SOURCE_TYPES — les quinze sources admises (#2369.2)', () => {
  it('porte exactement les quinze valeurs du registre, dans l’ordre du message', () => {
    expect(MESSAGE_STYLE_SOURCE_TYPES).toEqual([
      'validated_example',
      'imported_template',
      'sent_message',
      'accepted_edit',
      'brand_guide',
      'signature',
      'user_preference',
      'formality',
      'language',
      'forbidden_words',
      'allowed_cta',
      'length',
      'punctuation',
      'opening_formula',
      'closing_formula',
    ])
  })

  it('le schéma est un ensemble FERMÉ — une source hors liste est refusée', () => {
    expect(messageStyleSourceTypeSchema.safeParse('made_up_source').success).toBe(false)
    for (const source of MESSAGE_STYLE_SOURCE_TYPES) {
      expect(messageStyleSourceTypeSchema.safeParse(source).success).toBe(true)
    }
  })
})

// #2369.3 — importer des messages LinkedIn/emails/pitches/relances/introductions/partenaires/push profils.
describe('MESSAGE_STYLE_IMPORT_KINDS — les sept natures d’import (#2369.3)', () => {
  it('porte exactement les sept valeurs du registre', () => {
    expect(MESSAGE_STYLE_IMPORT_KINDS).toEqual([
      'linkedin_message',
      'email',
      'phone_pitch',
      'follow_up',
      'introduction',
      'partner_message',
      'profile_push',
    ])
  })

  it('le schéma est un ensemble FERMÉ', () => {
    expect(messageStyleImportKindSchema.safeParse('carrier_pigeon').success).toBe(false)
    for (const kind of MESSAGE_STYLE_IMPORT_KINDS) {
      expect(messageStyleImportKindSchema.safeParse(kind).success).toBe(true)
    }
  })
})

describe('createMessageStyleImportSchema', () => {
  it('accepte un import valide', () => {
    const result = createMessageStyleImportSchema.safeParse({
      importKind: 'linkedin_message',
      sourceType: 'sent_message',
      rawText: 'Bonjour Julien, ravi de vous contacter. Cordialement,',
    })
    expect(result.success).toBe(true)
  })

  it('refuse un texte vide — rien à analyser', () => {
    const result = createMessageStyleImportSchema.safeParse({
      importKind: 'email',
      sourceType: 'validated_example',
      rawText: '   ',
    })
    expect(result.success).toBe(false)
  })
})

describe('messageStyleImportSchema — le CORPS ne sort jamais (doctrine)', () => {
  it('ne porte AUCUN champ de texte importé — seulement les métadonnées', () => {
    const shape = (messageStyleImportSchema as unknown as { shape: Record<string, unknown> }).shape
    expect(Object.keys(shape).sort()).toEqual(
      ['id', 'workspaceId', 'importedBy', 'importKind', 'sourceType', 'createdAt'].sort(),
    )
  })
})

// #2369.4 — l’analyse préalable (patterns/ton/structure/risques/infos obsolètes).
// #2369.5 — la restitution « je conserve / je ne reproduis pas / je propose ».
describe('analyzeMessageStyleImport — l’analyse préalable, jamais envoyée au modèle', () => {
  it('nomme la longueur — toujours mesurable, jamais absente de « conserve »', () => {
    const analysis = analyzeMessageStyleImport('Un message court.')
    expect(analysis.conserve.some(line => line.includes('court'))).toBe(true)
  })

  it('détecte le tutoiement quand « tu » domine, sans aucun « vous »', () => {
    const analysis = analyzeMessageStyleImport('Salut, tu vas voir, ton offre va te plaire.')
    expect(analysis.conserve.some(line => line.includes('tutoiement'))).toBe(true)
  })

  it('détecte le vouvoiement quand « vous » domine, sans aucun « tu »', () => {
    const analysis = analyzeMessageStyleImport('Bonjour, votre équipe pourrait apprécier votre nouvel outil.')
    expect(analysis.conserve.some(line => line.includes('vouvoiement'))).toBe(true)
  })

  it('ne nomme AUCUNE formalité quand ni tu ni vous ne dominent — absence = aucune ligne (doctrine)', () => {
    const analysis = analyzeMessageStyleImport('Voici une présentation neutre de notre offre commerciale.')
    expect(analysis.conserve.some(line => line.includes('tutoiement') || line.includes('vouvoiement'))).toBe(false)
  })

  it('propose une règle de structure sur une formule d’ouverture reconnue', () => {
    const analysis = analyzeMessageStyleImport('Bonjour Julien,\nRavi de vous contacter.\nCordialement,')
    expect(analysis.propose.some(p => p.signal === 'structure_preference' && /ouverture/.test(p.observation))).toBe(
      true,
    )
    expect(analysis.propose.some(p => p.signal === 'structure_preference' && /clôture/.test(p.observation))).toBe(true)
  })

  it('ne propose rien quand aucune formule n’est reconnue', () => {
    const analysis = analyzeMessageStyleImport('Voici une présentation neutre de notre offre commerciale.')
    expect(analysis.propose).toEqual([])
  })

  it('classe un ton agressif isolé dans « je ne reproduis pas », jamais dans « je propose » (#2369.13)', () => {
    const analysis = analyzeMessageStyleImport(
      'Dernière chance !!! Agissez maintenant !!! Ne ratez pas cette offre !!!',
    )
    expect(analysis.neReproduitPas.some(line => /agressif/.test(line))).toBe(true)
    expect(analysis.propose).toEqual([])
  })

  it('nomme une date potentiellement obsolète, sans exposer le corps du message', () => {
    const analysis = analyzeMessageStyleImport('Nous avons signé ce contrat en 2019 et rien n’a bougé depuis.')
    expect(analysis.neReproduitPas.some(line => line.includes('2019'))).toBe(true)
  })

  it('ne nomme AUCUNE date quand rien n’est détecté — absence = aucune ligne (doctrine)', () => {
    const analysis = analyzeMessageStyleImport('Voici une présentation neutre de notre offre commerciale.')
    expect(analysis.neReproduitPas.some(line => /\b(19|20)\d{2}\b/.test(line))).toBe(false)
  })
})
