import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

function Navbar({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id, groupId } = useParams();
  const { userData, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine current group ID from params (either from /group/:id or /chat/:groupId etc)
  const currentGroupId = id || groupId

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  }

  const roleLabel = userData?.role === 'teacher' ? 'Teacher' : 'Student'

  return (
    <>
      <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm px-4 sm:px-8 py-3 sm:py-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-50 border-b border-gray-100 dark:border-slate-800 gap-4 transition-colors">
        <div className="flex justify-between items-center w-full md:w-auto md:flex-1">
          <Link to={currentGroupId ? `/group/${currentGroupId}` : '/dashboard'} className="no-underline flex items-center gap-2">
            <span className="text-2xl sm:text-3xl">🎓</span>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0 whitespace-nowrap">
                EduSense
              </h1>
              <span className="hidden sm:inline text-[10px] text-gray-500 dark:text-slate-400 font-medium tracking-wider uppercase">
                {t('navigation.dashboard')}
              </span>
            </div>
          </Link>

          <div className="flex md:hidden items-center gap-3 relative">
            {/* Mobile theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 cursor-pointer"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 cursor-pointer"
              title="Menu"
            >
              {isMobileMenuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {isMobileMenuOpen && (
              <div className="absolute top-14 right-0 bg-white dark:bg-slate-900 shadow-xl rounded-xl border border-gray-100 dark:border-slate-800 p-4 min-w-[240px] flex flex-col gap-4 z-[60]">
                <Link
                  to="/profile"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="no-underline flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-800 p-1.5 -m-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {userData?.name?.[0]?.toUpperCase() || userData?.full_name?.[0]?.toUpperCase() || userData?.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-gray-700 dark:text-slate-100 text-sm font-semibold truncate">
                      {userData?.name || userData?.full_name || userData?.email}
                    </span>
                    <span className="text-[10px] text-blue-600 font-bold uppercase">{roleLabel}</span>
                  </div>
                </Link>
                <div className="h-px bg-gray-100 w-full" />
                <button
                  type="button"
                  onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-800/40 hover:text-red-600 transition-colors border border-red-100 dark:border-red-800 py-2 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-semibold text-sm">{t('navigation.logout')}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {currentGroupId && (
          <div className="flex-2 flex justify-start md:justify-center gap-2 sm:gap-4 w-full md:w-auto pb-1 md:pb-0">
            <Link
              to={`/group/${currentGroupId}`}
              className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/group/${currentGroupId}`
                ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
                : 'text-gray-500 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                }`}
            >
              <span>🔴</span> <span className="inline">{t('navigation.live')}</span>
            </Link>
            <Link
              to={`/ArchiveClass/${currentGroupId}`}
              className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/ArchiveClass/${currentGroupId}`
                ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
                : 'text-gray-500 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                }`}
            >
              <span>📚</span> <span className="inline">{t('navigation.archive')}</span>
            </Link>
            <Link
              to={`/chat/${currentGroupId}`}
              className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/chat/${currentGroupId}`
                ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
                : 'text-gray-500 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                }`}
            >
              <span>💬</span> <span className="inline">{t('navigation.chat')}</span>
            </Link>
            <Link
              to={`/resources/${currentGroupId}`}
              className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/resources/${currentGroupId}`
                ? 'text-white bg-gradient-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
                : 'text-gray-500 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800/80'
                }`}
            >
              <span>🧠</span> <span className="inline">{t('navigation.resources')}</span>
            </Link>
          </div>
        )}

        <div className="hidden md:flex flex-1 justify-end items-center gap-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors border border-gray-100 dark:border-slate-700 cursor-pointer"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link
            to="/profile"
            className="no-underline flex items-center gap-3 bg-gray-50 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-200 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {userData?.name?.[0]?.toUpperCase() || userData?.full_name?.[0]?.toUpperCase() || userData?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-gray-700 dark:text-slate-100 text-xs font-semibold max-w-30 truncate">
                {userData?.name || userData?.full_name || userData?.email}
              </span>
              <span className="text-[10px] text-blue-600 font-bold uppercase">{roleLabel}</span>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-800/40 hover:text-red-600 transition-colors border border-red-100 dark:border-red-800 cursor-pointer"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>
      <main className="min-h-[calc(100vh-80px)] bg-slate-100 dark:bg-slate-900 transition-colors">
        <div>
          <button
            className="ml-4 sm:ml-6 text-gray-400 dark:text-slate-400 border-none rounded-md px-4 py-1.5 font-bold cursor-pointer text-xs mt-2 hover:text-[#1976d2] dark:hover:text-sky-400 transition-colors flex items-center gap-1"
            onClick={() => navigate('/dashboard')}
          >
            <span>←</span> {t('common.back')} to {t('navigation.dashboard')}
          </button>
        </div>
        {children}
      </main>
    </>
  )
}

export default Navbar