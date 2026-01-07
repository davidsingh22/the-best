
import React, { useState } from 'react';
import { db } from '../services/db';
import { User } from '../types';

interface RegisterViewProps {
  onRegister: (user: User) => void;
  onSwitchToLogin: () => void;
}

const RegisterView: React.FC<RegisterViewProps> = ({ onRegister, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    city: '',
    country: '',
    phone: '',
    password: '',
    sobrietyDate: new Date().toISOString().split('T')[0]
  });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (db.getUserByEmail(formData.email)) {
      setError('An account with this email already exists.');
      return;
    }

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      email: formData.email,
      city: formData.city,
      country: formData.country,
      phone: formData.phone,
      password: formData.password,
      role: 'user',
      sobrietyStartDate: new Date(formData.sobrietyDate).toISOString(),
      registrationDate: new Date().toISOString()
    };

    db.saveUser(newUser);
    onRegister(newUser);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="max-w-2xl mx-auto mt-4">
      <div className="bg-shaman-forest/40 border border-shaman-gold/30 p-8 rounded-2xl backdrop-blur-lg">
        <h2 className="text-3xl font-serif text-shaman-gold text-center mb-6">Begin Your Journey</h2>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm text-shaman-moss mb-1">Full Name</label>
            <input 
              name="name" type="text" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.name} onChange={handleChange}
            />
          </div>
          
          <div>
            <label className="block text-sm text-shaman-moss mb-1">Email Address</label>
            <input 
              name="email" type="email" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.email} onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm text-shaman-moss mb-1">Phone Number</label>
            <input 
              name="phone" type="tel" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.phone} onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm text-shaman-moss mb-1">City</label>
            <input 
              name="city" type="text" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.city} onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm text-shaman-moss mb-1">Country</label>
            <input 
              name="country" type="text" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.country} onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm text-shaman-moss mb-1">Sobriety Start Date</label>
            <input 
              name="sobrietyDate" type="date" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.sobrietyDate} onChange={handleChange}
            />
          </div>

          <div>
            <label className="block text-sm text-shaman-moss mb-1">Password</label>
            <input 
              name="password" type="password" required
              className="w-full bg-shaman-deep/60 border border-shaman-moss/50 rounded-lg px-4 py-3 focus:outline-none focus:border-shaman-gold text-shaman-parchment"
              value={formData.password} onChange={handleChange}
            />
          </div>
          
          {error && <p className="md:col-span-2 text-red-400 text-sm">{error}</p>}
          
          <div className="md:col-span-2 mt-4">
            <button 
              type="submit"
              className="w-full bg-shaman-gold hover:bg-shaman-gold/80 text-shaman-deep font-bold py-4 rounded-lg transition-all shadow-lg shadow-shaman-gold/20"
            >
              Commit to Recovery
            </button>
          </div>
        </form>
        
        <div className="mt-8 text-center">
          <p className="text-shaman-moss">Already a member?</p>
          <button 
            onClick={onSwitchToLogin}
            className="text-shaman-gold hover:underline mt-2"
          >
            Log In Here
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
