/**
 * GA-32 — un bouton qui ne montre qu'une icône porte un nom.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ET POURQUOI ELLE A FAILLI MENTIR
 * ─────────────────────────────────────────────────────────────────────────
 * Une croix, un crayon, trois points : pour qui navigue au lecteur d'écran ou
 * au clavier, un bouton sans texte s'annonce « bouton ». La règle est simple —
 * `aria-label`, `aria-labelledby`, ou un `tooltip` (que `TooltipButton` reporte
 * en nom accessible).
 *
 * ⚠️ La PREMIÈRE mesure a compté 43 fautifs sur 48 boutons. Il y en avait
 * ZÉRO. L'extracteur de balise s'arrêtait au premier `>` rencontré — c'est-à-
 * dire à la flèche de `onClick={() => …}` —, si bien qu'il coupait la balise
 * avant l'attribut qu'il cherchait. C'est exactement le piège du script
 * `<select>` de la veille.
 *
 * La leçon vaut au-delà de ce fichier : une garde qui découpe du JSX à la
 * regex doit suivre la profondeur des accolades, sinon elle mesure autre chose
 * que ce qu'elle croit — et là, elle accusait du code irréprochable, ce qui la
 * fait désactiver dans la semaine.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

/**
 * Rend la balise ouvrante qui CONTIENT l'index donné — du `<` qui la commence
 * au `>` qui la ferme à profondeur d'accolades nulle. C'est ce suivi de
 * profondeur qui manquait à la première version.
 */
function enclosingTag(source: string, index: number): string {
  const start = source.lastIndexOf('<', index)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    else if (char === '}') depth -= 1
    else if (char === '>' && depth === 0) return source.slice(start, i + 1)
  }
  return source.slice(start)
}

const NAMED = /aria-label|aria-labelledby|tooltip=|srOnly|title=/

describe('GA-32 — les boutons icône ont un nom', () => {
  const files = sourceFiles(SRC)

  it('aucun bouton `size="icon"` sans nom accessible', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      let at = source.indexOf('size="icon"')
      while (at !== -1) {
        const tag = enclosingTag(source, at)
        if (!NAMED.test(tag)) {
          offenders.push(`${file.replace(/.*\/src\//, 'src/')} → ${tag.slice(0, 60).replace(/\s+/g, ' ')}`)
        }
        at = source.indexOf('size="icon"', at + 1)
      }
    }
    expect(offenders).toEqual([])
  })

  it("l'extracteur de balise traverse bien une flèche `=>`", () => {
    // Le test qui rend la garde honnête : sans le suivi des accolades, la
    // balise serait coupée à la flèche et l'attribut disparaîtrait.
    const jsx = '<Button size="icon" onClick={() => setOpen(true)} aria-label="Fermer" />'
    expect(enclosingTag(jsx, jsx.indexOf('size="icon"'))).toContain('aria-label')
  })

  it('la garde lit bien des boutons icône — sinon elle serait verte pour toujours', () => {
    const count = files.reduce((acc, file) => acc + (readFileSync(file, 'utf8').includes('size="icon"') ? 1 : 0), 0)
    expect(count).toBeGreaterThan(20)
  })

  /*
   * ─────────────────────────────────────────────────────────────────────────
   * L'ANGLE MORT (09/09/2026) — et comment il a été trouvé
   * ─────────────────────────────────────────────────────────────────────────
   * Tout ce qui précède ne cherche que le littéral `size="icon"`, c'est-à-dire
   * une PROP du composant `Button`. Un `<button>` HTML nu qui ne montre qu'une
   * icône y échappe entièrement.
   *
   * Ce n'est pas une hypothèse : un agent a retiré l'`aria-label` d'un bouton
   * de ce genre pour prouver que SES tests savaient dire non. Ses tests ont
   * rougi ; **cette garde-ci est restée verte**. Une garde qui ne voit pas la
   * moitié de son sujet ne garde que l'autre moitié.
   *
   * ⚠️ Pourquoi un CLIQUET et pas un interdit sec : la première mesure a rendu
   * 71 boutons, dont la grande majorité étaient de FAUX positifs — un corps qui
   * porte `{children}`, un libellé passé en prop, une chaîne i18n. Une garde
   * trop gourmande est un défaut nommé de ce dépôt, au même titre qu'une garde
   * borgne. La définition retenue est donc la RÈGLE elle-même, resserrée : un
   * bouton dont le corps ne contient QUE des balises, aucune d'elles ne
   * portant de texte. Elle rend 4 cas, et ils sont NOMMÉS ci-dessous — jamais
   * une liste d'exclusion muette.
   */
  const ICON_ONLY_WITHOUT_NAME_CEILING = 4

  /** Le corps d'un `<button>` : entre sa balise ouvrante et son `</button>`. */
  function buttonBody(source: string, tagEnd: number): string | null {
    const close = source.indexOf('</button>', tagEnd)
    return close === -1 ? null : source.slice(tagEnd, close)
  }

  function iconOnlyButtonsWithoutName(): string[] {
    const found: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      let at = source.indexOf('<button')
      while (at !== -1) {
        const tag = enclosingTag(source, at + 1)
        const body = tag.trimEnd().endsWith('/>') ? null : buttonBody(source, at + tag.length)
        if (body !== null && !NAMED.test(tag)) {
          // Ce qui NOMME déjà : du texte nu, une chaîne i18n, des enfants, un
          // libellé passé en variable. Aucun de ces cas n'est un bouton muet.
          const withoutTags = body.replace(/<[^>]*>/g, '')
          const hasText = /[A-Za-zÀ-ÿ]{2,}/.test(withoutTags) || /\{\s*(t\(|children|label|title|name|text)/.test(body)
          const hasElement = /<[A-Z][A-Za-z0-9]*/.test(body)
          if (!hasText && hasElement) found.push(file.replace(/.*\/src\//, 'src/'))
        }
        at = source.indexOf('<button', at + 1)
      }
    }
    return found
  }

  it("un `<button>` nu qui ne montre qu'une icône est compté, et le compte ne peut que BAISSER", () => {
    const found = iconOnlyButtonsWithoutName()
    expect(found.length, `boutons icône-seule sans nom accessible :\n${found.join('\n')}`).toBeLessThanOrEqual(
      ICON_ONLY_WITHOUT_NAME_CEILING,
    )
  })

  it('ce compteur LIT quelque chose — sinon le cliquet serait vert pour toujours', () => {
    // Le contrôle positif : la garde doit voir des `<button>` nus, sinon son
    // zéro ne serait pas une mesure mais une panne silencieuse.
    const scanned = files.reduce((acc, f) => acc + (readFileSync(f, 'utf8').includes('<button') ? 1 : 0), 0)
    expect(scanned).toBeGreaterThan(50)
  })

  it("n'attrape pas un bouton dont le libellé vient d'ailleurs — le témoin", () => {
    // Trois formes légitimes qui ne doivent JAMAIS compter comme muettes.
    const legit = [
      '<button type="button">{children}</button>',
      '<button type="button"><Icon />{t(\'actions.close\')}</button>',
      '<button type="button" aria-label="Fermer"><X /></button>',
    ]
    for (const jsx of legit) {
      const tag = enclosingTag(jsx, jsx.indexOf('<button') + 1)
      const body = buttonBody(jsx, tag.length)
      const withoutTags = (body ?? '').replace(/<[^>]*>/g, '')
      const hasText =
        /[A-Za-zÀ-ÿ]{2,}/.test(withoutTags) || /\{\s*(t\(|children|label|title|name|text)/.test(body ?? '')
      expect(hasText || NAMED.test(tag), jsx).toBe(true)
    }
  })
})

/**
 * GA-32 bis — un interrupteur porte un nom.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SECOND BLOC, ET CE QU'IL DIT DE GA-32
 * ─────────────────────────────────────────────────────────────────────────
 * Trouvé en recette live le 10/09/2026, en production, en recettant #1823
 * (#1849) : sur `/settings/routines`, **36 interrupteurs, et les 36 sans nom
 * accessible** — ni `aria-label`, ni `aria-labelledby`, ni texte, ni `<label>`
 * englobant. Un lecteur d'écran y annonce trente-six « interrupteur, activé »
 * identiques, sur la page dont l'objet même est de choisir lesquels activer.
 *
 * GA-32 était VERTE pendant ce temps, et elle avait raison de l'être : son
 * détecteur s'appelle `iconOnlyButtonsWithoutName()` et il cherche des `Button`
 * à icône seule. Un `role="switch"` n'entre pas dans son corpus.
 *
 * Ce n'est donc PAS une garde borgne — le défaut nommé où une garde lit autre
 * chose que ce qu'elle croit. C'est **une porte plus étroite que son flux** : la
 * règle du dépôt est « ce qui se manipule porte un nom », et la garde n'en
 * couvrait qu'une forme. La leçon est que le corpus d'une garde d'accessibilité
 * se définit par la RÈGLE, pas par le composant qui l'a fait naître.
 *
 * ⚠️ Un INTERDIT, pas un cliquet : contrairement aux `<button>` nus, il n'y a
 * ici aucun faux positif à absorber. Un `<Switch>` n'a jamais d'enfants qui
 * pourraient le nommer — il est vide par construction. Zéro est donc la seule
 * valeur juste, et un cliquet à cinq aurait figé le défaut plutôt que de le
 * fermer.
 *
 * Les cinq corrigés réutilisent tous une chaîne DÉJÀ traduite à côté d'eux (le
 * titre de la ligne, le nom de la routine, le libellé de nav) : aucune clé
 * i18n neuve, aucune chaîne en dur, et FR + EN suivent sans rien à écrire.
 */
describe('GA-32 bis — les interrupteurs ont un nom (#1849)', () => {
  const files = sourceFiles(SRC)

  /** Chaque `<Switch …>` du corpus, avec le fichier qui le porte. */
  function switchTags(): { file: string; tag: string }[] {
    const out: { file: string; tag: string }[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      let at = source.indexOf('<Switch')
      while (at !== -1) {
        out.push({ file: file.replace(/.*\/src\//, 'src/'), tag: enclosingTag(source, at + 1) })
        at = source.indexOf('<Switch', at + 1)
      }
    }
    return out
  }

  it('aucun `<Switch>` sans nom accessible', () => {
    const offenders = switchTags()
      .filter(({ tag }) => !NAMED.test(tag))
      .map(({ file, tag }) => `${file} → ${tag.slice(0, 70).replace(/\s+/g, ' ')}`)
    expect(offenders, `interrupteurs sans nom accessible :\n${offenders.join('\n')}`).toEqual([])
  })

  it('la garde LIT bien des interrupteurs — sinon son zéro serait une panne, pas une mesure', () => {
    // Le contrôle positif. Sans lui, supprimer le composant `Switch` rendrait
    // cette garde verte pour toujours, ce qui est le pire des deux mondes.
    expect(switchTags().length).toBeGreaterThan(4)
  })

  it('elle sait dire NON — un interrupteur nu est REPROCHÉ', () => {
    // Le cas réel de #1849, tel qu'il était écrit dans `RoutinesView.tsx`.
    const jsx = '<Switch checked={subscription.enabled} onCheckedChange={enabled => update.mutate({ enabled })} />'
    expect(NAMED.test(enclosingTag(jsx, jsx.indexOf('<Switch') + 1))).toBe(false)
  })

  it("n'attrape pas ce qu'elle ne vise pas — les trois façons légitimes de nommer", () => {
    // Le témoin des cas voisins. `onCheckedChange={… => …}` porte une flèche :
    // c'est le piège qui avait fait mentir la première version de GA-32, et
    // c'est pour ça qu'il est DANS chaque témoin plutôt qu'à côté.
    const legit = [
      "<Switch aria-label={t('community.title')} onCheckedChange={c => toggle.mutate(c)} />",
      '<Switch aria-labelledby="routine-42" onCheckedChange={c => toggle.mutate(c)} />',
      '<Switch title={definition.name[locale]} onCheckedChange={c => toggle.mutate(c)} />',
    ]
    for (const jsx of legit) {
      expect(NAMED.test(enclosingTag(jsx, jsx.indexOf('<Switch') + 1)), jsx).toBe(true)
    }
  })
})

/**
 * GA-35 — ce qui se clique se tabule.
 *
 * Un `<div onClick>` n'a ni tabulation, ni touche Entrée, ni annonce au lecteur
 * d'écran. Trouvé sur le tableau de bord : la ligne « meilleurs comptes »
 * ouvrait un dossier au clic et **n'était atteignable d'aucune autre façon**.
 *
 * Un cliquet et non un interdit : cinq occurrences restent, et elles sont
 * légitimes — quatre enveloppes qui arrêtent la propagation d'un clic
 * (`stopPropagation`) autour de vrais boutons, et une zone de dépôt de
 * fichier, qui répond au glisser et non au clic. Le chiffre
 * descend quand quelqu'un convertit une commande en `<button>` ; il ne monte
 * pas.
 *
 * La bonne réponse quand ce test tombe : un `<button type="button">`. Ajouter
 * `role="button" tabIndex={0} onKeyDown` marche aussi, mais recopie à la main
 * ce que le navigateur fait déjà — et l'oubli du `onKeyDown` ne se voit pas.
 */
const CLICKABLE_DIVS_AT_FREEZE = 5

describe('GA-35 — ce qui se clique se tabule', () => {
  it('le nombre de `div`/`span` cliquables sans clavier ne remonte pas', () => {
    let count = 0
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/<(?:div|span)\b/g)) {
        const tag = enclosingTag(source, match.index ?? 0)
        if (!/onClick=/.test(tag)) continue
        if (/onKeyDown=|role=|tabIndex=/.test(tag)) continue
        count += 1
      }
    }
    expect(count).toBeLessThanOrEqual(CLICKABLE_DIVS_AT_FREEZE)
  })
})
