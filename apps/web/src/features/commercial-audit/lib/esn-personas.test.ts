import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commercialAuditContextSchema, profileContextSchema } from '@bellum/contracts'
import { buildCommercialAudit, buildCommercialAuditContext } from './build-audit'
import { ESN_PERSONA_CASES, type EsnPersonaCase } from './esn-personas.fixtures'

/**
 * #2070 — Corpus de non-régression multi-persona, contre le VRAI moteur.
 *
 * Chaque `it()` ci-dessous appelle `buildCommercialAuditContext` /
 * `buildCommercialAudit` — jamais une réimplémentation du calcul. Le fichier
 * de fixtures (`esn-personas.fixtures.ts`) porte les RÉPONSES (#2070.16) ;
 * ce fichier porte l'audit ATTENDU (#2070.17), les contradictions (#2070.18),
 * les priorités (#2070.19), les interdits (#2070.20), la configuration
 * produit (#2070.21) et les limites (#2070.22).
 */

function caseById(id: string): EsnPersonaCase {
  const found = ESN_PERSONA_CASES.find(item => item.id === id)
  if (!found) throw new Error(`cas de persona introuvable : ${id}`)
  return found
}

function contextFor(item: EsnPersonaCase) {
  return buildCommercialAuditContext(item.profileContext, item.revisions)
}

// ── #2070 — le corpus n'est pas vide, et chaque cas est un `ProfileContext` valide ──

describe('ESN_PERSONA_CASES — le corpus lit quelque chose', () => {
  it('#2070 — porte exactement les quatorze formes retenues (#2070.3 volontairement absente)', () => {
    expect(ESN_PERSONA_CASES.length).toBe(14)
    expect(ESN_PERSONA_CASES.map(item => item.point).sort((a, b) => a - b)).toEqual([
      1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ])
  })

  it('#2070.16 — chaque cas est un `ProfileContext` qui PARSE — une réponse plausible, pas une forme inventée', () => {
    for (const item of ESN_PERSONA_CASES) {
      expect(() => profileContextSchema.parse(item.profileContext), item.id).not.toThrow()
    }
  })

  it('#2070.17 — chaque cas traverse le VRAI moteur et produit un `CommercialAuditContext` valide', () => {
    for (const item of ESN_PERSONA_CASES) {
      const context = contextFor(item)
      expect(() => commercialAuditContextSchema.parse(context), item.id).not.toThrow()
      // #2065 — toujours les 13 axes (#2860), quel que soit le cas.
      expect(context.maturity?.axes, item.id).toHaveLength(13)
      // #2064 — toujours un tableau, jamais `null`.
      expect(Array.isArray(context.contradictions), item.id).toBe(true)
    }
  })
})

// ── #2070.18 — la garde sait dire NON : au moins un cas lève, un voisin ne lève pas ──

const TRIGGERING_IDS = [
  'esn-generaliste',
  'modele-freelance',
  'cabinet-recrutement',
  'esn-sans-crm',
  'nouveau-directeur-agence',
] as const

const CLEAR_IDS = [
  'technicien-petite-esn',
  'fondateur-commercial-solo',
  'agence-regionale',
  'niche-cyber',
  'rang-2-sous-traitance',
  'secteur-public',
  'esn-mature-multi-commerciaux',
  'gros-vivier-peu-de-besoins',
  'pipeline-sans-suivi',
] as const

describe('#2070.18 — contradictions : au moins un cas lève, un cas voisin ne lève rien', () => {
  it('cinq cas sur quatorze lèvent au moins une tension, neuf n’en lèvent aucune', () => {
    expect(TRIGGERING_IDS.length + CLEAR_IDS.length).toBe(14)
    for (const id of TRIGGERING_IDS) {
      const context = contextFor(caseById(id))
      expect(context.contradictions?.length, id).toBeGreaterThan(0)
    }
    for (const id of CLEAR_IDS) {
      const context = contextFor(caseById(id))
      expect(context.contradictions, id).toEqual([])
    }
  })

  it('#2064.2 — ESN généraliste (5 secteurs) déclenche `tooManySimultaneousMarkets`, niche cyber (1 secteur) ne la déclenche pas', () => {
    const generaliste = contextFor(caseById('esn-generaliste'))
    expect(generaliste.contradictions?.map(c => c.ruleId)).toContain('tooManySimultaneousMarkets')

    const niche = contextFor(caseById('niche-cyber'))
    expect(niche.contradictions?.map(c => c.ruleId)).not.toContain('tooManySimultaneousMarkets')
  })

  it('#2064.8 — la paire minimale : même grand compte visé, seule la stratégie d’entrée diffère', () => {
    const nicheCyber = caseById('niche-cyber')
    const nouveauDirecteur = caseById('nouveau-directeur-agence')
    expect(nicheCyber.profileContext.idealAccountProfile?.size).toBe('grandCompte')
    expect(nouveauDirecteur.profileContext.idealAccountProfile?.size).toBe('grandCompte')
    expect(nicheCyber.profileContext.idealAccountProfile?.entryStrategy).toBe('topDown')
    expect(nouveauDirecteur.profileContext.idealAccountProfile?.entryStrategy).toBe('bottomUp')

    const nicheContext = contextFor(nicheCyber)
    expect(nicheContext.contradictions?.map(c => c.ruleId)).not.toContain('keyAccountsWithoutAccessPath')

    const directeurContext = contextFor(nouveauDirecteur)
    expect(directeurContext.contradictions?.map(c => c.ruleId)).toContain('keyAccountsWithoutAccessPath')
  })

  it('#2064.1 — le nouveau directeur d’agence vise aussi plus que sa cadence ne permet', () => {
    const context = contextFor(caseById('nouveau-directeur-agence'))
    expect(context.contradictions?.map(c => c.ruleId)).toContain('objectivesAboveCapacity')
  })

  it('#2064.1 — le cabinet de recrutement, sous pression de croissance, vise au-delà de sa cadence', () => {
    const context = contextFor(caseById('cabinet-recrutement'))
    expect(context.contradictions?.map(c => c.ruleId)).toEqual(['objectivesAboveCapacity'])
  })

  it('#2064.3 — le modèle freelance affirme un angle sans aucun point de différenciation', () => {
    const context = contextFor(caseById('modele-freelance'))
    expect(context.contradictions?.map(c => c.ruleId)).toEqual(['offerWithoutProof'])
  })

  it('#2064.4 — l’ESN sans CRM a une cadence recommandée sans routine d’analyse configurée', () => {
    const context = contextFor(caseById('esn-sans-crm'))
    expect(context.contradictions?.map(c => c.ruleId)).toEqual(['acquisitionWithoutRoutine'])

    // Contraste : l’ESN mature, elle, a une routine configurée — même famille de
    // cadence recommandée, aucune tension.
    const mature = contextFor(caseById('esn-mature-multi-commerciaux'))
    expect(mature.contradictions?.map(c => c.ruleId)).not.toContain('acquisitionWithoutRoutine')
  })
})

// ── #2070.1 — le cas le plus pauvre : 0 axe évaluable, aucun score, aucune tension ──

describe('#2070.1 — technicien qui vient de créer sa petite ESN : le plancher du corpus', () => {
  it('0 axe évaluable sur 13 : aucun score global, les axes restent NOMMÉS', () => {
    const context = contextFor(caseById('technicien-petite-esn'))
    const evaluable = context.maturity?.axes.filter(axis => axis.score !== null) ?? []
    expect(evaluable).toHaveLength(0)
    expect(context.maturity?.score).toBeNull()
    expect(context.maturity?.reason).not.toBeNull()
    expect(context.maturity?.axes.every(axis => axis.state === 'unknown')).toBe(true)
  })

  it('aucune des 12 règles de tension ne peut se prononcer : 0 contradiction, pas « rien à signaler »', () => {
    const context = contextFor(caseById('technicien-petite-esn'))
    expect(context.contradictions).toEqual([])
    // Les 5 règles calculables depuis le profil rendent `unknown`, pas `clear` —
    // ce sont des labels DISTINCTS de celles à signal externe (voir plus bas).
    const labels = context.unknowns?.map(u => u.label) ?? []
    expect(labels).toEqual(
      expect.arrayContaining([
        'Objectifs vs capacité',
        'Marchés simultanés',
        'Offre sans preuve',
        'Acquisition sans routine',
        'Grands comptes sans voie d’accès',
      ]),
    )
  })
})

// ── #2070.22 — les limites : ce que le moteur ne peut PAS dire, pour LES 14 cas ──

/** #2064.5/.6/.7/.9/.10/.11/.12 — jamais reliées : `buildCommercialAuditContext`
 *  (`build-audit.ts:349`) appelle `detectCommercialTensions(context)` SANS le
 *  deuxième argument `signals`. Structurel, pas un trou de ce corpus. */
const ALWAYS_UNKNOWN_TENSION_LABELS = [
  'Vivier sans disponibilité',
  'Besoins sans qualification',
  'Profils sans engagement',
  'Partenaires sans économie ni feedback',
  'Contenu sans exploitation commerciale',
  'Appels d’offres sans GO/NO-GO',
  'Missions sans capitalisation',
] as const

/** #2065 — cinq axes qui mesurent une réalité opérationnelle que `ProfileContext`
 *  (un questionnaire d'onboarding) ne porte pas. */
const ALWAYS_UNKNOWN_AXIS_IDS = [
  'proof',
  'clientQualification',
  'candidateSecurisation',
  'capitalisation',
  'teamAlignment',
] as const

describe('#2070.22 — limites : les mêmes sept règles et cinq axes restent `unknown` pour les quatorze cas', () => {
  it.each(ESN_PERSONA_CASES.map(item => [item.id, item] as const))(
    '%s — les 7 règles à signal externe sont NOMMÉES `unknown`, jamais fondues dans un tableau vide',
    (_id, item) => {
      const context = contextFor(item)
      const labels = context.unknowns?.map(u => u.label) ?? []
      for (const label of ALWAYS_UNKNOWN_TENSION_LABELS) {
        expect(labels, `${item.id} — ${label}`).toContain(label)
      }
    },
  )

  it.each(ESN_PERSONA_CASES.map(item => [item.id, item] as const))(
    '%s — les 5 axes structurellement non mesurables restent `unknown`, jamais un score inventé',
    (_id, item) => {
      const context = contextFor(item)
      for (const axisId of ALWAYS_UNKNOWN_AXIS_IDS) {
        const axis = context.maturity?.axes.find(a => a.id === axisId)
        expect(axis?.state, `${item.id} — ${axisId}`).toBe('unknown')
        expect(axis?.score, `${item.id} — ${axisId}`).toBeNull()
      }
    },
  )
})

describe('#2070.22 — limites nommées, cas par cas', () => {
  it('#2070.7 — modèle freelance : le vrai risque (disponibilité du vivier) reste hors de portée', () => {
    const context = contextFor(caseById('modele-freelance'))
    const labels = context.unknowns?.map(u => u.label) ?? []
    expect(labels).toContain('Vivier sans disponibilité')
  })

  it('#2070.8 — cabinet de recrutement : qualification des besoins et engagement client restent hors de portée', () => {
    const context = contextFor(caseById('cabinet-recrutement'))
    const labels = context.unknowns?.map(u => u.label) ?? []
    expect(labels).toContain('Besoins sans qualification')
    expect(labels).toContain('Profils sans engagement')
  })

  it('#2070.10 — secteur public : la décision GO/NO-GO sur appel d’offres reste hors de portée', () => {
    const context = contextFor(caseById('secteur-public'))
    const labels = context.unknowns?.map(u => u.label) ?? []
    expect(labels).toContain('Appels d’offres sans GO/NO-GO')
  })

  it('#2070.11 — ESN sans CRM : aucune routine configurée, l’axe « Data et outils » NOMME l’écart', () => {
    const context = contextFor(caseById('esn-sans-crm'))
    const dataAndTools = context.maturity?.axes.find(a => a.id === 'dataAndTools')
    expect(dataAndTools?.state).toBe('unknown')
    expect(dataAndTools?.score).toBeNull()
    expect(dataAndTools?.gaps).toEqual(["Aucun paramètre d'analyse configuré"])
  })

  it('#2070.14 — gros vivier, peu de besoins : le déséquilibre réel vit dans des signaux jamais reliés', () => {
    const context = contextFor(caseById('gros-vivier-peu-de-besoins'))
    const labels = context.unknowns?.map(u => u.label) ?? []
    // Le vrai sujet de ce cas — trop de vivier, pas assez de besoins — est
    // exactement ce que ces deux règles mesureraient si un signal existait.
    expect(labels).toContain('Vivier sans disponibilité')
    expect(labels).toContain('Besoins sans qualification')
    // Et le moteur ne lève, pour ce cas, AUCUNE des 5 règles qu'il peut
    // pourtant calculer depuis le seul profil : son vrai problème est ailleurs.
    expect(context.contradictions).toEqual([])
  })

  it('#2070.9 — rang 2 (sous-traitance) : le niveau de décision reste structurellement opérationnel', () => {
    const context = contextFor(caseById('rang-2-sous-traitance'))
    const targeting = context.maturity?.axes.find(a => a.id === 'targeting')
    expect(targeting?.gaps).toContain('Le niveau de décision visé reste opérationnel')
  })

  it('#2070.15 — pipeline sans suivi : le rythme de relance recommandé reste le plus léger du corpus', () => {
    const context = contextFor(caseById('pipeline-sans-suivi'))
    const followUp = context.maturity?.axes.find(a => a.id === 'followUpDiscipline')
    expect(followUp?.gaps).toContain('Le rythme de relance recommandé reste léger')
    // Une faiblesse nommée par l'axe, sans qu'aucune des 12 règles ne lève —
    // toutes les faiblesses ne sont pas des contradictions.
    expect(context.contradictions).toEqual([])
  })
})

// ── #2070.19 — priorités : ce qui est déclaré, jamais une probabilité déguisée ──

describe('#2070.19 — priorités : les secteurs déclarés se retrouvent tels quels, jamais pondérés', () => {
  it.each(
    ESN_PERSONA_CASES.filter(item => item.profileContext.idealAccountProfile).map(item => [item.id, item] as const),
  )('%s — le headline « target » reprend les secteurs déclarés, dans le même ordre', (_id, item) => {
    const audit = buildCommercialAudit(item.profileContext, item.revisions)
    const target = audit.headlines.find(h => h.key === 'target')?.value
    expect(target?.kind, item.id).toBe('target')
    if (target?.kind === 'target') {
      expect(target.sectors, item.id).toEqual(item.profileContext.idealAccountProfile?.sectorsPriority)
    }
  })
})

// ── #2070.21 — configuration produit : la capacité, jamais un outil non branché ──

describe('#2070.21 — configuration produit : les clés mesurées, jamais un nom de fournisseur', () => {
  it('#2070.1 — sans aucune donnée, aucune personnalisation n’est mesurée', () => {
    const context = contextFor(caseById('technicien-petite-esn'))
    expect(context.productPersonalization).toEqual([])
  })

  // Intégration vague 12 : SEPT, pas six. Cette branche est partie d'un `main`
  // qui n'avait pas encore la clé `kpiTargets` (#2067.1/.3, ajoutée depuis dans
  // `build-audit.ts`), et git n'a vu AUCUN conflit — les deux côtés touchent des
  // régions différentes du fichier. La fixture de cette persona PORTE bien des
  // cibles (`esn-personas.fixtures.ts`), donc la septième clé est mesurée, pas
  // inventée : c'est l'attente qui était périmée, pas le calcul.
  it('#2070.12 — l’ESN mature a les sept clés mesurées', () => {
    // #2067.1/#2067.3 (`feat/welcome-et-audit-lot-1`, déjà sur `main` avant ce
    // corpus) a câblé une 7e clé (`kpiTargets`) sur ce même mécanisme — ce
    // persona porte `coachingInsights.kpiTargets`, donc elle est mesurée ici
    // aussi. Corrigé au merge de ce lot (#2066), pas un défaut de ce fichier.
    const context = contextFor(caseById('esn-mature-multi-commerciaux'))
    const keys = context.productPersonalization?.map(item => item.key) ?? []
    expect(keys.sort()).toEqual(['accounts', 'contacts', 'copilot', 'kpiTargets', 'load', 'messages', 'routines'])
  })

  it('GA-44 — aucune description de personnalisation ne nomme un outil ou un fournisseur', () => {
    for (const item of ESN_PERSONA_CASES) {
      const context = contextFor(item)
      for (const personalization of context.productPersonalization ?? []) {
        // Le contrat actuel ne remplit jamais `description` (voir build-audit.ts) —
        // cette assertion est le CLIQUET : le jour où `description` se remplit, elle
        // doit continuer de ne jamais nommer un outil non branché ni un fournisseur.
        expect(personalization.description, item.id).toBeNull()
      }
    }
  })
})

// ── #2070.20 — interdits : aucune probabilité, dans aucun des 14 audits ──

const PROBABILITY_VOCABULARY = /\bchance\b|\bprobabilit|\bodds\b|\bprévisionnel\b/i

function collectOutputStrings(context: ReturnType<typeof buildCommercialAuditContext>): string[] {
  const strings: string[] = []
  for (const contradiction of context.contradictions ?? []) {
    strings.push(contradiction.tension, contradiction.possibleExplanation ?? '', contradiction.questionToValidate ?? '')
    strings.push(contradiction.consequenceIfUnaddressed ?? '', ...contradiction.facts)
  }
  for (const unknown of context.unknowns ?? []) {
    strings.push(unknown.label, unknown.reason ?? '')
  }
  for (const axis of context.maturity?.axes ?? []) {
    strings.push(axis.label, ...(axis.evidence ?? []), ...(axis.gaps ?? []), axis.nextLever ?? '')
  }
  return strings
}

describe('#2070.20 — interdits : aucune PROBABILITÉ dans aucun des quatorze audits', () => {
  it.each(ESN_PERSONA_CASES.map(item => [item.id, item] as const))(
    '%s — aucun vocabulaire de chance ou de prévisionnel pondéré',
    (_id, item) => {
      const context = contextFor(item)
      for (const text of collectOutputStrings(context)) {
        expect(text, `${item.id} : "${text}"`).not.toMatch(PROBABILITY_VOCABULARY)
      }
    },
  )
})

// ── #2070.23 — un cas client NOMMÉ reste une fixture, jamais un template universel ──

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('#2070.23 — le corpus n’est jamais un template', () => {
  it('aucun fichier de production (hors test) n’importe `esn-personas.fixtures`', () => {
    const webSrc = join(__dirname, '..', '..', '..')
    const offenders = collectSourceFiles(webSrc)
      .filter(file => !/\.test\.tsx?$/.test(file))
      .filter(file => !file.endsWith(join('lib', 'esn-personas.fixtures.ts')))
      .filter(file => readFileSync(file, 'utf8').includes('esn-personas.fixtures'))
    expect(offenders).toEqual([])
  })
})
