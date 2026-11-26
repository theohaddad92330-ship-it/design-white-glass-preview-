import { describe, expect, it } from 'vitest'
import { contactSourceSchema } from './contact.js'
import {
  SHARED_BASE_PROVENANCE_LABEL,
  SHARED_BASE_CONTACT_SOURCE,
  SHARED_FACT_ORIGINS,
  SHARED_COORDINATE_TABLES,
  SHARED_EMPLOYMENT_STATES,
  SHARED_FACT_STALE_AFTER_DAYS,
  SHARED_FACT_USER_FORBIDDEN_COLUMNS,
  sharedCompanyKey,
  sharedEmploymentOfLifecycle,
  sharedEmploymentReading,
  sharedFactOriginOfSource,
  toSharedCoordinates,
  toSharedPersonFact,
} from './shared-company-facts.js'

/**
 * #3989 (Louis 11/10/2026) — « si c'est Bellum qui les a sorties, on se doit de
 * les réutiliser ; si c'est nos utilisateurs, on garde tout mais on anonymise ».
 */
describe('#3989 — d’où vient un fait société, et ce qui en sort', () => {
  it('ce que Bellum a collecté (sources publiques, nos analyses) est « bellum »', () => {
    for (const source of ['pappers', 'brave_search', 'ia_reconstruction', 'apollo', 'ai_generated', 'linkedin_apify']) {
      expect({ source, origin: sharedFactOriginOfSource(source) }).toEqual({ source, origin: 'bellum' })
    }
  })

  it('ce qu’un utilisateur a apporté (saisie, import, CRM, réunion) est « user »', () => {
    for (const source of ['manual', 'import', 'crm', 'meeting']) {
      expect({ source, origin: sharedFactOriginOfSource(source) }).toEqual({ source, origin: 'user' })
    }
  })

  it('sait dire NON — la démo et une copie de la base commune ne repartent jamais vers elle', () => {
    expect(sharedFactOriginOfSource('demo')).toBeNull()
    expect(sharedFactOriginOfSource(SHARED_BASE_CONTACT_SOURCE)).toBeNull()
    expect(sharedFactOriginOfSource(null)).toBeNull()
    expect(sharedFactOriginOfSource('inconnue')).toBeNull()
  })

  it('chaque source de contact connue a une réponse écrite (bellum, user, ou jamais)', () => {
    const answered = contactSourceSchema.options.filter(
      source => sharedFactOriginOfSource(source) !== null || source === 'demo' || source === 'shared_base',
    )
    expect(answered).toEqual(contactSourceSchema.options)
  })

  it('la source de contact « shared_base » existe, en FIN de liste (GA-08)', () => {
    expect(contactSourceSchema.options.at(-1)).toBe(SHARED_BASE_CONTACT_SOURCE)
    expect(SHARED_BASE_PROVENANCE_LABEL).toBe('base commune')
  })

  it('la clé de société : le SIREN d’abord, sinon le domaine — jamais une raison sociale', () => {
    expect(sharedCompanyKey({ siren: '552 120 222', website: 'https://www.socgen.com' })).toBe('siren_552120222')
    expect(sharedCompanyKey({ siren: null, website: 'https://www.Societe-Generale.fr/fr/' })).toBe(
      'domain_societe_generale_fr',
    )
    expect(sharedCompanyKey({ siren: '12', website: '' })).toBeNull()
    expect(sharedCompanyKey({ siren: null, website: 'pas un site' })).toBeNull()
  })

  it('un fait collecté par Bellum sort TEL QUEL (nom, poste, profil)', () => {
    expect(
      toSharedPersonFact({
        source: 'pappers',
        fullName: ' Claire Perrin ',
        title: 'Directrice des SI',
        linkedinUrl: 'https://linkedin.com/in/cperrin',
      }),
    ).toEqual({
      origin: 'bellum',
      fullName: 'Claire Perrin',
      title: 'Directrice des SI',
      linkedinUrl: 'https://linkedin.com/in/cperrin',
    })
  })

  it('un fait apporté par un utilisateur sort ANONYMISÉ : le rôle reste, la personne part', () => {
    expect(
      toSharedPersonFact({
        source: 'import',
        fullName: 'Marc Lefèvre',
        title: 'Responsable achats IT',
        linkedinUrl: 'https://linkedin.com/in/mlefevre',
      }),
    ).toEqual({ origin: 'user', fullName: null, title: 'Responsable achats IT', linkedinUrl: null })
  })

  it('#3989 (Louis 15/10) — la base commune garde TOUTES les personnes : un poste qui porte une coordonnée est retiré, la personne reste', () => {
    expect(
      toSharedPersonFact({ source: 'manual', fullName: 'X Y', title: 'DSI — marc@acme.fr', linkedinUrl: null }),
    ).toEqual({ origin: 'user', fullName: null, title: null, linkedinUrl: null })
    expect(
      toSharedPersonFact({ source: 'crm', fullName: 'X Y', title: 'DSI 06 12 34 56 78', linkedinUrl: null }),
    ).toEqual({ origin: 'user', fullName: null, title: null, linkedinUrl: null })
    expect(toSharedPersonFact({ source: 'crm', fullName: 'X Y', title: '  ', linkedinUrl: null })).toEqual({
      origin: 'user',
      fullName: null,
      title: null,
      linkedinUrl: null,
    })
  })

  it('sait dire NON — la coordonnée, elle, ne sort JAMAIS : aucun fait « user » ne la porte, nulle part', () => {
    const fact = toSharedPersonFact({
      source: 'manual',
      fullName: 'X Y',
      title: 'DSI joignable au 06 12 34 56 78',
      linkedinUrl: 'https://linkedin.com/in/xy',
    })
    expect(Object.values(fact ?? {}).join('|')).not.toMatch(/@|06 12|linkedin\.com/)
  })

  it('sait dire NON — un fait Bellum sans nom complet, ou d’une source hors base, ne sort pas', () => {
    expect(toSharedPersonFact({ source: 'apollo', fullName: 'Séverine', title: 'DSI', linkedinUrl: null })).toBeNull()
    expect(toSharedPersonFact({ source: 'demo', fullName: 'Ana Démo', title: 'DSI', linkedinUrl: null })).toBeNull()
  })

  it('les colonnes qu’une ligne « user » ne porte jamais sont nommées', () => {
    expect(SHARED_FACT_ORIGINS).toEqual(['bellum', 'user'])
    expect(SHARED_FACT_USER_FORBIDDEN_COLUMNS).toEqual(['full_name', 'linkedin_url', 'person_fingerprints'])
  })
})

// #3989.7 — Louis 15/10/2026 : une coordonnée PRO trouvée ailleurs est réutilisée, la donnée seule.
describe('#3989.7 — ce qu’une fiche partage de ses coordonnées', () => {
  it('une fiche trouvée par Bellum partage son e-mail pro et son téléphone', () => {
    expect(
      toSharedCoordinates({ source: 'dropcontact', email: ' Claire.Perrin@Airbus.com ', phone: '+33 6 12 34 56 78' }),
    ).toEqual({ email: 'claire.perrin@airbus.com', phone: '+33 6 12 34 56 78' })
  })

  it('sait dire NON — saisie, import, CRM, démo, recopie de la base commune : rien ne sort', () => {
    for (const source of ['manual', 'import', 'crm', 'meeting', 'demo', 'shared_base', null]) {
      expect({ source, out: toSharedCoordinates({ source, email: 'a.b@airbus.com', phone: '0612345678' }) }).toEqual({
        source,
        out: null,
      })
    }
  })

  it('sait dire NON — une coordonnée corrigée à la main reste dans son espace', () => {
    expect(
      toSharedCoordinates({ source: 'apollo', email: 'a.b@airbus.com', phone: null, humanCoordinates: true }),
    ).toBeNull()
  })

  it('une boîte de webmail n’est pas une coordonnée pro ; un numéro trop court n’en est pas un', () => {
    expect(toSharedCoordinates({ source: 'hunter', email: 'claire@gmail.com', phone: '12' })).toBeNull()
    expect(toSharedCoordinates({ source: 'hunter', email: 'claire@gmail.com', phone: '01 23 45 67 89' })).toEqual({
      email: null,
      phone: '01 23 45 67 89',
    })
  })

  it('la table des coordonnées est nommée — GA-43 la relit', () => {
    expect(SHARED_COORDINATE_TABLES).toEqual(['shared_person_coordinates'])
  })
})

/**
 * #4286.15.b (Louis 19/10/2026, #4268) — les anciens se partagent, mais un ancien n'est JAMAIS
 * présenté comme actuel, et un fait périmé redevient INCONNU (on archive, on ne supprime pas).
 */
describe('#4286.15.b — un fait commun dit si la personne est actuelle, ancienne, ou inconnue', () => {
  const NOW = new Date('2026-10-22T08:00:00.000Z')
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

  it('vocabulaire fermé : actuel ou ancien — « inconnu » ne se stocke pas, il se LIT', () => {
    expect(SHARED_EMPLOYMENT_STATES).toEqual(['current', 'former'])
    expect(SHARED_FACT_STALE_AFTER_DAYS).toBeGreaterThan(0)
  })

  it('une fiche passée à l’historique (« a quitté l’entreprise ») est un ANCIEN ; toute autre, un actuel', () => {
    expect(sharedEmploymentOfLifecycle('historique')).toBe('former')
    expect(sharedEmploymentOfLifecycle('a_qualifier')).toBe('current')
    expect(sharedEmploymentOfLifecycle(null)).toBe('current')
  })

  it('lit un actuel revu récemment comme actuel', () => {
    expect(sharedEmploymentReading({ employmentState: 'current', lastSeenAt: daysAgo(10) }, NOW)).toBe('current')
  })

  it('sait dire NON — un ancien n’est jamais lu actuel, même revu hier', () => {
    expect(sharedEmploymentReading({ employmentState: 'former', lastSeenAt: daysAgo(1) }, NOW)).toBe('former')
  })

  it('sait dire NON — un fait non revu depuis le seuil redevient INCONNU, jamais « actuel »', () => {
    const stale = daysAgo(SHARED_FACT_STALE_AFTER_DAYS + 1)
    expect(sharedEmploymentReading({ employmentState: 'current', lastSeenAt: stale }, NOW)).toBe('unknown')
    expect(sharedEmploymentReading({ employmentState: 'current', lastSeenAt: null }, NOW)).toBe('unknown')
    expect(sharedEmploymentReading({ employmentState: 'surprise', lastSeenAt: daysAgo(1) }, NOW)).toBe('unknown')
  })

  it('un ancien périmé reste un ANCIEN — on ne le fait pas revenir en le perdant de vue', () => {
    const stale = daysAgo(SHARED_FACT_STALE_AFTER_DAYS + 30)
    expect(sharedEmploymentReading({ employmentState: 'former', lastSeenAt: stale }, NOW)).toBe('former')
  })
})
