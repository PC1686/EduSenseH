/**
 * Live transcription using AssemblyAI Streaming v3 API.
 * Captures microphone, streams PCM 16kHz mono to AssemblyAI, emits partial/final transcript.
 * Use token in URL for auth (browser WebSocket cannot set custom headers).
 * Resamples from browser's native sample rate to 16kHz for Firefox/Chrome compatibility.
 */

const TARGET_SAMPLE_RATE = 16000;
const WS_BASE = 'wss://streaming.assemblyai.com/v3/ws';
// EU: wss://streaming.eu.assemblyai.com/v3/ws

/** Resample float32 mono to target rate and convert to Int16 PCM. */
function resampleTo16k(float32Input, sourceSampleRate) {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) {
    const pcm = new Int16Array(float32Input.length);
    for (let i = 0; i < float32Input.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }
  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(float32Input.length / ratio);
  const pcm = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(idx0 + 1, float32Input.length - 1);
    const frac = srcIndex - idx0;
    const sample = float32Input[idx0] * (1 - frac) + float32Input[idx1] * frac;
    const s = Math.max(-1, Math.min(1, sample));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

/**
 * Create and start a live transcription session.
 * @param {string} apiKey - AssemblyAI API key (will be sent as token query param)
 * @param {object} callbacks
 * @param {(status: string) => void} callbacks.onStatus - e.g. "Connecting", "Live", "Error", "Disconnected"
 * @param {(text: string) => void} callbacks.onPartial - interim/partial transcript
 * @param {(text: string) => void} callbacks.onFinal - final transcript segment
 * @returns {Promise<{ stop: () => void }>} Controller with stop() to end session
 */
export async function startLiveTranscription(apiKey, { onStatus, onPartial, onFinal }) {
  if (!apiKey || apiKey === 'your_assemblyai_api_key_here') {
    const msg = 'AssemblyAI API key not set. Add VITE_ASSEMBLYAI_API_KEY to .env';
    onStatus?.('Error');
    throw new Error(msg);
  }

  const params = new URLSearchParams({
    sample_rate: String(TARGET_SAMPLE_RATE),
    token: apiKey,
    format_text: 'true',
    vad_threshold: '0.4',
  });
  const wsUrl = `${WS_BASE}?${params.toString()}`;

  let socket = null;
  let audioContext = null;
  let processor = null;
  let stream = null;
  let isLive = false;

  const setStatus = (s) => {
    onStatus?.(s);
  };

  const cleanup = () => {
    isLive = false;
    try {
      if (processor) {
        try { processor.disconnect(); } catch { void 0; }
        processor = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (audioContext?.state !== 'closed') {
        audioContext?.close();
      }
      if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) {
        socket.send(JSON.stringify({ type: 'Terminate' }));
        socket.close();
      }
    } catch (e) {
      console.warn('[liveTranscription] cleanup error:', e);
    }
    socket = null;
  };

  return new Promise((resolve, reject) => {
    setStatus('Connecting');
    socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    socket.onopen = async () => {
      setStatus('Authenticating');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Use default sample rate so Firefox/Chrome don't conflict with getUserMedia; we resample to 16kHz below
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const bufferSize = 4096;
        processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);

        const sourceSampleRate = audioContext.sampleRate;

        processor.onaudioprocess = (e) => {
          if (!socket || socket.readyState !== WebSocket.OPEN || !isLive) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm = resampleTo16k(inputData, sourceSampleRate);
          if (pcm.byteLength > 0) {
            socket.send(pcm.buffer);
          }
        };

        // Status will be set to 'Live' when server sends Begin
        isLive = true;
        resolve({
          stop: () => {
            cleanup();
            setStatus('Disconnected');
          },
        });
      } catch (err) {
        console.error('[liveTranscription] Mic/Audio error:', err);
        setStatus('Error');
        cleanup();
        reject(err);
      }
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          const type = data.type;

          if (type === 'Begin' || type === 'SessionBegins') {
            setStatus('Live');
            isLive = true;
            return;
          }

          // Handle all transcript types (Turn for format_turns, others for standard)
          if (type === 'Turn' || type === 'FinalTranscript' || type === 'PartialTranscript') {
            const transcript = (data.transcript || data.text || '').trim();
            if (!transcript) return;

            const isFinal = !!(data.end_of_turn || type === 'FinalTranscript');

            if (isFinal) {
              onFinal?.(transcript + ' ');
            } else {
              onPartial?.(transcript);
            }
            return;
          }
          if (type === 'Termination') {
            setStatus('Disconnected');
            return;
          }
          if (data.error) {
            setStatus('Error');
            console.warn('[liveTranscription] Server error:', data.error);
          }
        } catch (e) {
          console.warn('[liveTranscription] Parse message error:', e);
        }
      }
    };

    socket.onerror = () => {
      setStatus('Connection Error');
      cleanup();
      reject(new Error('WebSocket error'));
    };

    socket.onclose = (event) => {
      setStatus('Disconnected');
      cleanup();
      if (!isLive && event.code !== 1000) {
        reject(new Error(`WebSocket closed: ${event.code} ${event.reason || ''}`));
      }
    };
  });
}
