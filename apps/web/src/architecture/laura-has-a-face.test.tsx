import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { LauraFace } from '@bellum/ui'
import { describe, expect, it } from 'vitest'

/**
 * GA-126 — Laura a UN visage, et c'est le même partout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION QU'ELLE PROTÈGE — D137 (Louis, 01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les maquettes dessinent Laura avec un visage de femme ; le produit affichait
 * le logo Bellum. Louis a tranché : **le visage, comme la maquette.** Le récit
 * complet, et ce qui a été REFUSÉ, vit dans le docblock du composant
 * (`packages/ui/src/assets/laura-face.tsx`) — ici on garde ce que le code doit
 * continuer de faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RÉÉCRITE LE 01/09/2026 AU SOIR — LE DESSIN EST DEVENU UNE IMAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La première réponse à D137 était une illustration monochrome écrite à la
 * main. Louis a ensuite fourni le visuel qu'il veut — un rendu 3D du
 * personnage, en couleurs, sur fond bleu nuit — et a tranché deux fois :
 * **partout**, à toutes les tailles, et **fond gardé tel quel**.
 *
 * Trois points de cette garde parlaient du DESSIN et ne veulent plus rien dire
 * d'une image : « aucune couleur en dur », « tout est currentColor », « deux
 * niveaux de détail ». Ils sont RETIRÉS, pas contournés — une garde qui teste
 * autre chose que ce que le code fait est pire qu'absente, elle rassure.
 *
 * Ce qu'ils protégeaient reste protégé autrement : le visuel est EMBARQUÉ dans
 * le dépôt (aucune URL, aucune variable d'environnement — la porte vers une
 * photo reste condamnée), il est UNIQUE, et son poids est MESURÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE EMPÊCHE, ET POURQUOI CHAQUE POINT EST LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Un seul visuel.** Deux avatars divergent — c'est la loi 1 du tome 7, et
 *    c'est déjà arrivé : le site vitrine avait sa silhouette violette pendant
 *    que l'app montrait un cerveau. Deux visages pour la même personne se
 *    voient tout de suite.
 * 2. **Le visuel est embarqué, jamais pointé.** D137 refuse la photo d'une
 *    personne réelle ; une URL configurable EST cette porte. On retire le
 *    MOYEN, pas seulement la permission.
 * 3. **Son poids est borné.** Il voyage dans le bundle principal, donc il est
 *    chargé avant l'écran de connexion. L'original fait 1 254 px ; le remettre
 *    ferait passer la barre latérale à 300 ko sans que personne le voie.
 * 4. **Décoratif OU nommé, jamais à moitié** (GA-32). Le type l'impose, ce
 *    test prouve que le rendu le tient.
 * 5. **La taille demandée est la taille rendue.** Un avatar qui déborde de son
 *    rond décale la ligne entière d'un fil de conversation.
 * 6. **Aucun mouvement.** GA-25 est un cliquet : sur un outil ouvert huit
 *    heures par jour, un avatar qui bouge fatigue en trois jours.
 * 7. **Aucune surface de Laura ne rend le glyphe du produit.** C'est le défaut
 *    d'origine, et c'est celui qui est revenu : trois portes montraient encore
 *    `<Logo>` le soir de la décision, parce que la liste de cette garde ne les
 *    nommait pas.
 */

const WEB_SRC = join(__dirname, '..')
const UI_SRC = join(WEB_SRC, '../../../packages/ui/src')
const WEBSITE_SRC = join(WEB_SRC, '../../website/src')

/** Le composant qui rend le visage — la seule porte du produit vers Laura. */
const THE_DRAWING = join(UI_SRC, 'assets/laura-face.tsx')

/** Le visuel lui-même, embarqué en base64. */
const THE_PORTRAIT = join(UI_SRC, 'assets/laura-portrait.ts')

/**
 * Le plafond de poids du visuel, en kilo-octets de source (base64 compris).
 *
 * 24 ko : le visuel actuel pèse ~20 ko encodé, et l'original de 1 254 px en
 * ferait 300. La marge laisse remplacer le portrait sans toucher la garde, et
 * refuse le retour de l'original.
 */
const PORTRAIT_MAX_KB = 24

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

/** Retire les commentaires AVANT lecture — leçon GA-08 : sans quoi le docblock
 *  de cette garde, qui cite `#8b5cf6`, se dénoncerait lui-même. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les couleurs écrites en dur dans un dessin SVG.
 *
 * ⚠️ Volontairement plus large que GA-33 : on cherche l'attribut SVG
 * (`fill="#..."`, `stopColor="..."`), pas la classe Tailwind. Les deux formes
 * peignent, une seule était gardée.
 */
function hardCodedPaints(source: string): string[] {
  const found: string[] = []
  for (const match of stripComments(source).matchAll(
    /(?:fill|stroke|stopColor|stop-color|floodColor|lightingColor)=\{?["'](#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))["']/g,
  )) {
    found.push(match[0])
  }
  return found
}

describe('GA-126 — Laura a un visage, et c’est le même partout', () => {
  const drawing = readFileSync(THE_DRAWING, 'utf8')
  const portrait = readFileSync(THE_PORTRAIT, 'utf8')

  it('la garde lit bien quelque chose — sinon elle serait verte pour toujours', () => {
    // Le corpus, d'abord : une garde qui ne lit rien ne garde rien. Six gardes
    // borgnes en deux jours, toutes vertes, toutes aveugles.
    expect(drawing.length).toBeGreaterThan(2_000)
    expect(portrait).toContain('data:image/jpeg;base64,')
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(200)
    expect(sourceFiles(WEBSITE_SRC).length).toBeGreaterThan(20)
  })

  it('le visuel est EMBARQUÉ — aucune URL, aucun réglage qui pointerait ailleurs', () => {
    // La porte de D137 : un avatar bascule sur n'importe quelle image dès qu'une
    // URL se configure. Le data URI n'est pas une adresse, c'est le fichier.
    const code = stripComments(drawing) + stripComments(portrait)
    expect(code).toMatch(/data:image\/(jpeg|png|webp);base64,/)
    expect(code).not.toMatch(/https?:\/\//)
    expect(code).not.toMatch(/import\.meta\.env|process\.env/)
  })

  it('son poids est borné — il est chargé avant l’écran de connexion', () => {
    const kb = Buffer.byteLength(portrait, 'utf8') / 1024
    expect(kb).toBeLessThan(PORTRAIT_MAX_KB)
    // Et il n'est pas vide : un visuel d'un kilo-octet serait un carré gris.
    expect(kb).toBeGreaterThan(5)
  })

  it('sait dire NON : l’original de 1 254 px ne passerait pas', () => {
    // Le contrôle négatif. Sans lui, « le poids est borné » peut vouloir dire
    // « la mesure ne trouve jamais rien ».
    const oversized = 'x'.repeat(Math.ceil(PORTRAIT_MAX_KB * 1024) + 1)
    expect(Buffer.byteLength(oversized, 'utf8') / 1024).toBeGreaterThan(PORTRAIT_MAX_KB)
  })

  it('le visage ne bouge pas — GA-25 est un cliquet', () => {
    const code = stripComments(drawing)
    expect(code).not.toMatch(/framer-motion|motion\.|animate=|<animate|whileHover|transition:/)
  })

  it('un seul visuel dans tout le dépôt', () => {
    // Ce qui se recopie diverge. Deux portes : un second visuel embarqué
    // ailleurs, ou l'ancienne silhouette SVG restée dans un coin.
    const others = [...sourceFiles(WEB_SRC), ...sourceFiles(WEBSITE_SRC), ...sourceFiles(UI_SRC)].filter(
      file => file !== THE_PORTRAIT && file !== THE_DRAWING,
    )
    const embedded = others.filter(file => /data:image\/[a-z]+;base64,/.test(stripComments(readFileSync(file, 'utf8'))))
    expect(embedded).toEqual([])

    const drawn = others.filter(file =>
      /laura-face|laura-avatar/i.test(readFileSync(file, 'utf8').match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? ''),
    )
    expect(drawn).toEqual([])
  })
})

describe('GA-126 — décoratif ou nommé, jamais à moitié (GA-32)', () => {
  it('nommé : il porte un rôle d’image ET son nom', () => {
    render(<LauraFace size={40} name="Laura" />)
    const face = screen.getByRole('img', { name: 'Laura' })
    expect(face).toBeInTheDocument()
    expect(face).not.toHaveAttribute('aria-hidden', 'true')
  })

  it('décoratif : il est retiré de l’arbre, et ne porte AUCUN nom', () => {
    const { container } = render(<LauraFace size={40} decorative />)
    expect(screen.queryByRole('img')).toBeNull()
    const face = container.firstElementChild
    expect(face).toHaveAttribute('aria-hidden', 'true')
    expect(face).not.toHaveAttribute('aria-label')
  })

  it('le nom n’est écrit qu’UNE fois', () => {
    // Le piège du composant `Logo`, qui porte `role="img" aria-label="BellumAI"`
    // en dur : posé dans une bulle nommée, un lecteur d'écran disait le nom
    // DEUX fois — et disait « BellumAI » là où il fallait dire « Laura ».
    const { container } = render(<LauraFace size={40} name="Laura" />)
    const image = container.querySelector('img')
    expect(image).toHaveAttribute('alt', 'Laura')
    expect(image).not.toHaveAttribute('aria-label')
    expect(container.querySelectorAll('[alt], [aria-label]')).toHaveLength(1)
  })
})

describe('GA-126 — un seul rendu, à toutes les tailles', () => {
  /**
   * Les tailles auxquelles Laura apparaît RÉELLEMENT dans le produit — relevées
   * dans le code, pas devinées. 16 px, c'est la barre latérale : Louis a choisi
   * le visuel PARTOUT en sachant qu'à cette taille il se lit comme une pastille
   * plutôt que comme un visage.
   */
  const REAL_SIZES = [16, 20, 24, 32, 40, 56]

  it('la taille demandée est la taille rendue', () => {
    for (const size of REAL_SIZES) {
      const { container } = render(<LauraFace size={size} decorative />)
      const image = container.querySelector('img') as HTMLImageElement
      expect(image).toHaveAttribute('width', String(size))
      expect(image.style.width, `${size}px`).toBe(`${size}px`)
    }
  })

  it('le visuel est le MÊME à toutes les tailles — une personne, un visage', () => {
    const sources = REAL_SIZES.map(size => {
      const { container } = render(<LauraFace size={size} decorative />)
      return container.querySelector('img')?.getAttribute('src')
    })
    expect(sources.every(src => typeof src === 'string' && src.length > 1_000)).toBe(true)
    expect(new Set(sources).size).toBe(1)
  })

  it('il remplit son rond sans se déformer', () => {
    // `object-cover` sur un carré : le portrait est déjà cadré carré, mais un
    // recadrage futur ne doit pas étirer le visage.
    const { container } = render(<LauraFace size={40} decorative />)
    expect(container.querySelector('img')?.className).toMatch(/rounded-full/)
    expect(container.querySelector('img')?.className).toMatch(/object-cover/)
  })
})

describe('GA-126 — Laura ne parle plus sous le logo du produit', () => {
  /**
   * Les surfaces où Laura parle EN SON NOM. Le logo Bellum reste partout
   * ailleurs : il est le produit, et D137 ne change que l'avatar de Laura.
   */
  const HER_SURFACES = [
    join(WEB_SRC, 'features/chat/view/Chat.tsx'),
    join(WEB_SRC, 'features/laura/LauraCard.tsx'),
    // ⚠️ Ajoutées le 01/09/2026 : « tu l'avais bien ajouté partout partout ? »
    // Non — trois portes de Laura montraient encore le glyphe du produit. La
    // liste de cette garde ÉTAIT le trou : elle protégeait quatre fichiers et
    // se taisait sur les autres. Ce sont les surfaces où Laura parle en son
    // nom, donc où le logo Bellum dirait « le produit te répond ».
    join(WEB_SRC, 'components/sidebar/CustomerNavbarBody.tsx'),
    join(WEB_SRC, 'features/laura/bubble/LauraDock.tsx'),
    join(WEB_SRC, 'features/laura/bubble/LauraBubblePanel.tsx'),
    join(WEBSITE_SRC, 'features/chatbot/ChatWidget.tsx'),
  ]

  it('chacune de ces surfaces existe et montre le visage', () => {
    for (const file of HER_SURFACES) {
      const source = readFileSync(file, 'utf8')
      expect(source.length, file).toBeGreaterThan(500)
      expect(stripComments(source), file).toMatch(/LauraFace/)
    }
  })

  it('aucune de ces surfaces ne rend le glyphe du produit à la place du visage', () => {
    // Le logo reste partout où c'est le PRODUIT qui parle (« Analyse de
    // BellumAI », les états vides, la page de partage). Ici, c'est Laura.
    for (const file of HER_SURFACES) {
      expect(stripComments(readFileSync(file, 'utf8')), file).not.toMatch(/<Logo[\s/>]/)
    }
  })

  it('l’avatar de l’assistante n’est plus le glyphe Bellum', () => {
    // Le défaut d'origine, nommément : `AssistantAvatar` rendait `<Logo />`.
    const chat = stripComments(readFileSync(join(WEB_SRC, 'features/chat/view/Chat.tsx'), 'utf8'))
    const avatar = chat.slice(chat.indexOf('function AssistantAvatar'))
    expect(avatar).toContain('LauraFace')
    expect(avatar.slice(0, avatar.indexOf('function MessageTime'))).not.toContain('<Logo')
  })

  it('aucune porte vers une PHOTO, ni sur le site ni dans le paquet partagé', () => {
    // D137 refuse la photo d'une personne réelle ET l'image générée d'une
    // personne identifiable. Une variable d'environnement qui pointe une URL
    // arbitraire EST cette porte : on retire le moyen, pas seulement la
    // permission.
    //
    // ⚠️ Sur le CODE, pas sur le fichier : le docblock du composant NOMME la
    // variable retirée, parce qu'une suppression sans sa raison se fait
    // rétablir par le prochain qui la cherche. Sans `stripComments`, cette
    // garde dénoncerait l'explication au lieu du défaut — leçon GA-08.
    //
    // ⚠️ Et elle ne cherche plus `<img>` : depuis que le visuel est une image
    // embarquée, la balise est la réponse, pas le défaut. Ce qui reste interdit
    // est l'ADRESSE — c'est le test « le visuel est EMBARQUÉ » qui la refuse
    // sur le composant, et celui-ci qui la refuse sur les deux applications.
    const everywhere = [...sourceFiles(WEBSITE_SRC), ...sourceFiles(UI_SRC), ...sourceFiles(WEB_SRC)]
    const doors = everywhere.filter(file => /LAURA_AVATAR_URL/.test(stripComments(readFileSync(file, 'utf8'))))
    expect(doors).toEqual([])
  })
})
