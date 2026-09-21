import { APP_NAME, FEATURE_LIST_HEADING } from "@/lib/constants";


const FEATURE_CARDS = [
    {
      title: "Get Discovered",
      body: "Give your academy a search-optimized online presence that helps new athletes and parents find you through Google.",
      Icon: SearchIcon,
    },
    {
      title: "Fill Your Batches",
      body: "Let athletes register online with a streamlined intake process. Capture the information you need without the back-and-forth.",
      Icon: AddToGridIcon,
    },
    {
      title: "Know Who's Showing Up",
      body: "Track attendance effortlessly across your batches and keep a clear record of athlete participation.",
      Icon: AttendanceIcon,
    },
    {
      title: "Keep Memberships on Track",
      body: "Automate renewal reminders and handle subscription changes, expirations, and edge cases without manual follow-ups.",
      Icon: PeopleIcon,
    },
  ];

export default function FeatureShell() {
    return (
        <section className="relative flex min-h-dvh snap-start flex-col overflow-hidden bg-base-100">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-[10%] size-72 rounded-full bg-[#C6D5FC]/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-[18%] right-[8%] size-96 rounded-full bg-[#C6D5FC]/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 size-80 rounded-full bg-[#C6D5FC]/15 blur-3xl"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 p-6">
          <h2 className="text-center text-2xl font-bold">
            {FEATURE_LIST_HEADING}
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 p-2">
            {FEATURE_CARDS.map((card) => (
              <article key={card.title} className="card">
                <div className="card-body">
                  <card.Icon />
                  <h3 className="card-title">{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <footer className="relative z-10 p-6 text-center text-sm text-base-content/60">
          {`© 2026 ${APP_NAME}`}
        </footer>
      </section>
    )
}


function StrokeIcon({ children }: { children: React.ReactNode }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#2B64F6"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  }
  
  function SearchIcon() {
    return (
      <StrokeIcon>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </StrokeIcon>
    );
  }
  
  function AddToGridIcon() {
    return (
      <StrokeIcon>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
        <path d="M17.5 14v7M14 17.5h7" />
      </StrokeIcon>
    );
  }
  
  function AttendanceIcon() {
    return (
      <StrokeIcon>
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 14 2 2 4-4" />
      </StrokeIcon>
    );
  }
  
  function PeopleIcon() {
    return (
      <StrokeIcon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </StrokeIcon>
    );
  }
  