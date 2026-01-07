import { GoogleGenAI } from "@google/genai";
import { ChatMessage, User } from "../types";

const MODEL_NAME = 'gemini-3-pro-preview';

export async function getCoachResponse(
  user: User,
  history: ChatMessage[],
  newMessage: string
) {
  // Use the injected process.env.API_KEY directly
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Calculate sobriety days
  const start = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  const systemInstruction = `
    You are the "Ibogaine Shaman Recovery Coach". 
    Your tone is deeply compassionate, supportive, spiritual, and non-judgmental. 
    You are speaking with ${user.name} from ${user.city}, ${user.country}. 
    ${user.name} has been on their sobriety journey for ${diffDays} days. 
    
    CORE VALUES:
    - Deep empathy for the struggle of addiction.
    - Focus on resilience and the "inner healer".
    - Avoid medical advice, but encourage healthy coping strategies.
    - Celebrate milestones.
    - Use metaphors related to nature and rebirth when appropriate.
    - Maintain memory of previous discussions provided in history.
    
    Keep responses concise but soulful. Always acknowledge their progress.
  `;

  try {
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: newMessage }]
    });

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      }
    });

    return response.text || "I am here with you. Please tell me more.";
  } catch (error) {
    console.error("Coach API Error:", error);
    return "The path is momentarily obscured by mist. I am here, but I need a moment to reconnect. Please try again in a moment.";
  }
}