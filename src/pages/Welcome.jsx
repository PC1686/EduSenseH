// [HACKATHON] Welcome / Landing - Premium dark redesign with live feature demo
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    icon: '🎙️',
    title: 'Live Transcription',
    desc: 'Every word captured in real-time using AssemblyAI speech-to-text',
    color: 'from-sky-500/20 to-sky-600/10 border-sky-500/30',
    accent: 'text-sky-400',
  },
  {
    icon: '🧠',
    title: 'Confusion Detection',
    desc: 'AI monitors understanding levels and alerts teachers before students fall behind',
    color: 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
    accent: 'text-violet-400',
  },
  {
    icon: '⚡',
    title: 'Adaptive Quizzes',
    desc: 'Auto-generated MCQs from lecture content — instantly pushed to all students',
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    accent: 'text-amber-400',
  },
  {
    icon: '🧬',
    title: 'Personal Capsule',
    desc: '5-minute AI catch-up plan tailored to each student\'s confusion level',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    accent: 'text-emerald-400',
  },
  {
    icon: '📄',
    title: 'Smart Resources',
    desc: 'Upload PDFs, DOCX, audio files — AI summarizes and builds quizzes instantly',
    color: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
    accent: 'text-rose-400',
  },
  {
    icon: '📋',
    title: 'Attendance Tracking',
    desc: 'Automatic roll call with CSV Export, student names & join times',
    color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
    accent: 'text-cyan-400',
  },
];

const STATS = [
  { value: '70B', label: 'Parameter AI Model', icon: '🤖' },
  { value: 'Real-time', label: 'Speech-to-Text', icon: '🎙️' },
  { value: '5 min', label: 'Personal Recovery Plan', icon: '🧬' },
  { value: '< 2s', label: 'AI Response Time', icon: '⚡' },
];

// Animated demo transcript lines
const DEMO_LINES = [
  "So today we'll explore Newton's second law of motion...",
  "The force equals mass times acceleration — F = ma",
  "Let me give you a real world example with a car...",
  "Now, if we double the mass, what happens to acceleration?",
];

const DEMO_INSIGHTS = [
  { label: 'Confusion Score', value: 34, color: 'bg-emerald-500', text: 'text-emerald-400' },
  { label: 'Topic Clarity', value: 78, color: 'bg-sky-500', text: 'text-sky-400' },
  { label: 'Engagement', value: 91, color: 'bg-violet-500', text: 'text-violet-400' },
];

function AnimatedDemo() {
  const [lineIndex, setLineIndex] = useState(0);
  const [confusion, setConfusion] = useState(34);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineIndex(i => (i + 1) % DEMO_LINES.length);
      setConfusion(Math.floor(Math.random() * 40) + 20);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setChars(0);
    const line = DEMO_LINES[lineIndex];
    let i = 0;
    const t = setInterval(() => {
      i++;
      setChars(i);
      if (i >= line.length) clearInterval(t);
    }, 30);
    return () => clearInterval(t);
  }, [lineIndex]);

  return (
    <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-5 backdrop-blur-sm shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300">Live Class — Physics 101</span>
        </div>
        <span className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-0.5 rounded-full font-semibold">● LIVE</span>
      </div>

      {/* Transcript */}
      <div className="bg-slate-950/60 rounded-xl p-4 mb-4 min-h-[60px]">
        <p className="text-xs text-slate-500 mb-1 font-medium uppercase tracking-wider">Live Transcript</p>
        <p className="text-sm text-slate-200 leading-relaxed">
          {DEMO_LINES[lineIndex].slice(0, chars)}
          <span className="inline-block w-0.5 h-4 bg-sky-400 animate-pulse ml-0.5 align-middle" />
        </p>
      </div>

      {/* AI Insights */}
      <div className="space-y-2.5">
        {DEMO_INSIGHTS.map((ins, i) => {
          const v = i === 0 ? confusion : ins.value;
          return (
            <div key={ins.label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-600 dark:text-slate-400">{ins.label}</span>
                <span className={`text-xs font-bold ${ins.text}`}>{v}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${ins.color} rounded-full transition-all duration-1000`}
                  style={{ width: `${v}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Cue */}
      <div className="mt-4 bg-violet-950/40 border border-violet-700/30 rounded-xl p-3">
        <p className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1">🤖 AI Teaching Cue</p>
        <p className="text-xs text-slate-300">Students are following well. Ask a quick comprehension check before advancing.</p>
      </div>
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveFeature(i => (i + 1) % FEATURES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 overflow-x-hidden transition-colors">
      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-sky-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-3xl" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-12 py-5 border-b border-slate-200/60 dark:border-slate-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-sky-500/30">
            ES
          </div>
          <span className="text-lg font-bold tracking-tight">EduSense<span className="text-sky-400">H</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors px-4 py-2"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/register')}
            className="text-sm bg-sky-500 hover:bg-sky-400 text-white px-5 py-2 rounded-full font-semibold transition-all shadow-lg shadow-sky-500/25 hover:shadow-sky-400/30 hover:-translate-y-0.5"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 sm:px-12 pt-20 pb-16 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          {/* Left */}
          <div className="lg:w-1/2">
            <div className="inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-xs font-semibold text-sky-400 tracking-wide">AI-Powered Classroom Intelligence</span>
            </div>

            <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-6">
              Teaching that{' '}
              <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                understands
              </span>{' '}
              every student
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed mb-8 max-w-lg">
              EduSenseH listens to your lectures in real-time, detects confusion before it becomes a problem, and generates personalized recovery plans for every student — automatically.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button
                onClick={() => navigate('/register')}
                className="px-8 py-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold rounded-2xl hover:from-sky-400 hover:to-indigo-400 transition-all shadow-2xl shadow-sky-500/30 hover:-translate-y-1 text-base"
              >
                Start Free →
              </button>
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-4 bg-slate-800/80 border border-slate-700 text-slate-200 font-semibold rounded-2xl hover:bg-slate-700/80 transition-all text-base"
              >
                Sign In
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STATS.map(s => (
                <div key={s.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <div className="text-lg mb-0.5">{s.icon}</div>
                  <div className="text-base font-black text-slate-100">{s.value}</div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Live Demo */}
          <div className="lg:w-1/2 w-full">
            <AnimatedDemo />
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="relative z-10 px-6 sm:px-12 py-20 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-4">
            Every feature a{' '}
            <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
              judge notices
            </span>
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-lg max-w-xl mx-auto">
            Built for real classrooms. Every feature solves an actual problem.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              onMouseEnter={() => setActiveFeature(i)}
              className={`bg-gradient-to-br ${f.color} border rounded-2xl p-6 cursor-default transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${activeFeature === i ? 'shadow-lg' : ''}`}
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className={`text-base font-bold mb-2 ${f.accent}`}>{f.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 px-6 sm:px-12 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-black mb-4">How it works</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {[
            { step: '01', title: 'Create a Group', desc: 'Teacher creates a class group and shares the Group ID with students', icon: '🏫' },
            { step: '02', title: 'Start Live Class', desc: 'Teacher starts session. AI begins transcribing every word in real-time', icon: '🎙️' },
            { step: '03', title: 'AI Monitors', desc: 'Doubts, polls, and confusion level update live. AI suggests teaching cues', icon: '🧠' },
            { step: '04', title: 'Auto Study Kit', desc: 'Session archive gets summaries, quizzes, flashcards and personal capsules', icon: '📦' },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-14 h-14 bg-slate-900 border border-slate-700 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 shadow-lg">
                {s.icon}
              </div>
              <div className="text-xs text-sky-500 font-black tracking-widest mb-1">{s.step}</div>
              <h4 className="text-sm font-bold text-slate-200 mb-2">{s.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 sm:px-12 py-20">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-3xl p-12 shadow-2xl">
          <div className="text-5xl mb-6">🚀</div>
          <h2 className="text-4xl font-black mb-4">Ready to transform your classroom?</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8 text-lg">
            Join EduSenseH and make every lecture smarter, every student ahead.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="px-10 py-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-bold rounded-2xl hover:from-sky-400 hover:to-indigo-400 transition-all shadow-2xl shadow-sky-500/30 hover:-translate-y-1 text-lg"
          >
            Get Started Free →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 px-6 sm:px-12 py-8 text-center">
        <p className="text-sm text-slate-600">
          Built with ❤️ for students and teachers · Powered by{' '}
          <span className="text-slate-500">Groq LLaMA-3.3-70B · AssemblyAI · Supabase</span>
        </p>
      </footer>
    </div>
  );
}