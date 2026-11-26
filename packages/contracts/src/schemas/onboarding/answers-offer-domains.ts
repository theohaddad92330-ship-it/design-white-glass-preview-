import { z } from 'zod'
import { CONSULTING_DOMAIN_BY_CODE } from '../consulting-domains.js'

/**
 * Le portefeuille d'offre — `offer_domain` (singulier, historique) et
 * `offer_domains` (le portefeuille DATAFORGE).
 *
 * ⚠️ Pourquoi une FONCTION et non un objet comme les autres blocs : ces deux
 * champs sont les seuls à dépendre de l'énumération `OFFER_DOMAINS`, dont la
 * DÉCLARATION doit rester dans `../onboarding.ts` — la garde de parité de l'IA
 * (`apps/ia/tests/test_consulting_domains_parity.py`) l'y lit par son CHEMIN,
 * au texte, et `test_offer_domains.py` se contente de SKIPPER si elle ne trouve
 * pas le fichier : la déplacer rendrait la garde muette au lieu de rouge.
 * Importer l'énum ici ferait un cycle ; on la reçoit donc en paramètre.
 */
export function offerDomainAnswerFields<Values extends Readonly<Record<string, string>>>(
  // Générique et non `z.ZodEnum<[string, ...string[]]>` : ce dernier ÉLARGIT
  // l'union littérale en `string`, et `EsnAnswers['offer_domain']` cesse d'être
  // le huit-uplet de domaines. La régression est invisible à l'exécution — elle
  // ne s'est vue qu'au `tsc` de contracts (analysis.ts:630).
  offerDomainSchema: z.ZodEnum<Values>,
) {
  return {
    // Domaine d'offre (PDF6 §1). `.catch(null)` absorbs BOTH deploy-skew shapes
    // (older API omitting the key, newer API sending a domain this build does
    // not know) and the autosave `''` — anything non-conforming degrades to
    // null = default `esn_it` behaviour, never a parse failure. NOT in
    // TEMPS1_REQUIRED_KEYS: the completion gate is unchanged.
    offer_domain: offerDomainSchema.nullable().catch(null),
    // Portefeuille de domaines de conseil (DATAFORGE V10, D-DF2) — les codes de
    // la taxonomie des 66 (`CONSULTING_DOMAINS`). ADDITIF : `offer_domain`
    // (singulier) reste lu quand le portefeuille est vide. Tolérance par ÉLÉMENT
    // et non par tableau : un code inconnu de CE build (skew de déploiement) est
    // écarté seul — un `.catch([])` global jetterait 12 domaines pour un 13e
    // inconnu. Vide = comportement historique byte-identique. Pas dans
    // TEMPS1_REQUIRED_KEYS (la porte de complétion serveur ne bouge pas) : c'est
    // le FLUX d'onboarding qui exige un choix explicite — la question n'a aucune
    // présélection et `validate` refuse une liste vide.
    offer_domains: z
      .array(z.string())
      .catch([])
      .transform(codes => codes.filter(code => CONSULTING_DOMAIN_BY_CODE.has(code))),
  }
}
