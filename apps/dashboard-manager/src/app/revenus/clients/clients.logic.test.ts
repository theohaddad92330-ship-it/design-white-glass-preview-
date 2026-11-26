import { describe, expect, it } from 'vitest'
import type { ClientHealth, ClientRow } from '@/lib/client-health'
import {
  compterLesAlertes,
  depuisQuand,
  estEnAlerte,
  estUnPlanEditable,
  formaterAxe,
  formaterEuros,
  formaterRapport,
  libelleFacturation,
  libelleSante,
  scoreDe,
  trierParSanteCroissante,
} from './clients.logic'

/**
 * Ce que l'écran « Clients » décide (#1652).
 *
 * Les trois règles qui ne se négocient pas, et qui sont toutes testées ici :
 *  - un espace SANS score ne vaut pas zéro (au tri comme à l'affichage) ;
 *  - « non mesuré » ne s'écrit JAMAIS « 0 » ;
 *  - l'horloge est un paramètre, jamais lue.
 */

const AUJOURD_HUI = new Date('2026-09-07T12:00:00Z')

function ilYA(jours: number): string {
  return new Date(AUJOURD_HUI.getTime() - jours * 86_400_000).toISOString()
}

const AXES: ClientHealth['axes'] = [
  { key: 'activite', label: 'Activité', weight: 30, ratio: 1, detail: 'dernier geste hier', unmeasured: null },
  { key: 'adoption', label: 'Adoption', weight: 25, ratio: null, detail: null, unmeasured: 'aucun geste instrumenté' },
  { key: 'credits', label: 'Usage des crédits', weight: 20, ratio: 0.4, detail: '40 sur 100', unmeasured: null },
  { key: 'sieges', label: 'Membres actifs / sièges', weight: 15, ratio: 0.5, detail: '2 sur 4', unmeasured: null },
  { key: 'incidents', label: 'Retours et incidents', weight: 10, ratio: 0.8, detail: '2 sur 10', unmeasured: null },
]

function ligne(nom: string, health: ClientHealth, over: Partial<ClientRow> = {}): ClientRow {
  return {
    workspaceId: nom,
    name: nom,
    ownerUserId: `u-${nom}`,
    ownerEmail: `${nom}@test.fr`,
    plan: 'growth',
    planLabel: 'Growth',
    mrrCents: 19900,
    seats: 4,
    memberCount: 3,
    activeMembers: 2,
    createdAt: ilYA(300),
    lastActivityAt: ilYA(2),
    creditsUsed: 40,
    creditsAllowance: 100,
    billing: { mode: 'stripe', contractedCents: null, period: null },
    health,
    ...over,
  }
}

const score = (valeur: number): ClientHealth => ({
  kind: 'score',
  score: valeur,
  measured: 4,
  churnRisk: valeur < 25,
  axes: AXES,
})

const tropRecent: ClientHealth = { kind: 'too_recent', ageDays: 6, measured: 5, axes: AXES }
const pasAssez: ClientHealth = { kind: 'not_enough_axes', measured: 2, axes: AXES }

describe('le tri par défaut : santé CROISSANTE, les problèmes en haut', () => {
  it('range les scores du plus bas au plus haut', () => {
    const rows = [ligne('c', score(80)), ligne('a', score(12)), ligne('b', score(45))]
    expect(trierParSanteCroissante(rows).map(r => r.name)).toEqual(['a', 'b', 'c'])
  })

  it('range un espace SANS score à part — il ne vaut pas 0', () => {
    // Le test qui compte : si « trop récent » valait zéro, il passerait DEVANT
    // le client à 12/100 qu'il faut rappeler aujourd'hui.
    const rows = [ligne('vieux', score(80)), ligne('neuf', tropRecent), ligne('fragile', score(12))]
    expect(trierParSanteCroissante(rows).map(r => r.name)).toEqual(['fragile', 'vieux', 'neuf'])
  })

  it('trie les sans-score entre eux par nom, pour rester stable', () => {
    const rows = [ligne('zeta', pasAssez), ligne('alpha', tropRecent), ligne('mid', score(50))]
    expect(trierParSanteCroissante(rows).map(r => r.name)).toEqual(['mid', 'alpha', 'zeta'])
  })

  it('départage deux scores égaux par le nom', () => {
    const rows = [ligne('b', score(30)), ligne('a', score(30))]
    expect(trierParSanteCroissante(rows).map(r => r.name)).toEqual(['a', 'b'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const rows = [ligne('c', score(80)), ligne('a', score(12))]
    trierParSanteCroissante(rows)
    expect(rows.map(r => r.name)).toEqual(['c', 'a'])
  })
})

describe('l’alerte de churn', () => {
  it('lève le drapeau sous 25, et seulement sur un score MESURÉ', () => {
    expect(estEnAlerte(score(24))).toBe(true)
    expect(estEnAlerte(score(25))).toBe(false)
    // Un espace non mesuré n'est PAS une alerte : on ne sait pas.
    expect(estEnAlerte(tropRecent)).toBe(false)
    expect(estEnAlerte(pasAssez)).toBe(false)
  })

  it('se compte, pour la file de décision', () => {
    expect(compterLesAlertes([ligne('a', score(10)), ligne('b', score(90)), ligne('c', tropRecent)])).toBe(1)
  })
})

describe('la colonne Santé ne rend jamais un nombre nu', () => {
  // #1946.21 — « Un espace neuf est "en amorçage", pas "mauvais" ». Le
  // mécanisme était déjà juste (pas de score, ton neutre, rangé à part) ; c'est
  // le MOT qui manquait. « trop récent » se lit comme un reproche adressé au
  // client, « en amorçage » dit ce qui se passe vraiment : l'espace démarre.
  it('#1946.21 — dit « en amorçage » et POURQUOI, pour un espace de moins de 14 jours', () => {
    const libelle = libelleSante(tropRecent)
    expect(libelle.texte).toBe('en amorçage')
    expect(libelle.ton).toBe('absent')
    expect(libelle.aide).toContain('6 j')
    expect(libelle.aide).toContain('14 jours')
  })

  // #1946.21 — la garde du SENS, pas seulement du mot : l'amorçage ne doit
  // jamais se lire comme un mauvais point. Ni le ton d'alerte, ni un vocabulaire
  // de reproche dans l'aide.
  it('#1946.21 — un espace en amorçage n’est jamais présenté comme mauvais', () => {
    const libelle = libelleSante(tropRecent)
    expect(libelle.ton).not.toBe('alerte')
    expect(estEnAlerte(tropRecent)).toBe(false)
    for (const reproche of ['trop récent', 'mauvais', 'faible', 'risque', 'inactif']) {
      expect(`${libelle.texte} ${libelle.aide}`.toLowerCase()).not.toContain(reproche)
    }
  })

  it('dit « non mesuré » et combien d’axes manquent', () => {
    const libelle = libelleSante(pasAssez)
    expect(libelle.texte).toBe('non mesuré')
    expect(libelle.ton).toBe('absent')
    expect(libelle.aide).toContain('2 axes mesurés sur 5')
  })

  it('accompagne TOUJOURS le score de son dénominateur d’axes', () => {
    expect(libelleSante(score(66)).aide).toBe('66 / 100, sur 4 axes mesurés sur 5.')
    expect(libelleSante(score(12)).ton).toBe('alerte')
    expect(libelleSante(score(66)).ton).toBe('mesure')
  })

  it('scoreDe rend `null` — jamais 0 — quand il n’y a pas de score', () => {
    expect(scoreDe(score(0))).toBe(0)
    expect(scoreDe(tropRecent)).toBeNull()
    expect(scoreDe(pasAssez)).toBeNull()
  })
})

describe('« non mesuré » ne s’écrit jamais « 0 »', () => {
  it('un axe non évalué se NOMME', () => {
    expect(formaterAxe(null)).toBe('non évalué')
    expect(formaterAxe(0)).toBe('0 %')
    expect(formaterAxe(0.666)).toBe('67 %')
  })

  it('un montant absent rend « — », pas « 0 € »', () => {
    expect(formaterEuros(null)).toBe('—')
    // ⚠️ `\s` plutôt qu'une espace écrite : `Intl` sépare le montant de son
    // symbole par une insécable ÉTROITE (U+202F), qu'on ne peut pas taper ici
    // sans déclencher `no-irregular-whitespace` — et qui ferait échouer une
    // comparaison à l'octet près pour une raison invisible à la relecture.
    expect(formaterEuros(0)).toMatch(/^0\s€$/)
    expect(formaterEuros(19900)).toMatch(/^199\s€$/)
  })

  it('un rapport à moitié inconnu garde son tiret du bon côté', () => {
    expect(formaterRapport(2, 4)).toBe('2 / 4')
    expect(formaterRapport(null, 4)).toBe('— / 4')
    expect(formaterRapport(0, 4)).toBe('0 / 4')
    expect(formaterRapport(null, null)).toBe('—')
  })
})

describe('la facturation se dit, elle ne se devine pas', () => {
  it('nomme un contrat sur facture avec son montant et sa périodicité', () => {
    const row = ligne('x', score(50), {
      billing: { mode: 'manual', contractedCents: 240000, period: 'yearly' },
    })
    expect(libelleFacturation(row)).toContain('Sur facture')
    expect(libelleFacturation(row)).toContain('/ an')
  })

  it('dit « Sur facture » tout court quand le montant manque', () => {
    const row = ligne('x', score(50), { billing: { mode: 'manual', contractedCents: null, period: null } })
    expect(libelleFacturation(row)).toBe('Sur facture')
  })

  it('ne présente pas une absence d’abonnement comme un abonnement', () => {
    const row = ligne('x', score(50), { billing: { mode: 'unknown', contractedCents: null, period: null } })
    expect(libelleFacturation(row)).toBe('—')
  })
})

describe('le palier n’est éditable en ligne que s’il est au catalogue', () => {
  it('reconnaît les cinq clés que PlanSelect propose', () => {
    expect(estUnPlanEditable('growth')).toBe(true)
    expect(estUnPlanEditable('beta')).toBe(true)
  })

  it('refuse une clé absente du catalogue — un select retomberait sur la première option', () => {
    expect(estUnPlanEditable('decouverte')).toBe(false)
    expect(estUnPlanEditable(null)).toBe(false)
  })
})

describe('l’ancienneté et la dernière activité', () => {
  it('lisent l’horloge PASSÉE, jamais la leur', () => {
    expect(depuisQuand(ilYA(0), AUJOURD_HUI)).toBe('aujourd’hui')
    expect(depuisQuand(ilYA(1), AUJOURD_HUI)).toBe('hier')
    expect(depuisQuand(ilYA(12), AUJOURD_HUI)).toBe('il y a 12 j')
    expect(depuisQuand(ilYA(95), AUJOURD_HUI)).toBe('il y a 3 mois')
  })

  it('rendent « — » sans date, plutôt qu’un « il y a 0 j » inventé', () => {
    expect(depuisQuand(null, AUJOURD_HUI)).toBe('—')
    expect(depuisQuand('pas-une-date', AUJOURD_HUI)).toBe('—')
  })
})
