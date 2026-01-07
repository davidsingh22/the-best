
import React from 'react';
import { User, AppView } from '../types';

interface DashboardViewProps {
  user: User;
  setView: (view: AppView) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ user, setView }) => {
  const sobrietyStart = new Date(user.sobrietyStartDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - sobrietyStart.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="text-center">
        <h1 className="text-4xl font-serif text-shaman-gold mb-2 gold-text-glow">Welcome, {user.name}</h1>
        <p className="text-shaman-moss">Today is a new day of strength and clarity.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-shaman-forest/40 border border-shaman-gold/20 p-8 rounded-2xl backdrop-blur-sm flex flex-col items-center justify-center text-center">
          <span className="text-shaman-moss uppercase text-xs tracking-widest mb-2 font-semibold">Days Sober</span>
          <span className="text-6xl font-serif text-shaman-gold mb-2">{diffDays}</span>
          <p className="text-shaman-parchment text-sm">Every breath is progress.</p>
        </div>

        <div className="md:col-span-2 bg-shaman-moss/10 border border-shaman-moss/20 p-8 rounded-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-xl font-serif text-shaman-gold mb-4">Daily Meditation</h3>
            <p className="italic text-shaman-parchment leading-relaxed">
              "Healing is not a destination, but a beautiful, unfolding path. The strength you seek is already within you, waiting to be acknowledged."
            </p>
            <div className="mt-6">
              <button 
                onClick={() => setView(AppView.COACH)}
                className="inline-flex items-center space-x-2 text-shaman-gold hover:text-shaman-gold/80 transition font-medium"
              >
                <span>Enter Voice Sanctuary</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <svg className="w-32 h-32 text-shaman-gold" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          </div>
        </div>
      </div>

      <div className="bg-shaman-deep/40 border border-shaman-gold/10 p-8 rounded-2xl">
        <h3 className="text-xl font-serif text-shaman-gold mb-6 border-b border-shaman-gold/10 pb-2">Your Milestones</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 7, 30, 90, 180, 365].map(day => (
            <div key={day} className={`p-4 rounded-xl border flex flex-col items-center ${diffDays >= day ? 'bg-shaman-gold/10 border-shaman-gold/40' : 'bg-shaman-deep/40 border-shaman-moss/20 opacity-40'}`}>
              <span className={`text-2xl font-serif ${diffDays >= day ? 'text-shaman-gold' : 'text-shaman-moss'}`}>{day}</span>
              <span className="text-[10px] uppercase tracking-tighter text-shaman-moss">Days</span>
              {diffDays >= day && (
                <div className="mt-2 text-shaman-gold">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="text-center pt-8">
        <button 
          onClick={() => setView(AppView.COACH)}
          className="bg-shaman-forest border border-shaman-gold text-shaman-gold px-12 py-4 rounded-full font-serif text-lg hover:bg-shaman-gold hover:text-shaman-deep transition-all shadow-xl shadow-shaman-gold/10"
        >
          Begin Voice Session
        </button>
      </div>
    </div>
  );
};

export default DashboardView;
