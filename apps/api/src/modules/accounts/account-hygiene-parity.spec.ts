import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACCOUNT_HYGIENE_PREDICATES,
  divergentPredicates,
  normaliseSql,
  type AccountHygienePredicateName,
} from './account-hygiene.sql'

/**
 * GA-53 — LE PRÉDICAT D'UN CONTRÔLE VIT À UN SEUL ENDROIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit COMPTE les objets d'un contrôle (`data-hygiene.service.ts`), la
 * ligne du portefeuille les DÉSIGNE (`account-hygiene.sql.ts`). Deux requêtes,
 * une seule règle : « un compte suivi sur lequel rien n'est programmé ». Le jour
 * où l'une des deux apprend quelque chose — un statut commercial de plus, une
 * tâche `cancelled` requalifiée — et pas l'autre, l'écran dit « à programmer »
 * sur une ligne que le cockpit ne compte pas, et personne ne sait laquelle a
 * raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE — ET CE QU'ELLE VÉRIFIAIT AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle exigeait que le SQL du cockpit CONTIENNE le texte de chaque prédicat, au
 * caractère près. Deux copies identiques passaient — et c'est précisément
 * l'état d'où part une divergence : le 28/08/2026, « une tâche encore à faire »
 * s'écrivait `status <> 'done'` d'un côté et `status = 'todo'` de l'autre, deux
 * copies qui avaient été identiques le jour de leur écriture.
 *
 * Elle exige maintenant que le cockpit RÉFÉRENCE chaque prédicat par son nom —
 * une comparaison d'ENSEMBLES D'IDENTIFIANTS, pas de chaînes. Une recopie, même
 * exacte aujourd'hui, est refusée : il n'y a plus deux textes à tenir égaux, il
 * n'y en a qu'un. Les commentaires sont retirés avant de regarder : une phrase
 * qui CITE le nom d'un prédicat n'est pas une requête qui l'utilise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne DÉPLACE pas le calcul : le décompte reste au cockpit, qui reste sa
 * seule source. Elle rend impossible de le modifier d'un côté seulement.
 */

const HYGIENE_SERVICE = join(__dirname, '..', 'pilotage', 'data-hygiene.service.ts')

/** Le SQL du cockpit, commentaires retirés — un commentaire n'est pas une règle. */
function cockpitSql(): string {
  return normaliseSql(readFileSync(HYGIENE_SERVICE, 'utf8'))
}

describe('GA-53 — le prédicat d’un contrôle vit à un seul endroit', () => {
  it('le cockpit RÉFÉRENCE chaque prédicat de la lecture par compte, il n’en recopie aucun', () => {
    const missing = divergentPredicates(cockpitSql())
    if (missing.length > 0) {
      throw new Error(
        [
          'Un prédicat de `account-hygiene.sql.ts` n’est plus RÉFÉRENCÉ par',
          '`apps/api/src/modules/pilotage/data-hygiene.service.ts`.',
          '',
          'Les deux disent la même règle : le cockpit la COMPTE, la ligne du',
          'portefeuille la DÉSIGNE. Divergentes, l’écran avertit sur des comptes',
          'que le cockpit ne compte pas — et personne ne sait laquelle a raison.',
          '',
          'Interpole `${ACCOUNT_HYGIENE_PREDICATES.<nom>}` dans le SQL du cockpit',
          'plutôt que d’y réécrire le prédicat : une copie exacte aujourd’hui est',
          'la copie qui divergera demain.',
          '',
          ...missing.map(name => `  · ${name} : ${ACCOUNT_HYGIENE_PREDICATES[name]}`),
        ].join('\n'),
      )
    }
    expect(missing).toEqual([])
  })

  it('la garde LIT vraiment le cockpit, et sait dire NON', () => {
    const corpus = cockpitSql()
    // Elle lit : le fichier du cockpit est là, et c'est bien du SQL.
    expect(corpus.length).toBeGreaterThan(1_000)
    expect(corpus).toContain('FROM accounts a')
    // Les commentaires sont bien retirés — sinon la garde validerait une règle
    // qui n'existe plus que dans une phrase.
    expect(readFileSync(HYGIENE_SERVICE, 'utf8')).toContain('CHAQUE LIGNE MÈNE QUELQUE PART')
    expect(corpus).not.toContain('CHAQUE LIGNE MÈNE QUELQUE PART')
    // Le corpus surveillé n'est pas vide : au moins trois prédicats.
    const names = Object.keys(ACCOUNT_HYGIENE_PREDICATES) as AccountHygienePredicateName[]
    expect(names.length).toBeGreaterThanOrEqual(3)

    // Elle sait dire NON, et sur le cas qui compte : un cockpit qui RECOPIE le
    // prédicat au lieu de le référencer. La copie est ici rigoureusement
    // identique — c'est tout l'intérêt : le jour de l'écriture, une copie l'est
    // toujours, et c'est le lendemain qu'elle diverge.
    const copied = corpus.replace(
      '${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}',
      ACCOUNT_HYGIENE_PREDICATES.followedAccounts,
    )
    expect(copied).not.toEqual(corpus)
    expect(divergentPredicates(copied)).toContain('followedAccounts')

    // Et sur le cas d'origine : un prédicat purement et simplement disparu.
    const dropped = corpus.replace('${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}', 'true')
    expect(dropped).not.toEqual(corpus)
    expect(divergentPredicates(dropped)).toContain('noUpcomingTask')
  })
})
