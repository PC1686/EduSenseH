import React from 'react';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-950 to-sky-900 text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-sky-500/10 border border-sky-400/40 flex items-center justify-center">
              <span className="text-sky-300 font-semibold text-lg">ES</span>
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
                EduSense
              </h1>
              <p className="text-xs text-slate-400">
                AI powered group study for teachers & students
              </p>
            </div>
          </div>
        </header>

        <main className="rounded-3xl bg-slate-900/70 border border-slate-700/70 shadow-[0_18px_60px_rgba(15,23,42,0.9)] backdrop-blur-sm overflow-hidden">
          {children}
        </main>

        <footer className="mt-4 text-xs text-slate-100 text-center">
          Made for focused, collaborative learning.
        </footer>
      </div>
    </div>
  );
};

export default React.memo(Layout);