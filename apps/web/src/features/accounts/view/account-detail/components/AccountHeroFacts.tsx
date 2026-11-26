import type { Account } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { accountSizeFact, headquartersCity } from '../tabs/synthesis/accountSynthesis'

const EMPLOYEES_WORD = /salari|employee|collaborat|staff/i
// #3861 (VU, recette prod 09/10, Sanofi) — « mondial salariés » : la colonne
// `employees` porte parfois un SCOPE (« mondial »), jamais un effectif
// chiffré — le registre ne connaît l'ampleur du groupe que par sa portée.
// Accoler « salariés » à un mot sans AUCUN chiffre produit un non-sens.
const HAS_DIGIT = /\d/

/**
 * #3499 — siège et taille sur la ligne d'identité du compte (décision 1.a).
 * Chaque fait absent est OMIS : ni « non renseigné », ni tiret, ni ville
 * devinée depuis un site ou une filiale (« BPCE SI — Strasbourg » n'est pas le
 * siège du Groupe BPCE).
 */
export function AccountHeroFacts({ account }: { account: Pick<Account, 'headquarters' | 'employees' | 'revenue'> }) {
  const { t } = useTranslation('accountDetail')
  const city = headquartersCity(account.headquarters)
  const size = accountSizeFact(account)
  return (
    <>
      {city ? (
        <Text
          element="p"
          size="sm"
          data-testid="hero-fact-headquarters"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t('synthesis.identity.headquarters', { city })}
        </Text>
      ) : null}
      {size ? (
        <Text element="p" size="sm" data-testid="hero-fact-size" className="text-[var(--bellum-text-secondary)]">
          {/* #3499 : la valeur arrive parfois déjà suffixée (« 1 000 à 1 999 salariés ») — pas de second mot.
              #3861 : ou c'est un SCOPE sans aucun chiffre (« mondial ») — pas un effectif à suffixer. */}
          {size.kind === 'employees' && (EMPLOYEES_WORD.test(size.value) || !HAS_DIGIT.test(size.value))
            ? size.value
            : t(`synthesis.identity.${size.kind}`, { value: size.value })}
        </Text>
      ) : null}
    </>
  )
}
