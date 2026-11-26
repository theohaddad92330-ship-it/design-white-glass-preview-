/**
 * #1667.1 — pourquoi « espaces où le flag est actif » et « date d'activation »
 * sont NON MESURÉS avec l'intégration actuelle, et pas simplement absents.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UNE PANNE — C'EST UNE LIMITE STRUCTURELLE DU SDK, VÉRIFIÉE AVANT D'ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReflagService.listFlags` (`apps/api/src/modules/reflag/reflag.service.ts`)
 * lie le client SDK à UN SEUL contexte (`bindClient({ user, company })`) avant
 * d'appeler `getFlags()` — exactement ce que `fetchAdminFlags` expose déjà
 * (`?userId=&workspaceId=`). Lister TOUS les espaces où un flag est actif
 * demanderait d'itérer chaque espace connu et d'évaluer le flag pour chacun
 * (`getFlagsRemote` déclenche un appel réseau PAR espace, `@reflag/node-sdk`
 * 1.7.0) — un fan-out que cet écran ne fait pas, et qui vivrait de toute façon
 * dans `internal-admin.controller.ts` (`apps/api/src/modules/admin/**`, hors
 * périmètre de ce lot).
 *
 * Une date d'activation est plus radicalement absente : ni `FlagDefinition`
 * ni `FlagState` (le SDK, `dist/types/src/types.d.ts`) ne portent un
 * `createdAt`/`activatedAt`/`enabledSince` — la seule notion proche est un
 * `rolloutPercentage` DANS les règles de ciblage, jamais une date. Fabriquer
 * une date reviendrait à en INVENTER une (interdit : jamais de donnée
 * fictive).
 */
type MesureFlagIndisponible = { mesure: false; raison: string }

/** Toujours non mesuré — voir le docblock du fichier. */
export function espacesActifsDuFlag(): MesureFlagIndisponible {
  return {
    mesure: false,
    raison:
      'Reflag évalue un SEUL contexte (utilisateur + espace) à la fois : lister tous les espaces où ce flag est ' +
      'actif demanderait un appel réseau par espace, que cet écran ne fait pas.',
  }
}

/** Toujours non mesurée — voir le docblock du fichier. */
export function dateActivationDuFlag(): MesureFlagIndisponible {
  return {
    mesure: false,
    raison: 'Le SDK Reflag ne porte aucune date d’activation, ni sur la définition du flag ni sur son évaluation.',
  }
}
