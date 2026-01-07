
import { User, ChatMessage, UserProgress } from '../types';

const USERS_KEY = 'shaman_users_v1';
const CHAT_HISTORY_KEY = 'shaman_chats_v1';

export const db = {
  getUsers: (): User[] => {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveUser: (user: User) => {
    const users = db.getUsers();
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  },

  getUserByEmail: (email: string): User | undefined => {
    return db.getUsers().find(u => u.email === email);
  },

  getChatHistory: (userId: string): ChatMessage[] => {
    const data = localStorage.getItem(`${CHAT_HISTORY_KEY}_${userId}`);
    return data ? JSON.parse(data) : [];
  },

  saveChatHistory: (userId: string, messages: ChatMessage[]) => {
    localStorage.setItem(`${CHAT_HISTORY_KEY}_${userId}`, JSON.stringify(messages));
  }
};
