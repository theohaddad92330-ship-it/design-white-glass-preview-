import { describe, expect, it } from 'vitest'
import {
  DOSSIER_CTA_CONTRACTS,
  DOSSIER_CTA_DUPLICATE_EXCEPTIONS,
  dossierHeroStateValues,
  type DossierHeroState,
  DOSSIER_CTA_GENERIC_DESTINATION_EXCEPTIONS,
  DOSSIER_CTA_IDS,
  DOSSIER_CTA_SCOPE_FILES,
  dossierCta,
  dossierCtaEffectValues,
  dossierCtaObjectValues,
  dossierCtaPermissionValues,
  dossierCtaSectionValues,
} from './cta-contract.js'

/**
 * #2116.28-37 — le registre des boutons du dossier répond, pour chacun, aux
 * neuf questions du retour. Ce fichier garde la FORME du registre ; la garde
 * d'architecture web (`dossier-cta-contract.test.ts`) garde le CÂBLAGE.
 */
describe('contrat de bouton du dossier', () => {
  it('LIT un registre non vide — sinon aucune des règles ci-dessous ne dit rien', () => {
    expect(DOSSIER_CTA_CONTRACTS.length).toBeGreaterThanOrEqual(14)
    expect(DOSSIER_CTA_SCOPE_FILES.length).toBeGreaterThanOrEqual(4)
  })

  it('les identifiants sont uniques', () => {
    const seen = new Map<string, number>()
    for (const cta of DOSSIER_CTA_CONTRACTS) seen.set(cta.id, (seen.get(cta.id) ?? 0) + 1)
    const doubles = [...seen].filter(([, count]) => count > 1).map(([id]) => id)
    expect(doubles, `identifiants en double : ${doubles.join(', ')}`).toEqual([])
    expect(DOSSIER_CTA_IDS).toHaveLength(DOSSIER_CTA_CONTRACTS.length)
  })

  it('chaque entrée a une destination vérifiable — #2116.30', () => {
    const muettes = DOSSIER_CTA_CONTRACTS.filter(cta => cta.destination.trim().length === 0).map(cta => cta.id)
    expect(muettes, `sans destination : ${muettes.join(', ')}`).toEqual([])
    // Une destination est une route, une requête, ou la surface ouverte — jamais
    // un libellé. Les quatre formes admises se reconnaissent à leur préfixe.
    const informes = DOSSIER_CTA_CONTRACTS.filter(
      cta =>
        !/^(\/|GET |POST |PATCH |PUT |DELETE |dialog:|sheet:|menu:|popover:|field:|download:)/.test(cta.destination),
    ).map(cta => cta.id)
    expect(informes, `destination informe : ${informes.join(', ')}`).toEqual([])
  })

  it('chaque entrée nomme son effet, son objet, sa section et sa permission — #2116.28, .29, .31', () => {
    for (const cta of DOSSIER_CTA_CONTRACTS) {
      expect(dossierCtaEffectValues, cta.id).toContain(cta.effect)
      expect(dossierCtaObjectValues, cta.id).toContain(cta.object)
      expect(dossierCtaSectionValues, cta.id).toContain(cta.section)
      expect(dossierCtaPermissionValues, cta.id).toContain(cta.permission)
      expect(typeof cta.confirmation, cta.id).toBe('boolean')
    }
  })

  it('une écriture serveur porte succès, échec ET preuve — #2116.35, .36, .37', () => {
    const incomplets = DOSSIER_CTA_CONTRACTS.filter(
      cta => cta.effect === 'mutate' && (!cta.successStateKey || !cta.failureStateKey || !cta.proofKey),
    ).map(cta => cta.id)
    expect(incomplets, `mutation sans état de succès / d'échec / de preuve : ${incomplets.join(', ')}`).toEqual([])
  })

  it("un déplacement ne s'annonce pas par un message — la surface atteinte EST le succès", () => {
    // Le pendant de la règle précédente : sans lui, le registre se remplirait de
    // quarante messages jamais lus, la version « non mesuré rendu 0 » d'un contrat.
    const bavards = DOSSIER_CTA_CONTRACTS.filter(
      cta => ['navigate', 'open-dialog', 'open-menu', 'dismiss'].includes(cta.effect) && cta.successStateKey !== null,
    ).map(cta => cta.id)
    expect(bavards, `succès annoncé pour un geste qui n'écrit rien : ${bavards.join(', ')}`).toEqual([])
  })

  it('les textes sont des CLÉS i18n, jamais du français — un libellé dans un contrat est français pour toujours', () => {
    const keys = DOSSIER_CTA_CONTRACTS.flatMap(cta =>
      [cta.expectedResultKey, cta.successStateKey, cta.failureStateKey, cta.proofKey]
        .filter((key): key is string => key !== null)
        .map(key => ({ id: cta.id, key })),
    )
    expect(keys.length).toBeGreaterThan(20)
    const fautives = keys
      .filter(({ key }) => !/^[a-z][a-zA-Z0-9]*:[A-Za-z0-9_.]+$/.test(key) || /[À-ÿ ]/.test(key))
      .map(({ id, key }) => `${id} → ${key}`)
    expect(fautives, `texte au lieu d'une clé : ${fautives.join(', ')}`).toEqual([])
  })

  it("chaque bouton dit ce qu'il va produire — #2116.34", () => {
    const muets = DOSSIER_CTA_CONTRACTS.filter(cta => !cta.expectedResultKey).map(cta => cta.id)
    expect(muets, `sans résultat attendu : ${muets.join(', ')}`).toEqual([])
  })

  it('`dossierCta` rend le contrat demandé, et rien pour un identifiant inconnu', () => {
    expect(dossierCta('dossier.gate.prioritise')?.effect).toBe('mutate')
    expect(dossierCta('dossier.analysis.relaunch')?.effect).toBe('navigate')
    // Le piège que ce registre existe pour rendre lisible : le libellé promet
    // une actualisation, le code ouvre la recherche pré-remplie.
    expect(dossierCta('dossier.analysis.relaunch')?.destination).toContain('/search')
    expect(dossierCta('bouton.qui.nexiste.pas')).toBeUndefined()
  })

  it('sait dire NON — une entrée fabriquée sans preuve est attrapée par la règle des mutations', () => {
    const fautif = {
      id: 'dossier.faux',
      section: 'hero' as const,
      effect: 'mutate' as const,
      object: 'account' as const,
      destination: 'POST /accounts/:id/faux',
      permission: 'none' as const,
      confirmation: false,
      expectedResultKey: 'accounts:cta.faux.expected',
      successStateKey: 'accounts:cta.faux.success',
      failureStateKey: 'accounts:cta.faux.failure',
      proofKey: null,
    }
    const incomplet =
      fautif.effect === 'mutate' && (!fautif.successStateKey || !fautif.failureStateKey || !fautif.proofKey)
    expect(incomplet).toBe(true)
  })
})

/**
 * #2116.38 à .43 et .48 à .53 — LES INTERDITS.
 *
 * Le lot précédent a posé les neuf RÉPONSES que chaque bouton doit porter.
 * Celui-ci pose ce qu'aucune réponse n'a le droit de dire. Ce fichier tient
 * les interdits qui se lisent dans le REGISTRE SEUL (une action principale
 * rangée sous « … », deux sections qui proposent le même geste, une sortie
 * vers un tiers sans confirmation, une exception déclarée sans raison) ; ceux
 * qui demandent de lire l'arbre de routes, les traductions ou le code web
 * vivent dans `apps/web/src/architecture/dossier-cta-interdits.test.ts`, et
 * le comportement au clic dans
 * `apps/web/src/features/accounts/view/account-detail/cta/dossier-cta-outcome.test.tsx`.
 *
 * Chaque règle est écrite comme une FONCTION PURE sur un registre quelconque :
 * c'est ce qui permet de lui montrer un registre fabriqué et de vérifier
 * qu'elle sait dire NON, sans casser le vrai registre puis le restaurer.
 */

type AnyCta = (typeof DOSSIER_CTA_CONTRACTS)[number]

/** #2116.42 — les entrées principales rangées sous « … ». */
function hiddenPrimaries(registry: readonly AnyCta[]): string[] {
  return registry.filter(cta => cta.primary === true && cta.section === 'more-actions').map(cta => cta.id)
}

/**
 * #2116.42 — les gestes principaux du hero, comptés en GESTES RENDUS. Il en
 * faut UN.
 *
 * #2117.25-29 — les entrées qui déclarent un `state` sont mutuellement
 * exclusives par construction (`heroPrimaryAction`, côté web, en choisit
 * exactement une) : elles ne sont jamais rendues ensemble, donc elles comptent
 * pour un seul geste. Les compter une par une ferait dire à la règle « cinq
 * boutons se disputent le même regard » là où l'écran n'en montre qu'un — une
 * garde doit protéger la règle, pas la forme du code qui la tient.
 */
function heroPrimaries(registry: readonly AnyCta[]): string[] {
  const hero = registry.filter(cta => cta.primary === true && cta.section === 'hero')
  const sansEtat = hero.filter(cta => cta.state === undefined).map(cta => cta.id)
  const parEtat = hero.filter(cta => cta.state !== undefined)
  return parEtat.length > 0
    ? [
        ...sansEtat,
        parEtat
          .map(cta => cta.id)
          .sort()
          .join(' | '),
      ]
    : sansEtat
}

/** #2117.25-29 — les états du hero déclarés plus d'une fois. */
function duplicateHeroStates(registry: readonly AnyCta[]): string[] {
  const seen = new Map<string, number>()
  for (const cta of registry) {
    if (cta.state === undefined) continue
    seen.set(cta.state, (seen.get(cta.state) ?? 0) + 1)
  }
  return [...seen].filter(([, count]) => count > 1).map(([state]) => state)
}

/** #2117.25-29 — les états qu'aucune entrée ne couvre. */
function uncoveredHeroStates(registry: readonly AnyCta[]): string[] {
  const declares = new Set(registry.map(cta => cta.state).filter((s): s is DossierHeroState => s !== undefined))
  return dossierHeroStateValues.filter(state => !declares.has(state))
}

/** #2116.50 — la même action (effet, objet, destination) dans deux sections. */
function crossSectionDuplicates(registry: readonly AnyCta[]): { ids: string[]; key: string }[] {
  const byAction = new Map<string, AnyCta[]>()
  for (const cta of registry) {
    const key = `${cta.effect}|${cta.object}|${cta.destination}`
    byAction.set(key, [...(byAction.get(key) ?? []), cta])
  }
  return [...byAction]
    .filter(([, group]) => new Set(group.map(cta => cta.section)).size > 1)
    .map(([key, group]) => ({ key, ids: group.map(cta => cta.id).sort() }))
}

/** #2116.52 — une sortie vers un tiers qui ne passe par aucune confirmation. */
function unconfirmedExternals(registry: readonly AnyCta[]): string[] {
  return registry.filter(cta => cta.external === true && cta.confirmation !== true).map(cta => cta.id)
}

/** #2116.52 — les objets où la question se POSE, donc où le silence est refusé. */
const OUTBOUND_OBJECTS = ['share-link', 'export'] as const
function silentOnExternal(registry: readonly AnyCta[]): string[] {
  return registry
    .filter(cta => (OUTBOUND_OBJECTS as readonly string[]).includes(cta.object) && typeof cta.external !== 'boolean')
    .map(cta => cta.id)
}

describe('les interdits du contrat de bouton du dossier', () => {
  it('LIT un registre entier — #2116.48, le registre EST l’inventaire', () => {
    // Seize boutons au 14/09/2026. Le nombre n'est pas figé (élargir la portée
    // en ajoute), mais un registre qui RÉTRÉCIT est un bouton qu'on a cessé de
    // décrire sans cesser de le rendre : les onze règles ci-dessous n'auraient
    // alors plus rien à lire.
    expect(DOSSIER_CTA_CONTRACTS.length).toBeGreaterThanOrEqual(16)
    // Et l'inventaire porte les quatre familles d'effet du dossier : sans
    // navigation, sans mutation, sans ouverture, chaque règle serait vide.
    const effects = new Set(DOSSIER_CTA_CONTRACTS.map(cta => cta.effect))
    for (const effect of ['navigate', 'mutate', 'prepare', 'open-dialog', 'open-menu', 'dismiss']) {
      expect(effects, `aucune entrée d’effet ${effect}`).toContain(effect)
    }
    expect(DOSSIER_CTA_CONTRACTS.filter(cta => cta.effect === 'mutate').length).toBeGreaterThanOrEqual(4)
  })

  it('#2116.38, .49 — chaque entrée nomme le fichier qui l’implémente', () => {
    // La forme ici ; l'EXISTENCE sur le disque est vérifiée côté web, seul
    // endroit d'où `apps/web/src` se lit sans traverser le dépôt à l'aveugle.
    const informes = DOSSIER_CTA_CONTRACTS.filter(
      cta => !/^[a-zA-Z0-9$_@/.-]+\.(ts|tsx)$/.test(cta.wiredBy) || cta.wiredBy.startsWith('/'),
    ).map(cta => `${cta.id} → ${cta.wiredBy}`)
    expect(informes, `fichier d’implémentation informe : ${informes.join(', ')}`).toEqual([])
  })

  it('#2116.42 — aucune action PRINCIPALE cachée sous « … », et un seul geste principal au hero', () => {
    const principales = DOSSIER_CTA_CONTRACTS.filter(cta => cta.primary === true).map(cta => cta.id)
    // Antériorité #1816 (Louis, 10/09/2026) : Brief / Aperçu PDF / Partager /
    // Exporter sont SECONDAIRES sous « … ». Cette garde encode cet état, elle
    // ne le renverse pas — deux gestes principaux, et deux seulement.
    expect(principales.length, 'aucun geste principal déclaré').toBeGreaterThanOrEqual(2)
    expect(hiddenPrimaries(DOSSIER_CTA_CONTRACTS)).toEqual([])
    expect(heroPrimaries(DOSSIER_CTA_CONTRACTS)).toHaveLength(1)
    // Et un geste principal vit forcément à un niveau qui se voit sans ouvrir
    // de menu : le hero ou la porte de priorisation.
    const enfouies = DOSSIER_CTA_CONTRACTS.filter(
      cta => cta.primary === true && cta.section !== 'hero' && cta.section !== 'gate',
    ).map(cta => cta.id)
    expect(enfouies, `geste principal hors du premier niveau : ${enfouies.join(', ')}`).toEqual([])
  })

  it('#2116.42 — sait dire NON : une action principale rangée sous « … », et deux au hero', () => {
    const cache = DOSSIER_CTA_CONTRACTS.map(cta =>
      cta.id === 'dossier.share.open' ? { ...cta, primary: true as const } : cta,
    )
    expect(hiddenPrimaries(cache)).toEqual(['dossier.share.open'])

    const deuxAuHero = DOSSIER_CTA_CONTRACTS.map(cta =>
      cta.id === 'dossier.moreActions.open' ? { ...cta, section: 'hero' as const, primary: true as const } : cta,
    )
    expect(heroPrimaries(deuxAuHero)).toHaveLength(2)
  })

  it('#2116.42 — n’attrape pas ce qu’elle ne vise pas : une entrée secondaire sous « … » passe', () => {
    // Les cinq témoins sont les vraies entrées du menu : aucune n'est
    // principale, et la règle n'en signale aucune.
    const sousLeMenu = DOSSIER_CTA_CONTRACTS.filter(cta => cta.section === 'more-actions')
    expect(sousLeMenu.length).toBeGreaterThanOrEqual(5)
    expect(hiddenPrimaries(sousLeMenu)).toEqual([])
  })

  it('#2117.25-29 — les CINQ états du hero sont couverts, chacun exactement une fois', () => {
    // La règle que le retour #2117 demande : « le hero affiche l'action
    // principale à effectuer ». Un état sans entrée est un dossier à qui le
    // produit n'a rien à dire ; un état avec deux entrées est un choix que
    // personne n'a tranché.
    expect(dossierHeroStateValues.length).toBe(5)
    expect(uncoveredHeroStates(DOSSIER_CTA_CONTRACTS), 'état sans geste principal').toEqual([])
    expect(duplicateHeroStates(DOSSIER_CTA_CONTRACTS), 'état réclamé par deux entrées').toEqual([])
    // Et chaque entrée qui porte un état est bien un geste PRINCIPAL du hero :
    // un état déclaré sur un bouton secondaire ne choisirait rien.
    const mal = DOSSIER_CTA_CONTRACTS.filter(
      cta => cta.state !== undefined && (cta.section !== 'hero' || cta.primary !== true),
    ).map(cta => cta.id)
    expect(mal, `état déclaré hors du geste principal du hero : ${mal.join(', ')}`).toEqual([])
  })

  it('#2117.25-29 — sait dire NON : un état réclamé deux fois, et un état orphelin', () => {
    const deuxFois = DOSSIER_CTA_CONTRACTS.map(cta =>
      cta.id === 'dossier.hero.preparePlan' ? { ...cta, state: 'plan-active' as const } : cta,
    )
    expect(duplicateHeroStates(deuxFois)).toEqual(['plan-active'])
    expect(uncoveredHeroStates(deuxFois)).toEqual(['no-plan'])

    const sansEtat = DOSSIER_CTA_CONTRACTS.filter(cta => cta.id !== 'dossier.hero.seeChanges')
    expect(uncoveredHeroStates(sansEtat)).toEqual(['watching'])
  })

  it('#2117.25-29 — n’attrape pas ce qu’elle ne vise pas : cinq entrées à ÉTAT comptent pour UN geste principal', () => {
    // Les cinq gestes par état ne sont jamais rendus ensemble : la règle
    // « un seul geste principal au hero » doit rester verte avec eux…
    const parEtat = DOSSIER_CTA_CONTRACTS.filter(cta => cta.state !== undefined)
    expect(parEtat.length).toBe(5)
    expect(heroPrimaries(DOSSIER_CTA_CONTRACTS)).toHaveLength(1)
    // … et rougir dès qu'un SIXIÈME bouton principal, lui, s'afficherait en
    // même temps qu'eux — c'est-à-dire sans état.
    const enPlus = [
      ...DOSSIER_CTA_CONTRACTS,
      {
        ...DOSSIER_CTA_CONTRACTS.find(cta => cta.id === 'dossier.hero.askLaura')!,
        id: 'dossier.faux',
        primary: true as const,
      },
    ]
    expect(heroPrimaries(enPlus)).toHaveLength(2)
  })

  it('#2116.50 — aucun doublon d’action entre deux sections, hors exception NOMMÉE', () => {
    const declares = new Set(DOSSIER_CTA_DUPLICATE_EXCEPTIONS.map(exception => [...exception.ids].sort().join('|')))
    const nonDeclares = crossSectionDuplicates(DOSSIER_CTA_CONTRACTS).filter(
      duplicate => !declares.has(duplicate.ids.join('|')),
    )
    expect(
      nonDeclares.map(duplicate => `${duplicate.ids.join(' = ')} (${duplicate.key})`),
      'même action proposée par deux sections, sans raison écrite',
    ).toEqual([])
  })

  it('#2116.50 — une exception nomme des entrées RÉELLES et porte sa raison', () => {
    expect(DOSSIER_CTA_DUPLICATE_EXCEPTIONS.length).toBeGreaterThanOrEqual(1)
    for (const exception of DOSSIER_CTA_DUPLICATE_EXCEPTIONS) {
      for (const id of exception.ids) expect(DOSSIER_CTA_IDS, `exception fantôme : ${id}`).toContain(id)
      // Une raison d'une ligne ne se relit pas dans six mois. Celle-ci doit
      // dire ce qui est en double ET pourquoi on ne l'a pas tranché.
      expect(exception.reason.length, `raison trop courte : ${exception.ids.join(' = ')}`).toBeGreaterThan(80)
      // Et l'exception doit désigner un doublon RÉEL — parquer une paire qui
      // n'en est pas une rendrait la liste inutile.
      const reel = crossSectionDuplicates(DOSSIER_CTA_CONTRACTS).some(
        duplicate => duplicate.ids.join('|') === [...exception.ids].sort().join('|'),
      )
      expect(reel, `exception sans doublon : ${exception.ids.join(' = ')}`).toBe(true)
    }
  })

  it('#2116.50 — sait dire NON : un doublon fabriqué entre deux sections', () => {
    const fabrique = [
      ...DOSSIER_CTA_CONTRACTS,
      {
        ...DOSSIER_CTA_CONTRACTS.find(cta => cta.id === 'dossier.share.open')!,
        id: 'dossier.faux.share',
        section: 'hero' as const,
      },
    ]
    const ids = crossSectionDuplicates(fabrique).map(duplicate => duplicate.ids.join('|'))
    expect(ids).toContain(['dossier.faux.share', 'dossier.share.open'].sort().join('|'))
  })

  it('#2116.50 — n’attrape pas ce qu’elle ne vise pas : même effet et même objet, destination différente', () => {
    // `prioritise` et `reopen` sont deux mutations sur le même objet, dans la
    // même section, vers deux requêtes différentes. Rien n'est en double.
    const temoins = DOSSIER_CTA_CONTRACTS.filter(cta =>
      ['dossier.gate.prioritise', 'dossier.gate.reopen'].includes(cta.id),
    )
    expect(temoins).toHaveLength(2)
    expect(crossSectionDuplicates(temoins)).toEqual([])

    // Et deux sections différentes, même effet et même objet, destinations
    // distinctes : toujours pas un doublon.
    const voisins = [
      { ...temoins[0], section: 'hero' as const },
      { ...temoins[1], section: 'more-actions' as const },
    ]
    expect(crossSectionDuplicates(voisins)).toEqual([])
  })

  it('#2116.52 — aucune action EXTERNE sans validation, et la question est posée partout où elle se pose', () => {
    expect(unconfirmedExternals(DOSSIER_CTA_CONTRACTS)).toEqual([])
    // Le corpus de cette règle n'est pas vide : deux entrées touchent à une
    // sortie (le partage, l'export) et doivent répondre par OUI ou par NON —
    // jamais par le silence, qui est la seule réponse inacceptable.
    const concernees = DOSSIER_CTA_CONTRACTS.filter(cta => (OUTBOUND_OBJECTS as readonly string[]).includes(cta.object))
    expect(concernees.length).toBeGreaterThanOrEqual(3)
    expect(silentOnExternal(DOSSIER_CTA_CONTRACTS)).toEqual([])
  })

  it('#2116.52 — sait dire NON : une sortie déclarée sans confirmation, et une question laissée muette', () => {
    const sortieMuette = DOSSIER_CTA_CONTRACTS.map(cta =>
      cta.id === 'dossier.share.open' ? { ...cta, external: true } : cta,
    )
    expect(unconfirmedExternals(sortieMuette)).toEqual(['dossier.share.open'])

    const silencieuse = DOSSIER_CTA_CONTRACTS.map(cta =>
      cta.id === 'dossier.pdf.export' ? { ...cta, external: undefined } : cta,
    )
    expect(silentOnExternal(silencieuse)).toEqual(['dossier.pdf.export'])
  })

  it('#2116.52 — n’attrape pas ce qu’elle ne vise pas : une confirmation SANS sortie, et un geste intérieur', () => {
    // `park.confirm` confirme (un motif se saisit) sans rien faire sortir : la
    // règle ne le réclame pas comme externe.
    const parkConfirm = DOSSIER_CTA_CONTRACTS.find(cta => cta.id === 'dossier.gate.park.confirm')!
    expect(parkConfirm.confirmation).toBe(true)
    expect(parkConfirm.external).toBeUndefined()
    expect(silentOnExternal([parkConfirm])).toEqual([])
    expect(unconfirmedExternals([parkConfirm])).toEqual([])
  })

  it('#2116.39 — une exception de destination générique nomme une entrée réelle et sa raison', () => {
    // Vide au 14/09/2026 : les deux navigations du dossier portent l'objet
    // (`/accounts/$id/brief`, `/search?accountId&company`). La règle qui LIT
    // vraiment quelque chose est côté web, sur l'arbre de routes ; celle-ci
    // empêche seulement qu'on parque ici une exception sans raison.
    for (const exception of DOSSIER_CTA_GENERIC_DESTINATION_EXCEPTIONS) {
      expect(DOSSIER_CTA_IDS, `exception fantôme : ${exception.id}`).toContain(exception.id)
      expect(exception.reason.length, `raison trop courte : ${exception.id}`).toBeGreaterThan(80)
    }
  })
})
