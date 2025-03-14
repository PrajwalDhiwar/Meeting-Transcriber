/**
 * Common types for the Meeting Transcriber extension
 */

// Storage keys for browser.storage.sync
export enum StorageKeys {
    ASSEMBLY_AI_KEY = 'assemblyAiKey',
    GEMINI_KEY = 'geminiKey',
    AUTO_TRANSCRIBE = 'autoTranscribe'
  }
  
  // Meeting platforms
  export enum MeetingPlatform {
    ZOOM = 'zoom',
    GOOGLE_MEET = 'google-meet',
    UNKNOWN = 'unknown'
  }
  
  // Message action types
  export enum MessageAction {
    CHECK_ACTIVE = 'checkActive',
    MEETING_DETECTED = 'meetingDetected',
    START_RECORDING = 'startRecording',
    STOP_RECORDING = 'stopRecording',
    PROCESS_RECORDING = 'processRecording',
    UPDATE_STATUS = 'updateStatus',
    CHECK_API_KEYS = 'checkApiKeys',
    SAVE_TRANSCRIPT = 'saveTranscript',
    CHECK_RECORDING_STATUS = 'checkRecordingStatus'
  }
  
  // Transcript data
  export interface TranscriptEntry {
    speaker: string;
    text: string;
    timestamp: string;
  }
  
  export interface Chapter {
    title: string;
    summary: string;
    start: string;
    end: string;
  }
  
  export interface TranscriptData {
    transcript: TranscriptEntry[];
    chapters: Chapter[];
  }
  
  // Action item from meeting
  export interface ActionItem {
    text: string;
    assignee: string;
    speaker: string;
    timestamp: string;
  }
  
  // Summary data
  export interface SummaryData {
    summary: string;
    actionItems: ActionItem[];
  }
  
  // Full meeting data
  export interface MeetingData {
    transcript: TranscriptData;
    summary: SummaryData;
  }