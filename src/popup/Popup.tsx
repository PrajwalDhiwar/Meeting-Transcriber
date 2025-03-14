import { useEffect, useState } from 'react'
import browser from 'webextension-polyfill';
import { StorageKeys, MessageAction, MeetingPlatform } from '@/lib/types';

interface ApiKeyStatus {
  assemblyAI: boolean;
  gemini: boolean;
}

interface MeetingInfo {
  active: boolean;
  platform?: MeetingPlatform;
  recording: boolean;
  tabId?: number;
}

const Popup = () => {
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus>({ assemblyAI: false, gemini: false });
  const [status, setStatus] = useState<string>('Loading...');
  const [statusType, setStatusType] = useState<'info' | 'error'>('info');
  const [meetingInfo, setMeetingInfo] = useState<MeetingInfo>({ active: false, recording: false });
  
  useEffect(() => {
    // Check API keys status
    checkApiKeys();
    
    // Check for active meeting
    checkForActiveMeeting();
  }, []);
  
  // Check if API keys are set
  const checkApiKeys = async () => {
    try {
      const result = await browser.storage.sync.get([
        StorageKeys.ASSEMBLY_AI_KEY,
        StorageKeys.GEMINI_KEY
      ]);
      
      const assemblyAI = !!result[StorageKeys.ASSEMBLY_AI_KEY];
      const gemini = !!result[StorageKeys.GEMINI_KEY];
      
      setApiKeys({ assemblyAI, gemini });
      
      if (!assemblyAI || !gemini) {
        setStatus('Please set your API keys in the options');
        setStatusType('error');
      }
      
      return { assemblyAI, gemini };
    } catch (error) {
      console.error('Error checking API keys:', error);
      setStatus('Error checking API keys');
      setStatusType('error');
      return { assemblyAI: false, gemini: false };
    }
  };
  
  // Check for active meeting in current tab
  const checkForActiveMeeting = async () => {
    try {
      // Get current tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.url) {
        setStatus('No active tab found');
        return;
      }
      
      // Check if tab is a Zoom or Google Meet URL
      const isZoomMeeting = tab.url.includes('zoom.us/') && 
                           (tab.url.includes('/j/') || tab.url.includes('/wc/'));
      const isGoogleMeet = tab.url.includes('meet.google.com/');
      
      if (isZoomMeeting || isGoogleMeet) {
        const platform = isZoomMeeting ? MeetingPlatform.ZOOM : MeetingPlatform.GOOGLE_MEET;
        
        // Check if recording is in progress
        const response = await browser.runtime.sendMessage({
          action: MessageAction.CHECK_RECORDING_STATUS,
          tabId: tab.id
        });
        
        setMeetingInfo({
          active: true,
          platform,
          recording: response.recording,
          tabId: tab.id
        });
        
        setStatus(`Active ${platform} meeting detected`);
      } else {
        setStatus('No meeting detected. Open Zoom or Google Meet to use this extension.');
        setMeetingInfo({ active: false, recording: false });
      }
    } catch (error) {
      console.error('Error checking for meeting:', error);
      setStatus('Error detecting meeting');
      setStatusType('error');
    }
  };
  
  // Open options page
  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };
  
  // Start recording
  const startRecording = async () => {
    if (!meetingInfo.active || !meetingInfo.tabId) {
      setStatus('No active meeting detected');
      setStatusType('error');
      return;
    }
    
    try {
      // Check if API keys are set
      const keyStatus = await checkApiKeys();
      
      if (!keyStatus.assemblyAI || !keyStatus.gemini) {
        setStatus('API keys not set. Please configure in options.');
        setStatusType('error');
        return;
      }
      
      // Send message to start recording
      await browser.runtime.sendMessage({ 
        action: MessageAction.START_RECORDING,
        tabId: meetingInfo.tabId
      });
      
      setMeetingInfo(prev => ({ ...prev, recording: true }));
      setStatus('Recording started');
      setStatusType('info');
    } catch (error) {
      console.error('Error starting recording:', error);
      setStatus('Error starting recording');
      setStatusType('error');
    }
  };
  
  // Stop recording
  const stopRecording = async () => {
    if (!meetingInfo.active || !meetingInfo.tabId) {
      return;
    }
    
    try {
      // Send message to stop recording
      await browser.runtime.sendMessage({ 
        action: MessageAction.STOP_RECORDING,
        tabId: meetingInfo.tabId
      });
      
      setMeetingInfo(prev => ({ ...prev, recording: false }));
      setStatus('Processing recording...');
      setStatusType('info');
    } catch (error) {
      console.error('Error stopping recording:', error);
      setStatus('Error stopping recording');
      setStatusType('error');
    }
  };
  
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Meeting Transcriber</h1>
      
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <div className={`w-3 h-3 rounded-full mr-2 ${apiKeys.assemblyAI ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>AssemblyAI API Key</span>
        </div>
        <div className="flex items-center mb-2">
          <div className={`w-3 h-3 rounded-full mr-2 ${apiKeys.gemini ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span>Gemini API Key</span>
        </div>
        <button 
          onClick={openOptions}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
        >
          Set API Keys
        </button>
      </div>
      
      {meetingInfo.active ? (
        <div className="mb-4">
          <div className="bg-blue-100 p-3 rounded mb-4">
            {`Active ${meetingInfo.platform} meeting detected`}
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={startRecording}
              disabled={meetingInfo.recording || !apiKeys.assemblyAI || !apiKeys.gemini}
              className={`flex-1 py-2 px-4 rounded ${
                meetingInfo.recording || !apiKeys.assemblyAI || !apiKeys.gemini
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              Start Recording
            </button>
            <button 
              onClick={stopRecording}
              disabled={!meetingInfo.recording}
              className={`flex-1 py-2 px-4 rounded ${
                !meetingInfo.recording
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
      
      <div className={`p-3 rounded ${statusType === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
        {status}
      </div>
      
      <footer className="mt-4 text-center text-xs text-gray-500 border-t pt-4">
        Make sure you have permission to record meetings.
      </footer>
    </div>
  );
};

export default Popup;