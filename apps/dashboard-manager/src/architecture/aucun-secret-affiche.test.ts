import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * #1671.1 — « AUCUN SECRET AFFICHÉ dans le manager. Les clés API des
 * fournisseurs, INTERNAL_API_SECRET, les jetons OAuth des clients : jamais
 * rendus, même masqués. Un balayage le vérifie. »
 *
 * Le balayage, c'est ce fichier. Il tient DEUX règles distinctes, parce qu'un
 * secret peut fuir de deux façons :
 *
 *  1. Par l'ENVIRONNEMENT — une variable non préfixée `NEXT_PUBLIC_` lue dans un
 *     fichier qui peut partir au navigateur. Next n'inline QUE les
 *     `NEXT_PUBLIC_*` côté client, donc le risque réel est un composant serveur
 *     qui lit un secret et le passe en prop à un composant client, où il
 *     atterrit dans le HTML sérialisé. La garde refuse la lecture à la source.
 *  2. Par la DONNÉE — un champ nommé `secret`, `apiKey`, `token`, `password`
 *     rendu à l'écran parce que l'API le renvoie. « Même masqué » : afficher
 *     `sk-••••1234` dit déjà la longueur, le préfixe et le fournisseur.
 *
 * ⚠️ CE QUE LA GARDE NE PEUT PAS FAIRE
 * Elle ne lit pas les payloads de l'API : un champ appelé `value` qui contient
 * une clé lui échappe. C'est une garde de NOMMAGE, et c'est dit plutôt que
 * sous-entendu. La règle « présence, jamais valeur » de la page d'état de
 * sécurité reste à tenir par la revue.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))

/** Ce qui PEUT finir dans le navigateur. Les `.ts` de `lib/` sont serveur. */
function fichiersTsx(dir: string, out: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) fichiersTsx(chemin, out)
    else if (entree.endsWith('.tsx')) out.push(chemin)
  }
  return out
}

/** `process.env.X` / `process.env['X']` dont X n'est pas `NEXT_PUBLIC_*`. */
const ENV_PRIVEE = /process\.env(?:\.(?!NEXT_PUBLIC_)([A-Z0-9_]+)|\[\s*'(?!NEXT_PUBLIC_)([A-Z0-9_]+)'\s*\])/g

/**
 * Un CHAMP au nom parlant, rendu comme du texte dans du JSX.
 *
 * ⚠️ La première version de cette garde attrapait `hasApiKeyConfigured` — une
 * PRÉSENCE, c'est-à-dire exactement ce que #1671.4 demande d'afficher. Elle
 * disait donc non à ce qu'elle est censée protéger. Deux resserrages :
 *  - seul un ACCÈS de propriété compte (`x.apiKey`), pas un identifiant local ;
 *  - un nom qui décrit une présence (`has…`, `is…`, `…Configured`, `…Present`)
 *    n'est pas une valeur, et il sort.
 */
const CHAMP_SECRET = /\.(\w*(?:[sS]ecret|[aA]piKey|api_key|[pP]assword|[aA]ccessToken|[rR]efreshToken)\w*)\b/g

/** Ces noms décrivent qu'un secret EXISTE, pas ce qu'il vaut. */
const DECRIT_UNE_PRESENCE = /^(?:has|is|est|a)[A-Z]|(?:Configured|Present|Set|Missing|Enabled)$/

export function rendUnSecret(source: string): string[] {
  const trouves: string[] = []
  // On ne regarde que l'intérieur des accolades JSX : `{…}` est ce qui s'AFFICHE.
  for (const bloc of source.match(/\{[^{}]{0,200}\}/g) ?? []) {
    for (const m of bloc.matchAll(CHAMP_SECRET)) {
      const nom = m[1] ?? ''
      if (DECRIT_UNE_PRESENCE.test(nom)) continue
      trouves.push(nom)
    }
  }
  return trouves
}

export function litUneEnvPrivee(source: string): string[] {
  // ⚠️ `ENV_PRIVEE` porte `g` : `matchAll` ne garde pas de curseur, `.test()` si.
  return [...source.matchAll(ENV_PRIVEE)].map(m => m[1] ?? m[2] ?? '?')
}

describe('aucun secret n’est affiché par le back-office (#1671.1)', () => {
  it('LIT quelque chose — le corpus servi au navigateur n’est pas vide', () => {
    const fichiers = fichiersTsx(SRC)
    expect(fichiers.length).toBeGreaterThan(30)
    // Contrôle positif de la LECTURE : le layout lit bien deux variables, et
    // toutes deux sont publiques. Une lecture cassée rendrait un tableau vide.
    const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8')
    expect(layout).toContain('process.env.NEXT_PUBLIC_VERCEL_ENV')
    expect(litUneEnvPrivee(layout)).toEqual([])
  })

  it('sait dire NON — une variable privée et un champ parlant sont refusés', () => {
    expect(litUneEnvPrivee('const s = process.env.INTERNAL_API_SECRET')).toEqual(['INTERNAL_API_SECRET'])
    expect(litUneEnvPrivee("const s = process.env['DM_BASIC_AUTH_PASSWORD']")).toEqual(['DM_BASIC_AUTH_PASSWORD'])
    expect(rendUnSecret('<td>{provider.apiKey}</td>')).toEqual(['apiKey'])
    expect(rendUnSecret('<code>{cfg.clientSecret.slice(0, 4)}••••</code>')).toEqual(['clientSecret'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — le public reste public', () => {
    expect(litUneEnvPrivee('process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA')).toEqual([])
    // « configuré ou non » est une PRÉSENCE, pas une valeur : c'est exactement
    // ce que #1671.4 demande d'afficher, et la première version de cette garde
    // le refusait.
    expect(rendUnSecret('<span>{hasApiKeyConfigured ? "configuré" : "absent"}</span>')).toEqual([])
    expect(rendUnSecret('<span>{cfg.apiKeyConfigured ? "oui" : "non"}</span>')).toEqual([])
    // Et un identifiant local qui n'est pas un champ ne compte pas.
    expect(rendUnSecret('<span>{secretsCount}</span>')).toEqual([])
  })

  it('aucun fichier servi au navigateur ne lit une variable privée', () => {
    const fautifs = fichiersTsx(SRC).flatMap(chemin =>
      litUneEnvPrivee(readFileSync(chemin, 'utf8')).map(nom => `${relative(SRC, chemin)} — ${nom}`),
    )

    expect(
      fautifs,
      [
        'Une variable non préfixée NEXT_PUBLIC_ est lue dans un fichier qui peut',
        'partir au navigateur. La lire côté serveur (un .ts de lib/) et ne passer',
        'que ce que l’écran doit MONTRER — une présence, jamais une valeur (#1671.1).',
        '',
        ...fautifs,
      ].join('\n'),
    ).toEqual([])
  })

  it('aucun champ au nom de secret n’est rendu à l’écran', () => {
    const fautifs = fichiersTsx(SRC).flatMap(chemin =>
      rendUnSecret(readFileSync(chemin, 'utf8')).map(nom => `${relative(SRC, chemin)} — ${nom}`),
    )

    expect(
      fautifs,
      ['Un champ au nom de secret est rendu — « jamais rendus, même masqués » (#1671.1).', '', ...fautifs].join('\n'),
    ).toEqual([])
  })
})
