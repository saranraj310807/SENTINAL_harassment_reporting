import { api } from './api.js';

export const DEMO_CREDENTIALS = {
  student1: { email: 'priya.sharma@campus.edu', pass: 'SentinelDemo2026!', label: 'Priya Sharma (Student CSE)' },
  student2: { email: 'rahul.varma@campus.edu', pass: 'SentinelDemo2026!', label: 'Rahul Varma (Student ECE)' },
  hod_cse: { email: 'hod.cse@campus.edu', pass: 'SentinelDemo2026!', label: 'Dr. Ramanathan (HOD CSE)' },
  hod_ece: { email: 'hod.ece@campus.edu', pass: 'SentinelDemo2026!', label: 'Dr. Meenakshi (HOD ECE)' },
  dean: { email: 'dean.studentaffairs@campus.edu', pass: 'SentinelDemo2026!', label: 'Dr. Aruna (Dean of Student Affairs)' },
  higher: { email: 'director.safety@campus.edu', pass: 'SentinelDemo2026!', label: 'Prof. Rajagopal (Campus Safety Director)' }
};

class AuthService {
  constructor() {
    this.user = null;
    this.listeners = new Set();
    this.initialized = false;
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.user);
    }
  }

  async checkSession() {
    try {
      const res = await api.get('/api/auth/me');
      if (res.csrfToken) {
        api.setCsrfToken(res.csrfToken);
      }
      this.user = res.authenticated ? res.user : null;
    } catch {
      this.user = null;
    } finally {
      this.initialized = true;
      this.notify();
    }
    return this.user;
  }

  async login(email, password) {
    const res = await api.post('/api/auth/login', { email, password });
    this.user = res.user;
    this.notify();
    return this.user;
  }

  async quickLogin(key) {
    const creds = DEMO_CREDENTIALS[key];
    if (!creds) throw new Error('Unknown demo account');
    return this.login(creds.email, creds.pass);
  }

  async register(data) {
    return api.post('/api/auth/register', data);
  }

  async logout() {
    try {
      await api.post('/api/auth/logout', {});
    } finally {
      this.user = null;
      this.notify();
    }
  }

  isAuthenticated() {
    return Boolean(this.user);
  }

  isStudent() {
    return this.user?.role === 'student';
  }

  isAuthority() {
    return ['hod', 'dean', 'higher'].includes(this.user?.role);
  }

  hasRole(roles) {
    if (!this.user) return false;
    const list = Array.isArray(roles) ? roles : [roles];
    return list.includes(this.user.role);
  }
}

export const auth = new AuthService();
