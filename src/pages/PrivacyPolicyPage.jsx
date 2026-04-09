const sections = [
  {
    title: '1. Information We Collect',
    body: [
      'We collect limited information to operate the National Wildfire Tracking Team (NWTT) website and live tracker. This may include technical data such as IP address, browser type, device type, operating system, pages viewed, referring URLs, and timestamps of visits.',
      'If you submit a form (for example, volunteer interest), we may collect the information you provide directly, such as name, email address, location, availability, and message content.',
      'The live wildfire map displays public incident and environmental datasets from government sources. We do not collect geolocation from your device unless your browser settings and actions explicitly grant that permission.',
    ],
  },
  {
    title: '2. How We Use Information',
    body: [
      'We use collected information to provide, maintain, and improve our services; monitor platform stability and security; respond to inquiries; and coordinate volunteer communications when you request contact.',
      'We may also use aggregate analytics to understand website performance and user needs. We do not use personal information for automated decision-making that produces legal or similarly significant effects.',
    ],
  },
  {
    title: '3. How We Share Information',
    body: [
      'We do not sell personal information or share personal information for cross-context behavioral advertising.',
      'We may disclose information to service providers that help us host or secure the website, only as needed for business purposes and subject to confidentiality obligations.',
      'We may disclose information when required by law, legal process, or to protect the rights, safety, and security of NWTT, users, and the public.',
    ],
  },
  {
    title: '4. California Privacy Rights (CCPA/CPRA)',
    body: [
      'California residents have the right to request: (a) access to categories and specific pieces of personal information we collected, (b) correction of inaccurate personal information, (c) deletion of personal information, and (d) information about categories of data collected, used, disclosed, and retained.',
      'You may also request to opt out of sale or sharing. NWTT does not sell or share personal information as those terms are defined under California law.',
      'We will not discriminate against you for exercising applicable privacy rights. To submit a request, email privacy@nwtt.org with the subject line “California Privacy Request.” We may verify requests using information reasonably necessary to confirm your identity and authority.',
    ],
  },
  {
    title: '5. Data Retention',
    body: [
      'We retain personal information only for as long as necessary to fulfill the purpose for which it was collected, including legal, operational, and security needs.',
      'Typical retention periods: server and security logs (up to 12 months), contact/volunteer inquiry records (up to 24 months after last interaction), and analytics records (up to 26 months).',
      'When data is no longer required, we delete it or de-identify it in accordance with applicable law and reasonable technical controls.',
    ],
  },
  {
    title: '6. Sensitive Personal Information',
    body: [
      'NWTT does not collect or use sensitive personal information for the purpose of inferring characteristics about individuals.',
    ],
  },
  {
    title: '7. Children\'s Privacy',
    body: [
      'Our services are not directed to children under 13. We do not knowingly collect personal information from children under 13.',
    ],
  },
  {
    title: '8. Updates to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. Material updates will be posted on this page with an updated effective date.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <p className="text-fire-400 text-sm font-semibold uppercase tracking-wider mb-2">Legal</p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-sentinel-300 leading-relaxed mb-6">
          Effective date: April 8, 2026. This policy describes how the National Wildfire Tracking Team
          (NWTT) collects, uses, shares, and retains data, including rights available to California
          residents under the California Consumer Privacy Act as amended by the California Privacy Rights
          Act (CCPA/CPRA).
        </p>

        <div className="rounded-xl border border-sentinel-700 bg-sentinel-800/70 p-5 mb-10">
          <p className="text-sm text-sentinel-200 leading-relaxed">
            To make a privacy request, contact{' '}
            <a href="mailto:privacy@nwtt.org" className="text-fire-400 hover:text-fire-300 underline underline-offset-2">
              privacy@nwtt.org
            </a>
            .
          </p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <article key={section.title} className="border-b border-sentinel-700/70 pb-8 last:border-b-0">
              <h2 className="text-2xl font-semibold mb-3">{section.title}</h2>
              <div className="space-y-3 text-sentinel-200 leading-relaxed">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
