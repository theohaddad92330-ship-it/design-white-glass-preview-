import type { PilotageMetric } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { formatRate, levelReading, metricTone } from './chain-reading'

/** Un `t` de test : il rend la clé et ses paramètres, sans i18n. */
const t = (key: string, options?: Record<string, unknown>) =>
  options && 'value' in options ? `${key}:${String(options.value)}` : key

const metric = (value: number | null, status: PilotageMetric['status']): Pick<PilotageMetric, 'value' | 'status'> => ({
  value,
  status,
})

describe('formatRate — un pourcentage ne ment jamais sur zéro', () => {
  it('écrit « < 1 % » plutôt que « 0 % » quand le taux est strictement positif', () => {
    // Le défaut de la recette live du 30/08 : 12 corrections sur 2 500 contacts
    // valent 0,48 %. Arrondi à l'entier, cela s'écrivait « 0 % » — à deux
    // centimètres de « Éléments corrigés 12 ». Les deux chiffres de la même
    // carte se contredisaient.
    expect(formatRate(12 / 2500, t)).toBe('rate.belowOne')
    expect(formatRate(0.0001, t)).toBe('rate.belowOne')
    expect(formatRate(0.00499, t)).toBe('rate.belowOne')
  })

  it('mais un taux VRAIMENT nul s’écrit « 0 % » — c’est une mesure', () => {
    // Le défaut symétrique, et il est aussi grave : « 0 réponse sur 300 emails »
    // est exactement le décrochage que la chaîne existe pour crier.
    expect(formatRate(0, t)).toBe('rate.exact:0')
  })

  it('n’écrit pas non plus « 100 % » sur un taux qui n’est pas plein', () => {
    expect(formatRate(0.999, t)).toBe('rate.aboveNinetyNine')
    expect(formatRate(1, t)).toBe('rate.exact:100')
  })

  it('arrondit normalement partout ailleurs', () => {
    expect(formatRate(0.42, t)).toBe('rate.exact:42')
    expect(formatRate(0.096, t)).toBe('rate.exact:10')
    expect(formatRate(0.005, t)).toBe('rate.exact:1')
  })
})

describe('metricTone — un zéro MESURÉ ne se peint pas comme un inconnu', () => {
  it('un zéro lu est « mesuré », même quand il n’y a rien à juger', () => {
    // « Clients actifs 0 » sur la carte Expansion : la valeur a été LUE
    // (`COUNT(*) FILTER (WHERE commercial_status = 'customer')`), elle vaut
    // zéro, et c'est vrai. Elle portait pourtant le gris de « non mesuré ».
    expect(metricTone(metric(0, 'non_mesure'))).toBe('measured')
  })

  it('une valeur NON LUE est « inconnue »', () => {
    expect(metricTone(metric(null, 'non_mesure'))).toBe('unknown')
  })

  it('un décrochage reste un décrochage', () => {
    expect(metricTone(metric(0, 'alerte'))).toBe('alert')
    expect(metricTone(metric(12, 'ok'))).toBe('measured')
  })

  it('la couleur se décide sur la VALEUR, jamais sur le seul statut', () => {
    // Deux indicateurs de même STATUT et de valeurs différentes ne doivent pas
    // se rendre pareil — c'est toute la question.
    expect(metricTone(metric(0, 'non_mesure'))).not.toBe(metricTone(metric(null, 'non_mesure')))
  })
})

describe('levelReading — « pas lu » et « rien à juger » sont deux états', () => {
  const level = (status: PilotageMetric['status'], values: (number | null)[]) => ({
    status,
    metrics: values.map((value, index) => ({ key: `m${index}`, value, unit: 'count' as const, status })),
  })

  it('un maillon dont RIEN n’a été lu est « non lu »', () => {
    expect(levelReading(level('non_mesure', [null, null]))).toBe('unread')
  })

  it('un maillon lu dont rien ne se juge n’est PAS « non lu »', () => {
    expect(levelReading(level('non_mesure', [0]))).toBe('nothingToJudge')
    expect(levelReading(level('non_mesure', [null, 0]))).toBe('nothingToJudge')
  })

  it('les deux états jugés restent eux-mêmes', () => {
    expect(levelReading(level('ok', [12]))).toBe('ok')
    expect(levelReading(level('alerte', [0]))).toBe('alerte')
  })
})
