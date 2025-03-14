/**
 * Gemini service for summarization
 */

interface TranscriptData {
    transcript: Array<{
      speaker: string;
      text: string;
      timestamp: string;
    }>;
    chapters: Array<{
      title: string;
      summary: string;
      start: string;
      end: string;
    }>;
  }
  
  interface ActionItem {
    text: string;
    assignee: string;
    speaker: string;
    timestamp: string;
  }
  
  /**
   * Generate a summary of the transcript using Gemini
   */
  export async function generateSummary(
    transcriptData: TranscriptData,
    apiKey: string
  ): Promise<{
    summary: string;
    actionItems: ActionItem[];
  }> {
    try {
      // Format transcript for Gemini prompt
      let formattedTranscript = '';
      transcriptData.transcript.forEach(entry => {
        formattedTranscript += `${entry.speaker} (${entry.timestamp}): ${entry.text}\n`;
      });
      
      // Create the prompt for summary
      const summaryPrompt = `
        You are an AI assistant tasked with summarizing a meeting transcript.
        
        Please provide a concise summary of the following meeting transcript.
        Focus on:
        1. The main topics discussed
        2. Key decisions made
        3. Important information shared
        
        Transcript:
        ${formattedTranscript}
        
        Summary:
      `;
      
      // Create prompt for action items
      const actionItemsPrompt = `
        You are an AI assistant tasked with extracting action items from a meeting transcript.
        
        Please identify all action items, tasks, and follow-ups mentioned in the transcript.
        For each action item, provide:
        1. The text of the action item
        2. Who is assigned to it (if mentioned)
        3. The speaker who mentioned it
        4. The timestamp when it was mentioned
        
        Format the output as a JSON array of objects with the following structure:
        [
          {
            "text": "Full text of the action item",
            "assignee": "Person assigned to the task",
            "speaker": "Speaker who mentioned it",
            "timestamp": "Timestamp"
          }
        ]
        
        If no assignee is specified, use "Unassigned".
        
        Transcript:
        ${formattedTranscript}
        
        Action Items (JSON format):
      `;
      
      // Call Gemini API for summary
      const summaryResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: summaryPrompt
            }]
          }]
        })
      });
      
      if (!summaryResponse.ok) {
        throw new Error(`Failed to generate summary: ${summaryResponse.statusText}`);
      }
      
      const summaryResult = await summaryResponse.json();
      const summary = summaryResult.candidates[0].content.parts[0].text;
      
      // Call Gemini API for action items
      const actionItemsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: actionItemsPrompt
            }]
          }]
        })
      });
      
      if (!actionItemsResponse.ok) {
        throw new Error(`Failed to extract action items: ${actionItemsResponse.statusText}`);
      }
      
      const actionItemsResult = await actionItemsResponse.json();
      const actionItemsText = actionItemsResult.candidates[0].content.parts[0].text;
      
      // Extract JSON from the response
      let actionItems: ActionItem[] = [];
      try {
        // Parse JSON from the response text
        const jsonMatch = actionItemsText.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
          actionItems = JSON.parse(jsonMatch[0]);
        } else {
          // Try to extract JSON if it's within markdown code blocks
          const codeBlockMatch = actionItemsText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            actionItems = JSON.parse(codeBlockMatch[1]);
          } else {
            // Basic fallback if no JSON found
            actionItems = [{ 
              text: "Could not parse action items", 
              assignee: "Unassigned", 
              speaker: "System", 
              timestamp: "00:00" 
            }];
          }
        }
      } catch (e) {
        console.error('Error parsing action items JSON:', e);
        actionItems = [{ 
          text: "Error parsing action items", 
          assignee: "Unassigned", 
          speaker: "System", 
          timestamp: "00:00" 
        }];
      }
      
      // Return combined results
      return {
        summary,
        actionItems
      };
    } catch (error) {
      console.error('Summary generation error:', error);
      throw error;
    }
  }