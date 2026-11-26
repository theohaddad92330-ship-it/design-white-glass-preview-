import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-45 — une seule porte vers l'API : `apiBase()` / `apiUrl()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Derrière une passerelle d'entreprise qui bloque le domaine de l'API, le repli
 * d'origine fait passer les appels par `/api`. Il ne vaut que si TOUS les appels
 * y passent : un seul `fetch` qui lit `VITE_API_URL` en direct suffit à rouvrir
 * le trou, et il le rouvre à l'endroit exact où ça fait le plus mal.
 *
 * Mesuré le 25/08/2026, en recette réelle et non en test : `refreshTokensOnce`
 * appelait `config.apiUrl` directement. Conséquence pour l'utilisateur bloqué —
 * il se connecte (le login passe par `/api`), il travaille, un jeton expire, et
 * CE refresh-là repart vers le domaine bloqué. Le `catch` rend `false`, la
 * session est déclarée morte, et il est renvoyé sur l'écran de connexion sans
 * rien comprendre. Quatre autres appels étaient dans le même cas, dont les
 * exports de documents.
 *
 * Aucun test unitaire ne pouvait le voir : ils couvraient `apiFetch`, et ces
 * appels-là sont précisément ceux qui ne passent pas par lui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE LÉGITIMEMENT DEHORS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque exception est NOMMÉE avec sa raison. La liste ne peut que rétrécir.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * Les fichiers autorisés à lire `VITE_API_URL`, et pourquoi.
 *
 * ⚠️ Y ajouter une entrée demande de répondre d'abord à « que se passe-t-il
 * pour un utilisateur derrière une passerelle ? ».
 */
const ALLOWED: Record<string, string> = {
  'lib/api-origin.ts': 'La porte elle-même : c’est elle qui décide de l’origine.',
  'lib/api.ts':
    '`config.apiUrl` reste exporté pour les appelants historiques ; tous ses fetch passent par `apiBase()`.',
  'lib/socket.ts':
    'Socket.IO ne PEUT pas passer par le repli — les réécritures Vercel ne proxifient pas les WebSockets. Il garde donc le domaine direct, et le sondage HTTP prend le relais à 4 s (voir `analysis-status-sync.ts`). C’est une limite assumée, pas un oubli.',
  'features/auth/hooks/useRedirectAfterAuth.ts':
    'Compare une ORIGINE pour autoriser un rebond OAuth. Une base relative ferait lever `new URL` — et l’allow-list doit porter sur le domaine réel de l’API, pas sur le chemin de repli.',
  'features/api-keys/components/ApiKeysCard.tsx':
    'Construit un lien vers la documentation publique, ouvert dans un nouvel onglet. Ce n’est pas un appel de l’application.',
  'components/DevStatusBar.tsx': 'Barre de développement : jamais rendue en production.',
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Retire les commentaires : ce docblock cite `VITE_API_URL`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function relative(file: string): string {
  return file.slice(file.indexOf('/src/') + 5)
}

/** Les fichiers qui lisent l'URL de l'API sans passer par la porte. */
function directReaders(): string[] {
  return sourceFiles(WEB_SRC)
    .filter(file => /VITE_API_URL/.test(stripComments(readFileSync(file, 'utf8'))))
    .map(relative)
    .filter(path => !(path in ALLOWED))
    .sort()
}

describe('GA-45 — une seule porte vers l’API', () => {
  it('LIT quelque chose — le corpus n’est pas vide', () => {
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(200)
  })

  it('trouve bien les lecteurs AUTORISÉS — preuve qu’elle sait voir', () => {
    // Si elle n'en trouve aucun, c'est qu'elle ne cherche pas au bon endroit,
    // et son silence sur les autres ne vaut rien.
    const all = sourceFiles(WEB_SRC).filter(f => /VITE_API_URL/.test(stripComments(readFileSync(f, 'utf8'))))
    expect(all.length).toBeGreaterThan(3)
  })

  it('aucun fichier ne lit VITE_API_URL hors des exceptions nommées', () => {
    expect(directReaders()).toEqual([])
  })

  it('chaque exception porte une raison écrite, pas une case cochée', () => {
    const tooShort = Object.entries(ALLOWED)
      .filter(([, reason]) => reason.trim().length <= 40)
      .map(([path]) => path)
    expect(tooShort).toEqual([])
  })

  it('les exceptions déclarées existent toutes — pas d’entrée périmée', () => {
    const real = new Set(sourceFiles(WEB_SRC).map(relative))
    expect(Object.keys(ALLOWED).filter(path => !real.has(path))).toEqual([])
  })
})
