import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * #4711.1 — QUAND cette build a été construite, à ne pas confondre avec `timestamp` (l'heure de la réponse).
 *
 * #4711.2 — la valeur est POSÉE AU BUILD (`buildCommand`, `.railway/railway.ts`) dans `build-time.txt`, au dossier du
 * service, puis relue ici ; la variable `BUILD_TIME` prime quand une plateforme la pose. Sans l'une ni l'autre (dev
 * local), `null` : on ne prétend jamais savoir, jamais l'heure du démarrage prise pour celle de la build.
 */
export function readBuiltAt(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  moduleDir: string = __dirname,
): string | null {
  const fromEnv = env['BUILD_TIME']?.trim()
  // #4711.2 — le fichier est cherché au dossier courant PUIS en remontant depuis ce module : le dossier courant
  // d'un démarrage Railway n'est pas celui où la commande de build a écrit (mesuré : `built_at` restait `null`).
  const raw = fromEnv || readFile(join(cwd, 'build-time.txt')) || readUpwards(moduleDir)
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim() || null
  } catch {
    return null
  }
}

function readUpwards(start: string): string | null {
  let dir = start
  for (let depth = 0; depth < 6; depth += 1) {
    const found = readFile(join(dir, 'build-time.txt'))
    if (found) return found
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
