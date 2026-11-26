import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useFirstName } from '@/hooks/useFirstName'
import { AskLaura } from '@/components/primitives/AskLaura'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PartnerPipeline } from '@/features/partner-pipeline/view/PartnerPipeline'

// #3397.3 (LOT C06 30/09, beta-feedback) — « Qualifier la route rang 2 »
// ouvre CETTE relation, jamais la liste nue : la clé littérale que le
// catalogue de liens profonds (`chat_tools.py`, `DEEP_LINK_SCREENS`) déclare
// doit matcher, mot pour mot, celle-ci — sinon `laura-deep-links.test.ts` le
// voit et le refuse (même convention que `account_id` sur `/contacts`).
const partnersSearchSchema = z.object({
  partnerId: z.string().guid().optional().catch(undefined),
})

export const Route = createFileRoute('/accounts/partners')({
  validateSearch: partnersSearchSchema,
  component: PartnersPage,
})

function PartnersPage() {
  const { t } = useTranslation('partnerPipeline')
  const { partnerId } = Route.useSearch()
  // #1319.1 — « Il faut un vrai header orienté usage ». Prénom pris au profil ; l'issue l'écrivait en
  // dur (« Tes partenaires, Maëlle »). Refonte Théo : l'en-tête est DÉCLARÉ à la coque (COQUE.md §2),
  // avec à droite « Demander à Laura d'analyser cette relation » (#1319.7).
  const firstName = useFirstName()
  return (
    <CustomerPage
      anchorId="partenaires"
      pageTitle={firstName ? t('page.introTitle', { firstName }) : t('page.introTitleWithoutName')}
      pageSubtitle={t('page.introSubtitle')}
      headerActions={
        <AskLaura
          variant="prominent"
          alwaysVisible
          label={t('page.askLauraLabel')}
          question={t('page.askLauraQuestion')}
        />
      }
    >
      <PartnerPipeline highlightPartnerId={partnerId} />
    </CustomerPage>
  )
}
