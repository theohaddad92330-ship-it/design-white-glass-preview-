import { Injectable, NotFoundException } from '@nestjs/common'
import { dropInternshipRows } from '@bellum/contracts'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { buildDeck, composeDeckSlides } from './deck-builder'
import { buildWordDocument, buildWorkbook, safeFileName, type DocSection } from './document-builders'
import { buildPdfDocument } from './pdf-builder'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'
import { type BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'

/**
 * Une ligne de « Signaux récents ».
 *
 * Vu en production : cette lecture cherchait la clé `label`, qui n'existe nulle
 * part. Le contrat (`recentSignalSchema`) nomme le champ **`signal`**. Résultat,
 * la section la plus vendeuse du dossier ne contenait que des dates nues —
 * « 2026-05-12 », trois fois — dans les trois livrables à la fois, puisqu'ils
 * partagent ce modèle de contenu.
 *
 * `label` est gardé en repli : un dossier ancien peut porter l'autre forme, et
 * on préfère lire les deux que réécrire l'historique.
 *
 * L'implication commerciale suit le signal quand elle existe. C'est elle que le
 * commercial relit avant l'appel ; sans elle, la section n'est qu'une revue de
 * presse.
 */
export function readSignal(signal: unknown): string {
  if (typeof signal !== 'object' || signal === null) return ''
  const field = (key: string) => String(Reflect.get(signal, key) ?? '').trim()
  const headline = field('signal') || field('label')
  if (!headline) return ''
  const dated = [headline, field('date')].filter(Boolean).join(' — ')
  const implication = field('sales_implication')
  return implication ? `${dated} — ${implication}` : dated
}

/**
 * Un chiffre d'affaires lisible par un humain.
 *
 * Le registre le rend en euros bruts. Le document imprimait donc « Chiffre
 * d'affaires : 756714000 » — vu sur un dossier réel le 04/08, dans un fichier
 * qu'on envoie au client. Personne ne lit neuf chiffres collés : il faut
 * compter les groupes pour savoir si c'est 75 millions ou 756.
 *
 * On met en forme, on n'invente pas : au-dessus du million on abrège en M€ avec
 * une décimale (« 756,7 M€ »), en dessous on groupe les milliers. Une valeur qui
 * n'est PAS un nombre est rendue telle quelle — l'analyse écrit parfois
 * « ≈ 3,4 Md€ (est. 2025) », et reformater ça détruirait l'estimation.
 */
export function formatRevenue(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (text === '') return null

  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) return text

  if (amount >= 1_000_000_000)
    return `${(amount / 1_000_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md€`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
  return `${amount.toLocaleString('fr-FR')} €`
}

/**
 * La note du compte, écrite comme l'ÉCRAN l'écrit.
 *
 * Vu en ouvrant le PDF produit en production : le document annonçait « Score
 * Bellum : 8/25 » là où l'écran, la veille, le tableau de bord, les besoins et
 * les exports déjà existants affichent tous « 8/10 ». Le document qu'on envoie
 * au client contredisait donc l'application, sur le chiffre qu'on lit en
 * premier.
 *
 * La règle de l'écran (`ScoreSummaryCard`) est double, et c'est elle qu'on
 * reprend : la grille canonique est celle de l'annexe méthodo, sur 25 points —
 * Fit, Timing, Accessibilité, Concurrence, Capacité — quand le dossier la porte
 * (`raw_analysis.evaluation.score`) ; sur 10 sinon, pour un dossier plus ancien
 * qui n'a que la projection. Ce qui était faux n'était donc pas le dénominateur
 * en soi mais le COUPLE : on divisait la note sur 10 par 25.
 */
export function readScoreLine(
  account: { priority_score?: number | null; raw_analysis?: unknown },
  brandName: string,
): string | undefined {
  const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const plan = asRecord(raw['plan'])
  // Mêmes emplacements que l'écran, dans le même ordre.
  for (const source of [raw['evaluation'], plan['evaluation'], raw['evaluation_compte']]) {
    const score = asRecord(source)['score']
    if (typeof score === 'number' && Number.isFinite(score)) {
      return `Score ${brandName} : ${Math.max(0, Math.min(25, Math.round(score)))}/25`
    }
  }
  if (account.priority_score == null) return undefined
  return `Score ${brandName} : ${account.priority_score}/10`
}

/**
 * Les livrables : un classeur de contacts, et le dossier de compte en Word, en
 * PDF et en présentation — trois rendus d'UN seul modèle de contenu.
 *
 * Le service ne fait que deux choses — vérifier l'appartenance, puis mettre en
 * page ce que les modules existants savent déjà lire. Aucune donnée n'est
 * recalculée ici : un export qui produirait des chiffres différents de l'écran
 * serait pire que pas d'export du tout.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly brands: WorkspaceBrandService,
  ) {}

  /**
   * La marque de l'espace de CET utilisateur — marque blanche, 01/09/2026.
   *
   * ⚠️ Elle n'est pas de la décoration ici : elle entre dans les PROPRIÉTÉS du
   * fichier (`creator`, `author`), qui voyagent avec lui, et dans deux libellés
   * du contenu (« Score X », « Lecture X »). Un client envoie ces documents à
   * SON client — c'est le cas d'usage entier de la marque blanche.
   */
  private async brandName(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const brand = await this.brands.getForWorkspace(workspaceId)
    return brand.name
  }

  /**
   * Vérifie l'appartenance AVANT toute lecture — jamais le dossier d'une autre
   * équipe, et depuis le 15/09/2026 jamais celui d'un autre PÉRIMÈTRE.
   *
   * ⚠️ Le périmètre arrive en paramètre, résolu par le contrôleur : ce service
   * n'importe pas `BusinessUnitService` (GA-07 refuse un import service →
   * service et dit que l'orchestration vit dans le contrôleur). Un export sans
   * périmètre serait la sortie de secours la plus évidente — un membre
   * cloisonné qui ne peut pas OUVRIR un dossier pouvait le TÉLÉCHARGER.
   */
  private async requireAccount(accountId: string, userId: string, businessUnitScope: BusinessUnitScopeClause) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const result = await this.accounts.findOneForWorkspace(accountId, workspaceId, businessUnitScope)
    if (result.type !== 'success') throw new NotFoundException('Compte introuvable.')
    return result.output
  }

  async contactsWorkbook(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ name: string; buffer: Buffer }> {
    const account = await this.requireAccount(accountId, userId, businessUnitScope)
    const contacts = await this.contacts.findByAccount(accountId, userId)

    const buffer = await buildWorkbook({
      brandName: await this.brandName(userId),
      sheetName: 'Contacts',
      columns: [
        { header: 'Nom' },
        { header: 'Fonction', width: 36 },
        { header: 'Entité' },
        { header: 'Email' },
        { header: 'Téléphone' },
        { header: 'LinkedIn', width: 40 },
        { header: 'Statut' },
      ],
      // Une valeur absente reste une cellule VIDE. Écrire « N/A » se lit comme
      // une donnée, et quelqu'un finira par appeler un « N/A ».
      rows: contacts.map(contact => [
        contact.full_name ?? '',
        contact.title ?? '',
        contact.entity ?? '',
        contact.email ?? '',
        contact.phone ?? '',
        contact.linkedin_url ?? '',
        contact.user_status ?? '',
      ]),
    })

    return { name: safeFileName(`${account.company_name}-contacts`, 'xlsx'), buffer }
  }

  /**
   * Le CONTENU du dossier de compte, indépendant du format.
   *
   * Trois livrables en sortent — Word, PDF et présentation — et c'est
   * exactement le point : le PDF natif n'était pas livré jusqu'ici de peur
   * qu'il « diverge de la mise en page Word ». Une source unique règle
   * l'objection en amont. Les trois peuvent être espacés différemment ; ils ne
   * peuvent pas contenir des sections différentes.
   *
   * On reprend TEL QUEL ce que l'analyse a produit — pas de reformulation à la
   * volée. Un document qui dirait autre chose que l'écran ferait douter des
   * deux.
   */
  private async accountContent(
    accountId: string,
    userId: string,
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ title: string; subtitle?: string; sections: DocSection[]; slug: string; brandName: string }> {
    const account = await this.requireAccount(accountId, userId, businessUnitScope)
    const brandName = await this.brandName(userId)
    const contacts = await this.contacts.findByAccount(accountId, userId)

    const identity = [
      account.sector ? `Secteur : ${account.sector}` : '',
      account.employees ? `Effectif : ${account.employees}` : '',
      formatRevenue(account.revenue) ? `Chiffre d'affaires : ${formatRevenue(account.revenue)}` : '',
      account.headquarters ? `Siège : ${account.headquarters}` : '',
      account.website ? `Site : ${account.website}` : '',
    ].filter(Boolean)

    // #4044 — une offre de stage n'est jamais un signal : pas dans le document généré.
    const signals = dropInternshipRows(account.recent_signals ?? [], { jobsOnly: true })
      .map(readSignal)
      .filter(Boolean)

    const sections: DocSection[] = [
      { heading: 'Identité', paragraphs: identity },
      {
        heading: `Lecture ${brandName}`,
        paragraphs: [account.priority_justification ?? ''],
      },
      { heading: 'Signaux récents', paragraphs: signals },
      {
        heading: 'Interlocuteurs',
        paragraphs: contacts
          .slice(0, 40)
          .map(contact => [contact.full_name, contact.title, contact.entity].filter(Boolean).join(' — ')),
      },
    ]

    // La MENTION DE GÉNÉRATION (tome 5 §18), en dernière section et donc en
    // dernière page de chaque format.
    //
    // Sans elle, un document de six mois circule dans une équipe comme s'il
    // était à jour — c'est la première faiblesse que le tome relève dans le
    // document humain qui lui sert de modèle. Elle porte la date ET le fait que
    // les informations d'accès sont des estimations : un deck partagé en
    // interne se lit sans son auteur à côté pour le nuancer.
    sections.push({
      heading: 'À propos de ce document',
      paragraphs: [generationNotice(new Date())],
    })

    return {
      title: `Plan de compte — ${account.company_name}`,
      subtitle: readScoreLine(account, brandName),
      sections,
      slug: `${account.company_name}-plan-de-compte`,
      brandName,
    }
  }

  /** Le dossier de compte en Word. */
  async accountDossier(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ name: string; buffer: Buffer }> {
    const content = await this.accountContent(accountId, userId, businessUnitScope)
    return { name: safeFileName(content.slug, 'docx'), buffer: await buildWordDocument(content) }
  }

  /**
   * Le même dossier en PDF NATIF (arbitrage Louis du 03/08).
   *
   * Ne dépend d'aucun connecteur : une ESN sous Microsoft, ou sans suite
   * bureautique branchée, n'avait aucun chemin vers un PDF jusqu'ici.
   */
  async accountDossierPdf(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ name: string; buffer: Buffer }> {
    const content = await this.accountContent(accountId, userId, businessUnitScope)
    return { name: safeFileName(content.slug, 'pdf'), buffer: await buildPdfDocument(content) }
  }

  /** Le même dossier en présentation, pour le comité où on le raconte. */
  async accountDeck(
    accountId: string,
    userId: string,
    /** Le périmètre (BU) de l'appelant, RÉSOLU PAR LE CONTRÔLEUR. */
    businessUnitScope: BusinessUnitScopeClause = null,
  ): Promise<{ name: string; buffer: Buffer }> {
    const content = await this.accountContent(accountId, userId, businessUnitScope)
    return {
      name: safeFileName(content.slug, 'pptx'),
      buffer: await buildDeck(composeDeckSlides(content), content.brandName),
    }
  }
}

/**
 * La mention obligatoire au pied d'un livrable exporté.
 *
 * Exportée pour être TESTÉE : c'est une phrase qui engage — elle dit à celui
 * qui reçoit le document quand il a été produit et ce qu'il ne faut pas y lire.
 */
export function generationNotice(now: Date): string {
  const stamp = now.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })
  return `Généré le ${stamp}. Les informations d'accès sont des estimations, à vérifier au premier contact.`
}
