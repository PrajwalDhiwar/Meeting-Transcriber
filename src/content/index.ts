import browser from 'webextension-polyfill';
import { MessageAction, MeetingPlatform } from '@/lib/types';

// Global state
let isRecording = false;
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let recordingStartTime: Date | null = null;
let meetingPlatform: MeetingPlatform = MeetingPlatform.UNKNOWN;
let timerInterval: number | null = null;
let speakerObserver: MutationObserver | null = null;
let currentSpeaker: string | null = null;
let speakerHistory: Array<{speaker: string, time: Date}> = [];

// Initialize when the script loads
initialize();

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender): any => {
  const { action } = message;

  switch (action) {
    case MessageAction.CHECK_ACTIVE:
      return Promise.resolve({ status: 'active' });
      
    case MessageAction.START_RECORDING:
      startRecording();
      return Promise.resolve({ status: 'recording_started' });
      
    case MessageAction.STOP_RECORDING:
      return stopRecording().then(audioBlob => {
        browser.runtime.sendMessage({
          action: MessageAction.PROCESS_RECORDING,
          audioData: audioBlob,
          tabId: sender.tab?.id
        }).then(result => {
          if (result && result.status === 'success') {
            updateStatusUI('Processing complete!');
            showResults(result.data);
          } else {
            updateStatusUI(`Error: ${result?.error || 'Unknown error'}`);
          }
        });
        return { status: 'recording_stopping' };
      });
      
    case MessageAction.UPDATE_STATUS:
      updateStatusUI(message.status);
      return Promise.resolve({ status: 'acknowledged' });
  }
});

// Initialize content script
function initialize() {
  console.log('Meeting Transcriber content script initialized');
  
  // Detect meeting platform
  detectMeetingPlatform();
  
  // Create UI elements
  injectUI();
  
  // Start speaker detection
  startSpeakerDetection();
}

// Detect which meeting platform we're on
function detectMeetingPlatform() {
  const url = window.location.href;
  
  if (url.includes('zoom.us')) {
    meetingPlatform = MeetingPlatform.ZOOM;
  } else if (url.includes('meet.google.com')) {
    meetingPlatform = MeetingPlatform.GOOGLE_MEET;
  } else {
    meetingPlatform = MeetingPlatform.UNKNOWN;
  }
  
  // Notify background script about meeting detection
  if (meetingPlatform !== MeetingPlatform.UNKNOWN) {
    browser.runtime.sendMessage({
      action: MessageAction.MEETING_DETECTED,
      platform: meetingPlatform
    });
  }
  
  console.log(`Meeting platform detected: ${meetingPlatform}`);
}

// Inject UI elements into the meeting page
function injectUI() {
  // Create container for Meeting Transcriber UI
  const container = document.createElement('div');
  container.id = 'meeting-transcriber-container';
  Object.assign(container.style, {
    position: 'absolute',
    bottom: '80px',
    right: '20px',
    zIndex: '9999',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '12px',
    color: 'white',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '250px'
  });

  // Create title
  const title = document.createElement('div');
  title.textContent = 'Meeting Transcriber';
  Object.assign(title.style, {
    fontWeight: 'bold',
    fontSize: '16px',
    marginBottom: '5px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  });
  
  // Create minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.textContent = '−';
  Object.assign(minimizeBtn.style, {
    background: 'none',
    border: 'none',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer'
  });
  minimizeBtn.addEventListener('click', toggleMinimize);
  
  title.appendChild(minimizeBtn);
  container.appendChild(title);
  
  // Create status text
  const statusText = document.createElement('div');
  statusText.id = 'meeting-transcriber-status';
  statusText.textContent = 'Ready to record';
  container.appendChild(statusText);
  
  // Create recording timer
  const recordingTimer = document.createElement('div');
  recordingTimer.id = 'meeting-transcriber-timer';
  recordingTimer.textContent = '00:00';
  recordingTimer.style.display = 'none';
  container.appendChild(recordingTimer);
  
  // Create current speaker display
  const speakerDisplay = document.createElement('div');
  speakerDisplay.id = 'meeting-transcriber-speaker';
  speakerDisplay.textContent = 'Current speaker: None';
  container.appendChild(speakerDisplay);
  
  // Create buttons container
  const buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.gap = '8px';
  container.appendChild(buttons);
  
  // Record button
  const recordBtn = document.createElement('button');
  recordBtn.id = 'meeting-transcriber-record';
  recordBtn.textContent = 'Record';
  Object.assign(recordBtn.style, {
    padding: '8px 16px',
    backgroundColor: '#ff4d4f',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    flex: '1'
  });
  recordBtn.addEventListener('click', handleRecordClick);
  buttons.appendChild(recordBtn);
  
  // Add container to the page
  document.body.appendChild(container);
  
  // Check if API keys are set
  browser.runtime.sendMessage({ action: MessageAction.CHECK_API_KEYS }).then(response => {
    if (!response.valid) {
      updateStatusUI(`Warning: ${response.message}`);
    }
  });
}

// Toggle minimize/maximize UI
function toggleMinimize() {
  const container = document.getElementById('meeting-transcriber-container');
  if (!container) return;
  
  const minimizeBtn = container.querySelector('button');
  if (!minimizeBtn) return;
  
  // Get all elements except the title
  const elements = Array.from(container.children).slice(1);
  
  if ((elements[0] as HTMLElement).style.display === 'none') {
    // Maximize
    elements.forEach(el => {
      (el as HTMLElement).style.display = '';
    });
    minimizeBtn.textContent = '−';
    container.style.width = '250px';
  } else {
    // Minimize
    elements.forEach(el => {
      (el as HTMLElement).style.display = 'none';
    });
    minimizeBtn.textContent = '+';
    container.style.width = 'auto';
  }
}

// Handle record button click
function handleRecordClick() {
  if (!isRecording) {
    // Check API keys first
    browser.runtime.sendMessage({ action: MessageAction.CHECK_API_KEYS }).then(response => {
      if (response.valid) {
        browser.runtime.sendMessage({ action: MessageAction.START_RECORDING });
      } else {
        alert(`API keys not configured: ${response.message}. Please set your API keys in the extension options.`);
      }
    });
  } else {
    browser.runtime.sendMessage({ action: MessageAction.STOP_RECORDING });
  }
}

// Start recording
async function startRecording() {
  try {
    // Update UI
    isRecording = true;
    updateStatusUI('Recording started');
    updateRecordButton(true);
    
    // Request audio access
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create media recorder
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];
    
    // Set up recorder event handlers
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    // Start recording
    mediaRecorder.start();
    recordingStartTime = new Date();
    
    // Start timer
    startRecordingTimer();
    
  } catch (error) {
    console.error('Error starting recording:', error);
    updateStatusUI(`Recording error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    isRecording = false;
  }
}

// Stop recording
async function stopRecording(): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      reject(new Error('No active recording'));
      return;
    }
    
    // Update UI
    isRecording = false;
    updateStatusUI('Processing recording...');
    updateRecordButton(false);
    stopRecordingTimer();
    
    // Set up recorder stop handler
    mediaRecorder.onstop = async () => {
      try {
        // Stop all tracks
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Create audio blob from chunks
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // Convert to array buffer for processing
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        resolve(arrayBuffer);
      } catch (error) {
        reject(error);
      }
    };
    
    // Stop the recorder
    mediaRecorder.stop();
  });
}

// Start recording timer
function startRecordingTimer() {
  const timerElement = document.getElementById('meeting-transcriber-timer');
  if (!timerElement) return;
  
  timerElement.style.display = 'block';
  
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  timerInterval = window.setInterval(() => {
    if (!recordingStartTime) return;
    
    const elapsed = Math.floor((new Date().getTime() - recordingStartTime.getTime()) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    if (timerElement) {
      timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

// Stop recording timer
function stopRecordingTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  const timerElement = document.getElementById('meeting-transcriber-timer');
  if (timerElement) {
    timerElement.style.display = 'none';
  }
}

// Update record button state
function updateRecordButton(isRecording: boolean) {
  const recordBtn = document.getElementById('meeting-transcriber-record');
  if (!recordBtn) return;
  
  if (isRecording) {
    recordBtn.textContent = 'Stop';
    recordBtn.style.backgroundColor = '#52c41a';
  } else {
    recordBtn.textContent = 'Record';
    recordBtn.style.backgroundColor = '#ff4d4f';
  }
}

// Update status UI
function updateStatusUI(status: string) {
  const statusElement = document.getElementById('meeting-transcriber-status');
  if (statusElement) {
    statusElement.textContent = status;
  }
}

// Start speaker detection
function startSpeakerDetection() {
  // Different detection methods based on platform
  if (meetingPlatform === MeetingPlatform.ZOOM) {
    detectZoomSpeakers();
  } else if (meetingPlatform === MeetingPlatform.GOOGLE_MEET) {
    detectGoogleMeetSpeakers();
  }
}

// Detect speakers in Zoom
function detectZoomSpeakers() {
  // Create a mutation observer to monitor for active speaker changes
  speakerObserver = new MutationObserver(() => {
    // Look for elements with active speaker indicators
    const activeSpeakerElements = document.querySelectorAll('.active-speaker');
    if (activeSpeakerElements.length > 0) {
      // Try to get the name from the active speaker element
      const speakerName = getZoomSpeakerName(activeSpeakerElements[0]);
      updateCurrentSpeaker(speakerName);
    }
  });
  
  // Start observing the DOM for changes
  speakerObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

// Get speaker name from Zoom UI element
function getZoomSpeakerName(element: Element): string {
  // Try different selectors that might contain the speaker name
  const nameElement = 
    element.querySelector('.participant-name') ||
    element.querySelector('.display-name') ||
    element.closest('.participant-item')?.querySelector('.display-name');
  
  if (nameElement) {
    return nameElement.textContent?.trim() || 'Unknown Speaker';
  }
  
  // Fallback if we can't find the name
  return 'Unknown Speaker';
}

// Detect speakers in Google Meet
function detectGoogleMeetSpeakers() {
  // Create a mutation observer to monitor for active speaker changes
  speakerObserver = new MutationObserver(() => {
    // In Google Meet, look for the active speaker indicator
    const activeSpeakerElements = document.querySelectorAll('[data-active-speaker="true"]');
    if (activeSpeakerElements.length > 0) {
      // Try to get the name from the active speaker element
      const speakerName = getGoogleMeetSpeakerName(activeSpeakerElements[0]);
      updateCurrentSpeaker(speakerName);
    }
  });
  
  // Start observing the DOM for changes
  speakerObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-active-speaker']
  });
}

// Get speaker name from Google Meet UI element
function getGoogleMeetSpeakerName(element: Element): string {
  // Try different selectors that might contain the speaker name
  const nameElement = 
    element.querySelector('.zWfAib') ||  // Main display name class
    element.querySelector('[data-self-name="true"]') ||
    element.querySelector('[data-participant-id]');
  
  if (nameElement) {
    return nameElement.textContent?.trim() || 'Unknown Speaker';
  }
  
  // Fallback if we can't find the name
  return 'Unknown Speaker';
}

// Update current speaker display
function updateCurrentSpeaker(speakerName: string) {
  if (speakerName && speakerName !== currentSpeaker) {
    currentSpeaker = speakerName;
    
    // Update UI
    const speakerElement = document.getElementById('meeting-transcriber-speaker');
    if (speakerElement) {
      speakerElement.textContent = `Current speaker: ${speakerName}`;
    }
    
    // Add to speaker history with timestamp
    speakerHistory.push({
      speaker: speakerName,
      time: new Date()
    });
  }
}

// Show results after processing
function showResults(results: any) {
  // Get meeting name (use document title or a default)
  const meetingName = document.title || 'Meeting Transcript';
  
  // Save transcript
  browser.runtime.sendMessage({
    action: MessageAction.SAVE_TRANSCRIPT,
    data: results,
    filename: meetingName
  });
  
  // Update UI
  updateStatusUI('Transcript ready!');
}