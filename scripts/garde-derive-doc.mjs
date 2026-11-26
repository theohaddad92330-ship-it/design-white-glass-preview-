#!/usr/bin/env node
// #4117 — Garde de dérive doc↔code.
//
// Chaque fiche `agent_docs/*.md` peut porter un frontmatter `sources:` : la liste
// des globs des fichiers de code qu'elle décrit. Sur une plage git, si un fichier
// couvert a bougé, la fiche doit avoir bougé AUSSI — sinon sortie 1.
//
// Idée inspirée de treg `drift.sh` ; réécrite, aucun code copié.
//
// Usage : node scripts/garde-derive-doc.mjs [BASE...HEAD] [--repo <dir>] [--docs <dir>]
//   plage par défaut : origin/main...HEAD
//
// CODES DE SORTIE — un zéro n'est une mesure qu'avec son code de sortie :
//   0  vérifié : au moins un fichier couvert a bougé, et chaque fiche concernée a suivi
//   1  DÉRIVE : fiche(s) non modifiée(s) alors que du code qu'elles décrivent a bougé
//   2  RIEN À COMPARER (plage vide, ou aucun fichier couvert) — PAS un vert
//   3  plage illisible (base introuvable, git en échec) — jamais un vert
//   4  frontmatter invalide ou glob qui ne désigne aucun fichier suivi
//
// Échappatoire tracée : une ligne `Doc-inchangée: <fiche> — <raison>` dans le
// message d'un commit de la plage (raison obligatoire).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SORTIE = { OK: 0, DERIVE: 1, RIEN: 2, PLAGE: 3, FICHE: 4 }

/** Glob → RegExp. `**` traverse les dossiers, `*` et `?` s'arrêtent au `/`. */
export function globVersRegex(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else re += '.*'
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** Extrait la liste `sources:` du frontmatter. `null` = pas de frontmatter `sources`. */
export function lireSources(contenu) {
  const lignes = contenu.replace(/\r\n/g, '\n').split('\n')
  if (lignes[0]?.trim() !== '---') return null
  const fin = lignes.indexOf('---', 1)
  if (fin === -1) return null
  const bloc = lignes.slice(1, fin)
  const debut = bloc.findIndex(l => /^sources:\s*$/.test(l))
  if (debut === -1) return null
  const sources = []
  for (const l of bloc.slice(debut + 1)) {
    const m = l.match(/^\s+-\s+(.+?)\s*$/)
    if (!m) break
    sources.push(m[1].replace(/^(['"])(.*)\1$/, '$2'))
  }
  return sources
}

/** `Doc-inchangée: <fiche> — <raison>` (tiret long, court ou double ; raison non vide). */
export function lireEchappees(messages) {
  const out = new Map()
  const re = /^Doc-inchangée:\s*(\S+)\s+(?:—|–|--|-)\s+(\S.*)$/gmu
  for (const m of messages.matchAll(re)) out.set(m[1], m[2].trim())
  return out
}

const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

export function garde({ repo, plage, dossierDocs = 'agent_docs' }) {
  const sortie = (code, lignes) => ({ code, lignes })

  // 1. Les fiches et leurs sources (état de HEAD de l'arbre de travail).
  let suivis
  try {
    suivis = git(repo, ['ls-files']).split('\n').filter(Boolean)
  } catch (e) {
    return sortie(SORTIE.PLAGE, [`git ls-files a échoué : ${e.message.split('\n')[0]}`])
  }
  const fiches = []
  const erreurs = []
  for (const f of suivis.filter(f => f.startsWith(`${dossierDocs}/`) && f.endsWith('.md'))) {
    let sources
    try {
      sources = lireSources(readFileSync(join(repo, f), 'utf8'))
    } catch {
      continue
    }
    if (sources === null) continue
    if (sources.length === 0) {
      erreurs.push(`${f} : \`sources:\` est vide`)
      continue
    }
    const positifs = sources.filter(s => !s.startsWith('!')).map(s => ({ s, re: globVersRegex(s) }))
    const negatifs = sources.filter(s => s.startsWith('!')).map(s => globVersRegex(s.slice(1)))
    if (positifs.length === 0) erreurs.push(`${f} : aucun glob positif`)
    for (const { s, re } of positifs) {
      if (!suivis.some(p => re.test(p) && !negatifs.some(n => n.test(p)))) {
        erreurs.push(`${f} : le glob « ${s} » ne désigne AUCUN fichier suivi`)
      }
    }
    fiches.push({ fiche: f, positifs: positifs.map(p => p.re), negatifs })
  }
  if (erreurs.length > 0) return sortie(SORTIE.FICHE, ['FRONTMATTER INVALIDE :', ...erreurs.map(e => `  ${e}`)])

  // 2. La plage.
  let modifies
  let messages
  try {
    modifies = git(repo, ['diff', '--name-only', plage]).split('\n').filter(Boolean)
    const [base, tete] = plage.split('...')
    messages = git(repo, ['log', '--format=%B', `${base}..${tete}`])
  } catch (e) {
    return sortie(SORTIE.PLAGE, [`plage illisible « ${plage} » : ${e.message.split('\n')[0]}`])
  }
  if (modifies.length === 0) {
    return sortie(SORTIE.RIEN, [`RIEN À COMPARER, pas un vert : la plage ${plage} ne modifie aucun fichier.`])
  }

  // 3. Fiche → fichiers couverts qui ont bougé.
  const echappees = lireEchappees(messages)
  const ensemble = new Set(modifies)
  const concernees = []
  for (const { fiche, positifs, negatifs } of fiches) {
    const bouges = modifies.filter(
      p => p !== fiche && positifs.some(re => re.test(p)) && !negatifs.some(n => n.test(p)),
    )
    if (bouges.length > 0) concernees.push({ fiche, bouges })
  }
  if (concernees.length === 0) {
    return sortie(SORTIE.RIEN, [
      `RIEN À COMPARER, pas un vert : ${modifies.length} fichier(s) modifié(s), aucun n'est couvert par un \`sources:\` (${fiches.length} fiche(s) sous garde).`,
    ])
  }

  const derive = []
  const lignes = []
  for (const { fiche, bouges } of concernees) {
    const raison = echappees.get(fiche) ?? echappees.get(fiche.split('/').pop())
    if (ensemble.has(fiche)) lignes.push(`  ok       ${fiche} (modifiée, ${bouges.length} fichier(s) couvert(s))`)
    else if (raison) lignes.push(`  ÉCHAPPÉE ${fiche} — Doc-inchangée : ${raison}`)
    else derive.push({ fiche, bouges })
  }
  if (derive.length > 0) {
    const out = ['DÉRIVE doc↔code — fiche → fichiers qui ont bougé :']
    for (const { fiche, bouges } of derive) {
      out.push(`  ${fiche}`)
      for (const b of bouges) out.push(`    - ${b}`)
    }
    out.push(
      '',
      'Mettre la fiche à jour dans cette PR, ou tracer le choix dans un message de commit :',
      '  Doc-inchangée: <fiche> — <raison>',
    )
    return sortie(SORTIE.DERIVE, [...out, ...lignes])
  }
  return sortie(SORTIE.OK, [`Doc↔code cohérents (${concernees.length} fiche(s) concernée(s)) :`, ...lignes])
}

function principal(argv) {
  let repo = process.cwd()
  let plage = 'origin/main...HEAD'
  let dossierDocs = 'agent_docs'
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') repo = argv[++i]
    else if (argv[i] === '--docs') dossierDocs = argv[++i]
    else plage = argv[i]
  }
  if (!plage.includes('...')) {
    console.error(`plage attendue au format BASE...HEAD, reçu « ${plage} »`)
    return SORTIE.PLAGE
  }
  const { code, lignes } = garde({ repo, plage, dossierDocs })
  for (const l of lignes) (code === SORTIE.OK || code === SORTIE.RIEN ? console.log : console.error)(l)
  return code
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(principal(process.argv.slice(2)))
