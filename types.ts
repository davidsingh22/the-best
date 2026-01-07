
export interface User {
  id: string;
  name: string;
  email: string;
  city: string;
  country: string;
  phone: string;
  password?: string;
  role: 'user' | 'admin';
  sobrietyStartDate: string; // ISO string
  registrationDate: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface UserProgress {
  userId: string;
  messages: ChatMessage[];
  lastUpdate: string;
}

export enum AppView {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  DASHBOARD = 'DASHBOARD',
  COACH = 'COACH',
  ADMIN = 'ADMIN'
}
