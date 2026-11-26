import { describe, expect, it } from 'vitest'
import {
  EMAIL_PATTERN_MIN_SUPPORT,
  learnEmailPattern,
  matchingEmailPatterns,
  renderEmailPattern,
  splitPersonName,
} from './email-estimate.js'
import { emailDomainOf } from './professional-email.js'

/**
 * #4016 L4.1 (décision Louis 11/10/2026) — l'e-mail DÉDUIT du motif de
 * l'entreprise. Ce fichier est la moitié pure : apprendre le motif sur les
 * adresses VÉRIFIÉES connues du domaine, puis l'appliquer. La vérification
 * (MX + SMTP, sans envoyer) et les portes RGPD vivent dans l'API.
 */
describe('splitPersonName', () => {
  it('sépare prénom et nom, sans accents ni ponctuation', () => {
    expect(splitPersonName('Élodie Martin-Durand')).toEqual({ first: 'elodie', last: 'martindurand' })
    expect(splitPersonName("  Jean  d'Ormesson ")).toEqual({ first: 'jean', last: 'dormesson' })
  })

  it('un nom seul n’a pas de nom de famille — aucune estimation possible', () => {
    expect(splitPersonName('Willy')).toBeNull()
    expect(splitPersonName('')).toBeNull()
    expect(splitPersonName(null)).toBeNull()
  })
})

describe('matchingEmailPatterns / renderEmailPattern', () => {
  it('reconnaît prenom.nom, p.nom, prenomnom…', () => {
    const name = { first: 'claire', last: 'perrin' }
    expect(matchingEmailPatterns('claire.perrin', name)).toEqual(['first.last'])
    expect(matchingEmailPatterns('c.perrin', name)).toEqual(['f.last'])
    expect(matchingEmailPatterns('cperrin', name)).toEqual(['flast'])
    expect(matchingEmailPatterns('perrin.claire', name)).toEqual(['last.first'])
    expect(matchingEmailPatterns('contact', name)).toEqual([])
  })

  it('applique un motif à un nom et un domaine', () => {
    expect(renderEmailPattern('first.last', { first: 'marc', last: 'olivier' }, 'acme.fr')).toBe('marc.olivier@acme.fr')
    expect(renderEmailPattern('f.last', { first: 'marc', last: 'olivier' }, 'acme.fr')).toBe('m.olivier@acme.fr')
  })
})

describe('learnEmailPattern — le motif s’apprend des adresses VÉRIFIÉES, et seulement d’elles', () => {
  const verified = (email: string, fullName: string) => ({ email, fullName, verified: true })

  it('apprend le motif dominant quand assez d’adresses vérifiées le portent', () => {
    const learned = learnEmailPattern([
      verified('claire.perrin@acme.fr', 'Claire Perrin'),
      verified('marc.olivier@acme.fr', 'Marc Olivier'),
      verified('s.leroy@acme.fr', 'Sophie Leroy'),
    ])
    expect(learned).toEqual({ pattern: 'first.last', domain: 'acme.fr', support: 2, samples: 3 })
  })

  it('sait dire NON : une seule adresse ne fait pas un motif', () => {
    expect(EMAIL_PATTERN_MIN_SUPPORT).toBe(2)
    expect(learnEmailPattern([verified('claire.perrin@acme.fr', 'Claire Perrin')])).toBeNull()
  })

  it('sait dire NON : deux motifs à égalité ne désignent rien', () => {
    expect(
      learnEmailPattern([
        verified('claire.perrin@acme.fr', 'Claire Perrin'),
        verified('marc.olivier@acme.fr', 'Marc Olivier'),
        verified('s.leroy@acme.fr', 'Sophie Leroy'),
        verified('p.durand@acme.fr', 'Paul Durand'),
      ]),
    ).toBeNull()
  })

  it('une adresse NON vérifiée n’enseigne rien — une estimation n’apprend jamais d’une estimation', () => {
    expect(
      learnEmailPattern([
        verified('claire.perrin@acme.fr', 'Claire Perrin'),
        { email: 'marc.olivier@acme.fr', fullName: 'Marc Olivier', verified: false },
      ]),
    ).toBeNull()
  })

  it('une messagerie grand public n’enseigne aucun motif d’entreprise', () => {
    expect(
      learnEmailPattern([
        verified('claire.perrin@gmail.com', 'Claire Perrin'),
        verified('marc.olivier@gmail.com', 'Marc Olivier'),
      ]),
    ).toBeNull()
  })

  it('le domaine retenu est celui des adresses vérifiées, le plus fréquent', () => {
    const learned = learnEmailPattern([
      verified('claire.perrin@acme.fr', 'Claire Perrin'),
      verified('marc.olivier@acme.fr', 'Marc Olivier'),
      verified('jean.dupont@acme-group.com', 'Jean Dupont'),
    ])
    expect(learned?.domain).toBe('acme.fr')
  })
})

describe('emailDomainOf', () => {
  it('rend le domaine en minuscules, ou null', () => {
    expect(emailDomainOf('Claire.Perrin@ACME.fr')).toBe('acme.fr')
    expect(emailDomainOf('pas-une-adresse')).toBeNull()
  })
})
