# 🎓 EduSenseH – Making Online Learning Smarter

EduSenseH is an AI-powered learning platform designed to make online classes more interactive, accessible, and helpful for both students and teachers.

It started as a project for a fast-paced hackathon where the goal was simple: turn passive online lectures into active learning experiences. Instead of students struggling to keep up with long lectures or scattered notes, EduSenseH uses real-time AI to capture, organize, and simplify learning content automatically.

---

## ✨ Why EduSenseH?

EduSenseH goes beyond basic video calls. It acts like an intelligent assistant for your classroom.

### 🎙️ Live Transcription
Every lecture is transcribed in real time using AssemblyAI, making it easy for students to follow along and revisit key points later.

### 🧠 AI-Generated Learning Tools
Using the LLaMA-3.3-70B model via Groq, the system analyzes lecture transcripts and automatically creates helpful study materials such as:

- **Quick Summaries** – Turn long lectures into short, easy-to-review summaries.
- **Practice Quizzes** – AI generates MCQs from the lecture content.
- **Flashcards** – Key concepts are extracted for quick revision.

### 🤖 Context-Aware AI Tutor
Students can ask questions anytime. The built-in AI tutor understands the lecture context and learning resources to provide clear and helpful explanations.

### 📄 Smart Resource Hub
Upload PDFs or Word documents and let the system summarize and break them down into digestible insights.

### 💬 Community Learning
EduSenseH keeps discussions alive even after class with group chats and archived sessions.

---

## 🛠 Tech Stack

EduSenseH combines modern web technologies with powerful AI tools.

**Frontend**
- React 19  
- Vite  
- Tailwind CSS v4  

**Backend & Realtime**
- Supabase (Authentication, Database, Realtime)

**AI & Intelligence**
- Groq SDK running the LLaMA-3.3-70B model

**Speech Processing**
- AssemblyAI for streaming and batch transcription

**UI**
- Lucide React icons

---

## 🚀 Getting Started

To run EduSenseH locally, follow these steps.

### 1. Clone the Repository

git clone https://github.com/your-repo/EduSenseH.git  
cd EduSenseH  
npm install

### 2. Set Up Environment Variables

Create a `.env` file in the root directory and add your API keys:

VITE_SUPABASE_URL=your_supabase_url  
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key  
VITE_GROQ_API_KEY=your_groq_api_key  
VITE_ASSEMBLYAI_API_KEY=your_assemblyai_api_key  

### 3. Start the Development Server

npm run dev

Then open:

http://localhost:5173

---

## 💡 How EduSenseH Works

1. **Create or Join a Group**  
Students and teachers can join subject-specific learning groups.

2. **Start a Live Class**  
Teachers start a session while the AI listens and transcribes the lecture in real time.

3. **Automatic Study Materials**  
After the session ends, the transcript is saved. Students can instantly generate summaries, quizzes, or flashcards.

4. **Interactive Resources**  
Upload study material like research papers or notes and use the AI to summarize or explain them.

---

## 🤝 Contributing

Contributions are always welcome.

If you have ideas, bug fixes, or improvements:
- Open an issue
- Submit a pull request

We’d love to see what you build with EduSenseH.

---

## 📜 License

This project is released under the MIT License.  
See the `LICENSE` file for more details.

---

Built for students, teachers, and anyone who believes learning should be smarter and more accessible.
