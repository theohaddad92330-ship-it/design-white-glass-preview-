import { MARKET_REVIEW_QUEUE_MAX, type MarketReviewItem } from '@bellum/contracts'
import { Button, Input, SectionCard, Text } from '@bellum/ui'
import { GitBranch } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useMarketMemoryPortfolio, useRecordMarketResolution } from '../api'

/**
 * #1633.3 — LA FILE DES COMPTES À DÉPARTAGER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS DES CINQ FILES DEMANDÉES, ET POURQUOI PAS LES CINQ
 * ─────────────────────────────────────────────────────────────────────────────
 * #1633 en nomme cinq. Celle-ci en porte trois, et les deux autres ont leur
 * réponse ailleurs :
 *
 * · « résolution entreprise ambiguë » et « homonymie signalée » sont ici, et
 *   SÉPARÉES par leur raison — départager deux lignes qui partagent un domaine
 *   n'est pas le même geste que départager deux entreprises homonymes ;
 * · « entreprise non résolue » est un COMPTEUR et non une file : il n'y a rien
 *   à arbitrer, le corpus ne connaît simplement pas l'entreprise. En faire une
 *   liste de gestes proposerait un travail qui n'existe pas ;
 * · « alias technologique inconnu » est DÉJÀ en production sur cet écran —
 *   `SkillAliasQueue`, monté par `CataloguesPage.tsx` ;
 * · « relation corrigée par utilisateur » EXISTE depuis #1617.4 — voir le bloc
 *   suivant. ⚠️ Jusqu'au 11/09/2026 ce docbloc affirmait l'inverse : que rien
 *   n'enregistrait la correction d'un humain. C'était vrai le jour où la phrase
 *   a été écrite, et faux le lendemain de ce lot. Un récit de défaut laissé
 *   dans un commentaire survit à sa correction et se relit comme une vérité du
 *   jour — la phrase est donc RETIRÉE, pas citée, et une garde de
 *   `MarketReviewQueue.test.tsx` échoue si elle revient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1617.4 — CE QUE LA FILE FAIT MAINTENANT, ET CE QU'ELLE NE FERA JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque ligne porte le GESTE qui la fait disparaître : « c'est bien cette
 * entreprise » (parmi les candidates NOMMÉES) ou « ce n'est pas exact ». Avant,
 * la file annonçait un arbitrage qu'aucun clic ne pouvait rendre : elle ouvrait
 * le dossier du compte, où il n'y avait rien de plus à faire.
 *
 * Ce que le geste n'est PAS : une écriture dans la mémoire marché. Le corpus
 * est PARTAGÉ entre des espaces qui sont des ESN, donc des concurrents, et il
 * reste en lecture seule pour tout le produit. La décision vit dans une table
 * SCOPÉE et se SUPERPOSE à la lecture — « on PROPOSE, on ne fusionne jamais »
 * vaut ici aussi : rien n'est réécrit dessous, et la décision d'un espace ne
 * devient jamais la vérité d'un autre.
 *
 * ⚠️ Le geste ne s'affiche QUE si l'API nomme les candidates (`companies`).
 * Pendant la fenêtre d'un déploiement — web neuf, API ancienne — le champ est
 * absent, et un bouton qui ouvrirait une liste vide serait un geste promis et
 * impossible. Sans lui, la ligne redevient exactement ce qu'elle était.
 */
export function MarketReviewQueue() {
  const { t } = useTranslation('marketMemory')
  const { data, isLoading, isError } = useMarketMemoryPortfolio()

  // ⚠️ `!== 'ok'` et non `=== 'unavailable'` — voir la raison écrite en
  // entier dans `MarketMemoryCoverageCard`. Une forme inattendue (API plus
  // ancienne que le web pendant un déploiement) doit se taire, pas jeter.
  if (isLoading || isError || !data || data.status !== 'ok') return null

  const { review, coverage } = data

  return (
    <SectionCard icon={GitBranch} title={t('review.title')} description={t('review.intro')}>
      {review.length === 0 ? (
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('review.empty')}
        </Text>
      ) : (
        <ul className="divide-y divide-[var(--bellum-border)]">
          {review.map(item => (
            <MarketReviewRow key={item.accountId} item={item} />
          ))}
        </ul>
      )}

      {/* La file est PLAFONNÉE : sans cette ligne, « 20 » se lirait comme le
          total et un portefeuille à 60 ambiguïtés paraîtrait en bonne santé. */}
      {coverage.ambiguous > review.length && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
          {t('review.truncated', { shown: MARKET_REVIEW_QUEUE_MAX, total: coverage.ambiguous })}
        </Text>
      )}
    </SectionCard>
  )
}

/**
 * #1617.4 — une ligne, et le panneau qui la tranche.
 *
 * Composant SÉPARÉ parce qu'il porte un état (ouvert / fermé, la raison en
 * cours de frappe) : le tenir dans un dictionnaire au niveau de la file
 * obligerait à indexer chaque champ par identifiant de compte, et deux lignes
 * ouvertes en même temps se liraient comme un seul panneau.
 */
function MarketReviewRow({ item }: { item: MarketReviewItem }) {
  const { t } = useTranslation('marketMemory')
  const decide = useRecordMarketResolution()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const panelId = useId()

  const companies = item.companies ?? []
  const decidable = companies.length > 0

  const send = (decision: { decision: 'confirmed'; marketCompanyKey: string } | { decision: 'dismissed' }) => {
    decide
      .mutateAsync({
        accountId: item.accountId,
        ...decision,
        // Une chaîne blanche n'est pas une raison : `null` et non `''`, pour
        // que la colonne dise « personne n'a écrit de raison » et non « quelqu'un
        // a écrit du vide ».
        note: note.trim() || null,
      })
      // ⚠️ Le message vient de la RÉPONSE du serveur, pas du bouton cliqué :
      // c'est la décision ENREGISTRÉE qu'on annonce, jamais celle qu'on croit
      // avoir envoyée.
      .then(record => {
        setOpen(false)
        setNote('')
        toast.success(t(record.decision === 'confirmed' ? 'review.decide.confirmed' : 'review.decide.dismissed'))
      })
      .catch((error: Error) => toast.error(error.message || t('review.decide.failed')))
  }

  return (
    <li className="py-2">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
        {/* Un lien, pas un `div` cliquable : ce qui se clique se tabule. */}
        <Link
          to="/accounts/$id"
          params={{ id: item.accountId }}
          className="text-sm text-[var(--bellum-text-accent)] underline"
        >
          {item.accountName}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t(`review.reason.${item.reason}`, { count: item.candidates })}
          </Text>
          {decidable && (
            <Button
              size="xs"
              variant="outline"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(previous => !previous)}
            >
              {open ? t('review.decide.close') : t('review.decide.open')}
            </Button>
          )}
        </div>
      </div>

      {decidable && open && (
        <div id={panelId} className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--bellum-border)] pl-3">
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('review.decide.question', { account: item.accountName })}
          </Text>
          <ul className="flex flex-col gap-1">
            {companies.map(company => (
              <li key={company.companyKey}>
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-auto min-h-11 w-full justify-start py-2 text-left"
                  disabled={decide.isPending}
                  onClick={() => send({ decision: 'confirmed', marketCompanyKey: company.companyKey })}
                >
                  {/* Ce qui départage DEUX entreprises, et rien de plus : ni
                      comptage de parcours (un candidat sous le seuil se lirait
                      comme une mesure alors que c'est du bruit), ni date. Un
                      domaine ou un pays absent ne s'affiche PAS — il ne se
                      remplace pas par un tiret. */}
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span>{company.companyName}</span>
                    {company.websiteDomain && (
                      <span className="text-[var(--bellum-text-muted)]">{company.websiteDomain}</span>
                    )}
                    {company.country && <span className="text-[var(--bellum-text-muted)]">{company.country}</span>}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <Input
            value={note}
            aria-label={t('review.decide.noteLabel')}
            placeholder={t('review.decide.notePlaceholder')}
            className="h-9"
            onChange={event => setNote(event.target.value)}
          />
          <Button
            size="xs"
            variant="ghost"
            className="min-h-11 self-start"
            disabled={decide.isPending}
            onClick={() => send({ decision: 'dismissed' })}
          >
            {t('review.decide.dismiss')}
          </Button>
        </div>
      )}
    </li>
  )
}
