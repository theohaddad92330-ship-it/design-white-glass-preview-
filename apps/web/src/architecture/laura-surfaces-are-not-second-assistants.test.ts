import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-238 — UNE DEUXIÈME SURFACE DE LAURA N'EST PAS UNE DEUXIÈME LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI GA-39 NE SUFFISAIT PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-39 interdit d'appeler `/laura/*` ailleurs que dans la porte. C'est la
 * bonne règle, et elle tenait tant que Laura n'avait qu'une surface : une carte
 * en bas à droite, qui affiche une phrase et deux boutons.
 *
 * Le panneau contextuel d'un dossier de compte change la nature du risque. Il
 * porte une zone de SAISIE — « Pose ta question… » — et c'est exactement la
 * forme sous laquelle un second moteur de conversation entre dans un produit :
 * on ajoute un champ, puis un état de messages, puis un appel qui poste, et
 * personne n'a jamais décidé qu'il y aurait deux copilotes. GA-39 resterait
 * VERTE tout du long, parce qu'un second chat n'appelle pas `/laura/`.
 *
 * D44 a tranché : Laura est une SURCOUCHE, pas un second moteur — « deux
 * moteurs de conversation dans le même produit, c'est deux fois la dette et
 * deux vérités possibles ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES, ET CE QUE CHACUNE REFUSE EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * **Règle 1 — une surface de Laura ne parle à AUCUNE autre route.** Le seul
 * fichier de `features/laura/` autorisé à appeler l'API est la porte. Une
 * surface qui appellerait `/chat/...`, `/actions/...` ou n'importe quoi d'autre
 * se serait donné un chemin de données à elle, donc une seconde vérité.
 *
 * **Règle 2 — aucune surface n'ENVOIE.** Le copilote prépare, le commercial
 * envoie : ce n'est pas une convention, c'est l'absence de code. Un verbe
 * d'envoi dans un chemin d'API appelé depuis une surface de Laura serait la
 * première ligne de ce chemin.
 *
 * ⚠️ Ce que cette garde ne dit PAS : que le panneau soit juste. Elle dit qu'il
 * n'a pas de moyen de devenir un second assistant. « Retirer le MOYEN, pas
 * seulement la permission. »
 */

const LAURA = join(__dirname, '..', 'features', 'laura')

/** Le seul fichier de la famille autorisé à parler à l'API. */
const THE_DOOR = 'useLaura.ts'

/**
 * Les chemins d'API écrits en littéral, hors commentaires.
 *
 * ⚠️ Les commentaires sont retirés AVANT lecture, et ce n'est pas de la
 * précaution : le docblock de `LauraAccountPanel` cite `/chat` en toutes
 * lettres pour EXPLIQUER qu'il ne l'appelle pas. Sans ce nettoyage, la garde
 * se ferait rougir par sa propre justification — c'est la leçon de GA-08.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les appels à `apiFetch`, avec le chemin littéral qu'ils portent.
 *
 * On lit l'APPEL et non n'importe quelle chaîne qui commence par `/` : une
 * classe Tailwind, une route de navigation (`navigate({ to: '/chat' })`) et un
 * appel d'API se ressemblent trop pour qu'un motif large distingue les trois.
 * Ce qui est interdit ici, c'est de PARLER à une route — pas d'en OUVRIR une,
 * qui est précisément ce que le panneau fait pour passer la main au copilote.
 */
function apiPathsIn(source: string): string[] {
  const clean = stripComments(source)
  const out: string[] = []
  for (const match of clean.matchAll(/apiFetch\s*(?:<[^>]*>)?\s*\(\s*\{[^}]*?path:\s*[`'"]([^`'"]+)/g)) {
    if (match[1]) out.push(match[1])
  }
  return out
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

/** Un verbe d'ENVOI dans un chemin d'API. Volontairement large. */
const SENDS = /send|deliver|dispatch|outbox|publish/i

const FILES = sourceFiles(LAURA)

describe('GA-238 — les surfaces de Laura, et ce qu’elles ne peuvent pas devenir', () => {
  it('lit un corpus NON VIDE — plusieurs surfaces, et la porte parmi elles', () => {
    // Sans cette assertion, un dossier renommé rendrait les deux règles vertes
    // pour toujours : zéro fichier ne viole jamais rien.
    expect(FILES.length).toBeGreaterThanOrEqual(4)
    expect(FILES.some(file => file.endsWith(THE_DOOR))).toBe(true)
    // Au moins DEUX surfaces rendues : la carte de coin et le panneau du
    // dossier. C'est le jour où la deuxième arrive que cette garde a un sens.
    expect(FILES.filter(file => file.endsWith('.tsx')).length).toBeGreaterThanOrEqual(2)
  })

  it('la garde LIT vraiment les appels — la porte en porte deux, et elle les trouve', () => {
    // La preuve qu'elle ne passe pas au vert sur un extracteur cassé : si
    // `apiPathsIn` ne trouvait plus rien nulle part, les deux règles ci-dessous
    // seraient vertes sans rien avoir regardé.
    const door = FILES.find(file => file.endsWith(THE_DOOR)) as string
    const paths = apiPathsIn(readFileSync(door, 'utf8'))
    expect(paths).toContain('/laura/plan')
    expect(paths.length).toBeGreaterThanOrEqual(2)
  })

  it('règle 1 — aucune surface n’appelle l’API : la porte est la seule à parler', () => {
    const offenders = FILES.filter(file => !file.endsWith(THE_DOOR))
      .flatMap(file =>
        apiPathsIn(readFileSync(file, 'utf8')).map(path => `${file.slice(file.indexOf('src/'))} → ${path}`),
      )
      .sort()
    expect(offenders).toEqual([])
  })

  it('règle 2 — aucune surface n’ENVOIE : le copilote prépare, le commercial envoie', () => {
    const offenders = FILES.flatMap(file =>
      apiPathsIn(readFileSync(file, 'utf8'))
        .filter(path => SENDS.test(path))
        .map(path => `${file.slice(file.indexOf('src/'))} → ${path}`),
    ).sort()
    expect(offenders).toEqual([])
  })

  it('les deux règles savent dire NON — cassées volontairement sur la MÊME fonction', () => {
    // Règle 1 : une surface qui se donnerait son propre fil de conversation.
    const secondChat = `const send = () => apiFetch({ path: '/chat/messages', method: 'POST' })`
    expect(apiPathsIn(secondChat)).toEqual(['/chat/messages'])

    // Règle 2 : un chemin d'envoi, quel que soit le module.
    const sender = `apiFetch({ path: '/accounts/1/emails/send', method: 'POST' })`
    expect(apiPathsIn(sender).filter(path => SENDS.test(path))).toEqual(['/accounts/1/emails/send'])

    // Et le nettoyage des commentaires ne doit PAS avaler un vrai appel qui les
    // suit — le défaut de l'extracteur coupé à la flèche de `onClick`.
    const afterComment = `// on n'appelle pas /chat/messages\napiFetch({ path: '/laura/plan' })`
    expect(apiPathsIn(afterComment)).toEqual(['/laura/plan'])
  })
})
