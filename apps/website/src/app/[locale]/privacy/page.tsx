import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/features/legal/LegalPage'
import type { Locale } from '@/i18n/routing'
import { buildAlternates } from '@/lib/metadata'

const META = {
  fr: {
    title: 'Politique de confidentialité',
    description:
      'Politique de confidentialité et de protection des données personnelles de BellumAI : collecte, finalités, durées, droits.',
  },
  en: {
    title: 'Privacy policy',
    description:
      'Privacy and personal data protection policy of BellumAI: collection, purposes, retention periods, rights.',
  },
  de: {
    title: 'Datenschutzerklärung',
    description:
      'Richtlinie von BellumAI zur Vertraulichkeit und zum Schutz personenbezogener Daten: Erhebung, Zwecke, Aufbewahrungsfristen, Rechte.',
  },
  nl: {
    title: 'Privacybeleid',
    description:
      'Beleid van BellumAI inzake privacy en bescherming van persoonsgegevens: verzameling, doeleinden, bewaartermijnen, rechten.',
  },
} as const

export async function generateMetadata(props: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await props.params
  const m = META[locale as keyof typeof META] ?? META.fr
  return {
    title: m.title,
    description: m.description,
    alternates: buildAlternates(locale as Locale, '/privacy'),
  }
}

const LINK = 'text-violet-300 transition-colors hover:text-violet-200'
const SUBTITLE = 'font-medium text-white'
const LIST = 'list-disc space-y-1.5 pl-5'

export default async function PrivacyPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params
  setRequestLocale(locale)
  if (locale === 'de') {
    return (
      <LegalPage
        title="Richtlinie zur Vertraulichkeit und zum Schutz personenbezogener Daten"
        lastUpdated="11. Oktober 2026"
        intro="Gemäß der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten und zum freien Datenverkehr (nachfolgend die „DSGVO“) sowie dem französischen Gesetz Nr. 78-17 vom 6. Januar 1978 in geänderter Fassung über Informatik, Dateien und Freiheiten."
        sections={[
          {
            id: 'preambule',
            title: 'Präambel',
            body: (
              <>
                <p>
                  Der Schutz Ihrer personenbezogenen Daten hat für BELLUM Priorität. Diese Richtlinie beschreibt, wie
                  wir Ihre personenbezogenen Daten im Zusammenhang mit der Nutzung der Internetseite www.bellum-ai.com
                  und der BellumAI-Plattform (nachfolgend zusammen die „Website“) erheben, verarbeiten und schützen.
                </p>
                <p>
                  Diese Richtlinie kann durch zusätzliche Angaben ergänzt werden, die in einzelnen oder allen Teilen
                  einer erbrachten Leistung präzisiert werden. Wir können diese Richtlinie jederzeit ändern, ergänzen
                  oder aktualisieren, insbesondere um rechtlichen, regulatorischen oder technischen Entwicklungen
                  Rechnung zu tragen. Jede Änderung wird mit dem Datum der Online-Veröffentlichung der geänderten
                  Richtlinie wirksam.
                </p>
              </>
            ),
          },
          {
            id: 'responsable-traitement',
            title: 'Verantwortlicher',
            body: (
              <>
                <p>
                  Verantwortlicher für die Verarbeitung personenbezogener Daten ist BELLUM, eine SASU mit einem
                  Gesellschaftskapital von 1.000,00 Euro, eingetragen unter der Nummer 931 750 681 R.C.S. Paris, mit
                  Sitz in 90, rue des Archives, 75003 Paris.
                </p>
                <p>
                  Bei Fragen zum Schutz Ihrer personenbezogenen Daten kontaktieren Sie uns bitte unter folgenden
                  Kontaktdaten:{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  , oder per Post zu Händen des Datenschutzbeauftragten, BELLUM, 90 rue des Archives, 75003 Paris.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-collectees',
            title: 'Erhobene Daten',
            body: (
              <>
                <p className={SUBTITLE}>2.1. Vom Nutzer direkt bereitgestellte Daten</p>
                <p>
                  Bei der Erstellung Ihres Kontos und der Nutzung der Plattform werden folgende Daten erhoben: Name und
                  Vorname; berufliche E-Mail-Adresse; Name des Arbeitgeberunternehmens; Angaben zum Vertriebsprofil des
                  Nutzers, wie sie im Rahmen des Anmeldefragebogens mitgeteilt wurden (Geschäftsfelder,
                  Dienstleistungsangebote, geografisches Gebiet, Teamgröße, kommerzielle Positionierung); vom Nutzer in
                  der Plattform eingegebene Notizen, Kommentare und Anmerkungen.
                </p>
                <p>
                  Zahlungsdaten werden ausschließlich von unserem PCI-DSS-zertifizierten Zahlungsdienstleister
                  verarbeitet. BELLUM speichert und erhebt keinerlei Bankdaten (Kartennummer, Sicherheitscode,
                  Ablaufdatum) und hat keinen Zugriff darauf.
                </p>
                <p className={SUBTITLE}>2.2. Automatisch erhobene Daten</p>
                <p>
                  Wenn Sie auf der Website surfen und die Plattform nutzen, können folgende Daten automatisch erhoben
                  werden: IP-Adresse; Typ und Version des Browsers; Betriebssystem; aufgerufene Seiten und Dauer des
                  Aufrufs; Verbindungsdaten (Datum, Uhrzeit, Sitzungskennungen); in der Plattform durchgeführte Aktionen
                  (gestartete Analysen, kopierte Nachrichten, angereicherte Kontakte).
                </p>
                <p className={SUBTITLE}>2.3. Aus anderen Quellen erlangte Daten</p>
                <p>
                  Wir können Informationen auch aus anderen Quellen erhalten, etwa: öffentlich zugängliche Quellen
                  (gesetzliche Register, Berufsverzeichnisse, amtliche Veröffentlichungen, von Unternehmen
                  veröffentlichte Stellenangebote, von den betroffenen Personen selbst in öffentlichen beruflichen
                  Netzwerken veröffentlichte Informationen); Anbieter beruflicher B2B-Daten, die vertraglich an BELLUM
                  gebunden sind (berufliche Kontaktdaten, Stellenwechsel); die proprietäre Datenbank von BELLUM, die
                  unter Einhaltung des geltenden rechtlichen Rahmens aufgebaut und angereichert wird. BELLUM umgeht
                  niemals eine Authentifizierung oder einen technischen Schutz einer Website, um Daten zu erlangen.
                </p>
                <p className={SUBTITLE}>2.4. Daten über Dritte (berufliche Kontakte)</p>
                <p>
                  Im Rahmen ihrer Business-Intelligence-Funktionen referenziert die BellumAI-Plattform Daten über
                  berufliche Kontakte Dritter. Diese Daten werden aus öffentlich zugänglichen Quellen, von vertraglich
                  gebundenen Anbietern beruflicher Daten und aus der proprietären Datenbank von BELLUM gebildet. Sie
                  können umfassen: Namen und Vornamen beruflicher Kontakte; Funktionen und Stellenbezeichnungen;
                  berufliche Kontaktdaten (berufliche E-Mail-Adresse, berufliche Telefonnummer); Zugehörigkeit zu einer
                  juristischen Person; einen Stellenwechsel mit Datum und Quelle; von der betroffenen Person in einem
                  beruflichen Kontext öffentlich veröffentlichte Informationen.
                </p>
                <p>
                  Einige dieser Daten können geschätzt statt beobachtet sein: zum Beispiel eine berufliche
                  E-Mail-Adresse, die nach dem im Unternehmen üblichen Format gebildet und anschließend technisch bei
                  dessen Mailserver geprüft wird, eine angenommene Berichtslinie oder eine aus dem Werdegang abgeleitete
                  Seniorität. Sie sind in der Plattform stets als geschätzt gekennzeichnet, werden nie als geprüfte
                  Information dargestellt und ersetzt, sobald eine geprüfte Information oder eine Korrektur vorliegt.
                  Kein Kriterium wie Alter, Geschlecht, Herkunft, Privatadresse oder Foto fließt in die Rangfolge einer
                  Person ein, und das Geburtsdatum wird nie erhoben.
                </p>
                <p>
                  Diese Daten sind rein beruflicher Natur. Es werden keine Daten aus dem Privatleben, keine sensiblen
                  Daten im Sinne von Artikel 9 DSGVO und keine Daten über Minderjährige erhoben oder verarbeitet.
                </p>
              </>
            ),
          },
          {
            id: 'finalites',
            title: 'Zwecke und Rechtsgrundlagen der Verarbeitung',
            body: (
              <>
                <p>
                  Wir erheben oder verarbeiten Ihre personenbezogenen Daten unter Einhaltung der DSGVO zu den folgenden
                  Zwecken und auf den folgenden Rechtsgrundlagen:
                </p>
                <ul className={LIST}>
                  <li>
                    Erstellung und Verwaltung des Nutzerkontos: Rechtsgrundlage der Vertragserfüllung (Artikel 6 Abs. 1
                    lit. b DSGVO).
                  </li>
                  <li>
                    Bereitstellung der Dienste der Plattform, einschließlich Unternehmensanalysen, Identifikation von
                    Kontakten, Erstellung strategischer Empfehlungen und personalisierter Nachrichten: Rechtsgrundlage
                    der Vertragserfüllung (Artikel 6 Abs. 1 lit. b DSGVO).
                  </li>
                  <li>
                    Personalisierung des Nutzererlebnisses entsprechend dem angegebenen Vertriebsprofil: Rechtsgrundlage
                    des berechtigten Interesses (Artikel 6 Abs. 1 lit. f DSGVO).
                  </li>
                  <li>
                    Rechnungsstellung, Verwaltung der Abonnements und Guthaben: Rechtsgrundlage der Vertragserfüllung
                    (Artikel 6 Abs. 1 lit. b) und der rechtlichen Verpflichtung (Artikel 6 Abs. 1 lit. c DSGVO).
                  </li>
                  <li>
                    Aufbau und Anreicherung der Datenbank beruflicher Kontakte aus öffentlich zugänglichen Quellen, um
                    es den Nutzern zu ermöglichen, relevante Ansprechpartner im Kontext der kommerziellen Akquise
                    zwischen Unternehmen (B2B) zu identifizieren: Rechtsgrundlage des berechtigten Interesses (Artikel 6
                    Abs. 1 lit. f DSGVO). BELLUM hat eine Abwägung zwischen diesem berechtigten Interesse und den
                    Rechten und Freiheiten der betroffenen Personen gemäß den Empfehlungen der CNIL vorgenommen. Die
                    verarbeiteten Daten sind rein beruflicher Natur, öffentlich zugänglich, und ihre Verarbeitung
                    entspricht den vernünftigen Erwartungen von Personen mit Entscheidungsfunktionen in Unternehmen.
                  </li>
                  <li>
                    Verbesserung der Dienste, Entwicklung neuer Funktionen und Erstellung anonymisierter
                    Nutzungsstatistiken: Rechtsgrundlage des berechtigten Interesses (Artikel 6 Abs. 1 lit. f DSGVO).
                  </li>
                  <li>
                    Kommerzielle Kommunikation zu den Diensten von BELLUM: Rechtsgrundlage der Einwilligung (Artikel 6
                    Abs. 1 lit. a DSGVO) oder des berechtigten Interesses für Bestandskunden unter den Voraussetzungen
                    des Artikels L. 34-5 des französischen Gesetzbuchs über Post und elektronische Kommunikation.
                  </li>
                  <li>
                    Einhaltung gesetzlicher und regulatorischer Verpflichtungen: Rechtsgrundlage der rechtlichen
                    Verpflichtung (Artikel 6 Abs. 1 lit. c DSGVO).
                  </li>
                  <li>
                    Betrugsprävention und Sicherheit der Plattform: Rechtsgrundlage des berechtigten Interesses (Artikel
                    6 Abs. 1 lit. f DSGVO).
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'traitements-specifiques',
            title: 'Verarbeitungen bestimmter Funktionen',
            body: (
              <>
                <p>
                  Einige Funktionen der Plattform beruhen auf besonderen Verarbeitungen. Mehrere davon funktionieren
                  nur, wenn Sie selbst oder Ihre Organisation sie aktivieren.
                </p>
                <ul className={LIST}>
                  <li>
                    Gemeinsame anonyme Datenbasis: Jede Nacht werden aus der Aktivität aller Kundenorganisationen
                    anonyme Statistiken berechnet (zum Beispiel, welche Aktionen zum Erfolg führen, nach Branche und
                    Unternehmensgröße), damit jede Organisation ihre Ergebnisse mit dem vergleichen kann, was anderswo
                    funktioniert. Diese Statistiken enthalten keinen Namen einer Person, einer Kundenorganisation oder
                    eines Endkunden, keinen Freitext und werden erst ab drei unterschiedlichen beitragenden
                    Organisationen veröffentlicht. Rechtsgrundlage: das berechtigte Interesse von BELLUM an der
                    Verbesserung des Dienstes (Artikel 6 Abs. 1 lit. f DSGVO). Sie können dem durch eine Nachricht an
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>{' '}
                    widersprechen.
                  </li>
                  <li>
                    Lesen Ihres eigenen Postfachs: Wenn Sie Ihr berufliches Postfach verbinden, kann der Copilot den
                    Inhalt der mit Ihren Kontakten verknüpften Korrespondenz lesen, um sie zusammenzufassen, eine
                    Nachfassaktion vorzubereiten oder einen Bedarf zu erkennen. Dieser Inhalt wird nur für Sie
                    verwendet: Er wird weder Ihren Kollegen noch Ihrem Vorgesetzten angezeigt. Rechtsgrundlage:
                    Vertragserfüllung, nach Ihrer Aktivierung.
                  </li>
                  <li>
                    Anbieter beruflicher Daten und Stellenwechsel: Um berufliche Kontaktdaten zu erhalten oder zu
                    melden, dass ein verfolgter Kontakt das Unternehmen gewechselt hat, fragt die Plattform vertraglich
                    gebundene Anbieter beruflicher B2B-Daten ab. Es findet keine automatisierte Erhebung in einem
                    beruflichen sozialen Netzwerk statt. Rechtsgrundlage: das berechtigte Interesse der B2B-Akquise
                    (Artikel 6 Abs. 1 lit. f DSGVO).
                  </li>
                  <li>
                    Nutzungsmessung pro Nutzer: Wenn Ihr Arbeitgeber sie aktiviert, kann Ihr Vorgesetzter Zähler Ihrer
                    Nutzung der Plattform einsehen (Anzahl der Aktionen pro Funktion und Zeitraum). Weder die verbrachte
                    Zeit noch eine Bildschirmaufzeichnung noch der Inhalt Ihrer Nachrichten werden gemessen. Ihr
                    Arbeitgeber, Verantwortlicher dieser Verarbeitung, verpflichtet sich, Sie vorab zu informieren und,
                    soweit vorgeschrieben, seine Arbeitnehmervertretung anzuhören; BELLUM handelt in seinem Auftrag als
                    Auftragsverarbeiter.
                  </li>
                  <li>
                    Messung der Produktnutzung: Um zu erkennen, welche Bildschirme Probleme bereiten, erfasst die
                    Plattform die aufgerufenen und verlassenen Bildschirme, verknüpft mit einer temporären
                    Sitzungskennung, die alle vierundzwanzig Stunden erneuert wird — nie mit Ihrer Kennung, der Ihrer
                    Organisation oder dem Inhalt Ihrer Eingaben. Unterhalb von fünf unterschiedlichen Sitzungen wird
                    keine Statistik erstellt, und es wird kein Werkzeug zur Aufzeichnung oder Wiedergabe von Sitzungen
                    eingesetzt. Rechtsgrundlage: das berechtigte Interesse von BELLUM an der Verbesserung des Dienstes
                    (Artikel 6 Abs. 1 lit. f DSGVO); Sie können dem durch eine Nachricht an
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>{' '}
                    widersprechen.
                  </li>
                  <li>
                    Benachrichtigungen per E-Mail und SMS: Wenn Sie sie aktivieren, erhalten Sie Benachrichtigungen per
                    E-Mail oder SMS in den Ländern, in denen dieser Kanal geöffnet ist. Ihre Mobilnummer wird mit einem
                    Code überprüft. Rechtsgrundlage: Ihre Einwilligung, die mit ihrem Datum gespeichert wird und die Sie
                    jederzeit in Ihren Einstellungen widerrufen können.
                  </li>
                  <li>
                    Analyse aufgezeichneter Anrufe: Wenn Ihre Organisation sie aktiviert, kann ein Verkaufsgespräch, das
                    mit der zu Beginn des Gesprächs angekündigten Einwilligung jedes Teilnehmers aufgezeichnet wurde,
                    transkribiert und zusammengefasst werden. Kein Anruf wird ohne diese Einwilligung aufgezeichnet. Die
                    für ein Besprechungsprotokoll hochgeladene Audiodatei wird nicht aufbewahrt: Nur der Text wird
                    gespeichert.
                  </li>
                  <li>
                    Versand im Auftrag: Keine Nachricht wird ohne Ihre Freigabe versendet, es sei denn, Sie erteilen
                    einen ausdrücklichen Auftrag für benannte Kontakte, geprüfte Inhalte sowie eine begrenzte Dauer und
                    Menge. Der Auftrag ist jederzeit widerruflich; eine Antwort oder ein Widerspruch des Empfängers
                    stoppt den Versand.
                  </li>
                </ul>
                <p>
                  Wenn Nutzer der Plattform Berufstätige kontaktieren, tun sie dies als Verantwortliche. Gemäß den
                  Empfehlungen der CNIL muss eine Akquisenachricht, die ohne vorherige Einwilligung an eine berufstätige
                  Person gerichtet wird, in Bezug zu ihrer Funktion stehen und es ihr ermöglichen, jeder weiteren
                  Nachricht einfach und kostenlos zu widersprechen. Jeder erfasste Widerspruch wird vor jedem Versand
                  geprüft und stoppt einen laufenden Versand.
                </p>
              </>
            ),
          },
          {
            id: 'conservation',
            title: 'Aufbewahrungsdauer der Daten',
            body: (
              <>
                <ul className={LIST}>
                  <li>
                    Die Daten des Nutzerkontos werden für die gesamte Vertragslaufzeit aufbewahrt. Bei der Löschung des
                    Kontos werden die personenbezogenen Daten unverzüglich anonymisiert, mit Ausnahme derjenigen, deren
                    Aufbewahrung gesetzlich vorgeschrieben ist. Ein Konto ohne Anmeldung seit drei Jahren kann
                    geschlossen werden.
                  </li>
                  <li>
                    Rechnungsdaten werden für einen Zeitraum von zehn Jahren aufbewahrt, gemäß den handels- und
                    steuerrechtlichen Verpflichtungen nach Artikel L. 123-22 des französischen Handelsgesetzbuchs.
                  </li>
                  <li>
                    Technische Protokolle werden dreißig Tage und die Sitzungen abgemeldeter Geräte neunzig Tage
                    aufbewahrt; Verbindungsdaten, deren Aufbewahrung das französische Gesetz für das Vertrauen in die
                    digitale Wirtschaft (LCEN) vorschreibt, werden ein Jahr lang aufbewahrt.
                  </li>
                  <li>
                    Von der Plattform erzeugte Analysedaten (Unternehmensprofile, identifizierte Kontakte, Aktionspläne,
                    Nachrichten) werden für die gesamte Vertragslaufzeit aufbewahrt und bei der Schließung des Kontos
                    gelöscht oder anonymisiert.
                  </li>
                  <li>
                    Berufliche Kontaktdaten Dritter, die von Datenanbietern stammen, werden drei Jahre nach dem letzten
                    Austausch oder der letzten sie betreffenden Aktivität nicht mehr angezeigt und nicht mehr
                    exportiert; endgültig gelöscht werden sie nur auf Löschungsantrag der betroffenen Person.
                  </li>
                  <li>
                    Der im Aktivitätsverlauf gespeicherte Inhalt von Nachrichten wird nach drei Jahren gelöscht; es
                    verbleiben nur nicht personenbezogene Angaben (Kanal, Datum).
                  </li>
                  <li>
                    An den Copiloten gesendete Sprachnachrichten und Bilder werden nach dreißig Tagen gelöscht,
                    archivierte Gesprächszusammenfassungen nach neunzig Tagen.
                  </li>
                  <li>
                    Anfragen, die der Copilot nicht bearbeiten konnte, werden neunzig Tage lang in maskierter und
                    gekürzter Form aufbewahrt, ohne Kennung eines Nutzers oder einer Organisation.
                  </li>
                  <li>
                    Die Statistiken der gemeinsamen anonymen Datenbasis werden jede Nacht neu berechnet: Nur die letzte
                    Fassung wird aufbewahrt.
                  </li>
                  <li>Cookies und Tracker werden für höchstens dreizehn Monate aufbewahrt.</li>
                </ul>
                <p>
                  Nach Ablauf der oben genannten Fristen werden die Daten gelöscht oder unumkehrbar anonymisiert. Im
                  Falle eines Rechtsstreits können die relevanten Daten für die gesamte Dauer des Verfahrens und bis zur
                  Erschöpfung aller Rechtsmittel aufbewahrt werden.
                </p>
              </>
            ),
          },
          {
            id: 'destinataires',
            title: 'Empfänger der Daten',
            body: (
              <>
                <p>
                  Die erhobenen personenbezogenen Daten können an folgende Empfänger weitergegeben werden: befugte
                  Mitarbeiter von BELLUM, streng im Rahmen ihrer Aufgaben; technische Auftragsverarbeiter, die am
                  Hosting, an der Wartung und am Betrieb der Plattform beteiligt und durch Vertragsklauseln gemäß
                  Artikel 28 DSGVO gebunden sind; der Zahlungsdienstleister, ausschließlich zur Abwicklung der
                  Finanztransaktionen; die Justiz- oder Verwaltungsbehörden, soweit gesetzlich vorgeschrieben.
                </p>
                <p>
                  Die technischen Auftragsverarbeiter von BELLUM gehören folgenden Kategorien an: Hosting-Anbieter der
                  Datenbank; Hosting-Anbieter der Anwendung; Anbieter von Modellen künstlicher Intelligenz;
                  Transkriptions- und Dokumentenlesedienste; Anbieter beruflicher B2B-Daten; Such- und Lesedienste für
                  öffentliche Webseiten; Anbieter für den Versand von E-Mails und SMS; Zahlungsdienstleister; Werkzeuge
                  zur technischen Überwachung. Die Werkzeuge, die Ihre Organisation mit der Plattform verbindet
                  (Postfach, Kalender, CRM, Telefonie), erhalten nur die Daten, die Sie dort eintragen möchten, und
                  jeder Schreibvorgang in einem CRM erfordert Ihre Freigabe.
                </p>
                <p>
                  BELLUM nimmt keinerlei Übertragung, Vermietung oder Bereitstellung personenbezogener Daten an Dritte
                  zu kommerziellen Zwecken vor. BELLUM verkauft die Daten seiner Nutzer nicht.
                </p>
                <p>
                  Die Verpflichtungen, die BELLUM im Rahmen dieser Richtlinie eingeht, spiegeln sich in den
                  Verpflichtungen wider, die es mit seinen Auftragsverarbeitern eingegangen ist, wobei BELLUM gegenüber
                  dem Nutzer allein für die Erfüllung seiner Pflichten verantwortlich bleibt.
                </p>
                <p>
                  Die Messwerkzeuge der Website — <strong>Plausible Analytics</strong>,{' '}
                  <strong>Vercel Web Analytics</strong> und <strong>Vercel Speed Insights</strong> — erhalten Daten,
                  wenn und nur wenn Sie darin eingewilligt haben. Was jedes von ihnen misst, wo seine Daten gespeichert
                  werden und was sein Anbieter zu Cookies angibt, steht in der Cookie- und Tracker-Richtlinie.
                </p>
              </>
            ),
          },
          {
            id: 'transferts',
            title: 'Übermittlung von Daten außerhalb der Europäischen Union',
            body: (
              <>
                <p>
                  Einige technische Auftragsverarbeiter von BELLUM können außerhalb der Europäischen Union
                  niedergelassen sein. Gegebenenfalls unterliegen diese Übermittlungen den in der DSGVO vorgesehenen
                  Garantien: einem Angemessenheitsbeschluss der Europäischen Kommission (insbesondere dem EU-US Data
                  Privacy Framework, angenommen am 10. Juli 2023), von der Europäischen Kommission angenommenen
                  Standardvertragsklauseln oder jeder anderen geeigneten Garantie im Sinne der Artikel 46 und 49 DSGVO.
                </p>
                <p>
                  Betroffen sind insbesondere die Anbieter von Modellen künstlicher Intelligenz und von Transkription,
                  einige Anbieter beruflicher Daten und von Websuche, der E-Mail-Versanddienst, der
                  Zahlungsdienstleister sowie einige Werkzeuge zur technischen Überwachung.
                </p>
                <p>
                  Eine Kopie der getroffenen Garantien erhalten Sie auf schriftliche Anfrage an{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'securite',
            title: 'Datensicherheit',
            body: (
              <>
                <p>
                  BELLUM ergreift geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes
                  Sicherheitsniveau gemäß Artikel 32 DSGVO zu gewährleisten, insbesondere: die Verschlüsselung der Daten
                  bei der Übertragung (mindestens Protokoll TLS 1.2) und im Ruhezustand; sichere
                  Authentifizierungsmechanismen mit Sitzungsverwaltung; die Trennung der Daten zwischen Nutzern durch
                  Zugriffskontrollrichtlinien auf Zeilenebene der Datenbank; die Protokollierung von Zugriffen und
                  Aktionen; regelmäßige Sicherungen und getestete Wiederherstellungsverfahren; die Beschränkung des
                  Zugriffs auf ausschließlich befugte Personen.
                </p>
                <p>
                  Der Zugriff auf die Plattform erfolgt über persönliche Zugangsdaten (E-Mail-Adresse und Passwort) und
                  über eine gesicherte Verbindung mittels HTTPS-Protokoll. Der Nutzer ist für die Vertraulichkeit seiner
                  Zugangsdaten verantwortlich und muss deren Zugang schützen.
                </p>
                <p>
                  BELLUM behandelt sämtliche Informationen und Dokumente, von denen es im Zusammenhang mit der
                  Erbringung seiner Leistungen Kenntnis erlangt, als streng vertraulich und sieht von deren Offenlegung
                  ab, außer in Fällen, in denen die offengelegten Elemente zum Zeitpunkt der Offenlegung öffentlich
                  zugänglich sind oder von Dritten auf rechtmäßige Weise erlangt wurden.
                </p>
              </>
            ),
          },
          {
            id: 'violations',
            title: 'Meldung von Verletzungen des Schutzes personenbezogener Daten',
            body: (
              <p>
                Im Falle einer Verletzung des Schutzes personenbezogener Daten im Sinne von Artikel 4 Nr. 12 DSGVO
                verpflichtet sich BELLUM, die Commission nationale de l'informatique et des libertés (CNIL) innerhalb
                von zweiundsiebzig Stunden nach Kenntnisnahme der Verletzung zu benachrichtigen, es sei denn, die
                Verletzung führt voraussichtlich nicht zu einem Risiko für die Rechte und Freiheiten der betroffenen
                Personen. Führt die Verletzung voraussichtlich zu einem hohen Risiko, werden auch die betroffenen
                Personen so schnell wie möglich informiert.
              </p>
            ),
          },
          {
            id: 'droits',
            title: 'Rechte der betroffenen Personen',
            body: (
              <>
                <p>
                  Gemäß den Artikeln 15 bis 22 DSGVO und dem französischen Datenschutzgesetz (loi Informatique et
                  Libertés) stehen Ihnen die folgenden Rechte an Ihren personenbezogenen Daten zu:
                </p>
                <ul className={LIST}>
                  <li>
                    Das Auskunftsrecht: Sie können eine Bestätigung darüber erhalten, ob Sie betreffende Daten
                    verarbeitet werden oder nicht, und gegebenenfalls Zugang zu diesen Daten sowie zu einer Reihe
                    zusätzlicher Informationen (Zwecke, Datenkategorien, Empfänger, Aufbewahrungsdauer) erhalten.
                  </li>
                  <li>
                    Das Recht auf Berichtigung: Sie können die Berichtigung unrichtiger oder unvollständiger Sie
                    betreffender Daten verlangen.
                  </li>
                  <li>
                    Das Recht auf Löschung (Recht auf Vergessenwerden): Unter den Voraussetzungen des Artikels 17 DSGVO
                    können Sie die Löschung Ihrer personenbezogenen Daten verlangen, außer wenn die Verarbeitung zur
                    Erfüllung einer rechtlichen Verpflichtung oder zur Geltendmachung, Ausübung oder Verteidigung von
                    Rechtsansprüchen erforderlich ist.
                  </li>
                  <li>
                    Das Recht auf Einschränkung der Verarbeitung: In den in Artikel 18 DSGVO definierten Fällen können
                    Sie die Einschränkung der Verarbeitung Ihrer Daten verlangen.
                  </li>
                  <li>
                    Das Widerspruchsrecht: Sie können der Verarbeitung Ihrer personenbezogenen Daten widersprechen, wenn
                    die Verarbeitung auf dem berechtigten Interesse beruht, einschließlich Profiling. BELLUM kann die
                    Verarbeitung jedoch aus zwingenden berechtigten Gründen fortführen, die die Interessen, Rechte und
                    Freiheiten der betroffenen Person überwiegen, oder zur Geltendmachung, Ausübung oder Verteidigung
                    von Rechtsansprüchen.
                  </li>
                  <li>
                    Das Recht auf Datenübertragbarkeit: Sie können Ihre personenbezogenen Daten in einem strukturierten,
                    gängigen und maschinenlesbaren Format erhalten und sie an einen anderen Verantwortlichen
                    übermitteln.
                  </li>
                  <li>
                    Das Recht auf Widerruf der Einwilligung: Beruht die Verarbeitung auf einer Einwilligung, können Sie
                    Ihre Einwilligung jederzeit widerrufen, ohne dass die Rechtmäßigkeit der vor dem Widerruf erfolgten
                    Verarbeitung berührt wird.
                  </li>
                  <li>
                    Das Recht, Weisungen über den Verbleib Ihrer Daten nach Ihrem Tod festzulegen, gemäß französischem
                    Recht.
                  </li>
                </ul>
                <p>
                  Zur Ausübung dieser Rechte richten Sie Ihren Antrag zusammen mit einem gültigen Identitätsnachweis:
                  per E-Mail an{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>{' '}
                  ; oder per Post an BELLUM, 90 rue des Archives, 75003 Paris, zu Händen der DSGVO-Abteilung. BELLUM
                  verpflichtet sich, innerhalb eines Monats nach Eingang des Antrags zu antworten. Diese Frist kann bei
                  Komplexität oder einer hohen Zahl von Anträgen um zwei weitere Monate verlängert werden.
                </p>
              </>
            ),
          },
          {
            id: 'droits-tiers',
            title: 'Rechte Dritter (berufliche Kontakte)',
            body: (
              <>
                <p>
                  Gemäß Artikel 14 DSGVO über die Informationspflicht, wenn die Daten nicht bei der betroffenen Person
                  erhoben wurden, informiert BELLUM die beruflichen Kontakte, deren Daten in seiner Datenbank
                  referenziert sind, darüber, dass ihnen dieselben Rechte wie die oben beschriebenen zustehen,
                  insbesondere das Recht, der Verarbeitung ihrer Daten jederzeit zu widersprechen.
                </p>
                <p>
                  Jeder Widerspruchs- oder Löschungsantrag wird innerhalb von dreißig Tagen bearbeitet. Die Daten der
                  betroffenen Person werden dann aus der Datenbank von BELLUM gelöscht und sind für die Nutzer der
                  Plattform nicht mehr zugänglich. Aufbewahrt wird nur ein nicht umkehrbarer technischer Fingerabdruck
                  ihrer Kennungen, insbesondere ihrer E-Mail-Adresse, um jede spätere Erhebung oder jeden späteren
                  Versand zu verhindern.
                </p>
                <p>
                  Die Quellen der Daten sind: gesetzliche Register, öffentlich zugängliche Unternehmensverzeichnisse,
                  von den Personen selbst in einem beruflichen Kontext veröffentlichte Informationen, vertraglich
                  gebundene Anbieter beruflicher B2B-Daten sowie die proprietäre Datenbank von BELLUM. Einige
                  Kontaktdaten können geschätzt und anschließend technisch geprüft sein; sie sind dann als solche
                  gekennzeichnet.
                </p>
                <p>
                  Wenn Ihnen ein Nutzer der Plattform eine Akquisenachricht sendet, handelt er als Verantwortlicher: Sie
                  können jederzeit ohne Begründung widersprechen, indem Sie ihm antworten oder an{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>{' '}
                  schreiben.
                </p>
              </>
            ),
          },
          {
            id: 'reclamation-cnil',
            title: 'Beschwerde bei der CNIL',
            body: (
              <>
                <p>
                  Wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer personenbezogenen Daten einen Verstoß gegen die
                  DSGVO darstellt, haben Sie das Recht, eine Beschwerde bei der Commission nationale de l'informatique
                  et des libertés (CNIL), der französischen Aufsichtsbehörde, einzureichen. CNIL, 3 place de Fontenoy,
                  TSA 80715, 75334 Paris Cedex 07. Website:{' '}
                  <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className={LINK}>
                    www.cnil.fr
                  </a>
                  .
                </p>
                <p>
                  BELLUM informiert den Nutzer außerdem über das Bestehen der Bloctel-Liste zum Widerspruch gegen
                  Telefonwerbung, in die er sich eintragen kann (
                  <a href="https://conso.bloctel.fr/" target="_blank" rel="noopener noreferrer" className={LINK}>
                    https://conso.bloctel.fr/
                  </a>
                  ).
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
        title="Beleid inzake privacy en bescherming van persoonsgegevens"
        lastUpdated="11 oktober 2026"
        intro='Overeenkomstig Verordening (EU) 2016/679 van het Europees Parlement en de Raad van 27 april 2016 betreffende de bescherming van natuurlijke personen in verband met de verwerking van persoonsgegevens en betreffende het vrije verkeer van die gegevens (hierna de "GDPR (AVG)"), en de gewijzigde Franse wet nr. 78-17 van 6 januari 1978 betreffende informatica, bestanden en vrijheden.'
        sections={[
          {
            id: 'preambule',
            title: 'Preambule',
            body: (
              <>
                <p>
                  De bescherming van uw persoonsgegevens is een prioriteit voor BELLUM. Dit beleid beschrijft de wijze
                  waarop wij uw persoonsgegevens verzamelen, verwerken en beschermen in het kader van het gebruik van de
                  website www.bellum-ai.com en het BellumAI-platform (hierna samen de "Site").
                </p>
                <p>
                  Dit beleid kan worden aangevuld met bijkomende informatie die in alle of een deel van een geleverde
                  dienst wordt gepreciseerd. Wij kunnen dit beleid te allen tijde wijzigen, aanvullen of bijwerken, met
                  name om te voldoen aan elke wettelijke, reglementaire of technische ontwikkeling. Elke wijziging wordt
                  van kracht vanaf de datum waarop het gewijzigde beleid online wordt gepubliceerd.
                </p>
              </>
            ),
          },
          {
            id: 'responsable-traitement',
            title: 'Verwerkingsverantwoordelijke',
            body: (
              <>
                <p>
                  De verwerkingsverantwoordelijke voor de persoonsgegevens is BELLUM, een SASU met een maatschappelijk
                  kapitaal van 1.000,00 euro, ingeschreven onder nummer 931 750 681 R.C.S. Paris, waarvan de
                  maatschappelijke zetel gevestigd is te 90, rue des Archives, 75003 Paris.
                </p>
                <p>
                  Voor elke vraag met betrekking tot de bescherming van uw persoonsgegevens kunt u contact met ons
                  opnemen via de volgende gegevens:{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  , of per post ter attentie van de functionaris voor gegevensbescherming, BELLUM, 90 rue des Archives,
                  75003 Paris.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-collectees',
            title: 'Verzamelde gegevens',
            body: (
              <>
                <p className={SUBTITLE}>2.1. Gegevens die rechtstreeks door de gebruiker worden verstrekt</p>
                <p>
                  Bij het aanmaken van uw account en het gebruik van het platform worden de volgende gegevens verzameld:
                  naam en voornaam; professioneel e-mailadres; naam van de werkgevende onderneming; informatie over het
                  commerciële profiel van de gebruiker zoals verstrekt tijdens de registratievragenlijst
                  (activiteitensectoren, dienstenaanbod, geografisch gebied, teamgrootte, commerciële positionering);
                  notities, opmerkingen en annotaties die door de gebruiker in het platform worden ingevoerd.
                </p>
                <p>
                  Wat de betalingsgegevens betreft, worden deze uitsluitend verwerkt door onze PCI-DSS-gecertificeerde
                  betalingsdienstverlener. BELLUM slaat geen bankgegevens op, verzamelt deze niet en heeft er geen
                  toegang toe (kaartnummer, veiligheidscode, vervaldatum).
                </p>
                <p className={SUBTITLE}>2.2. Automatisch verzamelde gegevens</p>
                <p>
                  Wanneer u op de Site surft en het platform gebruikt, kunnen de volgende gegevens automatisch worden
                  verzameld: IP-adres; type en versie van de browser; besturingssysteem; geraadpleegde pagina's en duur
                  van de raadpleging; verbindingsgegevens (data, tijdstippen, sessie-identificatoren); in het platform
                  uitgevoerde acties (gestarte analyses, gekopieerde berichten, verrijkte contacten).
                </p>
                <p className={SUBTITLE}>2.3. Gegevens verkregen uit andere bronnen</p>
                <p>
                  Wij kunnen ook informatie verkrijgen uit andere bronnen, zoals: publiek toegankelijke bronnen
                  (wettelijke registers, beroepsgidsen, officiële publicaties, door bedrijven gepubliceerde vacatures,
                  informatie die door de betrokkenen zelf op openbare professionele netwerken is gepubliceerd);
                  aanbieders van zakelijke B2B-gegevens die contractueel aan BELLUM zijn gebonden (zakelijke
                  contactgegevens, functiewijzigingen); de eigen databank van BELLUM, opgebouwd en verrijkt met
                  inachtneming van het toepasselijke wettelijke kader. BELLUM omzeilt nooit een authenticatie of
                  technische beveiliging van een website om gegevens te verkrijgen.
                </p>
                <p className={SUBTITLE}>2.4. Gegevens met betrekking tot derden (professionele contacten)</p>
                <p>
                  In het kader van zijn functies voor commerciële intelligentie verwijst het BellumAI-platform naar
                  gegevens over professionele contacten van derden. Deze gegevens worden samengesteld uit publiek
                  toegankelijke bronnen, van contractueel gebonden aanbieders van zakelijke gegevens en uit de eigen
                  databank van BELLUM. Ze kunnen omvatten: namen en voornamen van professionele contacten; functies en
                  functietitels; zakelijke contactgegevens (zakelijk e-mailadres, zakelijk telefoonnummer);
                  verbondenheid met een rechtspersoon; een functiewijziging, met datum en bron; informatie die de
                  betrokkene in een professionele context openbaar heeft gemaakt.
                </p>
                <p>
                  Sommige van deze gegevens kunnen geschat zijn in plaats van waargenomen: bijvoorbeeld een zakelijk
                  e-mailadres dat is opgebouwd volgens het in het bedrijf gebruikte formaat en vervolgens technisch bij
                  de mailserver is gecontroleerd, een veronderstelde rapportagelijn of een uit de loopbaan afgeleide
                  senioriteit. Ze worden in het platform altijd als geschat aangeduid, nooit als geverifieerde
                  informatie voorgesteld en vervangen zodra geverifieerde informatie of een correctie beschikbaar is.
                  Geen enkel criterium zoals leeftijd, geslacht, afkomst, privéadres of foto speelt een rol in de
                  rangschikking van een persoon, en de geboortedatum wordt nooit verzameld.
                </p>
                <p>
                  Deze gegevens zijn strikt professioneel van aard. Er worden geen gegevens met betrekking tot het
                  privéleven, geen gevoelige gegevens in de zin van artikel 9 van de GDPR en geen gegevens met
                  betrekking tot minderjarigen verzameld of verwerkt.
                </p>
              </>
            ),
          },
          {
            id: 'finalites',
            title: 'Doeleinden en rechtsgronden van de verwerking',
            body: (
              <>
                <p>
                  Wij verzamelen of verwerken uw persoonsgegevens met inachtneming van de GDPR, voor de volgende
                  doeleinden en op de volgende rechtsgronden:
                </p>
                <ul className={LIST}>
                  <li>
                    Aanmaak en beheer van het gebruikersaccount: rechtsgrond van de uitvoering van de overeenkomst
                    (artikel 6.1.b van de GDPR).
                  </li>
                  <li>
                    Levering van de diensten van het platform, met inbegrip van bedrijfsanalyses, identificatie van
                    contacten, het genereren van strategische aanbevelingen en gepersonaliseerde berichten: rechtsgrond
                    van de uitvoering van de overeenkomst (artikel 6.1.b van de GDPR).
                  </li>
                  <li>
                    Personalisering van de gebruikerservaring op basis van het opgegeven commerciële profiel:
                    rechtsgrond van het gerechtvaardigd belang (artikel 6.1.f van de GDPR).
                  </li>
                  <li>
                    Facturering, beheer van abonnementen en credits: rechtsgrond van de uitvoering van de overeenkomst
                    (artikel 6.1.b) en van de wettelijke verplichting (artikel 6.1.c van de GDPR).
                  </li>
                  <li>
                    Opbouw en verrijking van de databank van professionele contacten op basis van publiek toegankelijke
                    bronnen, om gebruikers in staat te stellen relevante gesprekspartners te identificeren in een
                    context van business-to-business (B2B) commerciële prospectie: rechtsgrond van het gerechtvaardigd
                    belang (artikel 6.1.f van de GDPR). BELLUM heeft een belangenafweging uitgevoerd tussen dit
                    gerechtvaardigd belang en de rechten en vrijheden van de betrokkenen, overeenkomstig de
                    aanbevelingen van de CNIL. De verwerkte gegevens zijn strikt professioneel, publiek toegankelijk, en
                    de verwerking ervan valt binnen de redelijke verwachtingen van personen die beslissingsfuncties
                    binnen ondernemingen uitoefenen.
                  </li>
                  <li>
                    Verbetering van de diensten, ontwikkeling van nieuwe functionaliteiten en opstelling van
                    geanonimiseerde gebruiksstatistieken: rechtsgrond van het gerechtvaardigd belang (artikel 6.1.f van
                    de GDPR).
                  </li>
                  <li>
                    Commerciële communicatie met betrekking tot de diensten van BELLUM: rechtsgrond van de toestemming
                    (artikel 6.1.a van de GDPR), of van het gerechtvaardigd belang voor bestaande klanten onder de
                    voorwaarden van artikel L. 34-5 van het Franse Wetboek van post en elektronische communicatie.
                  </li>
                  <li>
                    Naleving van wettelijke en reglementaire verplichtingen: rechtsgrond van de wettelijke verplichting
                    (artikel 6.1.c van de GDPR).
                  </li>
                  <li>
                    Fraudepreventie en beveiliging van het platform: rechtsgrond van het gerechtvaardigd belang (artikel
                    6.1.f van de GDPR).
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'traitements-specifiques',
            title: 'Verwerkingen eigen aan bepaalde functies',
            body: (
              <>
                <p>
                  Sommige functies van het platform berusten op bijzondere verwerkingen. Verschillende daarvan werken
                  alleen als u of uw organisatie ze activeert.
                </p>
                <ul className={LIST}>
                  <li>
                    Gemeenschappelijke anonieme basis: elke nacht worden anonieme statistieken berekend op basis van de
                    activiteit van alle klantorganisaties (bijvoorbeeld welke acties succes hebben, per sector en
                    bedrijfsgrootte), zodat elke organisatie haar resultaten kan vergelijken met wat elders werkt. Deze
                    statistieken bevatten geen naam van een persoon, een klantorganisatie of een eindklant, geen vrije
                    tekst, en worden pas gepubliceerd vanaf drie verschillende bijdragende organisaties. Rechtsgrond:
                    het gerechtvaardigd belang van BELLUM om de dienst te verbeteren (artikel 6, lid 1, onder f, van de
                    GDPR). U kunt hiertegen bezwaar maken door te schrijven naar{' '}
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>
                    .
                  </li>
                  <li>
                    Lezen van uw eigen mailbox: wanneer u uw zakelijke mailbox koppelt, kan de copiloot de inhoud van de
                    met uw contacten verbonden correspondentie lezen om die samen te vatten, een opvolging voor te
                    bereiden of een behoefte te herkennen. Deze inhoud wordt alleen voor u gebruikt: hij wordt nooit aan
                    uw collega's of uw leidinggevende getoond. Rechtsgrond: uitvoering van de overeenkomst, na uw
                    activering.
                  </li>
                  <li>
                    Aanbieders van zakelijke gegevens en functiewijzigingen: om zakelijke contactgegevens te verkrijgen
                    of te melden dat een gevolgd contact van bedrijf is veranderd, raadpleegt het platform contractueel
                    gebonden aanbieders van zakelijke B2B-gegevens. Er vindt geen geautomatiseerde verzameling plaats op
                    een professioneel sociaal netwerk. Rechtsgrond: het gerechtvaardigd belang van B2B-prospectie
                    (artikel 6, lid 1, onder f, van de GDPR).
                  </li>
                  <li>
                    Gebruiksmeting per gebruiker: als uw werkgever deze activeert, kan uw leidinggevende tellers van uw
                    gebruik van het platform inzien (aantal acties per functie en per periode). Bestede tijd,
                    schermopnames en de inhoud van uw berichten worden niet gemeten. Uw werkgever,
                    verwerkingsverantwoordelijke voor deze verwerking, verbindt zich ertoe u vooraf te informeren en,
                    waar vereist, zijn ondernemingsraad te raadplegen; BELLUM treedt namens hem op als verwerker.
                  </li>
                  <li>
                    Meting van het productgebruik: om te weten welke schermen problemen geven, registreert het platform
                    de bekeken en verlaten schermen, gekoppeld aan een tijdelijke sessie-identificatie die elke
                    vierentwintig uur wordt vernieuwd — nooit aan uw identificatie, die van uw organisatie of de inhoud
                    van uw invoer. Onder vijf verschillende sessies wordt geen statistiek gemaakt, en er wordt geen
                    hulpmiddel voor het opnemen of afspelen van sessies gebruikt. Rechtsgrond: het gerechtvaardigd
                    belang van BELLUM om de dienst te verbeteren (artikel 6, lid 1, onder f, van de GDPR); u kunt
                    hiertegen bezwaar maken door te schrijven naar{' '}
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>
                    .
                  </li>
                  <li>
                    Meldingen per e-mail en sms: als u ze activeert, ontvangt u meldingen per e-mail of per sms, in de
                    landen waar dit kanaal open is. Uw mobiele nummer wordt met een code gecontroleerd. Rechtsgrond: uw
                    toestemming, vastgelegd met haar datum, die u op elk moment in uw instellingen kunt intrekken.
                  </li>
                  <li>
                    Analyse van opgenomen gesprekken: als uw organisatie dit activeert, kan een verkoopgesprek dat is
                    opgenomen met de toestemming van elke deelnemer, aangekondigd bij het begin van het gesprek, worden
                    uitgeschreven en samengevat. Geen enkel gesprek wordt zonder deze toestemming opgenomen. Het
                    audiobestand dat voor een vergaderverslag wordt geüpload, wordt niet bewaard: alleen de tekst.
                  </li>
                  <li>
                    Verzending onder mandaat: geen enkel bericht wordt verzonden zonder uw goedkeuring, behalve bij een
                    uitdrukkelijk mandaat van uw kant voor benoemde contacten, nagelezen inhoud en een beperkte duur en
                    omvang. Het mandaat is op elk moment herroepbaar; een antwoord of bezwaar van de ontvanger stopt de
                    verzending.
                  </li>
                </ul>
                <p>
                  Wanneer gebruikers van het platform professionals benaderen, doen zij dat als
                  verwerkingsverantwoordelijken. Overeenkomstig de aanbevelingen van de CNIL moet een prospectiebericht
                  dat zonder voorafgaande toestemming aan een professional wordt gericht, verband houden met diens
                  functie en hem in staat stellen zich eenvoudig en kosteloos tegen elk volgend bericht te verzetten.
                  Elk geregistreerd bezwaar wordt vóór elke verzending gecontroleerd en stopt een lopende verzending.
                </p>
              </>
            ),
          },
          {
            id: 'conservation',
            title: 'Bewaartermijn van de gegevens',
            body: (
              <>
                <ul className={LIST}>
                  <li>
                    De gegevens van het gebruikersaccount worden bewaard gedurende de volledige looptijd van de
                    overeenkomst. Bij de verwijdering van het account worden de persoonsgegevens onverwijld
                    geanonimiseerd, met uitzondering van de gegevens die de wet verplicht te bewaren. Een account zonder
                    aanmelding gedurende drie jaar kan worden gesloten.
                  </li>
                  <li>
                    Factureringsgegevens worden bewaard gedurende een periode van tien jaar, overeenkomstig de
                    boekhoudkundige en fiscale verplichtingen van artikel L. 123-22 van het Franse Wetboek van
                    koophandel.
                  </li>
                  <li>
                    Technische logboeken worden dertig dagen bewaard en de sessies van afgemelde apparaten negentig
                    dagen; verbindingsgegevens die de Franse wet voor het vertrouwen in de digitale economie (LCEN)
                    verplicht te bewaren, worden één jaar bewaard.
                  </li>
                  <li>
                    Door het platform gegenereerde analysegegevens (bedrijfsfiches, geïdentificeerde contacten,
                    actieplannen, berichten) worden bewaard gedurende de volledige looptijd van de overeenkomst en bij
                    de sluiting van het account verwijderd of geanonimiseerd.
                  </li>
                  <li>
                    Zakelijke contactgegevens van derden die van gegevensaanbieders afkomstig zijn, worden drie jaar na
                    de laatste uitwisseling of de laatste activiteit die hen betreft niet meer getoond of geëxporteerd;
                    zij worden alleen definitief verwijderd op verzoek tot wissing van de betrokkene.
                  </li>
                  <li>
                    De inhoud van berichten die in de activiteitengeschiedenis wordt bewaard, wordt na drie jaar gewist;
                    alleen niet-persoonlijke informatie (kanaal, datum) blijft over.
                  </li>
                  <li>
                    Spraakberichten en afbeeldingen die naar de copiloot zijn gestuurd, worden na dertig dagen
                    verwijderd; gearchiveerde gesprekssamenvattingen na negentig dagen.
                  </li>
                  <li>
                    Verzoeken die de copiloot niet kon behandelen, worden negentig dagen bewaard in gemaskeerde en
                    ingekorte vorm, zonder identificatie van een gebruiker of organisatie.
                  </li>
                  <li>
                    De statistieken van de gemeenschappelijke anonieme basis worden elke nacht opnieuw berekend: alleen
                    de laatste versie wordt bewaard.
                  </li>
                  <li>Cookies en trackers worden bewaard gedurende maximaal dertien maanden.</li>
                </ul>
                <p>
                  Na afloop van de hierboven vermelde termijnen worden de gegevens verwijderd of op onomkeerbare wijze
                  geanonimiseerd. In geval van een gerechtelijke procedure kunnen de relevante gegevens worden bewaard
                  gedurende de volledige duur van de procedure en tot alle rechtsmiddelen zijn uitgeput.
                </p>
              </>
            ),
          },
          {
            id: 'destinataires',
            title: 'Ontvangers van de gegevens',
            body: (
              <>
                <p>
                  De verzamelde persoonsgegevens kunnen worden meegedeeld aan de volgende ontvangers: het gemachtigde
                  personeel van BELLUM, strikt binnen de grenzen van hun taken; technische verwerkers die betrokken zijn
                  bij de hosting, het onderhoud en de werking van het platform, gebonden door contractuele clausules
                  conform artikel 28 van de GDPR; de betalingsdienstverlener, uitsluitend voor de verwerking van
                  financiële transacties; de gerechtelijke of administratieve autoriteiten, wanneer de wet dit vereist.
                </p>
                <p>
                  De technische verwerkers van BELLUM behoren tot de volgende categorieën: host van de databank; hosts
                  van de applicatie; aanbieders van modellen voor artificiële intelligentie; transcriptie- en
                  documentleesdiensten; aanbieders van zakelijke B2B-gegevens; zoek- en leesdiensten voor openbare
                  webpagina's; aanbieders voor het verzenden van e-mails en sms'en; betalingsdienstverlener; tools voor
                  technisch toezicht. De tools die uw organisatie met het platform verbindt (mailbox, agenda, CRM,
                  telefonie) ontvangen alleen de gegevens die u daarin wilt schrijven, en elke schrijfactie in een CRM
                  vereist uw goedkeuring.
                </p>
                <p>
                  BELLUM gaat niet over tot enige overdracht, verhuur of terbeschikkingstelling van persoonsgegevens aan
                  derden voor commerciële doeleinden. BELLUM verkoopt de gegevens van zijn gebruikers niet.
                </p>
                <p>
                  De verbintenissen die BELLUM in het kader van dit beleid aangaat, worden weerspiegeld in de
                  verbintenissen die het met zijn verwerkers heeft gesloten, waarbij BELLUM als enige jegens de
                  gebruiker verantwoordelijk blijft voor de nakoming van zijn verplichtingen.
                </p>
                <p>
                  De meettools van de Site — <strong>Plausible Analytics</strong>, <strong>Vercel Web Analytics</strong>{' '}
                  en <strong>Vercel Speed Insights</strong> — ontvangen gegevens wanneer, en uitsluitend wanneer, u
                  daarvoor toestemming hebt gegeven. Wat elk van de drie meet, waar hun gegevens worden bewaard en wat
                  hun uitgever over cookies verklaart, staat in het cookie- en trackerbeleid.
                </p>
              </>
            ),
          },
          {
            id: 'transferts',
            title: 'Doorgifte van gegevens buiten de Europese Unie',
            body: (
              <>
                <p>
                  Sommige technische verwerkers van BELLUM kunnen buiten de Europese Unie gevestigd zijn. In voorkomend
                  geval worden deze doorgiften omkaderd door de waarborgen waarin de GDPR voorziet: een
                  adequaatheidsbesluit van de Europese Commissie (met name het EU-VS Data Privacy Framework, aangenomen
                  op 10 juli 2023), door de Europese Commissie vastgestelde modelcontractbepalingen, of elke andere
                  passende waarborg in de zin van de artikelen 46 en 49 van de GDPR.
                </p>
                <p>
                  Het gaat met name om de aanbieders van modellen voor artificiële intelligentie en van transcriptie,
                  sommige aanbieders van zakelijke gegevens en van webzoekopdrachten, de dienst voor het verzenden van
                  e-mails, de betalingsdienstverlener en sommige tools voor technisch toezicht.
                </p>
                <p>
                  U kunt een kopie van de getroffen waarborgen verkrijgen door te schrijven naar{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'securite',
            title: 'Beveiliging van de gegevens',
            body: (
              <>
                <p>
                  BELLUM treft passende technische en organisatorische maatregelen om een op het risico afgestemd
                  beveiligingsniveau te waarborgen, overeenkomstig artikel 32 van de GDPR, en met name: de versleuteling
                  van gegevens tijdens de overdracht (minimaal TLS 1.2-protocol) en in rust; beveiligde
                  authenticatiemechanismen met sessiebeheer; de scheiding van gegevens tussen gebruikers door middel van
                  toegangscontrolebeleid op rijniveau in de databank; de logging van toegangen en acties; regelmatige
                  back-ups en geteste herstelprocedures; de beperking van de toegang tot uitsluitend gemachtigde
                  personen.
                </p>
                <p>
                  De toegang tot het platform verloopt via persoonlijke inloggegevens (e-mailadres en wachtwoord) en via
                  een beveiligde verbinding met het HTTPS-protocol. De gebruiker is verantwoordelijk voor de
                  vertrouwelijkheid van zijn inloggegevens en moet de toegang ertoe beschermen.
                </p>
                <p>
                  BELLUM beschouwt alle informatie en documenten waarvan het kennis zou krijgen bij de uitvoering van
                  zijn diensten als strikt vertrouwelijk, en onthoudt zich van de openbaarmaking ervan, behalve wanneer
                  de openbaargemaakte elementen op de datum van openbaarmaking tot het publieke domein behoren of op
                  rechtmatige wijze van derden zijn verkregen.
                </p>
              </>
            ),
          },
          {
            id: 'violations',
            title: 'Melding van inbreuken in verband met persoonsgegevens',
            body: (
              <p>
                In geval van een inbreuk in verband met persoonsgegevens in de zin van artikel 4, punt 12, van de GDPR
                verbindt BELLUM zich ertoe de Commission nationale de l'informatique et des libertés (CNIL) binnen
                tweeënzeventig uur na kennisname van de inbreuk in kennis te stellen, tenzij het onwaarschijnlijk is dat
                de inbreuk een risico inhoudt voor de rechten en vrijheden van de betrokkenen. Wanneer de inbreuk
                waarschijnlijk een hoog risico inhoudt, worden de betrokkenen eveneens zo spoedig mogelijk geïnformeerd.
              </p>
            ),
          },
          {
            id: 'droits',
            title: 'Rechten van de betrokkenen',
            body: (
              <>
                <p>
                  Overeenkomstig de artikelen 15 tot en met 22 van de GDPR en de Franse wet inzake informatica en
                  vrijheden (loi Informatique et Libertés) beschikt u over de volgende rechten met betrekking tot uw
                  persoonsgegevens:
                </p>
                <ul className={LIST}>
                  <li>
                    Het recht op inzage: u kunt bevestiging krijgen of er al dan niet gegevens over u worden verwerkt
                    en, in voorkomend geval, toegang krijgen tot die gegevens alsook tot een aantal aanvullende gegevens
                    (doeleinden, categorieën van gegevens, ontvangers, bewaartermijn).
                  </li>
                  <li>
                    Het recht op rectificatie: u kunt de rectificatie verkrijgen van onjuiste of onvolledige gegevens
                    die op u betrekking hebben.
                  </li>
                  <li>
                    Het recht op wissing (recht op vergetelheid): onder de voorwaarden van artikel 17 van de GDPR kunt u
                    de wissing van uw persoonsgegevens verkrijgen, behalve wanneer de verwerking noodzakelijk is om te
                    voldoen aan een wettelijke verplichting of voor de instelling, uitoefening of onderbouwing van een
                    rechtsvordering.
                  </li>
                  <li>
                    Het recht op beperking van de verwerking: in de in artikel 18 van de GDPR omschreven gevallen kunt u
                    de beperking van de verwerking van uw gegevens verkrijgen.
                  </li>
                  <li>
                    Het recht van bezwaar: u kunt bezwaar maken tegen de verwerking van uw persoonsgegevens wanneer de
                    verwerking gebaseerd is op het gerechtvaardigd belang, met inbegrip van profilering. BELLUM kan de
                    verwerking evenwel voortzetten om dwingende gerechtvaardigde redenen die zwaarder wegen dan de
                    belangen, rechten en vrijheden van de betrokkene, of voor de instelling, uitoefening of onderbouwing
                    van een rechtsvordering.
                  </li>
                  <li>
                    Het recht op overdraagbaarheid: u kunt uw persoonsgegevens ontvangen in een gestructureerd, gangbaar
                    en machineleesbaar formaat en deze doorgeven aan een andere verwerkingsverantwoordelijke.
                  </li>
                  <li>
                    Het recht om de toestemming in te trekken: wanneer de verwerking op toestemming berust, kunt u uw
                    toestemming te allen tijde intrekken, zonder dat dit afbreuk doet aan de rechtmatigheid van de
                    verwerking die vóór de intrekking heeft plaatsgevonden.
                  </li>
                  <li>
                    Het recht om richtlijnen vast te stellen met betrekking tot het lot van uw gegevens na uw
                    overlijden, overeenkomstig de Franse wetgeving.
                  </li>
                </ul>
                <p>
                  Om deze rechten uit te oefenen, richt u uw verzoek, vergezeld van een geldig identiteitsbewijs: per
                  e-mail aan{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>{' '}
                  ; of per post aan BELLUM, 90 rue des Archives, 75003 Paris, ter attentie van de GDPR-dienst. BELLUM
                  verbindt zich ertoe te antwoorden binnen een termijn van één maand na ontvangst van het verzoek. Deze
                  termijn kan met twee bijkomende maanden worden verlengd in geval van complexiteit of een groot aantal
                  verzoeken.
                </p>
              </>
            ),
          },
          {
            id: 'droits-tiers',
            title: 'Rechten van derden (professionele contacten)',
            body: (
              <>
                <p>
                  Overeenkomstig artikel 14 van de GDPR betreffende de te verstrekken informatie wanneer de gegevens
                  niet bij de betrokkene zijn verzameld, informeert BELLUM de professionele contacten van wie de
                  gegevens in zijn databank zijn opgenomen dat zij over dezelfde rechten beschikken als hierboven
                  beschreven, en in het bijzonder over het recht om zich te allen tijde tegen de verwerking van hun
                  gegevens te verzetten.
                </p>
                <p>
                  Elk verzoek tot bezwaar of verwijdering wordt binnen dertig dagen behandeld. De gegevens van de
                  betrokkene worden dan uit de databank van BELLUM verwijderd en zijn niet langer toegankelijk voor de
                  gebruikers van het platform. Alleen een niet-omkeerbare technische vingerafdruk van zijn
                  identificatiegegevens, met name zijn e-mailadres, wordt bewaard om elke latere verzameling of
                  verzending te voorkomen.
                </p>
                <p>
                  De bronnen van de gegevens zijn: wettelijke registers, publiek toegankelijke bedrijvengidsen,
                  informatie die door de personen zelf in een professionele context is gepubliceerd, contractueel
                  gebonden aanbieders van zakelijke B2B-gegevens, en de eigen databank van BELLUM. Sommige
                  contactgegevens kunnen geschat en vervolgens technisch gecontroleerd zijn; zij worden dan als zodanig
                  aangeduid.
                </p>
                <p>
                  Wanneer een gebruiker van het platform u een prospectiebericht stuurt, treedt hij op als
                  verwerkingsverantwoordelijke: u kunt zich op elk moment, zonder opgave van redenen, verzetten door hem
                  te antwoorden of te schrijven naar{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'reclamation-cnil',
            title: 'Klacht bij de CNIL',
            body: (
              <>
                <p>
                  Indien u van mening bent dat de verwerking van uw persoonsgegevens een inbreuk op de GDPR vormt, hebt
                  u het recht een klacht in te dienen bij de Commission nationale de l'informatique et des libertés
                  (CNIL), de Franse toezichthoudende autoriteit. CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex
                  07. Website:{' '}
                  <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className={LINK}>
                    www.cnil.fr
                  </a>
                  .
                </p>
                <p>
                  BELLUM informeert de gebruiker eveneens over het bestaan van de Bloctel-lijst voor verzet tegen
                  telefonische marketing, waarop hij zich kan inschrijven (
                  <a href="https://conso.bloctel.fr/" target="_blank" rel="noopener noreferrer" className={LINK}>
                    https://conso.bloctel.fr/
                  </a>
                  ).
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
        title="Privacy and personal data protection policy"
        lastUpdated="October 11, 2026"
        intro='In accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data (hereinafter the "GDPR"), and with French Law No. 78-17 of 6 January 1978 as amended, relating to information technology, data files and civil liberties.'
        sections={[
          {
            id: 'preambule',
            title: 'Preamble',
            body: (
              <>
                <p>
                  The protection of your personal data is a priority for BELLUM. This policy describes the way in which
                  we collect, process and protect your personal data in connection with the use of the website
                  www.bellum-ai.com and the BellumAI platform (together referred to hereinafter as the "Site").
                </p>
                <p>
                  This policy may be supplemented by additional information specified in all or part of a service
                  provided. We may modify, supplement or update this policy at any time, in particular in order to
                  comply with any legal, regulatory or technical development. Any modification shall take effect from
                  the date on which the amended policy is published online.
                </p>
              </>
            ),
          },
          {
            id: 'responsable-traitement',
            title: 'Data controller',
            body: (
              <>
                <p>
                  The controller of the processing of personal data is BELLUM, a SASU with a share capital of 1,000.00
                  euros, registered under number 931 750 681 R.C.S. Paris, whose registered office is located at 90, rue
                  des Archives, 75003 Paris.
                </p>
                <p>
                  For any question relating to the protection of your personal data, please contact us at the following
                  details:{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  , or by post for the attention of the Data Protection Officer, BELLUM, 90 rue des Archives, 75003
                  Paris.
                </p>
              </>
            ),
          },
          {
            id: 'donnees-collectees',
            title: 'Data collected',
            body: (
              <>
                <p className={SUBTITLE}>2.1. Data provided directly by the user</p>
                <p>
                  When you create your account and use the platform, the following data is collected: surname and first
                  name; professional email address; name of the employing company; information relating to the user's
                  commercial profile as provided during the registration questionnaire (business sectors, service
                  offerings, geographic area, team size, commercial positioning); notes, comments and annotations
                  entered by the user in the platform.
                </p>
                <p>
                  With regard to payment data, this is processed exclusively by our PCI-DSS certified payment provider.
                  BELLUM does not store, collect or have access to any banking data (card number, security code, expiry
                  date).
                </p>
                <p className={SUBTITLE}>2.2. Data collected automatically</p>
                <p>
                  When you browse the Site and use the platform, the following data may be collected automatically: IP
                  address; browser type and version; operating system; pages viewed and viewing duration; connection
                  data (dates, times, session identifiers); actions performed in the platform (analyses launched,
                  messages copied, contacts enriched).
                </p>
                <p className={SUBTITLE}>2.3. Data obtained from other sources</p>
                <p>
                  We may also obtain information from other sources, such as: publicly accessible sources (legal
                  registers, professional directories, official publications, job offers published by companies,
                  information published by the data subjects themselves on public professional networks);
                  business-to-business professional data providers bound to BELLUM by contract (business contact
                  details, job changes); the proprietary database of BELLUM, built and enriched in compliance with the
                  applicable legal framework. BELLUM never circumvents a website's authentication or technical
                  protection to obtain data.
                </p>
                <p className={SUBTITLE}>2.4. Data relating to third parties (professional contacts)</p>
                <p>
                  As part of its business intelligence features, the BellumAI platform references data relating to
                  third-party professional contacts. This data is built from publicly accessible sources, from
                  professional data providers bound by contract and from the proprietary database of BELLUM. It may
                  include: surnames and first names of professional contacts; roles and job titles; professional contact
                  details (professional email address, professional telephone number); attachment to a legal entity; a
                  job change, with its date and source; information published publicly by the data subject in a
                  professional context.
                </p>
                <p>
                  Some of this data may be estimated rather than observed: for example a professional email address
                  built from the format used in the company and then technically checked with its mail server, an
                  assumed reporting line or a seniority inferred from a career path. It is always flagged as estimated
                  in the platform, never presented as verified information, and replaced as soon as verified information
                  or a correction is available. No criterion such as age, gender, origin, home address or photograph
                  plays any part in how a person is ranked, and dates of birth are never collected.
                </p>
                <p>
                  This data is strictly professional in nature. No data relating to private life, no sensitive data
                  within the meaning of Article 9 of the GDPR, and no data relating to minors is collected or processed.
                </p>
              </>
            ),
          },
          {
            id: 'finalites',
            title: 'Purposes and legal bases of the processing',
            body: (
              <>
                <p>
                  We collect or process your personal data in compliance with the GDPR, for the following purposes and
                  on the following legal bases:
                </p>
                <ul className={LIST}>
                  <li>
                    Creation and management of the user account: legal basis of the performance of the contract (Article
                    6.1.b of the GDPR).
                  </li>
                  <li>
                    Provision of the platform's services, including company analyses, contact identification, the
                    generation of strategic recommendations and personalised messages: legal basis of the performance of
                    the contract (Article 6.1.b of the GDPR).
                  </li>
                  <li>
                    Personalisation of the user experience according to the declared commercial profile: legal basis of
                    legitimate interest (Article 6.1.f of the GDPR).
                  </li>
                  <li>
                    Billing, management of subscriptions and credits: legal basis of the performance of the contract
                    (Article 6.1.b) and of legal obligation (Article 6.1.c of the GDPR).
                  </li>
                  <li>
                    Building and enriching the database of professional contacts from publicly accessible sources, in
                    order to enable users to identify relevant interlocutors in a business-to-business (B2B) commercial
                    prospecting context: legal basis of legitimate interest (Article 6.1.f of the GDPR). BELLUM has
                    carried out a balancing test between this legitimate interest and the rights and freedoms of the
                    data subjects, in accordance with the CNIL's recommendations. The data processed is strictly
                    professional, publicly accessible, and its processing falls within the reasonable expectations of
                    persons holding decision-making roles within companies.
                  </li>
                  <li>
                    Improvement of services, development of new features and production of anonymised usage statistics:
                    legal basis of legitimate interest (Article 6.1.f of the GDPR).
                  </li>
                  <li>
                    Commercial communication relating to BELLUM services: legal basis of consent (Article 6.1.a of the
                    GDPR), or of legitimate interest for existing customers under the conditions provided for by Article
                    L. 34-5 of the French Postal and Electronic Communications Code.
                  </li>
                  <li>
                    Compliance with legal and regulatory obligations: legal basis of legal obligation (Article 6.1.c of
                    the GDPR).
                  </li>
                  <li>
                    Fraud prevention and platform security: legal basis of legitimate interest (Article 6.1.f of the
                    GDPR).
                  </li>
                </ul>
              </>
            ),
          },
          {
            id: 'traitements-specifiques',
            title: 'Processing specific to certain features',
            body: (
              <>
                <p>
                  Some features of the platform rely on specific processing. Several of them only work if you or your
                  organisation switch them on.
                </p>
                <ul className={LIST}>
                  <li>
                    Shared anonymous base: every night, anonymous statistics are computed from the activity of all
                    customer organisations (for example, which actions succeed, by sector and company size), so that
                    each organisation can compare its results with what works elsewhere. These statistics contain no
                    name of a person, a customer organisation or an end customer, no free text, and are only published
                    once three distinct organisations contribute to them. Legal basis: BELLUM's legitimate interest in
                    improving the service (Article 6.1.f of the GDPR). You may object by writing to{' '}
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>
                    .
                  </li>
                  <li>
                    Reading your own mailbox: when you connect your professional mailbox, the copilot may read the
                    content of the exchanges linked to your contacts in order to summarise them, prepare a follow-up or
                    spot a need. This content is used for you alone: it is never shown to your colleagues or to your
                    manager. Legal basis: performance of the contract, upon your activation.
                  </li>
                  <li>
                    Professional data providers and job changes: to obtain business contact details or to flag that a
                    followed contact has moved to another company, the platform queries business-to-business
                    professional data providers bound by contract. No automated collection is carried out on any
                    professional social network. Legal basis: the legitimate interest of business-to-business
                    prospecting (Article 6.1.f of the GDPR).
                  </li>
                  <li>
                    Per-user usage measurement: if your employer switches it on, your manager can view counters of your
                    use of the platform (number of actions per feature and per period). Neither time spent, nor screen
                    recording, nor the content of your messages is measured. Your employer, as controller of this
                    processing, undertakes to inform you beforehand and, where required, to consult its works council;
                    BELLUM acts on its behalf as processor.
                  </li>
                  <li>
                    Product usage measurement: to find out which screens cause problems, the platform records the
                    screens viewed and left, linked to a temporary session identifier renewed every twenty-four hours —
                    never to your identifier, to your organisation's or to the content of what you type. No statistic is
                    produced below five distinct sessions, and no session recording or replay tool is used. Legal basis:
                    BELLUM's legitimate interest in improving the service (Article 6.1.f of the GDPR); you may object by
                    writing to{' '}
                    <a href="mailto:dpo@bellum-it.com" className={LINK}>
                      dpo@bellum-it.com
                    </a>
                    .
                  </li>
                  <li>
                    Email and text-message alerts: if you switch them on, you receive alerts by email or by text
                    message, in the countries where this channel is open. Your mobile number is verified with a code.
                    Legal basis: your consent, recorded with its date, which you may withdraw at any time from your
                    settings.
                  </li>
                  <li>
                    Analysis of recorded calls: if your organisation switches it on, a sales call recorded with the
                    consent of each participant, announced at the start of the call, may be transcribed and summarised.
                    No call is recorded without this consent. The audio file uploaded for meeting notes is not kept:
                    only the text is.
                  </li>
                  <li>
                    Sending under mandate: no message is sent without your approval, unless you give an explicit mandate
                    for named contacts, reviewed content, and a limited duration and volume. The mandate can be revoked
                    at any time; a reply or an objection from the recipient stops the sending.
                  </li>
                </ul>
                <p>
                  When users of the platform contact professionals, they do so as controllers. In line with the CNIL's
                  recommendations, a prospecting message sent to a professional without prior consent must relate to the
                  role that person holds and must allow them to object to any further message simply and free of charge.
                  Every recorded objection is checked before each sending and stops any sending in progress.
                </p>
              </>
            ),
          },
          {
            id: 'conservation',
            title: 'Data retention period',
            body: (
              <>
                <ul className={LIST}>
                  <li>
                    User account data is retained for the entire duration of the contract. When the account is deleted,
                    personal data is anonymised without delay, except for data that the law requires to be kept. An
                    account with no login for three years may be closed.
                  </li>
                  <li>
                    Billing data is retained for a period of ten years, in accordance with the accounting and tax
                    obligations provided for by Article L. 123-22 of the French Commercial Code.
                  </li>
                  <li>
                    Technical logs are retained for thirty days and the sessions of signed-out devices for ninety days;
                    connection data that the law for confidence in the digital economy (LCEN) requires to be kept is
                    retained for one year.
                  </li>
                  <li>
                    Analysis data generated by the platform (company profiles, identified contacts, action plans,
                    messages) is retained for the entire duration of the contract, then deleted or anonymised when the
                    account is closed.
                  </li>
                  <li>
                    Business contact details of third-party contacts obtained from data providers stop being displayed
                    and exported three years after the last exchange or the last activity concerning them; they are only
                    permanently deleted upon an erasure request from the data subject.
                  </li>
                  <li>
                    Message content kept in the activity history is erased after three years; only non-personal
                    information (channel, date) remains.
                  </li>
                  <li>
                    Voice messages and images sent to the copilot are deleted after thirty days; archived conversation
                    summaries, after ninety days.
                  </li>
                  <li>
                    Requests that the copilot could not handle are kept for ninety days in a masked and truncated form,
                    with no user or organisation identifier.
                  </li>
                  <li>
                    The statistics of the shared anonymous base are recomputed every night: only the latest version is
                    kept.
                  </li>
                  <li>Cookies and trackers are retained for a maximum period of thirteen months.</li>
                </ul>
                <p>
                  Beyond the periods indicated above, data is deleted or irreversibly anonymised. In the event of
                  litigation proceedings, the relevant data may be retained for the entire duration of the proceedings
                  and until all avenues of appeal have been exhausted.
                </p>
              </>
            ),
          },
          {
            id: 'destinataires',
            title: 'Recipients of the data',
            body: (
              <>
                <p>
                  The personal data collected may be communicated to the following recipients: authorised staff of
                  BELLUM, strictly within the limits of their duties; technical subcontractors involved in the hosting,
                  maintenance and operation of the platform, bound by contractual clauses compliant with Article 28 of
                  the GDPR; the payment provider, solely for the processing of financial transactions; the judicial or
                  administrative authorities, where the law so requires.
                </p>
                <p>
                  BELLUM's technical subcontractors fall into the following categories: database host; application
                  hosts; artificial intelligence model providers; transcription and document-reading services;
                  business-to-business professional data providers; search and public web page reading services; email
                  and text-message delivery providers; payment provider; technical monitoring tools. The tools your
                  organisation connects to the platform (mailbox, calendar, CRM, telephony) only receive the data you
                  choose to write to them, and every write to a CRM requires your approval.
                </p>
                <p>
                  BELLUM does not carry out any transfer, rental or provision of personal data to third parties for
                  commercial purposes. It does not sell its users' data.
                </p>
                <p>
                  The commitments that BELLUM undertakes under this policy are reflected in the commitments it has
                  entered into with its subcontractors, BELLUM remaining solely responsible towards the user for the
                  performance of its obligations.
                </p>
                <p>
                  The Site&apos;s measurement tools — <strong>Plausible Analytics</strong>,{' '}
                  <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong> — receive data when,
                  and only when, you have consented to it. What each of them measures, where its data is stored and what
                  its vendor states about cookies are set out in the cookie and tracker policy.
                </p>
              </>
            ),
          },
          {
            id: 'transferts',
            title: 'Transfers of data outside the European Union',
            body: (
              <>
                <p>
                  Some of BELLUM's technical subcontractors may be established outside the European Union. Where
                  applicable, these transfers are governed by the safeguards provided for by the GDPR: an adequacy
                  decision of the European Commission (in particular the EU-United States Data Privacy Framework,
                  adopted on 10 July 2023), standard contractual clauses adopted by the European Commission, or any
                  other adequate safeguard within the meaning of Articles 46 and 49 of the GDPR.
                </p>
                <p>
                  This concerns in particular the artificial intelligence model and transcription providers, some
                  professional data and web search providers, the email delivery provider, the payment provider and some
                  technical monitoring tools.
                </p>
                <p>
                  You may obtain a copy of the safeguards put in place by writing to{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'securite',
            title: 'Data security',
            body: (
              <>
                <p>
                  BELLUM implements appropriate technical and organisational measures in order to ensure a level of
                  security appropriate to the risk, in accordance with Article 32 of the GDPR, and in particular: the
                  encryption of data in transit (TLS 1.2 protocol at a minimum) and at rest; secure authentication
                  mechanisms with session management; the partitioning of data between users through row-level access
                  control policies at the database level; the logging of accesses and actions; regular backups and
                  tested restoration procedures; the restriction of access to authorised persons only.
                </p>
                <p>
                  Access to the platform is carried out by means of personal credentials (email address and password)
                  and through a secure connection using the HTTPS protocol. The user is responsible for the
                  confidentiality of their credentials and must protect access to them.
                </p>
                <p>
                  BELLUM regards as strictly confidential any information and any document of which it may become aware
                  in connection with the performance of its services, and refrains from disclosing it except in cases
                  where the disclosed elements are in the public domain at the date of disclosure or obtained from third
                  parties by legitimate means.
                </p>
              </>
            ),
          },
          {
            id: 'violations',
            title: 'Notification of data breaches',
            body: (
              <p>
                In the event of a personal data breach within the meaning of Article 4(12) of the GDPR, BELLUM
                undertakes to notify the Commission nationale de l'informatique et des libertés (CNIL) within
                seventy-two hours of becoming aware of the breach, unless the breach is unlikely to result in a risk to
                the rights and freedoms of the data subjects. Where the breach is likely to result in a high risk, the
                data subjects will also be informed as soon as possible.
              </p>
            ),
          },
          {
            id: 'droits',
            title: 'Rights of data subjects',
            body: (
              <>
                <p>
                  In accordance with Articles 15 to 22 of the GDPR and the French Data Protection Act, you have the
                  following rights over your personal data:
                </p>
                <ul className={LIST}>
                  <li>
                    The right of access: you may obtain confirmation as to whether or not data concerning you is being
                    processed and, where applicable, access said data as well as a certain amount of additional
                    information (purposes, categories of data, recipients, retention period).
                  </li>
                  <li>
                    The right to rectification: you may obtain the rectification of inaccurate or incomplete data
                    concerning you.
                  </li>
                  <li>
                    The right to erasure (right to be forgotten): under the conditions provided for by Article 17 of the
                    GDPR, you may obtain the erasure of your personal data, except where the processing is necessary for
                    compliance with a legal obligation or for the establishment, exercise or defence of legal claims.
                  </li>
                  <li>
                    The right to restriction of processing: in the cases defined in Article 18 of the GDPR, you may
                    obtain the restriction of the processing of your data.
                  </li>
                  <li>
                    The right to object: you may object to the processing of your personal data where the processing is
                    based on legitimate interest, including profiling. BELLUM may however maintain the processing for
                    compelling legitimate grounds that override the interests, rights and freedoms of the data subject,
                    or for the establishment, exercise or defence of legal claims.
                  </li>
                  <li>
                    The right to portability: you may receive your personal data in a structured, commonly used and
                    machine-readable format, and transmit it to another controller.
                  </li>
                  <li>
                    The right to withdraw consent: where the processing is based on consent, you may withdraw your
                    consent at any time, without affecting the lawfulness of the processing carried out before the
                    withdrawal.
                  </li>
                  <li>
                    The right to set out directives relating to the fate of your data after your death, in accordance
                    with French law.
                  </li>
                </ul>
                <p>
                  To exercise these rights, send your request together with a valid proof of identity: by email to{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>{' '}
                  ; or by post to BELLUM, 90 rue des Archives, 75003 Paris, for the attention of the GDPR Department.
                  BELLUM undertakes to respond within one month of receipt of the request. This period may be extended
                  by a further two months in the event of complexity or a high number of requests.
                </p>
              </>
            ),
          },
          {
            id: 'droits-tiers',
            title: 'Rights of third-party professional contacts',
            body: (
              <>
                <p>
                  In accordance with Article 14 of the GDPR relating to the information to be provided where the data
                  has not been collected from the data subject, BELLUM informs the professional contacts whose data is
                  referenced in its database that they have the same rights as those described above, and in particular
                  the right to object at any time to the processing of their data.
                </p>
                <p>
                  Any objection or deletion request will be handled within thirty days. The data subject's data will
                  then be deleted from BELLUM's database and will no longer be accessible to users of the platform. Only
                  a non-reversible technical fingerprint of their identifiers, in particular their email address, is
                  kept, in order to prevent any further collection or sending.
                </p>
                <p>
                  The sources of the data are: legal registers, publicly accessible company directories, information
                  published by the persons themselves in a professional context, business-to-business professional data
                  providers bound by contract, and the proprietary database of BELLUM. Some contact details may be
                  estimated and then technically checked; they are then flagged as such.
                </p>
                <p>
                  When a user of the platform sends you a prospecting message, they act as controller: you may object at
                  any time, without having to give a reason, by replying to them, or by writing to{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </p>
              </>
            ),
          },
          {
            id: 'reclamation-cnil',
            title: 'Complaint to the CNIL',
            body: (
              <>
                <p>
                  If you consider that the processing of your personal data constitutes a breach of the GDPR, you have
                  the right to lodge a complaint with the Commission nationale de l'informatique et des libertés (CNIL),
                  the French supervisory authority. CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07. Website:{' '}
                  <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className={LINK}>
                    www.cnil.fr
                  </a>
                  .
                </p>
                <p>
                  BELLUM also informs the user of the existence of the Bloctel telephone marketing opposition list, on
                  which they may register (
                  <a href="https://conso.bloctel.fr/" target="_blank" rel="noopener noreferrer" className={LINK}>
                    https://conso.bloctel.fr/
                  </a>
                  ).
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
      title="Politique de confidentialité et de protection des données personnelles"
      lastUpdated="11 octobre 2026"
      intro="Conformément au Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016
      relatif à la protection des personnes physiques à l’égard du traitement des données à caractère
      personnel et à la libre circulation de ces données (ci-après le « RGPD »), et à la loi n° 78-17 du 6
      janvier 1978 modifiée relative à l’informatique, aux fichiers et aux libertés."
      sections={[
        {
          id: 'preambule',
          title: 'Préambule',
          body: (
            <>
              <p>
                La protection de vos données personnelles est une priorité pour la société BELLUM. La présente politique
                décrit la manière dont nous collectons, traitons et protégeons vos données à caractère personnel dans le
                cadre de l'utilisation du site www.bellum-ai.com et de la plateforme BellumAI (désignés ensemble
                ci-après le « Site »).
              </p>
              <p>
                Cette politique peut être complétée par des éléments supplémentaires précisés dans tout ou partie d'un
                service fourni. Nous pouvons modifier, compléter ou mettre à jour cette politique à tout moment,
                notamment pour nous conformer à toute évolution légale, réglementaire ou technique. Toute modification
                prendra effet à compter de la date de mise en ligne de la politique modifiée.
              </p>
            </>
          ),
        },
        {
          id: 'responsable-traitement',
          title: 'Responsable du traitement',
          body: (
            <>
              <p>
                Le responsable du traitement des données à caractère personnel est la société BELLUM, SASU au capital de
                1 000,00 euros, immatriculée sous le numéro 931 750 681 R.C.S. Paris, dont le siège social est situé au
                90, rue des Archives, 75003 Paris.
              </p>
              <p>
                Pour toute question relative à la protection de vos données personnelles, veuillez nous contacter aux
                coordonnées suivantes :{' '}
                <a href="mailto:dpo@bellum-it.com" className={LINK}>
                  dpo@bellum-it.com
                </a>
                , ou par courrier postal à l'attention du Délégué à la protection des données, BELLUM, 90 rue des
                Archives, 75003 Paris.
              </p>
            </>
          ),
        },
        {
          id: 'donnees-collectees',
          title: 'Données collectées',
          body: (
            <>
              <p className={SUBTITLE}>2.1. Données communiquées directement par l'utilisateur</p>
              <p>
                Lors de la création de votre compte et de l'utilisation de la plateforme, les données suivantes sont
                collectées : nom et prénom ; adresse de courrier électronique professionnelle ; dénomination de la
                société employeur ; informations relatives au profil commercial de l'utilisateur telles que communiquées
                lors du questionnaire d'inscription (secteurs d'activité, offres de services, zone géographique, taille
                de l'équipe, positionnement commercial) ; notes, commentaires et annotations saisis par l'utilisateur
                dans la plateforme.
              </p>
              <p>
                S'agissant des données de paiement, celles-ci sont traitées exclusivement par notre prestataire de
                paiement certifié PCI-DSS. La société BELLUM ne stocke, ne collecte ni n'a accès à aucune donnée
                bancaire (numéro de carte, cryptogramme, date d'expiration).
              </p>
              <p className={SUBTITLE}>2.2. Données collectées automatiquement</p>
              <p>
                Lors de votre navigation sur le Site et de votre utilisation de la plateforme, les données suivantes
                peuvent être collectées automatiquement : adresse IP ; type et version du navigateur ; système
                d'exploitation ; pages consultées et durée de consultation ; données de connexion (dates, heures,
                identifiants de session) ; actions réalisées dans la plateforme (analyses lancées, messages copiés,
                contacts enrichis).
              </p>
              <p className={SUBTITLE}>2.3. Données recueillies auprès d'autres sources</p>
              <p>
                Nous pouvons également obtenir des informations auprès d'autres sources, telles que : des sources
                publiquement accessibles (registres légaux, annuaires professionnels, publications officielles, offres
                d'emploi publiées par les entreprises, informations publiées par les personnes concernées elles-mêmes
                sur des réseaux professionnels publics) ; des fournisseurs de données professionnelles interentreprises,
                liés à la société BELLUM par contrat (coordonnées professionnelles, changements de poste) ; la base de
                données propriétaire de la société BELLUM, constituée et enrichie dans le respect du cadre légal
                applicable. La société BELLUM ne contourne aucune authentification ni aucune protection technique d'un
                site pour obtenir une donnée.
              </p>
              <p className={SUBTITLE}>2.4. Données relatives aux tiers (contacts professionnels)</p>
              <p>
                Dans le cadre de ses fonctionnalités d'intelligence commerciale, la plateforme BellumAI référence des
                données relatives à des contacts professionnels tiers. Ces données sont constituées à partir de sources
                publiquement accessibles, de fournisseurs de données professionnelles liés par contrat et de la base de
                données propriétaire de la société BELLUM. Elles peuvent comprendre : noms et prénoms de contacts
                professionnels ; fonctions et intitulés de poste ; coordonnées professionnelles (adresse électronique
                professionnelle, numéro de téléphone professionnel) ; rattachement à une entité juridique ; changement
                de poste, avec sa date et sa source ; informations publiées publiquement par la personne concernée dans
                un contexte professionnel.
              </p>
              <p>
                Certaines de ces données peuvent être estimées plutôt qu'observées : par exemple une adresse
                électronique professionnelle construite selon le format en usage dans l'entreprise puis vérifiée
                techniquement auprès de son serveur de messagerie, un rattachement hiérarchique supposé ou une séniorité
                déduite du parcours. Elles sont toujours signalées comme estimées dans la plateforme, ne sont jamais
                présentées comme une information vérifiée, et sont remplacées dès qu'une information vérifiée ou une
                correction est disponible. Aucun critère tel que l'âge, le genre, l'origine, l'adresse personnelle ou la
                photographie n'intervient dans le classement d'une personne, et la date de naissance n'est jamais
                collectée.
              </p>
              <p>
                Ces données sont strictement de nature professionnelle. Aucune donnée relevant de la vie privée, aucune
                donnée sensible au sens de l'article 9 du RGPD, et aucune donnée relative à des personnes mineures ne
                sont collectées ou traitées.
              </p>
            </>
          ),
        },
        {
          id: 'finalites',
          title: 'Finalités et bases légales des traitements',
          body: (
            <>
              <p>
                Nous collectons ou traitons vos données personnelles dans le respect du RGPD, pour les finalités et sur
                les bases légales suivantes :
              </p>
              <ul className={LIST}>
                <li>
                  Création et gestion du compte utilisateur : base légale de l'exécution du contrat (article 6.1.b du
                  RGPD).
                </li>
                <li>
                  Fourniture des services de la plateforme, incluant les analyses d'entreprises, l'identification de
                  contacts, la génération de recommandations stratégiques et de messages personnalisés : base légale de
                  l'exécution du contrat (article 6.1.b du RGPD).
                </li>
                <li>
                  Personnalisation de l'expérience utilisateur en fonction du profil commercial déclaré : base légale de
                  l'intérêt légitime (article 6.1.f du RGPD).
                </li>
                <li>
                  Facturation, gestion des abonnements et des crédits : base légale de l'exécution du contrat (article
                  6.1.b) et de l'obligation légale (article 6.1.c du RGPD).
                </li>
                <li>
                  Constitution et enrichissement de la base de données de contacts professionnels à partir de sources
                  publiquement accessibles, afin de permettre aux utilisateurs d'identifier des interlocuteurs
                  pertinents dans un contexte de prospection commerciale interentreprises (B2B) : base légale de
                  l'intérêt légitime (article 6.1.f du RGPD). La société BELLUM a réalisé une mise en balance entre cet
                  intérêt légitime et les droits et libertés des personnes concernées, conformément aux recommandations
                  de la CNIL. Les données traitées sont strictement professionnelles, publiquement accessibles, et leur
                  traitement s'inscrit dans les attentes raisonnables des personnes exerçant des fonctions
                  décisionnelles au sein d'entreprises.
                </li>
                <li>
                  Amélioration des services, développement de nouvelles fonctionnalités et réalisation de statistiques
                  anonymisées d'usage : base légale de l'intérêt légitime (article 6.1.f du RGPD).
                </li>
                <li>
                  Communication commerciale relative aux services BELLUM : base légale du consentement (article 6.1.a du
                  RGPD), ou de l'intérêt légitime pour les clients existants dans les conditions prévues par l'article
                  L. 34-5 du Code des postes et des communications électroniques.
                </li>
                <li>
                  Respect des obligations légales et réglementaires : base légale de l'obligation légale (article 6.1.c
                  du RGPD).
                </li>
                <li>
                  Prévention de la fraude et sécurité de la plateforme : base légale de l'intérêt légitime (article
                  6.1.f du RGPD).
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'traitements-specifiques',
          title: 'Traitements propres à certaines fonctionnalités',
          body: (
            <>
              <p>
                Certaines fonctionnalités de la plateforme reposent sur des traitements particuliers. Plusieurs d'entre
                elles ne fonctionnent que si vous-même ou votre organisation les activez.
              </p>
              <ul className={LIST}>
                <li>
                  Base commune anonyme : chaque nuit, des statistiques anonymes sont calculées à partir de l'activité de
                  l'ensemble des organisations clientes (par exemple, quelles actions aboutissent, par secteur et par
                  taille d'entreprise), afin que chaque organisation puisse comparer ses résultats à ce qui fonctionne
                  ailleurs. Ces statistiques ne contiennent aucun nom de personne, d'organisation cliente ou de client
                  final, aucun texte libre, et ne sont publiées qu'à partir de trois organisations contributrices
                  distinctes. Base légale : l'intérêt légitime de la société BELLUM à améliorer le service (article
                  6.1.f du RGPD). Vous pouvez vous y opposer en écrivant à{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </li>
                <li>
                  Lecture de votre propre messagerie : lorsque vous connectez votre boîte de messagerie professionnelle,
                  le copilote peut lire le contenu des échanges liés à vos contacts pour les résumer, préparer une
                  relance ou repérer un besoin. Ce contenu n'est utilisé que pour vous : il n'est jamais montré à vos
                  collègues ni à votre manager. Base légale : l'exécution du contrat, sur votre activation.
                </li>
                <li>
                  Fournisseurs de données professionnelles et changements de poste : pour obtenir des coordonnées
                  professionnelles ou signaler qu'un contact suivi a changé d'entreprise, la plateforme interroge des
                  fournisseurs de données professionnelles interentreprises liés par contrat. Aucune collecte
                  automatisée n'est réalisée sur un réseau social professionnel. Base légale : l'intérêt légitime de la
                  prospection interentreprises (article 6.1.f du RGPD).
                </li>
                <li>
                  Mesure de l'usage par utilisateur : si votre employeur l'active, votre manager peut consulter des
                  compteurs de votre usage de la plateforme (nombre d'actions par fonctionnalité et par période). Ni
                  temps passé, ni enregistrement d'écran, ni contenu de vos messages ne sont mesurés. Votre employeur,
                  responsable de ce traitement, s'engage à vous en informer au préalable et, lorsqu'il y est tenu, à
                  consulter son comité social et économique ; la société BELLUM agit pour son compte en qualité de
                  sous-traitant.
                </li>
                <li>
                  Mesure d'usage du produit : pour savoir quels écrans posent problème, la plateforme enregistre les
                  écrans consultés et quittés, rattachés à un identifiant de session temporaire renouvelé toutes les
                  vingt-quatre heures — jamais à votre identifiant, à celui de votre organisation ni au contenu de vos
                  saisies. Aucune statistique n'est produite en dessous de cinq sessions distinctes, et aucun outil
                  d'enregistrement ou de rejeu de session n'est utilisé. Base légale : l'intérêt légitime de la société
                  BELLUM à améliorer le service (article 6.1.f du RGPD) ; vous pouvez vous y opposer en écrivant à{' '}
                  <a href="mailto:dpo@bellum-it.com" className={LINK}>
                    dpo@bellum-it.com
                  </a>
                  .
                </li>
                <li>
                  Alertes par e-mail et par SMS : si vous les activez, vous recevez des alertes par e-mail ou par SMS,
                  dans les pays où ce canal est ouvert. Votre numéro de mobile est vérifié par un code. Base légale :
                  votre consentement, enregistré avec sa date et que vous pouvez retirer à tout moment depuis vos
                  réglages.
                </li>
                <li>
                  Analyse des appels enregistrés : si votre organisation l'active, un appel commercial enregistré avec
                  le consentement de chaque participant, annoncé en début d'appel, peut être transcrit et résumé. Aucun
                  appel n'est enregistré sans ce consentement. Le fichier audio déposé pour un compte rendu de
                  rendez-vous n'est pas conservé : seul le texte l'est.
                </li>
                <li>
                  Envoi sous mandat : aucun message ne part sans votre validation, sauf mandat explicite de votre part
                  pour des contacts nommés, des contenus relus, une durée et un volume limités. Le mandat est révocable
                  à tout moment ; une réponse ou une opposition du destinataire arrête l'envoi.
                </li>
              </ul>
              <p>
                Lorsque les utilisateurs de la plateforme contactent des professionnels, ils le font en qualité de
                responsables de traitement. Conformément aux recommandations de la CNIL, un message de prospection
                adressé à un professionnel sans son consentement préalable doit être en rapport avec la fonction qu'il
                exerce et lui permettre de s'opposer simplement et gratuitement à tout nouvel envoi. Toute opposition
                enregistrée est vérifiée avant chaque envoi et arrête l'envoi en cours.
              </p>
            </>
          ),
        },
        {
          id: 'conservation',
          title: 'Durée de conservation des données',
          body: (
            <>
              <ul className={LIST}>
                <li>
                  Les données du compte utilisateur sont conservées pendant toute la durée du contrat. À la suppression
                  du compte, les données nominatives sont anonymisées sans délai, à l'exception de celles que la loi
                  impose de conserver. Un compte sans connexion depuis trois ans peut être clôturé.
                </li>
                <li>
                  Les données de facturation sont conservées pendant une durée de dix ans, conformément aux obligations
                  comptables et fiscales prévues par l'article L. 123-22 du Code de commerce.
                </li>
                <li>
                  Les journaux techniques sont conservés trente jours et les sessions des appareils déconnectés
                  quatre-vingt-dix jours ; les données de connexion que la loi pour la confiance dans l'économie
                  numérique (LCEN) impose de conserver le sont pendant un an.
                </li>
                <li>
                  Les données d'analyses générées par la plateforme (fiches entreprises, contacts identifiés, plans
                  d'action, messages) sont conservées pendant toute la durée du contrat, puis supprimées ou anonymisées
                  à la clôture du compte.
                </li>
                <li>
                  Les coordonnées professionnelles de contacts tiers obtenues auprès de fournisseurs de données cessent
                  d'être affichées et exportées trois ans après le dernier échange ou la dernière activité les
                  concernant ; elles ne sont supprimées définitivement que sur demande d'effacement de la personne
                  concernée.
                </li>
                <li>
                  Le contenu des messages conservé dans l'historique d'activité est effacé au bout de trois ans ; seules
                  restent des informations non nominatives (canal, date).
                </li>
                <li>
                  Les messages vocaux et les images transmis au copilote sont supprimés au bout de trente jours ; les
                  résumés de conversation archivés, au bout de quatre-vingt-dix jours.
                </li>
                <li>
                  Les demandes que le copilote n'a pas su traiter sont conservées quatre-vingt-dix jours sous une forme
                  masquée et tronquée, sans identifiant d'utilisateur ni d'organisation.
                </li>
                <li>
                  Les statistiques de la base commune anonyme sont recalculées chaque nuit : seule la dernière version
                  est conservée.
                </li>
                <li>Les cookies et traceurs sont conservés pour une durée maximale de treize mois.</li>
              </ul>
              <p>
                Au-delà des durées indiquées ci-dessus, les données sont supprimées ou anonymisées de manière
                irréversible. En cas de procédure contentieuse, les données pertinentes pourront être conservées pendant
                toute la durée de la procédure et jusqu'à l'épuisement des voies de recours.
              </p>
            </>
          ),
        },
        {
          id: 'destinataires',
          title: 'Destinataires des données',
          body: (
            <>
              <p>
                Les données à caractère personnel collectées sont susceptibles d'être communiquées aux destinataires
                suivants : les personnels habilités de la société BELLUM, dans la stricte limite de leurs attributions ;
                les sous-traitants techniques intervenant dans l'hébergement, la maintenance et le fonctionnement de la
                plateforme, liés par des clauses contractuelles conformes à l'article 28 du RGPD ; le prestataire de
                paiement, pour le seul traitement des transactions financières ; les autorités judiciaires ou
                administratives, lorsque la loi l'exige.
              </p>
              <p>
                Les sous-traitants techniques de la société BELLUM relèvent des catégories suivantes : hébergeur de la
                base de données ; hébergeurs de l'application ; fournisseurs de modèles d'intelligence artificielle ;
                services de transcription et de lecture de documents ; fournisseurs de données professionnelles
                interentreprises ; services de recherche et de lecture de pages web publiques ; prestataires d'envoi
                d'e-mails et de SMS ; prestataire de paiement ; outils de supervision technique. Les outils que votre
                organisation connecte à la plateforme (messagerie, agenda, logiciel de gestion commerciale, téléphonie)
                reçoivent les seules données que vous choisissez d'y écrire, et toute écriture dans un logiciel de
                gestion commerciale demande votre validation.
              </p>
              <p>
                La société BELLUM ne procède à aucune cession, location ou mise à disposition de données personnelles à
                des tiers à des fins commerciales. Elle ne vend pas les données de ses utilisateurs.
              </p>
              <p>
                Les engagements que la société BELLUM souscrit aux termes de la présente politique sont reportés dans
                les engagements qu'elle a souscrits avec ses sous-traitants, la société BELLUM restant seule responsable
                vis-à-vis de l'utilisateur de l'exécution de ses obligations.
              </p>
              <p>
                Les outils de mesure du Site — <strong>Plausible Analytics</strong>,{' '}
                <strong>Vercel Web Analytics</strong> et <strong>Vercel Speed Insights</strong> — reçoivent des données
                lorsque, et seulement lorsque, vous y avez consenti. Ce que chacun mesure, où ses données sont
                conservées et ce que son éditeur déclare au sujet des cookies figurent dans la politique relative aux
                cookies et aux traceurs.
              </p>
            </>
          ),
        },
        {
          id: 'transferts',
          title: "Transferts de données hors de l'Union européenne",
          body: (
            <>
              <p>
                Certains sous-traitants techniques de la société BELLUM peuvent être établis en dehors de l'Union
                européenne. Le cas échéant, ces transferts sont encadrés par les garanties prévues par le RGPD :
                décision d'adéquation de la Commission européenne (notamment le Data Privacy Framework UE-États-Unis,
                adopté le 10 juillet 2023), clauses contractuelles types adoptées par la Commission européenne, ou toute
                autre garantie adéquate au sens des articles 46 et 49 du RGPD.
              </p>
              <p>
                Sont notamment concernés les fournisseurs de modèles d'intelligence artificielle et de transcription,
                certains fournisseurs de données professionnelles et de recherche web, le prestataire d'envoi d'e-mails,
                le prestataire de paiement et certains outils de supervision technique.
              </p>
              <p>
                Vous pouvez obtenir une copie des garanties mises en place en écrivant à{' '}
                <a href="mailto:dpo@bellum-it.com" className={LINK}>
                  dpo@bellum-it.com
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: 'securite',
          title: 'Sécurité des données',
          body: (
            <>
              <p>
                La société BELLUM met en oeuvre des mesures techniques et organisationnelles appropriées afin de
                garantir un niveau de sécurité adapté au risque, conformément à l'article 32 du RGPD, et notamment : le
                chiffrement des données en transit (protocole TLS 1.2 au minimum) et au repos ; des mécanismes
                d'authentification sécurisée avec gestion des sessions ; le cloisonnement des données entre utilisateurs
                par des politiques de contrôle d'accès au niveau des lignes de la base de données ; la journalisation
                des accès et des actions ; des sauvegardes régulières et des procédures de restauration testées ; la
                limitation des accès aux seules personnes habilitées.
              </p>
              <p>
                L'accès à la plateforme s'effectue au moyen d'identifiants personnels (adresse de courrier électronique
                et mot de passe) et par une connexion sécurisée utilisant le protocole HTTPS. L'utilisateur est
                responsable de la confidentialité de ses identifiants et doit en protéger l'accès.
              </p>
              <p>
                La société BELLUM considère comme strictement confidentiels toute information et tout document dont elle
                aurait connaissance à l'occasion de l'exécution de ses services, et s'en interdit la divulgation hors
                les cas où les éléments divulgués sont dans le domaine public à la date de la divulgation ou obtenus de
                tiers par des moyens légitimes.
              </p>
            </>
          ),
        },
        {
          id: 'violations',
          title: 'Notification des violations de données',
          body: (
            <p>
              En cas de violation de données à caractère personnel au sens de l'article 4(12) du RGPD, la société BELLUM
              s'engage à notifier la Commission nationale de l'informatique et des libertés (CNIL) dans un délai de
              soixante-douze heures suivant la prise de connaissance de la violation, sauf si celle-ci n'est pas
              susceptible d'engendrer un risque pour les droits et libertés des personnes concernées. Lorsque la
              violation est susceptible d'engendrer un risque élevé, les personnes concernées en seront également
              informées dans les meilleurs délais.
            </p>
          ),
        },
        {
          id: 'droits',
          title: 'Droits des personnes concernées',
          body: (
            <>
              <p>
                Conformément aux articles 15 à 22 du RGPD et à la loi Informatique et Libertés, vous bénéficiez des
                droits suivants sur vos données personnelles :
              </p>
              <ul className={LIST}>
                <li>
                  Le droit d'accès : vous pouvez obtenir la confirmation que des données vous concernant sont ou ne sont
                  pas traitées et, le cas échéant, accéder auxdites données ainsi qu'à un certain nombre d'informations
                  complémentaires (finalités, catégories de données, destinataires, durée de conservation).
                </li>
                <li>
                  Le droit de rectification : vous pouvez obtenir la rectification des données inexactes ou incomplètes
                  vous concernant.
                </li>
                <li>
                  Le droit à l'effacement (droit à l'oubli) : dans les conditions prévues par l'article 17 du RGPD, vous
                  pouvez obtenir l'effacement de vos données personnelles, sauf lorsque le traitement est nécessaire au
                  respect d'une obligation légale ou à la constatation, l'exercice ou la défense de droits en justice.
                </li>
                <li>
                  Le droit à la limitation du traitement : dans les cas définis à l'article 18 du RGPD, vous pouvez
                  obtenir la limitation du traitement de vos données.
                </li>
                <li>
                  Le droit d'opposition : vous pouvez vous opposer au traitement de vos données personnelles lorsque le
                  traitement est fondé sur l'intérêt légitime, y compris le profilage. La société BELLUM pourra
                  cependant maintenir le traitement pour des motifs légitimes et impérieux prévalant sur les intérêts,
                  droits et libertés de la personne concernée, ou pour la constatation, l'exercice ou la défense de
                  droits en justice.
                </li>
                <li>
                  Le droit à la portabilité : vous pouvez recevoir vos données personnelles dans un format structuré,
                  couramment utilisé et lisible par machine, et les transmettre à un autre responsable du traitement.
                </li>
                <li>
                  Le droit de retrait du consentement : lorsque le traitement est fondé sur le consentement, vous pouvez
                  retirer votre consentement à tout moment, sans porter atteinte à la licéité du traitement effectué
                  avant le retrait.
                </li>
                <li>
                  Le droit de définir des directives relatives au sort de vos données après votre décès, conformément à
                  la législation française.
                </li>
              </ul>
              <p>
                Pour exercer ces droits, adressez votre demande accompagnée d'un justificatif d'identité en cours de
                validité : par courrier électronique à{' '}
                <a href="mailto:dpo@bellum-it.com" className={LINK}>
                  dpo@bellum-it.com
                </a>{' '}
                ; ou par courrier postal à BELLUM, 90 rue des Archives, 75003 Paris, à l'attention du Service RGPD. La
                société BELLUM s'engage à répondre dans un délai d'un mois à compter de la réception de la demande. Ce
                délai peut être prolongé de deux mois supplémentaires en cas de complexité ou de nombre élevé de
                demandes.
              </p>
            </>
          ),
        },
        {
          id: 'droits-tiers',
          title: 'Droits des contacts professionnels tiers',
          body: (
            <>
              <p>
                Conformément à l'article 14 du RGPD relatif aux informations à fournir lorsque les données n'ont pas été
                collectées auprès de la personne concernée, la société BELLUM informe les contacts professionnels dont
                les données sont référencées dans sa base qu'ils disposent des mêmes droits que ceux décrits ci-dessus,
                et en particulier du droit de s'opposer à tout moment au traitement de leurs données.
              </p>
              <p>
                Toute demande d'opposition ou de suppression sera traitée dans un délai de trente jours. Les données de
                la personne concernée seront alors supprimées de la base de données de la société BELLUM et ne seront
                plus accessibles aux utilisateurs de la plateforme. Seule une empreinte technique non réversible de ses
                identifiants, notamment de son adresse électronique, est conservée, afin d'empêcher toute collecte ou
                tout envoi ultérieur.
              </p>
              <p>
                Les sources des données sont : les registres légaux, les annuaires d'entreprises accessibles au public,
                les informations publiées par les personnes elles-mêmes dans un contexte professionnel, des fournisseurs
                de données professionnelles interentreprises liés par contrat, et la base de données propriétaire de la
                société BELLUM. Certaines coordonnées peuvent être estimées puis vérifiées techniquement ; elles sont
                alors signalées comme telles.
              </p>
              <p>
                Lorsqu'un utilisateur de la plateforme vous adresse un message de prospection, il agit en qualité de
                responsable de traitement : vous pouvez vous opposer à tout moment, sans avoir à vous justifier, en lui
                répondant, ou en écrivant à
                <a href="mailto:dpo@bellum-it.com" className={LINK}>
                  dpo@bellum-it.com
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: 'reclamation-cnil',
          title: 'Réclamation auprès de la CNIL',
          body: (
            <>
              <p>
                Si vous estimez que le traitement de vos données personnelles constitue une violation du RGPD, vous avez
                le droit d'introduire une réclamation auprès de la Commission nationale de l'informatique et des
                libertés (CNIL), autorité de contrôle française. CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex
                07. Site internet :{' '}
                <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className={LINK}>
                  www.cnil.fr
                </a>
                .
              </p>
              <p>
                La société BELLUM informe également l'utilisateur de l'existence de la liste d'opposition au démarchage
                téléphonique Bloctel, sur laquelle il peut s'inscrire (
                <a href="https://conso.bloctel.fr/" target="_blank" rel="noopener noreferrer" className={LINK}>
                  https://conso.bloctel.fr/
                </a>
                ).
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
