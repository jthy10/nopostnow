import Link from "next/link";

const features = [
  {
    title: "People, not an algorithm",
    body: "A chronological photo feed without ads, suggested posts, or engagement tricks.",
    icon: (
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1 2 2 4-4" />
    ),
  },
  {
    title: "Members-only feed",
    body: "Posts, profiles, comments, and messages stay behind verified member accounts.",
    icon: (
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4" />
    ),
  },
  {
    title: "Built in the open",
    body: "The source is public, the security rules are reviewable, and the project is MIT licensed.",
    icon: (
      <path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12" />
    ),
  },
];

export default function PublicLanding() {
  return (
    <main className="min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_-10%,rgba(255,59,92,0.17),transparent_65%)]"
      />

      <nav className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="NoPostNow home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="h-10 w-10 rounded-xl border border-edge"
          />
          <span className="text-sm font-black tracking-[-0.3px]">NoPostNow</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login?mode=signup"
            className="rounded-xl px-4 py-2.5 text-xs font-bold text-body transition-colors hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-black transition-opacity hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      </nav>

      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28">
        <div>
          <p className="mb-5 text-[10px] font-bold uppercase tracking-[2.5px] text-heart">
            A quieter photo feed
          </p>
          <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-2.8px] sm:text-7xl sm:tracking-[-4px]">
            Post the moment.
            <br />
            Skip the performance.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-meta sm:text-lg">
            NoPostNow is a chronological photo feed for real people. No ads, no
            recommendations, and no race for reach—just photos and conversation.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login?mode=signup"
              className="rounded-xl bg-white px-6 py-3.5 text-center text-sm font-extrabold text-black transition-opacity hover:opacity-90"
            >
              Create an account
            </Link>
            <Link
              href="/app"
              className="rounded-xl border border-edge bg-card px-6 py-3.5 text-center text-sm font-bold text-body transition-colors hover:border-meta hover:text-white"
            >
              Get the app
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-meta">
            Free to join. Email verification required.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div
            aria-hidden
            className="absolute -inset-10 rounded-full bg-heart/10 blur-3xl"
          />
          <div className="relative overflow-hidden rounded-[2rem] border border-edge bg-panel shadow-2xl shadow-black/60">
            <div className="flex h-14 items-center justify-between border-b border-line px-5">
              <span className="text-xs font-black tracking-[1.6px]">NOPOSTNOW</span>
              <span className="h-2 w-2 rounded-full bg-heart" />
            </div>
            <div
              aria-hidden
              className="aspect-square bg-[radial-gradient(circle_at_68%_25%,#777_0%,#2f2f2f_25%,#111_65%,#090909_100%)]"
            />
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full border border-edge bg-neutral-600" />
                  <div>
                    <p className="text-xs font-extrabold">Alex</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-[1px] text-meta">
                      just now
                    </p>
                  </div>
                </div>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-heart"
                  fill="currentColor"
                >
                  <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6 6 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54Z" />
                </svg>
              </div>
              <p className="mt-3 text-sm text-body">right place, right time</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-panel/60">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-5 py-14 sm:px-8 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="py-6 md:px-7">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-6 w-6 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {feature.icon}
              </svg>
              <h2 className="mt-5 text-sm font-extrabold">{feature.title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-meta">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-5 py-24 text-center sm:px-8">
        <h2 className="text-3xl font-black tracking-[-1.4px] sm:text-4xl">
          Ready when you are.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-meta">
          Create an account, verify your email, and your feed is ready. Password
          recovery and account controls are built in.
        </p>
        <Link
          href="/login?mode=signup"
          className="mt-8 inline-block rounded-xl bg-white px-7 py-3.5 text-sm font-extrabold text-black transition-opacity hover:opacity-90"
        >
          Join NoPostNow
        </Link>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-[11px] text-meta sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} NoPostNow</p>
          <div className="flex flex-wrap gap-5">
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <a
              href="https://github.com/jthy10/nopostnow"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              Source
            </a>
            <a
              href="https://github.com/jthy10/nopostnow/security/advisories/new"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              Security
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
