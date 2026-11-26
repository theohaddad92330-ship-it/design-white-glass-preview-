import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import {
  LAURA_UNROUTED_INTENTS_RETENTION_DAYS,
  UNROUTED_INTENT_TEXT_MAX_CHARS,
  languageOf,
  normalizeUnroutedText,
  publishUnroutedGroups,
  readUnroutedSignal,
  surfaceOf,
  withoutUnroutedSignal,
} from './unrouted-intent'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : « Enregistrer anonymement
 * l'intention non reconnue ». Ces tests portent sur les faits PURS : ce que
 * l'API accepte du moteur IA, ce qu'elle rend au navigateur, et ce que le
 * back-office a le droit de lire.
 */

describe('#1949.23 — les deux constantes nommées', () => {
  it('le texte est borné à 300 caractères et la trace vit 90 jours', () => {
    expect(UNROUTED_INTENT_TEXT_MAX_CHARS).toBe(300)
    expect(LAURA_UNROUTED_INTENTS_RETENTION_DAYS).toBe(90)
  })
})

describe('#1949.23 — readUnroutedSignal : ce que l’API accepte du moteur IA', () => {
  it('lit un signal bien formé', () => {
    expect(
      readUnroutedSignal({
        reply: 'ok',
        unrouted_intent: { category: 'hors_perimetre', text: 'Quel temps fera-t-il ?' },
      }),
    ).toEqual({ category: 'hors_perimetre', text: 'Quel temps fera-t-il ?' })
  })

  it('re-borne le texte à 300 caractères — la défense ne repose pas sur le seul moteur', () => {
    const signal = readUnroutedSignal({ unrouted_intent: { category: 'capacite_absente', text: 'x'.repeat(900) } })
    expect(signal?.text).toHaveLength(UNROUTED_INTENT_TEXT_MAX_CHARS)
  })

  it('sait dire NON — une catégorie inconnue, un texte vide ou une forme cassée ne s’écrivent pas', () => {
    expect(readUnroutedSignal({})).toBeNull()
    expect(readUnroutedSignal({ unrouted_intent: null })).toBeNull()
    expect(readUnroutedSignal({ unrouted_intent: 'hors_perimetre' })).toBeNull()
    expect(readUnroutedSignal({ unrouted_intent: { category: 'autre', text: 'bonjour' } })).toBeNull()
    expect(readUnroutedSignal({ unrouted_intent: { category: 'hors_perimetre', text: '   ' } })).toBeNull()
    expect(readUnroutedSignal({ unrouted_intent: { category: 'hors_perimetre', text: 42 } })).toBeNull()
  })

  it('n’accepte AUCUN champ d’identité — seuls la catégorie et le texte traversent', () => {
    const signal = readUnroutedSignal({
      unrouted_intent: { category: 'intention_incomprise', text: 'fais un truc', user_id: 'u-1', workspace_id: 'w-1' },
    })
    expect(Object.keys(signal ?? {}).sort()).toEqual(['category', 'text'])
  })
})

describe('#1949.23 — withoutUnroutedSignal : le navigateur ne reçoit rien de neuf', () => {
  it('retire le signal et laisse le reste intact', () => {
    const data = { reply: 'Je ne sais pas faire ça.', context: { actions: [] }, unrouted_intent: { category: 'x' } }
    expect(withoutUnroutedSignal(data)).toEqual({ reply: 'Je ne sais pas faire ça.', context: { actions: [] } })
  })

  it('rend le MÊME objet quand il n’y a rien à retirer — le chemin d’avant, byte-identique', () => {
    const data = { reply: 'ok' }
    expect(withoutUnroutedSignal(data)).toBe(data)
  })
})

describe('#1949.23 — normalizeUnroutedText : le regroupement', () => {
  it('plie casse, accents, ponctuation et espaces', () => {
    expect(normalizeUnroutedText('  Quel TEMPS fera-t-il   à Paris ?? ')).toBe('quel temps fera t il a paris')
    expect(normalizeUnroutedText('Quel temps fera t il a Paris')).toBe('quel temps fera t il a paris')
  })

  it('garde les jetons de masquage comme des mots — deux e-mails différents se regroupent', () => {
    expect(normalizeUnroutedText('écris à [email masqué]')).toBe(normalizeUnroutedText('Écris à [email masqué] !'))
  })
})

describe('#1949.23 — surfaceOf / languageOf', () => {
  it('la surface est la NATURE de l’écran déclaré, jamais son titre ni l’objet ouvert', () => {
    expect(surfaceOf({ kind: 'account', label: 'SOCOTEC', entityId: '11111111-1111-4111-8111-111111111111' })).toBe(
      'account',
    )
    expect(surfaceOf(null)).toBe('chat')
    expect(surfaceOf(undefined)).toBe('chat')
  })

  it('une langue inconnue vaut null, jamais « fr » par défaut', () => {
    expect(languageOf('fr')).toBe('fr')
    expect(languageOf('en')).toBe('en')
    expect(languageOf('xx')).toBeNull()
    expect(languageOf(undefined)).toBeNull()
  })
})

describe('#1949.23 — publishUnroutedGroups : le plancher s’applique à la LECTURE', () => {
  const group = (distinct: number) => ({
    textNormalized: `demande ${distinct}`,
    sample: `Demande ${distinct}`,
    occurrences: distinct + 3,
    distinctOccurrences: distinct,
    surfaces: ['chat'],
    categories: ['hors_perimetre'],
    languages: ['fr'],
  })

  it('au plancher, le groupe est publié avec son texte et ses comptes', () => {
    const report = publishUnroutedGroups([group(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)])
    expect(report.published).toEqual([
      {
        text: `Demande ${MIN_DISTINCT_SESSIONS_FOR_A_METRIC}`,
        occurrences: MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 3,
        distinctOccurrences: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
        surfaces: ['chat'],
        categories: ['hors_perimetre'],
        languages: ['fr'],
      },
    ])
    expect(report.withheldGroups).toBe(0)
  })

  it('sait dire NON — une occurrence distincte de moins, le TEXTE ne sort pas, seul le compte de groupes retenus', () => {
    const report = publishUnroutedGroups([group(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1)])
    expect(report.published).toEqual([])
    expect(report.withheldGroups).toBe(1)
    expect(JSON.stringify(report)).not.toContain('Demande')
  })

  it('le plancher porte sur les occurrences DISTINCTES — dix répétitions du même espace le même jour n’en font qu’une', () => {
    const report = publishUnroutedGroups([{ ...group(1), occurrences: 10 }])
    expect(report.published).toEqual([])
    expect(report.withheldGroups).toBe(1)
  })
})
