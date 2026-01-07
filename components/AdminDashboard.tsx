
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { User } from '../types';

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setUsers(db.getUsers());
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex justify-between items-center border-b border-shaman-gold/20 pb-6">
        <div>
          <h2 className="text-3xl font-serif text-shaman-gold gold-text-glow">Admin Sanctuary</h2>
          <p className="text-shaman-moss">Reviewing the healing community members.</p>
        </div>
        <div className="bg-shaman-gold/10 border border-shaman-gold/30 px-6 py-2 rounded-full text-shaman-gold font-bold">
          Total Members: {users.length}
        </div>
      </header>

      <div className="bg-shaman-forest/40 border border-shaman-gold/20 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-shaman-gold/10 text-shaman-gold uppercase text-xs tracking-widest font-bold">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Sober Since</th>
                <th className="px-6 py-4">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-shaman-moss/20">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-shaman-moss/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-shaman-parchment">{user.name}</div>
                    <div className="text-[10px] text-shaman-gold uppercase tracking-tighter">{user.role}</div>
                  </td>
                  <td className="px-6 py-4 text-shaman-moss text-sm">{user.email}</td>
                  <td className="px-6 py-4 text-shaman-moss text-sm">{user.city}, {user.country}</td>
                  <td className="px-6 py-4 text-shaman-moss text-sm">{user.phone}</td>
                  <td className="px-6 py-4 text-shaman-parchment text-sm">
                    {new Date(user.sobrietyStartDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-shaman-moss text-sm">
                    {new Date(user.registrationDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="p-12 text-center text-shaman-moss">
              No souls have registered yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
