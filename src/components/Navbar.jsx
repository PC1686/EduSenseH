import React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Navbar({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { id, groupId } = useParams()
  const { userData, logout } = useAuth()

  // Determine current group ID from params (either from /group/:id or /chat/:groupId etc)
  const currentGroupId = id || groupId

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  const roleLabel = userData?.role === 'teacher' ? 'Teacher' : 'Student'

  return (
    <>
      <nav className="bg-white/90 backdrop-blur-md shadow-sm px-4 sm:px-8 py-3 sm:py-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-50 border-b border-gray-100 gap-4">
        <div className="flex justify-between items-center w-full md:w-auto md:flex-1">
          <Link to={`/group/${currentGroupId}`} className="no-underline flex items-center gap-2">
            <span className="text-2xl sm:text-3xl">🎓</span>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-bold bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0 whitespace-nowrap">EduSense</h1>
              <span className="hidden sm:inline text-[10px] text-gray-500 font-medium tracking-wider uppercase">Intelligent Group Learning</span>
            </div>
          </Link>

          <div className="flex md:hidden items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100 cursor-pointer"
              title="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-2 flex justify-start md:justify-center gap-2 sm:gap-4 w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0">
          <Link
            to={`/group/${currentGroupId}`}
            className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/group/${currentGroupId}`
              ? 'text-white bg-linear-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
              }`}
          >
            <span>🔴</span> <span className="inline">Live</span>
          </Link>
          <Link
            to={`/ArchiveClass/${currentGroupId}`}
            className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/ArchiveClass/${currentGroupId}`
              ? 'text-white bg-linear-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
              }`}
          >
            <span>📚</span> <span className="inline">Archive</span>
          </Link>
          <Link
            to={`/chat/${currentGroupId}`}
            className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/chat/${currentGroupId}`
              ? 'text-white bg-linear-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
              }`}
          >
            <span>💬</span> <span className="inline">Chat</span>
          </Link>
          <Link
            to={`/resources/${currentGroupId}`}
            className={`no-underline font-semibold px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 text-sm sm:text-base whitespace-nowrap ${location.pathname === `/resources/${currentGroupId}`
              ? 'text-white bg-linear-to-r from-blue-600 to-blue-500 shadow-md transform scale-105'
              : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
              }`}
          >
            <span>🧠</span> <span className="inline">Resources</span>
          </Link>
        </div>

        <div className="hidden md:flex flex-1 justify-end items-center gap-4">
          <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-linear-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
              {userData?.email?.[0].toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-gray-700 text-xs font-semibold max-w-30 truncate">{userData?.email}</span>
              <span className="text-[10px] text-blue-600 font-bold uppercase">{roleLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors border border-red-100 cursor-pointer"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>
      <main className="min-h-[calc(100vh-80px)] bg-slate-100">
        <div>
          <button
            className="ml-4 sm:ml-6 text-gray-400 border-none rounded-md px-4 py-1.5 font-bold cursor-pointer text-xs mt-2 hover:text-[#1976d2] transition-colors flex items-center gap-1"
            onClick={() => navigate('/dashboard')}
          >
            <span>←</span> Back to Dashboard
          </button>
        </div>
        {children}
      </main>
    </>
  )
}

export default Navbar