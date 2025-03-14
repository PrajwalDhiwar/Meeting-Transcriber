/**
 * AssemblyAI service for transcription
 */

// Helper for formatting timestamps
function formatTimestamp(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  /**
   * Transcribe audio using AssemblyAI
   */
  export async function transcribeAudio(
    audioData: ArrayBuffer, 
    apiKey: string,
    statusCallback?: (status: string) => void
  ): Promise<{
    transcript: Array<{speaker: string, text: string, timestamp: string}>,
    chapters: Array<{title: string, summary: string, start: string, end: string}>
  }> {
    try {
      // Step 1: Upload the audio file
      if (statusCallback) statusCallback('Uploading audio to AssemblyAI...');
      
      // Convert audio data to blob
      const audioBlob = new Blob([audioData], { type: 'audio/webm' });
      
      // Get upload URL from AssemblyAI
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'Authorization': apiKey
        },
        body: audioBlob
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload audio: ${uploadResponse.statusText}`);
      }
      
      const uploadResult = await uploadResponse.json();
      const audioUrl = uploadResult.upload_url;
      
      // Step 2: Request transcription
      if (statusCallback) statusCallback('Requesting transcription...');
      
      const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          speaker_labels: true,
          auto_chapters: true
        })
      });
      
      if (!transcriptResponse.ok) {
        throw new Error(`Failed to request transcription: ${transcriptResponse.statusText}`);
      }
      
      const transcriptResult = await transcriptResponse.json();
      const transcriptId = transcriptResult.id;
      
      // Step 3: Poll for transcription completion
      let transcript: any = null;
      
      while (true) {
        if (statusCallback) statusCallback('Waiting for transcription to complete...');
        
        // Wait a bit before polling
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check transcription status
        const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
          headers: {
            'Authorization': apiKey
          }
        });
        
        if (!pollingResponse.ok) {
          throw new Error(`Failed to poll transcription: ${pollingResponse.statusText}`);
        }
        
        const pollingResult = await pollingResponse.json();
        
        if (pollingResult.status === 'completed') {
          transcript = pollingResult;
          break;
        } else if (pollingResult.status === 'error') {
          throw new Error(`Transcription error: ${pollingResult.error}`);
        }
        
        if (statusCallback) statusCallback(`Transcription status: ${pollingResult.status}`);
      }
      
      // Step 4: Format transcript data
      if (statusCallback) statusCallback('Formatting transcript data...');
      
      const formattedTranscript = {
        transcript: transcript.utterances ? transcript.utterances.map((utterance: any) => ({
          speaker: `Speaker ${utterance.speaker}`,
          text: utterance.text,
          timestamp: formatTimestamp(utterance.start)
        })) : [],
        chapters: transcript.chapters ? transcript.chapters.map((chapter: any) => ({
          title: chapter.headline,
          summary: chapter.summary,
          start: formatTimestamp(chapter.start),
          end: formatTimestamp(chapter.end)
        })) : []
      };
      
      if (statusCallback) statusCallback('Transcription completed!');
      
      return formattedTranscript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }