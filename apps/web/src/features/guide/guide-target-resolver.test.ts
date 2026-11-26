import { afterEach, describe, expect, it } from 'vitest'
import { GUIDE_ANCHOR_ATTRIBUTE } from './guide-anchors'
import { resolveGuideAnchor } from './guide-target-resolver'

const PRIMARY = 'retour.bouton-declencheur'
const FALLBACK = 'retour.panneau'

function place(anchor: string) {
  const el = document.createElement('button')
  el.setAttribute(GUIDE_ANCHOR_ATTRIBUTE, anchor)
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('résoudre une cible de guide', () => {
  it('résout tout de suite une cible déjà présente', async () => {
    place(PRIMARY)
    const resolution = await resolveGuideAnchor({ anchor: PRIMARY, timeoutMs: 80 })
    expect(resolution).toEqual({ state: 'resolved', anchor: PRIMARY, viaFallback: false })
  })

  /**
   * #2212.24 / #2212.31 — une cible qui apparaît EN RETARD. Le moteur attend
   * qu'elle arrive au lieu de la déclarer absente au premier coup d'œil.
   */
  it('attend une cible qui arrive en retard, et la résout', async () => {
    const pending = resolveGuideAnchor({ anchor: PRIMARY, timeoutMs: 400 })
    setTimeout(() => place(PRIMARY), 30)
    await expect(pending).resolves.toEqual({ state: 'resolved', anchor: PRIMARY, viaFallback: false })
  })

  /**
   * #2212.36 — la cible de SECOURS. Elle est essayée quand la principale n'est
   * jamais venue, et le verdict DIT que c'est le secours qui a répondu : la
   * mesure distingue « ça a marché » de « ça a marché de justesse ».
   */
  it('retombe sur la cible de secours, et le dit', async () => {
    place(FALLBACK)
    const resolution = await resolveGuideAnchor({ anchor: PRIMARY, fallbackAnchor: FALLBACK, timeoutMs: 60 })
    expect(resolution).toEqual({ state: 'resolved', anchor: FALLBACK, viaFallback: true })
  })

  it('préfère la cible principale quand les deux sont là', async () => {
    place(PRIMARY)
    place(FALLBACK)
    const resolution = await resolveGuideAnchor({ anchor: PRIMARY, fallbackAnchor: FALLBACK, timeoutMs: 60 })
    expect(resolution).toEqual({ state: 'resolved', anchor: PRIMARY, viaFallback: false })
  })

  /**
   * #2212.41 — N'ATTEND JAMAIS INDÉFINIMENT. C'est la contrainte négative la
   * plus facile à croire tenue sans l'être : le test mesure le temps écoulé.
   */
  it('renonce sur un délai BORNÉ quand rien n’arrive', async () => {
    const started = Date.now()
    const resolution = await resolveGuideAnchor({ anchor: PRIMARY, timeoutMs: 60 })
    expect(resolution).toEqual({ state: 'absent', anchor: PRIMARY, reason: 'timeout' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('renonce aussi quand la cible de secours n’arrive pas davantage', async () => {
    const resolution = await resolveGuideAnchor({ anchor: PRIMARY, fallbackAnchor: FALLBACK, timeoutMs: 60 })
    expect(resolution).toEqual({ state: 'absent', anchor: PRIMARY, reason: 'timeout' })
  })

  /**
   * #2212.37 — un ancrage que PERSONNE n'a déclaré accuse le dépôt, pas la
   * situation : c'est un pas de guide qui vise un élément supprimé par un
   * remaniement. Il ne sert à rien d'attendre 1,2 s pour l'apprendre.
   */
  it('dit tout de suite qu’un ancrage n’a jamais été déclaré', async () => {
    const started = Date.now()
    const resolution = await resolveGuideAnchor({ anchor: 'inconnu.jamais-declare', timeoutMs: 400 })
    expect(resolution).toEqual({ state: 'absent', anchor: 'inconnu.jamais-declare', reason: 'anchor-undeclared' })
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('traite le rail de navigation comme non déclaré — #1787', async () => {
    const resolution = await resolveGuideAnchor({ anchor: 'rail-de-navigation.comptes', timeoutMs: 60 })
    expect(resolution.state).toBe('absent')
  })

  /**
   * #2212.38/.39 — ne bloque jamais, ne fait jamais planter. Elle REND toujours
   * un verdict, y compris quand on l'annule : un appelant qui attend une
   * promesse qui ne se règle jamais est exactement « l'application bloquée ».
   */
  it('rend un verdict même annulée, et ne rejette jamais', async () => {
    const controller = new AbortController()
    const pending = resolveGuideAnchor({ anchor: PRIMARY, timeoutMs: 5000, signal: controller.signal })
    controller.abort()
    await expect(pending).resolves.toEqual({ state: 'absent', anchor: PRIMARY, reason: 'timeout' })
  })
})
