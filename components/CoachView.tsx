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

// Simple Base64 encoding for raw bytes
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Simple Base64 decoding
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

  const start = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffDays = Math.ceil(Math.abs(now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcription]);

  const stopSession = () => {
    console.log("Closing sanctuary session...");
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
  };

  const startSession = async () => {
    console.log("Invoking the Shaman...");
    setError(null);
    setStatus('connecting');

    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === "undefined" || apiKey === "" || apiKey === "null") {
      setError("API Key is missing from the environment. Please ensure you have added 'API_KEY' in Vercel Project Settings and redeployed with 'Clean Cache'.");
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
          Be compassionate, soulful, and non-judgmental. 
          Help them through their struggles and celebrate their milestones. 
          If they are stressed, offer grounding exercises. 
          Keep your responses relatively brief but meaningful.`,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Sanctuary established.");
            setStatus('active');
            setIsActive(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Local Volume Meter
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setInputVolume(Math.min(100, rms * 500));

              // PCM 16 Conversion
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
            // Handle Audio Playback
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
              const outCtx = audioContextsRef.current?.output;
              if (outCtx) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                const buffer = await decodeAudioData(decode(audioData), outCtx, 24000, 1);
                const source = outCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(outCtx.destination);
                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
                };
                sourcesRef.current.add(source);
                setIsAiSpeaking(true);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
              }
            }

            // Handle Interruptions
            if (message.serverContent?.interrupted) {
              for (const source of sourcesRef.current) {
                try { source.stop(); } catch(e) {}
              }
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
            }

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription?.text) {
              setTranscription(prev => [...prev, `You: ${message.serverContent?.inputTranscription?.text}`]);
            }
            if (message.serverContent?.outputTranscription?.text) {
              setTranscription(prev => [...prev, `Shaman: ${message.serverContent?.outputTranscription?.text}`]);
            }
          },
          onerror: (e) => {
            console.error("Sanctuary Error:", e);
            setError("The connection was lost. Please try reconnecting.");
            stopSession();
          },
          onclose: () => {
            console.log("Sanctuary closed.");
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Sanctuary Failed:", err);
      setError(err.message || "Could not connect to the Shaman.");
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-shaman-forest/40 border border-shaman-gold/30 p-8 rounded-3xl backdrop-blur-md relative overflow-hidden">
        <header className="text-center mb-8 relative z-10">
          <h2 className="text-3xl font-serif text-shaman-gold gold-text-glow">Voice Sanctuary</h2>
          <p className="text-shaman-moss">Speak freely. You are in a safe, healing space.</p>
        </header>

        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-500/50 text-red-200 p-4 rounded-xl text-center">
            {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center space-y-8 relative z-10">
          {/* Central Pulsing Orb */}
          <div className="relative">
            <div className={`w-32 h-32 rounded-full border-2 transition-all duration-700 flex items-center justify-center
              ${isActive ? 'border-shaman-gold scale-110 shadow-[0_0_30px_rgba(197,160,89,0.4)]' : 'border-shaman-moss/30 opacity-60'}`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500
                ${isAiSpeaking ? 'bg-shaman-gold/40 animate-pulse' : 'bg-shaman-moss/20'}`}>
                <svg className={`w-12 h-12 ${isActive ? 'text-shaman-gold' : 'text-shaman-moss'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            
            {/* Input Volume Ring */}
            {isActive && (
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-shaman-gold/30 transition-transform duration-75"
                style={{ width: `${128 + inputVolume}px`, height: `${128 + inputVolume}px` }}
              />
            )}
          </div>

          <div className="text-center space-y-4">
            {status === 'idle' && (
              <button 
                onClick={startSession}
                className="bg-shaman-gold text-shaman-deep px-8 py-3 rounded-full font-serif font-bold text-lg hover:shadow-[0_0_20px_rgba(197,160,89,0.5)] transition-all"
              >
                Invoke the Shaman
              </button>
            )}

            {status === 'connecting' && (
              <div className="flex items-center space-x-2 text-shaman-gold">
                <div className="w-2 h-2 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                <div className="w-2 h-2 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-shaman-gold rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                <span className="font-serif italic">Establishing Sanctuary...</span>
              </div>
            )}

            {status === 'active' && (
              <button 
                onClick={stopSession}
                className="bg-shaman-moss/20 border border-shaman-moss text-shaman-parchment px-8 py-3 rounded-full hover:bg-shaman-moss/40 transition-all"
              >
                Close Sanctuary
              </button>
            )}
          </div>
        </div>

        {/* Floating Ornaments */}
        <div className="absolute top-0 left-0 p-8 opacity-5 pointer-events-none">
          <svg className="w-32 h-32 text-shaman-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
        </div>
      </div>

      {/* Transcription Area */}
      {transcription.length > 0 && (
        <div className="bg-shaman-deep/60 border border-shaman-gold/10 p-6 rounded-2xl h-64 overflow-y-auto font-sans text-sm space-y-3 scrollbar-hide">
          <h4 className="text-shaman-gold uppercase text-[10px] tracking-widest mb-4 sticky top-0 bg-shaman-deep/80 py-1">Sanctuary Transcription</h4>
          {transcription.map((line, idx) => (
            <p key={idx} className={`${line.startsWith('You:') ? 'text-shaman-moss' : 'text-shaman-parchment italic'} leading-relaxed`}>
              {line}
            </p>
          ))}
          <div ref={transcriptionEndRef} />
        </div>
      )}
    </div>
  );
};

export default CoachView;