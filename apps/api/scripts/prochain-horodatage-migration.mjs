#!/usr/bin/env node
/**
 * L'horodatage d'une migration NEUVE (#2684).
 *
 *   pnpm --filter @bellum/api migration:next
 *   → 1795997318605
 *
 * POURQUOI CE SCRIPT EXISTE
 * ─────────────────────────
 * `pnpm migration:create` (TypeORM) date le fichier avec `Date.now()`. Or la
 * série du dépôt a dérivé DEVANT l'horloge : mesuré le 21/09/2026, les 478
 * migrations allaient jusqu'au 26/11/2026 alors que la machine disait le
 * 21/09. Un `Date.now()` se serait donc placé AVANT 229 migrations existantes,
 * et TypeORM, qui exécute par ordre d'horodatage, aurait joué un `ALTER` avant
 * le `CREATE TABLE` dont il dépend — sur toute base fraîche, donc en CI.
 *
 * La règle était écrite (`src/migrations/README.md`) et gardée (GA-372), mais
 * aucun geste ne la servait : il fallait calculer le maximum à la main. Un
 * agent l'a fait en décalant son horodatage de +6 × 10⁹ ms, et l'a signalé
 * comme son seul écart assumé. Ce script est ce geste.
 *
 * CE QU'IL NE FAIT PAS
 * ────────────────────
 * Il n'invente aucune règle : il OBÉIT à celles qui sont gardées ailleurs
 * (> maximum : GA-372 ; jamais rond ni dupliqué : `src/database/migrations.spec.ts`).
 * Il ne renomme, ne déplace et ne crée aucun fichier — les 478 migrations déjà
 * parties en production ne se réécrivent pas.
 *
 * Il rend l'horloge RÉELLE dès qu'elle repasse devant la série : la dérive
 * n'est pas éternelle, et le jour venu ce script s'efface de lui-même en
 * rendant simplement `Date.now()`.
 *
 * Arguments (tous facultatifs) :
 *   [dossier]            le répertoire des migrations (défaut : ../src/migrations)
 *   --maintenant=<ms>    l'horloge, pour le test
 *   --alea=<0..1>        l'écart tiré, pour le test
 */
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOTIF = /^(\d{13})-.+\.ts$/
/** L'écart maximal tiré au sort quand l'horloge est en retard : deux agents de
 *  la même vague ne doivent pas tomber sur la même valeur (trois collisions
 *  mesurées le 30/08/2026), et une minute d'étalement suffit. */
const ETALEMENT_MS = 60_000

/**
 * L'horodatage légal suivant.
 *
 * `maintenant` s'il est déjà devant la série ; sinon le maximum plus un écart
 * tiré — jamais le maximum lui-même (GA-372 refuse l'égalité), jamais un
 * multiple de 10⁸ (la forme ronde que tout le monde choisit à la main, donc
 * celle que deux branches choisissent en même temps).
 */
function prochainHorodatage({ existants, maintenant, alea }) {
  if (existants.length === 0) {
    throw new Error(
      'Aucune migration lue : le répertoire est vide ou le chemin est faux. Rendre un horodatage ici ' +
        "fabriquerait une migration qui s'exécute avant toutes les autres.",
    )
  }
  const maximum = Math.max(...existants)
  let horodatage = maintenant > maximum ? maintenant : maximum + 1 + Math.floor(alea * ETALEMENT_MS)
  if (horodatage % 100_000_000 === 0) horodatage += 1
  return horodatage
}

/** Les horodatages réellement présents dans un répertoire de migrations. */
function horodatagesDe(dossier) {
  return readdirSync(dossier)
    .map(fichier => MOTIF.exec(fichier)?.[1])
    .filter(Boolean)
    .map(Number)
}

function principal(argv) {
  const positionnels = argv.filter(argument => !argument.startsWith('--'))
  const option = nom => {
    const trouve = argv.find(argument => argument.startsWith(`--${nom}=`))
    return trouve === undefined ? undefined : Number(trouve.split('=')[1])
  }
  const parDefaut = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'migrations')
  const dossier = positionnels[0] ?? parDefaut
  const maintenant = option('maintenant') ?? Date.now()
  const alea = option('alea') ?? Math.random()
  return prochainHorodatage({ existants: horodatagesDe(dossier), maintenant, alea })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(`${principal(process.argv.slice(2))}\n`)
  } catch (erreur) {
    process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`)
    process.exit(1)
  }
}
