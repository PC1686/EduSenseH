/**
 * Audio Recorder - Records teacher's audio during live class
 * Captures microphone stream and stores audio chunks
 * Uploads completed recording to Supabase storage bucket
 */

let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;
let isRecording = false;

/**
 * Start audio recording for teacher
 * @param {Function} onStatus - Callback for status updates (e.g., "Recording", "Error")
 * @returns {Promise<void>}
 */
export async function startAudioRecording(onStatus) {
  try {
    // Check if already recording
    if (isRecording && mediaRecorder) {
      console.warn('[AudioRecorder] Already recording');
      return;
    }

    // Request microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      },
      video: false
    });

    // Create MediaRecorder with audio/webm codec for better compatibility
    const options = {
      mimeType: 'audio/webm;codecs=opus'
    };

    // Fallback if webm is not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/mp4';
    }

    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/wav';
    }

    mediaRecorder = new MediaRecorder(mediaStream, options);
    audioChunks = [];
    isRecording = true;

    console.log('[AudioRecorder] Recording started with mime type:', mediaRecorder.mimeType);
    onStatus?.('Recording');

    // Collect audio data in chunks
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('[AudioRecorder] Recording error:', event.error);
      onStatus?.('Error: ' + event.error);
      isRecording = false;
      cleanup();
    };

    // Start recording with 1-second chunks for regular uploads (optional feature)
    mediaRecorder.start(1000);
  } catch (err) {
    console.error('[AudioRecorder] Failed to start recording:', err);
    onStatus?.('Error: ' + err.message);
    isRecording = false;
    cleanup();
    throw err;
  }
}

/**
 * Stop audio recording and return the audio blob
 * @returns {Promise<Blob>} Audio blob of the recording
 */
export function stopAudioRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || !isRecording) {
      console.warn('[AudioRecorder] No active recording to stop');
      resolve(null);
      return;
    }

    mediaRecorder.onstop = () => {
      try {
        // Create blob from accumulated chunks
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        console.log('[AudioRecorder] Recording stopped. File size:', audioBlob.size, 'bytes');

        isRecording = false;
        cleanup();
        resolve(audioBlob);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
  });
}

/**
 * Cancel recording without saving
 */
export function cancelAudioRecording() {
  if (!mediaRecorder || !isRecording) return;

  mediaRecorder.stop();
  isRecording = false;
  audioChunks = [];
  cleanup();
  console.log('[AudioRecorder] Recording cancelled');
}

/**
 * Clean up resources (stop tracks and reset state)
 */
function cleanup() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  mediaRecorder = null;
}

/**
 * Check if audio recording is currently active
 * @returns {boolean}
 */
export function isAudioRecordingActive() {
  return isRecording;
}

/**
 * Upload audio blob to Supabase storage
 * @param {object} supabase - Supabase client
 * @param {Blob} audioBlob - Audio blob to upload
 * @param {string} sessionId - Live session ID
 * @param {string} userId - Teacher user ID
 * @param {string} teacherName - Teacher name for filename
 * @returns {Promise<{path: string, url: string} | null>}
 */
export async function uploadAudioToSupabase(supabase, audioBlob, sessionId, userId, teacherName) {
  if (!audioBlob || audioBlob.size === 0) {
    console.error('[AudioRecorder] Cannot upload empty audio blob');
    return null;
  }

  try {
    // Create storage bucket name for audio recordings
    const bucketName = 'teacher-recordings';

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sessionId}/${userId}_${teacherName}_${timestamp}.webm`;

    console.log('[AudioRecorder] Uploading to bucket:', bucketName, 'File:', filename);

    // Verify bucket exists - try to create if it doesn't
    let bucketReady = false;
    try {
      // First, check if we can access the bucket
      const { data: testData, error: testError } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 1 });
      
      if (!testError) {
        bucketReady = true;
        console.log('[AudioRecorder] Bucket already exists and is accessible');
      }
    } catch (testErr) {
      console.log('[AudioRecorder] Bucket accessibility check failed:', testErr.message);
    }

    // If bucket not accessible, try to create it
    if (!bucketReady) {
      try {
        await supabase.storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: 5368709120 // 5GB limit
        });
        console.log('[AudioRecorder] Bucket created successfully');
        bucketReady = true;
      } catch (createErr) {
        console.error('[AudioRecorder] Bucket creation failed:', createErr.message);
        throw new Error(`Recording bucket "${bucketName}" could not be accessed or created. Please create it in the Supabase Dashboard (Storage > Create a new bucket > Name: "${bucketName}" > Private). Error: ${createErr.message}`);
      }
    }

    if (!bucketReady) {
      throw new Error(`Recording bucket "${bucketName}" is not ready. Please create it in the Supabase Dashboard.`);
    }

    // Upload audio file
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filename, audioBlob, {
        contentType: audioBlob.type,
        upsert: false
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL (note: bucket is private so this might need auth)
    const { data: publicUrl } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filename);

    console.log('[AudioRecorder] Upload successful. Path:', data.path);

    return {
      path: data.path,
      url: publicUrl.publicUrl || `${bucketName}/${filename}`
    };
  } catch (err) {
    console.error('[AudioRecorder] Upload to Supabase failed:', err);
    throw err;
  }
}

/**
 * Update live session with recording URL
 * @param {object} supabase - Supabase client
 * @param {string} sessionId - Live session ID
 * @param {string} recordingPath - Path to recording in storage
 * @returns {Promise<void>}
 */
export async function updateSessionRecordingPath(supabase, sessionId, recordingPath) {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ recording_path: recordingPath })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('[AudioRecorder] Session updated with recording path:', recordingPath);
  } catch (err) {
    console.error('[AudioRecorder] Failed to update session recording path:', err);
    throw err;
  }
}
