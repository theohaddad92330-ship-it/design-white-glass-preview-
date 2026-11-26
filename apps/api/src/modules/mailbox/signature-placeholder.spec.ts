import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Aucun modèle livré ne contient de marque-place de signature.
 *
 * La règle du §5.2 (c) est explicite : sans signature configurée, le brouillon
 * part **non signé avec une mention visible**, jamais avec un `[signature]` en
 * toutes lettres. La raison est terre à terre — un marque-place non remplacé
 * part chez le client, et il est illisible dans les deux sens : le destinataire
 * y voit une négligence, l'expéditeur n'a rien pour le voir avant l'envoi.
 *
 * Deux modèles de la bibliothèque par défaut en contenaient un, livrés en
 * production (`default-library.ts`, trouvé en croisant le PDF 6). La signature
 * est résolue à la composition du brouillon (`MailboxService`), où l'on sait
 * si elle existe — pas au moment d'écrire un modèle, où on ne le sait pas.
 */
describe('aucun marque-place de signature dans le contenu livré', () => {
  const SRC = join(__dirname, '..', '..')

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        out.push(...sourceFiles(full))
        continue
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
      out.push(full)
    }
    return out
  }

  it('ni `{{signature}}`, ni `[signature]`', () => {
    // `${signature}` est une interpolation RÉSOLUE, pas un marque-place : elle
    // ne peut pas partir telle quelle. Le motif l'exclut explicitement, sans
    // quoi la garde attraperait tout code qui compose une signature.
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      if (/\{\{\s*signature\s*\}\}|\[signature\]/i.test(source)) {
        offenders.push(file.slice(file.indexOf('/modules')))
      }
    }
    expect(offenders).toEqual([])
  })
})
