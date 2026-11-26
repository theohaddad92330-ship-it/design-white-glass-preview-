/**
 * Qui est en face — avant d'écrire quoi que ce soit.
 *
 * §10 du rapport besoins, exigence « Classification des interlocuteurs » :
 * « déterminer client, prospect, consultant, candidat, collègue, partenaire ou
 * fournisseur AVANT de rédiger ».
 *
 * Ce n'est pas une coquetterie de segmentation. Le même message envoyé à un
 * candidat et à un directeur achats est deux fautes différentes : l'un se sent
 * démarché, l'autre se sent traité comme un fournisseur. Et le pire cas est
 * celui qu'un modèle ne rattrape jamais tout seul — écrire un message de
 * prospection à un COLLÈGUE, parce que son adresse ressemble à celle d'un
 * client.
 *
 * La classification est DÉTERMINISTE. Un modèle qui range la même personne
 * différemment d'un jour sur l'autre ferait changer le ton d'une conversation en
 * cours, ce qui se remarque immédiatement.
 *
 * Elle rend aussi sa CONFIANCE et ses raisons. Un « je ne sais pas » explicite
 * vaut mieux qu'un « prospect » par défaut : le premier fait poser la question,
 * le second fait envoyer le mauvais message.
 */

type InterlocutorKind =
  | 'colleague'
  | 'client'
  | 'prospect'
  | 'consultant'
  | 'candidate'
  | 'partner'
  | 'supplier'
  | 'unknown'

type InterlocutorSignals = {
  email?: string | null
  /** Le domaine de l'ESN elle-même — ce qui distingue un collègue de tout autre. */
  ownDomain?: string | null
  /** Le contact est-il rattaché à un compte dont l'ESN est déjà cliente ? */
  hasSignedBusiness?: boolean | null
  /** Le contact est-il un consultant du vivier ? */
  isInternalConsultant?: boolean | null
  /** A-t-il postulé / envoyé un CV ? */
  hasApplied?: boolean | null
  /** Intitulé de poste, tel qu'il est connu. */
  title?: string | null
  /** Relation déclarée dans le CRM, quand elle existe. */
  crmRelationship?: string | null
}

type InterlocutorVerdict = {
  kind: InterlocutorKind
  /** 0 à 1. Une classification à faible confiance doit être MONTRÉE, pas utilisée
   *  en silence pour choisir un ton. */
  confidence: number
  /** Ce sur quoi la décision repose, en clair. */
  reasons: string[]
}

const SUPPLIER_TITLES = ['account executive', 'business developer', 'commercial', 'sales', 'ae ', 'sdr']

function domainOf(email: string | null | undefined): string | null {
  const at = (email ?? '').lastIndexOf('@')
  if (at < 0) return null
  const domain = email!
    .slice(at + 1)
    .trim()
    .toLowerCase()
  return domain || null
}

/**
 * Classe un interlocuteur à partir de ce qu'on sait de lui.
 *
 * L'ordre des règles est l'ordre du RISQUE, pas celui de la fréquence : on
 * élimine d'abord ce qui ferait la faute la plus coûteuse. Un collègue pris pour
 * un prospect reçoit une séquence de prospection ; un candidat pris pour un
 * client reçoit une proposition commerciale.
 */
export function classifyInterlocutor(signals: InterlocutorSignals): InterlocutorVerdict {
  const reasons: string[] = []
  const domain = domainOf(signals.email)
  const own =
    signals.ownDomain
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, '') || null

  // 1. Le collègue d'abord. C'est la faute la plus embarrassante et la plus
  //    facile à éviter : même domaine que l'ESN.
  if (domain && own && domain === own) {
    return { kind: 'colleague', confidence: 1, reasons: ['Même domaine que ton entreprise'] }
  }

  // 2. Le candidat ensuite : lui écrire un message commercial est une faute qui
  //    se voit, et le signal (« il a postulé ») est explicite.
  if (signals.hasApplied === true) {
    return { kind: 'candidate', confidence: 0.9, reasons: ['A postulé ou envoyé un CV'] }
  }

  // 3. Le consultant du vivier — interne au sens commercial, même s'il est
  //    indépendant.
  if (signals.isInternalConsultant === true) {
    return { kind: 'consultant', confidence: 0.9, reasons: ['Présent dans ton vivier'] }
  }

  // 4. La relation déclarée dans le CRM fait foi quand elle existe : quelqu'un
  //    l'a saisie en connaissance de cause.
  const declared = (signals.crmRelationship ?? '').trim().toLowerCase()
  if (declared) {
    const mapped: InterlocutorKind | null =
      declared.includes('client') || declared.includes('customer')
        ? 'client'
        : declared.includes('partner') || declared.includes('partenaire')
          ? 'partner'
          : declared.includes('fournisseur') || declared.includes('supplier')
            ? 'supplier'
            : declared.includes('prospect')
              ? 'prospect'
              : null
    if (mapped) return { kind: mapped, confidence: 0.85, reasons: [`Relation déclarée dans le CRM : ${declared}`] }
  }

  // 5. Une affaire signée fait un client. Sans elle, au mieux un prospect.
  if (signals.hasSignedBusiness === true) {
    return { kind: 'client', confidence: 0.8, reasons: ['Affaire signée avec ce compte'] }
  }

  // 6. Un commercial d'une AUTRE société qui écrit à une ESN vend quelque chose :
  //    le traiter en prospect fait perdre du temps aux deux.
  const title = (signals.title ?? '').toLowerCase()
  if (title && SUPPLIER_TITLES.some(marker => title.includes(marker))) {
    reasons.push('Intitulé commercial chez une autre société')
    return { kind: 'supplier', confidence: 0.5, reasons }
  }

  // 7. Par défaut, prospect — mais avec une confiance FAIBLE et la raison
  //    écrite. C'est cette confiance qui doit être affichée plutôt que masquée.
  if (domain) {
    return {
      kind: 'prospect',
      confidence: 0.4,
      reasons: ['Aucun signe de relation existante — classé prospect par défaut'],
    }
  }

  return { kind: 'unknown', confidence: 0, reasons: ['Pas assez d’éléments pour trancher'] }
}
