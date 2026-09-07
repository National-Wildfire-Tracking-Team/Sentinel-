import SubNav from './SubNav';

export default function PageHeader({ icon: Icon, eyebrow, title, highlight, description }) {
  return (
    <>
      <section className="relative overflow-hidden bg-sentinel-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,90,0,0.1),_transparent_55%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10 sm:pt-16 sm:pb-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full bg-fire-600/15 border border-fire-600/30 text-fire-400 text-xs font-semibold uppercase tracking-wider">
              <Icon size={14} />
              {eyebrow}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight tracking-tight">
              {title}{highlight ? ' ' : ''}
              {highlight && (
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-fire-500 to-fire-300">
                  {highlight}
                </span>
              )}
            </h1>
            <p className="mt-4 text-lg text-sentinel-200 leading-relaxed max-w-2xl">
              {description}
            </p>
          </div>
        </div>
      </section>
      <SubNav />
    </>
  );
}
