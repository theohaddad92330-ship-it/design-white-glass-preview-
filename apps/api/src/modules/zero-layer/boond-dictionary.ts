/**
 * Le dictionnaire d'instance BoondManager (#4690) : `GET /application/dictionary`, Tier 2.
 *
 * AUCUN identifiant de référentiel en dur. Les `typeOf` et les états sont ceux de l'INSTANCE du client, lus ici, mis en
 * cache PAR CONNEXION (donc par espace et par environnement — jamais partagés) et invalidés sur `data.setting.version`,
 * qui change à chaque modification de configuration. Le TTL n'est qu'un filet.
 *
 * Un libellé introuvable n'est JAMAIS remplacé par une valeur devinée : la capacité qui en dépend se refuse en disant
 * laquelle. Un état `isEnabled: false` ou `active: false` n'est jamais proposé : donnée morte chez le client.
 */

type BoondActionEntry = { value: string; isNotification: boolean; isEnabled: boolean; types: string[] }
type BoondStateEntry = {
  value: string
  color: string | null
  isEnabled: boolean
  active: boolean
  reason: string[]
}

export type BoondDictionary = {
  version: string
  actions: Record<string, BoondActionEntry[]>
  states: Record<string, BoondStateEntry[]>
  timezone: string | null
}

type Json = Record<string, unknown>
const isJson = (v: unknown): v is Json => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])

/** `null` si la réponse n'a pas la forme documentée ou ne porte pas de `version` : on ne devine pas un dictionnaire. */
export function parseDictionary(payload: unknown): BoondDictionary | null {
  const setting = isJson(payload) && isJson(payload['data']) ? payload['data']['setting'] : null
  if (!isJson(setting)) return null
  const version = str(setting['version'])
  if (!version) return null

  const actions: Record<string, BoondActionEntry[]> = {}
  for (const [entity, list] of Object.entries(isJson(setting['action']) ? setting['action'] : {})) {
    if (!Array.isArray(list)) continue
    actions[entity] = list.filter(isJson).flatMap(e =>
      str(e['value'])
        ? [
            {
              value: str(e['value']),
              isNotification: e['isNotification'] === true,
              isEnabled: e['isEnabled'] !== false,
              types: strs(e['types']),
            },
          ]
        : [],
    )
  }
  const states: Record<string, BoondStateEntry[]> = {}
  for (const [kind, list] of Object.entries(isJson(setting['state']) ? setting['state'] : {})) {
    if (!Array.isArray(list)) continue
    states[kind] = list.filter(isJson).flatMap(e =>
      str(e['value'])
        ? [
            {
              value: str(e['value']),
              color: str(e['color']) || null,
              isEnabled: e['isEnabled'] !== false,
              active: e['active'] !== false,
              reason: strs(e['reason']),
            },
          ]
        : [],
    )
  }
  return { version, actions, states, timezone: str(setting['timezone']) || null }
}

/** Les états qu'on peut PROPOSER à l'écran : ni désactivés ni inactifs. */
export function selectableStates(dict: BoondDictionary, kind: string): BoondStateEntry[] {
  return (dict.states[kind] ?? []).filter(s => s.isEnabled && s.active)
}

/** Refus nommé : la capacité qui manque et ce qui lui manque. L'écran le dit tel quel. */
type DictionaryRefusal = { ok: false; capability: string; missing: string; message: string }

export function refuseTypeOf(dict: BoondDictionary | null, entity: string, typeOf: string): DictionaryRefusal | null {
  const capability = `action:${entity}`
  if (!dict) {
    return {
      ok: false,
      capability,
      missing: 'dictionnaire',
      message: `Le dictionnaire de l'instance BoondManager n'a pas pu être lu : impossible de valider le type d'action « ${typeOf} » sur « ${entity} ».`,
    }
  }
  const known = (dict.actions[entity] ?? []).some(a => a.isEnabled && (a.value === typeOf || a.types.includes(typeOf)))
  if (known) return null
  return {
    ok: false,
    capability,
    missing: typeOf,
    message: `Le type d'action « ${typeOf} » n'existe pas (ou est désactivé) dans l'instance BoondManager pour « ${entity} » : action refusée.`,
  }
}

const TTL_SAFETY_NET_MS = 24 * 60 * 60 * 1000

type Entry = { dict: BoondDictionary; fetchedAt: number }

/** Cache PAR CLÉ DE CONNEXION. Aucune lecture d'une clé ne voit l'entrée d'une autre. */
export class BoondDictionaryCache {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Le dictionnaire de la connexion, relu seulement si absent, périmé (filet) ou invalidé par un changement de version. */
  async get(key: string, fetcher: () => Promise<BoondDictionary | null>): Promise<BoondDictionary | null> {
    const hit = this.entries.get(key)
    if (hit && this.now() - hit.fetchedAt < TTL_SAFETY_NET_MS) return hit.dict
    const dict = await fetcher()
    if (dict) this.entries.set(key, { dict, fetchedAt: this.now() })
    return dict
  }

  /** Une version observée ailleurs (réponse, webhook) qui diffère de celle en cache l'invalide. */
  noteVersion(key: string, version: string): void {
    const hit = this.entries.get(key)
    if (hit && hit.dict.version !== version) this.entries.delete(key)
  }

  versionOf(key: string): string | null {
    return this.entries.get(key)?.dict.version ?? null
  }
}

export const sharedBoondDictionaryCache = new BoondDictionaryCache()
