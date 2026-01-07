
import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';

interface LoginViewProps {
  onLogin: (user: User) => void;
  onSwitchToRegister: () => void;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin, onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Specific admin check
    if (email === 'alsenesa@hotmail.com' && password === 'Million2251$') {
      let admin = db.getUserByEmail(email);
      if (!admin) {
        // Auto-create admin if doesn't exist for demo/request purposes
        admin = {
          id: 'admin-1',
          name: 'Alsenesa Admin',
          email: 'alsenesa@hotmail.com',
          city: 'Admin City',
          country: 'Admin Country',
          phone: '0000000000',
          role: 'admin',
          sobrietyStartDate: new Date().toISOString(),
          registrationDate: new Date().toISOString()
        };
        db.saveUser(admin);
      }
      onLogin(admin);
      return;
    }

    const user = db.getUserByEmail(email);
    if (user && user.password === password) {
      onLogin(user);
    } else {
      setError('Invalid email or password. Please try again.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-shaman-forest/40 border border-shaman-gold/30 p-8 rounded-2xl backdrop-blur-lg">
        <h2 className="text-3xl font-serif text-shaman-gold text-center mb-6 gold-text-glow">Welcome Back</h2>
        <p className="text-shaman-moss text-center mb-8">Reconnect with your healing journey.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-shaman-moss mb-1">Email Address</label>
            <input 
              type="email" 
              required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-shaman-moss mb-1">Password</label>
            <input 
              type="password" 
              required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          
          <button 
            type="submit"
            className="w-full bg-shaman-gold hover:bg-shaman-gold/80 text-shaman-deep font-bold py-3 rounded-lg transition-all mt-6 shadow-lg shadow-shaman-gold/20"
          >
            Enter Sanctuary
          </button>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-shaman-moss">New to the sanctuary?</p>
          <button 
            onClick={onSwitchToRegister}
            className="text-shaman-gold hover:underline mt-2 font-medium"
          >
            Create Your Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
