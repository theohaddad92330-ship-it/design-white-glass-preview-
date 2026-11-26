import type { Contact } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useConfirmContactIdentity } from '@/features/contacts/hooks/useConfirmContactIdentity'
import { ContactRecommendationAuthorizationCard } from './ContactRecommendationAuthorizationCard'
import { ContactStopCard } from './ContactStopCard'
import { SectionCard } from './SectionCard'

/**
 * #2160.29 — la carte « Corrections », qui manquait : les gestes de correction
 * de la fiche vivaient épars, sans endroit unique à regarder.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REGROUPE, ET CE QU'ELLE NE DÉPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Les gestes du point #2160.54-60 portent sur DEUX axes différents :
 *  - « mauvaise entreprise » (#2160.54) / « mauvais poste » (#2160.55) sont
 *    des corrections de CHAMP — elles vivent déjà dans l'éditeur de fiche
 *    (`ContactRecordCard`, juste au-dessus dans l'onglet Résumé) et restent
 *    là : les en extraire romprait `ContactCorePatch` (GA-26, un réglage vit à
 *    un seul endroit) pour un déplacement purement visuel.

 *  - « mauvaise personne » (#2160.56), « ne plus contacter » (#2160.57),
 *    « relation existante » (#2160.59), « bon contact » (#2160.58) et
 *    « autoriser la recommandation » (#2160.60, NOUVEAU) sont des VERDICTS
 *    sur l'identité — c'est cet axe que cette carte réunit, physiquement,
 *    sous un seul titre.
 *
 * #2160.60 — « Autoriser la recommandation » (`ContactRecommendationAuthorizationCard`)
 * lève, sur CETTE fiche, un doute d'identité (`homonym_conflict` /
 * `entity_mismatch`) à la porte d'éligibilité du classement
 * (`contact-eligibility.ts`). Elle ne s'affiche QUE quand ce contact est
 * ACTUELLEMENT écarté pour l'une de ces deux raisons — jamais pour un écart de
 * permission ou un fait de cycle de vie, que ce geste ne lève jamais.
 *
 * ⚠️ Le namespace i18n `contacts:corrections.*` EXISTAIT DÉJÀ —
 * `ContactCorrectionsHistory.tsx` (onglet Activité), le JOURNAL des
 * corrections de champ passées. Cette carte-ci (onglet Résumé) est le GESTE,
 * pas le journal : même mot « Corrections », même clé `corrections.title`
 * réutilisée à dessein (GA-26 — un réglage vit à un seul endroit, jamais deux
 * clés pour le même mot), et les CINQ clés ajoutées ici (`explain`,
 * `confirmAction`, `confirmedSince`, `confirmDone`, `confirmError`) vivent
 * dans le MÊME objet JSON que son journal, jamais un second `"corrections"`
 * top-level — une collision de clé JSON écraserait silencieusement l'un des
 * deux (mesuré en écrivant ce lot : `subtitle`/`loading`/`empty` du journal
 * disparaissaient).
 */
export function ContactCorrectionsCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const confirm = useConfirmContactIdentity(contact.id)
  const confirmedAt = contact.identity_confirmed_at ?? null
  const confirmedLabel = formatDate(confirmedAt, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <SectionCard icon={ShieldCheck} title={t('corrections.title')}>
      <Text element="p" size="sm" color="text-muted-foreground" className="mb-4">
        {t('corrections.explain')}
      </Text>
      <Box className="mb-4">
        {confirmedLabel ? (
          <Badge variant="outline" className="gap-1 border-[var(--bellum-success)] text-[var(--success-soft-text)]">
            <CheckCircle2 className="size-3" />
            {t('corrections.confirmedSince', { date: confirmedLabel })}
          </Badge>
        ) : (
          <Button size="sm" variant="outline" isLoading={confirm.isPending} onClick={() => confirm.mutate()}>
            {t('corrections.confirmAction')}
          </Button>
        )}
      </Box>
      <ContactStopCard contactId={contact.id} />
      <ContactRecommendationAuthorizationCard contact={contact} />
    </SectionCard>
  )
}
