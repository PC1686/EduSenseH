// [HACKATHON TIMELINE] STEP 8 (Hour 14) - Core "Magic" (Live Class & AI Real-time)
import React, { useState, useEffect, useRef } from "react";

import { useParams, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

import { supabase } from "../lib/supabase";

import { aiService } from "../lib/ai";

import { startLiveTranscription } from "../lib/liveTranscription";

import {
  startAudioRecording,
  stopAudioRecording,
  cancelAudioRecording,
  uploadAudioToSupabase,
  updateSessionRecordingPath,
} from "../lib/audioRecorder";

const JITSI_BASE = "https://meet.jit.si";

function getMeetingRoomFromUrl(url) {
  if (!url) return "";

  try {
    const path = new URL(url).pathname;

    return path.replace(/^\/+|\/+$/g, "") || "";
  } catch {
    return url;
  }
}

function LiveClass() {
  const { userData } = useAuth();

  const { id } = useParams(); // Group ID

  const navigate = useNavigate();

  const role = userData?.role || "student";

  // Live session state

  const [meetingUrl, setMeetingUrl] = useState("");

  const [transcript, setTranscript] = useState("");

  const [isRecording, setIsRecording] = useState(false);

  const [interimTranscript, setInterimTranscript] = useState("");

  const [transcriptionStatus, setTranscriptionStatus] = useState("Idle");

  // Intelligence State

  const [doubtText, setDoubtText] = useState("");

  const [doubts, setDoubts] = useState([]);

  const [currentLiveSessionId, setCurrentLiveSessionId] = useState(null);

  const [currentTopic, setCurrentTopic] = useState("General Discussion");

  const [teachingCues, setTeachingCues] = useState([]);

  const [aiSummary, setAiSummary] = useState("");

  // Poll & Intel State

  const [activePoll, setActivePoll] = useState(null);

  const [pollResponses, setPollResponses] = useState([]);

  const [confusionLevel, setConfusionLevel] = useState(10); // 0-100

  const [topicClarity, setTopicClarity] = useState([
    { name: "Concept Introduction", clarity: 92 },

    { name: "Core Application", clarity: 64 },

    { name: "Advanced Analysis", clarity: 38 },
  ]);

  const [aiInsight, setAiInsight] = useState(
    "Students are showing slight confusion about the current concept. Consider a quick re-explanation of the core principle.",
  );

  // Meeting Setup State

  const [createdMeetingUrl, setCreatedMeetingUrl] = useState("");

  const [modal, setModal] = useState(null); // 'create' | 'join' | 'setup' | 'rollnumber'

  const [joinUrlInput, setJoinUrlInput] = useState("");

  const [sessionStartTime, setSessionStartTime] = useState(null);

  // Live Class Form State (for teacher)

  const [classTopic, setClassTopic] = useState("");

  const [classDuration, setClassDuration] = useState(60);

  const [classDescription, setClassDescription] = useState("");

  // Active Live Sessions State (for students)

  const [activeLiveSessions, setActiveLiveSessions] = useState([]);

  const [selectedSession, setSelectedSession] = useState(null);

  const [rollNumber, setRollNumber] = useState("");

  // Audio Recording State (for teacher)

  const [isAudioRecording, setIsAudioRecording] = useState(false);

  const [audioRecordingStatus, setAudioRecordingStatus] = useState("Idle"); // 'Recording', 'Uploading', 'Error', 'Idle'

  const [recordingError, setRecordingError] = useState(null);

  // Refs

  const recognitionRef = useRef(null);

  const transcriptBufferRef = useRef(""); // Buffer for AI processing

  const isRecordingRef = useRef(false); // Track recording state for restarts

  const [isHost, setIsHost] = useState(false);

  const liveChannelRef = useRef(null);

  const activeGroupIdRef = useRef(null);

  const isHostRef = useRef(false);

  const transcriptionStatusRef = useRef("Idle");

  const interimTranscriptRef = useRef("");

  const lastFinalTextRef = useRef(""); // Track last final text to avoid duplicates

  const currentLiveSessionIdRef = useRef(null); // Keep ref in sync with state

  const processedChunkIdsRef = useRef(new Set()); // Deduplication tracker for students

  const [channelStatus, setChannelStatus] = useState("disconnected");

  // Student-only: live summary of teacher's transcript (updated periodically)

  const [liveSummary, setLiveSummary] = useState("");

  const [liveSummaryLoading, setLiveSummaryLoading] = useState(false);

  const lastSummarizedLenRef = useRef(0);

  const summaryTimeoutRef = useRef(null);

  // Helper for robust broadcasting

  const sendBroadcast = (event, payload) => {
    if (!liveChannelRef.current) {
      console.warn(
        `[LiveClass] Cannot broadcast ${event}: channel not initialized`,
      );
      return;
    }

    // Checking if channel is joined to avoid the "Realtime send() is automatically falling back to REST API" warning.
    // If not joined, we log it. In a production app, we might queue these.
    if (liveChannelRef.current.state !== 'joined') {
      console.warn(`[LiveClass] Channel state is "${liveChannelRef.current.state}". Broadcast for "${event}" might fall back to REST or fail.`);
    }

    liveChannelRef.current
      .send({
        type: "broadcast",
        event,
        payload,
      })
      .then((status) => {
        if (status !== 'ok') {
          console.group(`[LiveClass] Broadcast "${event}" status: ${status}`);
          console.log("Payload:", payload);
          console.groupEnd();
        }
      })
      .catch((err) => {
        console.error(`[LiveClass] ${event} broadcast failed:`, err);
      });
  };

  // Sync currentLiveSessionId to ref for use in broadcast listeners

  useEffect(() => {
    currentLiveSessionIdRef.current = currentLiveSessionId;
  }, [currentLiveSessionId]);

  // Cleanup Effect: Stop audio recording if component unmounts

  useEffect(() => {
    return () => {
      if (isAudioRecording) {
        console.log(
          "[LiveClass] Component unmounting - stopping audio recording",
        );

        cancelAudioRecording();
      }
    };
  }, [isAudioRecording]);

  // Safety-net: If teacher (host) closes tab or navigates away while session is active,

  // automatically mark the live_session as ended so it disappears for students.

  useEffect(() => {
    if (!isHostRef.current || !currentLiveSessionId) return;

    const markSessionEnded = () => {
      // Use sendBeacon for reliability on page unload

      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_sessions?id=eq.${currentLiveSessionId}`;

      const body = JSON.stringify({ status: "ended", teacher_joined: false });

      navigator.sendBeacon(
        url + "&apikey=" + import.meta.env.VITE_SUPABASE_ANON_KEY,

        new Blob([body], { type: "application/json" }),
      );
    };

    window.addEventListener("beforeunload", markSessionEnded);

    // Also clean up on component unmount (e.g., React navigation)

    return () => {
      window.removeEventListener("beforeunload", markSessionEnded);

      // If host session is still active when component unmounts, end it

      if (currentLiveSessionIdRef.current) {
        supabase

          .from("live_sessions")

          .update({ status: "ended", teacher_joined: false })

          .eq("id", currentLiveSessionIdRef.current)

          .then(() =>
            console.log(
              "[LiveClass] Auto-ended session on unmount:",
              currentLiveSessionIdRef.current,
            ),
          )

          .catch((err) =>
            console.warn("[LiveClass] Could not auto-end session:", err),
          );
      }
    };
  }, [currentLiveSessionId]);

  // 3. Real-time Doubts - Filter by current live session

  useEffect(() => {
    if (!id || !currentLiveSessionId) return;

    const fetchDoubts = async () => {
      const { data, error } = await supabase

        .from("doubts")

        .select("*")

        .eq("session_id", currentLiveSessionId)

        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        const userIds = [
          ...new Set(data.map((d) => d.user_id).filter(Boolean)),
        ];

        let profileMap = {};

        if (userIds.length > 0) {
          const { data: profiles } = await supabase

            .from("profiles")

            .select("id, full_name, email")

            .in("id", userIds);

          if (profiles) {
            profiles.forEach((p) => {
              profileMap[p.id] = p;
            });
          }
        }

        setDoubts(
          data.map((d) => ({
            id: d.id,

            text: d.text,

            timestamp: new Date(d.created_at),

            student_name:
              profileMap[d.user_id]?.full_name ||
              profileMap[d.user_id]?.email ||
              d.student_name ||
              "Anonymous",
          })),
        );
      } else {
        setDoubts([]);
      }
    };

    fetchDoubts();

    const channel = supabase

      .channel(`doubts_${currentLiveSessionId}`)

      .on(
        "postgres_changes",
        {
          event: "INSERT",

          schema: "public",

          table: "doubts",

          filter: `session_id=eq.${currentLiveSessionId}`,
        },
        (payload) => {
          if (payload.new.session_id === currentLiveSessionId) {
            console.log(
              "[Doubt] postgres_changes INSERT received:",
              payload.new,
            );

            // Check if doubt already exists to prevent duplicates

            (async () => {
              let finalName = payload.new.student_name || "Anonymous";

              // If teacher: try to fetch profile name if DB insert didn't have it
              if (
                isHostRef.current &&
                (finalName === "Anonymous" || !finalName) &&
                payload.new.user_id
              ) {
                try {
                  const { data: profile } = await supabase
                    .from("profiles")
                    .select("full_name, email")
                    .eq("id", payload.new.user_id)
                    .single();
                  if (profile)
                    finalName =
                      profile.full_name || profile.email || "Anonymous";
                } catch (e) {
                  console.warn("[Doubt] Profile fetch failed:", e);
                }
              }

              setDoubts((prev) => {
                const existingDoubtIdx = prev.findIndex(
                  (d) => d.id === payload.new.id,
                );
                if (existingDoubtIdx !== -1) {
                  if (
                    prev[existingDoubtIdx].student_name === "Anonymous" &&
                    finalName !== "Anonymous"
                  ) {
                    const next = [...prev];
                    next[existingDoubtIdx] = {
                      ...next[existingDoubtIdx],
                      student_name: finalName,
                    };
                    return next;
                  }
                  return prev;
                }
                return [
                  {
                    id: payload.new.id,
                    text: payload.new.text,
                    timestamp: new Date(payload.new.created_at),
                    student_name: finalName,
                  },
                  ...prev,
                ];
              });
            })();
          }

          if (isHostRef.current) {
            setConfusionLevel((prev) => {
              const newLevel = Math.min(100, prev + 10);

              sendBroadcast("ai_update", { confusionLevel: newLevel });

              return newLevel;
            });
          }
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, role, currentLiveSessionId]);

  // 0. Determine Host Status & Setup Sync Channel

  useEffect(() => {
    if (!id || !userData?.id) return;

    // Prevent redundant initializations only if the current channel is actually joined/joining
    if (activeGroupIdRef.current === id && liveChannelRef.current &&
      (liveChannelRef.current.state === 'joined' || liveChannelRef.current.state === 'joining')) {
      return;
    }

    console.log("[LiveClass] Initializing channel for group:", id);

    activeGroupIdRef.current = id;

    const checkHost = async () => {
      try {
        const { data } = await supabase
          .from("groups")
          .select("created_by")
          .eq("id", id)
          .single();

        if (data?.created_by === userData.id || userData.role === "teacher") {
          setIsHost(true);

          isHostRef.current = true;
        }
      } catch (err) {
        console.error("Error checking host status:", err);
      }
    };

    checkHost();

    fetchActiveLiveSessions();

    const channel = supabase
      .channel(`live_session_${id}`, {
        config: {
          broadcast: { self: false }, // Removed ack: true as it can cause connection hanging in some environments
        },
      })

      .on("broadcast", { event: "transcript_chunk" }, (payload) => {
        const data = payload.payload;
        if (data.id && processedChunkIdsRef.current.has(data.id)) return;

        if (data.id) processedChunkIdsRef.current.add(data.id);
        setTranscript((prev) => prev + (data.text || ""));

        setTranscriptionStatus("Live");
      })

      .on("broadcast", { event: "transcription_status" }, (payload) => {
        setTranscriptionStatus(payload.payload?.status || "Idle");
      })

      .on("broadcast", { event: "ai_update" }, (payload) => {
        const data = payload.payload;

        if (data.confusionLevel !== undefined)
          setConfusionLevel(data.confusionLevel);

        if (data.topicClarity) setTopicClarity(data.topicClarity);
      })

      .on("broadcast", { event: "poll_launched" }, (payload) => {
        setActivePoll(payload.payload);

        setPollResponses([]);
      })

      .on("broadcast", { event: "live_session_started" }, (payload) => {
        fetchActiveLiveSessions();
      })

      .on("broadcast", { event: "live_session_ended" }, (payload) => {
        setActiveLiveSessions((prev) =>
          prev.filter((s) => s.id !== payload.payload?.sessionId),
        );
      })

      .on("broadcast", { event: "poll_response" }, (payload) => {
        const response = payload.payload;

        setPollResponses((prev) => [...prev, response]);

        if (isHostRef.current) {
          setConfusionLevel((prev) => {
            const answerStr = (response.answer || "").toLowerCase();
            const isNegative =
              answerStr === "no" ||
              answerStr.includes("confused") ||
              answerStr.includes("not clear") ||
              answerStr.includes("somewhat");

            const newLevel = isNegative
              ? Math.min(100, prev + 8)
              : Math.max(0, prev - 5);

            return newLevel;
          });
        }
      })

      .on("broadcast", { event: "poll_closed" }, () => {
        setActivePoll(null);
      })

      .on("broadcast", { event: "doubt_raised" }, (msg) => {
        console.log("[Doubt] Received broadcast:", msg);

        const payload = msg.payload;

        console.log(
          "[Doubt] Checking session match:",
          payload.live_session_id,
          "===",
          currentLiveSessionIdRef.current,
        );

        if (payload.live_session_id === currentLiveSessionIdRef.current) {
          console.log("[Doubt] Session match! Adding doubt");

          // Check if doubt already exists to prevent duplicates

          const bName = payload.student_name || "Anonymous";
          setDoubts((prev) => {
            const existingDoubtIdx = prev.findIndex((d) => d.id === payload.id);
            if (existingDoubtIdx !== -1) {
              if (
                prev[existingDoubtIdx].student_name === "Anonymous" &&
                bName !== "Anonymous"
              ) {
                const next = [...prev];
                next[existingDoubtIdx] = {
                  ...next[existingDoubtIdx],
                  student_name: bName,
                };
                return next;
              }
              return prev;
            }
            return [
              {
                id: payload.id,
                text: payload.text,
                timestamp: new Date(payload.created_at),
                student_name: bName,
              },
              ...prev,
            ];
          });
        }
      })

      .subscribe((status) => {
        console.log("[LiveClass] Channel status:", status);

        setChannelStatus(status);

        if (status === "CHANNEL_ERROR") {
          console.error(
            "[LiveClass] Channel subscription failed. Checking if Realtime is enabled in Supabase.",
          );
        }
      });

    liveChannelRef.current = channel;

    return () => {
      console.log("[LiveClass] Cleaning up channel for group:", id);

      supabase.removeChannel(channel);
      liveChannelRef.current = null; // CRITICAL: Clear ref so next init can run

      setChannelStatus("disconnected");
    };
  }, [id, userData?.id]);

  // Subscribe to transcript_chunks table changes (for reliable student transcript sync)

  useEffect(() => {
    if (!currentLiveSessionId) return;

    if (role === "teacher") return; // Teachers don't need to subscribe to their own chunks

    console.log(
      "[Student] Subscribing to transcript_chunks for session:",
      currentLiveSessionId,
    );

    const transcriptChannel = supabase

      .channel(`transcript_${currentLiveSessionId}`)

      .on(
        "postgres_changes",

        {
          event: "INSERT",

          schema: "public",

          table: "transcript_chunks",

          filter: `session_id=eq.${currentLiveSessionId}`,
        },

        (payload) => {
          const chunk = payload.new;

          if (chunk.id && processedChunkIdsRef.current.has(chunk.id)) {
            console.log("[Student] Deduplicated DB chunk:", chunk.id);
            return;
          }

          console.log(
            "[Student] Received transcript from database:",
            chunk?.text?.substring(0, 50),
          );

          if (chunk?.text) {
            if (chunk.id) processedChunkIdsRef.current.add(chunk.id);
            setTranscript((prev) => prev + chunk.text);

            setTranscriptionStatus("Live");
          }
        },
      )

      .subscribe((status) => {
        console.log(
          `[Student] Transcript channel ${currentLiveSessionId} status:`,
          status,
        );
      });

    return () => {
      supabase.removeChannel(transcriptChannel);
    };
  }, [id, currentLiveSessionId, role]);

  // 1. Live transcription (AssemblyAI Streaming v3) – host only

  useEffect(() => {
    if (!isHostRef.current || !isRecording) return;

    let controller = null;

    const apiKey = import.meta.env.VITE_ASSEMBLYAI_API_KEY;

    startLiveTranscription(apiKey, {
      onStatus: (status) => {
        transcriptionStatusRef.current = status;

        setTranscriptionStatus(status);

        // Broadcast status to students

        console.log("[Teacher] Broadcasting status:", status);

        sendBroadcast("transcription_status", { status });
      },

      onPartial: (text) => {
        interimTranscriptRef.current = text || "";

        setInterimTranscript(text);
      },

      onFinal: (text) => {
        interimTranscriptRef.current = "";

        setInterimTranscript("");

        const finalText = text && text.trim() ? text.trim() : "";

        if (!finalText) return;

        // Avoid duplicate: check if this final text was already added

        const lastFinal = lastFinalTextRef.current.toLowerCase().trim();

        const currentFinal = finalText.toLowerCase().trim();

        // Improved duplicate check: strip punctuation/spaces for comparison

        const normalize = (s) =>
          s
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();

        const lastNormalized = normalize(lastFinal);

        const currentNormalized = normalize(currentFinal);

        if (lastNormalized === currentNormalized && lastNormalized.length > 0) {
          console.log(
            "[Teacher] Skipping duplicate/formatted version:",
            finalText.substring(0, 50),
          );

          return;
        }

        const cleanChunk = finalText + " ";
        const chunkId = crypto.randomUUID();

        setTranscript((prev) => prev + cleanChunk);

        transcriptBufferRef.current += cleanChunk;

        lastFinalTextRef.current = finalText;

        console.log(
          "[Teacher] Broadcasting transcript:",
          cleanChunk.substring(0, 50),
        );

        sendBroadcast("transcript_chunk", { id: chunkId, text: cleanChunk });

        // Save to database for reliable delivery to students (with error handling)

        if (currentLiveSessionId) {
          (async () => {
            const { error } = await supabase

              .from("transcript_chunks")

              .insert({
                id: chunkId,

                session_id: currentLiveSessionId,

                group_id: id,

                text: cleanChunk,

                created_by: userData?.id,
              });

            if (error) {
              console.error(
                "[Teacher] Failed to save transcript chunk to DB:",
                error,
              );
            } else {
              console.log(
                "[Teacher] Transcript chunk saved to DB:",
                cleanChunk.substring(0, 30),
              );
            }
          })();
        }

        if (transcriptBufferRef.current.length > 500) {
          analyzeTranscript(transcriptBufferRef.current);

          transcriptBufferRef.current = "";
        }
      },
    })
      .then((c) => {
        controller = c;

        recognitionRef.current = {
          stop: () => {
            isRecordingRef.current = false;

            controller?.stop();
          },
        };
      })

      .catch((err) => {
        console.error("[LiveClass] Transcription start failed:", err);

        setTranscriptionStatus("Error");

        setIsRecording(false);

        isRecordingRef.current = false;
      });

    return () => {
      isRecordingRef.current = false;

      controller?.stop();
    };
  }, [isHost, isRecording]);

  // 2. AI Analysis Function

  const analyzeTranscript = async (textSegment) => {
    console.log("Analyzing transcript segment...");

    // a) Generate Cues

    const cuePrompt = `Analyze this class transcript segment: "${textSegment}". 







        Provide 2 short teaching cues or questions the teacher should ask to check understanding.`;

    const cues = await aiService.generateSummary(cuePrompt);

    let newTopic = currentTopic;

    // b) Detect Topic

    if (currentTopic === "General Discussion") {
      const topic = await aiService.generateSummary(
        `Identify the main academic topic in 3 words: "${textSegment}"`,
      );

      if (topic) newTopic = topic.replace(/\.$/, "");
    }

    if (cues || newTopic !== currentTopic) {
      const cueList = cues
        ? cues
          .split("\n")
          .filter((line) => line.length > 5)
          .slice(0, 2)
        : teachingCues;

      // Generate Pedagogical Insight

      const insightPrompt = `Based on these cues: "${cueList.join(", ")}", provide a 1-sentence pedagogical suggestion for the teacher to improve student clarity.`;

      const insight = await aiService.generateSummary(insightPrompt);

      setTeachingCues(cueList);

      setCurrentTopic(newTopic);

      setAiInsight(insight);

      // Sync AI state with students

      sendBroadcast("ai_update", {
        cues: cueList,

        topic: newTopic,

        insight,

        confusionLevel,

        topicClarity,
      });
    }
  };

  // Meeting Handlers

  const handleStartMeeting = async () => {
    console.log(
      "[handleStartMeeting] Starting meeting. isHost:",
      isHost,
      "isHostRef:",
      isHostRef.current,
    );

    setModal(null);

    setMeetingUrl(createdMeetingUrl);

    setSessionStartTime(new Date());

    // Force host status for creator (they just created the meeting)

    if (!isHostRef.current) {
      console.log(
        "[handleStartMeeting] Setting isHost to true since we're creating the meeting",
      );

      setIsHost(true);

      isHostRef.current = true;
    }

    // Mark teacher as joined in DB so students can now see the session

    if (currentLiveSessionId) {
      try {
        await supabase

          .from("live_sessions")

          .update({ teacher_joined: true })

          .eq("id", currentLiveSessionId);

        console.log(
          "[handleStartMeeting] Marked teacher_joined=true for session:",
          currentLiveSessionId,
        );

        // Notify students that session is now visible

        sendBroadcast("live_session_started", {
          sessionId: currentLiveSessionId,
          topic: currentTopic,
          meetingUrl: createdMeetingUrl,
        });
      } catch (err) {
        console.error(
          "[handleStartMeeting] Failed to mark teacher_joined:",
          err,
        );
      }
    }

    // Reset duplicate tracking for new session

    lastFinalTextRef.current = "";

    // Start Transcription via state change

    console.log("[handleStartMeeting] Setting isRecording to true");

    setIsRecording(true);

    isRecordingRef.current = true;
  };

  const handleJoinMeeting = () => {
    setJoinUrlInput("");
    setModal("join");
  };

  const handleJoinWithUrl = async () => {
    const trimmed = joinUrlInput.trim();

    if (!trimmed) return;

    let url = trimmed;

    if (!trimmed.startsWith("http")) {
      url = `${JITSI_BASE}/${trimmed.replace(/^\/+/, "")}`;
    }

    try {
      // Extract room ID from URL and find the live session

      const roomId = url.split("/").pop();

      const { data: session } = await supabase

        .from("live_sessions")

        .select("id, topic")

        .eq("meeting_url", url)

        .single();

      if (session) {
        // If we found a matching session, set its ID

        setCurrentLiveSessionId(session.id);

        setCurrentTopic(session.topic || "Class Discussion");
      }
    } catch (err) {
      console.log(
        "[LiveClass] Could not find session by URL (non-critical):",
        err,
      );
    }

    setModal(null);

    setMeetingUrl(url);

    setSessionStartTime(new Date());

    // Students no longer start transcription locally
  };

  const handleCopyMeetingUrl = async () => {
    await navigator.clipboard.writeText(createdMeetingUrl);

    alert("Copied!");
  };

  // Live Session Functions

  const fetchActiveLiveSessions = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase

        .from("live_sessions")

        .select("*")

        .eq("group_id", id)

        .eq("status", "active")

        .eq("teacher_joined", true) // Only show sessions where teacher has actually joined

        .order("created_at", { ascending: false });

      if (error) throw error;

      setActiveLiveSessions(data || []);
    } catch (err) {
      console.error("Error fetching live sessions:", err);
    }
  };

  const handleCreateMeeting = () => {
    // Show setup modal first (teacher needs to enter topic, duration, etc.)

    setClassTopic("");

    setClassDuration(60);

    setClassDescription("");

    setModal("setup");
  };

  const handleSetupClass = async () => {
    if (!classTopic.trim()) {
      alert("Please enter a topic name");

      return;
    }

    // Generate meeting URL

    const roomId = "EduSense-" + Math.random().toString(36).substring(2, 10);

    const url = `${JITSI_BASE}/${roomId}`;

    try {
      // Save live session to database

      const { data, error } = await supabase

        .from("live_sessions")

        .insert({
          group_id: id,

          topic: classTopic,

          duration_minutes: classDuration,

          description: classDescription,

          meeting_url: url,

          status: "active",

          created_by: userData?.id,

          created_by_name: userData?.name || "Teacher",
        })

        .select()

        .single();

      if (error) throw error;

      setCurrentLiveSessionId(data.id);

      setCreatedMeetingUrl(url);

      setCurrentTopic(classTopic);

      // Start audio recording for teacher (only teachers record)

      if (role === "teacher") {
        try {
          console.log(
            "[LiveClass] Starting teacher audio recording for session:",
            data.id,
          );

          await startAudioRecording((status) => {
            setAudioRecordingStatus(status);

            console.log("[LiveClass] Audio recording status:", status);
          });

          setIsAudioRecording(true);

          setRecordingError(null);
        } catch (audioErr) {
          console.error(
            "[LiveClass] Failed to start audio recording:",
            audioErr,
          );

          setRecordingError(audioErr.message);

          setAudioRecordingStatus("Error");

          // Don't fail the entire class creation - recording is optional

          alert(
            "Warning: Could not start audio recording. Class will continue without recording: " +
            audioErr.message,
          );
        }
      }

      // Broadcast to all students in the group

      // Broadcast to all students in the group

      sendBroadcast("live_session_started", {
        sessionId: data.id,
        topic: classTopic,
        meetingUrl: url,
      });

      setModal("create");
    } catch (err) {
      console.error("Error creating live session:", err);

      alert("Failed to create live session. Please try again.");
    }
  };

  const handleJoinSessionClick = (session) => {
    setSelectedSession(session);

    setRollNumber("");

    setModal("rollnumber");
  };

  const handleJoinWithRollNumber = async () => {
    if (!rollNumber.trim()) {
      alert("Please enter your roll number");

      return;
    }

    if (!selectedSession) return;

    try {
      // Record student attendance with roll number

      const { error } = await supabase

        .from("live_session_attendees")

        .insert({
          live_session_id: selectedSession.id,

          user_id: userData?.id,

          roll_number: rollNumber,

          student_name:
            userData?.full_name ||
            userData?.name ||
            userData?.email ||
            "Unknown",
        });

      if (error) {
        // If already joined, just continue

        if (!error.message.includes("duplicate")) {
          throw error;
        }
      }

      setModal(null);

      setMeetingUrl(selectedSession.meeting_url);

      setSessionStartTime(new Date());

      setCurrentTopic(selectedSession.topic);

      setCurrentLiveSessionId(selectedSession.id);
    } catch (err) {
      console.error("Error joining session:", err);

      alert("Failed to join session. Please try again.");
    }
  };

  // Poll Handlers

  const handleLaunchPoll = () => {
    const poll = {
      id: Math.random().toString(36).substring(7),

      question: `Are you clear about "${currentTopic}"?`,

      options: ["Yes, crystal clear", "Somewhat", "I am confused"],
    };

    setActivePoll(poll);

    setPollResponses([]);

    sendBroadcast("poll_launched", poll);
    console.log("[Poll] Launched:", poll);
  };

  const handleStopPoll = () => {
    setActivePoll(null);
    sendBroadcast("poll_closed", { pollId: activePoll?.id });
    console.log("[Poll] Stopped");
  };

  const handleRespondPoll = (answer) => {
    const response = {
      answer,

      studentId: userData?.id,

      timestamp: new Date(),
    };

    setActivePoll(null); // Close for student

    sendBroadcast("poll_response", response);
  };

  // Student-only: update live summary when transcript grows (debounced)

  useEffect(() => {
    if (role !== "student" || !transcript || transcript.length < 300) return;

    const len = transcript.length;

    if (len - lastSummarizedLenRef.current < 400) return;

    if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);

    summaryTimeoutRef.current = setTimeout(async () => {
      lastSummarizedLenRef.current = len;

      setLiveSummaryLoading(true);

      try {
        const summary = await aiService.generateSummary(
          `Summarize these class notes in 3–5 short bullet points. Keep it clear for students.\n\n${transcript}`,
        );

        if (summary) setLiveSummary(summary);
      } catch (e) {
        console.warn("Live summary error:", e);
      } finally {
        setLiveSummaryLoading(false);
      }
    }, 2500);

    return () => {
      if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
    };
  }, [role, transcript]);

  const handleRaiseDoubt = async () => {
    if (!doubtText.trim() || !currentLiveSessionId) return;

    // Generate a consistent UUID for all synchronization methods

    const doubtId = crypto.randomUUID();

    const now = new Date();

    const doubtToAdd = {
      id: doubtId,

      text: doubtText.trim(),

      timestamp: now,

      student_name:
        userData?.full_name || userData?.name || userData?.email || "Anonymous",
    };

    console.log("[Doubt] Raising doubt:", doubtToAdd.text);

    try {
      // Optimistic update

      setDoubts((prev) => [doubtToAdd, ...prev]);

      setDoubtText("");

      // Insert with the same ID to allow deduplication in real-time listeners

      const { error } = await supabase.from("doubts").insert({
        id: doubtId,

        group_id: id,

        session_id: currentLiveSessionId,

        user_id: userData?.id,

        text: doubtToAdd.text,
      });

      if (error) throw error;

      // Broadcast for instant sync to others, using the same ID

      sendBroadcast("doubt_raised", {
        id: doubtId,

        text: doubtToAdd.text,

        created_at: now.toISOString(),

        live_session_id: currentLiveSessionId,

        student_name: doubtToAdd.student_name,
      });
    } catch (err) {
      console.error("Error raising doubt:", err);

      // Rollback optimistic update on error

      setDoubts((prev) => prev.filter((d) => d.id !== doubtId));

      setDoubtText(doubtToAdd.text);

      alert("Failed to send doubt.");
    }
  };

  const handleEndClass = async () => {
    if (!window.confirm("End class and save to Archive?")) return;

    // Stop services

    isRecordingRef.current = false;

    if (recognitionRef.current) recognitionRef.current.stop();

    lastFinalTextRef.current = ""; // Reset duplicate tracking

    setIsRecording(false);

    // Stop audio recording for teacher

    let uploadedRecordingPath = null;

    if (isAudioRecording && role === "teacher") {
      try {
        console.log("[LiveClass] Stopping audio recording...");

        setAudioRecordingStatus("Uploading");

        const audioBlob = await stopAudioRecording();

        setIsAudioRecording(false);

        if (audioBlob && audioBlob.size > 0) {
          console.log("[LiveClass] Audio blob size:", audioBlob.size);

          // Upload to Supabase

          const uploadResult = await uploadAudioToSupabase(
            supabase,

            audioBlob,

            currentLiveSessionId,

            userData?.id,

            userData?.name || "Teacher",
          );

          if (uploadResult) {
            uploadedRecordingPath = uploadResult.path;

            console.log(
              "[LiveClass] Recording uploaded successfully:",
              uploadResult.path,
            );
          }
        }

        setAudioRecordingStatus("Idle");
      } catch (audioErr) {
        console.error("[LiveClass] Error stopping/uploading audio:", audioErr);

        setRecordingError(audioErr.message);

        setAudioRecordingStatus("Error");

        alert(
          "Warning: Could not finalize audio recording. Class will be archived without recording: " +
          audioErr.message,
        );
      }
    }

    // Generate Final Summary

    console.log(
      "Generating final summary from transcript:",
      transcript.substring(0, 100) + "...",
    );

    const finalSummary = await aiService.generateSummary(
      transcript || "No transcript available.",
    );

    console.log("Summary generated:", finalSummary?.substring(0, 100));

    try {
      // Save to Supabase

      const { error } = await supabase.from("sessions").insert({
        group_id: id,

        title: `${currentTopic} - Live Session`,

        description: finalSummary || "No summary generated.",

        start_time: sessionStartTime,

        end_time: new Date(),

        transcript: transcript,

        ai_summary: finalSummary,

        recording_path: uploadedRecordingPath, // Include recording path

        created_by: userData?.id, // Store teacher ID for access control

        live_session_id: currentLiveSessionId, // Link to live_sessions for attendance
      });

      if (error) throw error;

      // Mark live_session as ended so it disappears from student's active list

      if (currentLiveSessionId) {
        await supabase

          .from("live_sessions")

          .update({ status: "ended", teacher_joined: false })

          .eq("id", currentLiveSessionId);

        // Broadcast to students so their list updates instantly

        sendBroadcast("live_session_ended", {
          sessionId: currentLiveSessionId,
        });

        console.log(
          "[handleEndClass] Marked live_session as ended:",
          currentLiveSessionId,
        );
      }

      // Also update live_sessions with recording path if available

      if (uploadedRecordingPath && currentLiveSessionId) {
        await updateSessionRecordingPath(
          supabase,
          currentLiveSessionId,
          uploadedRecordingPath,
        );
      }

      alert("Class ended and archived successfully!");

      setMeetingUrl(""); // Return to landing

      navigate(`/ArchiveClass/${id}`); // Redirect to archive to show it working
    } catch (err) {
      console.error("Error archiving session:", err);

      alert("Error archiving session: " + err.message);
    }
  };

  const handleLeaveClass = () => {
    setMeetingUrl(""); // Just leave
  };

  // --- RENDER ---

  // Landing State

  if (!meetingUrl) {
    return (
      <div className="flex-1 p-4 overflow-hidden bg-slate-50">
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-100px)] gap-6 animate-fade-in">
          <h1 className="m-0 text-4xl text-[#1976d2] font-bold text-center">
            EduSense Live Intelligence
          </h1>

          <p className="m-0 text-[#666] text-xl max-w-xl text-center">
            AI-Powered Live Classrooms. Tracks understanding, not just
            attendance.
          </p>

          {role === "teacher" ? (
            <div className="flex gap-6 mt-8">
              <button
                className="px-8 py-4 text-lg font-semibold border-none rounded-xl cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl bg-linear-to-r from-blue-600 to-blue-500 text-white"
                onClick={handleCreateMeeting}
              >
                Start New Live Class
              </button>
            </div>
          ) : (
            <div className="w-full max-w-4xl mt-8">
              {activeLiveSessions.length > 0 ? (
                <div className="space-y-4">
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    Active Live Classes
                  </h2>

                  {activeLiveSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white rounded-2xl p-6 shadow-lg border-l-4 border-blue-500 hover:shadow-xl transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>

                            <span className="text-sm font-bold text-red-500 uppercase tracking-wider">
                              Live Now
                            </span>
                          </div>

                          <h3 className="text-xl font-bold text-gray-900 mb-1">
                            {session.topic}
                          </h3>

                          {session.description && (
                            <p className="text-gray-600 text-sm mb-2">
                              {session.description}
                            </p>
                          )}

                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {session.duration_minutes} minutes
                            </span>

                            <span className="flex items-center gap-1">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                />
                              </svg>
                              Teacher: {session.created_by_name}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleJoinSessionClick(session)}
                          className="ml-4 px-6 py-3 bg-linear-to-r from-green-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          Join Class
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-10 h-10 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-700 mb-2">
                    No Active Live Classes
                  </h3>

                  <p className="text-gray-500">
                    When your teacher starts a live class, it will appear here
                    automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals reused from previous code ... */}

        {/* Create Modal */}

        {modal === "create" && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-2xl p-8 min-w-112.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[#1976d2] font-bold text-2xl mb-4">
                Classroom Ready
              </h3>

              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  readOnly
                  value={createdMeetingUrl}
                  className="flex-1 p-4 border bg-gray-50 rounded-xl"
                />

                <button
                  className="px-6 font-bold bg-gray-100 rounded-xl"
                  onClick={handleCopyMeetingUrl}
                >
                  Copy
                </button>
              </div>

              <button
                className="w-full p-4 bg-green-600 text-white font-bold rounded-xl"
                onClick={handleStartMeeting}
              >
                Enter Classroom
              </button>
            </div>
          </div>
        )}

        {/* Join Modal */}

        {modal === "join" && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-2xl p-8 min-w-112.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[#1976d2] font-bold text-2xl mb-4">
                Join Classroom
              </h3>

              <input
                type="text"
                value={joinUrlInput}
                onChange={(e) => setJoinUrlInput(e.target.value)}
                placeholder="Enter Link..."
                className="w-full p-4 border rounded-xl mb-6"
              />

              <button
                className="w-full p-4 bg-blue-600 text-white font-bold rounded-xl"
                onClick={handleJoinWithUrl}
              >
                Join Now
              </button>
            </div>
          </div>
        )}

        {/* Setup Class Modal (Teacher) */}

        {modal === "setup" && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-2xl p-8 min-w-112.5 max-w-125 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>

                <h3 className="text-[#1976d2] font-bold text-2xl">
                  Create Live Class
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Topic Name *
                  </label>

                  <input
                    type="text"
                    value={classTopic}
                    onChange={(e) => setClassTopic(e.target.value)}
                    placeholder="e.g., Introduction to Calculus"
                    className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Duration (minutes)
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="15"
                      max="180"
                      step="15"
                      value={classDuration}
                      onChange={(e) =>
                        setClassDuration(parseInt(e.target.value))
                      }
                      className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />

                    <span className="w-16 text-center font-bold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                      {classDuration}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Description (Optional)
                  </label>

                  <textarea
                    value={classDescription}
                    onChange={(e) => setClassDescription(e.target.value)}
                    placeholder="Brief description about what will be covered..."
                    className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows="3"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  className="flex-1 p-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>

                <button
                  className="flex-1 p-4 bg-linear-to-r from-blue-600 to-blue-500 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleSetupClass}
                  disabled={!classTopic.trim()}
                >
                  Create Class
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Roll Number Modal (Student) */}

        {modal === "rollnumber" && selectedSession && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000"
            onClick={() => setModal(null)}
          >
            <div
              className="bg-white rounded-2xl p-8 min-w-100 max-w-112.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-gray-900 font-bold text-xl">
                    Join Class
                  </h3>

                  <p className="text-sm text-gray-500">
                    {selectedSession.topic}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Enter Your Roll Number *
                </label>

                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="e.g., R001, 2023001"
                  className="w-full p-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                  autoFocus
                />

                <p className="text-xs text-gray-500 mt-2">
                  Your roll number will be recorded for attendance tracking.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 p-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all"
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>

                <button
                  className="flex-1 p-4 bg-linear-to-r from-green-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  onClick={handleJoinWithRollNumber}
                  disabled={!rollNumber.trim()}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                  Join Now
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Meeting Render

  return (
    <div className="flex-1 p-4 overflow-hidden h-[calc(100vh-80px)] bg-slate-100">
      {/* Header */}

      <div className="mb-4 bg-white px-6 py-3 rounded-xl shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse">
            {isRecording ? "🔴 Live & Rec" : "Live"}
          </span>

          <h2 className="text-lg font-bold text-gray-800 m-0">
            Topic: <span className="text-[#1976d2]">{currentTopic}</span>
          </h2>
        </div>

        <div className="flex items-center gap-4">
          {role === "teacher" ? (
            <>
              {/* Audio Recording Status Indicator */}

              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isAudioRecording
                  ? "bg-red-100 border-2 border-red-500"
                  : "bg-gray-100 border-2 border-gray-300"
                  }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${isAudioRecording
                    ? "bg-red-500 animate-pulse"
                    : "bg-gray-400"
                    }`}
                ></div>

                <span
                  className={`text-sm font-semibold ${isAudioRecording ? "text-red-700" : "text-gray-600"
                    }`}
                >
                  {isAudioRecording ? "Recording Audio" : "No Recording"}
                </span>

                {audioRecordingStatus === "Uploading" && (
                  <span className="text-xs text-blue-600 ml-2 animate-pulse">
                    Uploading...
                  </span>
                )}

                {audioRecordingStatus === "Error" && (
                  <span className="text-xs text-orange-600 ml-2">⚠️ Error</span>
                )}
              </div>

              <button
                className="px-5 py-2 text-sm font-bold border-none rounded-lg cursor-pointer bg-[#d32f2f] text-white hover:bg-[#b71c1c]"
                onClick={handleEndClass}
              >
                End Class & Archive
              </button>
            </>
          ) : (
            <button
              className="px-5 py-2 text-sm font-bold border-none rounded-lg cursor-pointer bg-orange-500 text-white hover:bg-orange-600"
              onClick={handleLeaveClass}
            >
              Leave Class
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 h-[calc(100%-70px)]">
        {/* Left: Video */}

        <div className="flex-2 flex flex-col h-full min-w-0 bg-black rounded-2xl overflow-hidden shadow-lg relative ring-4 ring-white">
          <iframe
            src={meetingUrl}
            allow="camera; microphone; fullscreen; speaker; speaker-selection; display-capture; autoplay"
            className="w-full h-full border-none absolute inset-0"
            title="Jitsi Meet"
          />
        </div>

        {/* Right: Teacher = full dashboard; Student = transcript + summary + doubts only */}

        <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-95 pr-1 pb-4 no-scrollbar">
          {role === "teacher" ? (
            /* ---------- TEACHER: Full Intelligence Dashboard (unchanged) ---------- */

            <>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="m-0 text-gray-900 text-lg font-bold flex items-center gap-2">
                    <span className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                      📊
                    </span>{" "}
                    Intelligence Dashboard
                  </h3>

                  {isHost && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-600 rounded-full text-xs font-bold">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                      LIVE SYNC
                    </span>
                  )}
                </div>

                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 mb-5">
                  <p className="m-0 text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">
                    Current Topic
                  </p>

                  <p className="m-0 text-blue-900 font-bold text-base truncate">
                    {currentTopic}
                  </p>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-bold text-gray-700">
                      Confusion Meter
                    </span>

                    <span
                      className={`text-xs font-bold uppercase ${confusionLevel > 50 ? "text-red-500" : confusionLevel > 20 ? "text-orange-500" : "text-green-500"}`}
                    >
                      {confusionLevel > 50
                        ? "High Confusion"
                        : confusionLevel > 20
                          ? "Caution"
                          : "Low Confusion"}
                    </span>
                  </div>

                  <div className="flex gap-1.5 h-12 items-end">
                    {[1, 2, 3, 4, 5].map((bar) => {
                      const isActive = confusionLevel / 20 >= bar;

                      let color = "bg-gray-100";

                      if (isActive) {
                        if (bar <= 2) color = "bg-green-400";
                        else if (bar <= 4) color = "bg-orange-400";
                        else color = "bg-red-400";
                      }

                      return (
                        <div
                          key={bar}
                          className={`flex-1 rounded-t-md transition-all duration-500 ${color}`}
                          style={{ height: isActive ? `${20 * bar}%` : "15%" }}
                        ></div>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-center">
                    <span className="text-2xl font-black text-gray-800">
                      {confusionLevel}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="m-0 text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Poll Accuracy
                    </p>

                    <p className="m-0 text-base font-bold text-gray-800">
                      {pollResponses.length > 0
                        ? Math.round(
                          (pollResponses.filter(
                            (r) =>
                              r.answer.includes("Yes") ||
                              r.answer.includes("clear"),
                          ).length /
                            pollResponses.length) *
                          100,
                        )
                        : 0}
                      %
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="m-0 text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Doubts
                    </p>

                    <p className="m-0 text-base font-bold text-gray-800">
                      {doubts.length}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="m-0 text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Transcription
                    </p>
                    <p className="m-0 text-xs font-bold text-gray-800 flex items-center gap-1">
                      <span
                        className={`w-2 h-2 rounded-full ${transcriptionStatus === "Live" ? "bg-green-500 animate-pulse" : "bg-red-400"}`}
                      ></span>
                      {transcriptionStatus}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="m-0 text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Response Delay
                    </p>
                    <p className="m-0 text-base font-bold text-gray-800">
                      1.2s
                    </p>
                  </div>
                </div>
                {isHost && (
                  <div className="mt-4">
                    {!activePoll ? (
                      <button
                        onClick={handleLaunchPoll}
                        className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2"
                      >
                        <span>🚀</span> Launch Quick Poll
                      </button>
                    ) : (
                      <div className="bg-blue-50/80 rounded-2xl p-4 border border-blue-100 animate-fade-in">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="m-0 text-blue-900 text-xs font-black uppercase tracking-tighter">
                            Recording Responses...
                          </h4>
                          <button
                            onClick={handleStopPoll}
                            className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors border-none cursor-pointer"
                          >
                            END POLL
                          </button>
                        </div>

                        <div className="space-y-3">
                          {activePoll.options.map((opt) => {
                            const count = pollResponses.filter((r) => r.answer === opt).length;
                            const pct = pollResponses.length > 0 ? Math.round((count / pollResponses.length) * 100) : 0;

                            return (
                              <div key={opt}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[11px] font-bold text-blue-900 truncate mr-2">
                                    {opt}
                                  </span>
                                  <span className="text-[10px] font-black text-blue-600">
                                    {count} ({pct}%)
                                  </span>
                                </div>
                                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4 pt-3 border-t border-blue-100 flex justify-between items-center">
                          <p className="m-0 text-[10px] font-bold text-blue-400">
                            Total: {pollResponses.length} students
                          </p>
                          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                            ACTIVE
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h4 className="m-0 mb-4 text-gray-800 text-sm font-bold uppercase tracking-wider">
                  Topic-wise Clarity
                </h4>
                <div className="space-y-4">
                  {topicClarity.map((topic, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-medium text-gray-600 truncate mr-4">
                          {idx + 1}. {topic.name}
                        </span>
                        <span
                          className={`text-xs font-bold ${topic.clarity > 80 ? "text-green-500" : topic.clarity > 50 ? "text-orange-500" : "text-red-500"}`}
                        >
                          {topic.clarity}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-700 ${topic.clarity > 80 ? "bg-green-500" : topic.clarity > 50 ? "bg-orange-500" : "bg-red-500"}`}
                          style={{ width: `${topic.clarity}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-indigo-50/50 rounded-2xl p-5 shadow-sm border border-indigo-100/50 border-dashed relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-3 opacity-10">
                  <span className="text-4xl">🤖</span>
                </div>
                <h4 className="m-0 mb-3 text-indigo-900 text-xs font-bold uppercase tracking-widest">
                  AI PEDAGOGICAL INSIGHT
                </h4>
                <p className="m-0 text-indigo-800 text-sm font-medium leading-relaxed mb-4">
                  {aiInsight ||
                    "Analyzing lecture flow for pedagogical suggestions..."}
                </p>
                {teachingCues.length > 0 && (
                  <div className="mb-4 bg-white/50 p-3 rounded-xl border border-indigo-100/50">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      Key Highlights & Cues
                    </p>
                    <ul className="m-0 pl-4 space-y-1">
                      {teachingCues.map((cue, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-indigo-700 font-medium"
                        >
                          {cue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {isHost && aiInsight && (
                  <button
                    onClick={() => {
                      setAiInsight(
                        "Suggestion acknowledged. Monitoring student clarity...",
                      );
                      setTeachingCues([]);
                    }}
                    className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100 active:scale-95"
                  >
                    Acknowledge & Re-explain
                  </button>
                )}
              </div>
              <div className="bg-white rounded-2xl p-0 shadow-sm border border-gray-100 overflow-hidden shrink-0">
                <details className="group" open>
                  <summary className="p-4 bg-gray-50/50 cursor-pointer flex items-center justify-between list-none">
                    <h4 className="m-0 text-gray-800 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                      <span>📜</span> Live Transcript
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full ${transcriptionStatus === "Live" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {transcriptionStatus}
                      </span>
                    </h4>
                    <span className="text-gray-400 group-open:rotate-180 transition-transform text-xs">
                      ▼
                    </span>
                  </summary>
                  <div className="p-4 max-h-55 overflow-y-auto text-sm text-gray-700 leading-relaxed bg-white border-t border-gray-50 scrollbar-thin">
                    {transcript ? (
                      <span className="whitespace-pre-wrap">{transcript}</span>
                    ) : null}
                    {interimTranscript && (
                      <span className="opacity-70 italic">
                        {" "}
                        {interimTranscript}
                      </span>
                    )}
                    {!transcript && !interimTranscript && (
                      <span className="text-gray-500 italic">
                        {transcriptionStatus === "Live"
                          ? "Speak into your microphone — text will appear here."
                          : transcriptionStatus === "Error"
                            ? "Transcription error. Check mic permission for this tab (EduSense)."
                            : "Waiting for speech..."}
                      </span>
                    )}
                  </div>
                </details>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col min-h-50">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="m-0 text-gray-800 text-sm font-bold uppercase tracking-wider">
                    Student Doubts
                  </h4>
                  {doubts.length > 0 && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-[10px] font-bold">
                      {doubts.length}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {doubts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                      <span className="text-3xl mb-2">🎈</span>
                      <p className="text-xs">No doubts yet</p>
                    </div>
                  ) : (
                    doubts.map((d) => (
                      <div
                        key={d.id}
                        className="bg-gray-50 border border-gray-100 p-3.5 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100/50">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 uppercase">
                            {(d.student_name || "A").charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-700 leading-none">
                              {d.student_name || "Anonymous"}
                            </span>
                            <span className="text-[9px] text-gray-400 mt-0.5">
                              {Math.round((new Date() - d.timestamp) / 60000)}m
                              ago
                            </span>
                          </div>
                        </div>
                        <p className="m-0 text-sm text-gray-800 font-medium leading-snug lowercase first-letter:uppercase">
                          "{d.text}"
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ---------- STUDENT: Live transcript + Summary + Doubts only ---------- */
            <>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <h3 className="m-0 text-gray-900 text-base font-bold flex items-center gap-2 mb-1">
                  <span className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                    📜
                  </span>{" "}
                  Teacher&apos;s Live Transcription
                </h3>
                <p className="m-0 text-[10px] text-gray-500 mb-3 flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${transcriptionStatus === "Live" ? "bg-green-500 animate-pulse" : "bg-gray-300"}`}
                  ></span>
                  {transcriptionStatus === "Live"
                    ? "Live"
                    : "Waiting for teacher…"}
                </p>
                <div className="p-4 max-h-55 overflow-y-auto text-sm text-gray-700 leading-relaxed bg-gray-50/50 rounded-xl border border-gray-100 custom-scrollbar">
                  {transcript ? (
                    <span className="whitespace-pre-wrap">{transcript}</span>
                  ) : null}
                  {interimTranscript && (
                    <span className="opacity-70 italic">
                      {" "}
                      {interimTranscript}
                    </span>
                  )}
                  {!transcript && !interimTranscript && (
                    <span className="text-gray-500 italic">
                      {transcriptionStatus === "Live"
                        ? "Teacher is speaking..."
                        : transcriptionStatus === "Error"
                          ? "Transcription error on teacher side."
                          : "Waiting for teacher to start speaking..."}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 shrink-0">
                <h4 className="m-0 text-gray-800 text-sm font-bold uppercase tracking-wider flex items-center gap-2 mb-3">
                  <span className="text-amber-500">📋</span> Summary so far
                </h4>
                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100/50 min-h-20">
                  {liveSummaryLoading ? (
                    <p className="m-0 text-sm text-amber-700/80">
                      Updating summary…
                    </p>
                  ) : liveSummary ? (
                    <p className="m-0 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {liveSummary}
                    </p>
                  ) : (
                    <p className="m-0 text-sm text-gray-500 italic">
                      Summary will appear as the class progresses (after enough
                      speech).
                    </p>
                  )}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col min-h-70">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="m-0 text-gray-800 text-sm font-bold uppercase tracking-wider">
                    My doubts
                  </h4>
                  {doubts.length > 0 && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold">
                      {doubts.length}
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 custom-scrollbar">
                  {doubts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                      <span className="text-2xl mb-2">💬</span>
                      <p className="text-xs">
                        No doubts raised yet. Ask anything anonymously below.
                      </p>
                    </div>
                  ) : (
                    doubts.map((d) => (
                      <div
                        key={d.id}
                        className="bg-gray-50 border border-gray-100 p-3 rounded-xl"
                      >
                        <p className="m-0 text-sm text-gray-800 font-medium leading-snug">
                          "{d.text}"
                        </p>
                        <span className="text-[10px] text-gray-400">
                          {Math.round((new Date() - d.timestamp) / 60000)}m ago
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-auto pt-4 border-t border-gray-100">
                  <div className="relative">
                    <textarea
                      value={doubtText}
                      onChange={(e) => setDoubtText(e.target.value)}
                      placeholder="Have a doubt? Type here and send (anonymous)..."
                      className="w-full p-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none"
                      rows="2"
                    />
                    <button
                      onClick={handleRaiseDoubt}
                      disabled={!doubtText.trim()}
                      className="absolute bottom-3 right-3 p-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 transition-all active:scale-95"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-5 h-5"
                      >
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {import.meta.env.DEV && (
          <div className="fixed bottom-4 left-4 z-9999 bg-black/80 text-white p-3 rounded-lg text-[10px] font-mono pointer-events-none opacity-50 hover:opacity-100 transition-opacity">
            <p className="m-0 mb-1 font-bold text-yellow-400 uppercase tracking-tighter">
              Debug
            </p>
            <p className="m-0">
              Host: {isHost ? "Y" : "N"} · Rec: {isRecording ? "Y" : "N"} ·
              Status: {transcriptionStatus}
            </p>
            <p className="m-0">
              Channel: {channelStatus} · Transcript: {transcript?.length || 0}{" "}
              chars
            </p>
          </div>
        )}
        {/* Poll Modal for Students */}
        {activePoll && role === "student" && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-2000 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl scale-in ring-8 ring-blue-50">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-3xl mb-6">
                ❓
              </div>
              <h3 className="text-2xl font-black text-gray-900 mb-2 leading-tight">
                {activePoll.question}
              </h3>
              <p className="text-gray-500 mb-8 text-sm">
                Quick response requested by Teacher
              </p>
              <div className="space-y-3">
                {activePoll.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleRespondPoll(opt)}
                    className="w-full py-4 px-6 text-left font-bold text-gray-700 bg-gray-50 hover:bg-blue-600 hover:text-white rounded-2xl border border-gray-100 transition-all flex justify-between items-center group"
                  >
                    {opt}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default LiveClass;
// Add some custom animations for the Intelligence Dashboard
const style = document.createElement("style");
style.innerHTML = `
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.scale-in {
  animation: scaleIn 0.3s ease-out forwards;
}
.animate-fade-in {
  animation: fadeIn 0.5s ease-out forwards;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
  }

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;

}

`;
document.head.appendChild(style);
