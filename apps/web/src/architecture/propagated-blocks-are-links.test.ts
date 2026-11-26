/**
 * GA-59 — À L'ÉCRAN, UN BLOC PROPAGÉ EST UN LIEN, ET AUCUN N'EST UN CHAMP.
 *
 * ⚠️ Numéro à vérifier à l'intégration : plusieurs chantiers écrivent en
 * parallèle sur cette vague, et deux gardes ont déjà porté le même numéro
 * pendant une heure (GA-49 / GA-50, le 28/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, MOT POUR MOT (PDF 2 du dossier du 26/08, §4.4)
 * ─────────────────────────────────────────────────────────────────────────────
 *     « Chaque bloc propagé porte un lien vers sa source et ne s'édite jamais
 *      sur place. Le CA cumulé d'un compte se lit sur la fiche compte. Il se
 *      calcule dans les missions. On ne le corrige pas depuis le compte. »
 *
 * La propagation du contexte fabrique MÉCANIQUEMENT la seconde vérité : sa
 * raison d'être est de multiplier les endroits où le même chiffre s'affiche. Le
 * jour où l'un d'eux devient corrigible, deux valeurs divergent, et plus
 * personne ne sait laquelle est la bonne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE-CI EN PLUS DE CELLE DU SERVEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/api/src/architecture/propagation-source-link.spec.ts` tient la moitié
 * SERVEUR : le service n'a aucun chemin d'écriture, `editable` est un
 * `z.literal(false)`, aucune route `@Post`/`@Patch` ne porte « propagation ».
 *
 * Elle ne peut rien dire de l'écran. Un `<Input value={revenue.invoicedCents}>`
 * sur la fiche compte la laisserait verte : le serveur refuserait l'écriture,
 * et l'utilisateur verrait un champ modifiable qui perd sa saisie en silence —
 * ce qui est pire qu'un champ qui écrit. Et un chiffre rendu SANS lien laisse le
 * lecteur sans moyen d'aller voir d'où il sort : c'est le début de la seconde
 * vérité, pas encore sa fin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT — et pourquoi rien n'est recopié
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste des champs propagés vient des SCHÉMAS eux-mêmes (`.shape`), pas d'une
 * liste écrite ici. Un champ ajouté au contrat entre donc dans le périmètre de
 * la garde sans que personne n'ait à y penser — c'est exactement ce qu'une liste
 * recopiée à la main ne fait jamais (défaut « clé de cache recopiée à la main »).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  accountPropagationSchema,
  accountRevenuePropagationSchema,
  consultantMarginPropagationSchema,
  consultantPropagationSchema,
  contactPropagationSchema,
} from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

const WEB_SRC = join(__dirname, '..')
const PROPAGATION_DIR = join(WEB_SRC, 'features', 'propagation')
const BLOCK_FILE = join(PROPAGATION_DIR, 'PropagatedBlock.tsx')

/**
 * LES SEPT BLOCS DE LA CARTE (§4.2), et le fichier qui rend chacun.
 *
 * Nommés un par un, et c'est délibéré : une garde qui se contenterait de
 * compter « au moins six liens quelque part » resterait verte le jour où l'un
 * des six perd le sien et qu'un septième naît ailleurs. Le sixième agrégat — la
 * dernière mission d'un consultant — n'est pas ici : il était déjà livré avant
 * ce chantier (`talent.service.ts`) et ne passe pas par la propagation.
 */
const RENDERED_BLOCKS: { block: string; file: string }[] = [
  {
    block: 'CA facturé — colonne du portefeuille',
    file: 'features/accounts/view/accounts-list/AccountRevenueCell.tsx',
  },
  {
    block: 'CA cumulé + tarif vendu moyen — bandeau du dossier de compte',
    file: 'features/accounts/view/account-detail/components/AccountRevenueBanner.tsx',
  },
  {
    block: 'missions signées — badge de contact',
    file: 'features/contacts/view/contacts-list/ContactSignedMissionsBadge.tsx',
  },
  { block: 'placements — vivier', file: 'features/consultants/view/TalentPlacementsChip.tsx' },
  { block: 'marge moyenne — fiche consultant', file: 'features/consultants/view/detail/TalentMarginCard.tsx' },
  // Le SEPTIÈME, arrivé avec la fiche d'un besoin (§4.2) : le tarif vendu moyen
  // du compte, mis en regard du tarif CIBLE du besoin. Même agrégat que celui
  // du bandeau de compte, lu par le même hook — donc même règle : il porte son
  // lien vers les missions, et il ne s'édite pas ici.
  {
    block: 'tarif vendu moyen — fiche d’un besoin',
    file: 'features/projects/open-needs/view/NeedRateComparison.tsx',
  },
]

/**
 * Les MESURES portées par les blocs propagés, lues sur les schémas.
 *
 * Les identifiants, la source et le verrou sortent : ce sont des clés et des
 * métadonnées, pas des valeurs affichées. `measurability` sort aussi — c'est un
 * objet dont on lit les sous-champs, jamais lui-même.
 */
const NOT_A_MEASURE = new Set(['source', 'editable', 'accountId', 'contactId', 'consultantId', 'measurability'])
const PROPAGATED_FIELDS = [
  ...new Set(
    [
      accountPropagationSchema,
      accountRevenuePropagationSchema,
      contactPropagationSchema,
      consultantPropagationSchema,
      consultantMarginPropagationSchema,
    ]
      .flatMap(schema => Object.keys(schema.shape))
      .filter(key => !NOT_A_MEASURE.has(key)),
  ),
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function tsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return entry.endsWith('.tsx') && !entry.includes('.test.') ? [full] : []
  })
}

/**
 * Le CORPUS : tout écran qui touche à la propagation.
 *
 * Un fichier qui affiche un agrégat propagé DOIT passer par le module
 * `features/propagation` — c'est la seule porte vers les deux routes. Le corpus
 * se déduit donc de l'import, et non d'une liste de chemins qui vieillirait.
 */
function corpus(): { path: string; source: string }[] {
  // ⚠️ `projects` est entré dans la liste le 28/08/2026, avec la fiche d'un
  // besoin : elle affiche le tarif vendu moyen du compte. Sans cette ligne, la
  // garde serait restée VERTE sur un écran qu'elle ne regardait pas — c'est
  // exactement le défaut de GA-33, verte pendant que 149 endroits échouaient.
  // Une garde ne protège que ce qu'elle LIT.
  return ['accounts', 'contacts', 'consultants', 'projects', 'propagation']
    .flatMap(feature => tsxFiles(join(WEB_SRC, 'features', feature)))
    .map(path => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(file => /features\/propagation|from '\.\/(api|hooks)'/.test(file.source))
}

/** Une MESURE propagée lue sur un objet : `revenue.invoicedCents`, `.placements`… */
function readsAMeasure(source: string): string[] {
  const clean = stripComments(source)
  // ⚠️ Sans le drapeau `g` sur un `.test()` partagé : une regex à drapeau `g`
  // est À ÉTAT et rend `false` un appel sur deux. Défaut déjà payé sur GA-29.
  return PROPAGATED_FIELDS.filter(field => new RegExp(`\\.${field}\\b`).test(clean))
}

/**
 * Une mesure propagée liée à un élément ÉDITABLE.
 *
 * Écrit contre les formes que ce dépôt emploie réellement — `<Input value={…}>`,
 * `defaultValue=`, `onChange=` dans la même balise, `contentEditable` — et pas
 * contre une syntaxe imaginée : une garde qui surveille une forme que personne
 * n'écrit est borgne par construction.
 */
function editableBindings(source: string): string[] {
  const clean = stripComments(source)
  const found: string[] = []
  for (const field of PROPAGATED_FIELDS) {
    const bound = new RegExp(`(?:value|defaultValue|onChange|contentEditable)\\s*=\\s*\\{[^}]*\\.${field}\\b`)
    if (bound.test(clean)) found.push(field)
  }
  // Une balise de saisie qui porte une mesure propagée, quel que soit l'attribut.
  for (const tag of clean.matchAll(/<(?:input|Input|textarea|Textarea|select|Select)\b[^>]*>/g)) {
    for (const field of PROPAGATED_FIELDS) {
      if (new RegExp(`\\.${field}\\b`).test(tag[0])) found.push(`${field} (dans ${tag[0].slice(0, 24)}…)`)
    }
  }
  return found
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  La garde LIT quelque chose                                               */
/* ────────────────────────────────────────────────────────────────────────── */

describe('GA-59 — la garde a un corpus, et il n’est pas vide', () => {
  it('lit les champs propagés SUR LES SCHÉMAS, et il y en a', () => {
    // Un `.shape` vide (schéma renommé, import cassé) rendrait « zéro faute »
    // pour toujours : le faux zéro silencieux, pas une preuve.
    expect(PROPAGATED_FIELDS.length).toBeGreaterThanOrEqual(9)
    // Les quatre mesures qui portent le chantier sont bien dedans.
    for (const field of ['invoicedCents', 'averageSoldDailyRateCents', 'signedMissions', 'placements', 'marginPercent'])
      expect(PROPAGATED_FIELDS).toContain(field)
  })

  it('trouve les écrans qui affichent ces mesures', () => {
    const readers = corpus().filter(file => readsAMeasure(file.source).length > 0)
    // Cinq fichiers rendent les six blocs de la carte (le CA cumulé et le tarif
    // vendu moyen partagent le bandeau du dossier de compte).
    expect(readers.length).toBeGreaterThanOrEqual(6)
  })

  it('les six fichiers de rendu existent — un chemin faux rendrait la garde muette', () => {
    for (const { block, file } of RENDERED_BLOCKS) {
      expect(existsSync(join(WEB_SRC, file)), `bloc introuvable : ${block} (${file})`).toBe(true)
    }
    expect(existsSync(BLOCK_FILE)).toBe(true)
    expect(readFileSync(BLOCK_FILE, 'utf8').length).toBeGreaterThan(1500)
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  1 — chaque bloc porte SON lien                                           */
/* ────────────────────────────────────────────────────────────────────────── */

describe('GA-59 — chaque bloc propagé porte un lien vers sa source', () => {
  it('les sept blocs de la carte passent tous par `PropagatedBlock`', () => {
    // Nommés un par un : compter « au moins six liens » resterait vert le jour
    // où l'un des six perd le sien et qu'un septième naît ailleurs.
    const mute = RENDERED_BLOCKS.filter(({ file }) => {
      const source = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'))
      return !/<PropagatedBlock\b/.test(source)
    }).map(({ block, file }) => `${block} → ${file}`)
    expect(mute, `blocs propagés sans lien vers leur source :\n${mute.join('\n')}`).toEqual([])
  })

  it('aucun écran n’affiche une mesure propagée sans importer le lien', () => {
    const orphans = corpus()
      .filter(file => file.path !== BLOCK_FILE)
      .filter(file => readsAMeasure(file.source).length > 0)
      .filter(file => !/PropagatedBlock/.test(file.source))
      .map(file => `${file.path.slice(file.path.indexOf('/src/'))} → ${readsAMeasure(file.source).join(', ')}`)
    // Si ce test tombe : un chiffre du back-office s'affiche quelque part sans
    // que le lecteur puisse aller voir d'où il sort. C'est le premier pas vers
    // la seconde vérité — le chiffre existe à deux endroits, et un seul dit
    // comment il est calculé.
    expect(orphans, `mesures propagées rendues sans lien de source :\n${orphans.join('\n')}`).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  2 — et aucun n'est un champ                                              */
/* ────────────────────────────────────────────────────────────────────────── */

describe('GA-59 — un bloc propagé ne s’édite jamais sur place', () => {
  it('aucune mesure propagée n’est liée à un élément de saisie', () => {
    const editable = corpus()
      .flatMap(file =>
        editableBindings(file.source).map(field => `${file.path.slice(file.path.indexOf('/src/'))} → ${field}`),
      )
      .sort()
    // Si ce test tombe : tu as rendu un agrégat modifiable là où il se LIT.
    // Le serveur refusera l'écriture (il n'a aucun chemin pour ça), donc
    // l'utilisateur verra un champ qui perd sa saisie en silence — pire qu'un
    // champ qui écrit. Le chiffre se corrige dans les MISSIONS.
    expect(editable, `mesures propagées rendues éditables :\n${editable.join('\n')}`).toEqual([])
  })

  it('`PropagatedBlock` lui-même n’offre aucun chemin d’écriture', () => {
    // Comme les outils de proposition du copilote : ce n'est pas une convention
    // qui l'interdit, c'est qu'il n'y a pas de code pour le faire.
    const source = stripComments(readFileSync(BLOCK_FILE, 'utf8'))
    for (const forbidden of [/<input\b/i, /<textarea\b/i, /<select\b/i, /contentEditable/, /onChange/])
      expect(forbidden.test(source), `${forbidden} ne devrait pas exister dans PropagatedBlock`).toBe(false)
    // Et il rend bien un LIEN — ce qui se clique se tabule sans qu'on ait rien
    // à ajouter (GA-35).
    expect(/<Link\b/.test(source)).toBe(true)
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  3 — et aucun ne se replie sur zéro                                       */
/* ────────────────────────────────────────────────────────────────────────── */

describe('GA-59 — une mesure propagée absente ne s’affiche jamais « 0 »', () => {
  it('aucun `?? 0` ni `|| 0` sur une mesure propagée', () => {
    // `invoicedCents`, `averageSoldDailyRateCents` et `marginPercent` valent
    // `null` À DESSEIN côté serveur (`SUM` sans `COALESCE`, `AVG` qui ignore les
    // `NULL`, `redactFinance`). Un seul `?? 0` ici annulerait ce soin, et un
    // client qui paye depuis trois ans afficherait « 0 € ».
    const zeros = corpus()
      .flatMap(file => {
        const clean = stripComments(file.source)
        return PROPAGATED_FIELDS.filter(field =>
          new RegExp(`\\.${field}\\s*(?:\\?\\?|\\|\\|)\\s*0\\b`).test(clean),
        ).map(field => `${file.path.slice(file.path.indexOf('/src/'))} → ${field}`)
      })
      .sort()
    expect(zeros, `replis sur zéro :\n${zeros.join('\n')}`).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  La garde sait dire NON                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe('GA-59 — la garde sait dire NON', () => {
  it('reconnaît une mesure propagée rendue dans un champ de saisie', () => {
    // Les formes exactes qu'on écrirait en voulant « corriger le CA depuis la
    // fiche ». Sans ce test, la garde pourrait surveiller une syntaxe que
    // personne n'écrit et rester verte pour toujours.
    const fautifs = [
      '<Input value={revenue.invoicedCents} onChange={save} />',
      '<input defaultValue={margin.marginPercent} />',
      '<Textarea value={signed.signedMissions} />',
      'onChange={event => setRate(rate.averageSoldDailyRateCents)}',
    ]
    const manqués = fautifs.filter(line => editableBindings(line).length === 0)
    expect(manqués, `formes fautives non détectées :\n${manqués.join('\n')}`).toEqual([])
  })

  it('ne mord PAS sur une lecture — une garde qui refuse tout ne protège rien', () => {
    const légitimes = [
      '{formatCents(revenue.invoicedCents)}',
      '<PropagatedBlock source={placed.source}>{t("placements", { count: placed.placements })}</PropagatedBlock>',
      'if (revenue.invoicedCents === null) return <UnknownCell />',
      // Un `onChange` qui ne porte AUCUNE mesure propagée est une saisie
      // ordinaire, sur un autre sujet, dans le même fichier.
      '<Input value={search} onChange={event => setSearch(event.target.value)} />',
    ]
    const fauxPositifs = légitimes.filter(line => editableBindings(line).length > 0)
    expect(fauxPositifs, `lectures prises pour des écritures :\n${fauxPositifs.join('\n')}`).toEqual([])
  })

  it('reconnaît un repli sur zéro, et laisse passer un vrai compteur', () => {
    const zero = /\.invoicedCents\s*(?:\?\?|\|\|)\s*0\b/
    expect(zero.test('{formatCents(revenue.invoicedCents ?? 0)}')).toBe(true)
    expect(zero.test('{formatCents(revenue.invoicedCents || 0)}')).toBe(true)
    expect(zero.test('{revenue.invoicedCents === null ? <UnknownCell /> : formatCents(revenue.invoicedCents)}')).toBe(
      false,
    )
  })

  it('repère un bloc rendu SANS son lien, et voit celui qui en a un', () => {
    const withLink = '<PropagatedBlock source={r.source}>{formatCents(r.invoicedCents)}</PropagatedBlock>'
    const without = '<Text>{formatCents(r.invoicedCents)}</Text>'
    expect(/<PropagatedBlock\b/.test(withLink)).toBe(true)
    expect(/<PropagatedBlock\b/.test(without)).toBe(false)
    // Et l'extracteur voit bien la mesure dans les deux — sinon il ne saurait
    // pas qu'il y a quelque chose à garder.
    expect(readsAMeasure(without)).toContain('invoicedCents')
  })

  it('ne se laisse pas tromper par un exemple cité dans un commentaire', () => {
    // Les commentaires de ce dossier CITENT les formes fautives pour expliquer
    // la règle. Les compter ferait tomber la garde sur sa propre documentation,
    // et la seule façon de documenter deviendrait de ne pas documenter (défaut
    // payé sur GA-08, GA-19 et GA-25).
    expect(editableBindings('/* fautif : <Input value={r.invoicedCents} /> */')).toEqual([])
    expect(editableBindings('// avant : <Input value={r.invoicedCents} />')).toEqual([])
    expect(readsAMeasure('/** on ne rend jamais `revenue.invoicedCents` dans un champ */')).toEqual([])
  })
})
