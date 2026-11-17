import { ACADEMY_NOT_FOUND } from "@/lib/constants";

export default function AcademyNotFound() {
  return (
    <div data-theme="dark" className="bg-base-100 text-base-content min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center p-6">
        <h1 className="text-2xl font-bold">{ACADEMY_NOT_FOUND}</h1>
      </main>
    </div>
  );
}
