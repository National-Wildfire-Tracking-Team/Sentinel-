const sections = [
  {
    title: '1. About Sentinel',
    body: [
      'Sentinel is a nonprofit disaster intelligence and situational awareness platform dedicated to improving public access to timely emergency information. Sentinel aggregates and presents disaster-related information from government agencies, trusted third-party providers, and other authorized sources.',
      'Services may include, but are not limited to:',
      { list: [
        'Wildfire tracking and perimeter mapping',
        'Active incident monitoring',
        'National Weather Service watches, warnings, and advisories',
        'Radar and satellite imagery',
        'Tropical weather and hurricane tracking',
        'Flood monitoring',
        'Earthquake information',
        'Air quality and smoke data',
        'GIS mapping tools',
        'Custom alerts and notifications',
        'Historical incident information',
        'Public safety information',
        'Emergency preparedness resources',
        'API services',
        'Premium features and subscriptions',
      ]},
      'Sentinel exists to improve situational awareness and public access to emergency information. Sentinel does not provide emergency response, law enforcement, firefighting, medical care, or dispatch services.',
    ],
  },
  {
    title: '2. Emergency Services Disclaimer',
    body: [
      'YOUR SAFETY IS YOUR RESPONSIBILITY.',
      'Sentinel is not:',
      { list: [
        'A 911 service',
        'An emergency dispatch center',
        'A fire department',
        'A law enforcement agency',
        'An emergency medical provider',
        'A government emergency management agency',
        'The National Weather Service',
        'A replacement for official emergency alerts or evacuation orders',
      ]},
      'Information displayed on Sentinel may be delayed, incomplete, unavailable, inaccurate, or subject to technical errors.',
      'You must always verify emergency information through official government sources before making decisions involving life, health, property, travel, or evacuation.',
      'If you believe you are experiencing an emergency, immediately call 911 or contact the appropriate emergency services in your jurisdiction.',
      'Sentinel shall not be responsible for any decision made based upon information displayed through the Services.',
    ],
  },
  {
    title: '3. Eligibility',
    body: [
      'To use Sentinel, you must:',
      { list: [
        'Be at least 13 years of age or the minimum age required under applicable law.',
        'Have the legal capacity to enter into a binding agreement.',
        'Comply with all applicable federal, state, local, and international laws while using the Services.',
      ]},
      'If you create an account on behalf of an organization, government agency, business, or educational institution, you represent that you have authority to bind that entity to these Terms.',
    ],
  },
  {
    title: '4. User Accounts',
    body: [
      'Certain features require registration.',
      'When creating an account, you agree to:',
      { list: [
        'Provide accurate and complete information.',
        'Keep your information current.',
        'Maintain the confidentiality of your password.',
        'Immediately notify Sentinel of unauthorized access to your account.',
        'Accept responsibility for all activity occurring under your account.',
      ]},
      'You may not:',
      { list: [
        'Share accounts with unauthorized users.',
        'Sell or transfer accounts.',
        'Create accounts using false identities.',
        'Circumvent account restrictions or suspensions.',
      ]},
      'Sentinel reserves the right to suspend, restrict, or terminate any account that violates these Terms or poses a security risk.',
    ],
  },
  {
    title: '5. Acceptable Use',
    body: [
      'You agree to use Sentinel only for lawful purposes.',
      'You may not:',
      { list: [
        'Violate any law or regulation.',
        'Attempt unauthorized access to Sentinel systems.',
        'Interfere with servers, networks, or security features.',
        'Upload malware, ransomware, viruses, or malicious code.',
        'Use automated tools to scrape or harvest data without written permission.',
        'Reverse engineer, decompile, or modify Sentinel software except where permitted by law.',
        'Impersonate another individual or organization.',
        'Submit false emergency reports or intentionally misleading information.',
        'Harass, threaten, or abuse other users.',
        'Disrupt or interfere with the normal operation of the Services.',
        'Use the Services to facilitate criminal or fraudulent activity.',
      ]},
      'Sentinel may investigate suspected violations and cooperate with law enforcement when required by law.',
    ],
  },
  {
    title: '6. User-Generated Content',
    body: [
      'Some portions of the Services allow users to submit reports, comments, photographs, videos, GIS data, observations, or other content ("User Content").',
      'You retain ownership of your User Content.',
      'By submitting User Content, you grant Sentinel a worldwide, non-exclusive, royalty-free, transferable, sublicensable license to host, store, reproduce, modify (for formatting or technical purposes), display, distribute, and use your User Content solely for operating, improving, promoting, and providing the Services.',
      'You represent and warrant that:',
      { list: [
        'You own or have permission to submit the content.',
        'Your content does not infringe the rights of others.',
        'Your content is accurate to the best of your knowledge.',
        'Your content is not fraudulent, defamatory, unlawful, or misleading.',
      ]},
      'Sentinel reserves the right, but not the obligation, to remove or restrict User Content that violates these Terms or may create a safety risk.',
    ],
  },
  {
    title: '7. Data Sources and Accuracy',
    body: [
      'Sentinel aggregates information from a variety of public and private sources, including government agencies, nonprofit organizations, academic institutions, commercial providers, and user submissions.',
      'Because much of this information originates from third parties:',
      { list: [
        'Sentinel cannot guarantee the accuracy, completeness, timeliness, or availability of any information.',
        'Data may contain errors, omissions, delays, or interruptions.',
        'Maps, wildfire perimeters, weather forecasts, satellite imagery, radar products, evacuation zones, and alerts may change without notice.',
      ]},
      'You acknowledge that Sentinel provides informational tools only and that you assume all risk associated with relying on information displayed through the Services.',
    ],
  },
];

export default function TermsPage() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <p className="text-fire-400 text-sm font-semibold uppercase tracking-wider mb-2">Legal</p>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Sentinel Terms of Service</h1>
        <p className="text-sentinel-200 leading-relaxed mb-10">
          Welcome to Sentinel (&ldquo;Sentinel,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the Sentinel website, mobile applications, application programming interfaces (APIs), software, and all related services (collectively, the &ldquo;Services&rdquo;).
        </p>
        <p className="text-sentinel-200 leading-relaxed mb-10">
          By accessing or using the Services, creating an account, or otherwise interacting with Sentinel, you agree to be legally bound by these Terms. If you do not agree to these Terms, you must not use the Services.
        </p>

        <div className="space-y-8">
          {sections.map((section) => (
            <article key={section.title} className="border-b border-sentinel-700/70 pb-8 last:border-b-0">
              <h2 className="text-2xl font-semibold mb-3">{section.title}</h2>
              <div className="space-y-3 text-sentinel-200 leading-relaxed">
                {section.body.map((item, idx) => {
                  if (typeof item === 'string') {
                    return <p key={idx}>{item}</p>;
                  }
                  if (item.list) {
                    return (
                      <ul key={idx} className="list-disc pl-6 space-y-1 text-sentinel-200">
                        {item.list.map((li, i) => (
                          <li key={i}>{li}</li>
                        ))}
                      </ul>
                    );
                  }
                  return null;
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
