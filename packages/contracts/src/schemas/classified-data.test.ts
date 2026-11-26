import { describe, expect, it } from 'vitest'

import { agentEnvelopeSchema } from './agent-envelope.js'
import {
  angleThemeTokens,
  classifiedDataSchema,
  computeAngleMatch,
  computeAngleMatchFromTokens,
  computeContactAccessibilityScore,
  computeContactBucket,
  computeContactPriorityReason,
  computeContactQualifStatus,
  computeContactRelevanceScore,
  CONTACT_SCORE_PASTILLE_CRITERIA,
  computeContactReachability,
  computeContactScore,
  computeContactScoreBreakdown,
  computeContactState,
  contactQualifLabel,
  contactScoreCoverage,
  contactScoreCriterionLabel,
  isContactActionnable,
  isContactIdentityComplete,
  CONTACT_QUALIF_STATUSES,
  CONTACT_SCORE_CRITERIA,
  CONTACT_SCORE_CRITERION_LABELS_EN,
  CONTACT_SCORE_CRITERION_LABELS_FR,
  CONTACT_SCORE_MAX,
  enrichedContactSchema,
} from './classified-data.js'
import type { SellerScoringContext } from './classified-data.js'

describe('computeAngleMatch (fit angle)', () => {
  const angles = [{ title: 'Usine logicielle DevOps' }, { title: 'Data chantier temps réel' }]

  it('matches a contact whose title shares a distinctive angle token', () => {
    expect(computeAngleMatch({ title: 'Directeur DevOps' }, angles)).toBe(true)
    expect(computeAngleMatch({ title: 'Responsable Data & BI' }, angles)).toBe(true)
  })

  it('is accent-insensitive (plain title matches an accented angle token)', () => {
    // Contact title has no accent, angle does — both normalise to "securite".
    expect(computeAngleMatch({ title: 'Directeur Securite' }, [{ title: 'Sécurité applicative' }])).toBe(true)
  })

  it('returns null (neutral, no penalty) when the title shares no angle theme', () => {
    expect(computeAngleMatch({ title: 'Directeur Marketing' }, angles)).toBeNull()
  })

  it('ignores generic stopwords so it does not over-match', () => {
    // "Plateforme"/"groupe" are stopwords → a "Directeur de Plateforme" is not a match.
    expect(computeAngleMatch({ title: 'Directeur de Plateforme' }, [{ title: 'Plateforme groupe' }])).toBeNull()
  })

  it('returns null when there are no angles (no signal)', () => {
    expect(computeAngleMatch({ title: 'Directeur DevOps' }, [])).toBeNull()
    expect(computeAngleMatch({ title: 'Directeur DevOps' }, null)).toBeNull()
  })

  it('matches short all-caps acronym themes (SAP / SOC / ERP) — regression', () => {
    // The old ≥4-char filter dropped these, so fit-angle never fired for exactly
    // the acronym themes the strategy prompt emits.
    expect(computeAngleMatch({ title: 'Responsable SOC' }, [{ title: 'Cybersécurité / SOC managé' }])).toBe(true)
    expect(computeAngleMatch({ title: 'Consultant SAP' }, [{ title: 'SAP S/4HANA' }])).toBe(true)
    expect(computeAngleMatch({ title: 'Chef de projet ERP' }, [{ title: 'Modernisation ERP' }])).toBe(true)
  })

  it('prebuilt-token path matches the convenience wrapper', () => {
    const angles = [{ title: 'Usine logicielle DevOps' }, { title: 'Cybersécurité / SOC' }]
    const tokens = angleThemeTokens(angles)
    expect(computeAngleMatchFromTokens({ title: 'Directeur DevOps' }, tokens)).toBe(true)
    expect(computeAngleMatchFromTokens({ title: 'Analyste SOC' }, tokens)).toBe(true)
    expect(computeAngleMatchFromTokens({ title: 'Directeur Marketing' }, tokens)).toBeNull()
    expect(computeAngleMatchFromTokens({ title: 'X' }, angleThemeTokens([]))).toBeNull()
  })

  it('feeds the /100 score: a fitting contact outscores the same contact without an angle', () => {
    const base = { title: 'Directeur DevOps', role: 'technical', source: 'apollo' } as const
    const withAngle = computeContactScore({ ...base, angleMatch: computeAngleMatch(base, angles) })
    const neutral = computeContactScore({ ...base, angleMatch: computeAngleMatch(base, []) })
    // With angles the fit criterion is evaluated and earns 25/25 (lot 758 : « rôle face à
    // votre offre »); with no angles at all it is not evaluated, so it leaves the
    // denominator instead of scoring a neutral middle. The matching contact still ranks higher — on merit, not on a gap.
    expect(withAngle).toBeGreaterThan(neutral)
    const fitCrit = (angleMatch: boolean | null) =>
      computeContactScoreBreakdown({ ...base, angleMatch }).find(c => c.key === 'angleFit')!
    expect(fitCrit(computeAngleMatch(base, angles))).toMatchObject({ points: 25, evaluated: true })
    expect(fitCrit(computeAngleMatch(base, []))).toMatchObject({ points: 0, evaluated: false })
  })
})

describe('computeContactScore (/100)', () => {
  it('a verified-email technical C-level decider scores near the top', () => {
    const s = computeContactScore({
      title: 'Chief Technology Officer',
      role: 'technical',
      email: 'a@b.com',
      emailVerified: true,
      source: 'apollo',
    })
    // Lot 758 — read over the criteria we could evaluate: 28 (technical) + 15 (c_level)
    // + 10 (apollo) = 53 out of 55 evaluable (proximité + offre need a context this
    // input doesn't carry). The verified e-mail no longer counts: it is a pastille.
    expect(s).toBe(96)
  })

  it('a gatekeeper with only LinkedIn from a weak source scores low', () => {
    const s = computeContactScore({
      title: 'Acheteur',
      role: 'blocker',
      linkedinUrl: 'https://linkedin.com/in/x',
      source: 'ia_reconstruction',
    })
    // 8 (blocker) + 2 (operationnel) + 3 (source) = 13 / 55 evaluable → 24 (lot 758 :
    // the LinkedIn profile is a reachability pastille, not points).
    // Still deep in the "secondaire" band: dropping the invented neutral middle
    // lifts nobody out of a genuinely weak profile.
    expect(s).toBe(24)
  })

  it('is bounded to 0..100 and defaults source to 8 when unknown', () => {
    const s = computeContactScore({ title: 'DSI', role: 'economic', email: 'a@b', emailVerified: true })
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(100)
  })
})

describe('computeContactScoreBreakdown (explainable /100, 03_BUSINESS_RULES §3)', () => {
  const strong = {
    title: 'Chief Technology Officer',
    role: 'technical',
    email: 'a@b.com',
    emailVerified: true,
    source: 'apollo',
    perimeterTier: 'P1',
    angleMatch: true,
  } as const

  it('exposes the 5 relevance criteria in order — reachability is NOT one of them (lot 758)', () => {
    const bd = computeContactScoreBreakdown(strong)
    expect(bd.map(c => c.key)).toEqual(['role', 'proximity', 'seniority', 'angleFit', 'freshness'])
    expect(bd.map(c => c.max)).toEqual([30, 20, 15, 25, 10])
    expect(CONTACT_SCORE_MAX).toBe(100)
    // GA-08 : la clé reste NOMMÉE dans la taxonomie, déclarée pastille — jamais notée.
    expect(CONTACT_SCORE_CRITERIA.map(c => c.key)).toContain('accessibility')
    expect(CONTACT_SCORE_PASTILLE_CRITERIA).toEqual(['accessibility'])
    for (const c of bd) {
      expect(c.points).toBeGreaterThanOrEqual(0)
      expect(c.points).toBeLessThanOrEqual(c.max)
    }
  })

  it('the score equals the sum of the breakdown points (number and justification never drift)', () => {
    const bd = computeContactScoreBreakdown(strong)
    expect(bd.every(c => c.evaluated)).toBe(true)
    expect(bd.reduce((s, c) => s + c.points, 0)).toBe(computeContactScore(strong))
    // 28 technical + 25 offre/angle + 20 P1 + 15 c_level + 10 apollo = 98.
    expect(computeContactScore(strong)).toBe(98)
  })

  it('a criterion with no account context is NOT evaluated — no invented points, no penalty', () => {
    // Same contact, minus the account cartography (no perimeter tier, no angle).
    const { perimeterTier: _t, angleMatch: _a, ...noContext } = strong
    const bd = computeContactScoreBreakdown(noContext)
    const byKey = Object.fromEntries(bd.map(c => [c.key, c]))
    // proximité + fit-angle are the two context-dependent criteria → unevaluated.
    expect(byKey.proximity.evaluated).toBe(false)
    expect(byKey.proximity.points).toBe(0)
    expect(byKey.proximity.proof).toBe('périmètre non rattaché')
    expect(byKey.angleFit.evaluated).toBe(false)
    expect(byKey.angleFit.points).toBe(0)
    expect(byKey.angleFit.proof).toBe('angle non évalué')
    // The other four stay evaluated — their absence would be a fact, not a gap.
    for (const key of ['role', 'seniority', 'freshness']) {
      expect(byKey[key].evaluated).toBe(true)
    }
  })

  it('coverage exposes the real denominator the /100 is read over', () => {
    const { perimeterTier: _t, angleMatch: _a, ...noContext } = strong
    const cov = contactScoreCoverage(computeContactScoreBreakdown(noContext))
    // 100 - 25 (offre) - 20 (proximité) = 55 evaluable points.
    expect(cov.evaluatedMax).toBe(55)
    expect(cov.unevaluated).toEqual(['proximity', 'angleFit'])
    // 28 + 15 + 10 = 53 obtained out of 55 evaluable.
    expect(cov.points).toBe(53)
    expect(computeContactScore(noContext)).toBe(Math.round((53 * 100) / 55)) // 96
  })

  it('a missing input never reads as a bad input: the same contact does not lose points for absent context', () => {
    const { perimeterTier: _t, angleMatch: _a, ...noContext } = strong
    // Under the old neutral-middle grid this scored 83 (98 - 10 - 5): the contact
    // was docked 15 points because the ACCOUNT lacked a cartography.
    expect(computeContactScore(noContext)).toBeGreaterThan(83)
    // …and an out-of-perimeter contact, which IS evaluated, still scores below it.
    expect(computeContactScore({ ...noContext, entityRelevance: 'out_of_sector' })).toBeLessThan(
      computeContactScore(noContext),
    )
  })

  it('an evaluated zero still costs points — absence-as-fact is not absence-of-knowledge', () => {
    const bare = Object.fromEntries(computeContactScoreBreakdown({ title: 'Analyste' }).map(c => [c.key, c]))
    // Lot 758 — reachability left the grid: no channel costs nothing here.
    expect(bare.accessibility).toBeUndefined()
    expect(bare.role.evaluated).toBe(true)
    expect(bare.role.points).toBe(0)
  })

  it("ne pas connaître le poste de quelqu'un ne le fait JAMAIS remonter", () => {
    // La garde qui a fait revenir sur la première version du correctif « titre
    // inconnu ». En sortant l'axe séniorité du dénominateur, un contact SANS
    // titre marquait 45 quand le même contact intitulé « Analyste » marquait 39 :
    // le dénominateur rétrécit plus vite que le numérateur, et l'ignorance
    // devenait un avantage de classement.
    const base = { email: 'a@b.fr', emailVerified: true, source: 'apollo' }
    expect(computeContactScore({ ...base, title: '' })).toBeLessThan(
      computeContactScore({ ...base, title: 'Analyste' }),
    )
  })

  it("un titre illisible cesse d'affirmer un rang — sans quitter le dénominateur", () => {
    const axes = Object.fromEntries(computeContactScoreBreakdown({ title: '—' }).map(c => [c.key, c]))
    expect(axes.seniority?.evaluated).not.toBe(false)
    expect(axes.seniority?.points).toBe(0)
    expect(axes.seniority?.proof).not.toContain('Opérationnel')
  })

  it('the coverage denominator never collapses below the four intrinsic criteria', () => {
    // Only proximité (20) + offre (25) can ever be unevaluated, so the score is always
    // read over at least 55 points (rôle + séniorité + fraîcheur) — never one criterion.
    const cov = contactScoreCoverage(computeContactScoreBreakdown({}))
    expect(cov.evaluatedMax).toBeGreaterThanOrEqual(55)
  })

  it('every criterion carries a proof tying the points to a real signal', () => {
    const proofs = Object.fromEntries(computeContactScoreBreakdown(strong).map(c => [c.key, c.proof]))
    expect(proofs.role).toContain('technique')
    expect(proofs.proximity).toContain('P1')
    expect(proofs.accessibility).toBeUndefined()
    // La preuve de fraîcheur nomme la CAPACITÉ de la source, jamais son éditeur
    // — voir le test dédié plus bas.
    expect(proofs.freshness).toBe('annuaire professionnel vérifié')
    // A criterion that can't be evaluated scores 0 with a documented proof (no invented bonus).
    const bare = Object.fromEntries(computeContactScoreBreakdown({ title: 'Analyste' }).map(c => [c.key, c]))
    expect(bare.role.points).toBe(0)
    expect(bare.role.proof).toBe('rôle non déterminé')
  })

  it('profileData influences the score (§9): a cyber ESN values a technical decider more', () => {
    const rssi = { title: 'RSSI', role: 'technical', source: 'apollo' } as const
    const cyberSeller: SellerScoringContext = { priorityRoles: ['technical'], focusThemes: ['cyber', 'rssi'] }
    expect(computeContactScore(rssi, cyberSeller)).toBeGreaterThan(computeContactScore(rssi))
    const roleCrit = computeContactScoreBreakdown(rssi, cyberSeller).find(c => c.key === 'role')!
    expect(roleCrit.proof).toContain('profil')
  })

  it('the §9 boost never exceeds the /30 role cap', () => {
    const econ = { title: 'CFO', role: 'economic', source: 'apollo' } as const
    const seller: SellerScoringContext = { priorityRoles: ['economic'] }
    const roleCrit = computeContactScoreBreakdown(econ, seller).find(c => c.key === 'role')!
    expect(roleCrit.points).toBe(30)
  })

  it('a seller focus theme lifts fit-angle from the title even without an explicit angleMatch', () => {
    const contact = { title: 'Responsable Cybersécurité', role: 'technical', source: 'apollo' } as const
    const base = computeContactScoreBreakdown(contact).find(c => c.key === 'angleFit')!.points
    const lifted = computeContactScoreBreakdown(contact, { focusThemes: ['cybersecurite'] }).find(
      c => c.key === 'angleFit',
    )!.points
    expect(base).toBe(0) // not evaluated — no angle, no seller theme to match against
    expect(lifted).toBe(25)
  })

  it('lot 758 — pour une ESN data, un Head of Data passe DEVANT un chef de l’architecture (Julien)', () => {
    // Même rôle MEDDIC, même source, même joignabilité : seul le rôle face à l'offre les sépare.
    const dataEsn: SellerScoringContext = { focusThemes: ['Data & IA'] }
    const headOfData = { title: 'Head of Data', role: 'technical', source: 'apollo', email: 'a@x.fr' } as const
    const architect = {
      title: "Directeur de l'architecture",
      role: 'technical',
      source: 'apollo',
      email: 'b@x.fr',
      emailVerified: true,
    } as const
    expect(computeContactScore(headOfData, dataEsn)).toBeGreaterThan(computeContactScore(architect, dataEsn))
    const offer = computeContactScoreBreakdown(architect, dataEsn).find(c => c.key === 'angleFit')!
    // L'offre connue + un titre connu = un fait mesuré : 0, NOMMÉ, et dans le dénominateur.
    expect(offer).toMatchObject({ points: 0, evaluated: true, proof: 'hors de ton offre' })
  })

  it('lot 758 — un RSSI reste dans l’offre d’une ESN cyber (familles de métier équivalentes)', () => {
    const cyber: SellerScoringContext = { focusThemes: ['cybersécurité'] }
    const offer = computeContactScoreBreakdown({ title: 'RSSI', role: 'technical' }, cyber).find(
      c => c.key === 'angleFit',
    )!
    expect(offer.points).toBe(25)
    const ai = computeContactScoreBreakdown({ title: 'Head of AI' }, { focusThemes: ['Data & IA'] }).find(
      c => c.key === 'angleFit',
    )!
    expect(ai.points).toBe(25)
  })

  it('lot 758 — la joignabilité ne change JAMAIS le score : deux contacts identiques hors canal', () => {
    const base = { title: 'Head of Data', role: 'technical', source: 'apollo' } as const
    const none = computeContactScore(base)
    expect(computeContactScore({ ...base, email: 'a@x.fr', emailVerified: true })).toBe(none)
    expect(computeContactScore({ ...base, linkedinUrl: 'https://linkedin.com/in/x' })).toBe(none)
    expect(computeContactScore({ ...base, phone: '+33 1 00 00 00 00' })).toBe(none)
  })

  it('lot 758 — la pastille de joignabilité nomme le meilleur canal, et rien sans canal', () => {
    expect(computeContactReachability({ email: 'a@x.fr', emailVerified: true })).toBe('verified_email')
    expect(computeContactReachability({ email: 'a@x.fr', phone: '+33' })).toBe('email')
    expect(computeContactReachability({ phone: '+33 1' })).toBe('phone')
    expect(computeContactReachability({ linkedinUrl: 'https://linkedin.com/in/x' })).toBe('professional_profile')
    expect(computeContactReachability({ email: '  ' })).toBeNull()
    expect(computeContactReachability({})).toBeNull()
  })

  it('an empty / omitted seller context is neutral (no live score shift)', () => {
    expect(computeContactScore(strong, {})).toBe(computeContactScore(strong))
    expect(computeContactScore(strong, undefined)).toBe(computeContactScore(strong))
  })

  it('criterion labels have FR + EN parity for all 5 keys', () => {
    for (const { key } of CONTACT_SCORE_CRITERIA) {
      expect(CONTACT_SCORE_CRITERION_LABELS_FR[key]).toBeTruthy()
      expect(CONTACT_SCORE_CRITERION_LABELS_EN[key]).toBeTruthy()
      expect(contactScoreCriterionLabel(key, 'fr')).toBe(CONTACT_SCORE_CRITERION_LABELS_FR[key])
      expect(contactScoreCriterionLabel(key, 'en')).toBe(CONTACT_SCORE_CRITERION_LABELS_EN[key])
    }
    expect(Object.keys(CONTACT_SCORE_CRITERION_LABELS_EN).sort()).toEqual(
      Object.keys(CONTACT_SCORE_CRITERION_LABELS_FR).sort(),
    )
  })
})

describe('computeContactRelevanceScore + computeContactAccessibilityScore (S3b split)', () => {
  it('pertinence = rôle + proximité + hiérarchie + fit angle, over its evaluable share', () => {
    // No account context → proximité + fit angle unevaluated, denominator 30+15=45.
    // economic 30 + c_level 15 = 45/45 → 100 (everything we could measure is maxed)
    expect(computeContactRelevanceScore({ title: 'Directeur Général', role: 'economic' })).toBe(100)
    // user 16 + operationnel 2 = 18/45 → round(40)
    expect(computeContactRelevanceScore({ title: 'Analyste', role: 'user' })).toBe(40)
    // With the context present the denominator is the full 90 (lot 758 : offre /25).
    expect(
      computeContactRelevanceScore({
        title: 'Directeur Général',
        role: 'economic',
        perimeterTier: 'P1',
        angleMatch: true,
      }),
    ).toBe(100)
  })

  it('proximité périmètre lifts a contact sitting in a P1 zone', () => {
    const base = { title: 'DSI', role: 'technical' }
    expect(computeContactRelevanceScore({ ...base, perimeterTier: 'P1' })).toBeGreaterThan(
      computeContactRelevanceScore(base),
    )
    // out-of-sector entity → proximité 0
    expect(computeContactRelevanceScore({ ...base, entityRelevance: 'out_of_sector' })).toBeLessThan(
      computeContactRelevanceScore(base),
    )
  })

  it('accessibilité = accès + fraîcheur, /25 → /100', () => {
    // verified email 15 + apollo 10 = 25/25 → 100
    expect(computeContactAccessibilityScore({ email: 'a@b', emailVerified: true, source: 'apollo' })).toBe(100)
    // no channel + unknown source (default 5) = 5/25 → 20
    expect(computeContactAccessibilityScore({})).toBe(20)
  })

  it('the two scores are independent axes (a strong profile can be unreachable)', () => {
    const c = { title: 'DSI', role: 'economic' } // no email/linkedin
    expect(computeContactRelevanceScore(c)).toBeGreaterThan(70)
    expect(computeContactAccessibilityScore(c)).toBeLessThan(30)
  })

  it('#20: employerMismatch collapses fraîcheur — a périmé Apollo no longer scores a flat 10', () => {
    const fresh = { email: 'a@b', emailVerified: true, source: 'apollo' }
    const stale = { ...fresh, employerMismatch: true }
    // verified email 15 + apollo 10 = 25/25 → 100 ; mismatch → fraîcheur 1 → (15+1)/25 = 64
    expect(computeContactAccessibilityScore(fresh)).toBe(100)
    expect(computeContactAccessibilityScore(stale)).toBe(64)
    // and it drags the /100 down too (not just the qualif status)
    expect(computeContactScore(stale)).toBeLessThan(computeContactScore(fresh))
  })
})

describe('computeContactQualifStatus (S5)', () => {
  it('priorité immédiate = real target, reachable', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b' })).toBe('priorite_immediate')
  })

  it('à enrichir = real target but no email/phone (worth enriching)', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic' })).toBe('a_enrichir')
  })

  it('autre angle = influenceur (valid alternative entry)', () => {
    expect(computeContactQualifStatus({ title: 'Manager', role: 'influencer' })).toBe('autre_angle')
  })

  it('à vérifier = ambiguous / low-relevance', () => {
    expect(computeContactQualifStatus({ title: 'Analyste', role: '' })).toBe('a_verifier')
  })

  it('bruit = no title', () => {
    expect(computeContactQualifStatus({ title: '', role: 'economic' })).toBe('bruit')
  })

  it('hors scope = contact on an out-of-sector entity (S2 gate)', () => {
    expect(
      computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b', entityRelevance: 'out_of_sector' }),
    ).toBe('hors_scope')
  })

  it('faux positif = Apollo current-employer mismatch (deck RISQUE)', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b', employerMismatch: true })).toBe(
      'faux_positif',
    )
  })

  // ── Retour Thales : 3 nouveaux statuts (achats / sponsor / entité inconnue) ──
  it('achats = procurement role (la porte achats)', () => {
    expect(computeContactQualifStatus({ title: 'Acheteur IT', role: 'procurement', email: 'a@b' })).toBe('achats')
    expect(computeContactQualifStatus({ title: 'Buyer', role: 'purchasing' })).toBe('achats')
  })

  it('sponsor = champion / relais interne', () => {
    expect(computeContactQualifStatus({ title: 'Chef de projet', role: 'champion', email: 'a@b' })).toBe('sponsor')
  })

  it('entité inconnue = real target but entity explicitly blank (Thales base à re-cibler)', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b', entity: '' })).toBe(
      'entite_inconnue',
    )
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b', entity: 'non précisé' })).toBe(
      'entite_inconnue',
    )
  })

  it('an omitted entity key keeps the old behaviour (no false entité inconnue)', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b' })).toBe('priorite_immediate')
  })

  it('a known entity does NOT trip entité inconnue', () => {
    expect(computeContactQualifStatus({ title: 'DSI', role: 'economic', email: 'a@b', entity: 'ITIM' })).toBe(
      'priorite_immediate',
    )
  })

  it('labels are French and cover every status', () => {
    for (const s of CONTACT_QUALIF_STATUSES) expect(contactQualifLabel(s).length).toBeGreaterThan(0)
    expect(contactQualifLabel('priorite_immediate')).toBe('À contacter maintenant')
    expect(contactQualifLabel('entite_inconnue')).toBe('Entité inconnue')
    expect(contactQualifLabel('achats')).toBe('Achats')
  })
})

/**
 * Les preuves du /100 atteignent l'écran client BRUTES.
 *
 * `computeContactScoreBreakdown` est recalculé à chaque lecture par
 * `ContactsService.scoreContacts` (`contact_score_breakdown` n'est PAS une
 * colonne), voyage dans la réponse `GET /contacts`, et `ContactScoreBreakdown`
 * rend `{crit.proof}` tel quel sous chaque critère. Ce que ce fichier écrit ici,
 * un commercial le lit sur la fiche contact.
 *
 * Donc la doctrine du 02/08/2026 s'y applique : on nomme la CAPACITÉ, pas
 * l'éditeur. « Apollo (annuaire vérifié) » et « registre public Pappers »
 * s'affichaient hors de Réglages › Intégrations — le seul écran où nommer un
 * éditeur est légitime, parce que c'est là que l'utilisateur autorise l'accès.
 */
describe('les preuves du /100 nomment la capacité, jamais l’éditeur (doctrine 02/08)', () => {
  /** Toutes les valeurs de `source` que le pipeline écrit, plus une inconnue. */
  const SOURCES = ['apollo', 'manual', 'pappers', 'brave_search', 'ia_reconstruction', 'un_fournisseur_inconnu']
  /** Les fournisseurs de données que l'application n'a pas à nommer. */
  const PROVIDERS = ['Apollo', 'Pappers', 'Firecrawl', 'Brave', 'Serper', 'Tavily', 'SalesQL', 'Dropcontact', 'Lusha']

  it('LIT quelque chose — le corpus des preuves n’est pas vide', () => {
    // Sans ce filet, une signature changée rendrait le test vert sur du vide.
    const proofs = SOURCES.flatMap(source => computeContactScoreBreakdown({ title: 'DSI', source }).map(c => c.proof))
    expect(proofs.length).toBeGreaterThanOrEqual(SOURCES.length * 5)
    expect(proofs.every(p => p.length > 0)).toBe(true)
  })

  it.each(SOURCES)('« %s » : aucune preuve ne nomme un fournisseur', source => {
    const proofs = [
      ...computeContactScoreBreakdown({
        title: 'DSI',
        role: 'technical',
        email: 'a@b.com',
        emailVerified: true,
        source,
      }),
      ...computeContactScoreBreakdown({ title: 'Analyste', source, employerMismatch: true }),
      ...computeContactScoreBreakdown({ title: 'CTO', source, perimeterTier: 'P1', angleMatch: true }),
    ].map(c => c.proof)
    const offenders = proofs.filter(p => PROVIDERS.some(v => p.includes(v)))
    expect(offenders).toEqual([])
  })

  it('dit ce que la source APPORTE, pas qui la vend', () => {
    const proofOf = (source: string) =>
      computeContactScoreBreakdown({ title: 'DSI', source }).find(c => c.key === 'freshness')!.proof
    expect(proofOf('apollo')).toBe('annuaire professionnel vérifié')
    expect(proofOf('pappers')).toBe('registre public des entreprises')
    expect(proofOf('brave_search')).toBe('recherche web')
    expect(proofOf('manual')).toBe('saisie manuelle')
    // Une source inconnue reste inconnue : jamais un nom deviné.
    expect(proofOf('un_fournisseur_inconnu')).toBe('source non précisée')
  })
})

/**
 * ⚠️ EXCEPTION NOMMÉE ET BORNÉE — cette ligne-ci n'atteint PAS l'écran client.
 *
 * `computeContactPriorityReason` n'a qu'un seul rendu : le back-office
 * OPÉRATEUR (`apps/dashboard-manager`, `analysis/[id]/page.tsx`), où l'équipe
 * Bellum lit le rendement fournisseur par fournisseur. Aucun écran client ne
 * l'appelle, et la garde GA-44 vérifie que ça reste vrai (« le back-office
 * opérateur est la seule sortie »). Le jour où `apps/web` l'importe, la garde
 * passe au rouge et cette exception se re-discute.
 */
describe('computeContactPriorityReason', () => {
  it('builds a one-line reason from role · tier · contactability · source', () => {
    const r = computeContactPriorityReason({
      title: 'CTO',
      role: 'technical',
      email: 'a@b.com',
      emailVerified: true,
      source: 'apollo',
    })
    expect(r).toContain('décideur technique')
    expect(r).toContain('c-level')
    expect(r).toContain('email vérifié')
    expect(r).toContain('Apollo')
  })
})

describe('computeContactBucket', () => {
  it.each([
    [{ title: '', role: 'sponsor', influenceLevel: 'decision-maker' }, 'bruit'], // no title
    [{ title: 'Stagiaire Data Science', role: 'technical' }, 'bruit'], // intern excluded (ACCOUNT MAPPING)
    [{ title: 'Alternant DSI', role: 'technical' }, 'bruit'], // alternant excluded
    [{ title: 'DSI', role: '', influenceLevel: '' }, 'a_verifier'],
    [{ title: 'DSI', role: 'sponsor' }, 'decideur'],
    [{ title: 'CTO', role: 'technical' }, 'decideur'],
    [{ title: 'CFO', role: 'economic' }, 'decideur'],
    [{ title: 'End user', role: 'user' }, 'operationnel'],
    [{ title: 'Architect', influenceLevel: 'decision-maker' }, 'decideur'],
    [{ title: 'Head of IT', role: 'champion' }, 'sponsor'],
    [{ title: 'Analyst', role: 'operational' }, 'operationnel'],
    [{ title: 'Buyer', role: 'purchasing' }, 'operationnel'],
    [{ title: 'Advisor', role: 'influencer' }, 'influenceur'],
    [{ title: 'Legal', role: 'blocker' }, 'a_verifier'],
  ])('%o → %s', (input, expected) => {
    expect(computeContactBucket(input)).toBe(expected)
  })
})

describe('enrichedContactSchema', () => {
  it('accepts a minimal contact', () => {
    const result = enrichedContactSchema.parse({})
    expect(result).toEqual({})
  })

  it('accepts the typed fields with camelCase English keys', () => {
    const result = enrichedContactSchema.parse({
      fullName: 'Jean Dupont',
      title: 'DSI',
      role: 'sponsor',
      priority: 1,
      whyContact: 'Sponsor budget IT',
      linkedinUrl: 'https://linkedin.com/in/jdoe',
      reportingTo: 'CEO',
      influenceLevel: 'decision-maker',
      personalizedHook: 'A présenté à TechDay 2026',
    })
    expect(result.fullName).toBe('Jean Dupont')
    expect(result.priority).toBe(1)
    expect(result.influenceLevel).toBe('decision-maker')
  })

  it('rejects priority out of [0, 5]', () => {
    expect(() => enrichedContactSchema.parse({ priority: 6 })).toThrow()
    expect(() => enrichedContactSchema.parse({ priority: -1 })).toThrow()
  })

  it('preserves unknown fields via passthrough', () => {
    const result = enrichedContactSchema.parse({
      fullName: 'Jean',
      apolloPersonId: 'apl_xxx',
    }) as Record<string, unknown>
    expect(result.apolloPersonId).toBe('apl_xxx')
  })
})

describe('classifiedDataSchema', () => {
  it('accepts a minimal payload', () => {
    expect(classifiedDataSchema.parse({})).toEqual({})
  })

  it('accepts a fully populated payload with camelCase English keys', () => {
    const result = classifiedDataSchema.parse({
      contacts: [{ fullName: 'Jean', priority: 1 }],
      orgChart: [{ entity: 'SNCF SA', level: 'groupe' }],
      decisionChain: { description: 'DSI seul décide' },
      uncoveredZones: [{ zone: 'BU Logistique', importance: 'critique' }],
      stakeholderMap: [{ fullName: 'Jean', stance: 'advocate' }],
      approachOrder: [{ step: 1, contact: 'Jean' }],
    })
    expect(result.contacts?.[0].fullName).toBe('Jean')
    expect(result.orgChart).toHaveLength(1)
    expect(result.decisionChain).toEqual({ description: 'DSI seul décide' })
  })

  it('still parses (via passthrough) the legacy `approach_order` and `organigramme` keys', () => {
    // The Python prompt + Pydantic aliases still emit `approach_order` and
    // `organigramme`. The .passthrough() lets the payload parse, but the
    // typed `approachOrder` / `orgChart` accessors stay undefined until a
    // follow-up renames the wire format.
    const result = classifiedDataSchema.parse({
      approach_order: [{ step: 1, contact: 'Jean' }],
      organigramme: [{ entity: 'SNCF SA', level: 'groupe' }],
    }) as Record<string, unknown>
    expect(result.approach_order).toEqual([{ step: 1, contact: 'Jean' }])
    expect(result.organigramme).toEqual([{ entity: 'SNCF SA', level: 'groupe' }])
    const typed = result as { approachOrder?: unknown; orgChart?: unknown }
    expect(typed.approachOrder).toBeUndefined()
    expect(typed.orgChart).toBeUndefined()
  })

  it('composes with agentEnvelopeSchema for a typed envelope', () => {
    const envelopeSchema = agentEnvelopeSchema(classifiedDataSchema)
    const result = envelopeSchema.parse({
      status: 'success',
      data: { contacts: [{ fullName: 'Jean', priority: 1 }] },
      error: null,
      meta: {
        agent_name: 'classifier',
        agent_version: '1.0.0',
        correlation_id: 'cid',
        started_at: '2026-05-26T10:00:00.000Z',
        finished_at: '2026-05-26T10:00:01.000Z',
        duration_ms: 1000,
      },
    })
    expect(result.data?.contacts?.[0].fullName).toBe('Jean')
  })
})

describe('contact state machine (Théo p.11/p.15)', () => {
  it('a first-name-only contact is NOT identity-complete nor actionnable', () => {
    const c = { fullName: 'Jean', role: 'economic', email: 'jean@sg.com' }
    expect(isContactIdentityComplete(c)).toBe(false)
    expect(isContactActionnable(c)).toBe(false)
    // Even with an email + role, a prénom-seul stays "enrichi", never actionnable.
    expect(computeContactState(c)).toBe('enrichi')
  })

  it('a full name needs an anchor (title/entity/linkedin) to be identity-complete', () => {
    expect(isContactIdentityComplete({ fullName: 'Jean Dupont' })).toBe(false)
    expect(isContactIdentityComplete({ fullName: 'Jean Dupont', title: 'DSI' })).toBe(true)
    expect(isContactIdentityComplete({ fullName: 'Jean Dupont', entity: 'Boursorama' })).toBe(true)
  })

  it('climbs the ladder détecté → identité → qualifié → actionnable', () => {
    expect(computeContactState({ fullName: 'Jean' })).toBe('detecte')
    expect(computeContactState({ fullName: 'Jean Dupont', title: 'DSI' })).toBe('identite_verifiee')
    expect(computeContactState({ fullName: 'Jean Dupont', title: 'DSI', role: 'technical' })).toBe('qualifie')
    const actionnable = { fullName: 'Jean Dupont', title: 'DSI', role: 'technical', email: 'j@sg.com' }
    expect(computeContactState(actionnable)).toBe('actionnable')
    expect(isContactActionnable(actionnable)).toBe(true)
    // A phone or LinkedIn is a reachable channel too.
    expect(isContactActionnable({ fullName: 'Jean Dupont', title: 'DSI', role: 'technical', phone: '+33...' })).toBe(
      true,
    )
  })
})
