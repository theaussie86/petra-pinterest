/**
 * Legal page bodies (Impressum, Datenschutz, AGB).
 *
 * These are German-language drafts. They are intentionally plain, static JSX
 * (not routed through i18n) because the legally operative language for a German
 * provider is German, and the copy must be reviewed as one document before
 * go-live. Square-bracketed `[Platzhalter]` markers flag everything that still
 * needs to be filled in (address, e-mail, VAT id, dates).
 *
 * NOTE: These texts are drafts and must be legally reviewed and the
 * placeholders filled before Pinfinity goes live.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2 text-slate-700">{children}</div>
    </section>
  )
}

export function ImpressumContent() {
  return (
    <div className="space-y-8">
      <Section title="Angaben gemäß § 5 DDG / § 5 TMG">
        <p>
          Verantwortlich und Anbieter dieses Dienstes (Pinfinity) ist:
        </p>
        <p>
          Christoph Weissteiner
          <br />
          Weissteiner Automation
          <br />
          Anschrift: [Platzhalter Straße, Hausnummer]
          <br />
          [Platzhalter PLZ, Ort]
          <br />
          [Platzhalter Land]
        </p>
      </Section>

      <Section title="Kontakt">
        <p>
          E-Mail: [Platzhalter E-Mail-Adresse]
          <br />
          Telefon: [Platzhalter, optional]
        </p>
      </Section>

      <Section title="Umsatzsteuer">
        <p>
          USt-IdNr. gemäß § 27 a Umsatzsteuergesetz: [Platzhalter USt-ID, sofern
          vorhanden]
        </p>
      </Section>

      <Section title="Verantwortlich für den Inhalt">
        <p>Christoph Weissteiner, Anschrift wie oben.</p>
      </Section>
    </div>
  )
}

export function DatenschutzContent() {
  return (
    <div className="space-y-8">
      <Section title="1. Verantwortlicher">
        <p>
          Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist
          Christoph Weissteiner (Weissteiner Automation), Kontaktdaten siehe
          Impressum.
        </p>
      </Section>

      <Section title="2. Zwecke der Verarbeitung">
        <p>
          Wir verarbeiten personenbezogene Daten, um dir das Pinfinity-Dashboard
          bereitzustellen: Anmeldung, Verwaltung deiner Blog-Projekte und
          Artikel, Erstellung und Planung von Pins, Generierung von Metadaten
          sowie die Veröffentlichung auf Pinterest.
        </p>
      </Section>

      <Section title="3. Auftragsverarbeiter und Dienste">
        <p>
          Zur Bereitstellung des Dienstes setzen wir folgende Dienstleister ein,
          mit denen – soweit erforderlich – Verträge zur Auftragsverarbeitung
          (Art. 28 DSGVO) bestehen:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Supabase</strong> – Datenbank, Authentifizierung und
            Dateispeicher (Hosting deiner Projekt-, Artikel- und Pin-Daten).
          </li>
          <li>
            <strong>Vercel</strong> – Hosting und Auslieferung der Anwendung.
          </li>
          <li>
            <strong>Google</strong> – Anmeldung per Google OAuth sowie
            KI-Metadaten über Gemini.
          </li>
          <li>
            <strong>Pinterest</strong> – Verbindung deines Pinterest-Kontos und
            Veröffentlichung deiner Pins.
          </li>
        </ul>
        <p>
          Dabei kann es zu einer Übermittlung in Drittländer kommen; die
          jeweiligen Anbieter stützen sich hierfür auf geeignete Garantien
          (z. B. EU-Standardvertragsklauseln). [Platzhalter: konkrete
          Rechtsgrundlagen und ggf. weitere Dienste ergänzen.]
        </p>
      </Section>

      <Section title="4. Nutzung externer KI-Clients (Connected Agents)">
        <p>
          Du kannst Pinfinity über die MCP-Schnittstelle mit externen
          KI-Clients (z. B. Claude, ChatGPT oder Codex) verbinden. Wenn du einen
          solchen Connected Agent nutzt, werden deine Eingaben und Daten durch
          den von dir gewählten KI-Anbieter verarbeitet. Diese Verarbeitung
          liegt in deiner eigenen Verantwortung und richtet sich nach den
          Datenschutz- und Nutzungsbedingungen des jeweiligen KI-Anbieters.
          Pinfinity hat darauf keinen Einfluss.
        </p>
      </Section>

      <Section title="5. Rechte der betroffenen Personen">
        <p>
          Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch
          zu. Außerdem hast du das Recht, dich bei einer Aufsichtsbehörde zu
          beschweren. Zur Ausübung deiner Rechte wende dich an die im Impressum
          genannte Adresse.
        </p>
      </Section>

      <Section title="6. Speicherdauer">
        <p>
          Wir speichern personenbezogene Daten nur so lange, wie es für die
          genannten Zwecke erforderlich ist oder gesetzliche
          Aufbewahrungspflichten bestehen. [Platzhalter: konkrete Fristen
          ergänzen.]
        </p>
      </Section>
    </div>
  )
}

export function AgbContent() {
  return (
    <div className="space-y-8">
      <Section title="1. Geltungsbereich und Leistung">
        <p>
          Pinfinity (Anbieter: Christoph Weissteiner, Weissteiner Automation)
          stellt ein Dashboard zur Planung und Verwaltung von Pinterest-Pins
          sowie eine Schnittstelle (MCP) für KI-Clients bereit. Pinfinity
          stellt ausschließlich die Schnittstelle bereit; die eigentliche
          Verarbeitung durch einen verbundenen KI-Client erfolgt durch den von
          dir gewählten KI-Anbieter.
        </p>
      </Section>

      <Section title="2. KI-Anbieter und Datenverarbeitung">
        <p>
          Der Connected Agent handelt stets im Auftrag und im Namen der
          Nutzerin. Die Wahl des KI-Anbieters (z. B. OpenAI, Anthropic, …) sowie
          dessen Datenverarbeitung richten sich ausschließlich nach den
          Bedingungen des jeweiligen Anbieters. Pinfinity übernimmt hierfür
          keine Verantwortung.
        </p>
      </Section>

      <Section title="3. Verantwortung der Nutzerin">
        <p>
          Die Nutzerin ist für alle Aktionen ihrer verbundenen Agenten selbst
          verantwortlich. Das gilt insbesondere für geplante Pins, die
          automatisch veröffentlicht werden. Du bist dafür verantwortlich, dass
          Inhalte, Bilder und Links rechtmäßig sind und keine Rechte Dritter
          verletzen.
        </p>
      </Section>

      <Section title="4. Widerruf von Agenten">
        <p>
          Du kannst einen verbundenen Agenten jederzeit unter „Einstellungen“
          widerrufen. Nach dem Widerruf hat der betreffende Client ab sofort
          keinen Zugriff mehr auf deine Daten.
        </p>
      </Section>

      <Section title="5. Verfügbarkeit">
        <p>
          Es besteht kein Anspruch auf eine bestimmte Verfügbarkeit des
          Dienstes. Pinfinity kann jederzeit gewartet, geändert oder
          eingeschränkt werden. Eine Verfügbarkeitsgarantie wird nicht gegeben.
        </p>
      </Section>

      <Section title="6. Haftungsbeschränkung">
        <p>
          Die Haftung des Anbieters ist, soweit gesetzlich zulässig, auf Vorsatz
          und grobe Fahrlässigkeit beschränkt. Für Schäden, die aus der Nutzung
          verbundener KI-Clients oder aus automatisch veröffentlichten Pins
          entstehen, haftet der Anbieter nicht. [Platzhalter: Haftungsregeln
          rechtlich prüfen.]
        </p>
      </Section>

      <Section title="7. Schlussbestimmungen">
        <p>
          Es gilt [Platzhalter: anwendbares Recht]. Sollten einzelne
          Bestimmungen unwirksam sein, bleibt der übrige Vertrag wirksam.
        </p>
      </Section>
    </div>
  )
}
