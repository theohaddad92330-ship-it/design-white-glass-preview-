import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4197 (L6) — LES ANCIENNES ADRESSES REDIRIGENT, DANS LE LOADER.
 *
 * Les adresses qui changent de destination (#4197 le 14/10, #4340/#4349 le
 * 19/10) ; aucune ne doit rendre une page vide
 * ni boucler. Redirection par `beforeLoad` + `throw redirect({ replace: true })`
 * (modèle `routes/consultants/index.tsx`), jamais `<Navigate>` (GA-27).
 *
 * #4359 — les alias d'adresse pure (`/missions/board`, `/consultants/submissions`,
 * `/projects/pistes`…) n'ont plus de fichier de route : `lib/legacy-addresses.ts`.
 */
const ROUTES = join(__dirname, '..', '..', 'routes')
const read = (file: string) => readFileSync(join(ROUTES, file), 'utf8')
/** #4545 — la destination des pistes : le panneau du Pipe, ouvert par `?pistes=1`. */
const PISTES_PANEL = /redirect\(\{[^}]*to:\s*'\/projects',\s*search:\s*\{\s*pistes:\s*1\s*\}/
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('#4197 — les anciennes URL redirigent', () => {
  // #4528.2 (Louis 24/10/2026, revient sur #4502 côté Talents, garde #4349) — une présentation ne vit qu'à UN
  // endroit : Affaires › Présentations. Les trois anciennes portes y mènent.
  it('/consultants?view=submissions → /projects/presentations', () => {
    const source = code(read('consultants/index.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/view === 'submissions'/)
    expect(source).toMatch(/redirect\(\{[^}]*to:\s*'\/projects\/presentations'/)
    expect(source).toMatch(/replace:\s*true/)
    expect(source).not.toMatch(/hash:\s*'positionnements'/)
  })

  it('/consultants#positionnements → /projects/presentations', () => {
    const source = code(read('consultants/index.tsx'))
    expect(source).toMatch(/location\.hash === 'positionnements'/)
  })

  it('/consultants/submissions → /projects/presentations, avant que $id le prenne pour un identifiant', () => {
    const source = code(read('consultants/$id.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/params\.id === 'submissions'/)
    expect(source).toMatch(/redirect\(\{[^}]*to:\s*'\/projects\/presentations'/)
    expect(source).toMatch(/replace:\s*true/)
  })

  // Droits inchangés : la redirection ne contourne pas le palier d'Affaires › Présentations.
  it('la destination garde son palier (`feature="needs"`) — la redirection ne le contourne pas', () => {
    const source = code(read('projects/presentations.tsx'))
    expect(source).toMatch(/<PlanFeatureRoute feature="needs"/)
    for (const file of ['consultants/index.tsx', 'consultants/$id.tsx']) {
      expect(code(read(file)), file).not.toMatch(/skipGate|bypass/i)
    }
  })

  // #4340 (Louis 19/10/2026) — les Pistes vivaient dans Signaux ; #4545 (Louis 25/10/2026) revient dessus :
  // elles ouvrent le panneau des pistes du Pipe (`/projects?pistes=1`), l'ancre `#pistes` n'existe plus.
  it('/projects?lens=portfolio → /projects?pistes=1', () => {
    const source = code(read('projects/index.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/lens === 'portfolio'/)
    expect(source).toMatch(PISTES_PANEL)
    expect(source).not.toMatch(/hash:\s*'pistes'/)
    expect(source).toMatch(/replace:\s*true/)
  })

  // #4340.1 — en chargement direct, `/projects/pistes` était capté par `$id` (« Projet introuvable »).
  it('/projects/pistes → /projects?pistes=1, avant que $id le prenne pour un identifiant', () => {
    const source = code(read('projects/$id.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/params\.id === 'pistes'/)
    expect(source).toMatch(PISTES_PANEL)
    expect(source).not.toMatch(/hash:\s*'pistes'/)
    expect(source).toMatch(/replace:\s*true/)
  })

  // Louis 23/10 — Signaux (Théo) remplace « Mes cibles » : l'ancienne adresse redirige, « Mes veilles » garde sa vue.
  // #4545 — son ancre `#pistes` (conservée le 23/10) ouvre le panneau des pistes du Pipe : l'ancre n'existe plus.
  it('/mes-cibles → /signals ; #pistes → le panneau des pistes ; ?view=veilles → /signals/watches', () => {
    const source = code(read('mes-cibles/index.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/view === 'veilles'/)
    expect(source).toMatch(/redirect\(\{[^}]*to:\s*'\/signals\/watches'/)
    expect(source).toMatch(/redirect\(\{[^}]*to:\s*'\/signals',\s*replace/)
    expect(source).toMatch(/hash[^\n]*'pistes'/)
    expect(source).toMatch(PISTES_PANEL)
    expect(source).not.toMatch(/hash:\s*location\.hash/)
    expect(source).toMatch(/replace:\s*true/)
    expect(source).not.toMatch(/component:/)
    expect(source).not.toMatch(/<Navigate/)
  })

  // Louis 23/10 — « Mes analyses » est une vue de la recherche.
  it('/search/history → /search?vue=historique', () => {
    const source = code(read('search/history.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(/redirect\(\{[^}]*to:\s*'\/search',\s*search:\s*\{\s*vue:\s*'historique'/)
    expect(source).toMatch(/replace:\s*true/)
    expect(source).not.toMatch(/component:/)
  })

  it('/pilotage/pipe → /pilotage#pipe (Théo D : une page, des sections ancrées)', () => {
    const source = code(read('pilotage/pipe.tsx'))
    expect(source).toMatch(/beforeLoad/)
    expect(source).toMatch(
      /redirect\(\{[^}]*to:\s*'\/pilotage',\s*hash:\s*(?:location\.hash === 'parcours' \? 'parcours' : )?'pipe'/,
    )
    expect(source).toMatch(/replace:\s*true/)
  })

  it('aucune de ces routes n’utilise <Navigate> (GA-27)', () => {
    for (const file of [
      'consultants/index.tsx',
      'consultants/$id.tsx',
      'projects/index.tsx',
      'projects/$id.tsx',
      'pilotage/pipe.tsx',
      'mes-cibles/index.tsx',
      'search/history.tsx',
    ]) {
      expect(code(read(file)), file).not.toMatch(/<Navigate/)
    }
  })
})
