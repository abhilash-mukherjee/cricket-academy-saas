export default function Loading() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3" role="status">
        <span className="loading loading-spinner" aria-hidden="true" />
        Loading
      </div>
    </main>
  );
}
