import { describe, expect, it } from 'vitest'
import {
  PROOF_CHANNELS,
  PROOF_STRENGTHS,
  TECHNICAL_COMPATIBILITY_MIN_SHARED,
  createProofSchema,
  isProofUsable,
  proofStrength,
  technicalCompatibilityObserved,
  testimonialProblems,
} from './proof.js'

/**
 * La capitalisation (PDF 2 §12).
 *
 * Le §12 pose une règle en une phrase, et c'est celle qui coûte le plus cher si
 * elle manque : « une preuve INTERNE n'apparaît JAMAIS dans un contenu destiné
 * au client. La fonction qui le vérifie est pure et testée. » Sortir chez un
 * prospect une preuve que le client d'origine n'a jamais accepté qu'on cite est
 * l'accident le plus coûteux du domaine — il se règle entre avocats.
 */
describe('isProofUsable', () => {
  const proof = (over: Record<string, unknown> = {}) => ({
    scope: 'client_safe' as const,
    strength: 'measured' as const,
    anonymised: false,
    accountId: 'a-1',
    ...over,
  })

  it('laisse sortir une preuve marquée montrable', () => {
    expect(isProofUsable(proof(), { audience: 'client', targetAccountId: 'a-2' }).usable).toBe(true)
  })

  it('REFUSE une preuve interne dans un contenu client', () => {
    const verdict = isProofUsable(proof({ scope: 'internal' }), { audience: 'client', targetAccountId: 'a-2' })
    expect(verdict.usable).toBe(false)
    expect(verdict.reason).toBeTruthy()
  })

  it('laisse une preuve interne servir en interne — c’est à ça qu’elle sert', () => {
    expect(isProofUsable(proof({ scope: 'internal' }), { audience: 'internal' }).usable).toBe(true)
  })

  it('refuse de citer un client À CE MÊME CLIENT sans anonymisation', () => {
    // Envoyer à ACME une preuve nominative faite chez ACME n'apprend rien à
    // ACME, et révèle qu'on cite ses voisins de la même façon.
    const verdict = isProofUsable(proof(), { audience: 'client', targetAccountId: 'a-1' })
    expect(verdict.usable).toBe(false)
  })

  it('…mais l’autorise si elle est anonymisée', () => {
    expect(isProofUsable(proof({ anonymised: true }), { audience: 'client', targetAccountId: 'a-1' }).usable).toBe(true)
  })
})

describe('proofStrength', () => {
  it('classe par ce qui la fonde, pas par ce qu’elle affirme', () => {
    expect(proofStrength({ hasFigure: true, hasClientSignoff: true })).toBe('measured')
    expect(proofStrength({ hasFigure: false, hasClientSignoff: true })).toBe('attested')
    expect(proofStrength({ hasFigure: false, hasClientSignoff: false })).toBe('declared')
  })

  it('un chiffre SANS validation client reste une déclaration', () => {
    // Un chiffre qu'on est seul à porter n'est pas une mesure — c'est une
    // affirmation avec un nombre dedans, et un client le sent.
    expect(proofStrength({ hasFigure: true, hasClientSignoff: false })).toBe('declared')
  })

  it('rend toujours une des trois valeurs', () => {
    for (const value of [
      proofStrength({ hasFigure: true, hasClientSignoff: true }),
      proofStrength({ hasFigure: false, hasClientSignoff: false }),
    ]) {
      expect(PROOF_STRENGTHS).toContain(value)
    }
  })
})

/**
 * #1612.1 / #1638.1 — la compatibilité TECHNIQUE observée entre une preuve et
 * l'environnement technique observé d'un compte (`AccountMarketContext.observed_stack`).
 *
 * La règle qui commande cette suite (doctrine c26/GA-259) : ce n'est ni un
 * pourcentage ni un verdict booléen. Sous le seuil, ou sans donnée, la
 * fonction ne dit JAMAIS « incompatible » — elle NOMME soit ce qu'elle a
 * trouvé (peu), soit qu'elle ne sait pas (l'environnement n'est pas connu).
 * Un booléen unique aurait confondu les deux, exactement ce que la doctrine
 * interdit pour un taux de couverture.
 */
describe('technicalCompatibilityObserved (#1612.1 / #1638.1)', () => {
  it('NOMME les technologies communes à partir de deux technologies partagées', () => {
    const verdict = technicalCompatibilityObserved(['Java', 'AWS', 'Kafka'], ['java', 'python', 'aws'])
    expect(verdict).toEqual({ kind: 'observed', shared: ['Java', 'AWS'] })
  })

  it('sait dire NON — une seule technologie commune ne produit aucun verdict positif', () => {
    // Le cas explicitement exigé : « rien ne s'affiche » à l'écran doit se
    // traduire ICI par un statut qui n'est PAS `observed`.
    const verdict = technicalCompatibilityObserved(['Java'], ['java', 'python'])
    expect(verdict.kind).not.toBe('observed')
    expect(verdict).toEqual({ kind: 'not_enough', shared: ['Java'] })
  })

  it('sait dire NON — un environnement technique ABSENT ne devient jamais « incompatible »', () => {
    // Le second cas explicitement exigé : l'absence de donnée se NOMME
    // (`unknown`), elle ne se lit jamais comme un refus.
    const verdict = technicalCompatibilityObserved(['Java', 'AWS'], undefined)
    expect(verdict).toEqual({ kind: 'unknown' })
    expect(verdict.kind).not.toBe('not_enough')
  })

  it('un compte COUVERT mais sans aucune techno observée reste une MESURE, pas une absence', () => {
    // `observed_stack: []` est un fait (le corpus a regardé et n'a rien vu),
    // pas la même chose qu'un compte non couvert (`undefined`). Les deux ne se
    // confondent jamais dans cette fonction.
    const verdict = technicalCompatibilityObserved(['Java', 'AWS'], [])
    expect(verdict).toEqual({ kind: 'not_enough', shared: [] })
  })

  it('une preuve sans aucune technologie déclarée ne peut jamais être « observée »', () => {
    expect(technicalCompatibilityObserved([], ['java', 'aws', 'kafka'])).toEqual({ kind: 'not_enough', shared: [] })
    expect(technicalCompatibilityObserved(undefined, ['java', 'aws', 'kafka'])).toEqual({
      kind: 'not_enough',
      shared: [],
    })
  })

  it('rapproche sans tenir compte de la casse ni des doublons', () => {
    const verdict = technicalCompatibilityObserved(['java', 'AWS', 'java'], ['JAVA', 'aws', 'Kafka'])
    expect(verdict).toEqual({ kind: 'observed', shared: ['java', 'AWS'] })
  })

  it('le seuil est exactement 2 — la constante et le comportement ne divergent jamais', () => {
    expect(TECHNICAL_COMPATIBILITY_MIN_SHARED).toBe(2)
  })
})

describe('createProofSchema — technologies', () => {
  it('accepte une liste de technologies, nettoyées de leurs espaces', () => {
    const parsed = createProofSchema.parse({ claim: 'Migration de 400 To en 6 mois', technologies: [' Java ', 'AWS'] })
    expect(parsed.technologies).toEqual(['Java', 'AWS'])
  })

  it('reste valide sans aucune technologie déclarée — ce n’est pas un champ obligatoire', () => {
    const parsed = createProofSchema.parse({ claim: 'Migration de 400 To en 6 mois' })
    expect(parsed.technologies).toBeUndefined()
  })

  it('refuse une technologie vide plutôt que de la garder silencieusement', () => {
    expect(() => createProofSchema.parse({ claim: 'x', technologies: [''] })).toThrow()
  })

  it('borne le nombre de technologies déclarées', () => {
    const technologies = Array.from({ length: 21 }, (_, index) => `techno-${index}`)
    expect(() => createProofSchema.parse({ claim: 'x', technologies })).toThrow()
  })
})

// #2424.4 — LA RÉFÉRENCE EXTERNE, les trois sous-champs qui manquaient : canaux
// autorisés, durée de validité accordée, échéance qui en découle.
describe('createProofSchema — la référence externe (#2424.4)', () => {
  it.each(PROOF_CHANNELS)('accepte le canal autorisé « %s »', channel => {
    const parsed = createProofSchema.parse({ claim: 'Migration de 400 To en 6 mois', allowed_channels: [channel] })
    expect(parsed.allowed_channels).toEqual([channel])
  })

  it('refuse un canal qui n’est pas dans la liste nommée', () => {
    expect(() => createProofSchema.parse({ claim: 'x', allowed_channels: ['whatsapp'] })).toThrow()
  })

  it('borne le nombre de canaux à la liste nommée', () => {
    const allowed_channels = [...PROOF_CHANNELS, PROOF_CHANNELS[0]]
    expect(() => createProofSchema.parse({ claim: 'x', allowed_channels })).toThrow()
  })

  it('reste valide sans référence externe déclarée — ce ne sont pas des champs obligatoires', () => {
    const parsed = createProofSchema.parse({ claim: 'Migration de 400 To en 6 mois' })
    expect(parsed.allowed_channels).toBeUndefined()
    expect(parsed.validity_duration_months).toBeUndefined()
    expect(parsed.valid_until).toBeUndefined()
  })

  it('refuse une durée de validité négative ou nulle — une durée accordée est TOUJOURS positive', () => {
    expect(() => createProofSchema.parse({ claim: 'x', validity_duration_months: 0 })).toThrow()
    expect(() => createProofSchema.parse({ claim: 'x', validity_duration_months: -3 })).toThrow()
  })

  it('accepte une durée de validité et une échéance distinctes', () => {
    const parsed = createProofSchema.parse({
      claim: 'Migration de 400 To en 6 mois',
      validity_duration_months: 12,
      valid_until: '2027-09-23T00:00:00.000Z',
    })
    expect(parsed.validity_duration_months).toBe(12)
    expect(parsed.valid_until).toBe('2027-09-23T00:00:00.000Z')
  })
})

describe('testimonialProblems', () => {
  it('refuse de publier un témoignage sans référence d’accord écrit', () => {
    expect(
      testimonialProblems({ publishable: true, consentReference: null, quote: 'Excellente équipe.' }),
    ).toHaveLength(1)
  })

  it('accepte un témoignage NON publiable sans accord — il reste interne', () => {
    expect(testimonialProblems({ publishable: false, consentReference: null, quote: 'Excellente équipe.' })).toEqual([])
  })

  it('refuse une citation vide', () => {
    expect(testimonialProblems({ publishable: false, consentReference: null, quote: '   ' }).length).toBeGreaterThan(0)
  })
})
