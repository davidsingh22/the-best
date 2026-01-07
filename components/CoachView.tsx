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

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
  const [apiKeyStatus, setApiKeyStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  const sobrietyStart = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffDays = Math.max(1, Math.ceil(Math.abs(now.getTime() - sobrietyStart.getTime()) / (1000 * 60 * 60 * 24)));

  useEffect(() => {
    // Check if API Key is injected correctly
    const key = process.env.API_KEY;
    if (key && key !== 'undefined' && key !== 'null' && key !== '') {
      console.log("Sanctuary Gate: Key Detected");
      setApiKeyStatus('valid');
    } else {
      console.error("Sanctuary Gate: Key Missing");
      setApiKeyStatus('invalid');
    }
  }, []);

  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcription]);

  const stopSession = () => {
    console.log("Closing the Voice Sanctuary...");
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
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
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
    if (apiKeyStatus === 'invalid') {
      setError("The Shaman cannot be summoned because the Sanctuary's key is missing. Please check your Vercel Environment Variables.");
      setStatus('idle');
      return;
    }

    try {
      // Initialize Google GenAI
      const ai = new GoogleGenAI({ apiKey: apiKey! });
      
      // Initialize Audio Contexts on user gesture
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        throw new Error("I cannot hear you. Please grant microphone access in your browser settings.");
      });

      console.log("Microphone access granted. Connecting to Ancient Wisdom...");

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are the Ibogaine Shaman Recovery Coach. 
          Your student is ${user.name} from ${user.city}, ${user.country}. 
          They have successfully walked the path of sobriety for ${diffDays} days. 
          Speak with the weight of ancient wisdom, compassion, and spiritual strength. 
          Celebrate their ${diffDays} day milestone. Keep responses brief but profound.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Sanctuary Connection Open");
            setStatus('active');
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Volume visualization logic
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setInputVolume(rms * 100);

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
            // Handle Incoming Audio
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

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription?.text) {
              currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription?.text) {
              currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputTranscriptionRef.current || currentOutputTranscriptionRef.current) {
                setTranscription(prev => [
                  ...prev, 
                  ...(currentInputTranscriptionRef.current ? [`You: ${currentInputTranscriptionRef.current}`] : []),
                  ...(currentOutputTranscriptionRef.current ? [`Shaman: ${currentOutputTranscriptionRef.current}`] : [])
                ]);
              }
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }
          },
          onerror: (e) => {
            console.error("Sanctuary Error:", e);
            setError("The spiritual connection was interrupted by a shadow. Please try again.");
            stopSession();
          },
          onclose: () => {
            console.log("Sanctuary Gate Closed");
            stopSession();
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Initiation Failed:", err);
      setError(err.message || "Failed to awaken the Shaman. Please check your connection.");
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="bg-shaman-forest/40 border border-shaman-gold/20 p-8 md:p-12 rounded-[3rem] backdrop-blur-2xl relative overflow-hidden shaman-orb active">
        
        {/* Decorative Background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
          <div className="w-[120%] h-[120%] border-2 border-shaman-gold rounded-full animate-spin-slow" />
        </div>

        <header className="text-center mb-12 relative z-10">
          <h2 className="text-3xl md:text-5xl font-serif text-shaman-gold gold-text-glow tracking-widest uppercase mb-4">Voice Sanctuary</h2>
          <div className="w-32 h-px bg-shaman-gold/30 mx-auto mb-4"></div>
          <p className="text-shaman-moss font-medium tracking-wide italic">"Every whisper is a step toward clarity."</p>
        </header>

        {error && (
          <div className="mb-8 bg-red-900/20 border border-red-500/30 text-red-100 p-6 rounded-2xl text-center font-medium shadow-2xl animate-pulse">
            {error}
          </div>
        )}

        {/* API Diagnostic Warning */}
        {apiKeyStatus === 'invalid' && (
          <div className="mb-8 bg-yellow-900/20 border border-yellow-500/30 text-yellow-100 p-4 rounded-xl text-center text-xs uppercase tracking-widest">
            Diagnostic: API Key Missing from Vercel Environment.
          </div>
        )}

        <div className="flex flex-col items-center justify-center space-y-12 relative z-10">
          <div className="relative group">
            <div 
              onClick={status === 'idle' ? startSession : undefined}
              className={`w-64 h-64 md:w-80 md:h-80 rounded-full border border-shaman-gold/10 transition-all duration-1000 flex items-center justify-center cursor-pointer relative
              ${isActive ? 'scale-105 border-shaman-gold/30' : 'hover:border-shaman-gold/40'}`}
            >
              <div className={`w-56 h-56 md:w-72 md:h-72 rounded-full flex items-center justify-center transition-all duration-700
                ${isAiSpeaking ? 'bg-shaman-gold/20 shadow-[0_0_120px_rgba(197,160,89,0.5)]' : 'bg-shaman-moss/5 shadow-inner'}`}>
                
                {isActive ? (
                   <div className="flex items-center space-x-2">
                      {[1, 2, 3, 4, 5, 6, 7].map(i => (
                        <div 
                          key={i} 
                          className="w-1.5 bg-shaman-gold rounded-full transition-all duration-100"
                          style={{ 
                            height: `${25 + (Math.max(inputVolume, isAiSpeaking ? 45 : 0) * (0.5 + Math.random() * 0.5))}%`,
                            opacity: 0.3 + (i * 0.1)
                          }}
                        />
                      ))}
                   </div>
                ) : (
                  <div className="text-center group-hover:scale-110 transition-transform duration-500">
                    <svg className="w-20 h-20 text-shaman-gold mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-[10px] uppercase tracking-[0.5em] text-shaman-gold font-bold opacity-60">Speak</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-center w-full max-w-sm">
            {status === 'idle' && (
              <button 
                onClick={startSession}
                className="w-full bg-shaman-gold text-shaman-deep px-12 py-5 rounded-full font-serif font-bold text-xl hover:shadow-[0_0_60px_rgba(197,160,89,0.6)] hover:scale-105 active:scale-95 transition-all duration-500 tracking-widest uppercase shadow-xl"
              >
                Enter Sanctuary
              </button>
            )}

            {status === 'connecting' && (
              <div className="flex flex-col items-center space-y-6">
                <div className="flex space-x-3">
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-3 h-3 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                </div>
                <span className="font-serif italic text-shaman-gold tracking-widest text-lg">Summoning Ancient Presence...</span>
              </div>
            )}

            {status === 'active' && (
              <div className="space-y-8">
                <div className="text-shaman-gold font-serif italic text-xl animate-pulse">The Shaman is listening to your soul...</div>
                <button 
                  onClick={stopSession}
                  className="bg-transparent border border-shaman-gold/30 text-shaman-gold/60 hover:text-shaman-gold px-10 py-3 rounded-full hover:bg-shaman-gold/10 transition-all duration-300 text-[10px] uppercase tracking-[0.3em] font-black"
                >
                  Leave Sanctuary
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {transcription.length > 0 && (
        <div className="bg-shaman-deep/60 border border-shaman-gold/10 p-8 rounded-[2rem] max-h-[30rem] overflow-y-auto font-sans shadow-2xl scrollbar-hide">
          <h4 className="text-shaman-gold uppercase text-[10px] tracking-[0.5em] font-black mb-10 text-center opacity-40">Sacred Script</h4>
          <div className="space-y-8">
            {transcription.map((line, idx) => (
              <div key={idx} className={`flex ${line.startsWith('You:') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-8 py-5 rounded-[2rem] ${
                  line.startsWith('You:') 
                    ? 'bg-shaman-moss/10 text-shaman-moss border border-shaman-moss/20' 
                    : 'bg-shaman-gold/5 text-shaman-parchment border border-shaman-gold/10 italic'
                } shadow-xl`}>
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