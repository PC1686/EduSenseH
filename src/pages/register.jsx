// [HACKATHON TIMELINE] STEP 5.2 (Hour 6) - User Registration Page UI
import React from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await register(email, password, name, role);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Create your EduSense account
          </p>
        </div>
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800/80 shadow-[0_18px_60px_rgba(15,23,42,0.9)] p-8">
          <h2 className="text-2xl font-semibold text-slate-50 text-center mb-2">
            Sign up
          </h2>
          <p className="text-xs text-slate-400 text-center mb-6">
            Choose whether you&apos;re teaching or studying, and we&apos;ll tailor the tools.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-100 px-4 py-3 rounded-2xl mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent placeholder:text-slate-500"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent placeholder:text-slate-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent placeholder:text-slate-500"
                placeholder="At least 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-sky-500 text-white py-2.5 px-4 rounded-xl hover:bg-sky-400 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium">
              Login here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;