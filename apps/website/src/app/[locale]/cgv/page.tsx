import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: 'Conditions générales de vente',
    description: 'Conditions générales de vente des abonnements à la plateforme BellumAI.',
  },
  en: {
    title: 'General terms of sale',
    description: 'General terms of sale for subscriptions to the BellumAI platform.',
  },
  de: {
    title: 'Allgemeine Verkaufsbedingungen',
    description: 'Allgemeine Verkaufsbedingungen für Abonnements der Plattform BellumAI.',
  },
  nl: {
    title: 'Algemene verkoopvoorwaarden',
    description: 'Algemene verkoopvoorwaarden voor abonnementen op het platform BellumAI.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/cgv'),
  }
}

const LINK = 'text-violet-300 transition-colors hover:text-violet-200'

export default async function CgvPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Allgemeine Verkaufsbedingungen"
        lastUpdated="25. Mai 2026"
        sections={[
          {
            id: 'objet',
            title: 'Gegenstand',
            body: (
              <>
                <p>
                  Die vorliegenden allgemeinen Verkaufsbedingungen (nachstehend die „AVB“) regeln die vertraglichen
                  Beziehungen zwischen BELLUM, einer SASU (vereinfachte Aktiengesellschaft mit Alleingesellschafter nach
                  französischem Recht) mit einem Stammkapital von 1.000,00 Euro, eingetragen unter der Nummer 931 750
                  681 R.C.S. Paris, mit Sitz in 90, rue des Archives, 75003 Paris (nachstehend der „Anbieter“), und
                  jeder natürlichen oder juristischen Person (nachstehend der „Kunde“), die ein Abonnement für die
                  Dienste der Plattform BellumAI abschließt.
                </p>
                <p>
                  Die Annahme der vorliegenden AVB ist eine zwingende Voraussetzung für jedes Abonnement. Der Kunde
                  bestätigt, sie zur Kenntnis genommen zu haben, und akzeptiert sie vorbehaltlos. Das Ankreuzen des
                  entsprechenden Kästchens im Rahmen des Registrierungsvorgangs gilt als Annahme der vorliegenden AVB.
                </p>
              </>
            ),
          },
          {
            id: 'description-services',
            title: 'Beschreibung der Dienste',
            body: (
              <>
                <p>
                  Die Plattform BellumAI ist ein Online-Dienst für Vertriebsintelligenz, der sich an Fachleute aus dem
                  Sektor der IT-Dienstleistungsunternehmen (ESN) und ganz allgemein an alle Fachleute richtet, die eine
                  geschäftliche Akquisetätigkeit im Geschäftsverkehr zwischen Unternehmen (B2B) ausüben.
                </p>
                <p>
                  Die Plattform ermöglicht insbesondere: die eingehende Analyse von Zielunternehmen auf Grundlage der
                  proprietären Datenbank von BELLUM und öffentlich zugänglicher Quellen; die Identifizierung und
                  Anreicherung beruflicher Kontakte; die Erstellung strategischer Empfehlungen, personalisierter
                  Aktionspläne und maßgeschneiderter Nachrichten mithilfe von Technologien der künstlichen Intelligenz;
                  die Bewertung und Priorisierung von Zielkunden.
                </p>
                <p>
                  Die von der Plattform erzeugten Ergebnisse dienen ausschließlich Informations- und
                  Orientierungszwecken und unterliegen einer bloßen Bemühenspflicht. Sie stellen in keinem Fall eine
                  Garantie für geschäftliche, finanzielle oder rechtliche Ergebnisse dar. Die Verantwortung für die
                  Nutzung der bereitgestellten Informationen liegt ausschließlich beim Kunden.
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Einsatz künstlicher Intelligenz',
            body: (
              <>
                <p>
                  Die Plattform BellumAI verwendet Technologien der künstlichen Intelligenz, um Analysen, Empfehlungen,
                  Nachrichten und Aktionspläne zu erstellen. Gemäß der Verordnung (EU) 2024/1689 vom 13. Juni 2024 zur
                  Festlegung harmonisierter Vorschriften für künstliche Intelligenz (KI-Verordnung) informiert BELLUM
                  den Kunden darüber, dass die von der Plattform erzeugten Inhalte durch künstliche Intelligenz
                  generiert oder unterstützt werden.
                </p>
                <p>
                  Der Kunde erkennt an und akzeptiert, dass: die durch künstliche Intelligenz generierten Inhalte
                  lediglich unverbindliche Vorschläge darstellen, die das fachliche Urteil des Nutzers in keinem Fall
                  ersetzen; die Qualität und Relevanz der Ergebnisse insbesondere von der Qualität der vom Kunden bei
                  der Registrierung bereitgestellten Informationen und von der Verfügbarkeit der herangezogenen Quellen
                  abhängen; die Daten zu Unternehmen und Kontakten Ungenauigkeiten enthalten können und es dem Kunden
                  obliegt, sie vor jeder Maßnahme zu überprüfen; die künstliche Intelligenz keine autonome Entscheidung
                  rechtlicher oder finanzieller Art im Namen des Kunden trifft.
                </p>
              </>
            ),
          },
          {
            id: 'abonnement-tarifs',
            title: 'Abonnementmodelle und Preise',
            body: (
              <>
                <p>
                  Die Dienste werden in Form eines monatlichen oder jährlichen Abonnements angeboten, gemäß den auf der
                  Preisseite der Website beschriebenen Modellen und Preisen. Die Preise sind in Euro ohne Steuern
                  (netto) und einschließlich aller Steuern (brutto) angegeben. Es gilt die am Tag der Rechnungsstellung
                  geltende Mehrwertsteuer.
                </p>
                <p>
                  BELLUM behält sich das Recht vor, seine Preise jederzeit zu ändern. Jede Preisänderung wird dem Kunden
                  mindestens dreißig Tage vor ihrem Inkrafttreten per E-Mail mitgeteilt. Der Kunde hat die Möglichkeit,
                  sein Abonnement vor der Anwendung der neuen Preise ohne Kosten oder Vertragsstrafe zu kündigen.
                </p>
              </>
            ),
          },
          {
            id: 'systeme-credits',
            title: 'Im Modell enthaltene Nutzung',
            body: (
              <>
                <p>
                  Bestimmte Funktionen der Plattform, insbesondere die Unternehmensanalysen, sind in dem vom Kunden
                  abgeschlossenen Abonnementmodell enthalten, und zwar im Rahmen der in diesem Modell enthaltenen
                  Nutzung, die auf der Preisseite der Website angegeben ist. Diese Nutzung wird von Bellum analyseweise
                  erfasst.
                </p>
                <p>
                  Die im abgeschlossenen Modell enthaltene und während eines Abrechnungszeitraums nicht genutzte Nutzung
                  wird auf den folgenden Zeitraum übertragen und bleibt ab der Verlängerung dreißig (30) Tage lang
                  verfügbar, vorbehaltlich ausdrücklich abweichender Bestimmungen im abgeschlossenen Modell. Diese
                  Übertragung betrifft ausschließlich die im Modell enthaltene Nutzung: zusätzlich erworbene Nutzung
                  verfällt mit dem Ende des Zeitraums, für den sie erworben wurde, und eine bereits gewährte Übertragung
                  wird nicht verlängert. Der Erwerb zusätzlicher Nutzung kann zu den auf der Website angezeigten
                  Bedingungen angeboten werden. Die enthaltene Nutzung ist weder umtauschbar noch erstattungsfähig noch
                  übertragbar.
                </p>
              </>
            ),
          },
          {
            id: 'modalites-paiement',
            title: 'Zahlungsbedingungen',
            body: (
              <>
                <p>
                  Die Zahlung erfolgt per Bankkarte über einen sicheren, PCI-DSS-zertifizierten Zahlungsdienstleister
                  oder per Banküberweisung für Kunden, die ein Unternehmensmodell auf Angebotsbasis abgeschlossen haben.
                  Das Abonnement wird am Tag des Abschlusses in Rechnung gestellt, danach zu jedem monatlichen oder
                  jährlichen Fälligkeitstermin entsprechend dem gewählten Modell.
                </p>
                <p>
                  Im Falle eines Zahlungsausfalls oder einer Ablehnung des Einzugs benachrichtigt der Anbieter den
                  Kunden per E-Mail und gewährt ihm eine Frist von sieben Tagen zur Behebung der Situation. Nach Ablauf
                  dieser Frist behält sich der Anbieter das Recht vor, den Zugang zu den Diensten bis zur vollständigen
                  Regulierung der Zahlung zu sperren.
                </p>
                <p>
                  Jeder bei Fälligkeit nicht gezahlte Betrag verzinst sich von Rechts wegen mit Verzugszinsen in Höhe
                  des in Artikel L. 441-10 des französischen Handelsgesetzbuchs (Code de commerce) vorgesehenen Satzes,
                  das heißt dem Dreifachen des gesetzlichen Zinssatzes, ohne dass eine Mahnung erforderlich ist. Ferner
                  wird von Rechts wegen eine Pauschalentschädigung von vierzig Euro für Beitreibungskosten fällig, gemäß
                  Artikel D. 441-5 desselben Gesetzbuchs.
                </p>
              </>
            ),
          },
          {
            id: 'duree-resiliation',
            title: 'Laufzeit, Verlängerung und Kündigung',
            body: (
              <>
                <p>
                  Das Abonnement wird für die dem gewählten Modell entsprechende Laufzeit (monatlich oder jährlich)
                  abgeschlossen. Es verlängert sich stillschweigend um aufeinanderfolgende Zeiträume gleicher Dauer,
                  sofern es nicht von einer der Parteien unter den nachstehend festgelegten Bedingungen gekündigt wird.
                  Gemäß Artikel L. 215-1 des französischen Verbrauchergesetzbuchs (Code de la consommation) wird der
                  Kunde frühestens drei Monate und spätestens einen Monat vor Ablauf des laufenden Zeitraums per E-Mail
                  über die Möglichkeit informiert, seinen Vertrag nicht zu verlängern.
                </p>
                <p>
                  Der Kunde kann sein Abonnement jederzeit über seinen persönlichen Bereich auf der Plattform oder per
                  E-Mail an{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  kündigen. Die Kündigung wird zum Ende des laufenden Abrechnungszeitraums wirksam. Für den bereits in
                  Rechnung gestellten Zeitraum erfolgt keine anteilige Erstattung, außer bei Ausübung des in Artikel 8
                  unten vorgesehenen Widerrufsrechts.
                </p>
                <p>
                  Der Anbieter kann das Abonnement von Rechts wegen und ohne Vorankündigung kündigen, wenn der Kunde
                  eine seiner Verpflichtungen aus den vorliegenden AVB oder den Nutzungsbedingungen schwerwiegend
                  verletzt, insbesondere im Falle von Betrug, missbräuchlicher Nutzung der Plattform oder des Versuchs,
                  die Sicherheitsmaßnahmen zu umgehen, nachdem eine Mahnung während einer Frist von fünfzehn Tagen
                  erfolglos geblieben ist.
                </p>
              </>
            ),
          },
          {
            id: 'droit-retractation',
            title: 'Widerrufsrecht',
            body: (
              <>
                <p>
                  Gemäß den Artikeln L. 221-18 ff. des französischen Verbrauchergesetzbuchs (Code de la consommation)
                  verfügt der Kunde, der Verbraucher ist, über eine Frist von vierzehn Tagen ab dem Abschluss des
                  Abonnements, um sein Widerrufsrecht auszuüben, ohne Gründe angeben oder eine Vertragsstrafe zahlen zu
                  müssen.
                </p>
                <p>
                  Gemäß Artikel L. 221-28 des französischen Verbrauchergesetzbuchs erkennt der Kunde, der ausdrücklich
                  verlangt, dass die Erbringung der Dienstleistung vor Ablauf der Widerrufsfrist beginnt (insbesondere
                  durch das Starten einer Unternehmensanalyse oder die Nutzung des Dienstes), jedoch an, dass er für den
                  bereits erbrachten Teil der Dienstleistung ausdrücklich auf sein Widerrufsrecht verzichtet.
                  Gegebenenfalls wird dem Kunden der Betrag erstattet, der der noch nicht erbrachten Dienstleistung
                  entspricht, anteilig zur verbleibenden Zeit.
                </p>
                <p>
                  Zur Ausübung dieses Rechts übermittelt der Kunde dem Anbieter eine Erklärung, aus der sein
                  Widerrufswille hervorgeht, per E-Mail an{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  oder per Post an BELLUM, 90 rue des Archives, 75003 Paris.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Geistiges Eigentum',
            body: (
              <>
                <p>
                  Die Plattform BellumAI, ihre Algorithmen, ihre Modelle künstlicher Intelligenz, ihre proprietäre
                  Datenbank, ihre Benutzeroberfläche und sämtliche ihrer Softwarekomponenten sind und bleiben das
                  ausschließliche Eigentum von BELLUM. Das Abonnement räumt dem Kunden ein persönliches, nicht
                  ausschließliches, nicht abtretbares und nicht übertragbares Nutzungsrecht ein, das auf die Dauer des
                  Abonnements und die berufliche Nutzung durch den Kunden beschränkt ist.
                </p>
                <p>
                  Die von der Plattform erzeugten Analyseergebnisse (Unternehmensprofile, Kontaktlisten, Aktionspläne,
                  personalisierte Nachrichten) können vom Kunden im Rahmen seiner geschäftlichen Tätigkeit frei genutzt
                  werden. Der Kunde verpflichtet sich jedoch, Folgendes zu unterlassen: den Weiterverkauf, die
                  Weiterverbreitung oder die Überlassung der Rohergebnisse der Plattform an Dritte zu
                  Wettbewerbszwecken; die Rekonstruktion, Dekompilierung oder den Versuch der Rekonstruktion der
                  Datenbanken, Algorithmen oder Modelle der Plattform; die Nutzung der Ergebnisse zur Entwicklung eines
                  ähnlichen oder konkurrierenden Dienstes.
                </p>
                <p>
                  Die vom Nutzer in der Plattform eingegebenen Notizen, Kommentare und Anmerkungen bleiben sein
                  Eigentum.
                </p>
              </>
            ),
          },
          {
            id: 'limitation-responsabilite',
            title: 'Haftungsbeschränkung',
            body: (
              <>
                <p>
                  BELLUM verpflichtet sich, die Dienste mit Sorgfalt und nach den anerkannten Regeln der Technik im
                  Rahmen einer Bemühenspflicht zu erbringen. Der Anbieter garantiert nicht: die Richtigkeit,
                  Vollständigkeit oder Aktualität der von der Plattform erzeugten Daten und Analysen; die Erzielung
                  geschäftlicher Ergebnisse durch den Kunden; die ständige und ununterbrochene Verfügbarkeit der
                  Plattform, die Gegenstand von Wartungsarbeiten oder technischen Unterbrechungen sein kann.
                </p>
                <p>
                  In jedem Fall ist die Haftung des Anbieters aus den vorliegenden AVB auf den Gesamtbetrag der Summen
                  beschränkt, die der Kunde in den zwölf Monaten vor dem schadensauslösenden Ereignis tatsächlich
                  gezahlt hat. Der Anbieter haftet in keinem Fall für mittelbare Schäden, Umsatzverluste, Datenverluste,
                  Betriebsverluste, entgangene Gewinne, Imageschäden oder geschäftliche Nachteile des Kunden.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-personnelles',
            title: 'Personenbezogene Daten',
            body: (
              <p>
                Die Verarbeitung personenbezogener Daten im Rahmen der Erbringung der Dienste richtet sich nach der auf
                der Website verfügbaren{' '}
                <Link href="/privacy" className={LINK}>
                  Richtlinie zum Schutz der Privatsphäre und personenbezogener Daten
                </Link>
                . Der Kunde bestätigt, sie zur Kenntnis genommen zu haben.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Unwirksamkeit einer Klausel',
            body: (
              <p>
                Sollte eine der Bestimmungen der vorliegenden AVB durch eine rechtskräftige gerichtliche Entscheidung
                für nichtig erklärt werden, so berührt diese Nichtigkeit nicht die Wirksamkeit der übrigen Bestimmungen,
                die in vollem Umfang in Kraft und wirksam bleiben.
              </p>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Anwendbares Recht und Gerichtsstand',
            body: (
              <>
                <p>
                  Die vorliegenden AVB unterliegen französischem Recht. Im Falle einer Streitigkeit zwischen
                  Unternehmern sind, nachdem ein Versuch der gütlichen Beilegung während einer Frist von dreißig Tagen
                  erfolglos geblieben ist, ausschließlich die zuständigen Gerichte von Paris zuständig, ungeachtet einer
                  Mehrheit von Beklagten oder einer Streitverkündung.
                </p>
                <p>
                  Der Kunde, der Verbraucher ist, kann sich außerdem kostenlos an den von BELLUM benannten
                  Verbraucherschlichter wenden, dessen Kontaktdaten auf Anfrage an{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  mitgeteilt werden, oder die Online-Streitbeilegungsplattform der Europäischen Kommission anrufen, die
                  unter folgender Adresse verfügbar ist:{' '}
                  <a
                    href="https://ec.europa.eu/consumers/odr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  >
                    https://ec.europa.eu/consumers/odr
                  </a>
                  .
                </p>
              </>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'nl') {
    return (
      <LegalPage
        title="Algemene verkoopvoorwaarden"
        lastUpdated="25 mei 2026"
        sections={[
          {
            id: 'objet',
            title: 'Voorwerp',
            body: (
              <>
                <p>
                  Deze algemene verkoopvoorwaarden (hierna de 'Verkoopvoorwaarden') regelen de contractuele betrekkingen
                  tussen BELLUM, een SASU (vereenvoudigde aandelenvennootschap met één aandeelhouder naar Frans recht)
                  met een kapitaal van 1.000,00 euro, ingeschreven onder nummer 931 750 681 R.C.S. Paris, waarvan de
                  maatschappelijke zetel gevestigd is te 90, rue des Archives, 75003 Paris (hierna de 'Dienstverlener'),
                  en elke natuurlijke persoon of rechtspersoon (hierna de 'Klant') die een abonnement neemt op de
                  diensten van het platform BellumAI.
                </p>
                <p>
                  De aanvaarding van deze Verkoopvoorwaarden is een verplichte voorwaarde voor elk abonnement. De Klant
                  erkent er kennis van te hebben genomen en aanvaardt ze zonder voorbehoud. Het aanvinken van het
                  overeenkomstige vakje tijdens de registratieprocedure geldt als aanvaarding van deze
                  Verkoopvoorwaarden.
                </p>
              </>
            ),
          },
          {
            id: 'description-services',
            title: 'Beschrijving van de diensten',
            body: (
              <>
                <p>
                  Het platform BellumAI is een online dienst voor commerciële intelligence, bestemd voor professionals
                  uit de sector van de IT-dienstverleners (ESN) en, meer in het algemeen, voor elke professional die een
                  activiteit van commerciële prospectie tussen ondernemingen (B2B) uitoefent.
                </p>
                <p>
                  Het platform maakt met name mogelijk: de diepgaande analyse van doelondernemingen op basis van de
                  eigen databank van BELLUM en van publiek toegankelijke bronnen; de identificatie en verrijking van
                  professionele contacten; het genereren van strategische aanbevelingen, gepersonaliseerde actieplannen
                  en aangepaste berichten met behulp van technologieën op het gebied van artificiële intelligentie; de
                  scoring en rangschikking van doelaccounts.
                </p>
                <p>
                  De door het platform gegenereerde resultaten worden louter ter informatie en ter indicatie verstrekt
                  en zijn onderworpen aan een inspanningsverbintenis. Zij vormen in geen geval een garantie van
                  commerciële, financiële of juridische resultaten. De verantwoordelijkheid voor het gebruik van de
                  verstrekte informatie ligt uitsluitend bij de Klant.
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Gebruik van artificiële intelligentie',
            body: (
              <>
                <p>
                  Het platform BellumAI maakt gebruik van technologieën op het gebied van artificiële intelligentie om
                  analyses, aanbevelingen, berichten en actieplannen te genereren. Overeenkomstig Verordening (EU)
                  2024/1689 van 13 juni 2024 tot vaststelling van geharmoniseerde regels betreffende artificiële
                  intelligentie (AI-verordening) informeert BELLUM de Klant dat de door het platform geproduceerde
                  inhoud door artificiële intelligentie wordt gegenereerd of ondersteund.
                </p>
                <p>
                  De Klant erkent en aanvaardt dat: de door artificiële intelligentie gegenereerde inhoud louter
                  indicatieve suggesties betreft die in geen geval het professionele oordeel van de gebruiker vervangen;
                  de kwaliteit en relevantie van de resultaten met name afhangen van de kwaliteit van de informatie die
                  de Klant bij zijn registratie heeft verstrekt en van de beschikbaarheid van de geraadpleegde bronnen;
                  de gegevens over ondernemingen en contacten onjuistheden kunnen bevatten en het aan de Klant is om
                  deze te controleren alvorens enige stap te ondernemen; de artificiële intelligentie geen autonome
                  beslissing van juridische of financiële aard neemt namens de Klant.
                </p>
              </>
            ),
          },
          {
            id: 'abonnement-tarifs',
            title: 'Abonnementsformules en tarieven',
            body: (
              <>
                <p>
                  De diensten worden aangeboden in de vorm van een maandelijks of jaarlijks abonnement, volgens de
                  formules en tarieven beschreven op de tariefpagina van de Site. De tarieven worden vermeld in euro
                  exclusief btw en inclusief btw. De toepasselijke btw is die welke geldt op de dag van facturering.
                </p>
                <p>
                  BELLUM behoudt zich het recht voor zijn tarieven te allen tijde te wijzigen. Elke tariefwijziging
                  wordt ten minste dertig dagen vóór de inwerkingtreding ervan per e-mail aan de Klant meegedeeld. De
                  Klant heeft de mogelijkheid zijn abonnement op te zeggen vóór de toepassing van de nieuwe tarieven,
                  zonder kosten of boete.
                </p>
              </>
            ),
          },
          {
            id: 'systeme-credits',
            title: 'In de formule inbegrepen gebruik',
            body: (
              <>
                <p>
                  Bepaalde functies van het platform, met name de bedrijfsanalyses, zijn inbegrepen in de door de Klant
                  afgesloten abonnementsformule, binnen de grenzen van het in die formule inbegrepen gebruik, zoals
                  vermeld op de tariefpagina van de Site. Dat gebruik wordt door Bellum per analyse bijgehouden.
                </p>
                <p>
                  Het in de afgesloten formule inbegrepen gebruik dat tijdens een factureringsperiode niet is gebruikt,
                  wordt overgedragen naar de volgende periode en blijft dertig (30) dagen na de verlenging beschikbaar,
                  tenzij uitdrukkelijk anders vermeld in de afgesloten formule. Deze overdracht betreft uitsluitend het
                  in de formule inbegrepen gebruik: extra aangekocht gebruik vervalt aan het einde van de periode
                  waarvoor het is aangekocht, en een reeds toegekende overdracht wordt niet verlengd. De aankoop van
                  extra gebruik kan worden aangeboden onder de voorwaarden vermeld op de Site. Het inbegrepen gebruik is
                  niet inwisselbaar, niet terugbetaalbaar en niet overdraagbaar.
                </p>
              </>
            ),
          },
          {
            id: 'modalites-paiement',
            title: 'Betalingsvoorwaarden',
            body: (
              <>
                <p>
                  De betaling gebeurt per bankkaart via een beveiligde, PCI-DSS-gecertificeerde betalingsdienstverlener,
                  of per bankoverschrijving voor klanten die een ondernemingsformule op offerte hebben afgesloten. Het
                  abonnement wordt gefactureerd op de datum van inschrijving en vervolgens op elke maandelijkse of
                  jaarlijkse vervaldag volgens de gekozen formule.
                </p>
                <p>
                  In geval van mislukte betaling of weigering van de incasso stelt de Dienstverlener de Klant per e-mail
                  in kennis en verleent hem een termijn van zeven dagen om de situatie te regulariseren. Na afloop van
                  deze termijn behoudt de Dienstverlener zich het recht voor de toegang tot de diensten op te schorten
                  totdat de betaling volledig is geregulariseerd.
                </p>
                <p>
                  Elk bedrag dat niet op de vervaldag is betaald, brengt van rechtswege verwijlinteresten op tegen het
                  tarief bepaald in artikel L. 441-10 van het Franse Wetboek van koophandel (Code de commerce), zijnde
                  driemaal de wettelijke rentevoet, zonder dat een ingebrekestelling vereist is. Tevens is van
                  rechtswege een forfaitaire vergoeding van veertig euro voor invorderingskosten verschuldigd,
                  overeenkomstig artikel D. 441-5 van hetzelfde Wetboek.
                </p>
              </>
            ),
          },
          {
            id: 'duree-resiliation',
            title: 'Duur, verlenging en opzegging',
            body: (
              <>
                <p>
                  Het abonnement wordt aangegaan voor de duur die overeenkomt met de gekozen formule (maandelijks of
                  jaarlijks). Het wordt stilzwijgend verlengd voor opeenvolgende periodes van dezelfde duur, behoudens
                  opzegging door een van de partijen onder de hierna bepaalde voorwaarden. Overeenkomstig artikel L.
                  215-1 van het Franse Consumentenwetboek (Code de la consommation) wordt de Klant ten vroegste drie
                  maanden en ten laatste één maand vóór het einde van de lopende periode per e-mail geïnformeerd over de
                  mogelijkheid om zijn contract niet te verlengen.
                </p>
                <p>
                  De Klant kan zijn abonnement te allen tijde opzeggen via zijn persoonlijke omgeving op het platform of
                  per e-mail aan{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  . De opzegging wordt van kracht aan het einde van de lopende factureringsperiode. Er vindt geen
                  pro-rata-terugbetaling plaats voor de reeds gefactureerde periode, behalve bij uitoefening van het
                  herroepingsrecht bedoeld in artikel 8 hieronder.
                </p>
                <p>
                  De Dienstverlener kan het abonnement van rechtswege en zonder opzegtermijn beëindigen in geval van een
                  ernstige tekortkoming van de Klant in een van zijn verplichtingen uit hoofde van deze
                  Verkoopvoorwaarden of de Gebruiksvoorwaarden, en met name in geval van fraude, misbruik van het
                  platform of een poging tot omzeiling van de beveiligingsmaatregelen, nadat een ingebrekestelling
                  gedurende een termijn van vijftien dagen zonder gevolg is gebleven.
                </p>
              </>
            ),
          },
          {
            id: 'droit-retractation',
            title: 'Herroepingsrecht',
            body: (
              <>
                <p>
                  Overeenkomstig de artikelen L. 221-18 en volgende van het Franse Consumentenwetboek (Code de la
                  consommation) beschikt de Klant-consument over een termijn van veertien dagen vanaf de inschrijving op
                  het abonnement om zijn herroepingsrecht uit te oefenen, zonder opgave van redenen en zonder betaling
                  van een boete.
                </p>
                <p>
                  Overeenkomstig artikel L. 221-28 van het Franse Consumentenwetboek erkent de Klant die uitdrukkelijk
                  verzoekt dat de uitvoering van de dienst begint vóór het verstrijken van de herroepingstermijn (met
                  name door een bedrijfsanalyse te starten of de dienst te gebruiken), evenwel dat hij uitdrukkelijk
                  afstand doet van zijn herroepingsrecht voor het reeds uitgevoerde deel van de dienst. In voorkomend
                  geval wordt aan de Klant het bedrag terugbetaald dat overeenkomt met de nog niet uitgevoerde dienst,
                  naar rato van de resterende tijd.
                </p>
                <p>
                  Om dit recht uit te oefenen, stuurt de Klant de Dienstverlener een verklaring waaruit zijn wens tot
                  herroeping blijkt, per e-mail aan{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  of per post aan BELLUM, 90 rue des Archives, 75003 Paris.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Intellectuele eigendom',
            body: (
              <>
                <p>
                  Het platform BellumAI, zijn algoritmen, zijn modellen van artificiële intelligentie, zijn eigen
                  databank, zijn interface en al zijn softwarecomponenten zijn en blijven de exclusieve eigendom van
                  BELLUM. Het abonnement verleent de Klant een persoonlijk, niet-exclusief, niet-cedeerbaar en
                  niet-overdraagbaar gebruiksrecht, beperkt tot de duur van het abonnement en tot het professionele
                  gebruik door de Klant.
                </p>
                <p>
                  De door het platform gegenereerde analyseresultaten (bedrijfsprofielen, contactlijsten, actieplannen,
                  gepersonaliseerde berichten) mogen door de Klant vrij worden gebruikt in het kader van zijn
                  commerciële activiteit. De Klant onthoudt zich er evenwel van: de ruwe resultaten van het platform
                  door te verkopen, te herverdelen of ter beschikking te stellen van derden voor concurrerende
                  doeleinden; de databanken, algoritmen of modellen van het platform te reconstrueren, te decompileren
                  of te trachten te reconstrueren; de resultaten te gebruiken om een soortgelijke of concurrerende
                  dienst te ontwikkelen.
                </p>
                <p>
                  De notities, opmerkingen en annotaties die de gebruiker in het platform invoert, blijven zijn
                  eigendom.
                </p>
              </>
            ),
          },
          {
            id: 'limitation-responsabilite',
            title: 'Beperking van aansprakelijkheid',
            body: (
              <>
                <p>
                  BELLUM verbindt zich ertoe de diensten met zorg te verlenen, overeenkomstig de regels van de kunst, in
                  het kader van een inspanningsverbintenis. De Dienstverlener garandeert niet: de juistheid,
                  volledigheid of actualiteit van de door het platform gegenereerde gegevens en analyses; het behalen
                  van commerciële resultaten door de Klant; de permanente en ononderbroken beschikbaarheid van het
                  platform, dat het voorwerp kan uitmaken van onderhoudswerkzaamheden of technische onderbrekingen.
                </p>
                <p>
                  In elk geval is de aansprakelijkheid van de Dienstverlener uit hoofde van deze Verkoopvoorwaarden
                  beperkt tot het totale bedrag van de sommen die de Klant daadwerkelijk heeft betaald in de twaalf
                  maanden voorafgaand aan de schadeveroorzakende gebeurtenis. De Dienstverlener kan in geen geval
                  aansprakelijk worden gesteld voor indirecte schade, omzetverlies, verlies van gegevens,
                  bedrijfsverlies, winstderving, imagoschade of commercieel nadeel geleden door de Klant.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-personnelles',
            title: 'Persoonsgegevens',
            body: (
              <p>
                De verwerking van persoonsgegevens in het kader van de uitvoering van de diensten wordt beheerst door
                het{' '}
                <Link href="/privacy" className={LINK}>
                  Beleid inzake privacy en de bescherming van persoonsgegevens
                </Link>{' '}
                dat op de Site beschikbaar is. De Klant erkent er kennis van te hebben genomen.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Nietigheid van een beding',
            body: (
              <p>
                Indien een van de bepalingen van deze Verkoopvoorwaarden nietig zou worden verklaard door een definitief
                geworden rechterlijke beslissing, brengt deze nietigheid niet de nietigheid van de overige bepalingen
                met zich mee, die volledig van kracht en van toepassing blijven.
              </p>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Toepasselijk recht en bevoegde rechter',
            body: (
              <>
                <p>
                  Deze Verkoopvoorwaarden worden beheerst door het Franse recht. In geval van een geschil tussen
                  professionelen, en nadat een poging tot minnelijke oplossing gedurende een termijn van dertig dagen
                  zonder resultaat is gebleven, zijn uitsluitend de bevoegde rechtbanken van Parijs bevoegd,
                  niettegenstaande meerdere verweerders of vrijwaringsoproep.
                </p>
                <p>
                  De Klant-consument kan tevens kosteloos een beroep doen op de door BELLUM aangewezen
                  consumentenbemiddelaar, wiens contactgegevens op verzoek worden meegedeeld via{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  , of het geschil voorleggen aan het platform voor onlinegeschillenbeslechting van de Europese
                  Commissie, beschikbaar op het volgende adres:{' '}
                  <a
                    href="https://ec.europa.eu/consumers/odr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  >
                    https://ec.europa.eu/consumers/odr
                  </a>
                  .
                </p>
              </>
            ),
          },
        ]}
      />
    )
  }
  if (locale === 'en') {
    return (
      <LegalPage
        title="General terms of sale"
        lastUpdated="May 25, 2026"
        sections={[
          {
            id: 'objet',
            title: 'Purpose',
            body: (
              <>
                <p>
                  These general terms of sale (hereinafter the "GTS") govern the contractual relationship between
                  BELLUM, a SASU with a share capital of 1,000.00 euros, registered under number 931 750 681 R.C.S.
                  Paris, whose registered office is located at 90, rue des Archives, 75003 Paris (hereinafter the
                  "Provider"), and any natural or legal person (hereinafter the "Client") subscribing to the services of
                  the BellumAI platform.
                </p>
                <p>
                  Acceptance of these GTS is a mandatory prerequisite for any subscription. The Client acknowledges
                  having read them and accepts them without reservation. Ticking the corresponding box during the
                  registration process constitutes acceptance of these GTS.
                </p>
              </>
            ),
          },
          {
            id: 'description-services',
            title: 'Description of the services',
            body: (
              <>
                <p>
                  The BellumAI platform is an online business intelligence service intended for professionals in the IT
                  services company (ESN) sector and, more generally, for any professional engaged in
                  business-to-business (B2B) commercial prospecting.
                </p>
                <p>
                  The platform enables in particular: the in-depth analysis of target companies based on BELLUM's
                  proprietary database and on publicly accessible sources; the identification and enrichment of
                  professional contacts; the generation of strategic recommendations, personalised action plans and
                  tailored messages using artificial intelligence technologies; the scoring and ranking of target
                  accounts.
                </p>
                <p>
                  The results generated by the platform are produced for information and guidance purposes only, and are
                  subject to a best-efforts obligation. They in no way constitute a guarantee of commercial, financial
                  or legal results. Responsibility for the use of the information provided lies exclusively with the
                  Client.
                </p>
              </>
            ),
          },
          {
            id: 'intelligence-artificielle',
            title: 'Use of artificial intelligence',
            body: (
              <>
                <p>
                  The BellumAI platform uses artificial intelligence technologies to generate analyses, recommendations,
                  messages and action plans. In accordance with Regulation (EU) 2024/1689 of 13 June 2024 laying down
                  harmonised rules on artificial intelligence (AI Act), BELLUM informs the Client that the content
                  produced by the platform is generated or assisted by artificial intelligence.
                </p>
                <p>
                  The Client acknowledges and accepts that: the content generated by artificial intelligence consists of
                  suggestions provided for guidance only, which in no way replace the professional judgement of the
                  user; the quality and relevance of the results depend in particular on the quality of the information
                  provided by the Client upon registration and on the availability of the sources consulted; data
                  relating to companies and contacts may contain inaccuracies, and it is the Client's responsibility to
                  verify it before taking any action; the artificial intelligence makes no autonomous decision of a
                  legal or financial nature on behalf of the Client.
                </p>
              </>
            ),
          },
          {
            id: 'abonnement-tarifs',
            title: 'Subscription plans and prices',
            body: (
              <>
                <p>
                  The services are offered in the form of a monthly or annual subscription, according to the plans and
                  prices described on the pricing page of the Site. Prices are indicated in euros exclusive of tax
                  (excl. VAT) and inclusive of all taxes (incl. VAT). The applicable VAT is that in force on the day of
                  invoicing.
                </p>
                <p>
                  BELLUM reserves the right to modify its prices at any time. Any price change will be notified to the
                  Client by email at least thirty days before it comes into force. The Client shall have the option of
                  terminating their subscription before the new prices apply, without charge or penalty.
                </p>
              </>
            ),
          },
          {
            id: 'systeme-credits',
            title: 'Usage included in the plan',
            body: (
              <>
                <p>
                  Certain features of the platform, in particular company analyses, are included in the subscription
                  plan taken out by the Client, within the limit of the usage included in that plan, as indicated on the
                  pricing page of the Site. Bellum tracks this usage analysis by analysis.
                </p>
                <p>
                  Usage included in the plan taken out and not used during a billing period is carried over to the
                  following period and remains available for thirty (30) days from the renewal, unless expressly stated
                  otherwise in the plan taken out. This carry-over covers the usage included in the plan only:
                  additional usage purchased on a one-off basis expires at the end of the period for which it was
                  purchased, and a carry-over already granted is not renewed. The purchase of additional usage may be
                  offered under the conditions displayed on the Site. Included usage is non-exchangeable, non-refundable
                  and non-transferable.
                </p>
              </>
            ),
          },
          {
            id: 'modalites-paiement',
            title: 'Payment terms',
            body: (
              <>
                <p>
                  Payment is made by bank card via a secure PCI-DSS certified payment provider, or by bank transfer for
                  clients who have taken out an enterprise plan on quotation. The subscription is invoiced on the date
                  of subscription, then on each monthly or annual due date according to the chosen plan.
                </p>
                <p>
                  In the event of payment failure or rejection of the debit, the Provider shall notify the Client by
                  email and grant them a period of seven days to remedy the situation. After this period, the Provider
                  reserves the right to suspend access to the services until the payment has been fully regularised.
                </p>
                <p>
                  Any sum not paid on its due date shall automatically bear late-payment interest at the rate provided
                  for by Article L. 441-10 of the French Commercial Code, namely three times the legal interest rate,
                  without any formal notice being required. A fixed indemnity of forty euros for recovery costs shall
                  also be payable automatically, in accordance with Article D. 441-5 of the same Code.
                </p>
              </>
            ),
          },
          {
            id: 'duree-resiliation',
            title: 'Term, renewal and termination',
            body: (
              <>
                <p>
                  The subscription is entered into for the term corresponding to the chosen plan (monthly or annual). It
                  is renewed by tacit renewal for successive periods of the same duration, unless terminated by either
                  party under the conditions defined below. In accordance with Article L. 215-1 of the French Consumer
                  Code, the Client will be informed by email of the possibility of not renewing their contract, at the
                  earliest three months and at the latest one month before the end of the current period.
                </p>
                <p>
                  The Client may terminate their subscription at any time from their personal space on the platform or
                  by email sent to{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  . Termination takes effect at the end of the current billing period. No pro-rata refund will be made
                  for the period already invoiced, except where the right of withdrawal provided for in Article 8 below
                  is exercised.
                </p>
                <p>
                  The Provider may terminate the subscription automatically and without notice in the event of a serious
                  breach by the Client of any of its obligations under these GTS or the GTU, and in particular in the
                  event of fraud, abusive use of the platform or an attempt to circumvent the security measures, after
                  formal notice has remained without effect for a period of fifteen days.
                </p>
              </>
            ),
          },
          {
            id: 'droit-retractation',
            title: 'Right of withdrawal',
            body: (
              <>
                <p>
                  In accordance with Articles L. 221-18 et seq. of the French Consumer Code, the consumer Client has a
                  period of fourteen days from the subscription to exercise their right of withdrawal, without having to
                  give reasons or pay any penalty.
                </p>
                <p>
                  However, in accordance with Article L. 221-28 of the French Consumer Code, the Client who expressly
                  requests that the performance of the service begin before the expiry of the withdrawal period (in
                  particular by launching a company analysis or using the service) acknowledges that they expressly
                  waive their right of withdrawal for the part of the service already performed. Where applicable, the
                  Client will be refunded the amount corresponding to the service not yet performed, pro rata to the
                  time remaining.
                </p>
                <p>
                  To exercise this right, the Client shall send the Provider a statement expressing their wish to
                  withdraw, by email to{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>{' '}
                  or by post to BELLUM, 90 rue des Archives, 75003 Paris.
                </p>
              </>
            ),
          },
          {
            id: 'propriete-intellectuelle',
            title: 'Intellectual property',
            body: (
              <>
                <p>
                  The BellumAI platform, its algorithms, its artificial intelligence models, its proprietary database,
                  its interface and all of its software components are and shall remain the exclusive property of
                  BELLUM. The subscription grants the Client a personal, non-exclusive, non-assignable and
                  non-transferable right of use, limited to the duration of the subscription and to the Client's
                  professional use.
                </p>
                <p>
                  The analysis results generated by the platform (company profiles, contact lists, action plans,
                  personalised messages) may be freely used by the Client in the course of their commercial activity.
                  The Client shall however refrain from: reselling, redistributing or making available to third parties
                  the raw results of the platform for competing purposes; reconstituting, decompiling or attempting to
                  reconstitute the databases, algorithms or models of the platform; using the results to develop a
                  similar or competing service.
                </p>
                <p>The notes, comments and annotations entered by the user in the platform remain their property.</p>
              </>
            ),
          },
          {
            id: 'limitation-responsabilite',
            title: 'Limitation of liability',
            body: (
              <>
                <p>
                  BELLUM undertakes to provide the services with diligence, in accordance with industry standards,
                  within the framework of a best-efforts obligation. The Provider does not guarantee: the accuracy,
                  completeness or currency of the data and analyses generated by the platform; the achievement of
                  commercial results by the Client; the permanent and uninterrupted availability of the platform, which
                  may be subject to maintenance operations or technical interruptions.
                </p>
                <p>
                  In any event, the Provider's liability under these GTS is limited to the total amount of the sums
                  actually paid by the Client during the twelve months preceding the event giving rise to the damage.
                  The Provider shall in no event be held liable for indirect damage, loss of revenue, loss of data,
                  operating losses, loss of profits, damage to image or commercial harm suffered by the Client.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-personnelles',
            title: 'Personal data',
            body: (
              <p>
                The processing of personal data in connection with the performance of the services is governed by the{' '}
                <Link href="/privacy" className={LINK}>
                  Privacy and personal data protection policy
                </Link>{' '}
                available on the Site. The Client acknowledges having read it.
              </p>
            ),
          },
          {
            id: 'nullite-clause',
            title: 'Nullity of a clause',
            body: (
              <p>
                If any of the provisions of these GTS were to be annulled by a final court decision, such nullity would
                not entail the nullity of the other provisions, which shall remain in full force and effect.
              </p>
            ),
          },
          {
            id: 'droit-applicable',
            title: 'Governing law and jurisdiction',
            body: (
              <>
                <p>
                  These GTS are governed by French law. In the event of a dispute between professionals, and after an
                  attempt at amicable resolution has remained unsuccessful for a period of thirty days, the competent
                  courts of Paris shall have sole jurisdiction, notwithstanding a plurality of defendants or third-party
                  proceedings.
                </p>
                <p>
                  The consumer Client may also make free use of the consumer mediator designated by BELLUM, whose
                  contact details will be provided upon request sent to{' '}
                  <a href="mailto:contact@bellum-it.com" className={LINK}>
                    contact@bellum-it.com
                  </a>
                  , or refer the matter to the European Commission's online dispute resolution platform available at the
                  following address:{' '}
                  <a
                    href="https://ec.europa.eu/consumers/odr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={LINK}
                  >
                    https://ec.europa.eu/consumers/odr
                  </a>
                  .
                </p>
              </>
            ),
          },
        ]}
      />
    )
  }
  return (
    <LegalPage
      title="Conditions générales de vente"
      lastUpdated="25 mai 2026"
      sections={[
        {
          id: 'objet',
          title: 'Objet',
          body: (
            <>
              <p>
                Les présentes conditions générales de vente (ci-après les « CGV ») régissent les relations
                contractuelles entre la société BELLUM, SASU au capital de 1 000,00 euros, immatriculée sous le numéro
                931 750 681 R.C.S. Paris, dont le siège social est situé au 90, rue des Archives, 75003 Paris (ci-après
                le « Prestataire »), et toute personne physique ou morale (ci-après le « Client ») souscrivant un
                abonnement aux services de la plateforme BellumAI.
              </p>
              <p>
                L'acceptation des présentes CGV est un préalable obligatoire à toute souscription. Le Client reconnaît
                en avoir pris connaissance et les accepter sans réserve. Le fait de cocher la case correspondante lors
                de la procédure d'inscription vaut acceptation des présentes CGV.
              </p>
            </>
          ),
        },
        {
          id: 'description-services',
          title: 'Description des services',
          body: (
            <>
              <p>
                La plateforme BellumAI est un service d'intelligence commerciale accessible en ligne, destiné aux
                professionnels du secteur des entreprises de services du numérique (ESN) et, plus généralement, à tout
                professionnel exerçant une activité de prospection commerciale interentreprises (B2B).
              </p>
              <p>
                La plateforme permet notamment : l'analyse approfondie d'entreprises cibles à partir de la base de
                données propriétaire de la société BELLUM et de sources publiquement accessibles ; l'identification et
                l'enrichissement de contacts professionnels ; la génération de recommandations stratégiques, de plans
                d'action personnalisés et de messages adaptés par des technologies d'intelligence artificielle ;
                l'évaluation et le classement de comptes cibles.
              </p>
              <p>
                Les résultats générés par la plateforme sont produits à titre informatif et indicatif, et font l'objet
                d'une obligation de moyens. Ils ne constituent en aucun cas une garantie de résultat commercial,
                financier ou juridique. La responsabilité de l'utilisation des informations fournies incombe
                exclusivement au Client.
              </p>
            </>
          ),
        },
        {
          id: 'intelligence-artificielle',
          title: "Utilisation de l'intelligence artificielle",
          body: (
            <>
              <p>
                La plateforme BellumAI utilise des technologies d'intelligence artificielle pour générer des analyses,
                des recommandations, des messages et des plans d'action. Conformément au Règlement (UE) 2024/1689 du 13
                juin 2024 établissant des règles harmonisées concernant l'intelligence artificielle (Règlement IA), la
                société BELLUM informe le Client que les contenus produits par la plateforme sont générés ou assistés
                par intelligence artificielle.
              </p>
              <p>
                Le Client reconnaît et accepte que : les contenus générés par l'intelligence artificielle sont des
                suggestions à titre indicatif qui ne se substituent en aucun cas au jugement professionnel de
                l'utilisateur ; la qualité et la pertinence des résultats dépendent notamment de la qualité des
                informations fournies par le Client lors de son inscription et de la disponibilité des sources
                consultées ; les données relatives aux entreprises et aux contacts peuvent contenir des inexactitudes,
                et il appartient au Client de les vérifier avant toute démarche ; l'intelligence artificielle ne prend
                aucune décision autonome à caractère juridique ou financier pour le compte du Client.
              </p>
            </>
          ),
        },
        {
          id: 'abonnement-tarifs',
          title: "Formules d'abonnement et tarifs",
          body: (
            <>
              <p>
                Les services sont proposés sous forme d'abonnement mensuel ou annuel, selon les formules et les tarifs
                décrits sur la page de tarification du Site. Les tarifs sont indiqués en euros hors taxes (HT) et toutes
                taxes comprises (TTC). La TVA applicable est celle en vigueur au jour de la facturation.
              </p>
              <p>
                La société BELLUM se réserve le droit de modifier ses tarifs à tout moment. Toute modification tarifaire
                sera notifiée au Client par courrier électronique au moins trente jours avant son entrée en vigueur. Le
                Client disposera de la faculté de résilier son abonnement avant l'application des nouveaux tarifs, sans
                frais ni pénalité.
              </p>
            </>
          ),
        },
        {
          id: 'systeme-credits',
          title: 'Usage inclus dans la formule',
          body: (
            <>
              <p>
                Certaines fonctionnalités de la plateforme, et notamment les analyses d'entreprises, sont incluses dans
                la formule d'abonnement souscrite par le Client, dans la limite de l'usage inclus dans cette formule,
                indiqué sur la page de tarification du Site. Cet usage est décompté par Bellum analyse par analyse.
              </p>
              <p>
                L'usage inclus dans la formule souscrite et non utilisé au cours d'une période de facturation est
                reporté sur la période suivante et demeure disponible pendant trente (30) jours à compter du
                renouvellement, sauf mention contraire expresse dans la formule souscrite. Ce report porte sur le seul
                usage inclus dans la formule : l'usage acquis ponctuellement en complément expire au terme de la période
                pour laquelle il a été acquis, et un report déjà accordé n'est pas reconduit. L'acquisition d'usage
                supplémentaire peut être proposée selon les conditions affichées sur le Site. L'usage inclus n'est ni
                échangeable, ni remboursable, ni cessible.
              </p>
            </>
          ),
        },
        {
          id: 'modalites-paiement',
          title: 'Modalités de paiement',
          body: (
            <>
              <p>
                Le paiement est effectué par carte bancaire via un prestataire de paiement sécurisé certifié PCI-DSS, ou
                par virement bancaire pour les clients ayant souscrit une formule entreprise sur devis. L'abonnement est
                facturé à la date de souscription, puis à chaque échéance mensuelle ou annuelle selon la formule
                choisie.
              </p>
              <p>
                En cas d'échec du paiement ou de rejet du prélèvement, le Prestataire notifie le Client par courrier
                électronique et lui accorde un délai de sept jours pour régulariser la situation. Passé ce délai, le
                Prestataire se réserve le droit de suspendre l'accès aux services jusqu'à régularisation complète du
                paiement.
              </p>
              <p>
                Toute somme non payée à sa date d'exigibilité produira de plein droit des intérêts de retard au taux
                prévu par l'article L. 441-10 du Code de commerce, soit trois fois le taux d'intérêt légal, sans qu'une
                mise en demeure soit nécessaire. Une indemnité forfaitaire de quarante euros pour frais de recouvrement
                sera également exigible de plein droit, conformément à l'article D. 441-5 du même Code.
              </p>
            </>
          ),
        },
        {
          id: 'duree-resiliation',
          title: 'Durée, reconduction et résiliation',
          body: (
            <>
              <p>
                L'abonnement est conclu pour la durée correspondant à la formule choisie (mensuelle ou annuelle). Il se
                renouvelle par tacite reconduction pour des périodes successives de même durée, sauf résiliation par
                l'une ou l'autre des parties dans les conditions définies ci-après. Conformément à l'article L. 215-1 du
                Code de la consommation, le Client sera informé par courrier électronique de la possibilité de ne pas
                reconduire son contrat, au plus tôt trois mois et au plus tard un mois avant le terme de la période en
                cours.
              </p>
              <p>
                Le Client peut résilier son abonnement à tout moment depuis son espace personnel sur la plateforme ou
                par courrier électronique adressé à{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                . La résiliation prend effet à l'issue de la période de facturation en cours. Aucun remboursement au
                prorata ne sera effectué pour la période déjà facturée, sauf en cas d'exercice du droit de rétractation
                prévu à l'article 8 ci-après.
              </p>
              <p>
                Le Prestataire peut résilier l'abonnement de plein droit et sans préavis en cas de manquement grave du
                Client à l'une quelconque de ses obligations au titre des présentes CGV ou des CGU, et notamment en cas
                de fraude, d'usage abusif de la plateforme ou de tentative de contournement des mesures de sécurité,
                après mise en demeure restée infructueuse sous un délai de quinze jours.
              </p>
            </>
          ),
        },
        {
          id: 'droit-retractation',
          title: 'Droit de rétractation',
          body: (
            <>
              <p>
                Conformément aux articles L. 221-18 et suivants du Code de la consommation, le Client consommateur
                dispose d'un délai de quatorze jours à compter de la souscription de l'abonnement pour exercer son droit
                de rétractation, sans avoir à justifier de motifs ni à payer de pénalité.
              </p>
              <p>
                Toutefois, conformément à l'article L. 221-28 du Code de la consommation, le Client qui demande
                expressément que l'exécution du service commence avant l'expiration du délai de rétractation (notamment
                en lançant une analyse d'entreprise ou en utilisant le service) reconnaît renoncer expressément à son
                droit de rétractation pour la partie du service déjà exécutée. Le cas échéant, le Client sera remboursé
                du montant correspondant au service non encore exécuté, au prorata du temps restant.
              </p>
              <p>
                Pour exercer ce droit, le Client adresse au Prestataire une déclaration exprimant sa volonté de se
                rétracter, par courrier électronique à{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>{' '}
                ou par courrier postal à BELLUM, 90 rue des Archives, 75003 Paris.
              </p>
            </>
          ),
        },
        {
          id: 'propriete-intellectuelle',
          title: 'Propriété intellectuelle',
          body: (
            <>
              <p>
                La plateforme BellumAI, ses algorithmes, ses modèles d'intelligence artificielle, sa base de données
                propriétaire, son interface et l'ensemble de ses composants logiciels sont et demeurent la propriété
                exclusive de la société BELLUM. L'abonnement confère au Client un droit d'utilisation personnel, non
                exclusif, non cessible et non transférable, limité à la durée de l'abonnement et à l'usage professionnel
                du Client.
              </p>
              <p>
                Les résultats d'analyses générés par la plateforme (fiches entreprises, listes de contacts, plans
                d'action, messages personnalisés) peuvent être librement utilisés par le Client dans le cadre de son
                activité commerciale. Le Client s'interdit toutefois de : revendre, redistribuer ou mettre à disposition
                de tiers les résultats bruts de la plateforme à des fins concurrentes ; reconstituer, décompiler ou
                tenter de reconstituer les bases de données, algorithmes ou modèles de la plateforme ; utiliser les
                résultats pour développer un service similaire ou concurrent.
              </p>
              <p>
                Les notes, commentaires et annotations saisis par l'utilisateur dans la plateforme demeurent sa
                propriété.
              </p>
            </>
          ),
        },
        {
          id: 'limitation-responsabilite',
          title: 'Limitation de responsabilité',
          body: (
            <>
              <p>
                La société BELLUM s'engage à fournir les services avec diligence, conformément aux règles de l'art, dans
                le cadre d'une obligation de moyens. Le Prestataire ne garantit pas : l'exactitude, l'exhaustivité ou
                l'actualité des données et analyses générées par la plateforme ; l'obtention de résultats commerciaux
                par le Client ; la disponibilité permanente et ininterrompue de la plateforme, celle-ci pouvant faire
                l'objet d'opérations de maintenance ou d'interruptions techniques.
              </p>
              <p>
                En tout état de cause, la responsabilité du Prestataire au titre des présentes CGV est limitée au
                montant total des sommes effectivement versées par le Client au cours des douze mois précédant
                l'événement générateur du dommage. Le Prestataire ne pourra en aucun cas être tenu responsable des
                dommages indirects, pertes de chiffre d'affaires, pertes de données, pertes d'exploitation, pertes de
                bénéfices, atteinte à l'image ou préjudice commercial subi par le Client.
              </p>
            </>
          ),
        },
        {
          id: 'donnees-personnelles',
          title: 'Données personnelles',
          body: (
            <p>
              Le traitement des données personnelles dans le cadre de l'exécution des services est régi par la{' '}
              <a href="/privacy" className={LINK}>
                Politique de confidentialité et de protection des données personnelles
              </a>{' '}
              accessible sur le Site. Le Client reconnaît en avoir pris connaissance.
            </p>
          ),
        },
        {
          id: 'nullite-clause',
          title: "Nullité d'une clause",
          body: (
            <p>
              Si l'une quelconque des dispositions des présentes CGV était annulée par une décision de justice devenue
              définitive, cette nullité n'entraînerait pas la nullité des autres dispositions qui demeureront pleinement
              en vigueur et de plein effet.
            </p>
          ),
        },
        {
          id: 'droit-applicable',
          title: 'Droit applicable et juridiction compétente',
          body: (
            <>
              <p>
                Les présentes CGV sont régies par le droit français. En cas de litige entre professionnels, et après
                tentative de résolution amiable restée infructueuse sous un délai de trente jours, les tribunaux
                compétents de Paris seront seuls compétents, nonobstant pluralité de défendeurs ou appel en garantie.
              </p>
              <p>
                Le Client consommateur peut également recourir gratuitement au médiateur de la consommation désigné par
                la société BELLUM, dont les coordonnées seront communiquées sur demande adressée à{' '}
                <a href="mailto:contact@bellum-it.com" className={LINK}>
                  contact@bellum-it.com
                </a>
                , ou saisir la plateforme de règlement en ligne des litiges de la Commission européenne accessible à
                l'adresse suivante :{' '}
                <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className={LINK}>
                  https://ec.europa.eu/consumers/odr
                </a>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
