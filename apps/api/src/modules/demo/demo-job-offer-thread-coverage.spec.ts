import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_JOB_OFFER_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_JOB_OFFER_THREAD } from './demo-dataset'

/**
 * Théo L1 — sélecteur avancé — LA SALLE MONTRE UN FIL PARTI D'UNE OFFRE D'EMPLOI.
 *
 * Craft rule n°9 : la portée « une offre d'emploi » est AUSSI classée en démo.
 *  1. le fil d'exemple part d'une offre RÉELLEMENT semée, et ne dit que ce que
 *     son signal dit (date, lieu) — rien d'inventé, aucun fournisseur nommé ;
 *  2. l'onglet du sélecteur reste vide à dessein en salle, PARCE QUE
 *     `signal_history` l'est (une offre ne se désigne que par sa ligne
 *     d'historique) — et cette raison est écrite, pas devinée.
 */
// Le dossier RÉELLEMENT semé du compte du fil — jamais une copie.
const signals =
  DEMO_DOSSIERS.find(dossier => dossier.account.company_name === DEMO_JOB_OFFER_THREAD.accountName)?.account
    .recent_signals ?? []

describe('Théo L1 — l’offre d’emploi en démo', () => {
  it('le compte du fil est le compte phare de la salle', () => {
    expect(DEMO_JOB_OFFER_THREAD.accountName).toBe(DEMO_DELIVERY_CLIENT.account.company_name)
  })

  it('le fil part d’une offre RÉELLEMENT semée — un signal de recrutement du dossier', () => {
    const offer = signals.find(signal => signal.signal === DEMO_JOB_OFFER_THREAD.offerLabel)
    expect(offer?.type).toBe('recrutement')
  })

  it('la réponse ne dit que ce que l’offre dit — sa date et son lieu — et ne nomme aucune source', () => {
    const offer = signals.find(signal => signal.signal === DEMO_JOB_OFFER_THREAD.offerLabel)
    const answers = DEMO_JOB_OFFER_THREAD.turns.map(turn => turn.answer).join(' ')
    expect(answers).toContain('2 octobre 2026')
    expect(offer?.date).toBe('2026-10-02')
    expect(answers).toContain('Saint-Denis')
    expect(answers).not.toMatch(/France Travail|APEC|Indeed|Welcome to the Jungle|fournisseur/i)
  })

  it('Laura tutoie', () => {
    const answers = DEMO_JOB_OFFER_THREAD.turns.map(turn => turn.answer).join(' ')
    expect(answers).toMatch(/\b(tu|te|ton|ta|tes|toi)\b/)
    expect(answers).not.toMatch(/\bvous\b/i)
  })

  it('est réellement écrit par le semis (jamais une constante que personne n’appelle)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_JOB_OFFER_THREAD')
  })

  it('la nouveauté est classée : le fil SEEDÉ, l’onglet vide à dessein PARCE QUE `signal_history` l’est', () => {
    expect(DEMO_JOB_OFFER_COVERAGE.thread.state).toBe('seede')
    expect(DEMO_JOB_OFFER_COVERAGE.selector_tab.state).toBe('vide_a_dessein')
    expect(DEMO_JOB_OFFER_COVERAGE.selector_tab.reason).toMatch(/signal_history/)
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).toContain('signal_history')
  })
})
