import { describe, expect, it } from 'vitest'
import type { LauraPageContext } from '@bellum/contracts'
import { entryPageContext } from './entry-page-context'

/**
 * #2123.56 — Laura ouverte DEPUIS un dossier garde ce que le dossier savait.
 *
 * Le panneau du compte passe à `/chat` la section d'origine, le périmètre et les
 * sources en plus du compte et de la question. Ce que ces tests tiennent : le
 * contexte ne voyage QUE vers le compte dont il parle, et un contexte illisible
 * n'est jamais repris à moitié.
 */

const ACCOUNT_ID = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
const OTHER_ACCOUNT_ID = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d'

const CONTEXT: LauraPageContext = {
  kind: 'account',
  label: 'AIRBUS',
  entityId: ACCOUNT_ID,
  facets: [
    { label: 'Section d’origine', value: 'Vue d’ensemble' },
    { label: 'Périmètre', value: 'Cellule méthodes du site de Toulouse' },
  ],
  state: 'ready',
}

describe('entryPageContext — le contexte du dossier suit la question', () => {
  it('rend le contexte quand il parle du compte en portée', () => {
    expect(entryPageContext(CONTEXT, ACCOUNT_ID)).toEqual(CONTEXT)
  })

  it('le relit aussi depuis sa forme sérialisée (URL rechargée)', () => {
    expect(entryPageContext(JSON.stringify(CONTEXT), ACCOUNT_ID)).toEqual(CONTEXT)
  })

  it('ne le prête JAMAIS à un autre compte — la portée a changé, le contexte reste derrière', () => {
    expect(entryPageContext(CONTEXT, OTHER_ACCOUNT_ID)).toBeNull()
    expect(entryPageContext(CONTEXT, null)).toBeNull()
  })

  it('un contexte illisible est ignoré en entier, jamais repris à moitié', () => {
    expect(entryPageContext({ ...CONTEXT, facets: 'périmètre' }, ACCOUNT_ID)).toBeNull()
    expect(entryPageContext('{pas du json', ACCOUNT_ID)).toBeNull()
    expect(entryPageContext(undefined, ACCOUNT_ID)).toBeNull()
  })
})

/**
 * #3002 (#2206.45-.48, 25/09/2026) — un écran SANS compte (pilotage,
 * briefing…) n'est scopé à aucun dossier : rien ne peut le prêter au mauvais,
 * donc il doit survivre à la navigation vers `/chat` même sans `accountId`.
 * Mesuré en prod : « Explique-moi cet écran » depuis /pilotage recevait une
 * réponse générique — le contexte ne partait jamais, la garde `!accountId`
 * le jetait avant même de regarder `entityId`.
 */
describe('entryPageContext — #3002 : un contexte SANS compte voyage toujours', () => {
  const PILOTAGE_CONTEXT: LauraPageContext = {
    kind: 'pilotage',
    label: 'Pilotage',
    entityId: null,
    facets: [{ label: 'Couverture', value: '4/12' }],
    state: 'ready',
    purpose: 'Où ma chaîne commerciale décroche.',
    actions: ['Ouvrir le dossier'],
    recommendedAction: 'Ouvrir le dossier',
  }

  it('survit sans accountId — aucun compte à qui il pourrait mentir', () => {
    expect(entryPageContext(PILOTAGE_CONTEXT, null)).toEqual(PILOTAGE_CONTEXT)
    expect(entryPageContext(PILOTAGE_CONTEXT, undefined)).toEqual(PILOTAGE_CONTEXT)
  })

  it('survit aussi quand un compte EST en portée par ailleurs (pas le sien, mais pas un vol)', () => {
    expect(entryPageContext(PILOTAGE_CONTEXT, ACCOUNT_ID)).toEqual(PILOTAGE_CONTEXT)
  })

  it('le relit aussi depuis sa forme sérialisée (URL rechargée)', () => {
    expect(entryPageContext(JSON.stringify(PILOTAGE_CONTEXT), null)).toEqual(PILOTAGE_CONTEXT)
  })

  it('un contexte AVEC compte garde sa règle inchangée — jamais prêté à un autre', () => {
    expect(entryPageContext(CONTEXT, null)).toBeNull()
    expect(entryPageContext(CONTEXT, OTHER_ACCOUNT_ID)).toBeNull()
  })
})
