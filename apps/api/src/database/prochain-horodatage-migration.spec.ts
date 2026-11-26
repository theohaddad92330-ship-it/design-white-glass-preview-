import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * #2684 — la COMMANDE qui donne un horodatage légal.
 *
 * La règle est posée (`apps/api/src/migrations/README.md`) et gardée : une
 * migration neuve porte un horodatage strictement supérieur au maximum de la
 * série (GA-372), non rond et unique (`migrations.spec.ts`). Mais l'outil qui
 * FABRIQUE le nom, `pnpm migration:create`, prend `Date.now()` — et l'horloge
 * est de deux mois EN RETARD sur la série. Entre une règle qui refuse et un
 * outil qui produit le refusé, il manquait le geste : c'est ce que ce script
 * rend, et ce que ce test prouve.
 *
 * Il a déjà coûté une fois : un agent a décalé son horodatage de +6 × 10⁹ ms
 * à la main pour que son `ALTER` passe après son `CREATE`.
 *
 * ⚠️ Ce script n'INVENTE aucune règle — il OBÉIT à celles qui sont gardées
 * ailleurs. S'il divergeait, ce sont les gardes qui auraient raison.
 */
describe('#2684 — `prochain-horodatage-migration` rend un horodatage légal', () => {
  const SCRIPT = resolve(__dirname, '../../scripts/prochain-horodatage-migration.mjs')
  const MIGRATIONS_REELLES = resolve(__dirname, '../migrations')

  /** Exécute le script sur un répertoire donné et rend sa sortie. */
  const executer = (dossier: string, options: { maintenant?: number; alea?: number } = {}): string => {
    const args = [SCRIPT, dossier]
    if (options.maintenant !== undefined) args.push(`--maintenant=${options.maintenant}`)
    if (options.alea !== undefined) args.push(`--alea=${options.alea}`)
    return execFileSync(process.execPath, args, { encoding: 'utf8' }).trim()
  }

  const dossierAvec = (fichiers: string[]): string => {
    const dossier = mkdtempSync(join(tmpdir(), 'migrations-'))
    for (const fichier of fichiers) writeFileSync(join(dossier, fichier), '// fixture\n')
    return dossier
  }

  it('passe DEVANT le maximum de la série quand l’horloge est en retard', () => {
    // Le défaut exact du 21/09/2026 : l'horloge (1789997572160) est derrière la
    // série (1795725507899). Prendre `Date.now()` placerait la migration avant
    // 229 autres.
    const dossier = dossierAvec(['1795725507899-Derniere.ts', '1767225600000-Premiere.ts'])
    const horodatage = Number(executer(dossier, { maintenant: 1789997572160, alea: 0.5 }))
    expect(horodatage).toBeGreaterThan(1795725507899)
  })

  it('reprend l’horloge RÉELLE dès qu’elle a rattrapé la série', () => {
    // La dérive n'est pas éternelle : le jour où l'horloge repasse devant, on
    // retrouve un vrai horodatage, sans toucher au script.
    const dossier = dossierAvec(['1795725507899-Derniere.ts'])
    expect(Number(executer(dossier, { maintenant: 1800000000123, alea: 0.5 }))).toBe(1800000000123)
  })

  it('ne rend JAMAIS un nombre rond — la cause des trois collisions du 30/08', () => {
    // Un horodatage rond est ce que tout le monde choisit à la main, donc ce
    // que deux branches parallèles choisissent EN MÊME TEMPS.
    const dossier = dossierAvec(['1700000000000-Ancienne.ts'])
    const horodatage = Number(executer(dossier, { maintenant: 1800000000000, alea: 0 }))
    expect(horodatage % 100_000_000).not.toBe(0)
  })

  it('deux appels parallèles ne tombent pas sur la même valeur', () => {
    // Deux agents d'une même vague appellent la commande à la même seconde :
    // sans écart, les deux migrations porteraient le même horodatage et
    // TypeORM ordonnerait selon la lecture du répertoire.
    const dossier = dossierAvec(['1795725507899-Derniere.ts'])
    const premier = Number(executer(dossier, { maintenant: 1789997572160, alea: 0.1 }))
    const second = Number(executer(dossier, { maintenant: 1789997572160, alea: 0.9 }))
    expect(premier).not.toBe(second)
  })

  it('refuse un répertoire SANS migration au lieu d’inventer un nombre', () => {
    // Un répertoire vide est un chemin faux, pas une série vide : rendre « 1 »
    // fabriquerait une migration qui s'exécute avant tout le reste.
    const dossier = dossierAvec([])
    expect(() => executer(dossier)).toThrow()
  })

  it('sur la série RÉELLE, rend un horodatage supérieur à TOUTES les migrations du dépôt', () => {
    // Le test qui prouve que le script lit un corpus, et pas un répertoire vide.
    const existants = readdirSync(MIGRATIONS_REELLES)
      .map(fichier => Number(/^(\d{13})-/.exec(fichier)?.[1] ?? 0))
      .filter(Boolean)
    expect(existants.length).toBeGreaterThan(400)

    const horodatage = Number(executer(MIGRATIONS_REELLES))
    expect(horodatage).toBeGreaterThan(Math.max(...existants))
    expect(existants).not.toContain(horodatage)
  })
})
