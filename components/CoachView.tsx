
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { User } from '../types';

interface CoachViewProps {
  user: User;
}

// Audio helpers as required by Gemini Live API specs
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const CoachView: React.FC<CoachViewProps> = ({ user }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [transcription, setTranscription] = useState('');
  
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Calculate sobriety days for the instruction
  const start = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const stopSession = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (audioContextsRef.current) {
      audioContextsRef.current.input.close();
      audioContextsRef.current.output.close();
      audioContextsRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    for (const source of sourcesRef.current) {
      source.stop();
    }
    sourcesRef.current.clear();
    setIsActive(false);
    setStatus('idle');
    setIsAiSpeaking(false);
    setInputVolume(0);
    setTranscription('');
  };

  const startSession = async () => {
    setStatus('connecting');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Explicitly resume contexts for browser permission
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate volume for visual feedback
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setInputVolume(Math.min(100, rms * 500)); // Scale for visibility

              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const base64Data = encode(new Uint8Array(int16.buffer));
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({
                  media: {
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=16000',
                  },
                });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Transcription
            if (message.serverContent?.inputTranscription) {
              setTranscription(prev => (prev + ' ' + message.serverContent?.inputTranscription?.text).slice(-100));
            }
            if (message.serverContent?.turnComplete) {
              setTranscription('');
            }

            // Handle Audio
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setIsAiSpeaking(true);
              const ctx = audioContextsRef.current!.output;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) {
                  setIsAiSpeaking(false);
                }
              };
              
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => {
            console.error("Live session error:", e);
            stopSession();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `
            You are the "Ibogaine Shaman Recovery Coach". 
            Your tone is deeply compassionate, spiritual, and non-judgmental. 
            You are speaking with ${user.name} from ${user.city}. 
            ${user.name} is on day ${diffDays} of their sobriety.
            
            This is a VOICE interaction. Keep your responses natural, warm, and relatively short.
            - Focus on celebrating their ${diffDays} days.
            - If they sound like they are struggling, provide immediate emotional anchoring.
            - Greet them warmly when they arrive.
          `,
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus('idle');
    }
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-serif text-shaman-gold mb-2 gold-text-glow">Voice Sanctuary</h2>
        <p className="text-shaman-moss">Your coach is listening. Just start speaking.</p>
      </div>

      <div className="relative flex items-center justify-center">
        {/* Dynamic Glowing Aura based on Volume */}
        <div 
          className="absolute inset-0 rounded-full blur-3xl transition-all duration-100 opacity-30"
          style={{ 
            backgroundColor: isActive ? '#c5a059' : 'transparent',
            transform: `scale(${1 + (inputVolume / 100)})`,
            opacity: isActive ? (0.2 + (inputVolume / 200)) : 0
          }}
        ></div>

        {/* Visualizer Orb */}
        <div 
          className={`w-64 h-64 rounded-full border-2 transition-all duration-300 flex items-center justify-center relative z-10
            ${isActive 
              ? 'border-shaman-gold shadow-[0_0_50px_rgba(197,160,89,0.2)] bg-shaman-deep/80' 
              : 'border-shaman-moss/30 bg-transparent'
            }`}
        >
          {/* Microphone Volume Meter */}
          {isActive && !isAiSpeaking && (
             <div className="absolute bottom-6 flex space-x-1 items-end h-8">
                {[...Array(8)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1.5 bg-shaman-gold/60 rounded-full transition-all duration-75"
                    style={{ height: `${Math.max(10, Math.random() * inputVolume + (i*2))} %` }}
                  ></div>
                ))}
             </div>
          )}

          <div 
            className={`w-48 h-48 rounded-full transition-all duration-500 flex items-center justify-center
              ${isActive ? 'opacity-100' : 'opacity-20'}
              ${isAiSpeaking ? 'scale-110 bg-shaman-gold/10' : 'scale-100 bg-shaman-moss/5'}
            `}
          >
            <div 
              className={`w-32 h-32 rounded-full border border-shaman-gold/40 flex items-center justify-center transition-all
                ${isAiSpeaking ? 'animate-pulse scale-105 border-shaman-gold' : ''}
              `}
            >
              <svg 
                className={`w-16 h-16 transition-colors duration-500 ${isActive ? 'text-shaman-gold' : 'text-shaman-moss'}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col items-center space-y-4">
        <div className="h-12 flex flex-col items-center text-center px-4">
          {status === 'connecting' && <span className="text-shaman-gold animate-pulse text-sm">Invoking the Shaman...</span>}
          {status === 'active' && (
            <>
              <span className="text-shaman-gold font-serif tracking-widest uppercase text-xs mb-2">
                {isAiSpeaking ? "The Shaman Speaks" : "Sanctuary Open"}
              </span>
              <p className="text-shaman-parchment/60 text-xs italic line-clamp-2">
                {transcription ? `"${transcription}..."` : (isAiSpeaking ? "" : "Speak now, I am here.")}
              </p>
            </>
          )}
          {status === 'idle' && <span className="text-shaman-moss text-xs italic">The circle is quiet. Click below to begin.</span>}
        </div>

        {!isActive ? (
          <button 
            onClick={startSession}
            disabled={status === 'connecting'}
            className="group relative px-12 py-5 bg-shaman-gold text-shaman-deep font-serif text-xl rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-2xl shadow-shaman-gold/20"
          >
            <span className="relative z-10 flex items-center space-x-3">
              <span>Begin Voice Healing</span>
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          </button>
        ) : (
          <button 
            onClick={stopSession}
            className="px-10 py-3 border border-red-500/40 text-red-400/80 text-sm font-medium rounded-full hover:bg-red-500/10 transition-all flex items-center space-x-2"
          >
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
            <span>Close Sanctuary</span>
          </button>
        )}
      </div>

      <div className="bg-shaman-forest/20 border border-shaman-moss/10 p-5 rounded-2xl max-w-sm text-center">
        <div className="flex justify-center mb-2">
           <div className={`w-2 h-2 rounded-full mr-2 ${inputVolume > 5 ? 'bg-green-500' : 'bg-gray-600'}`}></div>
           <span className="text-[10px] text-shaman-moss uppercase tracking-tighter">Mic Activity Sensor</span>
        </div>
        <p className="text-[11px] text-shaman-moss/60 italic leading-relaxed">
          "If the Shaman does not hear you, ensure your browser has permission and speak clearly into the light."
        </p>
      </div>
    </div>
  );
};

export default CoachView;
