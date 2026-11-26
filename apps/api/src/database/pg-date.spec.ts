import { types } from 'pg'
import { PG_DATE_OID, registerPgDateParser } from './pg-date'

/**
 * LE PILOTE REND UNE COLONNE `date` COMME UNE CHAÎNE — partout.
 *
 * Sans cette inscription, `pg` rend un objet `Date` à minuit LOCAL sur toute
 * requête BRUTE (`manager.query`), alors que l'hydratation d'entité TypeORM
 * rend, elle, une chaîne `YYYY-MM-DD`. Deux chemins, deux formes, pour les
 * mêmes colonnes — et TOUTES les annotations de requêtes brutes du dépôt
 * disent `string`.
 *
 * Ce que ce mensonge a réellement coûté, en une seule journée (01/09/2026) :
 *
 *  - `POST /needs/:id/match` → 500 sur tout besoin daté (`Invalid time value`) ;
 *  - `GET /delivery/invoice-readiness/export.csv` → 500 dès qu'un mois porte une
 *    échéance (`value.replace is not a function`) ;
 *  - `dueOn` rendu « 2026-08-25T00:00:00.000Z » là où le contrat annonce un
 *    jour — un jour qui recule à l'ouest de Greenwich ;
 *  - une affectation comparée à un `YYYY-MM-DD` : « Tue Sep 15 2026 … » est
 *    lexicographiquement SUPÉRIEUR à « 2026-09-15 », donc une personne en
 *    mission ressortait « libre ».
 */
describe('registerPgDateParser', () => {
  it('sait dire NON : par DÉFAUT, `pg` rend un objet Date sur une colonne `date`', () => {
    // On lit le parseur d'origine AVANT toute inscription — c'est lui qui
    // fabrique le défaut que ce module corrige.
    const original = types.getTypeParser(PG_DATE_OID)
    expect(original('2026-09-15')).toBeInstanceOf(Date)
  })

  it('rend la chaîne telle quelle une fois inscrit', () => {
    registerPgDateParser()
    expect(types.getTypeParser(PG_DATE_OID)('2026-09-15')).toBe('2026-09-15')
  })

  it('est idempotent — deux inscriptions ne se contredisent pas', () => {
    registerPgDateParser()
    registerPgDateParser()
    expect(types.getTypeParser(PG_DATE_OID)('2027-01-01')).toBe('2027-01-01')
  })

  it('ne touche PAS aux horodatages : un `timestamptz` reste une Date', () => {
    registerPgDateParser()
    // 1184 = timestamptz. Un instant n'est pas un jour : le convertir en chaîne
    // ferait perdre le fuseau, et tout le module finance en dépend.
    const parsed = types.getTypeParser(1184)('2026-09-15 08:00:00+00')
    expect(parsed).toBeInstanceOf(Date)
  })
})
