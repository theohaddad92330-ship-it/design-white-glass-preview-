import { contactsOutOfScopeSchema } from '@bellum/contracts'

export type ContactsOutOfScopeView = {
  /** Nombre de contacts retirés parce que hors périmètre. Toujours ≥ 1. */
  dropped: number
  /** Les employeurs concernés, du plus gros au plus petit. Peut être vide (un hit
   *  sans employeur nommé est compté mais jamais étiqueté). */
  entities: string[]
}

/**
 * « X écartés (hors périmètre) » — P0-03 du rapport TF1.
 *
 * La phase 2 retire les contacts dont l'employeur est une entité que le
 * commercial a mise hors périmètre (filiale étrangère, homonyme…). Jusqu'ici ça
 * ne partait que dans les logs : à l'écran le stock rétrécissait sans raison, ce
 * qui se lit comme une recherche cassée plutôt que comme le périmètre qui fait
 * son travail.
 *
 * Le compte appartient à UNE analyse (pas au workspace) : il est donc lu depuis
 * le `raw_analysis` du compte et rendu sur la fiche compte, à côté de SES
 * contacts — pas dans le bandeau funnel de la liste globale, qui agrège plusieurs
 * comptes et n'aurait aucun moyen honnête d'attribuer le chiffre.
 *
 * `null` quand il n'y a rien à dire : dossier antérieur à la fonctionnalité, ou
 * run qui n'a rien écarté. On préfère ne rien afficher qu'un « 0 écarté », qui
 * laisserait croire qu'un filtrage a eu lieu.
 */
export function readContactsOutOfScope(
  rawAnalysis: Record<string, unknown> | null | undefined,
): ContactsOutOfScopeView | null {
  const parsed = contactsOutOfScopeSchema.safeParse(rawAnalysis?.['contacts_out_of_scope'])
  if (!parsed.success || parsed.data.dropped <= 0) return null
  const entities = (parsed.data.entities ?? []).map(entity => entity.name.trim()).filter(Boolean)
  return { dropped: parsed.data.dropped, entities }
}
