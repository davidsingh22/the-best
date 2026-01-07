
import React, { useState, useEffect } from 'react';
import { User, AppView, ChatMessage } from './types';
import { db } from './services/db';
import LoginView from './components/LoginView';
import RegisterView from './components/RegisterView';
import DashboardView from './components/DashboardView';
import CoachView from './components/CoachView';
import AdminDashboard from './components/AdminDashboard';
import Navbar from './components/Navbar';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);

  useEffect(() => {
    // Check for existing session
    const savedUser = localStorage.getItem('shaman_active_session');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      setCurrentView(AppView.DASHBOARD);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('shaman_active_session');
    setCurrentUser(null);
    setCurrentView(AppView.LOGIN);
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('shaman_active_session', JSON.stringify(user));
    setCurrentView(AppView.DASHBOARD);
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.LOGIN:
        return <LoginView 
          onLogin={handleLogin} 
          onSwitchToRegister={() => setCurrentView(AppView.REGISTER)} 
        />;
      case AppView.REGISTER:
        return <RegisterView 
          onRegister={handleLogin} 
          onSwitchToLogin={() => setCurrentView(AppView.LOGIN)} 
        />;
      case AppView.DASHBOARD:
        return currentUser ? <DashboardView user={currentUser} setView={setCurrentView} /> : null;
      case AppView.COACH:
        return currentUser ? <CoachView user={currentUser} /> : null;
      case AppView.ADMIN:
        return currentUser?.role === 'admin' ? <AdminDashboard /> : null;
      default:
        return <LoginView onLogin={handleLogin} onSwitchToRegister={() => setCurrentView(AppView.REGISTER)} />;
    }
  };

  return (
    <div className="min-h-screen shaman-gradient flex flex-col">
      <Navbar 
        user={currentUser} 
        onLogout={handleLogout} 
        currentView={currentView} 
        setView={setCurrentView} 
      />
      <main className="flex-grow container mx-auto px-4 py-8">
        {renderView()}
      </main>
      <footer className="py-6 border-t border-shaman-moss/30 text-center text-shaman-moss text-sm">
        <p>© {new Date().getFullYear()} Ibogaine Shaman Recovery Coach. Together on the path.</p>
      </footer>
    </div>
  );
};

export default App;
