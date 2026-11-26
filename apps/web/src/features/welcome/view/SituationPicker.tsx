import { Box, Card, CardContent, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * « Par où tu commences » — l'onboarding par SITUATION (tome 1 §13.6).
 *
 * Le bêta testeur n'a pas trouvé Découvrir. Il ne savait pas que les signaux
 * existaient : il cherchait la page d'accueil. Le diagnostic du tome tient en
 * une ligne — « l'onboarding présente des FONCTIONNALITÉS, pas des SITUATIONS ».
 *
 * Une liste de fonctionnalités demande à quelqu'un qui arrive de traduire son
 * problème dans notre vocabulaire. Une liste de situations fait l'inverse.
 *
 * QUATRE situations à destination fixe, plus le chemin direct « j'ai déjà un compte en tête » (#5027.1) —
 * une saisie, pas une destination : on tape le nom, on analyse. Pas cinq cartes de plus.
 *
 * QUATRE situations, pas cinq. Le tome en propose une cinquième — « je cherche
 * des partenaires » — dont l'écran n'existe pas encore : il attend le
 * référentiel ESN. La proposer mènerait à une page vide, c'est-à-dire la
 * version onboarding du « livré mais jamais rempli » que le produit s'interdit.
 */
const SITUATIONS = [
  { key: 'starting', to: '/discover' as const, search: { sort: 'addressability' } },
  { key: 'deepen', to: '/accounts' as const, search: {} },
  { key: 'consultant', to: '/consultants' as const, search: {} },
  { key: 'portfolio', to: '/settings/mes-donnees' as const, search: { tab: 'imports' } },
]

export function SituationPicker() {
  const { t } = useTranslation('welcome')
  const navigate = useNavigate()
  const [accountName, setAccountName] = useState('')
  const [profile, setProfile] = useState('')
  const trimmedName = accountName.trim()

  // #5027.1 — compte déjà ciblé : le nom part dans `/search?q=` (même entrée que « Construire le dossier complet »,
  // #4432.5). Un nom vide ne navigue pas.
  const analyzeNamedAccount = () => {
    if (!trimmedName) return
    // #5027.2 — le PROFIL demandé (« Product Owner ») voyage aussi, en preset STRUCTURÉ « pousser une offre »
    // (`offer`, validé par `searchSchema` puis `analysisContextFromSearch`) : une valeur initiale éditable du
    // cadrage. Absent ⇒ rien n'est posé.
    const trimmedProfile = profile.trim()
    void navigate({
      to: '/search',
      search: trimmedProfile ? { q: trimmedName, preset: 'push-offer', offer: trimmedProfile } : { q: trimmedName },
    })
  }

  return (
    <Box display="flex" className="flex-col gap-2">
      <Text size="sm" weight="semibold">
        {t('situations.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('situations.help')}
      </Text>
      <div className="grid gap-2 sm:grid-cols-2">
        {SITUATIONS.map(situation => (
          <Card
            key={situation.key}
            className="cursor-pointer transition-colors hover:bg-[color:var(--bg-surface-hover)]"
            onClick={() => void navigate({ to: situation.to, search: situation.search })}
          >
            <CardContent className="flex flex-col gap-1 p-3">
              <Text size="sm" weight="semibold">
                {t(`situations.${situation.key}.label`)}
              </Text>
              {/* Le PARCOURS est annoncé, pas seulement la destination : savoir
                  où l'on va évite d'ouvrir un écran sans comprendre pourquoi on
                  y est. */}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t(`situations.${situation.key}.path`)}
              </Text>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="flex flex-col gap-2 p-3">
            <Text size="sm" weight="semibold">
              {t('situations.named.label')}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('situations.named.path')}
            </Text>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={event => {
                event.preventDefault()
                analyzeNamedAccount()
              }}
            >
              <input
                type="text"
                value={accountName}
                onChange={event => setAccountName(event.target.value)}
                aria-label={t('situations.named.inputLabel')}
                placeholder={t('situations.named.placeholder')}
                maxLength={200}
                className="min-h-11 w-full rounded-md border border-[color:var(--bellum-border)] bg-transparent px-3 text-sm"
              />
              <input
                type="text"
                value={profile}
                onChange={event => setProfile(event.target.value)}
                aria-label={t('situations.named.profileLabel')}
                placeholder={t('situations.named.profilePlaceholder')}
                maxLength={80}
                className="min-h-11 w-full rounded-md border border-[color:var(--bellum-border)] bg-transparent px-3 text-sm"
              />
              <button
                type="submit"
                disabled={!trimmedName}
                className="min-h-11 shrink-0 rounded-md px-4 text-sm font-semibold disabled:opacity-50"
              >
                {t('situations.named.cta')}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Box>
  )
}
