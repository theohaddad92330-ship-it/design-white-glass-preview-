import { afterEach, describe, expect, it, vi } from 'vitest'
import { revealTarget, revealTargetProps } from './reveal-target'

/**
 * « Une réponse juste, calculée, sans chemin depuis l'endroit où la question se
 * pose. »
 *
 * Le geste gardé ici est celui du tableau de bord (#1095, #1096) : un chiffre
 * affiché en haut MÈNE à ce qu'il compte. Il vivait à l'intérieur de la bande
 * d'indicateurs du cockpit ; le pilotage en avait besoin à son tour (#1128), et
 * un second mécanisme aurait divergé du premier à la première correction.
 *
 * Ce que ces tests figent, ce sont les trois décisions que le geste porte et
 * qu'une réécriture perdrait :
 *
 * 1. **La cible reçoit le FOCUS**, pas seulement le défilement — sans quoi la
 *    tabulation repart du haut de la page et un lecteur d'écran ne dit rien.
 * 2. **Une cible absente n'est pas une erreur** : l'appelant l'apprend et peut
 *    essayer la suivante. Un compteur ne doit jamais casser l'écran qu'il orne.
 * 3. **La préférence « moins de mouvement » se lit au CLIC** : elle peut changer
 *    entre le rendu et le geste.
 */
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** Une destination, telle que `revealTargetProps` la déclare. */
function plantTarget(id: string): HTMLElement {
  const node = document.createElement('div')
  node.id = id
  node.tabIndex = -1
  document.body.appendChild(node)
  return node
}

describe('revealTarget — le chemin depuis le chiffre vers ce qu’il compte', () => {
  it('amène la destination à l’écran ET lui donne le focus', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    const target = plantTarget('maillon-conversion')

    expect(revealTarget('maillon-conversion')).toBe(true)

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(document.activeElement).toBe(target)
  })

  it('ne casse rien quand la destination n’est pas là, et le DIT', () => {
    // Un repli, un chargement, une carte repliée : la destination peut
    // légitimement manquer. Le bouton reste inerte pour ce clic-là ; il ne jette
    // pas l'écran.
    expect(revealTarget('maillon-absent')).toBe(false)
  })

  it('lit « moins de mouvement » au clic, pas au rendu', () => {
    plantTarget('maillon-conversion')
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query })),
    )

    revealTarget('maillon-conversion')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    vi.unstubAllGlobals()
  })
})

describe('revealTargetProps — ce qui fait d’un bloc une destination', () => {
  it('se focalise par le code sans entrer dans l’ordre de tabulation', () => {
    // `-1` et non `0` : la carte n'est pas un contrôle, elle est un endroit où
    // l'on arrive. L'insérer dans la tabulation ajouterait huit arrêts qui ne
    // font rien.
    expect(revealTargetProps('maillon-conversion')).toEqual({ id: 'maillon-conversion', tabIndex: -1 })
  })

  it('déclare l’identifiant que `revealTarget` ira chercher', () => {
    // Les deux bouts du chemin viennent du MÊME module : une clé recopiée à la
    // main d'un côté se serait décalée de l'autre sans que rien ne rougisse.
    const { id } = revealTargetProps('maillon-economie')
    plantTarget(id)
    expect(revealTarget('maillon-economie')).toBe(true)
  })
})

// Théo D pilotage.A1 — « La chaîne » est repliée : un chiffre qui y mène doit l'ouvrir.
describe('revealTarget — repli', () => {
  it('ouvre les <details> fermés qui contiennent la destination', () => {
    const details = document.createElement('details')
    const inner = document.createElement('details')
    details.append(inner)
    document.body.append(details)
    const node = document.createElement('div')
    node.id = 'dans-un-repli'
    inner.append(node)
    node.scrollIntoView = vi.fn()
    expect(revealTarget('dans-un-repli')).toBe(true)
    expect(details.open).toBe(true)
    expect(inner.open).toBe(true)
  })
})
