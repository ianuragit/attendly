export function App() {
  const openDashboard = () => {
    void chrome.runtime.openOptionsPage();
  };

  return (
    <main className="w-80 bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <h1 className="text-lg font-semibold">Attendly</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Not in a meeting. Join a Meet call and attendance is recorded automatically.
      </p>
      <button
        type="button"
        onClick={openDashboard}
        className="mt-4 w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        Open dashboard
      </button>
    </main>
  );
}
