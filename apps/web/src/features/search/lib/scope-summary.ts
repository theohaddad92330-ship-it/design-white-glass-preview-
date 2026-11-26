import type { AnalysisScopeMode, CompanySuggestion } from '@bellum/contracts'

/**
 * L'IDENTITÉ que ce lancement va analyser — une seule dérivation, deux lecteurs.
 *
 * ## Pourquoi elle existe
 *
 * Le SIREN du lancement ne venait que de `scopedEntity`, l'entité choisie dans
 * l'autocomplétion. Sur une RELANCE il n'y a pas de choix d'autocomplétion : le
 * champ est pré-rempli depuis le dossier. `scopedEntity` valait donc `null`, le
 * lancement partait sans identité, et la collecte repartait du NOM.
 *
 * Mesuré en production le 30/08/2026 : le dossier ROCHE portait `552012031`
 * (le laboratoire pharmaceutique). « Actualiser l'analyse » l'a fait revenir
 * avec `493229280` — ROCHE BOBOIS, distributeur de meubles — contacts et angles
 * du laboratoire fusionnés dedans. **Le dossier a changé d'entreprise.**
 *
 * ## La règle
 *
 * Un dossier qui connaît son SIREN se rafraîchit sur ce SIREN, jamais sur son
 * nom. Le nom sert à TROUVER une société qu'on n'a pas encore.
 *
 * ## L'ordre, et sa raison
 *
 * 1. **L'entité choisie à l'autocomplétion gagne** — quand l'utilisateur vient
 *    de désigner une société dans la liste, c'est CELLE-LÀ qu'il veut, y compris
 *    quand il corrige l'identité d'un dossier existant.
 * 2. **Sinon l'identité du dossier relancé** — acquise, vérifiée, et la seule
 *    chose qui empêche un homonyme de prendre sa place.
 * 3. **Sinon rien** — et surtout PAS une valeur devinée. Un compte créé à la
 *    main ou une société étrangère n'a pas de SIREN : la résolution par nom y
 *    reste la seule possible, elle est donc légitime, et l'écran de
 *    confirmation le DIT au lieu de la présenter comme une identité acquise.
 *
 * Elle vit dans le même fichier que le récap parce que c'est la même question —
 * « quelle société ce run vise-t-il ? ». Deux réponses écrites à deux endroits
 * divergeraient, et la divergence se lirait ainsi : l'écran annonce une société,
 * le run en analyse une autre. C'est précisément ce qui s'est passé.
 */
export function resolveLaunchSiren({
  query,
  scopedEntity,
  knownSiren,
}: {
  query: string
  scopedEntity: CompanySuggestion | null
  /** Le SIREN du dossier relancé, quand ce lancement en rafraîchit un. */
  knownSiren?: string | null
}): string | undefined {
  const trimmed = query.trim()
  // Le verrou d'autocomplétion ne vaut que s'il correspond ENCORE au nom soumis
  // (l'utilisateur n'a pas édité depuis sa sélection), et qu'il porte un vrai
  // SIREN français — une suggestion étrangère n'en a pas.
  if (scopedEntity && scopedEntity.name === trimmed && isFrenchSiren(scopedEntity.siren)) {
    return scopedEntity.siren
  }
  return isFrenchSiren(knownSiren) ? knownSiren : undefined
}

/** Neuf chiffres, et rien d'autre. */
function isFrenchSiren(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{9}$/.test(value)
}

/**
 * A pre-launch scope recap (Théo restitution P0-02 — "corriger le scope AVANT de
 * payer la collecte"). The rep confirms exactly WHAT will be analysed before a
 * credit is spent: the resolved object (a precise registry entity vs a plain
 * name resolution) and the chosen perimeter.
 */
export type ScopeSummary = {
  /** The company/entity the run will target. */
  objectName: string
  /** True when anchored to a precise registry entity (a SIREN/CIK…), which is
   *  what prevents "Société Générale → ~100 SCI". False = resolved by name. */
  isEntityLocked: boolean
  /** Human registry label ("SIREN 123456789", "CIK 320193"…) or null when the
   *  run resolves by name. */
  registryLabel: string | null
  /** City · sector, when the locked entity carries them. */
  location: string | null
  scopeMode: AnalysisScopeMode
}

/** Builds the recap shown in the confirmation step. Pure — the anchor is a
 *  precise entity only when the locked suggestion still matches the typed name
 *  (mirrors the SIREN-anchoring rule in `Search.handleSubmit`). */
export function buildScopeSummary({
  query,
  scopedEntity,
  scopeMode,
  knownSiren,
}: {
  query: string
  scopedEntity: CompanySuggestion | null
  scopeMode: AnalysisScopeMode
  /** Le SIREN du dossier relancé, quand ce lancement en rafraîchit un. */
  knownSiren?: string | null
}): ScopeSummary {
  const trimmed = query.trim()
  const entity = scopedEntity && scopedEntity.name === trimmed ? scopedEntity : null

  // Le récap se prononce sur la MÊME identité que celle qui partira réellement
  // à la collecte — il la relit par `resolveLaunchSiren` au lieu de la
  // re-dériver. Sans ça, l'écran affichait « Résolution par nom » sur un dossier
  // dont l'identité était acquise : il ANNONÇAIT le défaut sans que personne ne
  // puisse le lire comme tel, juste au-dessus du bouton qui débite.
  const launchSiren = resolveLaunchSiren({ query, scopedEntity, knownSiren })

  const registryLabel = entity
    ? entity.registryId && entity.registryIdLabel
      ? `${entity.registryIdLabel} ${entity.registryId}`
      : entity.registryId
        ? entity.registryId
        : entity.siren
          ? `SIREN ${entity.siren}`
          : null
    : // Pas d'entité choisie à l'autocomplétion, mais un dossier qui connaît son
      // identité : c'est elle qui ancre le run, donc c'est elle qu'on nomme.
      launchSiren
      ? `SIREN ${launchSiren}`
      : null

  const location = entity ? [entity.city, entity.sector].filter(Boolean).join(' · ') || null : null

  return {
    objectName: entity?.name ?? trimmed,
    // « Verrouillé » = le run est ancré sur une identité de registre, quelle que
    // soit sa provenance (choisie à l'écran, ou héritée du dossier relancé).
    // C'est ce booléen qui décide entre nommer l'identité et avouer une
    // résolution par nom.
    isEntityLocked: entity != null || launchSiren != null,
    registryLabel,
    location,
    scopeMode,
  }
}
