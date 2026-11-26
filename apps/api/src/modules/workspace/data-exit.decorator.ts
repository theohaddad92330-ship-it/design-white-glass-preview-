import { SetMetadata } from '@nestjs/common'

export const DATA_EXIT_KEY = 'workspace:data-exit'

/**
 * #2081.14 — CETTE ROUTE FAIT SORTIR DES DONNÉES DE L'ESPACE : un CSV, un
 * fichier téléchargé, un export vers un tableur ou un outil externe.
 *
 * DÉCISION Louis 19/09/2026 (QCM) — c'est ce marqueur, et non la permission
 * `data:export`, que lit la règle d'espace « qui peut exporter ». La
 * permission garde aussi l'import, les liens de partage, l'envoi à
 * signature, l'explication de matching et le versement des appels au CRM ;
 * une règle posée sur elle les fermait tous.
 *
 * Lu par `WorkspacePermissionGuard` — la route doit donc être gardée par lui
 * (`@UseGuards(JwtGuard, WorkspacePermissionGuard)`, sur la classe ou sur la
 * méthode). La garde d'architecture `data-exit-routes.spec.ts` tient les deux :
 * toute route qui sert un fichier ou pousse vers un outil externe porte ce
 * marqueur ET ce guard, sauf exemption écrite avec sa raison.
 *
 * Ce marqueur n'OUVRE rien : il ne remplace pas `@RequirePermission`, il
 * ajoute la règle d'espace par-dessus le rôle et les accords.
 *
 * ⚠️ GA-05 lit ce qui SUIT chaque `@Get`/`@Post` : le poser APRÈS le verbe.
 */
export const DataExit = () => SetMetadata(DATA_EXIT_KEY, true)
