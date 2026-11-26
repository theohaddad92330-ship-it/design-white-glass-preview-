/**
 * GA-278 — un dialogue DIT ce qu'il fait, pas seulement comment il s'appelle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI L'A PAYÉE
 * ─────────────────────────────────────────────────────────────────────────
 * #1780, retour d'un client sur le vivier : quatre avertissements
 * « Missing `Description` or `aria-describedby={undefined}` for {DialogContent} »
 * sur son seul parcours, dont celui du dialogue de suppression — celui qu'il a
 * ouvert trois fois de suite. Un titre nomme la boîte ; il ne dit pas ce que le
 * bouton du bas va faire. Pour qui navigue au lecteur d'écran, « Retirer Nadia
 * Berrada du vivier » s'annonce seul, sans sa conséquence.
 *
 * Huit dialogues sur soixante-cinq étaient dans ce cas. Ce n'est pas la
 * moitié du produit, et c'est exactement pour ça qu'une garde vaut le coup :
 * huit fautifs se corrigent en un lot, et le neuvième arrive tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE, ET CE QU'ELLE NE MESURE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle compte par FICHIER, pas par balise : découper du JSX à la regex pour
 * rattacher un enfant à son parent est exactement le piège qui a fait accuser
 * 43 boutons irréprochables (GA-32). Un fichier qui monte un `DialogContent`
 * doit porter, quelque part, une `DialogDescription` ou un `aria-describedby`.
 * Un fichier à deux dialogues et une seule description passerait donc — c'est
 * assumé : la garde attrape l'oubli complet, qui est la forme observée.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full)
  }
  return out
}

/** Les fichiers qui MONTENT un dialogue. */
function dialogFiles(): { path: string; source: string }[] {
  return sourceFiles(SRC)
    .map(path => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(file => file.source.includes('<DialogContent'))
}

function describesItself(source: string): boolean {
  return source.includes('<DialogDescription') || source.includes('aria-describedby')
}

describe('GA-278 — un dialogue dit ce qu’il fait', () => {
  it('LIT un corpus non vide — sinon la garde ne garde rien', () => {
    // Le contrôle positif : sans lui, un chemin faux rendrait « zéro fautif »
    // et se lirait comme une réussite.
    expect(dialogFiles().length).toBeGreaterThan(30)
  })

  it('chaque écran qui ouvre un dialogue porte une description', () => {
    const silent = dialogFiles()
      .filter(file => !describesItself(file.source))
      .map(file => file.path.slice(SRC.length + 1))
    expect(silent, `dialogues sans description : ${silent.join(', ')}`).toEqual([])
  })

  it('sait dire NON — un dialogue fabriqué sans description est attrapé', () => {
    const fautif = `
      <Dialog open={open}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer</DialogTitle></DialogHeader>
        </DialogContent>
      </Dialog>`
    expect(fautif.includes('<DialogContent')).toBe(true)
    expect(describesItself(fautif)).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — `aria-describedby` explicite suffit', () => {
    // Un dialogue qui pointe une description déjà présente ailleurs sur la page
    // est correct : c'est ce que la règle ARIA demande, et une garde qui
    // exigerait le composant en plus refuserait du code juste.
    const legitime = `<DialogContent aria-describedby="explication-du-retrait">…</DialogContent>`
    expect(describesItself(legitime)).toBe(true)
  })
})
