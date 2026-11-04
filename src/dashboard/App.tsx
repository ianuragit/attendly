export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">Attendly</h1>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-slate-600 dark:text-slate-300">
          No meetings recorded yet. Join a Meet call and Attendly will log attendance automatically.
        </p>
      </main>
    </div>
  );
}
