import Groq from "groq-sdk";
import { AssemblyAI } from 'assemblyai';
import multilingualAIService from './multilingualAI.js';

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
    // Legacy methods for backward compatibility (now using multilingual service)
    generateSummary: async (text, targetLanguage = null) => {
        return await multilingualAIService.generateSummary(text, targetLanguage);
    },

    generateQuiz: async (text, targetLanguage = null) => {
        return await multilingualAIService.generateQuiz(text, targetLanguage);
    },

    getTutorResponse: async (context, userQuestion, targetLanguage = null) => {
        return await multilingualAIService.getTutorResponse(context, userQuestion, targetLanguage);
    },

    transcribeAudio: async (audioUrl, targetLanguage = null) => {
        return await multilingualAIService.transcribeAudio(audioUrl, targetLanguage);
    },

    // New multilingual methods
    generateFlashcards: async (text, targetLanguage = null) => {
        return await multilingualAIService.generateFlashcards(text, targetLanguage);
    },

    generateEducationalInsights: async (transcript, confusionLevel, targetLanguage = null) => {
        return await multilingualAIService.generateEducationalInsights(transcript, confusionLevel, targetLanguage);
    },

    getSupportedLanguages: () => {
        return multilingualAIService.getSupportedLanguages();
    },

    // AssemblyAI real-time transcriber (for backward compatibility)
    createRealtimeTranscriber: () => {
        return aai.realtime.transcriber({ sampleRate: 16000 });
    },
};

// Export the multilingual service as default
export default multilingualAIService;