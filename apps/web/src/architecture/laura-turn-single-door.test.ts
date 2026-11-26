import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-237 — un TOUR de Laura part d'un seul fichier, et la bulle n'ouvre pas un
 * second compteur d'interruption.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI ELLE ARRIVE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-39 tient déjà la porte des interventions PROACTIVES : un seul fichier
 * (`useLaura.ts`) a le droit d'appeler `/laura/*`. Le tome 7 §48 appelle
 * « risque technique n°1 du programme » le cas où chaque surface aurait sa
 * propre logique.
 *
 * Cette garde-là ne couvrait RIEN du côté conversationnel, et pour une raison
 * simple : il n'y avait qu'une seule surface de conversation, l'écran `/chat`,
 * qui écrivait le corps de `POST /ia/chat` au milieu de ses 1 432 lignes. La
 * bulle flottante en est une **deuxième**. C'est exactement le moment où le
 * défaut se produit — pas trois mois plus tard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES, ET CE QUE CHACUNE EMPÊCHE VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Un seul fichier écrit le chemin `'/ia/chat'`.** Il porte avec lui le
 *    plafond quotidien (`assertChatQuota` s'exécute à l'entrée du contrôleur),
 *    le budget du tour et la trace Langfuse. Une seconde surface qui écrirait
 *    son propre `apiFetch` obtiendrait la même chose aujourd'hui — et perdrait
 *    le premier champ ajouté demain.
 * 2. **`useLaura` n'est appelé que par UN composant de production.** C'est la
 *    règle qui compte le plus, et c'est la moins évidente : le hook envoie UNE
 *    demande par couple (surface, écran). Deux composants qui l'appelleraient
 *    consommeraient DEUX interventions du plafond du jour sur le même écran —
 *    la règle « une intervention par écran » du §5.3 tient côté serveur sur
 *    `state.screensServed`, mais le premier appel l'aurait déjà brûlée. Le
 *    budget d'interruption ne se contourne donc pas par accident : il se
 *    contourne en ajoutant un appelant.
 * 3. **La bulle ne s'ouvre jamais toute seule.** Un `setOpen(true)` posé dans un
 *    effet ferait de la porte un interrupteur — et « Laura se tait quand tu
 *    travailles » est un comportement LIVRÉ (`interruption-budget.ts`,
 *    `MIN_GAP_MINUTES`, `adaptiveCapFor`), qu'une bulle qui s'ouvre seule
 *    défait sans passer par le serveur.
 *
 * ⚠️ Cette garde ne peut pas empêcher quelqu'un d'écrire sa propre logique de
 * conversation. Elle empêche les trois seules choses qui la rendent possible :
 * appeler l'endpoint ailleurs, demander une intervention ailleurs, et
 * s'ouvrir sans geste.
 */

const WEB_SRC = join(__dirname, '..')

/** Le seul fichier autorisé à parler à `POST /ia/chat`. */
const THE_TURN_DOOR = 'features/chat/api/laura-turn.ts'
/**
 * Les composants de production autorisés à demander une intervention — une
 * liste CLOSE et NOMMÉE, pas un nombre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX, ET POURQUOI CE N'EST PAS UN ASSOUPLISSEMENT (01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette garde a d'abord été écrite avec UN seul nom, à un moment où la carte
 * était la seule surface. Le panneau contextuel d'un dossier de compte en est
 * une seconde, et la fusion des deux lots a fait rougir la règle.
 *
 * La question posée était la bonne : *deux appelants sur le même écran ne
 * brûlent-ils pas deux fois le budget du jour ?* Sur `/accounts/<identifiant>`,
 * la carte est montée globalement (`routes/__root.tsx`) et le panneau vit dans
 * l'onglet Aperçu : les deux demandent bien leur plan sur le MÊME chemin.
 *
 * La réponse a été VÉRIFIÉE dans le code du serveur, pas supposée :
 *
 *  1. `laura-interventions.ts` ne porte qu'UNE intervention visant
 *     `ACCOUNT_CONTEXT_SCREEN` (`/accounts/:id`), et elle exige le dossier.
 *  2. Seul le panneau connaît ce dossier, donc seul lui l'envoie. La carte
 *     n'a aucune candidate.
 *  3. `laura.service.ts` rend alors `{ speaks: false, reason: 'nothing_to_say' }`
 *     **avant** `this.interventions.save(...)` et **avant** `persistState` :
 *     aucune trace écrite, l'écran n'entre pas dans `screensServed`, et le
 *     plafond du jour reste intact.
 *
 * Ce qui est refusé reste donc exactement ce qui l'était : un TROISIÈME
 * appelant, ou un second qui ne serait pas ce panneau-là. Ajouter un nom ici
 * demande de refaire les trois mesures ci-dessus pour l'écran concerné.
 */
const THE_INTERVENTION_CALLERS = ['features/laura/LauraCard.tsx', 'features/laura/LauraAccountPanel.tsx'] as const
/** Celui dont les détecteurs prouvent qu'ils voient un vrai fichier. */
const THE_INTERVENTION_CALLER = THE_INTERVENTION_CALLERS[0]
/** La bulle : sa coque et son panneau. */
const DOCK = 'features/laura/bubble/LauraDock.tsx'

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

/**
 * Retire les commentaires AVANT lecture — leçon GA-08.
 *
 * Sans cela, le docblock de `laura-turn.ts` (qui cite `'/ia/chat'` pour
 * expliquer la règle) et celui de ce fichier-ci se dénonceraient eux-mêmes.
 */
/** Un effet qui ouvre le panneau sans relayer le geste « Demander à Laura » (seule dépendance : `openRequest`). */
function opensWithoutGesture(block: string): boolean {
  if (!/set(Open|Panel\w*)\(\s*true\s*\)/.test(block)) return false
  return !/,\s*\[\s*openRequest\s*\]\s*\)$/.test(block)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Le chemin du TOUR, et lui seul.
 *
 * ⚠️ Le motif exige le guillemet FERMANT : `'/ia/chat/messages'`,
 * `'/ia/chat/history'` et `'/ia/chat/commands'` sont la persistance, l'historique
 * et le catalogue de commandes — trois choses légitimes qui n'appellent pas le
 * modèle et ne consomment aucun plafond. Les confondre avec le tour rendrait la
 * garde insupportable, et une garde insupportable finit désactivée.
 */
function callsTheTurn(source: string): boolean {
  return /(['"`])\/ia\/chat\1/.test(stripComments(source))
}

/** Les appelants de `useLaura(` — la demande d'intervention. */
function asksForAnIntervention(source: string): boolean {
  return /\buseLaura\s*\(/.test(stripComments(source))
}

/**
 * Un appelant de `useLaura` DANS UN CORPUS DONNÉ.
 *
 * Le lecteur est un paramètre pour que le test « sait dire NON » exécute
 * exactement la même fonction sur un corpus fabriqué : une garde dont la preuve
 * du rouge n'emprunte pas le chemin du vert ne prouve rien.
 */
function interventionCallers(files: readonly string[], read: (file: string) => string): string[] {
  return files
    .filter(file => asksForAnIntervention(read(file)))
    .map(file => file.slice(file.indexOf('src/')))
    .sort()
}

const FILES = sourceFiles(WEB_SRC)
const relative = (file: string) => file.slice(file.indexOf('src/'))

describe('GA-237 — la garde LIT quelque chose', () => {
  it('balaie tout `apps/web/src` et y trouve les trois fichiers du lot', () => {
    expect(FILES.length).toBeGreaterThan(200)
    for (const path of [THE_TURN_DOOR, THE_INTERVENTION_CALLER, DOCK]) {
      const found = FILES.find(file => file.endsWith(path))
      expect(found, path).toBeDefined()
      expect(readFileSync(found as string, 'utf8').length).toBeGreaterThan(200)
    }
  })

  it('les deux détecteurs voient les vrais fichiers — sinon ils seraient verts pour toujours', () => {
    const door = FILES.find(file => file.endsWith(THE_TURN_DOOR)) as string
    const card = FILES.find(file => file.endsWith(THE_INTERVENTION_CALLER)) as string
    expect(callsTheTurn(readFileSync(door, 'utf8'))).toBe(true)
    expect(asksForAnIntervention(readFileSync(card, 'utf8'))).toBe(true)
  })
})

describe('GA-237 — règle 1 : un seul fichier envoie un tour', () => {
  it('aucun écran n’appelle `/ia/chat` directement', () => {
    const offenders = FILES.filter(file => !file.endsWith(THE_TURN_DOOR))
      .filter(file => callsTheTurn(readFileSync(file, 'utf8')))
      .map(relative)
    expect(offenders.sort()).toEqual([])
  })

  it('la garde sait dire NON — un second appelant est refusé', () => {
    const elsewhere = "const data = await apiFetch({ path: '/ia/chat', method: 'POST' })"
    expect(callsTheTurn(elsewhere)).toBe(true)
  })

  it('elle ne confond pas la PERSISTANCE avec le tour — sinon elle serait insupportable', () => {
    // Ces trois-là n'appellent aucun modèle et ne consomment aucun plafond.
    expect(callsTheTurn("apiFetch({ path: '/ia/chat/messages' })")).toBe(false)
    expect(callsTheTurn("apiFetch({ path: '/ia/chat/history?archived=true' })")).toBe(false)
    expect(callsTheTurn("apiFetch({ path: '/ia/chat/commands' })")).toBe(false)
  })
})

describe('GA-237 — règle 2 : une seule demande d’intervention, donc un seul budget', () => {
  it('`useLaura` n’est appelé que par les surfaces NOMMÉES — la bulle ne le rappelle pas', () => {
    const callers = interventionCallers(
      FILES.filter(file => !file.endsWith('features/laura/useLaura.ts')),
      file => readFileSync(file, 'utf8'),
    )
    expect(callers).toEqual(THE_INTERVENTION_CALLERS.map(caller => `src/${caller}`).sort())
  })

  it('la garde sait dire NON — un second appelant est refusé, par LA MÊME fonction', () => {
    const card = join(WEB_SRC, THE_INTERVENTION_CALLER)
    const bubble = join(WEB_SRC, 'features', 'laura', 'bubble', 'Ailleurs.tsx')
    const fake = () => "const { intervention } = useLaura('bubble')\n"
    expect(interventionCallers([card, bubble], fake)).toEqual([relative(card), relative(bubble)].sort())
  })

  it('un commentaire qui PARLE du hook ne compte pas — la garde n’accuse pas la prose', () => {
    const documented = '/** Ne rappelle pas useLaura( ici. */\nexport function X() { return null }\n'
    expect(asksForAnIntervention(documented)).toBe(false)
  })
})

describe('GA-237 — règle 3 : la bulle ne s’ouvre jamais toute seule', () => {
  const dock = () => stripComments(readFileSync(join(WEB_SRC, DOCK), 'utf8'))

  it('aucun effet de la coque n’ouvre le panneau', () => {
    // Un `setOpen(true)` dans un `useEffect` ferait de la porte un
    // interrupteur, et défairait « Laura se tait quand tu travailles » sans
    // jamais passer par le serveur qui en tient le budget.
    const source = dock()
    const insideEffects = source.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g) ?? []
    const opening = insideEffects.filter(block => opensWithoutGesture(block))
    expect(opening).toEqual([])
  })

  // #4309.1 (lot LAURA, 19/10/2026) — « Demander à Laura » ouvre la bulle SUR PLACE : la coque relaie
  // un GESTE (`requestLauraOpen`, appelé par un clic), elle ne s'ouvre pas toute seule. La seule porte
  // tolérée est un effet qui ne dépend QUE de `openRequest` ; ce canal n'a qu'un appelant, lié à `onClick`.
  // F1-FIX #4345 (intégration PR n°2) — `useOpenLauraInPlace` est LA porte unique : `requestLauraOpen` n’a qu’un appelant,
  // ce hook ; AskLaura le consomme et le lie à `onClick` (un geste, jamais un effet).
  it('la seule ouverture tolérée relaie un clic : `requestLauraOpen` n’a qu’un appelant, le hook de la porte, lié par AskLaura à `onClick`', () => {
    const callers = FILES.filter(file => /\brequestLauraOpen\(/.test(stripComments(readFileSync(file, 'utf8'))))
      .map(file => file.slice(WEB_SRC.length + 1))
      .filter(file => !file.endsWith('laura-intro-store.ts') && !/\.test\.tsx?$/.test(file))
    expect(callers).toEqual(['features/laura/bubble/use-open-laura-in-place.ts'])
    const askLaura = stripComments(readFileSync(join(WEB_SRC, 'components/primitives/AskLaura.tsx'), 'utf8'))
    expect(askLaura).toMatch(/const open = \(\) => openInPlace\(/)
    expect(askLaura).toContain('onClick={open}')
  })

  it('elle sait dire NON — un effet qui ouvre sur autre chose que le seul `openRequest` reste refusé', () => {
    expect(opensWithoutGesture('useEffect(() => {\n  setOpen(true)\n}, [openRequest])')).toBe(false)
    expect(opensWithoutGesture('useEffect(() => {\n  setOpen(true)\n}, [openRequest, unread])')).toBe(true)
    expect(opensWithoutGesture('useEffect(() => {\n  setOpen(true)\n}, [unread])')).toBe(true)
  })

  it('elle sait dire NON — un effet qui ouvre est reconnu par la MÊME expression', () => {
    const broken = 'useEffect(() => {\n  setOpen(true)\n}, [unread])'
    const blocks = broken.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]*\]\s*\)/g) ?? []
    expect(blocks.filter(block => /set(Open|Panel\w*)\(\s*true\s*\)/.test(block)).length).toBe(1)
  })

  it('la coque contient bien des effets — sinon la règle 3 ne lirait rien', () => {
    // Sans cette borne, un fichier SANS aucun `useEffect` passerait la règle 3
    // pour de mauvaises raisons : elle serait verte sur du vide.
    expect(dock()).toContain('useEffect(')
  })
})
