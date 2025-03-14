import { useState, useEffect } from 'react'
import browser from 'webextension-polyfill'
import { StorageKeys } from '@/lib/types'

const Options = () => {
  const [assemblyAiKey, setAssemblyAiKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [autoTranscribe, setAutoTranscribe] = useState(false)
  const [showAssemblyAiKey, setShowAssemblyAiKey] = useState(false)
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | ''>('')
  const [assemblyAiKeyStatus, setAssemblyAiKeyStatus] = useState<'valid' | 'invalid' | 'unknown'>('unknown')
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<'valid' | 'invalid' | 'unknown'>('unknown')

  // Load saved settings
  useEffect(() => {
    loadSettings()
  }, [])

  // Load settings from storage
  const loadSettings = async () => {
    try {
      const result = await browser.storage.sync.get([
        StorageKeys.ASSEMBLY_AI_KEY,
        StorageKeys.GEMINI_KEY,
        StorageKeys.AUTO_TRANSCRIBE
      ])
      
      // Set state with loaded values
      if (result[StorageKeys.ASSEMBLY_AI_KEY]) {
        setAssemblyAiKey(result[StorageKeys.ASSEMBLY_AI_KEY])
        setAssemblyAiKeyStatus('valid')
      }
      
      if (result[StorageKeys.GEMINI_KEY]) {
        setGeminiKey(result[StorageKeys.GEMINI_KEY])
        setGeminiKeyStatus('valid')
      }
      
      setAutoTranscribe(!!result[StorageKeys.AUTO_TRANSCRIBE])
    } catch (error) {
      console.error('Error loading settings:', error)
      showSaveMessage('Error loading settings', 'error')
    }
  }

  // Save settings
  const saveSettings = async () => {
    try {
      // Basic validation
      if (!assemblyAiKey.trim()) {
        showSaveMessage('AssemblyAI API key is required', 'error')
        return
      }
      
      if (!geminiKey.trim()) {
        showSaveMessage('Gemini API key is required', 'error')
        return
      }
      
      // Save to storage
      await browser.storage.sync.set({
        [StorageKeys.ASSEMBLY_AI_KEY]: assemblyAiKey.trim(),
        [StorageKeys.GEMINI_KEY]: geminiKey.trim(),
        [StorageKeys.AUTO_TRANSCRIBE]: autoTranscribe
      })
      
      showSaveMessage('Settings saved successfully!', 'success')
      
      // Validate keys
      validateAssemblyAiKey()
      validateGeminiKey()
    } catch (error) {
      console.error('Error saving settings:', error)
      showSaveMessage('Error saving settings', 'error')
    }
  }

  // Show save message with timeout
  const showSaveMessage = (message: string, status: 'success' | 'error') => {
    setSaveMessage(message)
    setSaveStatus(status)
    
    // Hide message after 5 seconds
    setTimeout(() => {
      setSaveMessage('')
      setSaveStatus('')
    }, 5000)
  }

  // Validate AssemblyAI key
  const validateAssemblyAiKey = async () => {
    if (!assemblyAiKey.trim()) {
      setAssemblyAiKeyStatus('invalid')
      return
    }
    
    try {
      // Simple API check
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'GET',
        headers: {
          'Authorization': assemblyAiKey
        }
      })
      
      if (response.ok) {
        setAssemblyAiKeyStatus('valid')
      } else {
        setAssemblyAiKeyStatus('invalid')
      }
    } catch (error) {
      console.error('Error validating AssemblyAI key:', error)
      // Just check length if API check fails
      setAssemblyAiKeyStatus(assemblyAiKey.length >= 32 ? 'valid' : 'invalid')
    }
  }

  // Validate Gemini key
  const validateGeminiKey = async () => {
    if (!geminiKey.trim()) {
      setGeminiKeyStatus('invalid')
      return
    }
    
    try {
      // Simple API check with a basic query
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: 'Hello'
            }]
          }]
        })
      })
      
      if (response.ok) {
        setGeminiKeyStatus('valid')
      } else {
        setGeminiKeyStatus('invalid')
      }
    } catch (error) {
      console.error('Error validating Gemini key:', error)
      // Check if key starts with "AI" as a basic format check
      setGeminiKeyStatus(geminiKey.startsWith('AI') ? 'valid' : 'invalid')
    }
  }

  return (
    <div className="container mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-6 text-blue-600">Meeting Transcriber Options</h1>
      
      {/* AssemblyAI Section */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">AssemblyAI API Key</h2>
        <div className="prose mb-4">
          <p>Meeting Transcriber uses AssemblyAI for speech-to-text transcription. You need to provide your own API key.</p>
          <ol className="list-decimal ml-5">
            <li>Sign up for a free account at <a href="https://www.assemblyai.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">AssemblyAI</a></li>
            <li>Get your API key from the dashboard</li>
            <li>Enter it below</li>
          </ol>
        </div>
        
        <div className="mb-4">
          <label htmlFor="assemblyai-key" className="block font-medium mb-2">AssemblyAI API Key:</label>
          <div className="flex items-center">
            <input 
              type={showAssemblyAiKey ? "text" : "password"} 
              id="assemblyai-key"
              value={assemblyAiKey}
              onChange={(e) => setAssemblyAiKey(e.target.value)}
              className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your AssemblyAI API key"
            />
            <button 
              className="ml-2 text-blue-600 hover:underline text-sm"
              onClick={() => setShowAssemblyAiKey(!showAssemblyAiKey)}
            >
              {showAssemblyAiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex items-center mt-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              assemblyAiKeyStatus === 'valid' ? 'bg-green-500' : 
              assemblyAiKeyStatus === 'invalid' ? 'bg-red-500' : 
              'bg-gray-300'
            }`}></div>
            <span className="text-sm">
              {assemblyAiKeyStatus === 'valid' ? 'Key configured' : 
               assemblyAiKeyStatus === 'invalid' ? 'Key invalid' : 
               'Key not configured'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Gemini Section */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Gemini API Key</h2>
        <div className="prose mb-4">
          <p>Meeting Transcriber uses Google's Gemini API for summarization. You need to provide your own API key.</p>
          <ol className="list-decimal ml-5">
            <li>Visit <a href="https://makersuite.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a> and sign in</li>
            <li>Get your API key from the "Get API key" section</li>
            <li>Enter it below</li>
          </ol>
        </div>
        
        <div className="mb-4">
          <label htmlFor="gemini-key" className="block font-medium mb-2">Gemini API Key:</label>
          <div className="flex items-center">
            <input 
              type={showGeminiKey ? "text" : "password"} 
              id="gemini-key"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your Gemini API key"
            />
            <button 
              className="ml-2 text-blue-600 hover:underline text-sm"
              onClick={() => setShowGeminiKey(!showGeminiKey)}
            >
              {showGeminiKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex items-center mt-2">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              geminiKeyStatus === 'valid' ? 'bg-green-500' : 
              geminiKeyStatus === 'invalid' ? 'bg-red-500' : 
              'bg-gray-300'
            }`}></div>
            <span className="text-sm">
              {geminiKeyStatus === 'valid' ? 'Key configured' : 
               geminiKeyStatus === 'invalid' ? 'Key invalid' : 
               'Key not configured'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Additional Settings */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Additional Settings</h2>
        
        <div className="flex items-center">
          <input 
            type="checkbox" 
            id="auto-transcribe"
            checked={autoTranscribe}
            onChange={(e) => setAutoTranscribe(e.target.checked)}
            className="mr-2 h-4 w-4"
          />
          <label htmlFor="auto-transcribe">
            Automatically start transcribing when joining a meeting
          </label>
        </div>
      </div>
      
      {/* Save Button */}
      <button 
        onClick={saveSettings}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
      >
        Save Settings
      </button>
      
      {/* Save Message */}
      {saveMessage && (
        <div className={`mt-4 p-3 rounded ${
          saveStatus === 'success' ? 'bg-green-100 text-green-800' : 
          'bg-red-100 text-red-800'
        }`}>
          {saveMessage}
        </div>
      )}
    </div>
  )
}

export default Options