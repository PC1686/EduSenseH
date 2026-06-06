import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
// import LanguageSwitcher from '../components/LanguageSwitcher';

function Profile() {
    const { userData, currentUser } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { t } = useTranslation();
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (userData) {
            setFullName(userData.name || userData.full_name || '');
        }
    }, [userData]);

    const handleUpdate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: fullName })
                .eq('id', currentUser.id);

            if (error) throw error;

            setMessage({ type: 'success', text: t('profile.profileUpdated') });

            // Set timeout to clear success message and securely reload page to update AuthContext UI
            setTimeout(() => {
                setMessage({ type: '', text: '' });

            }, 1200);

        } catch (error) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: error.message || t('errors.validationError') });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 mt-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors duration-300">
                {/* Header Background */}
                <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600"></div>

                <div className="px-6 sm:px-10 pb-10">
                    {/* Avatar Section */}
                    <div className="relative -mt-16 flex justify-between items-end mb-8">
                        <div className="w-32 h-32 rounded-full border-4 border-white dark:border-slate-900 bg-gradient-to-tr from-blue-100 to-indigo-100 dark:from-blue-900 dark:to-indigo-900 flex items-center justify-center text-4xl sm:text-5xl font-bold text-blue-600 dark:text-blue-300 shadow-sm transition-colors duration-300">
                            {userData?.email?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={toggleTheme}
                                className="p-2.5 rounded-full bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-300 mb-2 cursor-pointer relative overflow-hidden group"
                                aria-label="Toggle Theme"
                            >
                                <div className="relative z-10 flex items-center justify-center animate-in fade-in zoom-in duration-300">
                                    {isDark ? (
                                        <Sun
                                            size={20}
                                            className="text-amber-500 group-hover:text-amber-400 group-hover:rotate-45 transition-all duration-300"
                                        />
                                    ) : (
                                        <Moon
                                            size={20}
                                            className="text-indigo-500 group-hover:text-indigo-600 group-hover:-rotate-12 transition-all duration-300"
                                        />
                                    )}
                                </div>
                                <div className={`absolute inset-0 bg-gray-100 dark:bg-slate-700 transform scale-0 group-hover:scale-100 rounded-full transition-transform duration-300 ease-out origin-center`}></div>
                            </button>
                            <div className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wider mb-2 border border-blue-100 dark:border-blue-800/60 transition-colors duration-300">
                                {userData?.role || 'Student'}
                            </div>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 transition-colors duration-300">{t('profile.title')}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-300">{t('profile.personalInfo')}</p>
                    </div>

                    {message.text && (
                        <div className={`p-4 rounded-xl mb-6 text-sm font-medium transition-colors duration-300 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50'}`}>
                            {message.text}
                        </div>
                    )}

                    <form onSubmit={handleUpdate} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                {t('profile.email')}
                            </label>
                            <input
                                type="email"
                                id="email"
                                disabled
                                value={userData?.email || ''}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 cursor-not-allowed focus:outline-none transition-colors duration-300"
                            />
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 transition-colors duration-300">{t('profile.email')} cannot be changed at this time.</p>
                        </div>

                        <div>
                            <label htmlFor="fullName" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                {t('profile.name')}
                            </label>
                            <input
                                type="text"
                                id="fullName"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder={t('profile.name')}
                                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:focus:ring-blue-400/30 dark:focus:border-blue-400 transition-colors duration-300 placeholder-gray-400 dark:placeholder-gray-500"
                                required
                            />
                        </div>

                        {/* Language Settings */}
                        {/* <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-300">
                                {t('profile.language')}
                            </label>
                            <div className="flex items-center gap-3">
                                <LanguageSwitcher className="flex-1 max-w-xs" />
                                <span className="text-xs text-gray-400 dark:text-gray-500 transition-colors duration-300">
                                    {t('profile.selectLanguage')}
                                </span>
                            </div>
                        </div> */}

                        <div className="pt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={loading || !fullName.trim()}
                                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px]"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    t('profile.updateProfile')
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default Profile;
