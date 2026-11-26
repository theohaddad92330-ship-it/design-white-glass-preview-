import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEED_OPEN_STATUSES, type OpenNeedRow } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { needCardFoot } from './need-card-foot'

/**
 * LE PIED CONTEXTUEL DES CARTES DU KANBAN (source PDF-03:169-170, relevé C20).
 *
 * Ce qui se garde ici, et pourquoi chaque assertion existe :
 *
 *  1. **Chaque colonne ouverte a un pied**, et il est TRADUIT des deux côtés.
 *     Une clé i18n manquante ne casse rien à l'exécution — elle affiche son
 *     propre nom, ce qui passe inaperçu en CI et se découvre en réunion.
 *  2. **Deux colonnes ne disent pas la même chose** : c'est le défaut qu'on
 *     ferme. Un pied identique partout est un pied qui n'aide personne.
 *  3. **Un zéro vrai reste un zéro** (aucun profil positionné) et une absence
 *     reste une absence (aucun changement d'état enregistré). Les deux se
 *     ressemblent à l'œil et appellent des gestes opposés.
 *
 * ⚠️ La garde prouve aussi qu'elle LIT quelque chose : sans les deux assertions
 * de corpus non vide, un jour où `NEED_OPEN_STATUSES` serait vide ou le
 * dictionnaire déplacé, toutes les boucles passeraient au vert sur du néant.
 */
const LOCALES = join(__dirname, '../../../../i18n/locales')
const FR = JSON.parse(readFileSync(join(LOCALES, 'fr/projects.json'), 'utf8')) as Record<string, unknown>
const EN = JSON.parse(readFileSync(join(LOCALES, 'en/projects.json'), 'utf8')) as Record<string, unknown>

/** Résout `a.b.c` dans un dictionnaire, en tenant compte des suffixes de pluriel. */
function resolve(dict: Record<string, unknown>, key: string, count: number | null): string | null {
  const path = key.split('.')
  let node: unknown = dict
  for (const part of path) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as Record<string, unknown>)[part]
  }
  if (typeof node === 'string') return count === null ? node : null
  if (count === null) return null
  // i18next cherche `_one` / `_other` dès qu'un `count` est passé.
  const parent = path
    .slice(0, -1)
    .reduce<unknown>(
      (acc, part) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined),
      dict,
    )
  if (typeof parent !== 'object' || parent === null) return null
  const leaf = path[path.length - 1] as string
  const forms = parent as Record<string, unknown>
  const one = forms[`${leaf}_one`]
  const other = forms[`${leaf}_other`]
  if (typeof one !== 'string' || typeof other !== 'string') return null
  return count === 1 ? one : other
}

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Architecte plateforme',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'to_qualify',
    status_reason: null,
    status_changed_at: '2026-08-01T10:00:00.000Z',
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Plateforme',
    project_stage: 'qualified',
    account_id: null,
    account_name: 'ACME',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

const NOW = new Date('2026-08-27T10:00:00.000Z')

describe('le pied contextuel d’une carte du kanban', () => {
  it('la garde LIT quelque chose — sinon elle serait verte pour toujours', () => {
    expect(NEED_OPEN_STATUSES.length).toBeGreaterThan(5)
    const foot = ((FR as Record<string, Record<string, unknown>>)['needsKanban'] ?? {})['foot']
    expect(Object.keys(foot as Record<string, unknown>).length).toBeGreaterThan(10)
  })

  it('chaque colonne ouverte porte un pied, traduit en FR ET en EN', () => {
    for (const status of NEED_OPEN_STATUSES) {
      // Les deux formes qu'une colonne peut rencontrer : rien sur la table, et
      // quelque chose sur la table. Une clé manquante sur l'une des deux fait
      // afficher son propre nom à l'écran.
      for (const row of [
        need({ status, shortlist_count: 0, status_changed_at: '2026-08-15T10:00:00.000Z' }),
        need({ status, shortlist_count: 3, status_changed_at: '2026-08-26T10:00:00.000Z' }),
      ]) {
        const foot = needCardFoot(row, NOW)
        expect(foot, `pied manquant pour ${status}`).not.toBeNull()
        expect(resolve(FR, foot?.key ?? '', foot?.count ?? null), `FR manquant : ${foot?.key}`).toBeTruthy()
        expect(resolve(EN, foot?.key ?? '', foot?.count ?? null), `EN manquant : ${foot?.key}`).toBeTruthy()
      }
    }
  })

  it('deux colonnes ne disent PAS la même chose — c’est tout le point', () => {
    const waiting = needCardFoot(need({ status: 'to_qualify' }), NOW)
    const presenting = needCardFoot(need({ status: 'submitted', shortlist_count: 2 }), NOW)
    expect(waiting?.key).not.toBe(presenting?.key)
    // Et les colonnes de la MÊME famille ne se recopient pas non plus.
    const matching = needCardFoot(need({ status: 'matching', shortlist_count: 2 }), NOW)
    expect(matching?.key).not.toBe(presenting?.key)
  })

  it('un besoin qui n’a jamais changé d’état ne dit PAS « 0 j »', () => {
    const foot = needCardFoot(need({ status: 'on_hold', status_changed_at: null }), NOW)
    expect(foot?.key).toBe('needsKanban.foot.stageAgeUnknown')
    expect(foot?.count).toBeNull()
  })

  it('le jour même a sa phrase — « depuis 0 j » est vrai et illisible', () => {
    const foot = needCardFoot(need({ status: 'client_review', status_changed_at: '2026-08-27T08:00:00.000Z' }), NOW)
    expect(foot?.key).toBe('needsKanban.foot.enteredToday')
  })

  it('l’âge est celui de l’ÉTAPE et il est compté en jours entiers', () => {
    const foot = needCardFoot(need({ status: 'qualified', status_changed_at: '2026-08-15T10:00:00.000Z' }), NOW)
    expect(foot).toEqual({ key: 'needsKanban.foot.qualified', count: 12 })
  })

  it('zéro profil positionné est une VRAIE réponse, jamais « non mesuré »', () => {
    // « Besoins ouverts sans shortlist, seuil 0 » est l'un des indicateurs de la
    // source : le faire passer par « non mesuré » inverserait le sens de l'écran.
    const foot = needCardFoot(need({ status: 'submitted', shortlist_count: 0 }), NOW)
    expect(foot?.key).toBe('needsKanban.foot.submitted_none')
    expect(foot?.key).not.toContain('stageAgeUnknown')
  })

  it('un état CLOS n’a pas de pied — il n’a pas de colonne dans cet écran', () => {
    expect(needCardFoot(need({ status: 'won' }), NOW)).toBeNull()
    expect(needCardFoot(need({ status: 'lost' }), NOW)).toBeNull()
  })

  it('le pied ne porte AUCUN seuil ni aucune sévérité — la « durée type » n’existe nulle part', () => {
    // Une couleur suppose un objectif, et l'objectif n'a jamais été tranché.
    // La forme rendue le garantit : deux champs, aucun verdict.
    const foot = needCardFoot(need({ status: 'to_qualify', status_changed_at: '2025-01-01T10:00:00.000Z' }), NOW)
    expect(Object.keys(foot ?? {}).sort()).toEqual(['count', 'key'])
  })
})
