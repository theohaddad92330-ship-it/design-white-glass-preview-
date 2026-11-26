import { describe, expect, it } from 'vitest'
import { accountListQuerySchema, type AccountListQuery } from '@bellum/contracts'
import { buildQueryString } from './api'

/**
 * TOUT FILTRE DÉCLARÉ DOIT TRAVERSER — LA GARDE D'UN DÉFAUT PAYÉ DEUX FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildQueryString` est une LISTE BLANCHE. Un filtre peut donc être :
 * déclaré au contrat, accepté par le serveur, posé dans l'URL de l'écran, passé
 * à `useAccounts` — et ne JAMAIS partir, parce que son nom n'est pas écrit dans
 * cette fonction. Rien ne rougit : la clé de cache porte l'objet `filters`
 * entier, donc React Query refait bien l'appel, mais vers la MÊME URL. L'écran
 * rend la liste NON filtrée sous un libellé qui promet un filtre.
 *
 * Deux occurrences mesurées en production le 08/09/2026 :
 *   · `entityKind` — `?entityKind=subsidiary` rend 1 compte sur 6 côté API,
 *     l'écran en montrait 6. Mort depuis le 31/08 ;
 *   · `marketCovered` (#1575.1) — trouvé à la recette du lot qui l'introduisait,
 *     compteur à 4 au-dessus d'une liste de 6.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE D'ÉCHANTILLONS, ET PAS UNE GÉNÉRATION AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque filtre a sa propre notion de « valeur qui filtre » : `'all'` ne filtre
 * rien pour quatre d'entre eux, `offset: 0` est une valeur légitime, `q` est
 * libre. Deviner une valeur depuis le schéma produirait des faux rouges.
 *
 * La table ci-dessous est donc écrite à la main — et c'est le PREMIER test qui
 * l'empêche de vieillir : il compare ses clés à celles du schéma. Ajouter un
 * filtre au contrat sans l'ajouter ici fait échouer la garde AVANT que le
 * filtre ne parte muet en production.
 */

/** Pour chaque filtre du contrat : une valeur qui DOIT se retrouver dans l'URL. */
const SAMPLES: Record<keyof AccountListQuery, string | number> = {
  q: 'thales',
  status: 'completed',
  lifecycle: 'opportunity',
  sort: 'name_asc',
  sector: 'banque',
  // #2159.26 — l'étiquette.
  tag: 'sap',
  score: 'high',
  gate: 'passed',
  entityKind: 'subsidiary',
  headline: 'withoutNextAction',
  marketCovered: 'covered',
  // #2150.13 — la vue « À actualiser ».
  freshness: 'stale',
  // #2150.14/.18 — « Mes favoris », rétabli.
  favorite: 'mine',
  // #2150.15 — « Portés par un collègue ».
  ownership: 'teammate',
  offset: 50,
  limit: 25,
  // #3184.1 — usage interne (copilot-bridge), pas exposé côté écran, mais
  // déclaré au contrat : la garde ne fait pas d'exception.
  reusableOnly: 'true',
  // #4498.c — Historique documenté, Références autorisées.
  documentedHistory: 'with',
  authorizedReferences: 'only',
  // #4526.2 — « Mon CRM ».
  crm: 'only',
  // #4597.1 — « Importés » ; #4597.3 — les comptes de CET import (identifiant du job).
  imported: 'only',
  importJob: '33333333-3333-4333-8333-333333333333',
}

describe('buildQueryString — tout filtre déclaré traverse', () => {
  /**
   * ⚠️ LE TEST QUI FAIT QUE CETTE GARDE N'EST PAS BORGNE. Sans lui, ajouter un
   * filtre au contrat le laisserait hors de `SAMPLES`, donc hors de tout ce que
   * les tests suivants vérifient — la garde resterait verte en ne regardant
   * rien de nouveau.
   */
  it('couvre EXACTEMENT les filtres du contrat, ni plus ni moins', () => {
    const contractKeys = Object.keys(accountListQuerySchema.shape).sort()
    expect(Object.keys(SAMPLES).sort()).toEqual(contractKeys)
    // Et le corpus n'est pas vide : une garde qui ne lit rien passe toujours.
    expect(contractKeys.length).toBeGreaterThan(8)
  })

  it('écrit CHAQUE filtre dans la chaîne de requête', () => {
    const manquants = (Object.keys(SAMPLES) as Array<keyof AccountListQuery>).filter(key => {
      const qs = buildQueryString({ [key]: SAMPLES[key] } as AccountListQuery)
      return !new URLSearchParams(qs.replace(/^\?/, '')).has(key)
    })

    expect(manquants).toEqual([])
  })

  it('les écrit TOUS ENSEMBLE, pas seulement un par un', () => {
    const params = new URLSearchParams(buildQueryString(SAMPLES as unknown as AccountListQuery).replace(/^\?/, ''))

    for (const key of Object.keys(SAMPLES)) {
      expect(params.get(key), `« ${key} » ne traverse pas`).toBe(String(SAMPLES[key as keyof AccountListQuery]))
    }
  })

  /**
   * L'autre moitié de la règle : `'all'` est l'idiome du dépôt pour « pas de
   * filtre ». L'envoyer ferait porter au serveur un axe que personne n'a
   * demandé — cette garde ne doit pas attraper ce qu'elle ne vise pas.
   */
  it('n’envoie PAS « all », qui veut dire « pas de filtre »', () => {
    const qs = buildQueryString({
      status: 'all',
      lifecycle: 'all',
      gate: 'all',
      entityKind: 'all',
      marketCovered: 'all',
      favorite: 'all',
      ownership: 'all',
    } as AccountListQuery)

    expect(qs).toBe('')
  })

  it('#4498.a — un axe coché à plusieurs écrit une valeur répétée par choix, « all » écarté', () => {
    const qs = buildQueryString({
      sector: ['Banque', 'Assurance'],
      lifecycle: ['customer', 'all', 'opening'],
      score: ['high', 'low'],
    } as AccountListQuery)
    const params = new URLSearchParams(qs.replace(/^\?/, ''))
    expect(params.getAll('sector')).toEqual(['Banque', 'Assurance'])
    expect(params.getAll('lifecycle')).toEqual(['customer', 'opening'])
    expect(params.getAll('score')).toEqual(['high', 'low'])
  })

  it('un filtre absent ne s’invente pas', () => {
    expect(buildQueryString({})).toBe('')
  })
})
