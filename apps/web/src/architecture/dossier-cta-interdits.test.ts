/**
 * GA — LES INTERDITS du contrat de bouton du dossier (#2116.38, .39, .40, .41, .49).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE MESURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot précédent a rendu chaque bouton du dossier CAPABLE de dire ce qu'il
 * fait (`cta-contract.ts`, `dossier-cta-contract.test.ts`). Une réponse écrite
 * reste une promesse tant que rien ne la confronte au dépôt : ce fichier la
 * confronte.
 *
 *  · #2116.38 — un bouton qui n'ouvre AUCUN écran. Toute `navigate` doit viser
 *    une route DÉCLARÉE par l'arbre généré (`routeTree.gen.ts`), et tout
 *    `open-*` doit nommer un fichier qui rend vraiment cette surface (un
 *    `dialog:` ouvre un `<Dialog`, un `sheet:` un `<Sheet`, …).
 *  · #2116.39 — une redirection vers une page GÉNÉRIQUE. La destination porte
 *    l'objet : un segment de paramètre (`/accounts/$id/brief`) ou un paramètre
 *    de requête qui nomme le compte (`/search?accountId&company`). Une
 *    destination nue (`/dashboard`) ramène le commercial à un écran qui ne
 *    parle plus de ce qu'il regardait.
 *  · #2116.40 — un toast sans objet. Une écriture serveur porte sa preuve ET
 *    un message de succès qui NOMME ce qui a bougé, par interpolation.
 *    « Écarté. » ne dit pas QUI a été écarté ; sur une liste de comptes, c'est
 *    la seule chose qu'on voulait savoir.
 *  · #2116.41 — un « terminé » qui n'explique rien. Garde LEXICALE sur le
 *    texte FR ET EN : un message réduit à « Terminé », « Fait », « OK »,
 *    « Done », « Succès » est refusé.
 *  · #2116.43 — une exécution ANNONCÉE avant confirmation. La couche des
 *    boutons n'annonce rien : aucun `toast.success` n'existe dans la barre
 *    d'actions ni dans la primitive. Le succès vient du `onSuccess` de la
 *    mutation, jamais du clic. Le comportement lui-même (faire ÉCHOUER la
 *    mutation, vérifier qu'aucun succès n'est annoncé) est tenu par
 *    `dossier-cta-outcome.test.tsx`.
 *  · #2116.49 — une destination sans implémentation. Le fichier nommé par
 *    `wiredBy` existe, et il porte vraiment le mécanisme annoncé : une
 *    `mutate` vient d'un `useMutation`, un `dismiss` ferme une surface qu'une
 *    AUTRE entrée ouvre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE MESURE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas si l'écran atteint RÉPOND à la promesse du libellé — ça
 * demanderait de reconnaître un geste métier dans du JSX. Elle ne dit rien non
 * plus du comportement au clic (succès annoncé trop tôt, double clic, reprise
 * après échec) : c'est
 * `features/accounts/view/account-detail/cta/dossier-cta-outcome.test.tsx`.
 * Et les interdits qui se lisent dans le registre SEUL (action principale sous
 * « … », doublon entre sections, sortie sans confirmation) vivent dans
 * `packages/contracts/src/schemas/cta-contract.test.ts`.
 *
 * Les extracteurs retirent les commentaires avant de chercher : un `<Dialog`
 * cité dans un docbloc ne rend aucune fenêtre, et une garde qui lit le récit
 * d'un défaut au lieu du code est borgne.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOSSIER_CTA_CONTRACTS,
  DOSSIER_CTA_GENERIC_DESTINATION_EXCEPTIONS,
  DOSSIER_CTA_SCOPE_FILES,
  type DossierCtaContract,
} from '@bellum/contracts'
import { resources } from '@/i18n/resources'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** Le code sans ses commentaires — un docbloc n'exécute rien. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les chemins DÉCLARÉS par l'arbre généré, jamais une liste tenue à la main. */
function declaredRoutes(): Set<string> {
  const tree = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')
  return new Set([...tree.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

/** Le texte d'une clé `ns:chemin` dans une langue, ou `null`. */
function textOf(locale: 'fr' | 'en', key: string): string | null {
  const [ns, path] = key.split(':')
  let node: unknown = (resources as Record<string, Record<string, unknown>>)[locale]?.[ns]
  for (const segment of (path ?? '').split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' && node.trim().length > 0 ? node : null
}

/** La source du fichier qui implémente une entrée, sans ses commentaires. */
function wiredSource(cta: DossierCtaContract): string | null {
  const path = join(SRC, cta.wiredBy)
  return existsSync(path) ? stripComments(readFileSync(path, 'utf8')) : null
}

/** La racine Radix qu'une surface annoncée DOIT rendre — #2116.38. */
const SURFACE_ROOT: Record<string, string> = {
  'dialog:': '<Dialog',
  'sheet:': '<Sheet',
  'menu:': '<DropdownMenu',
  'popover:': '<Popover',
}

/** Le chemin d'une destination de navigation, sans sa requête. */
function routeOf(destination: string): string {
  return destination.split('?')[0]
}

/**
 * #2116.39 — la destination porte-t-elle l'OBJET ? Un segment de paramètre
 * (`$id`, `:id`) suffit ; à défaut, un paramètre de requête qui nomme le
 * compte. La fonction est pure pour qu'on puisse lui montrer `/dashboard`.
 */
function carriesObject(destination: string): boolean {
  const [path, query = ''] = destination.split('?')
  if (/(^|\/)[$:][A-Za-z]/.test(path)) return true
  return query
    .split('&')
    .filter(Boolean)
    .some(param => /^(accountId|account|companyId|company|id)([=]|$)/.test(param))
}

/**
 * #2116.41 — le message est-il réduit à un « c'est fini » ? On retire les
 * interpolations, les accents et la ponctuation, puis on compare le message
 * ENTIER à la liste : « C'est fait. {{company}} est dans ton portefeuille »
 * commence par une formule bannie et reste parfaitement légitime.
 */
const BARE_DONE = new Set([
  'termine',
  'terminee',
  'fait',
  'c est fait',
  'ca y est',
  'ok',
  'done',
  'all done',
  'succes',
  'success',
  'reussi',
  'reussie',
  'effectue',
  'effectuee',
  'enregistre',
  'enregistree',
  'saved',
  'voila',
])
function isBareDone(label: string): boolean {
  const normalised = label
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return BARE_DONE.has(normalised)
}

/** #2116.40 — le message NOMME-t-il l'objet : une interpolation, ou un lien. */
function namesItsObject(label: string): boolean {
  return /\{\{[^}]+\}\}/.test(label) || /<a[\s>]/.test(label) || /\[[^\]]+\]\([^)]+\)/.test(label)
}

const NAVIGATES = DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect === 'navigate')
const MUTATES = DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect === 'mutate')
const OPENS = DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect.startsWith('open-'))
const SUCCESS_KEYS = DOSSIER_CTA_CONTRACTS.map(cta => cta.successStateKey).filter((k): k is string => k !== null)

describe('les interdits du contrat de bouton du dossier — le dépôt confronté au registre', () => {
  it('LIT trois corpus non vides — l’arbre de routes, le registre, les traductions', () => {
    const routes = declaredRoutes()
    expect(routes.size, 'arbre de routes vide').toBeGreaterThan(80)
    expect(routes.has('/accounts/$id')).toBe(true)
    expect(DOSSIER_CTA_CONTRACTS.length).toBeGreaterThanOrEqual(16)
    expect(NAVIGATES.length).toBeGreaterThanOrEqual(2)
    expect(MUTATES.length).toBeGreaterThanOrEqual(4)
    expect(OPENS.length).toBeGreaterThanOrEqual(5)
    expect(SUCCESS_KEYS.length).toBeGreaterThanOrEqual(5)
  })

  it('#2116.38, .49 — le fichier qui implémente chaque bouton EXISTE sur le disque', () => {
    const fantomes = DOSSIER_CTA_CONTRACTS.filter(cta => !existsSync(join(SRC, cta.wiredBy))).map(
      cta => `${cta.id} → ${cta.wiredBy}`,
    )
    expect(fantomes, `implémentation déclarée mais absente : ${fantomes.join(', ')}`).toEqual([])
    // Et les fichiers lus portent du code, pas cinq lignes d'import.
    for (const cta of DOSSIER_CTA_CONTRACTS) {
      expect(wiredSource(cta)?.length ?? 0, cta.wiredBy).toBeGreaterThan(200)
    }
  })

  it('#2116.38 — aucun bouton qui n’ouvre aucun écran : toute navigation vise une route DÉCLARÉE', () => {
    const routes = declaredRoutes()
    const impasses = NAVIGATES.filter(cta => {
      const route = routeOf(cta.destination)
      // Le générateur déclare la page d'index sous deux formes (`/search` et
      // `/search/`) : les deux désignent le même écran.
      return !routes.has(route) && !routes.has(`${route}/`)
    }).map(cta => `${cta.id} → ${cta.destination}`)
    expect(impasses, `navigation vers une route inexistante : ${impasses.join(', ')}`).toEqual([])
  })

  it('#2116.38 — tout `open-*` nomme un fichier qui rend VRAIMENT cette surface', () => {
    const muets = OPENS.filter(cta => {
      const prefix = Object.keys(SURFACE_ROOT).find(key => cta.destination.startsWith(key))
      if (!prefix) return true
      return !(wiredSource(cta) ?? '').includes(SURFACE_ROOT[prefix])
    }).map(cta => `${cta.id} → ${cta.destination} (${cta.wiredBy})`)
    expect(muets, `surface annoncée que personne ne rend : ${muets.join(', ')}`).toEqual([])
  })

  it('#2116.38 — un `dismiss` ferme une surface qu’une AUTRE entrée ouvre', () => {
    const ouvertes = new Set(OPENS.map(cta => cta.destination))
    const orphelins = DOSSIER_CTA_CONTRACTS.filter(
      cta => cta.effect === 'dismiss' && !ouvertes.has(cta.destination),
    ).map(cta => `${cta.id} → ${cta.destination}`)
    expect(DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect === 'dismiss').length).toBeGreaterThanOrEqual(1)
    expect(orphelins, `fermeture d’une surface que rien n’ouvre : ${orphelins.join(', ')}`).toEqual([])
  })

  it('#2116.39 — aucune redirection vers une page générique : la destination porte l’objet', () => {
    const exceptions = new Set(DOSSIER_CTA_GENERIC_DESTINATION_EXCEPTIONS.map(exception => exception.id))
    const generiques = NAVIGATES.filter(cta => !carriesObject(cta.destination) && !exceptions.has(cta.id)).map(
      cta => `${cta.id} → ${cta.destination}`,
    )
    expect(generiques, `destination générique, sans exception écrite : ${generiques.join(', ')}`).toEqual([])
  })

  it('#2116.49 — une écriture serveur vient d’une vraie mutation, une fabrication d’un fichier du dossier', () => {
    const sansMutation = MUTATES.filter(cta => !/\buseMutation\s*[(<]/.test(wiredSource(cta) ?? '')).map(
      cta => `${cta.id} → ${cta.wiredBy}`,
    )
    expect(sansMutation, `mutation annoncée sans \`useMutation\` : ${sansMutation.join(', ')}`).toEqual([])

    const prepares = DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect === 'prepare')
    expect(prepares.length).toBeGreaterThanOrEqual(2)
    const horsDossier = prepares.filter(cta => !cta.wiredBy.startsWith('features/accounts/')).map(cta => cta.id)
    expect(horsDossier, `fabrication implémentée hors du dossier compte : ${horsDossier.join(', ')}`).toEqual([])
  })

  it('#2116.40 — aucun toast sans objet : un succès d’écriture NOMME ce qui a bougé, en FR et en EN', () => {
    const fautifs: string[] = []
    for (const cta of MUTATES) {
      if (!cta.proofKey) fautifs.push(`${cta.id} : aucune preuve`)
      const key = cta.successStateKey
      if (!key) {
        fautifs.push(`${cta.id} : aucun message de succès`)
        continue
      }
      for (const locale of ['fr', 'en'] as const) {
        const label = textOf(locale, key)
        if (!label) fautifs.push(`${cta.id} : ${key} absent en ${locale}`)
        else if (!namesItsObject(label)) fautifs.push(`${cta.id} : « ${label} » (${locale}) ne nomme pas l’objet`)
      }
    }
    expect(fautifs, fautifs.join(' · ')).toEqual([])
  })

  it('#2116.41 — aucun « terminé » sans dire ce qui a été fait, en FR et en EN', () => {
    const creux: string[] = []
    for (const key of SUCCESS_KEYS) {
      for (const locale of ['fr', 'en'] as const) {
        const label = textOf(locale, key)
        if (!label) creux.push(`${key} absent en ${locale}`)
        else if (isBareDone(label)) creux.push(`${key} (${locale}) = « ${label} »`)
      }
    }
    expect(creux, `message de fin qui n’explique rien : ${creux.join(' · ')}`).toEqual([])
  })

  it('#2116.43 — la barre d’actions n’annonce AUCUN succès : le clic ne dit jamais « c’est fait »', () => {
    // Un `toast.success` posé dans un `onClick` s'affiche avant que le serveur
    // ait répondu : c'est l'exécution annoncée sans confirmation, mot pour mot.
    // La couche des boutons n'en porte aucun — elle passe la main, et c'est la
    // mutation qui parle.
    const couche = [
      ...DOSSIER_CTA_SCOPE_FILES,
      'features/accounts/view/account-detail/cta/DossierCta.tsx',
      'features/accounts/view/account-detail/cta/dossier-cta-blocked.ts',
    ]
    expect(couche.length).toBeGreaterThanOrEqual(7)
    const bavards = couche.filter(path => {
      const source = stripComments(readFileSync(join(SRC, path), 'utf8'))
      expect(source.length, path).toBeGreaterThan(200)
      return /\btoast\s*\.\s*(success|info)\s*\(/.test(source)
    })
    expect(bavards, `succès annoncé au clic : ${bavards.join(', ')}`).toEqual([])
  })

  it('#2116.43 — et le succès d’une écriture vient bien de la RÉSOLUTION de la mutation', () => {
    const fautifs = MUTATES.filter(cta => {
      const source = wiredSource(cta) ?? ''
      const callback = source.indexOf('onSuccess')
      const annonce = source.search(/\btoast\s*\.\s*success\s*\(/)
      // L'annonce doit exister ET venir APRÈS l'ouverture du rappel de succès.
      return callback === -1 || annonce === -1 || annonce < callback
    }).map(cta => `${cta.id} → ${cta.wiredBy}`)
    expect(fautifs, `succès annoncé hors du rappel de succès : ${fautifs.join(', ')}`).toEqual([])
  })

  it('sait dire NON — une route inventée, une surface que rien ne rend, une page générique', () => {
    const routes = declaredRoutes()
    expect(routes.has('/ecran/qui/nexiste/pas')).toBe(false)

    // Une surface annoncée par un fichier qui ne la rend pas : le hook de
    // rafraîchissement n'a aucun `<Dialog`.
    const faux: DossierCtaContract = {
      ...OPENS[0],
      id: 'dossier.faux.dialog',
      destination: 'dialog:accounts.inexistant',
      wiredBy: 'features/accounts/hooks/useRefreshDimension.ts',
    }
    expect((wiredSource(faux) ?? '').includes('<Dialog')).toBe(false)

    // Une implémentation fantôme.
    expect(existsSync(join(SRC, 'features/accounts/hooks/useJamaisEcrit.ts'))).toBe(false)

    // #2116.39 : les trois formes de destination nue que la règle refuse.
    expect(carriesObject('/dashboard')).toBe(false)
    expect(carriesObject('/accounts')).toBe(false)
    expect(carriesObject('/search?tab=recent')).toBe(false)

    // #2116.41 : les formes creuses, avec et sans ponctuation.
    expect(isBareDone('Terminé')).toBe(true)
    expect(isBareDone('Terminé !')).toBe(true)
    expect(isBareDone('Done.')).toBe(true)
    expect(isBareDone('OK')).toBe(true)
    expect(isBareDone('Succès')).toBe(true)
    expect(isBareDone('C’est fait.')).toBe(true)

    // #2116.40 : un message qui ne nomme rien.
    expect(namesItsObject('Écarté.')).toBe(false)

    // #2116.43 : la forme exacte que la règle refuse — une annonce posée dans
    // le gestionnaire de clic, avant toute réponse du serveur.
    const optimiste = `<DossierCtaButton cta="dossier.gate.prioritise" onClick={() => { decide.mutate(x); toast.success('C’est fait') }}>x</DossierCtaButton>`
    expect(/\btoast\s*\.\s*(success|info)\s*\(/.test(stripComments(optimiste))).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un message court mais informatif, un objet nommé, une route réelle', () => {
    // #2116.41 — deux mots suffisent quand ils DISENT : la règle porte sur les
    // formules creuses, pas sur la longueur.
    expect(isBareDone('PDF téléchargé')).toBe(false)
    expect(isBareDone('PDF downloaded')).toBe(false)
    // Et une phrase qui COMMENCE par une formule bannie sans s'y réduire.
    expect(isBareDone('C’est fait. {{company}} est dans ton portefeuille.')).toBe(false)
    expect(isBareDone('Done. {{company}} is in your portfolio.')).toBe(false)

    // #2116.40 — les deux formes admises pour nommer l'objet.
    expect(namesItsObject('{{company}} est écarté.')).toBe(true)
    expect(namesItsObject('Voir <a href="/accounts/1">le dossier</a>.')).toBe(true)

    // #2116.39 — les deux formes admises pour porter l'objet, y compris la
    // recherche PRÉ-REMPLIE : l'objet voyage, l'écran n'est pas générique.
    expect(carriesObject('/accounts/$id/brief')).toBe(true)
    expect(carriesObject('/accounts/:id/brief')).toBe(true)
    expect(carriesObject('/search?accountId&company')).toBe(true)

    // #2116.38 — les deux formes sous lesquelles l'arbre déclare une page
    // d'index.
    const routes = declaredRoutes()
    expect(routes.has('/search') || routes.has('/search/')).toBe(true)

    // #2116.43 — le témoin légitime : les hooks de mutation, eux, annoncent le
    // succès, et c'est leur rôle. Ils sont hors de la couche des boutons.
    const hook = stripComments(readFileSync(join(SRC, 'features/accounts/gate/useAccountGate.ts'), 'utf8'))
    expect(/\btoast\s*\.\s*success\s*\(/.test(hook)).toBe(true)
    expect(DOSSIER_CTA_SCOPE_FILES.includes('features/accounts/gate/useAccountGate.ts' as never)).toBe(false)
    // Et un `toast.success` CITÉ dans un commentaire ne compte pour personne.
    expect(/\btoast\s*\.\s*success\s*\(/.test(stripComments("// toast.success('x')\nconst a = 1"))).toBe(false)
  })
})
