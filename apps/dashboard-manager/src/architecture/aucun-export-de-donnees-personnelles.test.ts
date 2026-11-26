import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE — la console d'opération ne fabrique AUCUN fichier à télécharger (#1670.5).
 *
 * « AUCUN EXPORT contenant des données personnelles depuis le manager. Un export
 * de la liste utilisateurs sort des identifiants, pas des emails. »
 *
 * ⚠️ CE QUE CETTE GARDE CORRIGE EST UNE VÉRITÉ SANS PROPRIÉTAIRE.
 * Le test T4 de l'issue passe aujourd'hui — mais il passe parce qu'AUCUN export
 * n'existe, pas parce que quelque chose l'empêche. C'est la forme exacte du
 * défaut que ce dépôt paie le plus souvent : une règle vraie que personne ne
 * tient. Le masquage des e-mails, lui, EST tenu — mais
 * `emails-masques-dans-les-listes.test.ts` n'inspecte que le JSX rendu sous
 * `src/app/`. Une route qui poserait un `Content-Disposition: attachment` avec
 * un CSV d'adresses passerait devant lui sans qu'il la voie : il ne regarde pas
 * les gestionnaires de route.
 *
 * Ce que cette garde refuse, donc : tout ce qui, dans cette application,
 * FABRIQUE un fichier destiné à quitter l'écran.
 *
 * ⚠️ CE QU'ELLE NE DIT PAS. Elle n'interdit pas de lire des e-mails — la console
 * en affiche, masqués, c'est son métier. Elle interdit de les EMPORTER. Le jour
 * où un export devient nécessaire, la réponse de l'issue est écrite : il sort
 * des identifiants, pas des adresses — et il faudra alors inscrire ici une
 * exception NOMMÉE, portant sa raison, pas retirer la garde.
 */

const RACINE = join(__dirname, '..')

/** Ce qui fabrique un fichier, et ce que chacun trahit. */
const MOTIFS_D_EXPORT: ReadonlyArray<{ motif: RegExp; quoi: string }> = [
  { motif: /Content-Disposition/i, quoi: 'un en-tête de téléchargement' },
  { motif: /\btext\/csv\b/i, quoi: 'une réponse CSV' },
  { motif: /\bapplication\/vnd\.ms-excel\b/i, quoi: 'une réponse Excel' },
  { motif: /URL\.createObjectURL\s*\(/, quoi: 'une URL de blob téléchargeable' },
  { motif: /\bnew\s+Blob\s*\(/, quoi: 'un blob construit côté navigateur' },
  { motif: /\bsaveAs\s*\(/, quoi: 'un appel à file-saver' },
  { motif: /<a[^>]*\sdownload(\s|=|>)/, quoi: 'un lien de téléchargement' },
  { motif: /\bxlsx\b/i, quoi: 'une dépendance tableur' },
]

/**
 * ⚠️ EXCEPTIONS NOMMÉES, avec leur raison — le chemin EXACT du fichier qui
 * exporte, jamais un dossier. Chaque entrée est une décision de Louis, datée.
 *
 * #4387 — la seule : Prospects. Le test plus bas prouve qu'elle reste exacte
 * (le fichier existe ET exporte encore) et qu'aucun autre fichier n'en profite.
 */
const EXCEPTIONS = new Map<string, string>([
  [
    'app/api/admin/prospects/export/route.ts',
    '#4387, Louis 20/10/2026 : les prospects ont rempli le formulaire d’accès à la démo pour être recontactés ; export complet autorisé sur cette page seule, journalisé',
  ],
])

function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      fichiersSource(chemin, acc)
      continue
    }
    if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue
    acc.push(chemin)
  }
  return acc
}

/** Les commentaires d'abord : une garde attrapée par sa propre justification est borgne. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function exportsTrouves(source: string): string[] {
  const propre = sansCommentaires(source)
  const trouves: string[] = []
  for (const { motif, quoi } of MOTIFS_D_EXPORT) {
    // `RegExp.test` avec le drapeau `g` est STATEFUL : on reconstruit à chaque tour.
    if (new RegExp(motif.source, motif.flags.replace('g', '')).test(propre)) trouves.push(quoi)
  }
  return trouves
}

/** Les fichiers fautifs d'un corpus `{ chemin relatif → source }`, exceptions déduites. */
function coupablesDuCorpus(corpus: Record<string, string>, exceptions: ReadonlyMap<string, string>): string[] {
  const coupables: string[] = []
  for (const [relatif, source] of Object.entries(corpus)) {
    if (exceptions.has(relatif)) continue
    const trouves = exportsTrouves(source)
    if (trouves.length > 0) coupables.push(`${relatif} → ${trouves.join(', ')}`)
  }
  return coupables
}

const FICHIERS = fichiersSource(RACINE)
const GESTIONNAIRES = FICHIERS.filter(f => /[/\\]api[/\\].*route\.ts$/.test(f))

describe('GA — aucune donnée personnelle ne quitte la console dans un fichier (#1670.5)', () => {
  it('LIT quelque chose — le corpus est réel et couvre les gestionnaires de route', () => {
    expect(FICHIERS.length).toBeGreaterThan(60)
    // Sans cette ligne, un renommage de `src/app/api/**` viderait la garde en silence.
    expect(GESTIONNAIRES.length).toBeGreaterThan(20)
    expect(FICHIERS.map(f => f.slice(RACINE.length + 1))).toContain('lib/admin.ts')
  })

  it('SAIT DIRE NON — les six formes d’un export sont refusées', () => {
    expect(exportsTrouves(`  res.headers.set('Content-Disposition', 'attachment; filename="users.csv"')`)).toHaveLength(
      1,
    )
    expect(exportsTrouves(`  return new Response(csv, { headers: { 'content-type': 'text/csv' } })`)).toHaveLength(1)
    expect(exportsTrouves(`  const url = URL.createObjectURL(fichier)`)).toHaveLength(1)
    expect(exportsTrouves(`  const fichier = new Blob([lignes], { type: 'text/plain' })`)).toHaveLength(1)
    expect(exportsTrouves(`  <a download href={url}>Télécharger</a>`)).toHaveLength(1)
    expect(exportsTrouves(`import { saveAs } from 'file-saver'\nsaveAs(fichier)`)).toHaveLength(1)
  })

  it('N’ATTRAPE PAS CE QU’ELLE NE VISE PAS', () => {
    // Lire et AFFICHER des adresses est le métier de la console — en clair.
    expect(exportsTrouves(`  <EmailEnClair value={user.email} />`)).toEqual([])
    // Un `<a>` ordinaire, et un mot qui contient « download » sans être l'attribut.
    expect(exportsTrouves(`  <a href="/users/42">Fiche</a>`)).toEqual([])
    expect(exportsTrouves(`  const downloadedAt = row.downloaded_at`)).toEqual([])
    // Sa propre justification, écrite en commentaire, ne la fait pas rougir.
    expect(exportsTrouves(`// interdit : Content-Disposition, text/csv, new Blob(`)).toEqual([])
    expect(exportsTrouves(`/* aucun URL.createObjectURL( ici */`)).toEqual([])
  })

  it('#4387 — une exception NOMMÉE est acceptée, un export AILLEURS reste refusé', () => {
    const export_ = `return new Response(csv, { headers: { 'content-disposition': 'attachment' } })`
    const exceptions = new Map([['app/api/admin/prospects/export/route.ts', 'raison']])
    // Le fichier nommé passe…
    expect(coupablesDuCorpus({ 'app/api/admin/prospects/export/route.ts': export_ }, exceptions)).toEqual([])
    // …le même code ailleurs — même dans le dossier voisin, ou la page Prospects — est refusé.
    expect(
      coupablesDuCorpus(
        {
          'app/api/admin/users/export/route.ts': export_,
          'app/api/admin/prospects/export/autre.ts': export_,
          'app/prospects/page.tsx': export_,
        },
        exceptions,
      ),
    ).toHaveLength(3)
    // Sans exception inscrite, le fichier de Prospects serait refusé lui aussi.
    expect(coupablesDuCorpus({ 'app/api/admin/prospects/export/route.ts': export_ }, new Map())).toHaveLength(1)
  })

  it('#4387 — l’exception est EXACTE : unique, motivée, et son fichier exporte vraiment', () => {
    expect([...EXCEPTIONS.keys()]).toEqual(['app/api/admin/prospects/export/route.ts'])
    for (const [chemin, raison] of EXCEPTIONS) {
      expect(raison).toContain('#4387')
      expect(raison).toContain('Louis 20/10/2026')
      const source = readFileSync(join(RACINE, chemin), 'utf8')
      // Une exception qui n'exporte plus est une porte ouverte pour rien : on la retire.
      expect(exportsTrouves(source).length).toBeGreaterThan(0)
    }
  })

  it('aucun fichier de la console ne fabrique un export', () => {
    const corpus = Object.fromEntries(FICHIERS.map(f => [f.slice(RACINE.length + 1), readFileSync(f, 'utf8')]))
    const coupables = coupablesDuCorpus(corpus, EXCEPTIONS)

    // ⚠️ Si cette liste cesse d'être vide, la question à répondre est celle de
    // l'issue : « un export de la liste utilisateurs sort des identifiants, pas
    // des emails ». Inscrire une exception NOMMÉE, ou retirer l'export.
    expect(coupables).toEqual([])
  })
})
