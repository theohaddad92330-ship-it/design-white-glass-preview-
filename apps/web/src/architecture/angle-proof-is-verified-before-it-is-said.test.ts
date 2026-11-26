import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-75 — UNE PREUVE D'ANGLE EST VÉRIFIÉE AVANT D'ÊTRE DITE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tome 5 §32.2 écrit la structure d'un angle — `preuve + transposition +
 * engagement` — et tranche le cas où la preuve manque :
 *
 *   « Si aucune preuve n'est disponible pour l'univers, le produit ne génère pas
 *     de phrase. »
 *
 * La règle existait donc sur le papier depuis le début, et RIEN ne pouvait la
 * tenir, pour une raison très simple : **la preuve n'avait pas de nom.** Le
 * prompt demandait « PROMESSE + PREUVE + ACTION » dans un unique champ libre
 * (`strategy`), en prose. Conséquence, en trois endroits :
 *
 *   · `attackAngleSchema` n'avait pas de champ `proof` ;
 *   · `score_angles` — le barème /100 — annonçait dans sa propre docstring qu'il
 *     mesurait les trois tiers, et en mesurait deux ;
 *   · `first-move-input.ts` écrivait `proof: null` EN DUR, si bien que le bloc
 *     « Ce qu'on peut prouver » du brief affichait « aucune preuve mobilisable »
 *     sur TOUS les comptes — y compris ceux qui en avaient une.
 *
 * C'est le motif « une garde protège une règle, elle ne l'invente pas » :
 * personne ne peut garder ce qui n'a pas de nom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES
 * ─────────────────────────────────────────────────────────────────────────────
 * **A. Le vocabulaire des verdicts est le MÊME des deux côtés de la frontière.**
 * `angle_proof_gate.py` écrit `proof_status`, `strategy.ts` le lit. Un
 * vocabulaire recopié dans deux langages dérive — le dépôt le paie assez
 * souvent pour que les deux listes soient confrontées SUR LE DISQUE, pas de
 * mémoire.
 *
 * **B. Le gate est APPELÉ.** C'est le défaut n°1 de ce dépôt : du code juste,
 * calculé, testé, que personne n'appelle. Un gate parfait qui ne tourne pas
 * laisse passer exactement ce qu'il interdit, et aucun test unitaire ne le voit.
 * La garde exige donc l'appel dans le pipeline, APRÈS le classement — c'est la
 * valeur finale, celle qui part à l'écran, qui doit être vérifiée.
 *
 * **C. Aucun écran ne relaie `proof` à la main.** Un fichier web qui lit la
 * preuve d'un angle passe par `displayableAngleProof` / `angleProofState`. Lire
 * `record['proof']` directement rendrait la phrase que le service vient
 * précisément d'effacer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE COUVRE PAS, ET POURQUOI C'EST ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne juge pas si une preuve est VRAIE — seulement si l'ESN l'a déclarée.
 * Une référence déclarée à tort reste une référence déclarée ; c'est une
 * question de saisie, pas de rédaction, et aucun code ne peut la trancher.
 */

const WEB_SRC = join(__dirname, '..')
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const GATE_PY = join(REPO_ROOT, 'apps/ia/app/services/angle_proof_gate.py')
const PIPELINE_PY = join(REPO_ROOT, 'apps/ia/app/routers/phase1_research.py')
const CONTRACT_TS = join(REPO_ROOT, 'packages/contracts/src/schemas/analysis/strategy.ts')

/** Les helpers du contrat — la seule porte par laquelle une preuve s'affiche. */
const HELPERS = ['displayableAngleProof', 'angleProofState']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const WEB_FILES = walk(WEB_SRC)

/**
 * Ce qui identifie un lecteur d'angle BRUT, et rien d'autre.
 *
 * La règle porte sur la lecture du JSONB, pas sur l'affichage. Un composant qui
 * reçoit le modèle de vue `AttackAngle` consomme une preuve DÉJÀ passée par le
 * contrat dans `planViewData` : lui redemander le helper le ferait tourner deux
 * fois, et la deuxième fois sur une valeur déjà nettoyée. Les clés brutes
 * ci-dessous sont donc la frontière exacte : elles ne se lisent que là où la
 * donnée entre.
 *
 * ⚠️ Deux versions de ce filtre ont été fausses avant celle-ci, dans les deux
 * sens. La première cherchait « angle » n'importe où et attrapait cinq écrans
 * étrangers — matching, CV de consultant, décomposition d'un score de contact —
 * où `proof` désigne la preuve d'un AXE, un autre objet. La seconde ajoutait le
 * TYPE `AttackAngle` et attrapait le composant d'affichage, qui a raison de ne
 * pas appeler le helper. Une garde trop large est aussi fausse qu'une garde
 * borgne : elle force à écrire des exceptions, et une exception se recopie.
 */
const ANGLE_MARKERS = /attack_angles|user_attack_angles|\['angles'\]/

/**
 * Le corps du fichier SANS ses commentaires.
 *
 * ⚠️ Troisième correction de ce filtre, et la plus instructive : sans elle,
 * `AttackAnglesSection.tsx` entrait dans le corpus à cause d'une PHRASE —
 * « planViewData lit user_attack_angles d'abord » — écrite dans un commentaire.
 * Le composant n'a jamais lu la moindre clé brute. Une garde qui lit les
 * commentaires mesure la prose, pas le code ; le dépôt a déjà payé ce défaut sur
 * « des listes découpées sans retirer les commentaires ».
 */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Les fichiers web qui LISENT la preuve d'un angle. */
const PROOF_READERS = WEB_FILES.filter(file => {
  if (/\.(test|spec)\.tsx?$/.test(file)) return false
  const body = code(readFileSync(file, 'utf8'))
  if (!ANGLE_MARKERS.test(body)) return false
  return /\bproof\b/.test(body)
})

describe('GA-75 · A — le vocabulaire des verdicts ne dérive pas entre Python et TypeScript', () => {
  it('les trois verdicts sont identiques des deux côtés', () => {
    const py = readFileSync(GATE_PY, 'utf8')
    const ts = readFileSync(CONTRACT_TS, 'utf8')

    const pythonVerdicts = [...py.matchAll(/^PROOF_[A-Z_]+ = "([a-z_]+)"$/gm)].map(m => m[1]).sort()
    const enumMatch = /export const ANGLE_PROOF_STATUSES = \[([^\]]+)\]/.exec(ts)
    expect(enumMatch, 'ANGLE_PROOF_STATUSES introuvable dans le contrat').not.toBeNull()
    const tsVerdicts = [...(enumMatch?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()

    // La garde LIT quelque chose : trois valeurs, pas zéro.
    expect(pythonVerdicts).toHaveLength(3)
    expect(tsVerdicts).toHaveLength(3)
    expect(pythonVerdicts).toEqual(tsVerdicts)
  })
})

describe('GA-75 · B — le gate est appelé, pas seulement écrit', () => {
  const pipeline = readFileSync(PIPELINE_PY, 'utf8')

  it('le pipeline importe le gate', () => {
    expect(pipeline).toMatch(/from app\.services\.angle_proof_gate import[^\n]*apply_proof_gate/)
  })

  it('le pipeline APPELLE le gate, et lui passe le profil', () => {
    const call = /apply_proof_gate\(\s*result\["angles"\],\s*profile\s*\)/.exec(pipeline)
    expect(call, 'apply_proof_gate n’est pas appelé avec (angles, profile)').not.toBeNull()
  })

  it('le gate tourne APRÈS le classement — c’est la valeur finale qui part à l’écran', () => {
    const rank = pipeline.indexOf('rank_angles(result["angles"]')
    const gate = pipeline.indexOf('apply_proof_gate(result["angles"]')
    expect(rank).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(rank)
  })
})

describe('GA-75 · C — aucun écran ne relaie une preuve à la main', () => {
  it('la garde LIT un corpus, et il n’est pas vide', () => {
    expect(WEB_FILES.length).toBeGreaterThan(500)
    // Les deux lecteurs connus au jour de la garde. Si l'un disparaît, c'est
    // que la preuve a changé de chemin — et la garde doit le dire.
    const names = PROOF_READERS.map(file => file.replace(WEB_SRC, ''))
    expect(names.some(n => n.endsWith('planViewData.ts'))).toBe(true)
    expect(names.some(n => n.endsWith('first-move-input.ts'))).toBe(true)
  })

  it('chaque lecteur de preuve passe par le contrat', () => {
    const offenders = PROOF_READERS.filter(file => {
      // `code()` ici aussi : un helper NOMMÉ dans un commentaire — « on devrait
      // passer par displayableAngleProof » — laisserait passer le fichier qui,
      // précisément, ne le fait pas encore.
      const body = code(readFileSync(file, 'utf8'))
      return !HELPERS.some(helper => body.includes(helper))
    }).map(file => file.replace(WEB_SRC, ''))

    expect(
      offenders,
      `Ces fichiers lisent la preuve d'un angle sans passer par ${HELPERS.join(' / ')} : ` +
        `ils rendraient la phrase que le service vient d'effacer.\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
