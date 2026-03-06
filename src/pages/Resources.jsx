// [HACKATHON TIMELINE] STEP 7 (Hour 10) - Resources & Cloud Storage logic
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { aiService } from '../lib/ai';
import { extractTextFromFile } from '../services/fileParser';

function Resources() {
    const { userData } = useAuth();
    const { groupId } = useParams();
    const role = userData?.role || 'student';
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    // AI States
    const [aiInputText, setAiInputText] = useState('');
    const [summary, setSummary] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [flashcards, setFlashcards] = useState(null);
    const [loadingAI, setLoadingAI] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [extractingFileId, setExtractingFileId] = useState(null);

    // Interactive Quiz States (temporary, not stored in Supabase)
    const [selectedAnswers, setSelectedAnswers] = useState({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);

    const filesChannelRef = useRef(null);
    const pollingIntervalRef = useRef(null);

    const fetchFiles = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('files')
                .select('*')
                .eq('group_id', groupId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Database error fetching files:', error);
                return;
            }

            const mapped = await Promise.all(
                (data || []).map(async (file) => {
                    const { data: publicUrlData } = supabase.storage
                        .from('group-files')
                        .getPublicUrl(file.path);

                    let url = publicUrlData?.publicUrl;
                    return {
                        id: file.id,
                        name: file.name,
                        url,
                        path: file.path,
                        uploadedBy: file.uploaded_by,
                        uploadedByName: file.uploaded_by_name,
                        uploadedAt: file.created_at,
                    };
                }),
            );

            setFiles(mapped);
        } catch (error) {
            console.error('Error fetching files:', error);
        }
    }, [groupId]);

    const subscribeFiles = useCallback(() => {
        const channel = supabase
            .channel(`files_${groupId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'files', filter: `group_id=eq.${groupId}` },
                () => {
                    fetchFiles();
                },
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'files', filter: `group_id=eq.${groupId}` },
                (payload) => {
                    setFiles((prev) => prev.filter((f) => f.id !== payload.old.id));
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (!pollingIntervalRef.current) {
                        pollingIntervalRef.current = setInterval(fetchFiles, 5000);
                    }
                }
            });
        return channel;
    }, [groupId, fetchFiles]);

    useEffect(() => {
        if (groupId) {
            fetchFiles();
            filesChannelRef.current = subscribeFiles();
        }
        return () => {
            if (filesChannelRef.current) {
                supabase.removeChannel(filesChannelRef.current);
                filesChannelRef.current = null;
            }
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };
    }, [groupId, fetchFiles, subscribeFiles]);

    // fetchFiles moved above and memoized

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const path = `${groupId}/${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('group-files')
                .upload(path, file);

            if (uploadError) throw uploadError;

            const { error: dbError } = await supabase.from('files').insert({
                group_id: groupId,
                name: file.name,
                path,
                uploaded_by: userData.id,
                uploaded_by_name: userData.name || userData.email || 'Unknown User',
            });

            if (dbError) throw dbError;
            await fetchFiles();
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file: ' + (error.message || 'Unknown error'));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    /* --- REAL AI INTEGRATION --- */

    // Helper to get text content from file using the fileParser service
    const getFileContent = async (file) => {
        setExtractingFileId(file.id);
        setAiInputText(`[Loading content from ${file.name}...]`);
        try {
            const isAudio = file.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i);

            if (isAudio) {
                setAiInputText(`[Transcribing audio from ${file.name} using AssemblyAI...]`);
                const transcription = await aiService.transcribeAudio(file.url);
                return transcription;
            }

            // Use the enhanced fileParser service for all file types
            const extractedText = await extractTextFromFile(file.url);

            if (!extractedText || extractedText.trim().length === 0) {
                return `[Could not extract text from ${file.name}. The file may be empty, corrupted, or in an unsupported format.]`;
            }

            // If fileParser returns a bracketed diagnostic message, show it directly.
            if (extractedText.startsWith('[') && extractedText.includes(']')) {
                return extractedText;
            }

            // Add a header to show which file the content came from
            return `[Extracted Content from ${file.name}]:\n\n${extractedText}`;

        } catch (error) {
            console.error("Extraction error:", error);
            return `Failed to extract content from ${file.name}. ${error.message}`;
        } finally {
            setExtractingFileId(null);
        }
    };

    const handleUseForAI = async (file) => {
        const content = await getFileContent(file);
        setAiInputText(content);
        // Scroll to the textarea for better UX
        window.scrollTo({ top: 100, behavior: 'smooth' });
    };

    const handleGenerateSummary = async () => {
        if (!aiInputText.trim()) {
            setAiError("Please provide some text or use a file for AI first.");
            return;
        }
        setLoadingAI(true);
        setSummary("Generating summary...");
        setQuiz(null); setFlashcards(null); setAiError(null);

        try {
            const result = await aiService.generateSummary(aiInputText);
            setSummary(result);
        } catch {
            setAiError("Failed to generate summary.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleGenerateQuiz = async () => {
        if (!aiInputText.trim()) {
            setAiError("Please provide some text or use a file for AI first.");
            return;
        }
        setLoadingAI(true);
        setQuiz("Generating quiz...");
        setSummary(null); setFlashcards(null); setAiError(null);

        // Reset quiz interaction states
        setSelectedAnswers({});
        setQuizSubmitted(false);

        try {
            const result = await aiService.generateQuiz(aiInputText);
            setQuiz(result);
        } catch {
            setAiError("Failed to generate quiz.");
        } finally {
            setLoadingAI(false);
        }
    };

    // Interactive Quiz Handlers (temporary state only)
    const handleOptionClick = (questionIndex, optionIndex) => {
        if (quizSubmitted) return;
        setSelectedAnswers(prev => ({
            ...prev,
            [questionIndex]: optionIndex
        }));
    };

    const handleSubmitQuiz = () => {
        if (!quiz || !Array.isArray(quiz)) return;
        if (Object.keys(selectedAnswers).length !== quiz.length) return;
        setQuizSubmitted(true);
    };

    const handleResetQuiz = () => {
        setSelectedAnswers({});
        setQuizSubmitted(false);
    };

    // flashcards generation not used in UI, removing to satisfy lint

    return (
        <div className="flex-1 p-8 min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-100">
                    <div>
                        <h2 className="m-0 text-[#1976d2] text-3xl font-bold">Smart Learning Resources</h2>
                        <p className="text-gray-500 m-0 mt-1">Upload materials and let AI generate study aids.</p>
                    </div>
                    {role === 'teacher' && (
                        <div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.rtf,.odt,.mp3,.wav,.m4a,.aac,.ogg"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="px-6 py-3 bg-[#1976d2] text-white border-none rounded-xl text-base font-bold cursor-pointer transition-colors hover:bg-[#1565c0] disabled:opacity-50 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                                {uploading ? 'Uploading...' : 'Upload Study Material'}
                            </button>
                        </div>
                    )}
                </div>

                {/* AI Workspace - Textarea and Generation Buttons */}
                {role === 'student' && (
                    <div className="mb-10 bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="m-0 text-blue-800 text-lg font-bold flex items-center gap-2">
                                <span>🧪</span> AI Workspace
                            </h3>
                            {role === 'student' && (
                                <div className="flex gap-3 items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAiInputText('');
                                            setSummary(null);
                                            setQuiz(null);
                                            setFlashcards(null);
                                            setAiError(null);
                                        }}
                                        disabled={!!extractingFileId}
                                        className="px-4 py-2 bg-white text-blue-700 rounded-lg font-bold text-sm border border-blue-200 hover:bg-blue-50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                        title="Clear text"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        onClick={handleGenerateSummary}
                                        disabled={loadingAI || !!extractingFileId}
                                        className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold text-sm hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        ✨ Generate Summary
                                    </button>
                                    <button
                                        onClick={handleGenerateQuiz}
                                        disabled={loadingAI || !!extractingFileId}
                                        className="px-6 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        ❓ Generate Quiz
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="mb-3 text-xs text-blue-600 bg-blue-100/50 p-2 rounded-lg">
                            💡 <strong>Supported files:</strong> PDF, DOCX, DOC, TXT, RTF, ODT, PPT, PPTX, XLS, XLSX, MP3, WAV, M4A, AAC, OGG • Click "Use for AI" to extract text automatically
                        </div>
                        <textarea
                            value={aiInputText}
                            onChange={(e) => setAiInputText(e.target.value)}
                            placeholder="Select a file below or paste text here to start AI generation..."
                            className={`w-full min-h-37.5 p-5 rounded-xl border transition-all resize-y shadow-inner outline-none font-sans text-base ${extractingFileId
                                ? 'border-blue-300 bg-blue-50 text-blue-700 animate-pulse'
                                : 'border-blue-200 bg-white text-gray-700 focus:ring-4 focus:ring-blue-100 focus:border-blue-400'
                                }`}
                            disabled={!!extractingFileId}
                        />
                    </div>
                )}

                {/* AI Results Section - Full Width Rectangle */}
                {(loadingAI || summary || quiz || flashcards || aiError) && (
                    <div className="mt-8 bg-linear-to-br from-slate-50 to-white rounded-2xl border border-blue-100 shadow-xl overflow-hidden animate-fade-in">
                        <div className="p-6 border-b border-blue-50 flex justify-between items-center bg-white/50 backdrop-blur-sm">
                            <h3 className="m-0 text-[#1976d2] text-xl font-bold flex items-center gap-2">
                                <span className="text-2xl">🤖</span> AI Tutor Activity Result
                            </h3>
                            <button
                                onClick={() => {
                                    setSummary(null); setQuiz(null); setFlashcards(null); setAiError(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                                title="Close Results"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-8">
                            {loadingAI && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="relative">
                                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xl">⚡</span>
                                        </div>
                                    </div>
                                    <p className="mt-4 text-lg text-blue-600 font-bold animate-pulse">Groq AI is processing your request...</p>
                                    <p className="text-sm text-gray-400">Analyzing content for better understanding</p>
                                </div>
                            )}

                            {aiError && (
                                <div className="bg-red-50 text-red-600 p-6 rounded-xl border border-red-100 flex items-center gap-4">
                                    <span className="text-2xl">⚠️</span>
                                    <div>
                                        <p className="font-bold m-0">AI Error</p>
                                        <p className="m-0 text-sm">{aiError}</p>
                                    </div>
                                </div>
                            )}

                            {!loadingAI && summary && typeof summary === 'string' && (
                                <div className="animate-fade-in">
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="bg-emerald-100 text-emerald-700 p-2 rounded-lg text-lg">📄</span>
                                        <h4 className="m-0 text-gray-800 text-xl font-bold">Document Summary</h4>
                                    </div>
                                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm leading-relaxed text-gray-700 text-lg whitespace-pre-wrap">
                                        {summary}
                                    </div>
                                </div>
                            )}

                            {!loadingAI && quiz && Array.isArray(quiz) && (
                                <div className="animate-fade-in space-y-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <span className="bg-amber-100 text-amber-700 p-2 rounded-lg text-lg">🎯</span>
                                        <h4 className="m-0 text-gray-800 text-xl font-bold">Concept Check Quiz</h4>
                                    </div>

                                    {/* Interactive Quiz Questions */}
                                    {quiz.map((q, qIndex) => (
                                        <div
                                            key={qIndex}
                                            className="p-4 border rounded-lg bg-white"
                                        >
                                            {/* Question */}
                                            <p className="font-semibold mb-3">
                                                {qIndex + 1}. {q.question || q.q}
                                            </p>

                                            {/* Options */}
                                            <div className="space-y-2">
                                                {(q.options || []).map((option, oIndex) => {
                                                    const selected = selectedAnswers[qIndex];
                                                    const isCorrect = oIndex === (q.correctAnswer || 0);
                                                    const isSelected = selected === oIndex;

                                                    let bg = 'bg-gray-100 hover:bg-gray-200';

                                                    // Only show colors after submission
                                                    if (quizSubmitted) {
                                                        if (isCorrect) bg = 'bg-green-200';
                                                        else if (isSelected) bg = 'bg-red-200';
                                                    }

                                                    return (
                                                        <button
                                                            key={oIndex}
                                                            onClick={() => handleOptionClick(qIndex, oIndex)}
                                                            disabled={quizSubmitted}
                                                            aria-pressed={isSelected}
                                                            className={`w-full text-left p-2 rounded transition ${bg}`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span
                                                                    className={`shrink-0 h-5 w-5 rounded-full border flex items-center justify-center transition text-xs font-semibold ${isSelected ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-gray-300 text-gray-600'
                                                                        }`}
                                                                >
                                                                     {String.fromCharCode(65 + oIndex)}
                                                                </span>

                                                                <span className="flex-1">{option}</span>
                                                                {quizSubmitted && isCorrect && (
                                                                    <span className="text-green-600 text-sm font-medium">✓ Correct</span>
                                                                )}
                                                                {quizSubmitted && isSelected && !isCorrect && (
                                                                    <span className="text-red-600 text-sm font-medium">✗ Incorrect</span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Submit Button and Results */}
                                    <div className="mt-6 pt-4 border-t">
                                        {!quizSubmitted ? (
                                            <button
                                                onClick={handleSubmitQuiz}
                                                disabled={Object.keys(selectedAnswers).length !== quiz.length}
                                                className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                                            >
                                                Submit Quiz ({Object.keys(selectedAnswers).length}/{quiz.length} answered)
                                            </button>
                                        ) : (
                                            <div className="space-y-4">
                                                <div className="p-4 bg-blue-50 rounded-lg">
                                                    <h3 className="font-semibold text-blue-900 mb-2">Quiz Results</h3>
                                                    <p className="text-blue-800">
                                                        You scored {Object.entries(selectedAnswers).filter(([qIndex, answer]) =>
                                                            (quiz[qIndex].correctAnswer || 0) === answer
                                                        ).length} out of {quiz.length} questions correctly!
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={handleResetQuiz}
                                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                                                >
                                                    Reset Quiz
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-6 mt-12">
                    <div className="w-full">
                        <h3 className="text-gray-800 font-bold mb-4 flex items-center gap-2 px-2">
                            <span>📂</span> Study Materials
                        </h3>
                        {files.length === 0 ? (
                            <div className="text-center py-16 text-[#999] bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <span className="text-4xl block mb-2">📂</span>
                                <p className="text-lg">No files uploaded yet.</p>
                                {role === 'teacher' && <p>Click "Upload Study Material" to get started.</p>}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {files.map((file) => (
                                    <div
                                        key={file.id}
                                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group"
                                    >
                                        <div className="flex items-center gap-4 flex-1 mb-4 sm:mb-0">
                                            <div className="text-4xl p-2 bg-blue-50 rounded-lg">📄</div>
                                            <div className="flex-1">
                                                <div className="font-bold text-gray-800 text-lg mb-1 group-hover:text-[#1976d2] transition-colors">{file.name}</div>
                                                <div className="text-xs text-gray-500 uppercase tracking-wide">
                                                    By {file.uploadedByName || 'Unknown'} • {new Date(file.uploadedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {role === 'student' && (
                                                <button
                                                    onClick={() => handleUseForAI(file)}
                                                    disabled={extractingFileId === file.id}
                                                    className="px-4 py-2 border-none rounded-lg text-sm font-semibold cursor-pointer transition-all bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {extractingFileId === file.id ? (
                                                        <>
                                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                                            Extracting...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>💡</span> Use for AI
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                            <a
                                                href={file.url}
                                                download
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-4 py-2 bg-gray-50 text-gray-600 no-underline rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-100 transition-colors"
                                            >
                                                Download
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>



                </div>

            </div>
        </div>
    );
}

export default Resources;
