// [HACKATHON TIMELINE] STEP 10 (Hour 22) - History, Summaries & Recordings Archive
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { aiService } from '../lib/ai';

const ArchiveClass = () => {
    const { groupId } = useParams();
    const { userData } = useAuth();
    const { t, i18n } = useTranslation();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecording, setSelectedRecording] = useState(null);
    const [recordingUrl, setRecordingUrl] = useState(null);
    const [loadingRecordingId, setLoadingRecordingId] = useState(null);
    const [deletingSessionId, setDeletingSessionId] = useState(null);
    const [attendanceOpen, setAttendanceOpen] = useState(false);
    const [attendanceList, setAttendanceList] = useState([]);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [attendanceSession, setAttendanceSession] = useState(null);

    // -- AI Quiz States --
    const [quizDataMap, setQuizDataMap] = useState({}); 
    const [quizAttemptMap, setQuizAttemptMap] = useState({});
    const [showQuizModal, setShowQuizModal] = useState(false);
    const [activeQuizSession, setActiveQuizSession] = useState(null);
    const [generatingQuizId, setGeneratingQuizId] = useState(null);

    const [currentQuiz, setCurrentQuiz] = useState([]);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);
    const [quizScore, setQuizScore] = useState(0);
    const [attemptError, setAttemptError] = useState(null);

    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState([]);

    const fetchArchivedSessions = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('sessions')
                .select('*')
                .eq('group_id', groupId)
                .order('start_time', { ascending: false });

            if (error) throw error;
            setSessions(data || []);
        } catch (error) {
            console.error('Error fetching archived sessions:', error);
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    // Get signed URL and play recording
    const handlePlayRecording = async (session) => {
        try {
            setLoadingRecordingId(session.id);
            setSelectedRecording(session);

            if (!session.recording_path) {
                alert('No recording available for this session');
                setLoadingRecordingId(null);
                return;
            }

            // Get signed URL for private bucket
            const { data, error } = await supabase.storage
                .from('teacher-recordings')
                .createSignedUrl(session.recording_path, 3600); // 1 hour expiry

            if (error) {
                console.error('[ArchiveClass] Error getting recording URL:', error);
                alert(t('errors.fileUploadError'));
                setLoadingRecordingId(null);
                return;
            }

            setRecordingUrl(data?.signedUrl);
            console.log('[ArchiveClass] Recording URL generated successfully');
        } catch (err) {
            console.error('[ArchiveClass] Error playing recording:', err);
            alert(t('errors.recordingError'));
        } finally {
            setLoadingRecordingId(null);
        }
    };

    // Close recording player
    const closeRecordingPlayer = () => {
        setSelectedRecording(null);
        setRecordingUrl(null);
    };

    // Delete recording and session
    const handleDeleteRecording = async (session) => {
        if (!window.confirm(`${t('archive.delete')} "${session.title}"? ${t('errors.validationError')}`)) {
            return;
        }

        try {
            setDeletingSessionId(session.id);

            // Delete from storage if recording exists
            if (session.recording_path) {
                const { error: storageError } = await supabase.storage
                    .from('teacher-recordings')
                    .remove([session.recording_path]);

                if (storageError && !storageError.message.includes('not found')) {
                    console.error('[ArchiveClass] Storage deletion error:', storageError);
                    alert(t('errors.fileUploadError') + ': ' + storageError.message);
                    return;
                }
                console.log('[ArchiveClass] Recording file deleted from storage');
            }

            // Delete session from database
            const { error: dbError } = await supabase
                .from('sessions')
                .delete()
                .eq('id', session.id);

            if (dbError) {
                console.error('[ArchiveClass] Database deletion error:', dbError);
                alert(t('errors.serverError') + ': ' + dbError.message);
                return;
            }

            // Remove from UI
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
            console.log('[ArchiveClass] Recording and session deleted successfully');
            alert(t('success.recordingDeleted'));
        } catch (err) {
            console.error('[ArchiveClass] Error deleting recording:', err);
            alert(t('errors.serverError') + ': ' + (err.message || err));
        } finally {
            setDeletingSessionId(null);
        }
    };

    // View attendance for a finished session
    const handleViewAttendance = async (session) => {
        try {
            setAttendanceSession(session);
            setAttendanceOpen(true);
            setLoadingAttendance(true);
            setAttendanceList([]);

            // Use live_session_id (the FK to live_sessions) not session.id (FK to sessions archive)
            const liveSessionId = session.live_session_id;

            if (!liveSessionId) {
                // Fallback: try session.id in case it was saved without live_session_id (old data)
                console.warn('[ArchiveClass] No live_session_id on session. Trying session.id as fallback.');
            }

            const queryId = liveSessionId || session.id;

            const { data: attendees, error } = await supabase
                .from('live_session_attendees')
                .select('*')
                .eq('live_session_id', queryId)
                .order('id', { ascending: true });

            if (error) throw error;

            if (!attendees || attendees.length === 0) {
                setAttendanceList([]);
                return;
            }

            // Fetch profiles for each attendee to get name & email
            const userIds = [...new Set(attendees.map(a => a.user_id).filter(Boolean))];
            let profileMap = {};

            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, full_name, email')
                    .in('id', userIds);

                if (profiles) {
                    profiles.forEach(p => { profileMap[p.id] = p; });
                }
            }

            // Merge attendee rows with profile data
            const enriched = attendees.map(a => ({
                ...a,
                display_name: a.student_name || profileMap[a.user_id]?.full_name || '—',
                display_email: profileMap[a.user_id]?.email || '—',
            }));

            setAttendanceList(enriched);
        } catch (err) {
            console.error('[ArchiveClass] Error fetching attendance:', err);
            alert(t('errors.validationError') + ': ' + (err.message || err));
        } finally {
            setLoadingAttendance(false);
        }
    };

    // Export attendance as CSV
    const handleExportCSV = () => {
        if (!attendanceList.length || !attendanceSession) return;
        const rows = [
            ['#', 'Name', 'Roll Number', 'Email', 'Joined At'],
            ...attendanceList.map((a, i) => [
                i + 1,
                a.display_name,
                a.roll_number || '—',
                a.display_email,
                getAttendanceTime(a),
            ])
        ];
        const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Attendance_${attendanceSession.title?.replace(/[^a-z0-9]/gi, '_')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Helper: format attendance join time (joined_at is the real column name)
    const getAttendanceTime = (row) => {
        const tsFields = ['joined_at', 'created_at', 'inserted_at', 'created', 'createdAt', 'timestamp'];
        for (const f of tsFields) {
            if (row && row[f]) return new Date(row[f]).toLocaleString();
        }
        return '—';
    };

    const fetchQuizzesAndAttempts = useCallback(async () => {
        if (!groupId) return;
        try {
            // Fetch quizzes for this group
            const { data: quizzesData, error: qError } = await supabase
                .from('session_quizzes')
                .select('*')
                .eq('group_id', groupId);

            if (qError) throw qError;

            // Fetch attempt scores by group_id if possible, otherwise fetch all and filter in JS
            // Since our goal is for this group, let's fetch all attempts for the group's sessions
            const sessionIds = sessions.map(s => s.id);
            let attemptsData = [];
            
            if (sessionIds.length > 0) {
                const { data: aData, error: aError } = await supabase
                    .from('quiz_attempts')
                    .select('*')
                    .in('session_id', sessionIds);
                if (!aError && aData) {
                    attemptsData = aData;
                }
            } else {
                // FALLBACK: If sessions aren't loaded yet, try fetching all attempts for the group 
                // by joining or simply waiting. For simplicity, we just fetch all to be absolute sure.
                const { data: aData } = await supabase
                    .from('quiz_attempts')
                    .select('*');
                if (aData) attemptsData = aData;
            }
            
            const qData = {};
            const qAttempts = {};

            (quizzesData || []).forEach(row => {
                const langKey = row.language || 'en';
                qData[`${row.session_id}_${langKey}`] = row.quiz_data;
            });

            attemptsData.forEach(row => {
                if (!qAttempts[row.session_id]) qAttempts[row.session_id] = [];
                qAttempts[row.session_id].push({
                    userId: row.user_id,
                    userName: row.user_name || 'Anonymous',
                    score: row.score,
                    answers: row.answers || {},
                    language: row.language || 'en'
                });
            });

            setQuizDataMap(qData);
            setQuizAttemptMap(qAttempts);
        } catch(error) {
            console.error('Error fetching quizzes:', error);
        }
    }, [groupId, sessions]);

    useEffect(() => {
        fetchArchivedSessions();
        fetchQuizzesAndAttempts();
        if (!groupId) return;
        const channel = supabase
            .channel(`sessions:${groupId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'sessions', filter: `group_id=eq.${groupId}` },
                (payload) => {
                    setSessions((prev) => [payload.new, ...prev]);
                },
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `group_id=eq.${groupId}` },
                (payload) => {
                    setSessions((prev) => prev.map((s) => (s.id === payload.new.id ? payload.new : s)));
                },
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'sessions', filter: `group_id=eq.${groupId}` },
                (payload) => {
                    setSessions((prev) => prev.filter((s) => s.id !== payload.old.id));
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [groupId, fetchArchivedSessions]);

    // -- AI Quiz Actions --
    const handleTakeQuiz = async (session) => {
        const lang = (i18n.language || 'en').split('-')[0];
        const quizKey = `${session.id}_${lang}`;
        
        setActiveQuizSession(session);
        setAttemptError(null);
        let quiz = quizDataMap[quizKey];
        
        if (!quiz) {
            setGeneratingQuizId(session.id);
            try {
                // Generate quiz
                const notes = session.description || session.title;
                const generated = await aiService.generateQuiz(
                    notes, 
                    lang
                );
                const first3 = Array.isArray(generated) ? generated.slice(0, 3) : [];
                quiz = first3;

                // Save to dedicated table
                await supabase.from('session_quizzes').insert({
                    session_id: session.id,
                    group_id: groupId,
                    quiz_data: quiz,
                    created_by: userData.id,
                    language: lang
                });
                setQuizDataMap(prev => ({...prev, [quizKey]: quiz}));
            } catch (err) {
                console.error("Quiz gen error", err);
                setAttemptError("Failed to generate quiz. " + err.message);
                setGeneratingQuizId(null);
                return;
            }
            setGeneratingQuizId(null);
        }

        setCurrentQuiz(quiz);
        setQuizAnswers({});
        setQuizSubmitted(false);
        
        // Check if I already attempted this specific session (any language)
        const attempts = quizAttemptMap[session.id] || [];
        const myAttempt = attempts.find(a => a.userId === userData.id);
        if (myAttempt) {
            setQuizAnswers(myAttempt.answers || {});
            setQuizScore(myAttempt.score || 0);
            setQuizSubmitted(true);
        }
        
        setShowQuizModal(true);
    };

    const handleQuizOptionSelect = (qIndex, oIndex) => {
        if (quizSubmitted) return;
        setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }));
    };

    const submitQuizAttempt = async () => {
        if (!currentQuiz || currentQuiz.length === 0) return;
        let score = 0;
        currentQuiz.forEach((q, idx) => {
            if (quizAnswers[idx] === q.correctAnswer) score++;
        });
        
        setQuizScore(score);
        setQuizSubmitted(true);

        const lang = (i18n.language || 'en').split('-')[0];

        if (!userData || !userData.id) {
            setAttemptError("You must be logged in to save your score.");
            return;
        }

        try {
            const { error: insertError } = await supabase.from('quiz_attempts').insert({
                session_id: activeQuizSession.id,
                user_id: userData.id,
                user_name: userData.name || userData.email,
                score: score,
                answers: quizAnswers,
                language: lang
            });

            if (insertError) throw insertError;

            // update local state
            setQuizAttemptMap(prev => {
                const current = prev[activeQuizSession.id] || [];
                return {
                    ...prev,
                    [activeQuizSession.id]: [...current, {
                        userId: userData.id,
                        userName: userData.name || userData.email,
                        score: score,
                        answers: quizAnswers,
                        language: lang
                    }]
                };
            });
        } catch (err) {
            console.error("Attempt save error:", err);
            
            // Check specifically for the duplicate key constraint violation (code 23505)
            if (err.code === '23505') {
                setAttemptError("You have already submitted a score for this session. Switching to your results.");
                // Give them their score back from the existing map
                const attempts = quizAttemptMap[activeQuizSession.id] || [];
                const myAttempt = attempts.find(a => a.userId === userData.id);
                if (myAttempt) {
                    setQuizScore(myAttempt.score);
                    setQuizAnswers(myAttempt.answers);
                }
                setQuizSubmitted(true);
                return;
            }

            const errorMessage = err.message || "Unknown database error";
            setAttemptError(`Failed to save score: ${errorMessage}`);
            setQuizSubmitted(false); 
        }
    };

    const handleShowLeaderboard = (session) => {
        const attempts = quizAttemptMap[session.id] || [];
        // sort by score descending
        const sorted = [...attempts].sort((a, b) => b.score - a.score).slice(0, 3);
        setLeaderboardData(sorted);
        setActiveQuizSession(session);
        setShowLeaderboard(true);
        setCurrentQuiz(quizDataMap[session.id] || []);
    };


    return (
        <div className="p-4 sm:p-8 bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-50 transition-colors">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 max-w-7xl mx-auto gap-4">
                <div className="text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#1976d2] mb-1">Class Archive & Intelligence</h1>
                    <p className="text-gray-500 dark:text-slate-300 text-sm sm:text-base">Revisit past lessons with AI-generated summaries and transcripts.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1976d2]"></div>
                </div>
            ) : sessions.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl shadow-sm max-w-7xl mx-auto border border-dashed border-gray-300 dark:border-slate-800">
                    <div className="text-5xl mb-4">📚</div>
                    <p className="text-gray-500 dark:text-slate-300 text-lg">No archived classes found yet.</p>
                    <p className="text-gray-400 dark:text-slate-400 text-sm">Once a live class ends, it will appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {sessions.map((session) => (
                        <div key={session.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-slate-800 group flex flex-col transition-colors">
                            {/* Thumbnail or visual placeholder */}
                            <div className="h-32 bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-white/10 skew-y-12 transform scale-150 origin-bottom-left"></div>
                                <span className="text-white font-bold text-3xl opacity-80 z-10">
                                    {new Date(session.start_time).getDate()}
                                </span>
                                <span className="text-white text-sm uppercase tracking-widest absolute bottom-2 right-4 opacity-75">
                                    {new Date(session.start_time).toLocaleString('default', { month: 'short' })}
                                </span>
                            </div>

                            <div className="p-6 flex-1 flex flex-col">
                                <h3 className="text-xl font-bold text-gray-800 dark:text-slate-50 mb-2 truncate" title={session.title}>{session.title}</h3>
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-200 px-2 py-1 rounded">
                                        {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                        Completed
                                    </span>
                                </div>

                                {session.description && (
                                    <p className="text-gray-600 dark:text-slate-300 text-sm mb-4 line-clamp-2">{session.description}</p>
                                )}

                                {/* AI Insights Section */}
                                <div className="mt-auto pt-4 border-t border-gray-100">
                                    <div className="mb-4">
                                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">AI Insights</h4>
                                        <div className="flex gap-2 flex-wrap">
                                            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-200 border border-blue-100 dark:border-blue-900/40 px-2 py-1 rounded-full">Scalar Product</span>
                                            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-200 border border-blue-100 dark:border-blue-900/40 px-2 py-1 rounded-full">Vectors</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        {/* New Quiz Buttons */}
                                        <div className='flex gap-2 mb-2'>
                                            {userData?.role === 'student' ? (
                                                <button
                                                    onClick={() => handleTakeQuiz(session)}
                                                    disabled={generatingQuizId === session.id}
                                                    className="flex-1 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {generatingQuizId === session.id ? t('quiz.generating') 
                                                    : (quizAttemptMap[session.id]?.some(a => a.userId === userData.id) ? `📝 ${t('quiz.viewResults')}` : `✨ ${t('quiz.takeAIQuiz')}`)}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleTakeQuiz(session)}
                                                    disabled={generatingQuizId === session.id}
                                                    className="flex-1 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {generatingQuizId === session.id ? t('quiz.generating') : `✨ ${t('quiz.prepQuiz')}`}
                                                </button>
                                            )}
                                            
                                            <button 
                                                onClick={() => handleShowLeaderboard(session)}
                                                className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-xl font-bold shadow-sm transition-all active:scale-95 group/leader"
                                                title={t('quiz.viewTopScores')}
                                            >
                                                <span className="group-hover/leader:animate-bounce block text-lg">🏆</span>
                                            </button>
                                        </div>
                                        {session.recording_path ? (
                                            <button
                                                onClick={() => handlePlayRecording(session)}
                                                disabled={loadingRecordingId === session.id}
                                                className="w-full py-2.5 bg-gradient-to-r from-[#1976d2] to-[#1565c0] text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait hover:scale-[1.02] active:scale-[0.98] group/viewbtn shadow-md"
                                            >
                                                <span className={`${loadingRecordingId === session.id ? 'animate-spin' : 'group-hover/viewbtn:animate-bounce'}`}>
                                                    {loadingRecordingId === session.id ? '⏳' : '▶'}
                                                </span>
                                                <span>{loadingRecordingId === session.id ? 'Loading...' : 'View Recording'}</span>
                                            </button>
                                        ) : (
                                            <button disabled className="w-full py-2.5 bg-gray-100 text-gray-400 rounded-xl text-sm font-bold cursor-not-allowed">
                                                Processing Recording...
                                            </button>
                                        )}
                                        <div className='flex gap-2'>
                                            {userData?.role === 'teacher' ? (
                                                <button
                                                    onClick={() => handleDeleteRecording(session)}
                                                    disabled={deletingSessionId === session.id}
                                                    className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                                                >
                                                    <span>{deletingSessionId === session.id ? '⏳' : '🗑️'}</span> {deletingSessionId === session.id ? 'Deleting...' : 'Delete'}
                                                </button>
                                            ) : null}
                                            {userData?.role === 'teacher' ? (
                                                // add attencence button
                                                <button
                                                    className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait hover:scale-[1.02] active:scale-[0.98] group/attbtn shadow-md"
                                                    onClick={() => handleViewAttendance(session)}
                                                    disabled={loadingAttendance && attendanceSession?.id === session.id}
                                                >
                                                    <span className={`${loadingAttendance && attendanceSession?.id === session.id ? 'animate-spin' : 'group-hover/attbtn:animate-bounce'}`}>
                                                        {loadingAttendance && attendanceSession?.id === session.id ? '⏳' : '📋'}
                                                    </span>
                                                    <span>{loadingAttendance && attendanceSession?.id === session.id ? 'Loading...' : 'View Attendance'}</span>
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* Attendance Modal */}
            {attendanceOpen && attendanceSession && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transition-colors">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-[#1976d2] to-[#1565c0] p-5 rounded-t-2xl flex items-center justify-between shrink-0">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    📋 Attendance Report
                                </h3>
                                <p className="text-blue-100 text-sm mt-0.5 truncate max-w-xs">{attendanceSession.title}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                {!loadingAttendance && attendanceList.length > 0 && (
                                    <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                                        {attendanceList.length} student{attendanceList.length !== 1 ? 's' : ''}
                                    </span>
                                )}
                                <button
                                    onClick={() => { setAttendanceOpen(false); setAttendanceList([]); setAttendanceSession(null); }}
                                    className="text-white hover:bg-blue-500 rounded-full p-1.5 transition-colors"
                                >✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="overflow-auto flex-1 p-5">
                            {loadingAttendance ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1976d2]"></div>
                                    <p className="text-gray-500 text-sm">Loading attendance…</p>
                                </div>
                            ) : attendanceList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <div className="text-5xl">🎓</div>
                                    <h4 className="text-gray-700 dark:text-slate-200 font-semibold">No attendance records found</h4>
                                    <p className="text-gray-400 dark:text-slate-400 text-sm text-center max-w-xs">
                                        No students joined this session using the roll number form, or the session predates attendance tracking.
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-300 uppercase tracking-wider">#</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Student Name</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Roll No.</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Email</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 dark:text-slate-300 uppercase tracking-wider">Joined At</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                        {attendanceList.map((a, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                                                <td className="py-3 px-3 text-gray-400 dark:text-slate-400 font-medium">{idx + 1}</td>
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                            {(a.display_name || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-gray-800 dark:text-slate-50">{a.display_name || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span className="bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded text-xs font-semibold">
                                                        {a.roll_number || '—'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-gray-500 dark:text-slate-300 text-xs">{a.display_email || '—'}</td>
                                                <td className="py-3 px-3 text-gray-400 dark:text-slate-400 text-xs">{getAttendanceTime(a)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-100 p-4 flex justify-between items-center shrink-0">
                            {attendanceList.length > 0 ? (
                                <button
                                    onClick={handleExportCSV}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                                >
                                    ⬇️ Export CSV
                                </button>
                            ) : <div />}
                            <button
                                onClick={() => { setAttendanceOpen(false); setAttendanceList([]); setAttendanceSession(null); }}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
                            >Close</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Recording Player Modal */}
            {selectedRecording && recordingUrl && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-auto transition-colors">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-gradient-to-r from-[#1976d2] to-[#1565c0] p-6 flex items-center justify-between border-b border-blue-300">
                            <div>
                                <h2 className="text-xl font-bold text-white">{selectedRecording.title}</h2>
                                <p className="text-blue-100 text-sm mt-1">
                                    {new Date(selectedRecording.start_time).toLocaleString()}
                                </p>
                            </div>
                            <button
                                onClick={closeRecordingPlayer}
                                className="text-white hover:bg-blue-500 rounded-full p-2 transition-colors"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8">
                            <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-6 shadow-inner transition-colors">
                                <div className="mb-4 flex items-center gap-2 text-gray-600 dark:text-slate-300 text-sm">
                                    <span>🎙️</span>
                                    <span>Audio Recording</span>
                                </div>

                                {/* Audio Player */}
                                <div className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-md border border-gray-200 dark:border-slate-800">
                                    <audio
                                        controls
                                        autoPlay
                                        className="w-full"
                                        style={{ outline: 'none' }}
                                    >
                                        <source src={recordingUrl} type="audio/webm" />
                                        Your browser does not support the audio element.
                                    </audio>
                                </div>

                                {/* Recording Info */}
                                <div className="mt-6 grid grid-cols-2 gap-4">
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                        <p className="text-xs text-blue-600 font-semibold uppercase">Recording Path</p>
                                        <p className="text-sm text-gray-700 dark:text-slate-400 mt-1 font-mono truncate">
                                            {selectedRecording.recording_path}
                                        </p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                        <p className="text-xs text-green-600 font-semibold uppercase">Duration</p>
                                        <p className="text-sm text-gray-700 dark:text-slate-400 mt-1">Recorded during class</p>
                                    </div>
                                </div>

                                {/* Session Description */}
                                {selectedRecording.description && (
                                    <div className="mt-6 bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                                        <p className="text-xs text-gray-600 dark:text-slate-300 font-semibold uppercase mb-2">Session Notes</p>
                                        <p className="text-sm text-gray-700 dark:text-slate-200">{selectedRecording.description}</p>
                                    </div>
                                )}

                                {/* Download Link */}
                                <div className="mt-6 flex gap-2">
                                    <a
                                        href={recordingUrl}
                                        download
                                        className="flex-1 py-3 bg-[#1976d2] text-white rounded-lg font-semibold hover:bg-[#1565c0] transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span>⬇️</span> Download Recording
                                    </a>
                                    <button
                                        onClick={closeRecordingPlayer}
                                        className="flex-1 py-3 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-100 rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Quiz Modal */}
            {showQuizModal && activeQuizSession && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up border border-indigo-100 dark:border-indigo-900/30">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white shrink-0">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black mb-1">✨ {t('quiz.title')}</h2>
                                    <p className="text-indigo-100 text-sm font-medium">{activeQuizSession.title}</p>
                                </div>
                                <button onClick={() => setShowQuizModal(false)} className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center transition-colors">✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-auto p-6 md:p-8 space-y-8 bg-slate-50 dark:bg-slate-950">
                            {attemptError && (
                                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-200">
                                    {attemptError}
                                </div>
                            )}

                            {quizSubmitted && (
                                <div className="text-center p-6 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 shadow-sm mb-6">
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">{t('quiz.completed')}</h3>
                                    <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 my-4">
                                        {quizScore} / {currentQuiz.length}
                                    </div>
                                    <p className="text-gray-500 dark:text-slate-400 font-medium tracking-wide">
                                        {quizScore === currentQuiz.length ? t('quiz.perfectScore') : quizScore > 0 ? t('quiz.goodJob') : t('quiz.keepLearning')}
                                    </p>
                                </div>
                            )}

                            {currentQuiz.map((q, qIndex) => (
                                <div key={qIndex} className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-800">
                                    <h4 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-4">{qIndex + 1}. {q.question}</h4>
                                    <div className="space-y-3">
                                        {q.options.map((opt, oIndex) => {
                                            const isSelected = quizAnswers[qIndex] === oIndex;
                                            const isCorrect = q.correctAnswer === oIndex;
                                            const showCorrectness = quizSubmitted;
                                            
                                            let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all font-medium text-sm ";
                                            
                                            if (showCorrectness) {
                                                if (isCorrect) btnClass += "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200";
                                                else if (isSelected) btnClass += "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200";
                                                else btnClass += "border-gray-100 dark:border-slate-800 text-gray-400 dark:text-slate-500 opacity-50";
                                            } else {
                                                if (isSelected) btnClass += "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 shadow-inner";
                                                else btnClass += "border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer";
                                            }

                                            return (
                                                <button 
                                                    key={oIndex}
                                                    disabled={quizSubmitted}
                                                    onClick={() => handleQuizOptionSelect(qIndex, oIndex)}
                                                    className={btnClass}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span>{opt}</span>
                                                        {showCorrectness && isCorrect && <span className="text-xl">✅</span>}
                                                        {showCorrectness && isSelected && !isCorrect && <span className="text-xl">❌</span>}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        {!quizSubmitted && (
                            <div className="p-6 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 shrink-0">
                                <button
                                    onClick={submitQuizAttempt}
                                    disabled={Object.keys(quizAnswers).length !== currentQuiz.length}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-indigo-500/40 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
                                >
                                    {t('quiz.submitAnswers')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Leaderboard Modal */}
            {showLeaderboard && activeQuizSession && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-down border border-amber-200 dark:border-amber-900/30">
                        {/* Header */}
                        <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 right-0 opacity-20 text-8xl -mt-4 -mr-4 transform rotate-12">🏆</div>
                            <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-black mb-1 drop-shadow-md">{t('quiz.topScholars')}</h2>
                                    <p className="text-amber-50 font-medium drop-shadow-sm">{activeQuizSession.title}</p>
                                </div>
                                <button onClick={() => setShowLeaderboard(false)} className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center transition-colors">✕</button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
                            {leaderboardData.length === 0 ? (
                                <div className="text-center py-10 opacity-70">
                                    <div className="text-6xl mb-4">🤫</div>
                                    <p className="text-gray-500 dark:text-slate-400 font-bold">{t('quiz.noOneTaken')}</p>
                                    <p className="text-sm text-gray-400 mt-2">{t('quiz.beTheFirst')}</p>
                                </div>
                            ) : (
                                <div className="space-y-4 relative">
                                    {leaderboardData.map((attempt, idx) => (
                                        <div key={idx} className={`relative flex items-center gap-4 p-5 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm transform transition-transform hover:scale-[1.02] ${idx === 0 ? 'border-amber-400 ring-2 ring-amber-400/20 z-10' : idx === 1 ? 'border-gray-300 dark:border-gray-600' : 'border-amber-700/30 border-amber-700'}`}>
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-black shadow-inner shrink-0 ${idx === 0 ? 'bg-gradient-to-br from-amber-200 to-amber-500 text-amber-900' : idx === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-400 text-gray-800' : 'bg-gradient-to-br from-orange-200 to-orange-400 text-orange-900'}`}>
                                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-lg text-gray-800 dark:text-slate-100 truncate">{attempt.userName}</h4>
                                                <p className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{t('quiz.score')}: {attempt.score}</p>
                                            </div>
                                            <div className="text-2xl font-black text-gray-200 dark:text-slate-800">
                                                #{idx + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* View Questions (Teacher only) */}
                            {userData?.role === 'teacher' && currentQuiz.length > 0 && (
                                <div className="mt-10 pt-6 border-t border-gray-200 dark:border-slate-800">
                                    <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-4 uppercase text-xs tracking-widest">{t('quiz.questionsAsked')}</h3>
                                    <div className="space-y-4">
                                        {currentQuiz.map((q, idx) => (
                                            <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-800 text-sm">
                                                <p className="font-semibold text-gray-800 dark:text-slate-200 mb-2">Q{idx+1}: {q.question}</p>
                                                <p className="text-green-600 dark:text-green-400 font-medium">✅ {q.options[q.correctAnswer]}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveClass;
