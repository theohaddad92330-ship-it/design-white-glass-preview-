import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * GA — un plafond de cliquet se lit sur UN NOMBRE, jamais sur tous les chiffres du fichier.
 *
 * CE QUI A ÉTÉ MESURÉ LE 29/10/2026
 * Le job `dette-formatage` lisait son plafond ainsi :
 *
 *   PLAFOND=$(tr -cd '0-9' < .github/prettier-dette.txt)
 *
 * `tr -cd '0-9'` retire tout ce qui n'est pas un chiffre du fichier ENTIER, commentaires compris. Or ce
 * fichier porte sa raison écrite — « mesuré le 28/10/2026 (run 40762976633, PR #4638) : 193 — apps/api 52,
 * apps/web 47, docs/maquettes 30 … ». Le plafond réellement calculé était donc la CONCATÉNATION de tous ces
 * chiffres : 1932810202640762976633463819352473030141281362914144772, cinquante-cinq chiffres.
 * `[ "$COMPTE" -gt "$PLAFOND" ]` ne pouvait jamais être vrai. Le cliquet était décoratif depuis sa naissance.
 *
 * C'est la même famille que le `tee` sans `pipefail` du job `Test (API)` : une porte qui tourne, qui écrit
 * une ligne verte, et qui n'a jamais pu dire non. La contourner en retirant les chiffres des commentaires
 * (plafond lu = 0) marche un jour et rouvre le trou en silence à la première date écrite dans le fichier —
 * or ce fichier existe précisément pour qu'on y écrive la raison du chiffre.
 *
 * CE QUE LA GARDE NE VOIT PAS
 * Elle vérifie la LECTURE du plafond, pas sa valeur : qu'un plancher soit juste se mesure en lançant
 * `prettier --check .`, et c'est le travail du job.
 */

const RACINE = resolve(__dirname, '../../../..')
const WORKFLOW = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8')
const DETTE = join(RACINE, '.github/prettier-dette.txt')

/** Le plafond qu'une ligne de shell lit dans un fichier donné — le shell réel, pas une imitation. */
function plafondLuPar(commande: string, contenu: string): string {
  const dossier = mkdtempSync(join(tmpdir(), 'plafond-cliquet-'))
  const fichier = join(dossier, 'dette.txt')
  writeFileSync(fichier, contenu)
  return execFileSync('bash', ['-c', commande.replace('.github/prettier-dette.txt', fichier)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

const JUSTE = "grep -m1 -oE '^[0-9]+' .github/prettier-dette.txt"
const FAUX = "tr -cd '0-9' < .github/prettier-dette.txt"

/** Le fichier tel qu'il est fait pour être écrit : un nombre, puis la raison du nombre. */
const AVEC_SA_RAISON = [
  '0',
  '',
  '# Le nombre de fichiers que `prettier --check .` signale encore, depuis la racine.',
  '# Mesuré le 29/10/2026 (run 40762976633, PR #4638) : 193 — apps/api 52, apps/web 47.',
  '',
].join('\n')

describe('GA — un plafond de cliquet se lit sur un nombre', () => {
  it('lit un corpus réel — le job existe et son fichier de plafond commence par un nombre nu', () => {
    expect(WORKFLOW.length).toBeGreaterThan(10_000)
    expect(WORKFLOW).toContain('Compter les fichiers non formatés')
    const premiere = readFileSync(DETTE, 'utf8').split('\n')[0].trim()
    expect(premiere).toMatch(/^[0-9]+$/)
  })

  it('ci.yml lit son plafond par la forme bornée, et plus par `tr -cd` sur le fichier entier', () => {
    expect(WORKFLOW).toContain(JUSTE)
    expect(WORKFLOW).not.toContain(FAUX)
  })

  it('sait dire NON — la forme d’avant rendait la concaténation de tous les chiffres', () => {
    // Le contrôle POSITIF : la garde connaît le défaut qu'elle interdit, donc son « non » veut dire quelque chose.
    // La concaténation MESURÉE, pas devinée : `0` + la date + le numéro de run + le numéro de PR + les
    // chiffres de la raison, dans l'ordre du fichier. Vingt-neuf chiffres pour un plafond de zéro.
    expect(plafondLuPar(FAUX, AVEC_SA_RAISON)).toBe('0291020264076297663346381935247')
    expect(plafondLuPar(JUSTE, AVEC_SA_RAISON)).toBe('0')
  })

  it('témoin — la forme juste ignore la raison écrite, quel que soit le nombre en tête', () => {
    expect(plafondLuPar(JUSTE, AVEC_SA_RAISON.replace(/^0/, '193'))).toBe('193')
    // Un commentaire AVANT le nombre ne trompe pas la lecture : seule une ligne qui COMMENCE par un chiffre compte.
    expect(plafondLuPar(JUSTE, `# issue #4772\n42\n`)).toBe('42')
  })

  it('sait dire NON — un fichier sans nombre rend du vide, et le job refuse alors de tourner', () => {
    // `grep` sort 1 sans correspondance : la substitution rend une chaîne vide, que l'étape teste par `-z`.
    expect(plafondLuPar(`${JUSTE} || true`, '# aucun chiffre ici\n')).toBe('')
    expect(WORKFLOW).toContain('ne contient aucun nombre')
  })
})
