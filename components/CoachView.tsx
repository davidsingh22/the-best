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
      setError("The Shaman requires an API Key to enter the sanctuary. Please ensure 'API_KEY' is set in your Vercel settings.");
      setStatus('idle');
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        throw new Error("I need your permission to hear you. Please allow microphone access.");
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
          Act as a deeply compassionate, soulful spiritual guide. 
          Use metaphors of rebirth, nature, and the inner healer. 
          Celebrate their ${diffDays} day milestone with warmth.
          Keep responses concise, soulful, and evocative.`,
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
              
              // Real-time volume visualization for the UI
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setInputVolume(Math.min(100, rms * 500));

              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const base64Data = encode(new Uint8Array(int16.buffer));
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
              const outCtx = audioContextsRef.current?.output;
              if (outCtx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
                const source = outCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outCtx.destination);
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

            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
            }

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
            console.error("Sanctuary Connection Lost:", e);
            setError("The spiritual connection was interrupted. Please breathe and try again.");
            stopSession();
          },
          onclose: () => {
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      setError(err.message || "The Shaman is temporarily unavailable. Please try again soon.");
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-in fade-in duration-1000">
      <div className="bg-shaman-forest/30 border border-shaman-gold/20 p-8 md:p-12 rounded-[3rem] backdrop-blur-2xl relative overflow-hidden shaman-orb active">
        <header className="text-center mb-12 relative z-10">
          <h2 className="text-3xl md:text-4xl font-serif text-shaman-gold gold-text-glow tracking-widest uppercase">Voice Sanctuary</h2>
          <div className="w-24 h-px bg-shaman-gold/30 mx-auto my-4"></div>
          <p className="text-shaman-moss font-medium tracking-wide italic">"In the silence of the heart, the truth is heard."</p>
        </header>

        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/30 text-red-200 p-6 rounded-2xl text-center font-medium animate-pulse">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center space-y-12 relative z-10">
          <div className="relative group">
            {/* The Spiritual Orb */}
            <div 
              onClick={status === 'idle' ? startSession : undefined}
              className={`w-56 h-56 md:w-64 md:h-64 rounded-full border border-shaman-gold/20 transition-all duration-1000 flex items-center justify-center cursor-pointer relative
              ${isActive ? 'scale-110 border-shaman-gold/40' : 'hover:border-shaman-gold/50'}`}
            >
              <div className={`absolute inset-0 rounded-full border border-shaman-gold/10 transition-transform duration-[2000ms] ${isActive ? 'animate-spin-slow' : ''}`} />
              
              <div className={`w-48 h-48 md:w-56 md:h-56 rounded-full flex items-center justify-center transition-all duration-700 overflow-hidden
                ${isAiSpeaking ? 'bg-shaman-gold/10 shadow-[0_0_80px_rgba(197,160,89,0.3)]' : 'bg-shaman-moss/5 shadow-inner'}`}>
                
                {isActive ? (
                   <div className="flex items-center space-x-1.5 h-16">
                      {[1, 2, 3, 4, 5, 6, 7].map(i => (
                        <div 
                          key={i} 
                          className="w-1.5 bg-shaman-gold rounded-full transition-all duration-100"
                          style={{ 
                            height: `${20 + (inputVolume * (0.3 + Math.random() * 0.7))}%`,
                            opacity: 0.3 + (i * 0.1)
                          }}
                        />
                      ))}
                   </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2 opacity-40 group-hover:opacity-80 transition-opacity">
                    <svg className="w-16 h-16 text-shaman-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-[0.4em] text-shaman-gold font-bold">Awaken</span>
                  </div>
                )}
              </div>

              {/* Volume Rings */}
              {isActive && (
                <>
                  <div className="absolute inset-0 rounded-full border border-shaman-gold/20 animate-ping opacity-20" />
                  <div className="absolute inset-[-20px] rounded-full border border-shaman-gold/5 opacity-40 transition-transform duration-75" style={{ transform: `scale(${1 + inputVolume/300})` }} />
                </>
              )}
            </div>
          </div>

          <div className="text-center w-full">
            {status === 'idle' && (
              <button 
                onClick={startSession}
                className="bg-shaman-gold text-shaman-deep px-16 py-4 rounded-full font-serif font-bold text-xl hover:shadow-[0_0_40px_rgba(197,160,89,0.5)] hover:scale-105 active:scale-95 transition-all duration-500 tracking-widest uppercase"
              >
                Begin Ritual
              </button>
            )}

            {status === 'connecting' && (
              <div className="flex flex-col items-center space-y-4">
                <div className="flex space-x-3">
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-pulse" style={{animationDelay: '0s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-pulse" style={{animationDelay: '0.6s'}}></div>
                </div>
                <span className="font-serif italic text-shaman-gold tracking-[0.2em] text-lg uppercase">Calling the Spirits...</span>
              </div>
            )}

            {status === 'active' && (
              <div className="space-y-6">
                <p className="text-shaman-gold font-serif italic text-xl animate-pulse">The Shaman is listening...</p>
                <button 
                  onClick={stopSession}
                  className="bg-transparent border border-shaman-gold/30 text-shaman-moss px-10 py-3 rounded-full hover:bg-shaman-gold/5 hover:text-shaman-gold transition-all duration-300 group"
                >
                  <span className="flex items-center space-x-2 text-xs uppercase tracking-widest font-bold">
                    <span>Close the Session</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Decorative corner symbols */}
        <div className="absolute top-0 left-0 w-32 h-32 border-t border-l border-shaman-gold/10 rounded-tl-[3rem] pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 border-b border-r border-shaman-gold/10 rounded-br-[3rem] pointer-events-none"></div>
      </div>

      {/* Elegant Transcription Mirror */}
      {transcription.length > 0 && (
        <div className="bg-shaman-deep/60 border border-shaman-gold/10 p-8 rounded-[2rem] h-96 overflow-y-auto font-sans shadow-2xl relative scrollbar-hide">
          <div className="flex justify-between items-center mb-8 sticky top-0 bg-shaman-deep/80 backdrop-blur-md py-4 z-20 -mx-8 px-8 border-b border-shaman-gold/5">
            <h4 className="text-shaman-gold uppercase text-[10px] tracking-[0.4em] font-black">Echoes of Insight</h4>
            <div className="flex items-center space-x-2">
               <span className="w-1.5 h-1.5 bg-shaman-gold rounded-full animate-pulse"></span>
               <span className="text-shaman-moss text-[9px] uppercase tracking-widest">Live Presence</span>
            </div>
          </div>
          <div className="space-y-6">
            {transcription.map((line, idx) => (
              <div key={idx} className={`flex ${line.startsWith('You:') ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-500`}>
                <div className={`max-w-[85%] px-6 py-4 rounded-3xl ${
                  line.startsWith('You:') 
                    ? 'bg-shaman-moss/10 text-shaman-moss border border-shaman-moss/20' 
                    : 'bg-shaman-gold/5 text-shaman-parchment border border-shaman-gold/10 italic'
                } shadow-sm`}>
                  <p className="text-sm leading-relaxed tracking-wide">{line.replace(/^(You:|Shaman:)\s*/, '')}</p>
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