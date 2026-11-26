import { describe, expect, it } from 'vitest'
import { lauraPageContextSchema } from '@bellum/contracts'
import { sequencesLauraContext } from './sequences-laura-context'

/**
 * #1904.11 — L'ÉCRAN SÉQUENCES DIT À LAURA QU'IL ATTEND UNE CONNEXION.
 *
 * Sans messagerie, les séquences se préparent mais rien ne part : Laura doit le
 * savoir AVANT de proposer une relance. L'état inconnu de la messagerie (lecture
 * en cours ou en échec) ne se dit pas « non connectée ».
 */
const t = ((key: string) => key) as unknown as Parameters<typeof sequencesLauraContext>[0]

const COUNTS = { active: 3, dueToday: 1, replied: 2, blocked: 0 }
const READY = { isLoading: false, total: 6, counts: COUNTS, mailboxConnected: true as boolean | null }

describe('sequencesLauraContext', () => {
  it('déclare l’utilité, le total et les quatre compteurs de l’écran', () => {
    const context = sequencesLauraContext(t, READY)
    expect(context.purpose).toBe('page.subtitle')
    expect(context.facets).toEqual([
      { label: 'laura.total', value: '6' },
      { label: 'kpi.active', value: '3' },
      { label: 'kpi.dueToday', value: '1' },
      { label: 'kpi.replied', value: '2' },
      { label: 'kpi.blocked', value: '0' },
    ])
    expect(context.actions).toEqual(['page.create'])
    expect(context.missing).toBeUndefined()
  })

  it('une messagerie MESURÉE non connectée est un manque nommé', () => {
    const context = sequencesLauraContext(t, { ...READY, mailboxConnected: false })
    expect(context.missing).toEqual(['laura.mailboxMissing'])
  })

  it('une messagerie dont l’état est INCONNU ne se dit pas « non connectée »', () => {
    const context = sequencesLauraContext(t, { ...READY, mailboxConnected: null })
    expect(context.missing).toBeUndefined()
  })

  it('aucune séquence : le manque, et la porte que l’état vide affiche vraiment', () => {
    const connected = sequencesLauraContext(t, { ...READY, total: 0, counts: null })
    expect(connected.missing).toEqual(['page.empty.title'])
    expect(connected.actions).toEqual(['page.create', 'page.empty.cta'])

    const disconnected = sequencesLauraContext(t, { ...READY, total: 0, counts: null, mailboxConnected: false })
    expect(disconnected.missing).toEqual(['laura.mailboxMissing', 'page.empty.title'])
    expect(disconnected.actions).toEqual(['page.create', 'page.empty.ctaConnect'])
  })

  it('une lecture qui n’a pas abouti ne déclare aucun compteur — non mesuré n’est pas zéro', () => {
    const context = sequencesLauraContext(t, { ...READY, total: null, counts: null })
    expect(context.facets).toEqual([])
    expect(context.missing).toBeUndefined()
  })

  it('se déclare en chargement, et reste un contexte valide', () => {
    const context = sequencesLauraContext(t, { ...READY, isLoading: true, total: null, counts: null })
    expect(context.state).toBe('loading')
    expect(lauraPageContextSchema.safeParse(sequencesLauraContext(t, READY)).success).toBe(true)
  })
})
