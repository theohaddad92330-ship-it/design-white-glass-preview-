import { applyResolutionOverride, type MarketResolutionOverride } from './market-resolution-override'
import type { MarketResolution } from './market-company-resolution'

/**
 * #1617.4 — UNE CORRECTION HUMAINE GAGNE TOUJOURS, ET ELLE NE RÉÉCRIT RIEN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QUE CE FICHIER BOUCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketReviewQueue.tsx` le disait lui-même, en toutes lettres, avant ce lot :
 *
 *   « "relation corrigée par utilisateur" n'a AUCUN mécanisme dans le produit :
 *     rien n'enregistre qu'un humain a corrigé une observation de mémoire
 *     marché, et la mémoire est PARTAGÉE entre espaces concurrents — une
 *     correction d'un espace ne la réécrit jamais. »
 *
 * Les deux moitiés de cette phrase sont vraies et ne se contredisent pas : la
 * mémoire reste en lecture seule POUR TOUT LE PRODUIT, et la correction vit
 * dans une table SCOPÉE par espace. Le registre des tables l'avait d'ailleurs
 * déjà écrit pour `market_company_signal` : « une correction d'espace PRIME sur
 * l'observation partagée sans jamais la réécrire ».
 *
 * Ce fichier est la moitié PURE de ce mécanisme — l'arbitrage entre ce que le
 * rapprochement a CALCULÉ et ce qu'un humain a DÉCIDÉ. Aucune base, aucun
 * réseau : c'est la règle, et elle se teste seule.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET SON SEUL CAS LIMITE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une correction humaine gagne toujours, quelle que soit sa date » — doctrine
 * du dépôt, tenue ailleurs par `applyFieldUpdates` / `decideFieldWrite`.
 *
 * Le cas limite est `unavailable`, et il se tranche dans les deux sens :
 *
 * · un override POSITIF gagne même sur `unavailable` — l'humain a désigné une
 *   entreprise, ce fait ne dépend pas de notre capacité à lire le corpus ce
 *   matin ;
 * · un override NÉGATIF ne gagne PAS sur `unavailable` — il écarte une lecture,
 *   et il n'y a rien à écarter quand on n'a rien lu. Conclure `unresolved` ici
 *   transformerait une panne en affirmation sur le marché, ce que le quatrième
 *   état de `MarketResolution` a précisément été créé pour empêcher.
 */

const RESOLVED: MarketResolution = {
  status: 'resolved',
  companyKey: 'societe generale',
  strength: 'domain',
  matchedOn: 'domain',
  pathsTotal: 267,
  ambiguityDropped: null,
}

const REVIEWED_AT = new Date('2026-09-11T08:00:00.000Z')
const REVIEWER = '11111111-1111-4111-8111-111111111111'

const confirmed = (key: string): MarketResolutionOverride => ({
  kind: 'confirmed',
  marketCompanyKey: key,
  reviewedAt: REVIEWED_AT,
  reviewedBy: REVIEWER,
})

const dismissed = (): MarketResolutionOverride => ({
  kind: 'dismissed',
  reviewedAt: REVIEWED_AT,
  reviewedBy: REVIEWER,
})

describe('applyResolutionOverride — sans correction humaine', () => {
  it('rend le calcul INCHANGÉ, à l’identité près', () => {
    expect(applyResolutionOverride(RESOLVED, null)).toBe(RESOLVED)
  })

  it('laisse passer les quatre états du calcul sans en inventer un cinquième', () => {
    const etats: readonly MarketResolution[] = [
      RESOLVED,
      { status: 'ambiguous', ambiguity: { on: 'name', candidates: 3 } },
      { status: 'unresolved' },
      { status: 'unavailable', reason: 'lecture impossible' },
    ]
    for (const etat of etats) expect(applyResolutionOverride(etat, null)).toBe(etat)
  })
})

describe('applyResolutionOverride — une correction POSITIVE', () => {
  it('gagne sur un calcul qui avait trouvé AUTRE CHOSE', () => {
    const out = applyResolutionOverride(RESOLVED, confirmed('bnp paribas'))
    expect(out).toMatchObject({ status: 'resolved', companyKey: 'bnp paribas' })
  })

  it('se DIT : la force et le côté du rapprochement valent « manual »', () => {
    const out = applyResolutionOverride(RESOLVED, confirmed('bnp paribas'))
    // Sans ça, un override serait indiscernable d'un rapprochement par domaine —
    // et on ne pourrait jamais compter ce que la revue humaine a corrigé.
    expect(out).toMatchObject({ strength: 'manual', matchedOn: 'manual' })
  })

  it('gagne sur une AMBIGUÏTÉ — c’est même sa raison d’être', () => {
    const out = applyResolutionOverride(
      { status: 'ambiguous', ambiguity: { on: 'name', candidates: 4 } },
      confirmed('thales'),
    )
    expect(out).toMatchObject({ status: 'resolved', companyKey: 'thales', matchedOn: 'manual' })
  })

  it('gagne sur un NON RÉSOLU', () => {
    const out = applyResolutionOverride({ status: 'unresolved' }, confirmed('sncf reseau'))
    expect(out).toMatchObject({ status: 'resolved', companyKey: 'sncf reseau' })
  })

  it('gagne MÊME sur une panne de lecture — la décision ne dépend pas de notre corpus', () => {
    const out = applyResolutionOverride({ status: 'unavailable', reason: 'timeout' }, confirmed('edf'))
    expect(out).toMatchObject({ status: 'resolved', companyKey: 'edf', matchedOn: 'manual' })
  })

  it('ne PRÉTEND PAS un comptage de parcours qu’il n’a pas mesuré', () => {
    const out = applyResolutionOverride({ status: 'unresolved' }, confirmed('edf'))
    // « Non mesuré n'est jamais 0 » : un override désigne une entreprise, il ne
    // compte pas ses parcours. Zéro serait un mensonge, pas un défaut.
    expect(out).toMatchObject({ pathsTotal: null })
  })

  it('GARDE le comptage quand le calcul avait trouvé la MÊME entreprise', () => {
    const out = applyResolutionOverride(RESOLVED, confirmed('societe generale'))
    expect(out).toMatchObject({ companyKey: 'societe generale', pathsTotal: 267 })
  })
})

describe('applyResolutionOverride — une correction NÉGATIVE (« ce n’est pas exact »)', () => {
  it('écarte un rapprochement que le calcul avait fait', () => {
    expect(applyResolutionOverride(RESOLVED, dismissed())).toMatchObject({ status: 'unresolved' })
  })

  it('écarte une ambiguïté — l’humain a dit qu’aucun candidat ne convenait', () => {
    const out = applyResolutionOverride(
      { status: 'ambiguous', ambiguity: { on: 'domain', candidates: 2 } },
      dismissed(),
    )
    expect(out).toMatchObject({ status: 'unresolved' })
  })

  it('⚠️ ne transforme PAS une panne en affirmation sur le marché', () => {
    const panne: MarketResolution = { status: 'unavailable', reason: 'lecture impossible' }
    // Le piège exact que le 4ᵉ état existe pour empêcher : « pas lu » n'est pas
    // « pas couvert ». Un rejet n'a rien à rejeter tant qu'on n'a rien lu.
    expect(applyResolutionOverride(panne, dismissed())).toBe(panne)
  })

  it('reste idempotent sur un calcul DÉJÀ non résolu', () => {
    const out = applyResolutionOverride({ status: 'unresolved' }, dismissed())
    expect(out).toMatchObject({ status: 'unresolved' })
  })
})

describe('applyResolutionOverride — ce que la fonction ne fait JAMAIS', () => {
  it('ne MUTE pas le calcul qu’on lui passe', () => {
    const source: MarketResolution = { ...RESOLVED }
    applyResolutionOverride(source, confirmed('autre chose'))
    expect(source).toEqual(RESOLVED)
  })

  it('ne fabrique aucune date ni aucun auteur dans le résultat de lecture', () => {
    // La revue (qui, quand) se lit sur la ligne stockée, pas sur la résolution.
    // La mélanger ici ferait voyager une identité dans un objet de fait marché.
    const out = applyResolutionOverride(RESOLVED, confirmed('bnp paribas'))
    expect(JSON.stringify(out)).not.toContain(REVIEWER)
  })
})
