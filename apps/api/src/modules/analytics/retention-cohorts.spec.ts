import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RETENTION_MONTHS,
  construireCohortes,
  ecartEnMois,
  moisApres,
  moisDe,
  type EspaceInscrit,
  type MoisActif,
} from './retention-cohorts'

/**
 * #1658.1 — ce qui se teste ici est la DÉRIVATION, pas le rendu.
 *
 * Les trois règles non négociables de l'issue y ont chacune leur cas :
 *  · « actif » = une action validée dans le mois, jamais une connexion ;
 *  · les cellules futures sont VIDES, pas à 0 ;
 *  · une cohorte de moins de 3 espaces n'est pas AFFICHÉE — le masquage
 *    lui-même vit côté écran (`COHORT_MIN_SPACES`, #1643), et ce fichier
 *    vérifie que le calcul lui rend de quoi le faire (le compte d'espaces).
 */

const MAINTENANT = new Date('2026-09-15T10:00:00Z')

function espace(workspaceId: string, createdAt: string): EspaceInscrit {
  return { workspaceId, createdAt: new Date(createdAt) }
}

function actif(workspaceId: string, ...mois: string[]): MoisActif[] {
  return mois.map(m => ({ workspaceId, mois: m }))
}

describe('les étiquettes de mois', () => {
  it('lit un instant en UTC, pas dans le fuseau de la machine', () => {
    // Le cas qui décide : 1er mars à 00h30 UTC est encore le 28 février à Paris
    // en heure d'hiver ? Non — mais l'inverse est vrai, et c'est celui-là qui
    // fait basculer une cohorte. 31 mars 23h30 UTC = 1er avril 01h30 à Paris.
    expect(moisDe(new Date('2026-03-31T23:30:00Z'))).toBe('2026-03')
    expect(moisDe(new Date('2026-04-01T00:30:00Z'))).toBe('2026-04')
  })

  it('compte les mois d’écart, y compris à cheval sur une année', () => {
    expect(ecartEnMois('2026-01', '2026-01')).toBe(0)
    expect(ecartEnMois('2025-11', '2026-02')).toBe(3)
    expect(ecartEnMois('2026-05', '2026-02')).toBe(-3)
  })

  it('avance de N mois sans faire déborder un 31', () => {
    expect(moisApres('2026-01', 1)).toBe('2026-02')
    expect(moisApres('2026-11', 3)).toBe('2027-02')
    expect(moisApres('2026-12', 12)).toBe('2027-12')
  })
})

describe('la grille de rétention par cohorte (#1658.1)', () => {
  it('range chaque espace dans le mois de son inscription', () => {
    const rapport = construireCohortes({
      espaces: [
        espace('a', '2026-07-02T08:00:00Z'),
        espace('b', '2026-07-31T22:00:00Z'),
        espace('c', '2026-08-01T00:00:00Z'),
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })

    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2026-07', '2026-08'])
    expect(rapport.cohortes.map(c => c.espaces)).toEqual([2, 1])
  })

  it('mesure « actif » sur une action validée DANS le mois, pas sur la dernière connue', () => {
    // `a` agit en juillet puis plus rien ; `b` agit en juillet ET en septembre.
    // Une lecture « dernière action » rendrait `a` actif partout jusqu'à son
    // dernier geste ; la rétention par cohorte demande le mois par mois.
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-07-05T08:00:00Z'), espace('b', '2026-07-06T08:00:00Z')],
      moisActifs: [...actif('a', '2026-07'), ...actif('b', '2026-07', '2026-09')],
      maintenant: MAINTENANT,
    })

    const juillet = rapport.cohortes[0]!
    expect(juillet.retentionParMois[0]).toBe(1) // M0 : les deux ont agi
    expect(juillet.retentionParMois[1]).toBe(0) // M1 (août) : personne — un VRAI zéro
    expect(juillet.retentionParMois[2]).toBe(0.5) // M2 (septembre) : b seul
  })

  it('un mois écoulé sans aucun espace actif vaut 0 — c’est une mesure, pas une absence', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-08-05T08:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.retentionParMois[0]).toBe(0)
    expect(rapport.cohortes[0]!.retentionParMois[1]).toBe(0)
  })

  it('les cellules futures sont VIDES, jamais à 0 — le test central de l’issue', () => {
    // Cohorte de juillet 2026 lue le 15/09/2026 : M0, M1, M2 ont eu lieu ; M3 à
    // M11 n'ont pas eu lieu. « 0 % de rétention en M7 » serait faux.
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-07-05T08:00:00Z')],
      moisActifs: actif('a', '2026-07'),
      maintenant: MAINTENANT,
    })

    const ligne = rapport.cohortes[0]!
    expect(ligne.moisEcoules).toBe(2)
    expect(ligne.retentionParMois.slice(0, 3).every(v => typeof v === 'number')).toBe(true)
    expect(ligne.retentionParMois.slice(3)).toEqual(Array(RETENTION_MONTHS - 3).fill(null))
    // Et surtout : aucun zéro n'a été écrit à leur place.
    expect(ligne.retentionParMois.slice(3)).not.toContain(0)
  })

  it('la cohorte du mois courant a M0 pour seule colonne écoulée', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-09-02T08:00:00Z')],
      moisActifs: actif('a', '2026-09'),
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.moisEcoules).toBe(0)
    expect(rapport.cohortes[0]!.retentionParMois[0]).toBe(1)
    expect(rapport.cohortes[0]!.retentionParMois[1]).toBeNull()
  })

  it('une cohorte plus vieille que la grille remplit ses douze colonnes, pas treize', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2024-01-05T08:00:00Z')],
      moisActifs: actif('a', '2024-01'),
      maintenant: MAINTENANT,
    })
    const ligne = rapport.cohortes[0]!
    expect(ligne.retentionParMois).toHaveLength(RETENTION_MONTHS)
    expect(ligne.moisEcoules).toBe(RETENTION_MONTHS - 1)
    expect(ligne.retentionParMois.filter(v => v === null)).toHaveLength(0)
  })

  it('rend le compte d’espaces de CHAQUE cohorte, y compris des trop petites — c’est l’écran qui masque', () => {
    // L'issue demande qu'une cohorte de 2 espaces soit MASQUÉE à l'écran, avec
    // sa raison. Elle ne peut l'être que si le calcul dit combien il y en a :
    // supprimer la ligne ici rendrait le masquage indiscernable d'un mois sans
    // aucune inscription.
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-06-05T08:00:00Z'), espace('b', '2026-06-06T08:00:00Z')],
      moisActifs: actif('a', '2026-06'),
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes).toHaveLength(1)
    expect(rapport.cohortes[0]!.espaces).toBe(2)
  })

  it('un mois sans aucune inscription ne produit AUCUNE ligne', () => {
    // Plutôt qu'une ligne à zéro espace, qui se lirait comme une cohorte vide
    // alors qu'il n'y a pas de cohorte du tout.
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-06-05T08:00:00Z'), espace('b', '2026-08-05T08:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2026-06', '2026-08'])
  })

  it('compte les espaces qui n’ont JAMAIS validé une action', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-07-05T08:00:00Z'), espace('b', '2026-07-06T08:00:00Z')],
      moisActifs: actif('a', '2026-07'),
      maintenant: MAINTENANT,
    })
    expect(rapport.espaces).toBe(2)
    expect(rapport.espacesSansAucuneAction).toBe(1)
  })

  it('deux actions le même mois ne rendent pas un espace deux fois actif', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-08-05T08:00:00Z'), espace('b', '2026-08-06T08:00:00Z')],
      moisActifs: [...actif('a', '2026-08'), ...actif('a', '2026-08')],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes[0]!.retentionParMois[0]).toBe(0.5)
  })

  it('écarte un espace créé dans le futur plutôt que de lui bâtir une ligne vide', () => {
    const rapport = construireCohortes({
      espaces: [espace('a', '2026-08-05T08:00:00Z'), espace('futur', '2027-01-05T08:00:00Z')],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2026-08'])
    expect(rapport.espaces).toBe(1)
  })

  it('range les cohortes de la plus ancienne à la plus récente', () => {
    const rapport = construireCohortes({
      espaces: [
        espace('c', '2026-08-05T08:00:00Z'),
        espace('a', '2025-12-05T08:00:00Z'),
        espace('b', '2026-02-05T08:00:00Z'),
      ],
      moisActifs: [],
      maintenant: MAINTENANT,
    })
    expect(rapport.cohortes.map(c => c.cohorte)).toEqual(['2025-12', '2026-02', '2026-08'])
  })

  it('n’a rien à dire quand il n’y a aucun espace — et le dit sans inventer de ligne', () => {
    const rapport = construireCohortes({ espaces: [], moisActifs: [], maintenant: MAINTENANT })
    expect(rapport.cohortes).toEqual([])
    expect(rapport.espaces).toBe(0)
    expect(rapport.espacesSansAucuneAction).toBe(0)
  })

  it('rend l’instant de lecture — c’est lui qui distingue un mois à venir d’un mois vide', () => {
    const rapport = construireCohortes({ espaces: [], moisActifs: [], maintenant: MAINTENANT })
    expect(rapport.calculeA).toBe(MAINTENANT.toISOString())
    expect(rapport.mois).toBe(RETENTION_MONTHS)
  })
})

describe('la garde de la source : « actif » ne lit JAMAIS une connexion', () => {
  /**
   * ⚠️ Une garde doit prouver qu'elle LIT quelque chose.
   *
   * Le vrai risque de ce fichier n'est pas une erreur d'arithmétique : c'est
   * qu'un jour quelqu'un « complète » la mesure avec `user_last_seen`, comme
   * `client-health.ts` le fait légitimement pour SA question. Les deux écrans se
   * mettraient alors à donner deux rétentions différentes du même espace.
   */
  const SOURCE = readFileSync(join(__dirname, 'retention-cohorts.service.ts'), 'utf8')

  it('LIT quelque chose — le service existe et lit bien les actions', () => {
    expect(SOURCE.length).toBeGreaterThan(1000)
    expect(SOURCE).toContain('UserActionEntity')
  })

  it('ne va chercher ni la table des connexions ni sa colonne', () => {
    const sansCommentaires = SOURCE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
    expect(sansCommentaires).not.toContain('UserLastSeenEntity')
    expect(sansCommentaires).not.toContain('last_seen_at')
  })
})
