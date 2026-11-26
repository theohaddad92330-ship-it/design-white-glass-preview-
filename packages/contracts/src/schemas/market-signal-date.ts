import { z } from 'zod'
import { COMMUNITY_THRESHOLD } from './community-facts.js'

/**
 * #2288.2 — LA DATE D'UN SIGNAL, ET RIEN QUI DISE QUI L'A VUE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DOCTRINE QUI EST LEVÉE, ET CE QUI LA REMPLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * La mémoire marché retirait TOUTE date (`market-memory.ts`, interdit n°1), et
 * `aggregateAccessFacts` recevait `observedAt` sans jamais le lire. La raison
 * n'était pas une coquetterie : **une date, plus une entreprise, plus un fait
 * suffisent souvent à désigner QUEL espace a fait l'observation** — et les
 * espaces de Bellum sont des ESN, donc des concurrents. C'est la même raison
 * qui fait que le coût d'accès ne s'agrège jamais entre espaces (GA-43).
 *
 * La doctrine est levée le 18/09/2026, avec ce périmètre EXACT et pas un pouce
 * de plus — ce lot ouvre les DATES, rien d'autre :
 *
 * 1. **observation propre** — au moins une observation datée de MON espace :
 *    **date exacte**, telle qu'elle est. Je ne me trahis pas moi-même.
 * 2. **observation d'ailleurs** — aucune observation propre datée, mais au
 *    moins {@link COMMUNITY_THRESHOLD} espaces DISTINCTS d'ailleurs en portent
 *    une : **date grossie au MOIS**, jamais le jour.
 * 3. **sous le seuil** — **aucune date**, exactement comme avant. « Non daté »
 *    est un ÉTAT, il ne se remplace pas par une approximation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SORTIE NE PORTE PAS, ET POURQUOI CHAQUE ABSENCE EST VOULUE
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Aucun identifiant d'espace.** L'`workspaceId` n'entre que pour être
 *   COMPTÉ, il ne ressort jamais — la même propriété qu'`aggregateAccessFacts`.
 * · **Aucun comptage de contributeurs.** « Vu par 3 espaces » sur un fait rare
 *   est déjà une information : sur un marché où l'on sait qui travaille où,
 *   « exactement trois » désigne une intersection courte. Le type ne porte donc
 *   ni `sourcesCount`, ni `contributors`, et `.strict()` refuse qu'on l'y
 *   glisse — la promesse est tenue par le TYPE, pas par la discipline.
 * · **Aucun ordre d'écriture.** On rend la date la plus RÉCENTE, jamais la
 *   première : un « premier observateur » stable trahirait qui a écrit d'abord.
 * · **La nature, pas la provenance.** `own` / `shared` dit à l'utilisateur
 *   quelle CONFIANCE accorder à la date, et rien sur qui l'a produite.
 *
 * ⚠️ Ce qui reste, et qu'on assume : un mois + une entreprise + un fait rare
 * reste un indice. Le seuil de trois espaces est ce qui le rend acceptable —
 * le baisser rouvrirait exactement la question que la doctrine fermait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link decideMarketSignalDate} est la SEULE fonction qui tranche. Le serveur
 * l'appelle pour construire la valeur ; l'écran ne la rejoue pas, il REND ce
 * qu'il a reçu. Deux implantations divergeraient le jour où l'une des deux
 * bouge, et le côté qui divergerait serait celui qui montre.
 */

/** Un mois ISO — `2026-08`. Un jour n'y entre pas, c'est tout l'objet. */
const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * La date d'un signal, avec sa NATURE — et deux champs qui ne se confondent
 * jamais : `observedOn` (un instant exact) n'existe QUE sur `own`,
 * `observedMonth` (un mois) n'existe QUE sur `shared`.
 *
 * `.strict()` sur les deux branches n'est pas décoratif : c'est lui qui refuse
 * `{ nature: 'shared', observedOn: … }` — une date exacte qui vient d'un AUTRE
 * espace — et tout champ qui remonterait à un espace (identifiant, comptage).
 */
export const marketSignalDateSchema = z.discriminatedUnion('nature', [
  z
    .object({
      nature: z.literal('own'),
      /** L'instant tel qu'il a été observé. Mon espace ne se trahit pas lui-même. */
      observedOn: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      nature: z.literal('shared'),
      /** Le MOIS, jamais le jour — `2026-08`. */
      observedMonth: z.string().regex(ISO_MONTH_PATTERN),
    })
    .strict(),
])
export type MarketSignalDate = z.infer<typeof marketSignalDateSchema>

/** L'instant en millisecondes, ou `null` si aucun calendrier ne sait le lire. */
function readInstant(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Le mois UTC d'un instant — la seule dérivation « date grossie » du produit. */
function monthOf(instant: number): string {
  const date = new Date(instant)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * La décision, écrite UNE fois : quelle date un espace a le droit de lire.
 *
 * L'ordre des règles EST la règle :
 *
 * 1. mon observation datée l'emporte sur tout — je connais mon client ;
 * 2. sinon la réciprocité : un espace qui ne partage pas ne consomme pas ;
 * 3. sinon le seuil, compté en ESPACES DISTINCTS d'ailleurs (un espace qui
 *    déclare trois fois reste une voix), et **mon espace n'y entre pas** : il
 *    n'a rien de daté à apporter dans cette branche, et le faire compter
 *    reviendrait à me laisser abaisser le seuil des autres tout seul ;
 * 4. et alors seulement, le MOIS de la plus récente.
 *
 * Une date illisible est traitée comme absente : on ne recopie pas ce qu'on ne
 * sait pas lire, et on ne le devine pas non plus.
 */
export function decideMarketSignalDate(input: {
  /** Les observations en présence. `workspaceId` ne sert QU'À COMPTER. */
  readonly observations: readonly { readonly workspaceId: string; readonly observedAt: string | null }[]
  readonly askingWorkspaceId: string
  /** L'espace a-t-il activé le partage ? Décoché par défaut (réciprocité). */
  readonly contributes: boolean
}): MarketSignalDate | null {
  const asking = (input.askingWorkspaceId ?? '').trim()
  let ownLatest: number | null = null
  let foreignLatest: number | null = null
  const foreignWorkspaces = new Set<string>()

  for (const observation of input.observations) {
    const workspaceId = (observation?.workspaceId ?? '').trim()
    const instant = readInstant(observation?.observedAt)
    if (!workspaceId || instant === null) continue
    if (asking && workspaceId === asking) {
      ownLatest = ownLatest === null || instant > ownLatest ? instant : ownLatest
      continue
    }
    foreignWorkspaces.add(workspaceId)
    foreignLatest = foreignLatest === null || instant > foreignLatest ? instant : foreignLatest
  }

  if (ownLatest !== null) return { nature: 'own', observedOn: new Date(ownLatest).toISOString() }
  if (!input.contributes) return null
  if (foreignWorkspaces.size < COMMUNITY_THRESHOLD || foreignLatest === null) return null
  return { nature: 'shared', observedMonth: monthOf(foreignLatest) }
}
