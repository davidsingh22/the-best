
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { User } from '../types';

interface CoachViewProps { user: User; }

// Audio decoding for raw PCM from Live API
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

// Base64 encoding for raw PCM transmission
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Base64 decoding for receiving PCM chunks
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const CoachView: React.FC<CoachViewProps> = ({ user }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [inputVolume, setInputVolume] = useState(0);
  const [transcription, setTranscription] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  // Refs for tracking incremental transcriptions
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const start = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffDays = Math.ceil(Math.abs(now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcription]);

  const stopSession = () => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
      sessionRef.current = null;
    }
    if (audioContextsRef.current) {
      try { audioContextsRef.current.input.close(); } catch(e) {}
      try { audioContextsRef.current.output.close(); } catch(e) {}
      audioContextsRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch(e) {}
    }
    sourcesRef.current.clear();
    setIsActive(false);
    setStatus('idle');
    setIsAiSpeaking(false);
    setInputVolume(0);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';
  };

  const startSession = async () => {
    setError(null);
    setStatus('connecting');

    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "" || apiKey === "null") {
      setError("API Key is missing. Please ensure you have added 'API_KEY' in environment settings.");
      setStatus('idle');
      return;
    }

    try {
      // FIX: Always use process.env.API_KEY directly when initializing GoogleGenAI
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        throw new Error("Microphone access denied. Please allow microphone usage.");
      });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are the Ibogaine Shaman Recovery Coach. 
          The user is ${user.name} from ${user.city}, ${user.country}. 
          They have been sober for ${diffDays} days. 
          Act as a deeply compassionate, supportive spiritual guide. 
          Use metaphors of rebirth, nature, and the inner healer. 
          Listen actively and respond with empathy. 
          Acknowledge their milestones. Keep responses concise and soulful.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Real-time volume visualization
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setInputVolume(Math.min(150, rms * 800));

              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const base64Data = encode(new Uint8Array(int16.buffer));
              
              // FIX: Ensure sendRealtimeInput is called only after the session promise resolves to avoid race conditions
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Process Output Audio
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
              const outCtx = audioContextsRef.current?.output;
              if (outCtx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
                const source = outCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outCtx.destination);
                // FIX: Use addEventListener for the 'ended' event to properly track playback state
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
                });
                sourcesRef.current.add(source);
                setIsAiSpeaking(true);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
              }
            }

            // Handle User Interruption
            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
            }

            // FIX: Implement incremental transcription tracking and turn-based UI updates
            if (message.serverContent?.inputTranscription?.text) {
              currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription?.text) {
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userText = currentInputTranscriptionRef.current;
              const shamanText = currentOutputTranscriptionRef.current;
              
              if (userText || shamanText) {
                setTranscription(prev => [
                  ...prev, 
                  ...(userText ? [`You: ${userText}`] : []),
                  ...(shamanText ? [`Shaman: ${shamanText}`] : [])
                ]);
              }
              
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }
          },
          onerror: (e) => {
            console.error("Connection Error:", e);
            setError("The spiritual connection was interrupted. Please try again.");
            stopSession();
          },
          onclose: () => {
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Session Start Failed:", err);
      setError(err.message || "Could not establish connection.");
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="bg-shaman-forest/40 border border-shaman-gold/30 p-10 rounded-[3rem] backdrop-blur-xl relative overflow-hidden shaman-orb active">
        <header className="text-center mb-10 relative z-10">
          <h2 className="text-4xl font-serif text-shaman-gold gold-text-glow mb-2">Voice Sanctuary</h2>
          <p className="text-shaman-moss font-medium tracking-wide">Enter into stillness and speak your truth.</p>
        </header>

        {error && (
          <div className="mb-8 bg-red-900/30 border border-red-500/50 text-red-200 p-5 rounded-2xl text-center font-medium">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center space-y-12 relative z-10">
          {/* Central Animated Shamanic Orb */}
          <div className="relative group cursor-pointer" onClick={status === 'idle' ? startSession : undefined}>
            <div className={`w-48 h-48 rounded-full border-2 transition-all duration-1000 flex items-center justify-center
              ${isActive ? 'border-shaman-gold scale-110' : 'border-shaman-moss/40 hover:border-shaman-gold/60'}`}>
              
              <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700
                ${isAiSpeaking ? 'bg-shaman-gold/30 shadow-[0_0_60px_rgba(197,160,89,0.5)]' : 'bg-shaman-moss/20 shadow-inner'}`}>
                
                {isActive ? (
                   <div className="flex items-end space-x-1 h-12">
                      {[1, 2, 3, 4, 5].map(i => (
                        <div 
                          key={i} 
                          className="w-1.5 bg-shaman-gold rounded-full transition-all duration-75"
                          style={{ 
                            height: `${Math.max(10, inputVolume * (0.5 + Math.random()))}%`,
                            opacity: 0.4 + (i * 0.1)
                          }}
                        />
                      ))}
                   </div>
                ) : (
                  <svg className="w-16 h-16 text-shaman-gold opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </div>
            </div>
            
            {/* Reactive Pulse Rings */}
            {isActive && (
              <>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 rounded-full border border-shaman-gold/10 animate-ping" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full border border-shaman-gold/5" style={{ transform: `translate(-50%, -50%) scale(${1 + inputVolume/500})` }} />
              </>
            )}
          </div>

          <div className="text-center space-y-6">
            {status === 'idle' && (
              <button 
                onClick={startSession}
                className="bg-shaman-gold text-shaman-deep px-12 py-4 rounded-full font-serif font-bold text-xl hover:shadow-[0_0_30px_rgba(197,160,89,0.6)] hover:scale-105 transition-all duration-300"
              >
                Begin Ritual
              </button>
            )}

            {status === 'connecting' && (
              <div className="flex flex-col items-center space-y-3">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                </div>
                <span className="font-serif italic text-shaman-gold tracking-widest text-lg">Calling the Shaman...</span>
              </div>
            )}

            {status === 'active' && (
              <button 
                onClick={stopSession}
                className="bg-shaman-deep/60 border border-shaman-moss text-shaman-parchment px-10 py-3 rounded-full hover:bg-shaman-moss/20 hover:text-shaman-gold transition-all duration-300 group"
              >
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-shaman-gold rounded-full group-hover:animate-ping"></span>
                  <span>End Session</span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Shamanic Symbols */}
        <div className="absolute -top-10 -right-10 opacity-[0.03] pointer-events-none rotate-12">
          <svg className="w-64 h-64 text-shaman-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
        </div>
      </div>

      {/* Transcription View */}
      {transcription.length > 0 && (
        <div className="bg-shaman-deep/80 border border-shaman-gold/10 p-8 rounded-[2rem] h-80 overflow-y-auto font-sans shadow-2xl relative">
          <div className="flex justify-between items-center mb-6 sticky top-0 bg-shaman-deep/90 py-2 z-20">
            <h4 className="text-shaman-gold uppercase text-xs tracking-[0.3em] font-bold">Session History</h4>
            <span className="text-shaman-moss text-[10px] bg-shaman-moss/10 px-3 py-1 rounded-full uppercase">Real-time Echo</span>
          </div>
          <div className="space-y-4">
            {transcription.map((line, idx) => (
              <div key={idx} className={`flex ${line.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-5 py-3 rounded-2xl ${
                  line.startsWith('You:') 
                    ? 'bg-shaman-moss/10 text-shaman-moss border border-shaman-moss/20' 
                    : 'bg-shaman-gold/5 text-shaman-parchment border border-shaman-gold/10 italic'
                }`}>
                  <p className="text-sm leading-relaxed">{line.replace(/^(You:|Shaman:)\s*/, '')}</p>
                </div>
              </div>
            ))}
          </div>
          <div ref={transcriptionEndRef} />
        </div>
      )}
    </div>
  );
};

export default CoachView;
