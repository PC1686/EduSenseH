import Groq from "groq-sdk";
import { AssemblyAI } from 'assemblyai';
import i18n from './i18n';

// Initialize Groq client
const groq = new Groq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    dangerouslyAllowBrowser: true
});

const aai = new AssemblyAI({
    apiKey: import.meta.env.VITE_ASSEMBLYAI_API_KEY
});

// Language configurations for AI services
const LANGUAGE_CONFIGS = {
    en: {
        name: 'English',
        code: 'en',
        groqPrompt: 'Respond in English.',
        assemblyCode: 'en',
        systemPrompt: 'You are an expert educational AI assistant. Provide clear, accurate responses in English.',
        summaryPrompt: 'Summarize the provided educational content in English. Highlight key concepts, definitions, and important formulas.',
        quizPrompt: 'Generate multiple-choice questions in English. Each question should have 4 options with clear answers.',
        tutorPrompt: 'You are a helpful AI tutor. Answer student questions in English clearly and encouragingly.'
    },
    hi: {
        name: 'हिंदी (Hindi)',
        code: 'hi',
        groqPrompt: 'हिंदी में उत्तर दें।',
        assemblyCode: 'hi',
        systemPrompt: 'आप एक विशेषज्ञ शैक्षिक AI सहायक हैं। हिंदी में स्पष्ट और सटीक प्रतिक्रियाएं दें।',
        summaryPrompt: 'प्रदान की गई शैक्षिक सामग्री का हिंदी में सारांश बनाएं। मुख्य अवधारणाओं, परिभाषाओं और महत्वपूर्ण सूत्रों पर ध्यान दें।',
        quizPrompt: 'हिंदी में बहुविकल्पीय प्रश्न उत्पन्न करें। प्रत्येक प्रश्न में 4 विकल्प होने चाहिए और स्पष्ट उत्तर होने चाहिए।',
        tutorPrompt: 'आप एक सहायक AI ट्यूटर हैं। छात्रों के प्रश्नों का उत्तर हिंदी में स्पष्ट और प्रोत्साहित करने वाले ढंग से दें।'
    },
    mr: {
        name: 'मराठी (Marathi)',
        code: 'mr',
        groqPrompt: 'मराठीत उत्तर द्या.',
        assemblyCode: 'mr',
        systemPrompt: 'आप एक तज्ञ शैक्षणिक AI सहायक आहात. मराठीत स्पष्ट आणि अचूक प्रतिसाद द्या.',
        summaryPrompt: 'दिलेल्या शैक्षणिक सामग्रीचे मराठीत सारांश तयार करा. मुख्य संकल्पना, व्याख्या आणि महत्वाचे सूत्र यांवर लक्ष केंद्रित करा.',
        quizPrompt: 'मराठीत बहुविकल्पीय प्रश्न तयार करा. प्रत्येक प्रश्नामध्ये 4 पर्याय असावेत आणि स्पष्ट उत्तरे असावीत.',
        tutorPrompt: 'आप एक मदतगार AI ट्यूटर आहात. विद्यार्थ्यांच्या प्रश्नांची उत्तरे मराठीत स्पष्ट आणि प्रोत्साहक ढंगाने द्या.'
    }
};

// Get current language configuration
function getCurrentLanguageConfig(targetLang = null) {
    const currentLang = (targetLang || i18n.language || 'en').split('-')[0];
    return LANGUAGE_CONFIGS[currentLang] || LANGUAGE_CONFIGS.en;
}

export const multilingualAIService = {
    // Get supported languages
    getSupportedLanguages: () => {
        return Object.keys(LANGUAGE_CONFIGS).map(key => ({
            code: key,
            name: LANGUAGE_CONFIGS[key].name
        }));
    },

    // 1. Generate Summaries in multiple languages
    generateSummary: async (text, targetLanguage = null) => {
        if (!text) return "No content to summarize.";
        
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${config.systemPrompt} 
                        ${config.summaryPrompt}
                        IMPORTANT: You MUST write the summary in ${config.name} ONLY.`
                    },
                    {
                        role: "user",
                        content: `Summarize this text in ${config.name}: ${text}`
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

    // 2. Generate Quiz in multiple languages
    generateQuiz: async (text, targetLanguage = null) => {
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${config.systemPrompt} 
                        ${config.quizPrompt}
                        IMPORTANT: You MUST generate EXACTLY 3 questions.
                        IMPORTANT: You MUST generate the questions, options, and explanations in ${config.name} ONLY.
                        Return ONLY a valid JSON object with this exact structure:
                        {
                          "quiz": [
                            {
                              "question": "Question text here in ${config.name}?",
                              "options": ["Option A in ${config.name}", "Option B in ${config.name}", "Option C in ${config.name}", "Option D in ${config.name}"],
                              "correctAnswer": 0
                            }
                          ]
                        }
                        Where correctAnswer is the index (0-3) of the correct option.`
                    },
                    {
                        role: "user",
                        content: `Generate exactly 3 multiple-choice questions in ${config.name} based on this text:\n\n${text}`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.2, // Lower temperature for more consistent language adherence
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0]?.message?.content;
            try {
                const parsed = JSON.parse(content);
                const quizArray = Array.isArray(parsed) ? parsed : (parsed.quiz || parsed.questions || []);

                return quizArray.map(q => ({
                    question: q.question || q.q,
                    options: q.options || [],
                    correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0
                })).slice(0, 3);
            } catch {
                return [];
            }
        } catch (error) {
            console.error("AI Error:", error);
            return [];
        }
    },

    // 3. AI Tutor Chat Response in multiple languages
    getTutorResponse: async (context, userQuestion, targetLanguage = null) => {
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${config.tutorPrompt} 
                        Context of discussion: ${context}. 
                        Answer the student's doubt simply and encouragingly. Be brief. ${config.groqPrompt}`
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

    // 4. Transcribe Audio with language detection
    transcribeAudio: async (audioUrl, targetLanguage = null) => {
        if (!audioUrl) return "";
        
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const transcript = await aai.transcripts.transcribe({
                audio_url: audioUrl,
                language_code: config.assemblyCode,
                punctuate: true,
                format_text: true
            });
            return transcript.text || "No transcription available.";
        } catch (error) {
            console.error("AssemblyAI Error:", error);
            return `Error transcribing audio: ${error.message}`;
        }
    },

    // 5. Generate Flashcards in multiple languages
    generateFlashcards: async (text, targetLanguage = null) => {
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${config.systemPrompt} Generate flashcards from the provided text in ${config.name}.
                        Return ONLY a valid JSON array of objects with this exact structure:
                        [
                          {
                            "front": "Term or concept here",
                            "back": "Definition or explanation here"
                          }
                        ]`
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

            const content = completion.choices[0]?.message?.content;
            try {
                const parsed = JSON.parse(content);
                return Array.isArray(parsed) ? parsed : (parsed.flashcards || []);
            } catch {
                return [];
            }
        } catch (error) {
            console.error("AI Error:", error);
            return [];
        }
    },

    // 6. Language-specific educational insights
    generateEducationalInsights: async (transcript, confusionLevel, targetLanguage = null) => {
        const config = getCurrentLanguageConfig(targetLanguage);
        
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `${config.systemPrompt} Analyze the classroom transcript and provide teaching insights in ${config.name}.
                        Consider the current confusion level: ${confusionLevel}/100.
                        Provide suggestions for:
                        1. Teaching pace adjustments
                        2. Topics that need clarification
                        3. Engagement strategies
                        4. Quick comprehension checks`
                    },
                    {
                        role: "user",
                        content: transcript
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.6,
                max_tokens: 300,
            });
            return completion.choices[0]?.message?.content || "No insights available.";
        } catch (error) {
            console.error("AI Error:", error);
            return "Error generating insights.";
        }
    }
};

// Export the enhanced AI service that replaces the original
export default multilingualAIService;
