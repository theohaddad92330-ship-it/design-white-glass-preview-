import { accountChangeDigestSchema } from '@bellum/contracts'
import { DEMO_DOSSIERS } from '../demo/demo-dataset'
import { DIGEST_WATCHED_FIELDS, buildAccountChangeDigest } from './account-change-digest'

/**
 * Le tiroir « ce qui a changé » (D213, `T5.md:1117-1151`).
 *
 * L'exigence qui compte : **la section INCHANGÉ est obligatoire**. Un tiroir qui
 * ne montre que ce qui a bougé laisse croire que le reste n'a pas été regardé ;
 * dire « ces huit champs ont été revérifiés et n'ont pas changé » est ce qui
 * donne sa valeur à « ces deux-là ont changé ».
 */

const NOW = new Date('2026-09-01T10:00:00.000Z')

describe('buildAccountChangeDigest', () => {
  it('ne rend AUCUN tiroir sans version précédente', () => {
    // « Aucune version conservée » n'est pas « rien n'a changé ». Rendre un
    // tiroir vide se lirait « on a vérifié, tout va bien » — le zéro qui ment.
    expect(buildAccountChangeDigest(null, { sector: 'Banque' }, NOW)).toBeNull()
  })

  it('nomme les champs REVÉRIFIÉS et identiques, même quand rien n’a bougé', () => {
    const same = { sector: 'Banque', employees: '1 200' }
    const digest = buildAccountChangeDigest(same, { ...same }, NOW)
    expect(digest).not.toBeNull()
    expect(digest?.changed).toEqual([])
    // Le cœur de l'exigence : la preuve du travail fait. L'ordre est celui de
    // `DIGEST_WATCHED_FIELDS`, pas l'alphabet — le tiroir se lit toujours dans
    // le même ordre, quel que soit le compte.
    expect(digest?.unchanged).toEqual(['sector', 'employees'])
  })

  it('sépare ce qui a changé de ce qui est APPARU', () => {
    const digest = buildAccountChangeDigest({ sector: 'Banque' }, { sector: 'Assurance', employees: '1 200' }, NOW)
    expect(digest?.changed).toEqual([{ field: 'sector', before: 'Banque', after: 'Assurance' }])
    expect(digest?.appeared).toEqual([{ field: 'employees', before: null, after: '1 200' }])
  })

  it('ARCHIVE ce qui a disparu, avec sa dernière valeur connue et sa date', () => {
    // « On archive, on ne supprime pas » : un fait périmé redevient inconnu AVEC
    // sa date. Sans elle, on ne saurait pas de quand date ce qu'on a perdu.
    const digest = buildAccountChangeDigest({ sector: 'Banque', employees: '1 200' }, { sector: 'Banque' }, NOW, {
      previousAt: '2026-03-04',
    })
    expect(digest?.disappeared).toEqual([{ field: 'employees', lastKnownValue: '1 200', lastKnownAt: '2026-03-04' }])
    expect(digest?.unchanged).toEqual(['sector'])
  })

  it('produit toujours un tiroir VALIDE au regard du contrat', () => {
    const digest = buildAccountChangeDigest({ sector: 'Banque' }, { sector: 'Assurance' }, NOW)
    expect(accountChangeDigestSchema.safeParse(digest).success).toBe(true)
  })

  it('rend null quand les deux versions sont vides — il n’y a rien à dire', () => {
    expect(buildAccountChangeDigest({}, {}, NOW)).toBeNull()
  })

  it('surveille une liste NOMMÉE de champs, jamais tout le blob', () => {
    // Comparer `raw_analysis` en entier ferait un tiroir de trois cents lignes
    // que personne ne lit — et il bougerait à chaque changement de format
    // interne, ce qui n'est pas un changement du COMPTE.
    expect(DIGEST_WATCHED_FIELDS.length).toBeGreaterThan(0)
    expect(DIGEST_WATCHED_FIELDS).toContain('sector')
  })

  /**
   * PARITÉ DÉMO — et cette garde LIT vraiment quelque chose.
   *
   * Le tiroir est une capacité user-facing : elle doit être remplie dans la
   * salle de démonstration, sinon un écran livré mais vide se découvre en
   * réunion. Une garde qui se contenterait de vérifier « la clé existe dans le
   * jeu » ne verrait pas le vrai piège rencontré ici : le jeu portait ces faits
   * sur les COLONNES du compte, alors que le tiroir lit le BLOB — les deux
   * versions se comparaient donc sur zéro champ, et le tiroir restait `null`
   * en démonstration sans qu'aucun test ne le dise.
   */
  describe('parité démo', () => {
    const seeded = DEMO_DOSSIERS.filter(d => d.account.previous_raw_analysis)

    it('un dossier de la salle porte une version précédente — pas zéro', () => {
      expect(seeded.length).toBeGreaterThan(0)
    })

    it('et ce dossier produit un tiroir RÉELLEMENT rempli, section INCHANGÉ comprise', () => {
      for (const dossier of seeded) {
        const digest = buildAccountChangeDigest(
          dossier.account.previous_raw_analysis,
          dossier.account.raw_analysis,
          NOW,
          { previousAt: dossier.account.previous_analysis_at ?? null },
        )
        expect(digest).not.toBeNull()
        // Les trois choses qu'une démonstration doit montrer d'un coup.
        expect(digest?.changed.length).toBeGreaterThan(0)
        expect(digest?.disappeared.length).toBeGreaterThan(0)
        expect(digest?.unchanged.length).toBeGreaterThan(0)
        // Et ce qui a disparu part avec sa date : on archive, on ne supprime pas.
        expect(digest?.disappeared[0].lastKnownAt).not.toBe('date inconnue')
      }
    })

    it('les autres dossiers ne montrent AUCUN tiroir, ce qui est l’autre état à voir', () => {
      const withoutPrevious = DEMO_DOSSIERS.filter(d => !d.account.previous_raw_analysis)
      expect(withoutPrevious.length).toBeGreaterThan(0)
      for (const dossier of withoutPrevious) {
        expect(buildAccountChangeDigest(undefined, dossier.account.raw_analysis, NOW)).toBeNull()
      }
    })
  })

  it('IGNORE ce qui n’est pas surveillé', () => {
    const digest = buildAccountChangeDigest({ sector: 'Banque', run_cost: 12 }, { sector: 'Banque', run_cost: 99 }, NOW)
    // Le coût du run a changé ; ce n'est pas un fait du compte.
    expect(digest?.changed).toEqual([])
    expect(digest?.unchanged).toEqual(['sector'])
  })
})
