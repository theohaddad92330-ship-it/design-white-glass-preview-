import { readRecentSignals } from '@bellum/contracts'
import { signalHistoryKey } from '../signal-history/signal-history.projection'

// #4045.1 — LE RATTRAPAGE DES LIENS D'OFFRE, SANS RÉSEAU.
// `recent_signals` (le blob d'où Découvrir lit le lien) n'a reçu `url` qu'avec #3922.3 ; les offres
// brutes, elles, vivent depuis toujours dans `raw_analysis.it_job_signals` AVEC leur URL. Un
// compte analysé avant n'a donc pas perdu le lien : il ne l'a pas recopié. On le recopie ici —
// même intitulé, même jour, une seule URL possible ; sinon rien (jamais deviné, jamais cherché).

type BackfillResult = { signals: Record<string, unknown>[]; patched: number; ambiguous: number }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
const HTTP_URL = /^https?:\/\/\S+$/i

function day(value: unknown): string {
  const match = typeof value === 'string' ? ISO_DAY.exec(value.trim()) : null
  return match ? match[0] : ''
}

function jobKey(job: Record<string, unknown>): string {
  return typeof job['title'] === 'string' ? signalHistoryKey(job['title']) : ''
}

export function backfillRecruitmentUrls(recentSignals: unknown, itJobSignals: unknown): BackfillResult {
  const raw = Array.isArray(recentSignals) ? (recentSignals as unknown[]) : []
  const signals = raw.map(item => (item && typeof item === 'object' ? { ...(item as Record<string, unknown>) } : {}))
  const jobs = (Array.isArray(itJobSignals) ? (itJobSignals as unknown[]) : []).filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === 'object' && !Array.isArray(item) && !(item as Record<string, unknown>)['intermediated'],
  )

  // Les signaux de recrutement SANS lien, par (intitulé normalisé, jour) : deux signaux de même clé
  // se disputeraient la même offre — aucun ne la reçoit.
  const read = readRecentSignals(raw)
  const candidates = read.filter(s => s.type === 'recrutement' && !s.source_url)
  // `readRecentSignals` fusionne les doublons exacts : le décompte se fait donc sur la liste BRUTE.
  const slots = new Map<string, number>()
  for (const item of signals) {
    if (item['type'] !== 'recrutement' || item['url']) continue
    const label = [item['signal'], item['title'], item['label']].find(v => typeof v === 'string' && v.trim())
    if (typeof label !== 'string') continue
    const slot = `${signalHistoryKey(label)}|${day(item['date'])}`
    slots.set(slot, (slots.get(slot) ?? 0) + 1)
  }

  let patched = 0
  let ambiguous = 0
  for (const s of candidates) {
    const key = signalHistoryKey(s.label)
    const signalDay = day(s.date)
    if ((slots.get(`${key}|${signalDay}`) ?? 0) > 1) {
      ambiguous += 1
      continue
    }
    const urls = new Set<string>()
    for (const job of jobs) {
      if (jobKey(job) !== key) continue
      if (signalDay && day(job['date']) !== signalDay) continue
      const url = typeof job['url'] === 'string' ? job['url'].trim() : ''
      if (HTTP_URL.test(url)) urls.add(url)
    }
    if (urls.size === 0) continue
    if (urls.size > 1) {
      ambiguous += 1
      continue
    }
    const target = signals[s.index]
    if (!target) continue
    target['url'] = [...urls][0]
    if (!target['source_kind']) target['source_kind'] = 'job'
    patched += 1
  }
  return { signals, patched, ambiguous }
}
