import Link from "next/link";
import { PLAYERS_PER_PAGE } from "@/lib/players";

export function PlayerPager({
  page,
  total,
  hrefFor,
}: {
  page: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  if (total <= PLAYERS_PER_PAGE) {
    return null;
  }

  const from = (page - 1) * PLAYERS_PER_PAGE + 1;
  const to = Math.min(page * PLAYERS_PER_PAGE, total);

  return (
    <p className="flex flex-wrap items-center gap-3 text-sm">
      {page > 1 ? <Link href={hrefFor(page - 1)}>Previous</Link> : null}
      <span>
        {from}–{to} of {total}
      </span>
      {to < total ? <Link href={hrefFor(page + 1)}>Next</Link> : null}
    </p>
  );
}
