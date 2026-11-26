/**
 * CE QUE « VÉRIFIER AUJOURD'HUI » ANNONCE AU TRACEUR, ET RIEN D'AUTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PORT, ET PAS UN IMPORT DE `ProductAnalyticsService`
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-07 — le cliquet des imports service → service dans `modules/` — est AU
 * PLAFOND (254 imports, 124 fichiers). Il compte les `from '../<module>/<un
 * fichier dont le nom contient "service">'` écrits depuis un fichier de
 * `modules/` qui n'est ni un `.module.ts`, ni un `.controller.ts`, ni un
 * `.spec.ts`. `analysis-refresh.service.ts` est exactement ce cas : y importer
 * directement le service d'analytics du module voisin consommerait le dernier
 * cran disponible pour une ligne de télémétrie.
 *
 * ⚠️ Et ce docblock ne peut pas CITER l'import qu'il proscrit : GA-07 mesure le
 * texte brut, sans retirer les commentaires. La première version de ce fichier
 * n'importait rien du tout et faisait pourtant monter le cliquet de 254 à 255,
 * uniquement parce que la forme `from '../<module>/<…>service'` apparaissait
 * dans sa propre justification. Une garde qui lit ses commentaires compte du
 * récit pour du code — ici dans le sens qui fait rougir, ailleurs dans celui
 * qui rend vert.
 *
 * La sortie est celle que le message de la garde nomme lui-même, et elle est
 * déjà pratiquée dans ce module par `market-path-axis-source.ts` : **le service
 * dépend d'une interface qu'il POSSÈDE, et c'est le module qui branche
 * l'implémentation.** Après ce lot, `analysis-refresh.service.ts` ne connaît
 * pas le nom de `ProductAnalyticsService`. Le couplage qui reste est un
 * couplage de MODULE, déclaré dans `analysis.module.ts` et vérifié au
 * démarrage.
 *
 * ⚠️ Le port est aussi ÉTROIT que possible : un seul geste, celui qu'on émet
 * réellement. Un port qui recopierait la signature de `track()` — son union
 * fermée de vingt-huit noms d'événements comprise — ferait revenir par la
 * fenêtre le couplage que l'import venait d'éliminer, et permettrait à ce
 * service d'émettre n'importe quel événement du produit.
 *
 * ⚠️ La preuve que `ProductAnalyticsService` SATISFAIT ce port est faite à la
 * COMPILATION, dans `analysis.module.ts` : le fournisseur est déclaré par
 * `useFactory` avec le port en type de retour — jamais `useExisting`, qui
 * n'aurait rien vérifié (le jeton est un symbole, et TypeScript ne le relie à
 * aucune forme).
 */

/** Le jeton d'injection du compteur de vérification payante. */
export const PAID_VERIFICATION_TELEMETRY = Symbol('PAID_VERIFICATION_TELEMETRY')

/**
 * Le SEUL geste que ce module annonce : un utilisateur vient de payer pour
 * aller vérifier, aujourd'hui, ce que la mémoire marché lui donnait gratuitement
 * en lecture.
 *
 * ⚠️ `creditsDebited` compte des CRÉDITS, jamais des euros, et cette mesure se
 * lit par espace — jamais croisée entre espaces, qui sont des ESN concurrentes
 * (`COMMUNITY_FORBIDDEN_KINDS.cost`, GA-43).
 */
export interface PaidVerificationTelemetry {
  paidVerificationTriggered(input: {
    readonly userId: string
    readonly accountId: string
    readonly gesture: string
    readonly creditsDebited: number
  }): void
}
