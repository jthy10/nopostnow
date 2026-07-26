import Link from "next/link";

export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh">
      <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="h-9 w-9 rounded-xl border border-edge"
          />
          <span className="text-sm font-black">NoPostNow</span>
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-edge px-4 py-2 text-xs font-bold text-body hover:border-meta hover:text-white"
        >
          Account access
        </Link>
      </nav>
      <article className="mx-auto w-full max-w-3xl px-5 pb-24 pt-10">
        <p className="text-[10px] font-bold uppercase tracking-[2.2px] text-heart">
          Effective July 26, 2026
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-[-1.8px] sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-meta">{intro}</p>
        <div className="legal-copy mt-12 space-y-9 text-sm leading-7 text-body">
          {children}
        </div>
      </article>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-extrabold text-white">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
