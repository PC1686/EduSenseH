// [HACKATHON TIMELINE] STEP 4 (Hour 4) - App Routing & Protection
// 1. IMPORTING CORE LIBRARIES
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute'; // Ensures only logged-in users see the dashboard
import Navbar from './components/Navbar';

// 2. LAZY LOADING (Performance Optimization)
// We only load components when needed, which makes the initial app load FASTER (crucial for Hackathons!)
const Login = lazy(() => import('./pages/login'));
const Register = lazy(() => import('./pages/register'));
const Dashboard = lazy(() => import('./pages/dashBoard'));
const Welcome = lazy(() => import('./pages/Welcome'));
const LiveClass = lazy(() => import('./pages/LiveClass'));
const Chat = lazy(() => import('./pages/Chat'));
const Resources = lazy(() => import('./pages/Resources'));
const ArchiveClass = lazy(() => import('./pages/ArchiveClass'));
const Profile = lazy(() => import('./pages/Profile'));



const AppRoutes = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    }>
      <Routes>
        {/* Public Landing Page */}
        <Route path="/" element={<Welcome />} />

        {/* Authentication Routes: Redirect to dashboard if already logged in */}
        <Route
          path="/login"
          element={currentUser ? <Navigate to="/dashboard" /> : <Login />}
        />
        <Route
          path="/register"
          element={currentUser ? <Navigate to="/dashboard" /> : <Register />}
        />

        {/* Protected Routes: User must be logged in to access these */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Navbar>
                <Profile />
              </Navbar>
            </ProtectedRoute>
          }
        />

        {/* Group-specific Routes: ID passed via URL params */}
        <Route
          path="/group/:id"
          element={
            <ProtectedRoute>
              {/* Note: Navbar wraps the page for consistent layout */}
              <Navbar>
                <LiveClass />
              </Navbar>
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:groupId"
          element={
            <ProtectedRoute>
              <Navbar>
                <Chat />
              </Navbar>
            </ProtectedRoute>
          }
        />
        <Route
          path="/resources/:groupId"
          element={
            <ProtectedRoute>
              <Navbar>
                <Resources />
              </Navbar>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ArchiveClass/:groupId"
          element={
            <ProtectedRoute>
              <Navbar>
                <ArchiveClass />
              </Navbar>
            </ProtectedRoute>
          }
        />
        {/* Keep a default route to dashboard for signed-in users */}
        <Route path="/home" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true }}>
      <ThemeProvider>
        <AuthProvider>
          <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors">
            <AppRoutes />
          </div>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
