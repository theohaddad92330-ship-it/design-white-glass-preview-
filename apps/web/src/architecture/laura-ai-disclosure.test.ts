import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-246 — « ASSISTANTE IA » EST RENDUE PARTOUT OÙ LAURA PARLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET DEPUIS QUAND C'EST DÛ
 * ─────────────────────────────────────────────────────────────────────────────
 * Article 50 de l'EU AI Act, applicable depuis le **02/08/2026** : une personne
 * qui interagit avec un système d'IA doit le savoir. La mention existait dans le
 * système-prompt de Laura — « tu es une assistante IA et tu le dis si on te le
 * demande » — et « si on te le demande » n'est pas « en permanence ». Toute
 * l'obligation tient dans cette différence : savoir SANS avoir à demander.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PROMPT NE PEUT PAS TENIR CETTE RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il se réécrit sans qu'aucun test ne tombe. Il dépend d'un modèle qui décide de
 * l'appliquer. Et il n'existe pas du tout sur les surfaces qui affichent du
 * texte préparé — la démonstration, la carte proactive — où la personne croit
 * pourtant parler à quelqu'un. Le seul endroit où la mention peut être TENUE est
 * le rendu, et c'est ce que cette garde lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PATRON VIENT DU SITE PUBLIC
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/website` le fait depuis le PDF 10, tenu par sa garde « GL-07 — la
 * mention "assistante IA" est toujours là » : elle lit la SOURCE du widget et
 * vérifie que le catalogue de chaque langue porte bien le mot. On reprend les
 * deux moitiés — le rendu ET les catalogues — parce qu'une mention traduite en
 * « Assistante » toute seule ne dirait plus rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE COUVRE PAS, ET C'EST ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link PENDING} nomme les surfaces conversationnelles qui n'ont pas encore la
 * mention. La liste est ASSERTÉE : en ajouter une demande de toucher ce fichier,
 * donc de le dire en revue. Elle n'est pas une dispense — elle est la dette,
 * écrite à l'endroit où on la verra.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * Le composant unique. La mention n'est pas un bout de JSX qu'on recopie : la
 * quatrième surface naîtrait sans elle.
 */
const COMPONENT = 'features/laura/AiDisclosure.tsx'
const RENDER = '<AiDisclosure'

/** Les surfaces où Laura parle et qui rendent la mention. */
const CARRIES = [
  // 07/10/2026 — le fil d'approche contact (dette du 01/09 payée).
  'features/accounts/view/account-detail/components/contact-engagement/EngagementConversation.tsx',
  // Théo B c6 — la page d'approche d'un contact : les brouillons de Laura s'y relisent ; la mention est sous le titre.
  'features/contacts/view/approach/ApproachPage.tsx',
  'features/contacts/view/approach/CallApproachBody.tsx',
  // La page pleine du copilote — la mention est dans l'en-tête, à côté du nom.
  'features/chat/view/Chat.tsx',
  // ⚠️ `features/demo/view/DemoChat.tsx` A DISPARU de cette liste le 03/09/2026,
  // et la mention n'a rien perdu — au contraire.
  //
  // C'était la démonstration publique, une coque parallèle de 206 lignes qui
  // portait son propre `<AiDisclosure />`. Depuis #1320, `/chat` rend la coque
  // RÉELLE pour tout le monde et seul le MOTEUR de réponse change : la
  // démonstration hérite donc de la mention de `Chat.tsx`, juste au-dessus.
  //
  // L'obligation ne connaît pas la différence entre une réponse en direct et une
  // réponse préparée — dans les deux cas la personne croit parler à quelqu'un.
  // Elle est tenue par la ligne précédente, sur la seule surface qui existe
  // maintenant, ce qui est plus sûr qu'une seconde ligne à maintenir.
  // Les trois formes proactives — bulle, carte, panneau. Une bulle qui
  // interrompt sans dire ce qu'elle est est exactement le cas que l'article
  // vise, et c'est la forme la plus étroite : elle la porte quand même.
  'features/laura/LauraCard.tsx',
  // Le panneau de la bulle (fusion du 01/09) : c'est la surface où ça compte le
  // plus, parce que c'est la seule qui s'invite. La mention est dans son entête,
  // à côté du nom et sous le sous-titre.
  'features/laura/bubble/LauraBubblePanel.tsx',
  // #1956.26 — la notice du mode vocal, lue AVANT la première demande du micro :
  // c'est le seul écran garanti lu avant que la voix ne soit transcrite par l'IA.
  // Déclarée volontairement (le fichier ne rend jamais `role: 'assistant'`, donc
  // le balayage ne l'aurait pas trouvée seul) — la promesse du registre du 12/09
  // s'applique quand même.
  'features/chat/voice/VoiceInput.tsx',
] as const

/**
 * LA DÉLÉGATION — un fichier qui FABRIQUE des tours sans les afficher.
 *
 * ⚠️ Ce n'est pas une dispense, et la différence est tout le point. `LauraDock`
 * construit les messages de la bulle (`role: 'assistant'`, deux fois) puis les
 * passe à `LauraBubblePanel`, qui les rend. Il n'a aucun entête où poser la
 * mention : la poser là l'afficherait deux fois, ou nulle part.
 *
 * L'inscrire dans `PENDING` aurait été faux — ce serait de la dette, alors que
 * la mention EST rendue à l'écran. L'inscrire dans `CARRIES` aurait été faux
 * aussi — le test « rend RÉELLEMENT la mention » tomberait, et à juste titre.
 *
 * Une entrée ici affirme donc quelque chose de VÉRIFIABLE, et le test ci-dessous
 * le vérifie : le fichier délégué est nommé, il existe, et il figure dans
 * `CARRIES`. Une délégation vers un fichier qui ne porte pas la mention est
 * refusée exactement comme un orphelin.
 */
const DELEGATES: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'features/laura/bubble/LauraDock.tsx', to: 'features/laura/bubble/LauraBubblePanel.tsx' },
  // #3696 (K12) — le fournisseur réhydrate le fil d'approche ; la conversation le rend, mention comprise.
  {
    from: 'features/accounts/view/account-detail/components/contact-engagement/ContactEngagementProvider.tsx',
    to: 'features/accounts/view/account-detail/components/contact-engagement/EngagementConversation.tsx',
  },
]

/**
 * LA DETTE, NOMMÉE.
 *
 * `EngagementConversation` est un fil de conversation complet : l'IA y rédige un
 * message sortant, tour par tour, et l'en-tête du panneau dit « Approche
 * contact » sans jamais nommer ce qui écrit. Elle vit sous
 * `features/accounts/**`, hors du périmètre du lot du 01/09 — six agents y
 * écrivaient la même nuit, et un conflit sur ce dossier aurait coûté plus que
 * l'attente. Le geste à faire est le même qu'ailleurs : un `<AiDisclosure />`
 * sous le titre de `EngagementPanelHeader`.
 */
const PENDING: readonly string[] = []

/**
 * Ce qui fait d'un fichier une surface conversationnelle : il rend un TOUR
 * d'assistant. C'est la marque mécanique la plus proche de « Laura parle ici » —
 * un composant qui n'affiche jamais un message d'assistante ne relève pas de
 * l'article 50.
 */
const ASSISTANT_TURN = /role\s*(?::|===|==)\s*['"]assistant['"]/

/**
 * Retire commentaires de bloc et de ligne en les remplaçant par des ESPACES DE
 * MÊME LONGUEUR.
 *
 * Ce n'est pas de la coquetterie : supprimer les caractères recolle deux lignes
 * et fabrique des correspondances qui n'existent pas dans le code. Et c'est
 * indispensable ici, où les docblocks du dépôt CITENT `<AiDisclosure` et
 * `role: 'assistant'` pour expliquer la règle — une garde qui lirait ses propres
 * commentaires se déclarerait satisfaite toute seule.
 */
function stripComments(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, before, comment) => before + blank(comment))
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full))
      continue
    }
    if (entry.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

function read(relativePath: string): string {
  return readFileSync(join(WEB_SRC, relativePath), 'utf8')
}

/** Le chemin relatif à `src`, en séparateurs POSIX — comparable aux listes. */
function key(file: string): string {
  return relative(WEB_SRC, file).split(sep).join('/')
}

describe('GA-246 — la mention « assistante IA » est rendue, pas promise', () => {
  const files = tsxFiles(WEB_SRC)
  const conversational = files.filter(file => ASSISTANT_TURN.test(stripComments(readFileSync(file, 'utf8')))).map(key)

  it('lit un corpus non vide — et trouve les surfaces qu’on sait exister', () => {
    // Sans ce contrôle, une erreur de chemin rendrait la garde verte sur zéro
    // fichier : le faux zéro silencieux, qui est le mode de panne n°1 d'une
    // garde qui balaie un dossier.
    expect(files.length).toBeGreaterThan(200)
    expect(conversational.length).toBeGreaterThanOrEqual(2)
    expect(conversational).toContain('features/chat/view/Chat.tsx')
    // ⚠️ L'ancre était `DemoChat.tsx` — un fichier qui n'existe plus depuis
    // #1320 (la démonstration rend la coque réelle). Une ancre qui disparaît
    // avec son fichier ne prouve plus que le balayage LIT quelque chose.
    //
    // Elle pointe maintenant `LauraDock`, qui FABRIQUE les tours de la bulle :
    // c'est un cas de DÉLÉGATION déjà déclaré plus haut, donc une entrée que la
    // garde connaît et sait justifier — et surtout un fichier que le balayage
    // trouve pour la bonne raison (il écrit littéralement `role: 'assistant'`).
    expect(conversational).toContain('features/laura/bubble/LauraDock.tsx')
  })

  it('le composant existe, et il rend du TEXTE — pas seulement un attribut', () => {
    const component = stripComments(read(COMPONENT))
    // Un `aria-label` seul ne remplit pas l'obligation : la mention doit être
    // lisible à l'écran, pas seulement par un lecteur d'écran.
    expect(component).toContain("t('disclosure.role')")
    expect(component).toContain('<Text')
  })

  it('chaque surface déclarée rend RÉELLEMENT la mention', () => {
    const missing = CARRIES.filter(surface => !stripComments(read(surface)).includes(RENDER))
    expect(missing).toEqual([])
  })

  it('aucune surface conversationnelle n’échappe à la liste — une neuve ne naît pas sans elle', () => {
    const known = new Set<string>([...CARRIES, ...PENDING, ...DELEGATES.map(d => d.from)])
    const orphans = conversational.filter(file => !known.has(file))
    // Un fichier qui rend un tour d'assistante sans figurer ici est une surface
    // arrivée sans qu'on se pose la question. C'est le mécanisme du défaut :
    // la première surface porte la mention, la deuxième la recopie, la
    // troisième l'oublie.
    expect(orphans).toEqual([])
  })

  it('une délégation pointe une surface qui porte VRAIMENT la mention', () => {
    // Sans ce test, `DELEGATES` serait une liste d'exemptions déguisée : il
    // suffirait d'y écrire n'importe quelle cible pour faire taire la garde.
    expect(DELEGATES.length).toBeGreaterThan(0)
    for (const { from, to } of DELEGATES) {
      // `files` porte des chemins ABSOLUS ; `key()` les ramène à la forme des
      // listes. Comparer les deux directement rendait un test vert impossible.
      const connus = files.map(key)
      expect(connus, from).toContain(from)
      expect(connus, to).toContain(to)
      expect(CARRIES as readonly string[], to).toContain(to)
      // Et la cible rend la mention pour de bon — le même contrôle que pour
      // une surface déclarée, appliqué au bout de la délégation.
      expect(stripComments(read(to))).toContain(RENDER)
    }
  })

  it('la dette est NOMMÉE, et les fichiers qu’elle nomme existent', () => {
    // Une entrée périmée — un fichier renommé, supprimé, ou déjà corrigé —
    // ferait de cette liste une dispense permanente que personne ne relit.
    for (const pending of PENDING) {
      const source = stripComments(read(pending))
      expect(source.includes(RENDER)).toBe(false)
    }
    // 07/10/2026 — la dette est PAYÉE : `EngagementConversation` rend la mention.
    expect(PENDING).toEqual([])
  })

  it('les catalogues FR et EN nomment bien l’IA — « Assistante » seule ne dirait rien', () => {
    for (const locale of ['fr', 'en']) {
      const catalog = JSON.parse(readFileSync(join(WEB_SRC, `i18n/locales/${locale}/laura.json`), 'utf8')) as {
        disclosure?: { role?: string; aria?: string }
      }
      expect(catalog.disclosure?.role?.toLowerCase()).toMatch(/\bia\b|\bai\b/)
      expect(catalog.disclosure?.aria?.toLowerCase()).toMatch(/\bia\b|\bai\b/)
    }
  })

  describe('la garde sait dire NON', () => {
    it('signale une surface conversationnelle qui ne rend pas la mention', () => {
      const source = "const turn = { role: 'assistant', content: reply }\nreturn <p>{turn.content}</p>"
      expect(ASSISTANT_TURN.test(stripComments(source))).toBe(true)
      expect(stripComments(source).includes(RENDER)).toBe(false)
    })

    it('ne se laisse pas payer par un COMMENTAIRE qui cite le composant', () => {
      // Le défaut exact qu'on a déjà vu : une garde qui lit le fichier entier
      // se déclare satisfaite parce que le docblock parle de la règle.
      const source = '// on devrait rendre <AiDisclosure /> ici\nreturn <p>{reply}</p>'
      expect(source.includes(RENDER)).toBe(true)
      expect(stripComments(source).includes(RENDER)).toBe(false)
    })

    it('n’attrape PAS ce qu’elle ne vise pas', () => {
      // Un écran qui n'affiche aucun tour d'assistante n'est pas concerné : la
      // mention n'a pas à s'imposer à une liste de comptes.
      expect(ASSISTANT_TURN.test("const columns = ['role', 'assistant']")).toBe(false)
      expect(ASSISTANT_TURN.test('<Table rows={rows} />')).toBe(false)
      // Et les commentaires blanchis gardent leurs positions : une ligne de
      // code qui SUIT un commentaire reste sur sa propre ligne.
      const masked = stripComments("/* rien */\nconst role = 'user'")
      expect(masked.split('\n')).toHaveLength(2)
      expect(masked).toContain("const role = 'user'")
    })
  })
})
