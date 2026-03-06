import Groq from "groq-sdk";
import { AssemblyAI } from 'assemblyai';

// Initialize Groq client
// ideally this should be in an edge function to hide the key, but for a hackathon/demo, client-side is often used (at risk of exposing key)
// OR we ask user to put VITE_GROQ_API_KEY in .env
const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true // Required for client-side usage in hackathons
});

const aai = new AssemblyAI({
    apiKey: import.meta.env.VITE_ASSEMBLYAI_API_KEY
});

export const aiService = {
    // 1. Generate Summaries for Resources or Classes
    generateSummary: async (text) => {
        if (!text) return "No content to summarize.";
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are an expert educational AI. Summarize the provided study material or transcript concisely. Highlight key concepts, definitions, and formulas."
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.5,
                max_tokens: 500,
            });
            return completion.choices[0]?.message?.content || "Could not generate summary.";
        } catch (error) {
            console.error("AI Error:", error);
            return "Error generating summary. Please check your API key.";
        }
    },

    // 2. Generate Quiz from Content
    generateQuiz: async (text) => {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Generate 3 multiple-choice questions (MCQs) from the provided text. 
                        Each question should have 4 options (A, B, C, D) and indicate the correct answer index (0-3).
                        Return ONLY a valid JSON array of objects with this exact structure:
                        [
                          {
                            "question": "Question text here?",
                            "options": ["Option A", "Option B", "Option C", "Option D"],
                            "correctAnswer": 0
                          }
                        ]
                        Where correctAnswer is the index (0-3) of the correct option.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            // LLaMA might just return the content, sometimes tailored. 
            // We'll parse aggressively.
            const content = completion.choices[0]?.message?.content;
            // Attempt to parse JSON
            try {
                const parsed = JSON.parse(content);
                // Return array if it's inside a key or direct array
                const quizArray = Array.isArray(parsed) ? parsed : (parsed.quiz || parsed.questions || []);

                // Validate and normalize quiz format
                return quizArray.map(q => ({
                    question: q.question || q.q,
                    options: q.options || [],
                    correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0
                }));
            } catch {
                return [];
            }
        } catch (error) {
            console.error("AI Error:", error);
            return [];
        }
    },

    // 3. AI Tutor Chat Response
    getTutorResponse: async (context, userQuestion) => {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful AI Tutor for a study group. 
                        Context of discussion: ${context}. 
                        Answer the student's doubt simply and encouragingly. Be brief.`
                    },
                    {
                        role: "user",
                        content: userQuestion
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.7,
                max_tokens: 200,
            });
            return completion.choices[0]?.message?.content;
        } catch (error) {
            console.error("AI Error:", error);
            return "I'm having trouble connecting to my brain right now.";
        }
    },
    // 4. Generate Flashcards (Optional/Future)
    // ...

    // 5. Transcribe Audio File using AssemblyAI
    transcribeAudio: async (audioUrl) => {
        if (!audioUrl) return "";
        try {
            const transcript = await aai.transcripts.transcribe({
                audio_url: audioUrl
            });
            return transcript.text || "No transcription available.";
        } catch (error) {
            console.error("AssemblyAI Error:", error);
            return `Error transcribing audio: ${error.message}`;
        }
    },

    // 6. Realtime transcriber (Node/SDK). For browser live class use src/lib/liveTranscription.js (Streaming v3).
    createRealtimeTranscriber: () => {
        return aai.realtime.transcriber({ sampleRate: 16000 });
    },
};