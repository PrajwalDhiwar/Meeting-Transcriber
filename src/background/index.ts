import browser from 'webextension-polyfill';
import { transcribeAudio } from '@/lib/assemblyAIService';
import { generateSummary } from '@/lib/geminiService';
import { StorageKeys, MeetingPlatform } from '@/lib/types';

// Track meeting tabs
interface MeetingTabData {
  platform: MeetingPlatform;
  recording: boolean;
  startTime: Date | null;
  transcript: any | null;
  summary: any | null;
}

const activeMeetingTabs: Record<number, MeetingTabData> = {};

// Initialize extension
browser.runtime.onInstalled.addListener(async () => {
  // Set default settings
  await browser.storage.sync.set({
    [StorageKeys.ASSEMBLY_AI_KEY]: '',
    [StorageKeys.GEMINI_KEY]: '',
    [StorageKeys.AUTO_TRANSCRIBE]: false
  });
  
  console.log('Meeting Transcriber extension installed');
});

// Listen for messages from content script or popup
browser.runtime.onMessage.addListener((message, sender): any => {
  const { action } = message;
  const tabId = sender.tab?.id;
  
  if (!tabId && action !== 'checkApiKeys') {
    console.error('No tab ID for action:', action);
    return;
  }

  switch (action) {
    case 'meetingDetected':
      return handleMeetingDetected(tabId!, message.platform);
      
    case 'startRecording':
      return startRecordingInTab(message.tabId || tabId!);
      
    case 'stopRecording':
      return stopRecordingInTab(message.tabId || tabId!);
      
    case 'processRecording':
      return processRecording(message.audioData, message.tabId || tabId!);
      
    case 'checkApiKeys':
      return checkApiKeys();
      
    case 'saveTranscript':
      return saveTranscript(message.data, message.filename);
      
    case 'checkRecordingStatus':
      return getRecordingStatus(message.tabId || tabId!);
  }
});

// Track tab updates to detect meetings
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is a Zoom or Google Meet URL
    const isZoomMeeting = tab.url.includes('zoom.us/') && 
                         (tab.url.includes('/j/') || tab.url.includes('/wc/'));
    const isGoogleMeet = tab.url.includes('meet.google.com/');
    
    if (isZoomMeeting || isGoogleMeet) {
      // Check if content script is already running
      browser.tabs.sendMessage(tabId, { action: 'checkActive' })
        .catch(() => {
          // Content script not running, inject it
          browser.scripting.executeScript({
            target: { tabId },
            files: ['src/content/index.js']
          }).catch(err => console.error('Error injecting content script:', err));
        });
    }
  }
});

// Handle meeting detection
async function handleMeetingDetected(tabId: number, platform: MeetingPlatform): Promise<void> {
  console.log(`Meeting detected in tab ${tabId} on platform ${platform}`);
  
  // Track this tab as containing an active meeting
  activeMeetingTabs[tabId] = {
    platform,
    recording: false,
    startTime: null,
    transcript: null,
    summary: null
  };
  
  // Update extension icon
  await browser.action.setBadgeText({ text: '🔴', tabId });
  
  // Check if auto-transcribe is enabled
  const { autoTranscribe } = await browser.storage.sync.get([StorageKeys.AUTO_TRANSCRIBE]);
  
  if (autoTranscribe) {
    // First check if API keys are set
    const keyStatus = await checkApiKeys();
    if (keyStatus.valid) {
      await startRecordingInTab(tabId);
    }
  }
}

// Start recording in a tab
async function startRecordingInTab(tabId: number): Promise<void> {
  if (activeMeetingTabs[tabId]) {
    await browser.tabs.sendMessage(tabId, { action: 'startRecording' });
    activeMeetingTabs[tabId].recording = true;
    activeMeetingTabs[tabId].startTime = new Date();
    await browser.action.setBadgeText({ text: '⏺️', tabId });
    console.log(`Started recording in tab ${tabId}`);
  }
}

// Stop recording in a tab
async function stopRecordingInTab(tabId: number): Promise<void> {
  if (activeMeetingTabs[tabId] && activeMeetingTabs[tabId].recording) {
    await browser.tabs.sendMessage(tabId, { action: 'stopRecording' });
    activeMeetingTabs[tabId].recording = false;
    await browser.action.setBadgeText({ text: '🔴', tabId });
    console.log(`Stopped recording in tab ${tabId}`);
  }
}

// Get recording status for a tab
function getRecordingStatus(tabId: number): { recording: boolean } {
  return { 
    recording: activeMeetingTabs[tabId]?.recording || false 
  };
}

// Check if API keys are set and valid
async function checkApiKeys(): Promise<{ valid: boolean; message?: string }> {
  const result = await browser.storage.sync.get([
    StorageKeys.ASSEMBLY_AI_KEY,
    StorageKeys.GEMINI_KEY
  ]);
  
  if (!result[StorageKeys.ASSEMBLY_AI_KEY] || !result[StorageKeys.GEMINI_KEY]) {
    return { 
      valid: false, 
      message: 'Please set your AssemblyAI and Gemini API keys in the extension options'
    };
  }
  
  return { valid: true };
}

// Process recording: transcribe and summarize
async function processRecording(audioData: ArrayBuffer, tabId: number): Promise<any> {
  try {
    // Update status
    await browser.tabs.sendMessage(tabId, { 
      action: 'updateStatus', 
      status: 'Processing recording...'
    });
    
    // Get API keys
    const storage = await browser.storage.sync.get([
      StorageKeys.ASSEMBLY_AI_KEY,
      StorageKeys.GEMINI_KEY
    ]);
    
    const assemblyAIKey = storage[StorageKeys.ASSEMBLY_AI_KEY];
    const geminiKey = storage[StorageKeys.GEMINI_KEY];
    
    if (!assemblyAIKey) {
      throw new Error('AssemblyAI API key not set. Please configure in options.');
    }
    
    if (!geminiKey) {
      throw new Error('Gemini API key not set. Please configure in options.');
    }
    
    // Step 1: Transcribe with AssemblyAI
    await browser.tabs.sendMessage(tabId, { 
      action: 'updateStatus', 
      status: 'Transcribing with AssemblyAI...'
    });
    
    const transcript = await transcribeAudio(audioData, assemblyAIKey, (status: string) => {
      browser.tabs.sendMessage(tabId, { 
        action: 'updateStatus', 
        status 
      });
    });
    
    // Step 2: Summarize with Gemini
    await browser.tabs.sendMessage(tabId, { 
      action: 'updateStatus', 
      status: 'Generating summary with Gemini...'
    });
    
    const summary = await generateSummary(transcript, geminiKey);
    
    // Store results
    const results = {
      transcript,
      summary
    };
    
    if (tabId && activeMeetingTabs[tabId]) {
      activeMeetingTabs[tabId].transcript = transcript;
      activeMeetingTabs[tabId].summary = summary;
    }
    
    // Update status
    await browser.tabs.sendMessage(tabId, { 
      action: 'updateStatus', 
      status: 'Processing complete!'
    });
    
    return results;
  } catch (error) {
    console.error('Processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await browser.tabs.sendMessage(tabId, { 
      action: 'updateStatus', 
      status: `Processing failed: ${errorMessage}`
    });
    
    throw error;
  }
}

// Save transcript to a file (opens a new tab)
async function saveTranscript(data: any, filename: string): Promise<void> {
  // Create HTML content for the transcript
  const html = generateTranscriptHtml(data, filename);
  
  // Open a new tab with the transcript
  await browser.tabs.create({
    url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  });
}

// Generate HTML for transcript viewing
function generateTranscriptHtml(data: any, meetingName: string): string {
  const { transcript, summary } = data;
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Meeting Transcript: ${meetingName}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #2c3e50; }
        h2 { color: #3498db; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .timestamp { color: #7f8c8d; font-size: 0.8em; }
        .speaker { font-weight: bold; }
        .summary { background-color: #f9f9f9; padding: 15px; border-left: 4px solid #3498db; margin-bottom: 20px; }
        .action-item { background-color: #fffacd; padding: 10px; margin: 5px 0; border-left: 4px solid #f39c12; }
        .transcript-container { border: 1px solid #ccc; padding: 15px; margin-top: 20px; }
        .chapter { margin-top: 20px; }
        .chapter-title { color: #2980b9; }
        .controls { margin: 20px 0; }
        button { padding: 8px 16px; background-color: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background-color: #2980b9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Meeting Transcript: ${meetingName}</h1>
        
        <div class="controls">
          <button onclick="window.print()">Print</button>
          <button onclick="downloadTranscript()">Download (TXT)</button>
          <button onclick="downloadHTML()">Download (HTML)</button>
        </div>
        
        <h2>Summary</h2>
        <div class="summary">${summary.summary || 'No summary available'}</div>
  `;
  
  // Add action items if available
  if (summary.actionItems && summary.actionItems.length > 0) {
    html += `<h2>Action Items</h2><ul>`;
    
    summary.actionItems.forEach((item: any) => {
      html += `
        <li class="action-item">
          <strong>${item.assignee}</strong>: ${item.text}
          <div class="timestamp">(mentioned by ${item.speaker} at ${item.timestamp})</div>
        </li>
      `;
    });
    
    html += `</ul>`;
  }
  
  // Add chapters if available
  if (transcript.chapters && transcript.chapters.length > 0) {
    html += `<h2>Meeting Sections</h2>`;
    
    transcript.chapters.forEach((chapter: any) => {
      html += `
        <div class="chapter">
          <h3 class="chapter-title">${chapter.title} <span class="timestamp">(${chapter.start} - ${chapter.end})</span></h3>
          <p>${chapter.summary}</p>
        </div>
      `;
    });
  }
  
  // Add transcript
  html += `<h2>Full Transcript</h2><div class="transcript-container">`;
  
  if (transcript.transcript && transcript.transcript.length > 0) {
    transcript.transcript.forEach((entry: any) => {
      html += `
        <p>
          <span class="speaker">${entry.speaker}</span> 
          <span class="timestamp">(${entry.timestamp}):</span> 
          ${entry.text}
        </p>
      `;
    });
  } else {
    html += `<p>No transcript data available</p>`;
  }
  
  // Add JavaScript for download functionality
  html += `
    </div>
    
    <script>
      function downloadTranscript() {
        let content = "MEETING TRANSCRIPT: ${meetingName}\\n\\n";
        
        content += "SUMMARY:\\n";
        content += "${summary.summary?.replace(/"/g, '\\"') || 'No summary available'}\\n\\n";
        
        content += "ACTION ITEMS:\\n";
        ${summary.actionItems && summary.actionItems.length > 0 ? 
          `summary.actionItems.forEach(item => {
            content += "- " + item.assignee + ": " + item.text + " (mentioned by " + item.speaker + " at " + item.timestamp + ")\\n";
          });` : 
          'content += "No action items\\n";'
        }
        content += "\\n";
        
        content += "FULL TRANSCRIPT:\\n";
        ${transcript.transcript && transcript.transcript.length > 0 ? 
          `transcript.transcript.forEach(entry => {
            content += entry.speaker + " (" + entry.timestamp + "): " + entry.text + "\\n";
          });` : 
          'content += "No transcript data available\\n";'
        }
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = "${meetingName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      function downloadHTML() {
        const html = document.documentElement.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = "${meetingName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      // Make transcript and summary data available to the download functions
      const transcript = ${JSON.stringify(transcript)};
      const summary = ${JSON.stringify(summary)};
    </script>
    </div>
    </body>
    </html>
  `;
  
  return html;
}