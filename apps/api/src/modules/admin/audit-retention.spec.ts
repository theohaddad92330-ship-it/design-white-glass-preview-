import { BACKOFFICE_AUDIT_CATEGORIES, BACKOFFICE_AUDIT_RETENTION_MONTHS } from '@bellum/contracts'
import { cutoffFor, describePurge, purgeableWindows, retentionPlan, subtractMonthsUtc } from './audit-retention'

/**
 * LES RÉTENTIONS DE #1666 — « la partie sérieuse de l'issue ».
 *
 * Ce que ces tests tiennent, et pourquoi chacun existe :
 *  · les CINQ durées de l'issue, à la lettre — un chiffre recopié de travers ne
 *    se voit qu'au bout de deux ans, quand les lignes ont disparu ;
 *  · `suppression` n'a AUCUNE date de coupure, donc aucun chemin ne l'efface ;
 *  · l'arithmétique de mois ne DÉBORDE pas — le 31 mars moins un mois n'est pas
 *    le 3 mars, et une purge qui déborde efface trois jours de trop chaque fin
 *    de mois ;
 *  · `now` est un paramètre : rien ici ne lit l'horloge.
 */
describe('Rétention du journal d’audit (#1666)', () => {
  const NOW = new Date('2026-09-07T04:37:00.000Z')

  it('LIT quelque chose — les cinq catégories sont là, et la table n’est pas vide', () => {
    // Contrôle positif : un registre vidé rendrait chaque assertion creuse.
    expect(BACKOFFICE_AUDIT_CATEGORIES).toHaveLength(5)
    expect(Object.keys(BACKOFFICE_AUDIT_RETENTION_MONTHS)).toHaveLength(5)
    expect(retentionPlan(NOW)).toHaveLength(5)
  })

  it('les cinq durées sont CELLES de l’issue, à la lettre', () => {
    expect(BACKOFFICE_AUDIT_RETENTION_MONTHS).toEqual({
      ordinaire: 24,
      permission: 36,
      export: 36,
      suppression: null,
      impersonation: 36,
    })
  })

  it('« permanent » n’est PAS « zéro » — aucune coupure pour les suppressions', () => {
    // Le piège qui viderait la table : lire `null` comme une date de repli.
    expect(cutoffFor('suppression', NOW)).toBeNull()
    expect(purgeableWindows(NOW).map(w => w.category)).not.toContain('suppression')
    // Et la catégorie reste DANS le plan, avec sa fenêtre nulle : la retirer
    // ferait de « conservée pour toujours » une absence.
    expect(retentionPlan(NOW).map(w => w.category)).toContain('suppression')
  })

  it('24 mois pour l’ordinaire, 36 pour les trois autres', () => {
    expect(cutoffFor('ordinaire', NOW)?.toISOString()).toBe('2024-09-07T04:37:00.000Z')
    expect(cutoffFor('permission', NOW)?.toISOString()).toBe('2023-09-07T04:37:00.000Z')
    expect(cutoffFor('export', NOW)?.toISOString()).toBe('2023-09-07T04:37:00.000Z')
    expect(cutoffFor('impersonation', NOW)?.toISOString()).toBe('2023-09-07T04:37:00.000Z')
  })

  it('SAIT DIRE NON au débordement de fin de mois — le 31 mars moins 1 mois', () => {
    // Sans le clampage, `setUTCMonth` rendrait le 3 mars : trois jours effacés
    // en trop, chaque 29, 30 et 31 du mois.
    expect(subtractMonthsUtc(new Date('2026-03-31T00:00:00.000Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z')
    // Une année bissextile ne se devine pas non plus.
    expect(subtractMonthsUtc(new Date('2024-03-31T00:00:00.000Z'), 1).toISOString()).toBe('2024-02-29T00:00:00.000Z')
    // Et le cas ordinaire ne bouge pas d'un jour.
    expect(subtractMonthsUtc(new Date('2026-09-15T12:00:00.000Z'), 24).toISOString()).toBe('2024-09-15T12:00:00.000Z')
  })

  it('la fenêtre est au pire plus GÉNÉREUSE, jamais plus courte', () => {
    // Entre garder un jour de trop et effacer un jour de trop, un journal
    // d'audit ne doit pas hésiter. Le clampage va toujours vers l'ANCIEN.
    const cutoff = subtractMonthsUtc(new Date('2026-05-31T00:00:00.000Z'), 3)
    expect(cutoff.toISOString()).toBe('2026-02-28T00:00:00.000Z')
    expect(cutoff.getTime()).toBeLessThan(new Date('2026-03-03T00:00:00.000Z').getTime())
  })

  it('rien ne lit l’horloge — deux instants donnent deux plans différents', () => {
    const plus_tard = new Date('2027-09-07T04:37:00.000Z')
    expect(cutoffFor('ordinaire', plus_tard)?.toISOString()).toBe('2025-09-07T04:37:00.000Z')
    expect(cutoffFor('ordinaire', NOW)?.toISOString()).toBe('2024-09-07T04:37:00.000Z')
  })

  it('la phrase de purge DIT ce qui est parti, et rien de ce qu’elle a effacé', () => {
    const phrase = describePurge([
      { category: 'ordinaire', months: 24, cutoff: new Date('2024-09-07T00:00:00.000Z'), deleted: 12 },
      { category: 'permission', months: 36, cutoff: new Date('2023-09-07T00:00:00.000Z'), deleted: 0 },
    ])
    expect(phrase).toContain('ordinaire : 12 ligne(s)')
    expect(phrase).toContain('2024-09-07T00:00:00.000Z')
    // Une catégorie qui n'a rien perdu n'encombre pas la phrase.
    expect(phrase).not.toContain('permission')
    // Et elle tient dans le champ `detail` du contrat (500 caractères).
    expect(phrase.length).toBeLessThanOrEqual(500)
  })

  it('une passe à vide le DIT, plutôt que de rendre une phrase vide', () => {
    // « Rien à faire » et « je n'ai pas su » sont deux phrases différentes.
    expect(describePurge([])).toBe('Aucune ligne échue : rien n’a été effacé.')
  })
})
