
import React from 'react';
import { User, AppView } from '../types';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  currentView: AppView;
  setView: (view: AppView) => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, currentView, setView }) => {
  return (
    <nav className="bg-shaman-deep/80 backdrop-blur-md border-b border-shaman-gold/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div 
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => user ? setView(AppView.DASHBOARD) : setView(AppView.LOGIN)}
        >
          <div className="w-8 h-8 rounded-full border border-shaman-gold flex items-center justify-center text-shaman-gold font-serif">
            IS
          </div>
          <span className="font-serif text-lg tracking-widest text-shaman-gold hidden sm:block">
            IBOGAINE SHAMAN
          </span>
        </div>

        <div className="flex items-center space-x-4 md:space-x-8">
          {user && (
            <>
              <button 
                onClick={() => setView(AppView.DASHBOARD)}
                className={`text-sm hover:text-shaman-gold transition ${currentView === AppView.DASHBOARD ? 'text-shaman-gold border-b border-shaman-gold' : 'text-shaman-parchment'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setView(AppView.COACH)}
                className={`text-sm hover:text-shaman-gold transition ${currentView === AppView.COACH ? 'text-shaman-gold border-b border-shaman-gold' : 'text-shaman-parchment'}`}
              >
                Voice Sanctuary
              </button>
              {user.role === 'admin' && (
                <button 
                  onClick={() => setView(AppView.ADMIN)}
                  className={`text-sm hover:text-shaman-gold transition ${currentView === AppView.ADMIN ? 'text-shaman-gold border-b border-shaman-gold font-bold' : 'text-shaman-gold'}`}
                >
                  Admin
                </button>
              )}
              <button 
                onClick={onLogout}
                className="text-xs bg-shaman-moss/20 hover:bg-shaman-moss/40 border border-shaman-moss text-shaman-parchment px-3 py-1 rounded"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
