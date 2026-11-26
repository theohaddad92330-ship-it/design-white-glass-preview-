import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAPACITES, type Capability } from '../lib/roles'

/**
 * #1669 — « Le rôle est vérifié CÔTÉ API, pas seulement à l'écran. Un viewer qui
 * appelle /api/admin/users/x/delete reçoit 403, même s'il n'a pas le bouton. »
 *
 * POURQUOI UNE GARDE ET PAS UNE RELECTURE
 * Ces routes sont la SEULE porte vers `INTERNAL_API_SECRET`, donc vers l'API qui
 * peut supprimer n'importe quel compte de n'importe quel client. Il y en a trente
 * et une, et la trente-deuxième s'écrira dans six semaines par quelqu'un qui
 * n'aura pas lu cette issue. Une vérification qu'on ajoute route par route est
 * un défaut de POPULATION : juste sur chacune qu'on pense à traiter, faux sur
 * celle qu'on oublie — c'est le même motif que les 39 tableaux sans conteneur
 * défilant, mesuré ici même le 06/09.
 *
 * ⚠️ CE QUE CETTE GARDE PEUT ET NE PEUT PAS FAIRE
 * Elle vérifie qu'une capacité est DEMANDÉE, et laquelle. Elle ne peut pas juger
 * si c'est la BONNE pour le geste — ça demanderait de comprendre ce que la route
 * fait. Les quatre routes qui coûtent le plus cher sont donc épinglées une par
 * une plus bas ; le reste tient à la revue.
 */

const API = fileURLToPath(new URL('../app/api/', import.meta.url))

/**
 * `/api/auth/**` est exempt, et la raison tient en une phrase : **la porte ne
 * peut pas exiger d'avoir déjà franchi la porte.** L'exemption se mesure sur le
 * CHEMIN, qui est le fait, et non sur une liste de fichiers recopiée — une liste
 * ne voit jamais la route qu'on ajoutera demain.
 */
export function estLaPorteElleMeme(cheminRelatif: string): boolean {
  return cheminRelatif.split(sep)[0] === 'auth'
}

function routes(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) routes(chemin, out)
    else if (entree === 'route.ts') out.push(chemin)
  }
  return out
}

const VERBES = /export async function (GET|POST|PATCH|PUT|DELETE)\b/g

/** Une capacité demandée, telle qu'elle est ÉCRITE dans le code. */
const DEMANDE = /exigerCapacite\(\s*req\s*,\s*'([^']+)'\s*\)/

export type Handler = { verbe: string; capacite: string | null }

/**
 * Découpe un fichier de route en gestionnaires, et lit ce que chacun exige.
 *
 * Le découpage se fait sur les exports eux-mêmes : ce qui précède le premier est
 * de l'entête (imports, commentaires, `dynamic`), et chaque morceau qui suit
 * appartient à un et un seul gestionnaire — ce qui évite qu'un `exigerCapacite`
 * écrit dans le GET fasse passer le DELETE d'à côté.
 */
export function handlers(source: string): Handler[] {
  const bornes = [...source.matchAll(VERBES)]
  return bornes.map((borne, index) => {
    const debut = borne.index ?? 0
    const fin = bornes[index + 1]?.index ?? source.length
    return { verbe: borne[1] ?? '?', capacite: DEMANDE.exec(source.slice(debut, fin))?.[1] ?? null }
  })
}

const FICHIERS = routes(API).map(chemin => ({
  chemin: relative(API, chemin),
  handlers: handlers(readFileSync(chemin, 'utf8')),
}))

const GARDEES = FICHIERS.filter(fichier => !estLaPorteElleMeme(fichier.chemin))

describe('toute route du back-office déclare la capacité qu’elle exige (#1669)', () => {
  it('LIT quelque chose — le corpus de routes et de gestionnaires n’est pas vide', () => {
    // Contrôle positif : un `API` faux, un découpage cassé ou un `VERBES` qui ne
    // matche plus rendraient zéro gestionnaire, donc zéro manquant, donc une
    // garde verte qui n'a rien ouvert.
    expect(FICHIERS.length).toBeGreaterThan(25)
    expect(GARDEES.flatMap(fichier => fichier.handlers).length).toBeGreaterThan(28)
    expect(FICHIERS.map(fichier => fichier.chemin)).toContain(join('admin', 'users', '[userId]', 'delete', 'route.ts'))
  })

  it('sait dire NON — un gestionnaire sans capacité est repéré', () => {
    const sansPorte = 'export async function DELETE(req: NextRequest) {\n  return adminMutate("DELETE", "/x")\n}'
    expect(handlers(sansPorte)).toEqual([{ verbe: 'DELETE', capacite: null }])
  })

  it('n’attrape pas ce qu’elle ne vise pas — chaque verbe lit SA propre porte', () => {
    // Le piège exact : un fichier à deux verbes dont un seul est gardé. Sans le
    // découpage, le `exigerCapacite` du GET couvrirait le DELETE d'à côté.
    const deuxVerbes = [
      'export async function GET(req: NextRequest) {',
      "  const refus = await exigerCapacite(req, 'feedback.read')",
      '  return lire()',
      '}',
      'export async function DELETE(req: NextRequest) {',
      '  return supprimer()',
      '}',
    ].join('\n')
    expect(handlers(deuxVerbes)).toEqual([
      { verbe: 'GET', capacite: 'feedback.read' },
      { verbe: 'DELETE', capacite: null },
    ])
    // Et la porte elle-même reste exempte, mesurée sur le chemin.
    expect(estLaPorteElleMeme(join('auth', 'login', 'route.ts'))).toBe(true)
    expect(estLaPorteElleMeme(join('admin', 'users', '[userId]', 'delete', 'route.ts'))).toBe(false)
  })

  it('aucune route n’oublie sa capacité', () => {
    const nues = GARDEES.flatMap(fichier =>
      fichier.handlers.filter(h => h.capacite === null).map(h => `${fichier.chemin} — ${h.verbe}`),
    )
    expect(
      nues,
      [
        'Un gestionnaire de route n’exige aucune capacité : un viewer l’atteindrait',
        'par un simple appel, sans avoir le bouton (#1669). Ajouter en première ligne :',
        "  const refus = await exigerCapacite(req, '<capacité>')",
        '  if (refus) return refus',
        '',
        ...nues,
      ].join('\n'),
    ).toEqual([])
  })

  it('toute capacité demandée existe dans la matrice', () => {
    const connues = new Set(Object.keys(CAPACITES))
    const inventees = GARDEES.flatMap(fichier =>
      fichier.handlers
        .filter(h => h.capacite !== null && !connues.has(h.capacite))
        .map(h => `${fichier.chemin} — ${h.capacite}`),
    )
    expect(inventees, ['Une capacité demandée n’est pas dans la matrice :', ...inventees].join('\n')).toEqual([])
  })

  it('les gestes irréversibles portent LA capacité de la matrice, pas une voisine', () => {
    // La garde ne sait pas juger un geste ; ces quatre-là valent d'être
    // épinglés parce qu'une erreur y coûte un compte, un tarif ou une facture.
    const attendu: Record<string, Capability> = {
      [join('admin', 'users', '[userId]', 'delete', 'route.ts')]: 'users.delete',
      [join('admin', 'users', '[userId]', 'impersonate', 'route.ts')]: 'impersonate',
      [join('admin', 'plans', '[key]', 'route.ts')]: 'offers.write',
      [join('admin', 'clients', 'manual', '[workspaceId]', 'invoices', 'route.ts')]: 'invoices.write',
    }
    for (const [chemin, capacite] of Object.entries(attendu)) {
      const fichier = GARDEES.find(candidat => candidat.chemin === chemin)
      expect(fichier, `route introuvable : ${chemin}`).toBeDefined()
      expect(
        fichier?.handlers.map(h => h.capacite),
        chemin,
      ).toContain(capacite)
    }
  })
})
