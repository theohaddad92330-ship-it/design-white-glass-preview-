import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: 'Accord de traitement des données',
    description: "Accord de traitement des données (DPA) au sens de l'article 28 du RGPD pour la plateforme BellumAI.",
  },
  en: {
    title: 'Data Processing Agreement',
    description:
      'Data Processing Agreement (DPA) within the meaning of Article 28 of the GDPR for the BellumAI platform.',
  },
  de: {
    title: 'Auftragsverarbeitungsvertrag',
    description: 'Auftragsverarbeitungsvertrag (DPA) im Sinne von Artikel 28 DSGVO für die BellumAI-Plattform.',
  },
  nl: {
    title: 'Verwerkersovereenkomst',
    description: 'Verwerkersovereenkomst (DPA) in de zin van artikel 28 van de GDPR voor het BellumAI-platform.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/dpa'),
  }
}

const LINK = 'text-violet-300 transition-colors hover:text-violet-200'

export default async function DpaPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Auftragsverarbeitungsvertrag"
        intro="Auftragsverarbeitungsvertrag (Data Processing Agreement, DPA) im Sinne von Artikel 28 DSGVO."
        lastUpdated="25. Mai 2026"
        sections={[
          {
            id: 'objet',
            title: 'Gegenstand',
            body: (
              <p>
                Dieser Auftragsverarbeitungsvertrag (nachfolgend der „DPA“) ergänzt die Allgemeinen Verkaufsbedingungen
                und die Allgemeinen Nutzungsbedingungen und regelt die jeweiligen Pflichten von BELLUM, handelnd als
                Auftragsverarbeiter im Sinne von Artikel 28 DSGVO (nachfolgend der „Auftragsverarbeiter“), und des
                Kunden, handelnd als Verantwortlicher (nachfolgend der „Verantwortliche“), in Bezug auf die Verarbeitung
                personenbezogener Daten.
              </p>
            ),
          },
          {
            id: 'traitements',
            title: 'Durchgeführte Verarbeitungen',
            body: (
              <p>
                Im Rahmen der Erbringung der BellumAI-Dienste verarbeitet der Auftragsverarbeiter im Auftrag des
                Verantwortlichen die folgenden Datenkategorien: Identifikationsdaten geschäftlicher Kontakte (Namen,
                Vornamen, Funktionen, geschäftliche Kontaktdaten); Daten zu Zielunternehmen (Firmenname, Finanzdaten,
                Mitarbeiterzahl, Tätigkeit); Nutzungsdaten des Kunden (gestartete Analysen, generierte Nachrichten,
                durchgeführte Aktionen). Betroffene Personen sind die im Rahmen der B2B-Vertriebsakquise des Kunden
                identifizierten geschäftlichen Kontakte. Die Dauer der Verarbeitung entspricht der Laufzeit des Vertrags
                zwischen den Parteien.
              </p>
            ),
          },
          {
            id: 'obligations-sous-traitant',
            title: 'Pflichten des Auftragsverarbeiters',
            body: (
              <p>
                Der Auftragsverarbeiter verpflichtet sich: die Daten nur auf dokumentierte Weisung des Verantwortlichen
                zu verarbeiten, auch in Bezug auf Übermittlungen in Drittländer oder an internationale Organisationen;
                zu gewährleisten, dass die zur Verarbeitung der personenbezogenen Daten befugten Personen sich zur
                Vertraulichkeit verpflichtet haben oder einer angemessenen gesetzlichen Verschwiegenheitspflicht
                unterliegen; die in der{' '}
                <Link href="/privacy" className={LINK}>
                  Datenschutzerklärung
                </Link>{' '}
                beschriebenen technischen und organisatorischen Sicherheitsmaßnahmen umzusetzen; keinen weiteren
                Auftragsverarbeiter ohne vorherige allgemeine oder gesonderte schriftliche Genehmigung des
                Verantwortlichen hinzuzuziehen; den Verantwortlichen mit geeigneten technischen und organisatorischen
                Maßnahmen dabei zu unterstützen, seiner Pflicht zur Beantwortung von Anträgen auf Ausübung der Rechte
                der betroffenen Personen nachzukommen; den Verantwortlichen bei der Einhaltung der in den Artikeln 32
                bis 36 DSGVO genannten Pflichten zu unterstützen (Sicherheit, Meldung von Verletzungen,
                Folgenabschätzungen); nach Wahl des Verantwortlichen alle personenbezogenen Daten nach Abschluss der
                Leistungen zu löschen oder zurückzugeben; und dem Verantwortlichen alle erforderlichen Informationen zum
                Nachweis der Einhaltung seiner Pflichten zur Verfügung zu stellen und Audits zu ermöglichen.
              </p>
            ),
          },
          {
            id: 'sous-traitants-ulterieurs',
            title: 'Unterauftragsverarbeiter',
            body: (
              <>
                <p>
                  Der Auftragsverarbeiter ist vom Verantwortlichen allgemein ermächtigt, für die Erbringung bestimmter
                  technischer Leistungen (Hosting, Zahlungsabwicklung, Infrastrukturdienste) Unterauftragsverarbeiter
                  hinzuzuziehen. Die Liste der Unterauftragsverarbeiter wird dem Kunden auf Anfrage an{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>{' '}
                  zur Verfügung gestellt.
                </p>
                <p>
                  Der Auftragsverarbeiter informiert den Verantwortlichen vorab über jede Hinzufügung oder Ersetzung
                  eines Unterauftragsverarbeiters. Der Verantwortliche kann innerhalb von dreißig Tagen ab der
                  Mitteilung begründete Einwände erheben. Jeder Unterauftragsverarbeiter ist durch vertragliche
                  Pflichten gebunden, die ein Schutzniveau gewährleisten, das dem in diesem DPA vorgesehenen
                  gleichwertig ist.
                </p>
              </>
            ),
          },
          {
            id: 'notification-violations',
            title: 'Meldung von Verletzungen',
            body: (
              <p>
                Im Falle einer Verletzung des Schutzes personenbezogener Daten im Sinne von Artikel 4 Nr. 12 DSGVO
                verpflichtet sich der Auftragsverarbeiter, den Verantwortlichen unverzüglich und in jedem Fall
                spätestens zweiundsiebzig Stunden nach Kenntnisnahme zu benachrichtigen. Die Meldung umfasst die Art der
                Verletzung, die Kategorien und die ungefähre Zahl der betroffenen Personen, die wahrscheinlichen Folgen
                der Verletzung sowie die ergriffenen oder vorgeschlagenen Maßnahmen zur Behebung der Verletzung und zur
                Abmilderung ihrer möglichen nachteiligen Auswirkungen.
              </p>
            ),
          },
          {
            id: 'audits',
            title: 'Audits',
            body: (
              <>
                <p>
                  Der Auftragsverarbeiter verpflichtet sich, dem Verantwortlichen oder einem von diesem beauftragten
                  unabhängigen, zur Vertraulichkeit verpflichteten Prüfer die Durchführung von Audits zu ermöglichen, um
                  die Einhaltung der Pflichten dieses DPA zu überprüfen — vorbehaltlich einer angemessenen
                  Ankündigungsfrist von fünfzehn Tagen und begrenzt auf ein Audit pro Kalenderjahr, außer bei
                  außergewöhnlichen Umständen, die ein zusätzliches Audit rechtfertigen (insbesondere bei einer
                  Datenschutzverletzung oder einer Anfrage der Aufsichtsbehörde). Die Kosten des Audits trägt der
                  Verantwortliche.
                </p>
                <p>
                  Auf deren Anfrage verpflichtet sich der Auftragsverarbeiter, mit den zuständigen Datenschutzbehörden
                  zu kooperieren, insbesondere im Falle einer Kontrolle. Bei einer Anfrage einer Verwaltungs- oder
                  Justizbehörde verpflichtet sich der Auftragsverarbeiter, den Verantwortlichen so schnell wie möglich
                  zu informieren.
                </p>
              </>
            ),
          },
          {
            id: 'duree-fin',
            title: 'Laufzeit und Ende des DPA',
            body: (
              <p>
                Dieser DPA tritt am Tag des Abonnements der BellumAI-Dienste in Kraft und bleibt für die gesamte
                Vertragslaufzeit wirksam. Bei Vertragsende löscht der Auftragsverarbeiter alle im Auftrag des
                Verantwortlichen verarbeiteten personenbezogenen Daten innerhalb von dreißig Tagen, sofern keine
                gesetzliche Aufbewahrungspflicht besteht. Auf Anfrage des Verantwortlichen kann eine Löschbescheinigung
                ausgestellt werden.
              </p>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'nl') {
    return (
      <LegalPage
        title="Verwerkersovereenkomst"
        intro="Verwerkersovereenkomst (Data Processing Agreement, DPA) in de zin van artikel 28 van de GDPR."
        lastUpdated="25 mei 2026"
        sections={[
          {
            id: 'objet',
            title: 'Voorwerp',
            body: (
              <p>
                Deze verwerkersovereenkomst (hierna de 'DPA') vult de algemene verkoopvoorwaarden en de algemene
                gebruiksvoorwaarden aan en bepaalt de respectieve verplichtingen van BELLUM, handelend als verwerker in
                de zin van artikel 28 van de GDPR (hierna de 'Verwerker'), en van de Klant, handelend als
                verwerkingsverantwoordelijke (hierna de 'Verwerkingsverantwoordelijke'), met betrekking tot de
                verwerking van persoonsgegevens.
              </p>
            ),
          },
          {
            id: 'traitements',
            title: 'Uitgevoerde verwerkingen',
            body: (
              <p>
                In het kader van de levering van de BellumAI-diensten verwerkt de Verwerker, voor rekening van de
                Verwerkingsverantwoordelijke, de volgende categorieën gegevens: identificatiegegevens van professionele
                contacten (namen, voornamen, functies, professionele contactgegevens); gegevens over doelbedrijven
                (bedrijfsnaam, financiële gegevens, personeelsbestand, activiteit); gebruiksgegevens van de Klant
                (gestarte analyses, gegenereerde berichten, uitgevoerde acties). De betrokkenen zijn de professionele
                contacten die worden geïdentificeerd in het kader van de B2B-commerciële prospectie van de Klant. De
                duur van de verwerking komt overeen met de looptijd van de overeenkomst tussen de partijen.
              </p>
            ),
          },
          {
            id: 'obligations-sous-traitant',
            title: 'Verplichtingen van de Verwerker',
            body: (
              <p>
                De Verwerker verbindt zich ertoe: de gegevens uitsluitend te verwerken op basis van gedocumenteerde
                instructies van de Verwerkingsverantwoordelijke, ook wat betreft doorgiften naar derde landen of
                internationale organisaties; te waarborgen dat de personen die gemachtigd zijn de persoonsgegevens te
                verwerken zich tot vertrouwelijkheid hebben verbonden of onder een passende wettelijke
                vertrouwelijkheidsverplichting vallen; de technische en organisatorische beveiligingsmaatregelen toe te
                passen die worden beschreven in het{' '}
                <Link href="/privacy" className={LINK}>
                  Privacybeleid
                </Link>
                ; geen andere verwerker in te schakelen zonder voorafgaande algemene of specifieke schriftelijke
                toestemming van de Verwerkingsverantwoordelijke; de Verwerkingsverantwoordelijke, door middel van
                passende technische en organisatorische maatregelen, bij te staan bij het vervullen van zijn plicht om
                te antwoorden op verzoeken tot uitoefening van de rechten van de betrokkenen; de
                Verwerkingsverantwoordelijke bij te staan bij het naleven van de verplichtingen uit de artikelen 32 tot
                en met 36 van de GDPR (beveiliging, melding van inbreuken, effectbeoordelingen); naar keuze van de
                Verwerkingsverantwoordelijke alle persoonsgegevens te verwijderen of terug te geven na afloop van de
                dienstverlening; en de Verwerkingsverantwoordelijke alle informatie ter beschikking te stellen die nodig
                is om de naleving van zijn verplichtingen aan te tonen en audits mogelijk te maken.
              </p>
            ),
          },
          {
            id: 'sous-traitants-ulterieurs',
            title: 'Subverwerkers',
            body: (
              <>
                <p>
                  De Verwerker wordt door de Verwerkingsverantwoordelijke algemeen gemachtigd om subverwerkers in te
                  schakelen voor de uitvoering van specifieke technische diensten (hosting, betalingsverwerking,
                  infrastructuurdiensten). De lijst van subverwerkers wordt ter beschikking van de Klant gehouden op
                  verzoek gericht aan{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
                <p>
                  De Verwerker informeert de Verwerkingsverantwoordelijke vooraf over elke toevoeging of vervanging van
                  een subverwerker. De Verwerkingsverantwoordelijke beschikt over dertig dagen vanaf de kennisgeving om
                  gemotiveerde bezwaren te formuleren. Elke subverwerker is gebonden door contractuele verplichtingen
                  die een beschermingsniveau bieden dat gelijkwaardig is aan dat van deze DPA.
                </p>
              </>
            ),
          },
          {
            id: 'notification-violations',
            title: 'Melding van inbreuken',
            body: (
              <p>
                In geval van een inbreuk in verband met persoonsgegevens in de zin van artikel 4, punt 12, van de GDPR
                verbindt de Verwerker zich ertoe de Verwerkingsverantwoordelijke zo snel mogelijk en in elk geval binnen
                maximaal tweeënzeventig uur na er kennis van te hebben genomen, op de hoogte te brengen. De melding
                omvat de aard van de inbreuk, de categorieën en het geschatte aantal betrokkenen, de waarschijnlijke
                gevolgen van de inbreuk, en de genomen of voorgestelde maatregelen om de inbreuk te verhelpen en de
                eventuele nadelige gevolgen ervan te beperken.
              </p>
            ),
          },
          {
            id: 'audits',
            title: 'Audits',
            body: (
              <>
                <p>
                  De Verwerker verbindt zich ertoe de Verwerkingsverantwoordelijke, of elke door deze aangestelde
                  onafhankelijke auditor die aan een vertrouwelijkheidsverplichting is onderworpen, toe te laten audits
                  uit te voeren om de naleving van de verplichtingen van deze DPA te verifiëren, mits een redelijke
                  opzegtermijn van vijftien dagen en beperkt tot één audit per kalenderjaar, behoudens uitzonderlijke
                  omstandigheden die een bijkomende audit rechtvaardigen (met name in geval van een gegevensinbreuk of
                  een verzoek van de toezichthoudende autoriteit). De kosten van de audit zijn ten laste van de
                  Verwerkingsverantwoordelijke.
                </p>
                <p>
                  Op hun verzoek verbindt de Verwerker zich ertoe samen te werken met de bevoegde
                  gegevensbeschermingsautoriteiten, met name in geval van een controle. In geval van een verzoek van een
                  administratieve of gerechtelijke autoriteit verbindt de Verwerker zich ertoe de
                  Verwerkingsverantwoordelijke zo snel mogelijk te informeren.
                </p>
              </>
            ),
          },
          {
            id: 'duree-fin',
            title: 'Duur en einde van de DPA',
            body: (
              <p>
                Deze DPA treedt in werking op de datum van inschrijving op de BellumAI-diensten en blijft van kracht
                gedurende de volledige looptijd van de overeenkomst. Bij het einde van de overeenkomst verwijdert de
                Verwerker alle persoonsgegevens die voor rekening van de Verwerkingsverantwoordelijke worden verwerkt
                binnen dertig dagen, behoudens een wettelijke bewaarplicht. Op verzoek van de
                Verwerkingsverantwoordelijke kan een verwijderingsattest worden afgeleverd.
              </p>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'en') {
    return (
      <LegalPage
        title="Data Processing Agreement"
        intro="Data Processing Agreement (DPA) within the meaning of Article 28 of the GDPR."
        lastUpdated="May 25, 2026"
        sections={[
          {
            id: 'objet',
            title: 'Purpose',
            body: (
              <p>
                This Data Processing Agreement (hereinafter the &ldquo;DPA&rdquo;) supplements the general terms of sale
                and the general terms of use, and sets out the respective obligations of BELLUM, acting as processor
                within the meaning of Article 28 of the GDPR (hereinafter the &ldquo;Processor&rdquo;), and of the
                Customer, acting as controller (hereinafter the &ldquo;Controller&rdquo;), with regard to the processing
                of personal data.
              </p>
            ),
          },
          {
            id: 'traitements',
            title: 'Processing carried out',
            body: (
              <p>
                As part of providing the BellumAI services, the Processor processes, on behalf of the Controller, the
                following categories of data: identification data of business contacts (surnames, first names, job
                titles, business contact details); data on target companies (company name, financial data, headcount,
                business activity); Customer usage data (analyses run, messages generated, actions performed). The data
                subjects are the business contacts identified in the course of the Customer&apos;s B2B sales
                prospecting. The duration of the processing corresponds to the term of the agreement between the
                parties.
              </p>
            ),
          },
          {
            id: 'obligations-sous-traitant',
            title: "Processor's obligations",
            body: (
              <p>
                The Processor undertakes to: process the data only on documented instructions from the Controller,
                including with regard to transfers to third countries or international organisations; ensure that
                persons authorised to process the personal data have committed themselves to confidentiality or are
                under an appropriate statutory obligation of confidentiality; implement the technical and organisational
                security measures described in the{' '}
                <Link href="/privacy" className={LINK}>
                  Privacy policy
                </Link>
                ; not engage another processor without the prior general or specific written authorisation of the
                Controller; assist the Controller, through appropriate technical and organisational measures, in
                fulfilling its obligation to respond to requests to exercise data subjects&apos; rights; assist the
                Controller in ensuring compliance with the obligations set out in Articles 32 to 36 of the GDPR
                (security, breach notification, impact assessments); at the Controller&apos;s choice, delete or return
                all personal data at the end of the services; and make available to the Controller all information
                necessary to demonstrate compliance with its obligations and to allow for audits.
              </p>
            ),
          },
          {
            id: 'sous-traitants-ulterieurs',
            title: 'Sub-processors',
            body: (
              <>
                <p>
                  The Processor is generally authorised by the Controller to engage sub-processors for the performance
                  of specific technical services (hosting, payment processing, infrastructure services). The list of
                  sub-processors is made available to the Customer upon request sent to{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
                <p>
                  The Processor shall inform the Controller in advance of any addition or replacement of a
                  sub-processor. The Controller has thirty days from the notification to raise reasoned objections. Each
                  sub-processor is bound by contractual obligations providing a level of protection equivalent to that
                  set out in this DPA.
                </p>
              </>
            ),
          },
          {
            id: 'notification-violations',
            title: 'Breach notification',
            body: (
              <p>
                In the event of a personal data breach within the meaning of Article 4(12) of the GDPR, the Processor
                undertakes to notify the Controller without undue delay and, in any event, within a maximum of
                seventy-two hours after becoming aware of it. The notification shall include the nature of the breach,
                the categories and approximate number of data subjects concerned, the likely consequences of the breach,
                and the measures taken or proposed to remedy the breach and mitigate its possible adverse effects.
              </p>
            ),
          },
          {
            id: 'audits',
            title: 'Audits',
            body: (
              <>
                <p>
                  The Processor undertakes to allow the Controller, or any independent auditor appointed by the
                  Controller and bound by a confidentiality obligation, to carry out audits to verify compliance with
                  the obligations of this DPA, subject to reasonable notice of fifteen days and limited to one audit per
                  calendar year, except in exceptional circumstances justifying an additional audit (in particular in
                  the event of a data breach or a request from the supervisory authority). The costs of the audit are
                  borne by the Controller.
                </p>
                <p>
                  Upon request, the Processor undertakes to cooperate with the competent data protection authorities, in
                  particular in the event of an inspection. In the event of a request from an administrative or judicial
                  authority, the Processor undertakes to inform the Controller as soon as possible.
                </p>
              </>
            ),
          },
          {
            id: 'duree-fin',
            title: 'Term and end of the DPA',
            body: (
              <p>
                This DPA takes effect on the date of subscription to the BellumAI services and remains in force for the
                entire term of the agreement. At the end of the agreement, the Processor deletes all personal data
                processed on behalf of the Controller within thirty days, unless a legal retention obligation applies. A
                certificate of deletion may be issued upon request from the Controller.
              </p>
            ),
          },
        ]}
      />
    )
  }
  return (
    <LegalPage
      title="Accord de traitement des données"
      intro="Data Processing Agreement (DPA) au sens de l'article 28 du RGPD."
      lastUpdated="25 mai 2026"
      sections={[
        {
          id: 'objet',
          title: 'Objet',
          body: (
            <p>
              Le présent accord de traitement des données (ci-après le « DPA ») complète les conditions générales de
              vente et les conditions générales d'utilisation, et définit les obligations respectives de la société
              BELLUM, en sa qualité de sous-traitant au sens de l'article 28 du RGPD (ci-après le « Sous-traitant »), et
              du Client, en sa qualité de responsable du traitement (ci-après le « Responsable du traitement »), en
              matière de traitement des données à caractère personnel.
            </p>
          ),
        },
        {
          id: 'traitements',
          title: 'Traitements effectués',
          body: (
            <p>
              Dans le cadre de la fourniture des services BellumAI, le Sous-traitant traite, pour le compte du
              Responsable du traitement, les catégories de données suivantes : données d'identification des contacts
              professionnels (noms, prénoms, fonctions, coordonnées professionnelles) ; données d'entreprises cibles
              (raison sociale, données financières, effectifs, activité) ; données d'usage du Client (analyses lancées,
              messages générés, actions effectuées). Les personnes concernées sont les contacts professionnels
              identifiés dans le cadre de la prospection commerciale B2B du Client. La durée du traitement correspond à
              la durée du contrat entre les parties.
            </p>
          ),
        },
        {
          id: 'obligations-sous-traitant',
          title: 'Obligations du Sous-traitant',
          body: (
            <p>
              Le Sous-traitant s'engage à : ne traiter les données que sur instruction documentée du Responsable du
              traitement, y compris en ce qui concerne les transferts vers des pays tiers ou à des organisations
              internationales ; garantir que les personnes autorisées à traiter les données personnelles se sont
              engagées à respecter la confidentialité ou sont soumises à une obligation légale de confidentialité ;
              mettre en œuvre les mesures techniques et organisationnelles de sécurité décrites dans la{' '}
              <Link href="/privacy" className={LINK}>
                Politique de confidentialité
              </Link>
              ; ne pas faire appel à un autre sous-traitant sans l'autorisation préalable, générale ou spécifique,
              écrite du Responsable du traitement ; aider le Responsable du traitement, par des mesures techniques et
              organisationnelles appropriées, à s'acquitter de son obligation de donner suite aux demandes d'exercice
              des droits des personnes concernées ; aider le Responsable du traitement à garantir le respect des
              obligations prévues aux articles 32 à 36 du RGPD (sécurité, notification des violations, analyse d'impact)
              ; au choix du Responsable du traitement, supprimer ou restituer toutes les données à caractère personnel à
              l'issue de la prestation ; mettre à la disposition du Responsable du traitement toutes les informations
              nécessaires pour démontrer le respect de ses obligations et permettre la réalisation d'audits.
            </p>
          ),
        },
        {
          id: 'sous-traitants-ulterieurs',
          title: 'Sous-traitants ultérieurs',
          body: (
            <>
              <p>
                Le Sous-traitant est autorisé de manière générale par le Responsable du traitement à recourir à des
                sous-traitants ultérieurs pour l'exécution de prestations techniques spécifiques (hébergement,
                traitement des paiements, services d'infrastructure). La liste des sous-traitants ultérieurs est tenue à
                disposition du Client sur demande adressée à{' '}
                <a href="mailto:dpo@bellum-it.com" className={LINK}>
                  dpo@bellum-it.com
                </a>
                .
              </p>
              <p>
                Le Sous-traitant informe préalablement le Responsable du traitement de tout ajout ou remplacement de
                sous-traitant ultérieur. Le Responsable du traitement dispose d'un délai de trente jours à compter de la
                notification pour émettre des objections motivées. Chaque sous-traitant ultérieur est lié par des
                obligations contractuelles offrant un niveau de protection équivalent à celui prévu par le présent DPA.
              </p>
            </>
          ),
        },
        {
          id: 'notification-violations',
          title: 'Notification des violations',
          body: (
            <p>
              En cas de violation de données à caractère personnel au sens de l'article 4(12) du RGPD, le Sous-traitant
              s'engage à notifier le Responsable du traitement dans les meilleurs délais et, en tout état de cause, dans
              un délai maximum de soixante-douze heures après en avoir pris connaissance. La notification comprendra la
              nature de la violation, les catégories et le nombre approximatif de personnes concernées, les conséquences
              probables de la violation, et les mesures prises ou proposées pour remédier à la violation et en atténuer
              les éventuels effets négatifs.
            </p>
          ),
        },
        {
          id: 'audits',
          title: 'Audits',
          body: (
            <>
              <p>
                Le Sous-traitant s'engage à permettre au Responsable du traitement, ou à tout auditeur indépendant
                mandaté par celui-ci et soumis à une obligation de confidentialité, de procéder à des audits afin de
                vérifier le respect des obligations du présent DPA, sous réserve d'un préavis raisonnable de quinze
                jours et dans la limite d'un audit par année civile, sauf circonstances exceptionnelles justifiant un
                audit supplémentaire (notamment en cas de violation de données ou de demande de l'autorité de contrôle).
                Les coûts de l'audit sont à la charge du Responsable du traitement.
              </p>
              <p>
                Sur leur demande, le Sous-traitant s'engage à coopérer avec les autorités de protection des données
                compétentes, notamment en cas de contrôle. En cas de requête provenant d'une autorité administrative ou
                judiciaire, le Sous-traitant s'engage à en informer le Responsable du traitement dans les meilleurs
                délais.
              </p>
            </>
          ),
        },
        {
          id: 'duree-fin',
          title: 'Durée et fin du DPA',
          body: (
            <p>
              Le présent DPA entre en vigueur à la date de souscription aux services BellumAI et demeure en vigueur
              pendant toute la durée du contrat. À l'issue du contrat, le Sous-traitant supprime l'ensemble des données
              à caractère personnel traitées pour le compte du Responsable du traitement dans un délai de trente jours,
              sauf obligation légale de conservation. Un certificat de suppression pourra être délivré sur demande du
              Responsable du traitement.
            </p>
          ),
        },
      ]}
    />
  )
}
