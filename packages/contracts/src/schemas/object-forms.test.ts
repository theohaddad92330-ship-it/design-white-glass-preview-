import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_FORM_CONTENTS,
  BUSINESS_OBJECT_FORMS,
  FORM_PRESENCE_SYMBOL,
  OBJECT_FORMS,
  OBJECT_FORM_KEYS,
  businessObjectFormsSchema,
  missingRequiredForms,
  objectFormSchema,
  objectsWithWrittenDossierRefusal,
  objectsWithoutDossier,
  unmeasuredObjects,
} from './object-forms.js'

/**
 * GA-74 — la matrice objet × forme ne peut pas devenir une brochure.
 *
 * ⚠️ Le dépôt est monté à GA-67 le 29/08/2026 et plusieurs agents écrivent en
 * parallèle : une collision de numéro reste possible et se règle par un
 * renommage, pas par une discussion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `T7.md:508-566` porte 119 cellules déjà arbitrées, et aucun tracker ne les
 * nommait — `ARCHIVE-01.md:149` les range parmi les « blocs comptés pour un ».
 * Les remettre dans un fichier ne suffit pas : un registre non gardé devient
 * une liste de bonnes intentions en trois semaines, et celui-ci est
 * particulièrement exposé, parce qu'il est facile de le rendre tout vert en
 * effaçant une mesure gênante.
 *
 * Ces tests ne vérifient donc PAS qu'une forme est bien rendue — seule une
 * relecture d'écran le peut, et une garde qui prétendrait lire une forme dans
 * du JSX serait exactement la garde borgne que `placement-laws.test.ts`
 * refuse d'écrire pour la loi 3. Ils vérifient trois choses qu'une machine sait
 * faire honnêtement :
 *   1. la table est COMPLÈTE et n'a pas bougé depuis la source (les comptes) ;
 *   2. chaque fichier cité comme porteur EXISTE sur le disque ;
 *   3. le registre ne peut pas mentir par OMISSION — le non-mesuré est compté,
 *      et un état `delivered` sans appelant est refusé.
 */

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('GA-74 — la table de T7 §5.1, recopiée sans perte', () => {
  it('porte les sept formes de §5.2, dans l’ordre de la source', () => {
    expect(OBJECT_FORMS).toHaveLength(7)
    expect(OBJECT_FORMS.map(form => form.key)).toEqual([...OBJECT_FORM_KEYS])
  })

  it('chaque forme répond à une question DIFFÉRENTE — deux formes qui répondent à la même sont la même', () => {
    // C'est la définition même d'une forme dans le tome : ce n'est pas une
    // taille, c'est une question. Deux questions identiques feraient de la
    // matrice une échelle de densité, ce qu'elle n'est pas.
    const questions = OBJECT_FORMS.map(form => form.question)
    expect(new Set(questions).size).toBe(7)
  })

  it('porte les dix-sept objets, sans doublon', () => {
    expect(BUSINESS_OBJECT_FORMS).toHaveLength(17)
    expect(new Set(BUSINESS_OBJECT_FORMS.map(object => object.key)).size).toBe(17)
  })

  it('décrit les 119 cellules — dix-sept objets × sept formes, aucune manquante', () => {
    for (const object of BUSINESS_OBJECT_FORMS) {
      expect(Object.keys(object.spec).sort()).toEqual([...OBJECT_FORM_KEYS].sort())
    }
    const cells = BUSINESS_OBJECT_FORMS.reduce((total, object) => total + Object.keys(object.spec).length, 0)
    expect(cells).toBe(119)
  })

  it('chaque entrée respecte son contrat', () => {
    for (const form of OBJECT_FORMS) expect(objectFormSchema.safeParse(form).success).toBe(true)
    for (const object of BUSINESS_OBJECT_FORMS) {
      expect(businessObjectFormsSchema.safeParse(object).success).toBe(true)
    }
  })

  it('compte 67 ● · 15 ○ · 37 — , les totaux relevés sur T7.md:528-545', () => {
    // Le verrou de recopie. Les trois nombres ont été comptés MÉCANIQUEMENT sur
    // la source le 29/08/2026 (`grep -o` sur le bloc de la table), pas à l'œil.
    // Toute cellule retournée par mégarde déplace un des trois et fait échouer
    // la CI — c'est la seule façon de garder une recopie honnête dans le temps.
    const tally = { required: 0, optional: 0, never: 0 }
    for (const object of BUSINESS_OBJECT_FORMS) {
      for (const key of OBJECT_FORM_KEYS) tally[object.spec[key]!] += 1
    }
    expect(tally).toEqual({ required: 67, optional: 15, never: 37 })
    expect(tally.required + tally.optional + tally.never).toBe(119)
  })

  it('garde les trois symboles de la source, pour que la table se relise sans traduction', () => {
    expect(FORM_PRESENCE_SYMBOL).toEqual({ required: '●', optional: '○', never: '—' })
  })
})

describe('GA-74 — les objets sans dossier : la source dit trois, sa table en marque sept', () => {
  it('SEPT objets ont F6 = — dans la table de §5.1', () => {
    // Relevé mécaniquement le 29/08/2026 en extrayant la 8ᵉ colonne de
    // `T7.md:528-545`. §5.2 titre « les trois objets qui n'ont pas de dossier »
    // et `ARCHIVE-01.md:55` le recopie tel quel — les deux comptent trois là où
    // la table en marque sept.
    expect(objectsWithoutDossier().map(object => object.key)).toEqual([
      'positionnement',
      'releve_activite',
      'preuve',
      'rex',
      'signal',
      'action_preparee',
      'intervention',
    ])
  })

  it('TROIS seulement portent une raison écrite — ce sont ceux que §5.2 nomme', () => {
    expect(objectsWithWrittenDossierRefusal().map(object => object.key)).toEqual([
      'positionnement',
      'releve_activite',
      'preuve',
    ])
  })

  it('les quatre autres n’ont PAS de raison inventée — un arbitrage deviné se re-propose', () => {
    // REX, signal, action préparée et intervention sont marqués `—` sans que la
    // source dise pourquoi. Leur écrire une raison plausible ferait passer une
    // déduction pour un arbitrage, ce que `doctrine-registry` combat déjà.
    const silent = objectsWithoutDossier().filter(object => object.noDossierReason === null)
    expect(silent.map(object => object.key)).toEqual(['rex', 'signal', 'action_preparee', 'intervention'])
  })

  it('une raison de refus n’est JAMAIS écrite sur un objet qui a droit à un dossier', () => {
    const contradictory = BUSINESS_OBJECT_FORMS.filter(
      object => object.spec.f6_dossier !== 'never' && object.noDossierReason !== null,
    )
    expect(contradictory.map(object => object.key)).toEqual([])
  })
})

describe('GA-74 — le cas du compte : cinq formes, cinq contenus (§5.3)', () => {
  it('décrit exactement les cinq formes que §5.3 détaille', () => {
    expect(ACCOUNT_FORM_CONTENTS.map(entry => entry.form)).toEqual([
      'f1_mention',
      'f2_liste',
      'f4_decouverte',
      'f5_panneau',
      'f6_dossier',
    ])
  })

  it('aucun de ces cinq contenus n’est identique à un autre — c’est la démonstration de la loi 4', () => {
    const contents = ACCOUNT_FORM_CONTENTS.map(entry => entry.content)
    expect(new Set(contents).size).toBe(ACCOUNT_FORM_CONTENTS.length)
  })

  it('les cinq formes détaillées sont toutes DEMANDÉES au compte par la table', () => {
    const account = BUSINESS_OBJECT_FORMS.find(object => object.key === 'compte')
    expect(account).toBeDefined()
    for (const entry of ACCOUNT_FORM_CONTENTS) {
      expect(account!.spec[entry.form]).toBe('required')
    }
  })
})

describe('GA-74 — les porteurs existent sur le disque', () => {
  it('chaque fichier cité par une mesure est ouvrable depuis la racine', () => {
    // L'accident du 24/08 : un contrat citait une garde qui n'avait jamais été
    // écrite. Ici, une forme déclarée `delivered` avec un porteur renommé ferait
    // croire qu'elle est livrée alors que l'écran a disparu.
    const declared = BUSINESS_OBJECT_FORMS.flatMap(object =>
      object.measured === null ? [] : Object.values(object.measured).flatMap(measured => measured.holders),
    )
    const missing = declared.filter(path => !existsSync(join(REPO_ROOT, path)))
    expect([...new Set(missing)]).toEqual([])
  })

  it('la garde LIT un corpus non vide — sinon elle est verte sur du rien', () => {
    // Une garde qui n'ouvre aucun fichier passe au vert quoi qu'il arrive. Le
    // dépôt a produit six gardes borgnes en deux jours ; celle-ci doit prouver
    // qu'elle a quelque chose à ouvrir.
    const declared = BUSINESS_OBJECT_FORMS.flatMap(object =>
      object.measured === null ? [] : Object.values(object.measured).flatMap(measured => measured.holders),
    )
    expect(declared.length).toBeGreaterThan(10)
  })

  it('la garde sait dire NON — un chemin inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/features/accounts/view/CeFichierNExistePas.tsx'))).toBe(false)
  })
})

describe('GA-74 — une mesure ne peut pas mentir', () => {
  it('une forme LIVRÉE cite au moins un porteur ET l’écran qui la rend', () => {
    // « Livrée » sans appelant est le défaut n°1 de ce dépôt : du code juste,
    // testé, que personne n'appelle. La forme n'existe pas pour l'utilisateur.
    const offenders: string[] = []
    for (const object of BUSINESS_OBJECT_FORMS) {
      if (object.measured === null) continue
      for (const [form, measured] of Object.entries(object.measured)) {
        if (measured.state !== 'delivered') continue
        if (measured.holders.length === 0) offenders.push(`${object.key}.${form} — livrée sans porteur`)
        if (measured.renderedBy === null) offenders.push(`${object.key}.${form} — livrée sans écran qui la rend`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('une forme ORPHELINE ne nomme AUCUN écran — c’est ce qui la définit', () => {
    const offenders: string[] = []
    for (const object of BUSINESS_OBJECT_FORMS) {
      if (object.measured === null) continue
      for (const [form, measured] of Object.entries(object.measured)) {
        if (measured.state === 'orphan' && measured.renderedBy !== null) {
          offenders.push(`${object.key}.${form} — orpheline mais rendue par ${measured.renderedBy}`)
        }
        if (measured.state === 'absent' && measured.holders.length > 0) {
          offenders.push(`${object.key}.${form} — absente mais cite ${measured.holders.length} porteur(s)`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('un objet MESURÉ l’est sur ses sept formes — une mesure partielle se lirait comme une absence', () => {
    for (const object of BUSINESS_OBJECT_FORMS) {
      if (object.measured === null) continue
      expect(Object.keys(object.measured).sort()).toEqual([...OBJECT_FORM_KEYS].sort())
    }
  })

  it('rend le compte de la mesure du 29/08 — six objets, 29 cellules demandées', () => {
    // ⚠️ Ce test existe parce que le premier récit de cette mesure, écrit à la
    // main dans le tracker, annonçait « 34 cellules, 21 livrées, 9 partielles,
    // 4 absentes » : les quatre nombres étaient faux. Un total est un argument,
    // et un argument non recalculé se périme en silence.
    //
    // Ce n'est PAS un cliquet : les nombres bougeront le jour où une forme sera
    // livrée ou un objet mesuré, et c'est le bon moment pour relire ce qui a
    // été écrit à côté.
    const measured = BUSINESS_OBJECT_FORMS.filter(object => object.measured !== null)
    expect(measured.map(object => object.key)).toEqual(['compte', 'contact', 'projet', 'besoin', 'talent', 'mission'])

    const tally: Record<string, number> = { delivered: 0, partial: 0, orphan: 0, absent: 0 }
    for (const object of measured) {
      for (const form of OBJECT_FORM_KEYS) {
        if (object.spec[form] !== 'required') continue
        tally[object.measured![form]!.state] += 1
      }
    }
    // ⚠️ RECALCULÉ le 30/08/2026 : 15 → 17 livrées, 5 → 3 absentes. Le lot du
    // dossier de mission (D200) a fermé DEUX cellules d'un coup, et c'est la
    // dépendance elle-même qui l'explique — F1 · Mention était bloquée par
    // l'absence de F6 · Dossier, la seule dépendance entre deux formes que la
    // mesure du 29/08 avait trouvée. Livrer F6 rendait F1 possible ; le même
    // lot a fait les deux, parce que livrer le dossier sans les mentions aurait
    // laissé le libellé d'une mission mort dans quatre écrans de plus.
    //
    // ⚠️ RECALCULÉ le 09/09/2026 (#1800) : 17 → 16 livrées, 3 → 4 absentes.
    // La page `/favorites` était le SEUL appelant d'`ObjectMention` avec
    // `kind="contact"` du dépôt entier — son retrait (« supprime la notion de
    // favori ») retire donc la mention F1 du contact avec elle. Ce n'est pas
    // une invention : `grep 'kind="contact"' apps/web/src` hors tests rend zéro
    // occurrence après ce lot.
    //
    // ⚠️ RECALCULÉ le 21/10/2026 (#4359.3) : 9 → 8 partielles, 4 → 5 absentes. Le kanban des missions
    // (`MissionBoardPage`, déjà sans route depuis #4359) est RETIRÉ : code mort, plus aucun appelant. La forme
    // F3 de la mission, demandée par la table, devient donc absente — dite telle, pas masquée.
    expect(tally).toEqual({ delivered: 16, partial: 8, orphan: 0, absent: 5 })
    expect(tally.delivered + tally.partial + tally.orphan + tally.absent).toBe(29)
  })

  it('les cinq formes DEMANDÉES et absentes sont nommées, pas seulement comptées', () => {
    // « Quatre absences » n'apprend rien ; « le panneau du compte, celui du
    // contact, la mention du contact, la mention du projet » dit où aller.
    // C'est la même exigence que « ce qui n'a pas pu être évalué est NOMMÉ »,
    // appliquée à un inventaire de formes.
    //
    // ⚠️ Les deux qui ont disparu de cette liste le 30/08 sont la mention ET le
    // dossier de la MISSION. La mention du PROJET reste, et pour exactement la
    // raison qui vient de tomber pour la mission : le projet n'a toujours pas
    // de F6, donc sa mention n'a rien à ouvrir. `MENTION_TARGETS` ne le connaît
    // pas, et l'y ajouter fabriquerait un lien mort.
    //
    // ⚠️ La mention du CONTACT rejoint cette liste le 09/09/2026 (#1800) :
    // `/favorites`, son seul appelant, a été retiré sur décision de Louis.
    const absent = missingRequiredForms().filter(gap => gap.state === 'absent')
    expect(absent).toEqual([
      { object: 'compte', form: 'f5_panneau', state: 'absent' },
      { object: 'contact', form: 'f1_mention', state: 'absent' },
      { object: 'contact', form: 'f5_panneau', state: 'absent' },
      { object: 'projet', form: 'f1_mention', state: 'absent' },
      { object: 'mission', form: 'f3_kanban', state: 'absent' },
    ])
  })

  it('le NON MESURÉ est compté, et il en reste — un registre tout vert serait faux', () => {
    // L'invariant maison, appliqué à un inventaire : « non mesuré » n'est pas
    // « absent », et surtout pas « conforme ». Le jour où quelqu'un mesure les
    // douze restants, ce test change de nombre — et c'est le bon moment pour
    // relire ce qu'il a écrit.
    const unmeasured = unmeasuredObjects()
    expect(unmeasured.length).toBeGreaterThan(0)
    expect(unmeasured.length).toBeLessThan(BUSINESS_OBJECT_FORMS.length)
  })
})

describe('GA-74 — le carnet de dettes est CALCULÉ, jamais saisi', () => {
  it('ne liste que des formes DEMANDÉES par la table et non livrées', () => {
    for (const gap of missingRequiredForms()) {
      const object = BUSINESS_OBJECT_FORMS.find(entry => entry.key === gap.object)
      expect(object).toBeDefined()
      expect(object!.spec[gap.form]).toBe('required')
      expect(gap.state).not.toBe('delivered')
    }
  })

  it('n’invente pas de dette sur un objet non mesuré', () => {
    const unmeasuredKeys = new Set(unmeasuredObjects().map(object => object.key))
    const wrong = missingRequiredForms().filter(gap => unmeasuredKeys.has(gap.object))
    expect(wrong).toEqual([])
  })
})
