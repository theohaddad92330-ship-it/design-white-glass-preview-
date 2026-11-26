import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Account, AccountAnalysis, BellumRead } from '@bellum/contracts'
import {
  buildBellumReadData,
  evaluationField,
  readAccountScore25,
  deriveImmediateAction,
  readDossierReliability,
  readStoredVerdict,
  useAccountOverviewData,
} from './useAccountOverviewData'

const base = {} as AccountAnalysis

describe('deriveImmediateAction (Théo p.5/17 — "aucune action" vs quick wins)', () => {
  it('prefers an explicit immediate_action', () => {
    expect(deriveImmediateAction({ ...base, immediate_action: 'Appeler le DSI' })).toBe('Appeler le DSI')
  })

  it('falls back to plan.quick_wins when no top-level quick_wins (the SG bug)', () => {
    const analysis = {
      ...base,
      quick_wins: [],
      plan: { quick_wins: [{ action: 'Contacter Laurent Stricher sur LinkedIn' }] },
    } as unknown as AccountAnalysis
    expect(deriveImmediateAction(analysis)).toBe('Contacter Laurent Stricher sur LinkedIn')
  })

  it('falls back to plan.evaluation.quick_wins', () => {
    const analysis = {
      ...base,
      plan: { evaluation: { quick_wins: [{ action: 'Auditer la landing zone' }] } },
    } as unknown as AccountAnalysis
    expect(deriveImmediateAction(analysis)).toBe('Auditer la landing zone')
  })

  it('falls back to the first plan action when no quick wins', () => {
    const analysis = {
      ...base,
      plan: {
        action_plan: { phases: [{ actions: [{ action: 'Envoyer un message J1' }] }] },
      },
    } as unknown as AccountAnalysis
    expect(deriveImmediateAction(analysis)).toBe('Envoyer un message J1')
  })

  it('returns null only when there is genuinely nothing', () => {
    expect(deriveImmediateAction({ ...base, quick_wins: [], plan: {} } as unknown as AccountAnalysis)).toBeNull()
  })
})

describe('readDossierReliability (2e axe — fiabilité du dossier, Théo P1)', () => {
  it('reads the top-level confidence score + tier', () => {
    expect(readDossierReliability({ confidence: { score: 72.4, tier: 'high' } }, base)).toEqual({
      value: 72,
      tier: 'high',
    })
  })

  it('reads the "non_evaluable" tier (#2307.19 — collecte sans aucune source répondue)', () => {
    expect(readDossierReliability({ confidence: { score: 0, tier: 'non_evaluable' } }, base)).toEqual({
      value: 0,
      tier: 'non_evaluable',
    })
  })

  it('falls back to plan.data_confidence when no top-level confidence', () => {
    const analysis = { plan: { data_confidence: 55 } } as unknown as AccountAnalysis
    expect(readDossierReliability({}, analysis)).toEqual({ value: 55, tier: null })
  })

  it('is null / null when nothing is available', () => {
    expect(readDossierReliability(null, base)).toEqual({ value: null, tier: null })
    expect(readDossierReliability({ confidence: {} }, base)).toEqual({ value: null, tier: null })
  })
})

describe('#3755 — le verdict de la grille de qualification de l’espace', () => {
  const snapshot = (verdict: 'GO' | 'PRUDENT' | 'NO-GO' | null) => ({
    grid_id: 'g1',
    grid_version: 2,
    verdict,
    eliminated_by: verdict === 'NO-GO' ? [{ code: 'F1', label: 'Présence géographique' }] : [],
    points: 40,
    max: 50,
    not_evaluable: [{ code: 'S3', label: 'Staffing disponible' }],
    evaluated_at: '2026-10-06T10:00:00.000Z',
  })

  it('prime sur le verdict de l’IA quand la grille conclut', () => {
    const analysis = {
      ...base,
      plan: { evaluation: { go_no_go: 'GO' } },
      qualification: snapshot('NO-GO'),
    } as unknown as AccountAnalysis
    expect(readStoredVerdict(analysis)).toBe('NO-GO')
  })

  it('sans grille ou sans conclusion, le verdict d’avant est rendu à l’identique', () => {
    const withoutGrid = { ...base, plan: { evaluation: { go_no_go: 'EXPLORER' } } } as unknown as AccountAnalysis
    expect(readStoredVerdict(withoutGrid)).toBe('EXPLORER')
    const inconclusive = { ...withoutGrid, qualification: snapshot(null) } as unknown as AccountAnalysis
    expect(readStoredVerdict(inconclusive)).toBe('EXPLORER')
  })

  it('expose l’instantané (filtre nommé, version) sur les données de la vue', () => {
    const account = {
      id: 'a1',
      priority_score: 8,
      priority_justification: null,
      raw_analysis: { qualification: snapshot('NO-GO') },
    } as unknown as Account
    const { result } = renderHook(() => useAccountOverviewData(account))
    expect(result.current.qualification?.eliminated_by).toEqual([{ code: 'F1', label: 'Présence géographique' }])
    expect(result.current.qualification?.grid_version).toBe(2)
  })
})

describe('readStoredVerdict — le verdict que l’IA a réellement émis', () => {
  it('lit go_no_go sur l’évaluation du plan', () => {
    const analysis = {
      ...base,
      plan: { evaluation: { go_no_go: 'EXPLORER' } },
    } as unknown as AccountAnalysis
    expect(readStoredVerdict(analysis)).toBe('EXPLORER')
  })

  it('lit aussi l’évaluation au niveau racine et la variante camelCase', () => {
    expect(readStoredVerdict({ ...base, evaluation: { goNoGo: 'PRUDENT' } } as unknown as AccountAnalysis)).toBe(
      'PRUDENT',
    )
    expect(readStoredVerdict({ ...base, evaluation_compte: { go_no_go: 'STOP' } } as unknown as AccountAnalysis)).toBe(
      'STOP',
    )
  })

  it('rend null quand l’IA n’a pas émis de verdict', () => {
    expect(readStoredVerdict(base)).toBeNull()
    expect(
      readStoredVerdict({ ...base, plan: { evaluation: { go_no_go: '—' } } } as unknown as AccountAnalysis),
    ).toBeNull()
  })
})

describe('buildBellumReadData — #1607.1, les quatre blocs et leur dégradation', () => {
  const FULL: BellumRead = {
    verdict_line: 'SNCF se travaille par entité, pas au niveau groupe.',
    why: ['Signal 1', 'Signal 2', 'Signal 3'],
    missing: 'Pas de contact confirmé côté DSI Retail.',
    next_action: 'Vérifier si l’équipe Data travaille avec des externes.',
  }

  it('construit les quatre blocs quand le dossier les porte', () => {
    const data = buildBellumReadData('Phrase legacy', 'Description', [], FULL)
    expect(data.blocks).toEqual({
      verdictLine: 'SNCF se travaille par entité, pas au niveau groupe.',
      why: ['Signal 1', 'Signal 2', 'Signal 3'],
      missing: 'Pas de contact confirmé côté DSI Retail.',
      nextAction: 'Vérifier si l’équipe Data travaille avec des externes.',
    })
    // title/description restent alimentés — un consommateur qui ne lit pas
    // encore `blocks` continue de fonctionner.
    expect(data.title).toBe('Phrase legacy')
  })

  it('borne « why » à 3 preuves, même si le dossier en porte plus', () => {
    const data = buildBellumReadData(null, null, [], { ...FULL, why: ['1', '2', '3', '4', '5'] })
    expect(data.blocks?.why).toEqual(['1', '2', '3'])
  })

  it('jette les preuves vides plutôt que d’afficher une ligne blanche', () => {
    const data = buildBellumReadData(null, null, [], { ...FULL, why: ['Signal réel', '', '  '] })
    expect(data.blocks?.why).toEqual(['Signal réel'])
  })

  it('dégrade PROPREMENT — une analyse d’avant #1607.1 (bellum_read absent) ne casse rien', () => {
    const data = buildBellumReadData('Ancienne phrase libre.', 'Description ancienne.', [], undefined)
    expect(data.blocks).toBeNull()
    expect(data.title).toBe('Ancienne phrase libre.')
    expect(data.description).toBe('Description ancienne.')
  })

  it('dégrade aussi sur `bellum_read: null` (forme explicite envoyée par le contrat)', () => {
    expect(buildBellumReadData(null, null, [], null).blocks).toBeNull()
  })

  it('sans verdictLine, ne rend PAS un panneau à moitié rempli même si why/missing/nextAction existent', () => {
    const data = buildBellumReadData(null, null, [], { ...FULL, verdict_line: null })
    expect(data.blocks).toBeNull()
  })

  it('missing/nextAction restent null individuellement sans faire tomber verdictLine/why', () => {
    const data = buildBellumReadData(null, null, [], {
      verdict_line: 'Verdict seul.',
      why: ['Preuve'],
      missing: null,
      next_action: null,
    })
    expect(data.blocks).toEqual({ verdictLine: 'Verdict seul.', why: ['Preuve'], missing: null, nextAction: null })
  })
})

// ── Le bloc de lecture se trouve LÀ OÙ IL VIT ───────────────────────────────
//
// ⚠️⚠️ Mesuré en production le 11/09/2026 : `plan.evaluation.bellum_read` était
// présent dans le dossier, et l'écran restait muet. `readAccountScore25`
// cherchait aux trois places connues, le bloc de lecture à une seule — la
// racine, celle que les dossiers RÉCENTS n'utilisent pas. Le score s'affichait,
// les quatre blocs jamais, depuis le MÊME objet.
//
// C'est une dérivation recopiée à moitié : « où vit l'évaluation d'un dossier »
// doit vivre à un seul endroit, sinon les deux copies divergent.

describe('#1607.1 — l’évaluation se cherche là où elle vit', () => {
  const blocks = {
    verdict_line: 'Société Générale se travaille par entité.',
    why: ['23 contacts déjà dans le CRM.'],
    missing: 'Aucun contact confirmé côté achats.',
    next_action: 'Réactiver les contacts connus sous J+1.',
  }

  it('sous `plan.evaluation` — la forme des dossiers récents, celle qui était ratée', () => {
    const analysis = { plan: { evaluation: { score: 16, bellum_read: blocks } } } as unknown as AccountAnalysis
    expect(evaluationField(analysis, 'bellum_read')).toEqual(blocks)
    // Le score le trouvait déjà : c'est bien la MÊME question, posée deux fois.
    expect(readAccountScore25(analysis)).toBe(16)
  })

  it('à la RACINE — la forme des dossiers plus anciens', () => {
    const analysis = { evaluation: { score: 16, bellum_read: blocks } } as unknown as AccountAnalysis
    expect(evaluationField(analysis, 'bellum_read')).toEqual(blocks)
  })

  it('sous `evaluation_compte` — la troisième forme en base', () => {
    const analysis = { evaluation_compte: { bellum_read: blocks } } as unknown as AccountAnalysis
    expect(evaluationField(analysis, 'bellum_read')).toEqual(blocks)
  })

  it('SAIT DIRE NON — un dossier sans le bloc ne rend rien, et le bloc reste `null`', () => {
    const analysis = { plan: { evaluation: { score: 16 } } } as unknown as AccountAnalysis
    expect(evaluationField(analysis, 'bellum_read')).toBeUndefined()
    expect(buildBellumReadData('résumé', null, [], undefined).blocks).toBeNull()
  })
})

/**
 * #2118 — L'APPELANT. Le calcul et la normalisation sont testés dans
 * `evaluation/dossierReadViewData.test.ts` ; ce qui se prouve ICI est le
 * chaînon qui a déjà manqué une fois : `bellum_read` était en base, lu à la
 * SEULE racine, et l'écran restait muet sur tous les dossiers récents — que la
 * phase 4 range sous `plan.evaluation`.
 */
describe('#2118 — la lecture du dossier remonte jusqu’à l’écran', () => {
  const axes = [
    { key: 'adequation_offre', state: 'measured', value: 4 },
    { key: 'potentiel_commercial', state: 'measured', value: 4 },
    { key: 'fraicheur', state: 'partial', value: 4 },
  ]

  function monter(rawAnalysis: unknown) {
    const account = { id: 'acc-1', raw_analysis: rawAnalysis } as unknown as Account
    return renderHook(() => useAccountOverviewData(account)).result.current
  }

  it('la lit sous `plan.evaluation` — l’emplacement des dossiers récents', () => {
    const overview = monter({ plan: { evaluation: { dossier_read: { axes } } } })
    expect(overview.dossierRead?.score).toMatchObject({ kind: 'score', value: 12, outOf: 15 })
  })

  it('la lit aussi à la racine `evaluation` — les dossiers plus anciens', () => {
    const overview = monter({ evaluation: { dossier_read: { axes } } })
    expect(overview.dossierRead?.axes).toHaveLength(7)
  })

  it('rend `null` quand le dossier ne la porte pas — l’écran garde sa lecture d’avant', () => {
    expect(monter({ evaluation: { go_no_go: 'PRUDENT' } }).dossierRead).toBeNull()
  })
})

/**
 * #2304.8 (épopée #2932) — Q7 « quel est le principal risque du compte ».
 * `risks` vit dans `evaluation` (`evaluationField`, même chaînon que
 * `bellum_read`/`dossier_read` ci-dessus) — DÉRIVÉ vers un risque UNIQUE par
 * `mainRisk` (`@bellum/contracts`), jamais un second appel modèle.
 */
describe('#2304.8 — le risque PRINCIPAL remonte jusqu’à l’écran', () => {
  function monter(rawAnalysis: unknown) {
    const account = { id: 'acc-1', raw_analysis: rawAnalysis } as unknown as Account
    return renderHook(() => useAccountOverviewData(account)).result.current
  }

  it('choisit le plus grave parmi les risques déjà écrits sous `plan.evaluation`', () => {
    const overview = monter({
      plan: {
        evaluation: {
          risks: [
            { risk: 'Cycle de vente long', probability: 'haute', impact: 'important' },
            { risk: 'Rupture de contrat cadre', probability: 'basse', impact: 'critique' },
          ],
        },
      },
    })
    expect(overview.mainRisk?.risk).toBe('Rupture de contrat cadre')
  })

  it('rend `null` quand le dossier n’a aucun risque — jamais un risque inventé', () => {
    expect(monter({ evaluation: { go_no_go: 'PRUDENT' } }).mainRisk).toBeNull()
  })

  it('une liste de risques vide rend `null`, pas une erreur', () => {
    expect(monter({ evaluation: { risks: [] } }).mainRisk).toBeNull()
  })
})

describe('R25 — la Synthèse ne nomme jamais NOTRE fournisseur (EDF, Decathlon)', () => {
  it('réécrit « Apollo » dans le résumé et dans le texte stocké du modèle', () => {
    const account = {
      id: 'acc-1',
      priority_justification: 'Selon Apollo, 12 DSI',
      raw_analysis: { business_description: 'Groupe énergie (données Apollo)' },
    } as unknown as Account
    const { result } = renderHook(() => useAccountOverviewData(account))
    expect(result.current.executiveSummary).toBe('Selon une source de données, 12 DSI')
    expect(result.current.bellumRead.description).not.toMatch(/apollo/i)
  })
})

// KEVIN-FIX (b) — « Prochaine action » : l'en-tête et la Synthèse lisent la MÊME source.
describe('buildBellumReadData — une seule prochaine action (KEVIN-FIX b)', () => {
  const READ: BellumRead = {
    verdict_line: 'Verdict.',
    why: ['Preuve'],
    missing: null,
    next_action: 'Envoyer un e-mail au DSI.',
  }

  it('la prochaine action de l’en-tête remplace la phrase du modèle', () => {
    const data = buildBellumReadData(null, null, [], READ, 'Envoyer un message LinkedIn au DSI.')
    expect(data.blocks?.nextAction).toBe('Envoyer un message LinkedIn au DSI.')
  })

  it('pas de prochaine action dans l’en-tête : la Synthèse n’en invente pas une autre', () => {
    expect(buildBellumReadData(null, null, [], READ, null).blocks?.nextAction).toBeNull()
  })

  it('sait dire NON : sans source passée, l’appelant d’avant garde la phrase du modèle', () => {
    expect(buildBellumReadData(null, null, [], READ).blocks?.nextAction).toBe('Envoyer un e-mail au DSI.')
  })
})
