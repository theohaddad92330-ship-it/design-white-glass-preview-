// ── Le prédicat UNIQUE « cette offre est un stage » (#4044) ───────────────────
// Décision tranchée (Louis 12/10) : « pas d'offres de stages dans tous les
// signaux ». Une offre de STAGE ne devient jamais un signal — veille, Mes
// cibles, Découvrir, cloche, Laura. L'ALTERNANCE n'est PAS tranchée : elle ne
// passe pas par ici. Jumeau Python : `is_internship_posting`
// (apps/ia/app/services/internship_posting.py) ; les deux lisent le MÊME jeu
// de cas, `fixtures/internship-postings.json`.

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// « stage(s) » ou « stagiaire(s) » comme MOT : ni « backstage »/« staging »/« stagnation »
// (lettre accolée), ni « multi-stage » (composé à tiret) ; « BAC5Stage » passe (chiffre accolé).
// « intern(s) »/« internship(s) » idem — jamais « international »/« internal ».
const INTERNSHIP_WORD = /(?<![a-z]-)(?<![a-z])(?:stages?|stagiaires?|interns?|internships?)(?![a-z])(?!-[a-z]*stage)/
// Le théâtre n'est pas un contrat : « stage manager/hand/director ».
const STAGE_THEATRE = /(?<![a-z])stage\s+(?:manager|hand|director|technician)s?(?![a-z])/

/**
 * #4044 — vrai si l'intitulé OU le type de contrat dit « stage » (stage,
 * stagiaire, internship, intern, « Bac+N Stage », convention de stage).
 * Insensible à la casse et aux accents ; une valeur absente n'est pas un stage.
 */
export function isInternshipPosting(title: unknown, contractType?: unknown): boolean {
  for (const value of [title, contractType]) {
    if (typeof value !== 'string' || value.trim() === '') continue
    const folded = fold(value)
    if (STAGE_THEATRE.test(folded)) continue
    if (INTERNSHIP_WORD.test(folded)) return true
  }
  return false
}

const LABEL_KEYS = ['signal', 'title', 'label', 'name'] as const
const CONTRACT_KEYS = ['contractType', 'contract_type'] as const
const JOB_TYPES = new Set(['recrutement', 'hiring', 'recruitment'])

function firstString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function isJobRow(row: Record<string, unknown>): boolean {
  const type = typeof row['type'] === 'string' ? row['type'].toLowerCase() : ''
  const kind = row['source_kind'] ?? row['sourceKind']
  return JOB_TYPES.has(type) || kind === 'job'
}

/**
 * #4044 — écarte d'une liste les lignes qui sont des offres de stage. Lecture
 * seule (on n'efface rien en base : on archive, on ne supprime pas) : c'est le
 * rattrapage des signaux DÉJÀ stockés. `jobsOnly` : la liste mêle des natures
 * (`recent_signals`) — seule une ligne de recrutement est jugée, une actualité
 * qui dit « stage » reste. Sans `jobsOnly`, toute ligne EST une offre
 * (`it_job_signals`). Non-tableau → `[]` ; ligne illisible → gardée.
 */
export function dropInternshipRows(rows: unknown, options: { jobsOnly?: boolean } = {}): unknown[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return true
    const record = row as Record<string, unknown>
    if (options.jobsOnly && !isJobRow(record)) return true
    return !isInternshipPosting(firstString(record, LABEL_KEYS), firstString(record, CONTRACT_KEYS))
  })
}

/**
 * #4044 — un compte servi SANS ses signaux de stage : `recent_signals`,
 * `raw_analysis.recent_signals` et `raw_analysis.it_job_signals` (+ camelCase).
 * Pure : renvoie le même objet quand rien ne change.
 */
export function withoutInternshipSignals<T extends { recent_signals?: unknown; raw_analysis?: unknown }>(
  account: T,
): T {
  let next: T = account
  if (Array.isArray(account.recent_signals)) {
    const kept = dropInternshipRows(account.recent_signals, { jobsOnly: true })
    if (kept.length !== account.recent_signals.length) next = { ...next, recent_signals: kept }
  }
  const raw = account.raw_analysis
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    let patched: Record<string, unknown> | null = null
    for (const [key, jobsOnly] of [
      ['recent_signals', true],
      ['recentSignals', true],
      ['it_job_signals', false],
      ['itJobSignals', false],
    ] as const) {
      const list = (raw as Record<string, unknown>)[key]
      if (!Array.isArray(list)) continue
      const kept = dropInternshipRows(list, { jobsOnly })
      if (kept.length !== list.length) patched = { ...(patched ?? (raw as Record<string, unknown>)), [key]: kept }
    }
    if (patched) next = { ...next, raw_analysis: patched }
  }
  return next
}
