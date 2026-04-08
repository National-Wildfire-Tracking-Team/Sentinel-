export default function PrivacyPolicyPage() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Privacy Policy</h1>
        <p className="text-sentinel-300 text-sm sm:text-base leading-relaxed mb-8">
          Last updated: April 8, 2026
        </p>

        <div className="space-y-8 text-sentinel-200 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Overview</h2>
            <p>
              The National Wildfire Tracking Team (NWTT) provides wildfire-related mapping, alerts,
              and operational information. We limit personal data collection to what is necessary to
              operate, secure, and improve this website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Information We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Technical usage data (for example: browser type, pages visited, and timestamps).</li>
              <li>Contact details you voluntarily submit through forms or volunteer inquiries.</li>
              <li>Approximate location information when needed to deliver localized map and weather data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">How We Use Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide live wildfire monitoring features and related resources.</li>
              <li>To maintain security, prevent misuse, and debug service issues.</li>
              <li>To improve performance and user experience.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">California Privacy Notice (CCPA/CPRA)</h2>
            <p>
              If you are a California resident, you may have rights under the California Consumer
              Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA), including
              the right to know, delete, and correct certain personal information and the right to
              limit use of sensitive personal information where applicable.
            </p>
            <p className="mt-3">
              NWTT does not sell personal information. We also do not share personal information for
              cross-context behavioral advertising.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">European Privacy Notice (GDPR/EEA/UK)</h2>
            <p>
              If you are located in the European Economic Area (EEA), Switzerland, or the United
              Kingdom, you may have rights under applicable data protection law, including access,
              correction, deletion, restriction, portability, and objection rights, subject to legal
              limitations.
            </p>
            <p className="mt-3">
              Where required, NWTT relies on a valid legal basis to process personal data, such as
              consent, contract performance, legal obligations, or legitimate interests.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
            <p>
              For privacy inquiries or requests, contact us via the Volunteer page and include
              “Privacy Request” in your message.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
