import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * GA — le statut d'une étape de test est celui de l'OUTIL, jamais celui d'un `tee`.
 *
 * CE QUI A ÉTÉ MESURÉ LE 29/10/2026 À 00 H 40
 * Le job `Test (API) (5)` du run 40780829979 conclut `success` en imprimant :
 *
 *   Test Suites: 2 failed, 441 passed, 443 total
 *   FAIL src/modules/accounts/accounts.service.spec.ts
 *   FAIL src/database/migrations.spec.ts
 *
 * Trois pièces, toutes nécessaires : l'étape pipait jest vers `tee` ; elle tourne sous
 * `bash -e {0}`, donc sans `pipefail`, et le code de retour d'un pipeline est celui de sa
 * DERNIÈRE commande — `tee`, qui réussit toujours ; enfin `garde-shard.sh`, qui ne compte
 * que des FICHIERS, était la dernière commande de l'étape et fixait son statut.
 *
 * Conséquence : sur les douze runs précédents, AUCUN `Test (API)` n'avait jamais conclu
 * `failure`. Un shard API rouge ne bloquait ni une PR, ni un push sur main, et le job
 * `Suite complète rouge sur main` (`if: failure()`) ne tirait jamais pour un échec d'API.
 * Treize suites et dix-neuf tests étaient rouges sur `7d39faafcb` — le commit servi en
 * production — sans qu'aucune porte ne l'ait dit. `Test (Web)` n'a pas de pipe : c'est la
 * seule raison pour laquelle ses shards rougissaient et jamais ceux de l'API.
 *
 * CE QUE LA GARDE EXIGE
 * Qu'une étape qui lance une SUITE à travers un pipe porte `pipefail` ou lise
 * `PIPESTATUS`. Elle ne dit pas COMMENT rendre le code : garder le statut dans une
 * variable puis le rendre après la garde de découpage est le chemin retenu dans `ci.yml`,
 * parce que `garde-shard.sh` doit tourner même sur un shard rouge.
 *
 * CE QU'ELLE NE VOIT PAS
 * Un listage (`jest --listTests`) n'exécute aucun test : son pipe reste libre, et son échec
 * est déjà traité en amont (`garde-shard.sh` avertit sur un total vide). Elle ne lit pas non
 * plus ce que le runner a fait : qu'un shard rouge fasse bien rougir le job se vérifie au
 * premier run qui échoue.
 */

const RACINE = resolve(__dirname, '../../../..')
const DOSSIER = join(RACINE, '.github/workflows')

/** Ce qui lance une SUITE de tests. `--listTests` ne lance rien : il est exclu plus bas. */
const LANCEUR = /(turbo (?:run )?test|npx jest|pnpm jest|npx vitest|pnpm vitest|pytest)\b/

/** Les deux seules façons de rendre le statut de l'outil à travers un pipe. */
const GARDE_DE_PIPE = /pipefail|PIPESTATUS/

type Etape = { fichier: string; nom: string; corps: string }

/** Les étapes nommées d'un workflow, en texte brut — l'idiome des autres gardes du dossier. */
function etapes(fichier: string, contenu: string): Etape[] {
  const lignes = contenu.split('\n')
  const trouvees: Etape[] = []
  let nom: string | null = null
  let debut = 0
  const pousser = (fin: number): void => {
    if (nom !== null) trouvees.push({ fichier, nom, corps: lignes.slice(debut, fin).join('\n') })
  }
  lignes.forEach((ligne, i) => {
    const titre = /^\s*-\s+name:\s*(.+?)\s*$/.exec(ligne)
    if (!titre) return
    pousser(i)
    nom = titre[1]
    debut = i
  })
  pousser(lignes.length)
  return trouvees
}

/** Une commande coupée par `\` reste UNE commande : c'est là que vivait le défaut. */
function commandes(corps: string): string[] {
  return corps
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map(ligne => ligne.trim())
    .filter(ligne => ligne.length > 0 && !ligne.startsWith('#'))
}

function lanceUneSuiteAuTravresDunPipe(commande: string): boolean {
  if (!LANCEUR.test(commande) || commande.includes('--listTests')) return false
  return commande.replace(/\|\|/g, ' ').includes('|')
}

/** Les étapes qui lancent une suite à travers un pipe SANS rendre le statut de l'outil. */
function pipesNonGardes(fichier: string, contenu: string): string[] {
  return etapes(fichier, contenu)
    .filter(etape => commandes(etape.corps).some(lanceUneSuiteAuTravresDunPipe))
    .filter(etape => !GARDE_DE_PIPE.test(etape.corps))
    .map(etape => `${etape.fichier} › ${etape.nom}`)
}

const WORKFLOWS = readdirSync(DOSSIER)
  .filter(nom => nom.endsWith('.yml') || nom.endsWith('.yaml'))
  .map(nom => ({ nom, contenu: readFileSync(join(DOSSIER, nom), 'utf8') }))

describe('GA — le statut d’une étape de test est celui de l’outil', () => {
  it('lit un corpus réel — les workflows du dépôt, et au moins une suite derrière un pipe', () => {
    expect(WORKFLOWS.length).toBeGreaterThanOrEqual(3)
    const ci = WORKFLOWS.find(workflow => workflow.nom === 'ci.yml')
    expect(ci).toBeDefined()
    expect(ci?.contenu.length).toBeGreaterThan(10_000)
    // Le détecteur doit avoir quelque chose à mâcher : sans cette assertion, un `[]` final
    // ne prouverait rien (c'est le piège d'une garde qui ne lit pas son corpus).
    const avecPipe = WORKFLOWS.flatMap(workflow =>
      etapes(workflow.nom, workflow.contenu).filter(etape =>
        commandes(etape.corps).some(lanceUneSuiteAuTravresDunPipe),
      ),
    )
    expect(avecPipe.length).toBeGreaterThanOrEqual(1)
  })

  it('aucune étape du dépôt ne laisse un `tee` décider du statut d’une suite', () => {
    expect(WORKFLOWS.flatMap(workflow => pipesNonGardes(workflow.nom, workflow.contenu))).toEqual([])
  })

  it('sait dire NON — l’étape telle qu’elle était avant le 29/10/2026 est refusée', () => {
    const avant = [
      '      - name: Jest (apps/api) — shard 5/6',
      '        run: |',
      '          pnpm turbo test --filter=@bellum/api --output-logs=full -- --passWithNoTests "${files[@]}" 2>&1 \\',
      '            | tee "$RUNNER_TEMP/api-jest.log"',
      '          bash .github/scripts/garde-shard.sh "$RUNNER_TEMP/api-jest.log" "$total" 6 "shard 5/6"',
    ].join('\n')
    expect(pipesNonGardes('ci.yml', avant)).toEqual(['ci.yml › Jest (apps/api) — shard 5/6'])
  })

  it('sait dire NON — pytest derrière un pipe compte aussi', () => {
    const avant = ['      - name: Test (IA / Python)', '        run: |', '          uv run pytest | tail -5'].join('\n')
    expect(pipesNonGardes('ci.yml', avant)).toEqual(['ci.yml › Test (IA / Python)'])
  })

  it('témoin — `pipefail` dans la même étape suffit, et `PIPESTATUS` aussi', () => {
    const avec = [
      '      - name: Jest (apps/api)',
      '        run: |',
      '          set -o pipefail',
      '          pnpm turbo test --filter=@bellum/api 2>&1 | tee "$RUNNER_TEMP/api-jest.log"',
    ].join('\n')
    expect(pipesNonGardes('ci.yml', avec)).toEqual([])
    expect(pipesNonGardes('ci.yml', avec.replace('set -o pipefail', 'echo lu ${PIPESTATUS[0]}'))).toEqual([])
  })

  it('témoin — elle n’attrape pas ce qu’elle ne vise pas : un `||`, un listage, un commentaire', () => {
    const ou = ['      - name: Suite tolérée', '        run: |', '          pnpm turbo test || echo "rouge"'].join('\n')
    expect(pipesNonGardes('ci.yml', ou)).toEqual([])

    const listage = [
      '      - name: Compter la suite',
      '        run: |',
      '          total=$( ( cd apps/api && npx jest --listTests ) | grep -c . || true )',
    ].join('\n')
    expect(pipesNonGardes('ci.yml', listage)).toEqual([])

    const commentaire = [
      '      - name: Rien que du texte',
      '        run: |',
      '          # pnpm turbo test | tee journal.log  ← ce que l’on ne fait PLUS',
      '          echo ok',
    ].join('\n')
    expect(pipesNonGardes('ci.yml', commentaire)).toEqual([])
  })
})
