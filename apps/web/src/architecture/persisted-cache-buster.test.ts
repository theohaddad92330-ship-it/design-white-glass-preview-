import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-42 — tout cache persisté porte un buster de version (Tome 7 §22.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QUE ÇA A DÉJÀ COÛTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome le formule en une ligne : « un état de panne mis en cache survit à sa
 * réparation ». C'est le pire défaut possible d'un déploiement — on corrige, on
 * déploie, et l'utilisateur voit toujours l'écran cassé, parce que son
 * navigateur relit ce qu'il avait enregistré avant le correctif. Personne ne
 * pense à vider un cache dont il ignore l'existence, et le rapport de bug qui
 * remonte dit « toujours pas corrigé ».
 *
 * Le dépôt l'a payé DEUX fois, sur les deux étages :
 *
 *   1. le persister TanStack (`App.tsx`) — corrigé le 17/08 par `persistOptions.buster` ;
 *   2. les instantanés de requête (`query-snapshots.ts`) — corrigé ensuite, en
 *      mettant la version du build DANS la clé.
 *
 * Deux étages, deux correctifs séparés, à deux dates. Le second n'a été trouvé
 * qu'en relisant le premier. C'est exactement la situation où une garde vaut
 * mieux qu'une intention : un TROISIÈME étage arriverait sans protection, et
 * son symptôme ne se verrait qu'en production, chez l'utilisateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI PORTE LA GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tout ce qui est persisté ne doit PAS être busté. Une PRÉFÉRENCE — un thème,
 * un onglet retenu, un filtre — doit survivre à un déploiement : la buster
 * ferait perdre son réglage à chaque livraison, ce qui est un défaut à part
 * entière. La règle porte sur le CACHE, c'est-à-dire sur ce qui est une COPIE
 * d'un état serveur : lui, doit mourir avec la version qui l'a écrit.
 *
 * La garde ne vise donc que le magasin de cache (`lib/cache/idb`), pas
 * `localStorage`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE A TROUVÉ EN ÉTANT ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Douze magasins déclarés, quatre écrits dans le code — et **deux de ces quatre
 * écritures n'avaient pas de buster** : `accounts` et `drafts`. Corrigé au
 * moment d'écrire cette garde ; c'est elle qui les a nommés.
 *
 * Le détail qui compte : ces deux services n'ont **aucun appelant**. Le danger
 * n'était donc pas qu'ils dorment, c'était le jour où quelqu'un chercherait
 * « est-ce qu'on met les comptes en cache ? », trouverait
 * `saveCachedAccountsList` et le brancherait — sans buster, puisqu'il n'en
 * portait pas, et sans qu'aucun test ne tombe.
 *
 * ⚠️ Cette garde mesure les écritures PRÉSENTES DANS LE CODE, pas celles qui
 * s'exécutent. C'est délibéré, et c'est exactement pour ce cas-là.
 *
 * D'où les deux moitiés : ce qui est écrit porte un buster, et ce qui n'est
 * jamais écrit est NOMMÉ, pour être retiré ou branché, jamais laissé dans cet
 * entre-deux.
 */

const WEB_SRC = join(__dirname, '..')
const CACHE_DIR = join(WEB_SRC, 'lib', 'cache', 'idb')

/**
 * Ce qui, dans une clé de cache, prouve qu'elle change avec le déploiement.
 * `__CODE_VERSION_ID__` est injecté par `define` de Vite ; `persistOptions`
 * l'accepte sous le nom `buster`, que TanStack compare au restore.
 */
const BUSTER_MARKERS = /__CODE_VERSION_ID__|BUILD_VERSION|versionedCacheKey|\bbuster\b/

/**
 * Magasins déclarés au schéma et actuellement jamais écrits.
 *
 * ⚠️ Cette liste ne peut que RÉTRÉCIR. Y ajouter une entrée demande de
 * répondre d'abord à « pourquoi déclarer un magasin que rien n'écrit ? ».
 */
const DECLARED_BUT_NEVER_WRITTEN = [
  'action_plans',
  'attack_angles',
  'contacts',
  'generated_assets',
  'pipeline_runs',
  'profiles',
  'rag_documents',
  'user_credits',
] as const

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

/** Retire les commentaires AVANT lecture — leçon GA-08 : sinon le docblock
 *  ci-dessus, qui cite `putCachedEntity('accounts'`, se dénoncerait lui-même. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les magasins déclarés au schéma, lus depuis le schéma lui-même. */
function declaredStores(): string[] {
  const schema = stripComments(readFileSync(join(CACHE_DIR, 'schema.ts'), 'utf8'))
  const block = schema.match(/CACHE_STORE_NAMES\s*=\s*\[([\s\S]*?)\]/)
  if (!block) return []
  return [...(block[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1] as string).sort()
}

type Write = { store: string; file: string; key: string }

/**
 * Les magasins écrits, avec le fichier ET la CLÉ passée.
 *
 * On capture la clé plutôt que de se contenter du fichier : un fichier peut
 * importer l'helper de version et l'oublier sur une des deux écritures. C'est
 * la clé qui décide, pas le voisinage.
 */
function writes(): Write[] {
  const found: Write[] = []
  for (const file of sourceFiles(WEB_SRC)) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const m of source.matchAll(/putCachedEntity(?:<[^>]*>)?\(\s*'([a-z_]+)'\s*,\s*([^,]+),/g)) {
      found.push({ store: m[1] as string, file, key: (m[2] ?? '').trim() })
    }
    // Le persister écrit en direct, sans passer par le dépôt d'entités : sa
    // clé arrive en TROISIÈME position (`put(store, valeur, clé)`).
    for (const m of source.matchAll(/db\.put\(\s*'([a-z_]+)'\s*,\s*[^,]+,\s*([^)]+)\)/g)) {
      found.push({ store: m[1] as string, file, key: (m[2] ?? '').trim() })
    }
  }
  return found
}

describe('GA-42 — un cache persisté meurt avec la version qui l’a écrit', () => {
  it('LIT quelque chose — le schéma déclare des magasins', () => {
    // Une garde qui ne lit rien est verte pour toujours. Six gardes borgnes en
    // deux jours ont établi que ce test-ci n'est pas facultatif.
    expect(declaredStores().length).toBeGreaterThan(5)
  })

  it('trouve les écritures réelles — le corpus n’est pas vide', () => {
    expect(writes().length).toBeGreaterThan(0)
  })

  it('chaque écriture voit sa CLÉ porter la version du build', () => {
    const offenders: string[] = []
    for (const { store, file, key } of writes()) {
      if (BUSTER_MARKERS.test(key)) continue
      // Une clé qui vient d'une fonction locale : on regarde cette fonction.
      const source = stripComments(readFileSync(file, 'utf8'))
      const helper = key.replace(/\(.*$/, '').trim()
      if (helper && new RegExp(`(function|const)\\s+${helper}\\b`).test(source)) {
        const body = source.slice(source.search(new RegExp(`(function|const)\\s+${helper}\\b`)))
        if (BUSTER_MARKERS.test(body.slice(0, 400))) continue
      }
      // Le persister TanStack est busté par `persistOptions.buster`, monté dans
      // `App.tsx` : la preuve n'est pas dans son fichier, mais chez son
      // appelant. On l'accepte à condition que l'appelant, lui, la porte.
      if (store === 'tanstack_query') {
        const app = stripComments(readFileSync(join(WEB_SRC, 'App.tsx'), 'utf8'))
        if (/buster:\s*__CODE_VERSION_ID__/.test(app)) continue
      }
      offenders.push(`${store} ← ${file.slice(file.indexOf('/src'))} (clé : ${key})`)
    }
    expect(offenders).toEqual([])
  })

  it('sait dire NON — une écriture sans buster est refusée', () => {
    // On ne peut pas casser le vrai code pour le prouver : on rejoue la règle
    // sur une source fabriquée. Sans cette preuve, la garde pourrait n'être
    // qu'un test qui passe.
    const sansBuster = `export const key = (id: string) => 'accounts:' + id`
    const avecBuster = `export const key = (id: string) => __CODE_VERSION_ID__ + ':' + id`
    expect(BUSTER_MARKERS.test(sansBuster)).toBe(false)
    expect(BUSTER_MARKERS.test(avecBuster)).toBe(true)
  })

  it('nomme les magasins déclarés que rien n’écrit — la liste ne peut que rétrécir', () => {
    const written = new Set(writes().map(w => w.store))
    const dormant = declaredStores().filter(s => !written.has(s))
    expect(dormant).toEqual([...DECLARED_BUT_NEVER_WRITTEN])
  })
})
