// [HACKATHON TIMELINE] STEP 10 (Hour 22) - History, Summaries & Recordings Archive
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ArchiveClass = () => {
    const { groupId } = useParams();
    const { userData } = useAuth();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecording, setSelectedRecording] = useState(null);
    const [recordingUrl, setRecordingUrl] = useState(null);
    const [isLoadingRecording, setIsLoadingRecording] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState(null);
    const [attendanceOpen, setAttendanceOpen] = useState(false);
    const [attendanceList, setAttendanceList] = useState([]);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const [attendanceSession, setAttendanceSession] = useState(null);

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
            setIsLoadingRecording(true);
            setSelectedRecording(session);

            if (!session.recording_path) {
                alert('No recording available for this session');
                setIsLoadingRecording(false);
                return;
            }

            // Get signed URL for private bucket
            const { data, error } = await supabase.storage
                .from('teacher-recordings')
                .createSignedUrl(session.recording_path, 3600); // 1 hour expiry

            if (error) {
                console.error('[ArchiveClass] Error getting recording URL:', error);
                alert('Failed to load recording: ' + error.message);
                setIsLoadingRecording(false);
                return;
            }

            setRecordingUrl(data?.signedUrl);
            console.log('[ArchiveClass] Recording URL generated successfully');
        } catch (err) {
            console.error('[ArchiveClass] Error playing recording:', err);
            alert('Failed to play recording: ' + err.message);
        } finally {
            setIsLoadingRecording(false);
        }
    };

    // Close recording player
    const closeRecordingPlayer = () => {
        setSelectedRecording(null);
        setRecordingUrl(null);
    };

    // Delete recording and session
    const handleDeleteRecording = async (session) => {
        if (!window.confirm(`Delete recording for "${session.title}"? This cannot be undone.`)) {
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
                    alert('Failed to delete recording file: ' + storageError.message);
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
                alert('Failed to delete session: ' + dbError.message);
                return;
            }

            // Remove from UI
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
            console.log('[ArchiveClass] Recording and session deleted successfully');
            alert('Recording deleted successfully');
        } catch (err) {
            console.error('[ArchiveClass] Error deleting recording:', err);
            alert('Failed to delete recording: ' + err.message);
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
            alert('Failed to load attendance: ' + (err.message || err));
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

    useEffect(() => {
        fetchArchivedSessions();
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

    // removed duplicate fetchArchivedSessions

    return (
        <div className="p-8 bg-slate-50 min-h-screen">
            <div className="flex items-center justify-between mb-8 max-w-7xl mx-auto">
                <div>
                    <h1 className="text-3xl font-bold text-[#1976d2] mb-1">Class Archive & Intelligence</h1>
                    <p className="text-gray-500">Revisit past lessons with AI-generated summaries and transcripts.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1976d2]"></div>
                </div>
            ) : sessions.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl shadow-sm max-w-7xl mx-auto border border-dashed border-gray-300">
                    <div className="text-5xl mb-4">📚</div>
                    <p className="text-gray-500 text-lg">No archived classes found yet.</p>
                    <p className="text-gray-400 text-sm">Once a live class ends, it will appear here.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
                    {sessions.map((session) => (
                        <div key={session.id} className="bg-white rounded-2xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100 group flex flex-col">
                            {/* Thumbnail or visual placeholder */}
                            <div className="h-32 bg-linear-to-r from-blue-500 to-indigo-600 flex items-center justify-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-white/10 skew-y-12 transform scale-150 origin-bottom-left"></div>
                                <span className="text-white font-bold text-3xl opacity-80 z-10">
                                    {new Date(session.start_time).getDate()}
                                </span>
                                <span className="text-white text-sm uppercase tracking-widest absolute bottom-2 right-4 opacity-75">
                                    {new Date(session.start_time).toLocaleString('default', { month: 'short' })}
                                </span>
                            </div>

                            <div className="p-6 flex-1 flex flex-col">
                                <h3 className="text-xl font-bold text-gray-800 mb-2 truncate" title={session.title}>{session.title}</h3>
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                        {new Date(session.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                        Completed
                                    </span>
                                </div>

                                {session.description && (
                                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{session.description}</p>
                                )}

                                {/* AI Insights Section */}
                                <div className="mt-auto pt-4 border-t border-gray-100">
                                    <div className="mb-4">
                                        <h4 className="text-xs font-bold text-blue-600 uppercase mb-2">AI Insights</h4>
                                        <div className="flex gap-2 flex-wrap">
                                            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-full">Scalar Product</span>
                                            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-full">Vectors</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        {session.recording_path ? (
                                            <button
                                                onClick={() => handlePlayRecording(session)}
                                                disabled={isLoadingRecording}
                                                className="w-full py-2.5 bg-[#1976d2] text-white rounded-xl text-sm font-bold hover:bg-[#1565c0] transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                                            >
                                                <span>{isLoadingRecording ? '⏳' : '▶'}</span> {isLoadingRecording ? 'Loading...' : 'View'}
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
                                                    className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                                                    onClick={() => handleViewAttendance(session)}
                                                    disabled={deletingSessionId === session.id}
                                                >
                                                    <span>📋</span> View Attendance
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="bg-linear-to-r from-[#1976d2] to-[#1565c0] p-5 rounded-t-2xl flex items-center justify-between shrink-0">
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
                                    <h4 className="text-gray-700 font-semibold">No attendance records found</h4>
                                    <p className="text-gray-400 text-sm text-center max-w-xs">
                                        No students joined this session using the roll number form, or the session predates attendance tracking.
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">#</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Student Name</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Roll No.</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                                            <th className="text-left py-3 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Joined At</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {attendanceList.map((a, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50 transition-colors">
                                                <td className="py-3 px-3 text-gray-400 font-medium">{idx + 1}</td>
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                            {(a.display_name || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-gray-800">{a.display_name || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">
                                                        {a.roll_number || '—'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3 text-gray-500 text-xs">{a.display_email || '—'}</td>
                                                <td className="py-3 px-3 text-gray-400 text-xs">{getAttendanceTime(a)}</td>
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
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-linear-to-r from-[#1976d2] to-[#1565c0] p-6 flex items-center justify-between border-b border-blue-300">
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
                            <div className="bg-gray-50 rounded-xl p-6 shadow-inner">
                                <div className="mb-4 flex items-center gap-2 text-gray-600 text-sm">
                                    <span>🎙️</span>
                                    <span>Audio Recording</span>
                                </div>

                                {/* Audio Player */}
                                <div className="bg-white rounded-lg p-6 shadow-md border border-gray-200">
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
                                        <p className="text-sm text-gray-700 mt-1 font-mono truncate">
                                            {selectedRecording.recording_path}
                                        </p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                        <p className="text-xs text-green-600 font-semibold uppercase">Duration</p>
                                        <p className="text-sm text-gray-700 mt-1">Recorded during class</p>
                                    </div>
                                </div>

                                {/* Session Description */}
                                {selectedRecording.description && (
                                    <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <p className="text-xs text-gray-600 font-semibold uppercase mb-2">Session Notes</p>
                                        <p className="text-sm text-gray-700">{selectedRecording.description}</p>
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
                                        className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchiveClass;
