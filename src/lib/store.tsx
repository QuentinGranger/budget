'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import { computeBudgetSnapshot, type BudgetSnapshot, type EngineTransaction, type EngineGoal, type EngineSettings } from './budget-engine';

// ---- Types ----

interface UserSettings {
  id: string;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  tolerancePercent: number;
  budgetStartDay: number;
  strictMode: boolean;
  disciplineLevel: string;
  financialGoal: string;
  monthlyFixedExpenses: number;
  comfortLevel: string;
  incomeType: string;
}

interface Income {
  id: string;
  label: string;
  amount: number;
  type: string;
  frequency: string;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  pillar: string;
  isDefault: boolean;
  sortOrder: number;
}

interface Transaction {
  id: string;
  categoryId: string;
  amount: number;
  date: string;
  description: string;
  note: string;
  pillar: string;
  isRecurring: boolean;
  category?: Category;
}

interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  pillar: string;
  icon: string;
  color: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  onboarded: boolean;
  role: string;
  emailVerified: boolean;
  totpEnabled: boolean;
  createdAt: string;
  settings: UserSettings | null;
  incomes: Income[];
  categories: Category[];
  goals: Goal[];
}

interface AppState {
  user: User | null;
  transactions: Transaction[];
  loading: boolean;
  snapshot: BudgetSnapshot | null;
}

type Action =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_TRANSACTIONS'; payload: Transaction[] }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ADD_INCOME'; payload: Income }
  | { type: 'UPDATE_INCOME'; payload: Income }
  | { type: 'DELETE_INCOME'; payload: string }
  | { type: 'ADD_GOAL'; payload: Goal }
  | { type: 'UPDATE_GOAL'; payload: Goal }
  | { type: 'DELETE_GOAL'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: UserSettings }
  | { type: 'UPDATE_USER_PROFILE'; payload: Partial<User> }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: string };

// ---- Reducer ----

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload, loading: false };
    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [action.payload, ...state.transactions] };
    case 'UPDATE_TRANSACTION':
      return { ...state, transactions: state.transactions.map((t) => (t.id === action.payload.id ? action.payload : t)) };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'ADD_INCOME':
      return state.user ? { ...state, user: { ...state.user, incomes: [action.payload, ...state.user.incomes] } } : state;
    case 'UPDATE_INCOME':
      return state.user ? { ...state, user: { ...state.user, incomes: state.user.incomes.map((i) => (i.id === action.payload.id ? action.payload : i)) } } : state;
    case 'DELETE_INCOME':
      return state.user ? { ...state, user: { ...state.user, incomes: state.user.incomes.filter((i) => i.id !== action.payload) } } : state;
    case 'ADD_GOAL':
      return state.user ? { ...state, user: { ...state.user, goals: [action.payload, ...state.user.goals] } } : state;
    case 'UPDATE_GOAL':
      return state.user ? { ...state, user: { ...state.user, goals: state.user.goals.map((g) => (g.id === action.payload.id ? action.payload : g)) } } : state;
    case 'DELETE_GOAL':
      return state.user ? { ...state, user: { ...state.user, goals: state.user.goals.filter((g) => g.id !== action.payload) } } : state;
    case 'UPDATE_SETTINGS':
      return state.user ? { ...state, user: { ...state.user, settings: action.payload } } : state;
    case 'UPDATE_USER_PROFILE':
      return state.user ? { ...state, user: { ...state.user, ...action.payload } } : state;
    case 'ADD_CATEGORY':
      return state.user ? { ...state, user: { ...state.user, categories: [...state.user.categories, action.payload] } } : state;
    case 'DELETE_CATEGORY':
      return state.user ? { ...state, user: { ...state.user, categories: state.user.categories.filter((c) => c.id !== action.payload) } } : state;
    default:
      return state;
  }
}

// ---- Snapshot computation ----

// ── Synthetic loyer transactions ──
// Generates one "Loyer" transaction per month so it appears in lists and analytics.

function buildLoyerTransactions(user: User, monthsBack: number = 12): Transaction[] {
  const settings = user.settings;
  if (!settings || settings.monthlyFixedExpenses <= 0) return [];

  const loyerCat = user.categories.find((c) => c.name === 'Loyer') || null;
  const now = new Date();
  const txns: Transaction[] = [];

  for (let m = 0; m < monthsBack; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const dateStr = d.toISOString();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    txns.push({
      id: `__loyer__${key}`,
      categoryId: loyerCat?.id || '__loyer_cat__',
      amount: settings.monthlyFixedExpenses,
      date: dateStr,
      description: 'Loyer (charge fixe)',
      note: '',
      pillar: 'needs',
      isRecurring: true,
      category: loyerCat || { id: '__loyer_cat__', name: 'Loyer', icon: 'home', pillar: 'needs', isDefault: true, sortOrder: 0 },
    });
  }
  return txns;
}

function computeSnapshot(state: AppState, allTransactions: Transaction[]): BudgetSnapshot | null {
  const { user } = state;
  if (!user || !user.settings) return null;

  const totalIncome = user.incomes.filter((i) => i.isActive).reduce((sum, i) => sum + i.amount, 0);
  const s = user.settings;

  const engineSettings: EngineSettings = {
    needsPercent: s.needsPercent,
    wantsPercent: s.wantsPercent,
    savingsPercent: s.savingsPercent,
    tolerancePercent: s.tolerancePercent,
    monthlyFixedExpenses: s.monthlyFixedExpenses,
    financialGoal: s.financialGoal,
    comfortLevel: s.comfortLevel,
    incomeType: s.incomeType,
    disciplineLevel: s.disciplineLevel,
  };

  const engineTxns: EngineTransaction[] = allTransactions.map((t) => ({
    amount: t.amount,
    date: t.date,
    pillar: t.pillar,
    categoryId: t.categoryId,
    category: t.category ? { name: t.category.name, icon: t.category.icon, pillar: t.category.pillar } : undefined,
  }));

  const engineGoals: EngineGoal[] = user.goals.map((g) => ({
    name: g.name,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    targetDate: g.targetDate,
  }));

  return computeBudgetSnapshot(totalIncome, engineSettings, engineTxns, engineGoals);
}

// ---- Context ----

interface StoreContextValue {
  state: AppState;
  snapshot: BudgetSnapshot | null;
  allTransactions: Transaction[];
  dispatch: React.Dispatch<Action>;
  actions: typeof apiActions;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ---- API Actions ----

const apiActions = {
  async fetchUser(dispatch: React.Dispatch<Action>) {
    try {
      const res = await fetch('/api/user');
      if (!res.ok) {
        dispatch({ type: 'SET_USER', payload: null });
        return;
      }
      const user = await res.json();
      if (!user || !user.id) {
        dispatch({ type: 'SET_USER', payload: null });
        return;
      }
      dispatch({ type: 'SET_USER', payload: user });
      const txRes = await fetch('/api/transactions');
      if (txRes.ok) {
        const transactions = await txRes.json();
        dispatch({ type: 'SET_TRANSACTIONS', payload: Array.isArray(transactions) ? transactions : [] });
      }
    } catch {
      dispatch({ type: 'SET_USER', payload: null });
    }
  },

  async createTransaction(dispatch: React.Dispatch<Action>, data: Partial<Transaction>) {
    const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to create transaction');
    const transaction = await res.json();
    dispatch({ type: 'ADD_TRANSACTION', payload: transaction });
    return transaction;
  },

  async updateTransaction(dispatch: React.Dispatch<Action>, data: Partial<Transaction> & { id: string }) {
    const res = await fetch('/api/transactions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to update transaction');
    const transaction = await res.json();
    dispatch({ type: 'UPDATE_TRANSACTION', payload: transaction });
    return transaction;
  },

  async deleteTransaction(dispatch: React.Dispatch<Action>, id: string) {
    const res = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete transaction');
    dispatch({ type: 'DELETE_TRANSACTION', payload: id });
  },

  async createIncome(dispatch: React.Dispatch<Action>, data: Partial<Income>) {
    const res = await fetch('/api/incomes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to create income');
    const income = await res.json();
    dispatch({ type: 'ADD_INCOME', payload: income });
    return income;
  },

  async updateIncome(dispatch: React.Dispatch<Action>, data: Partial<Income> & { id: string }) {
    const res = await fetch('/api/incomes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to update income');
    const income = await res.json();
    dispatch({ type: 'UPDATE_INCOME', payload: income });
    return income;
  },

  async deleteIncome(dispatch: React.Dispatch<Action>, id: string) {
    const res = await fetch(`/api/incomes?id=${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete income');
    dispatch({ type: 'DELETE_INCOME', payload: id });
  },

  async createGoal(dispatch: React.Dispatch<Action>, data: Partial<Goal>) {
    const res = await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to create goal');
    const goal = await res.json();
    dispatch({ type: 'ADD_GOAL', payload: goal });
    return goal;
  },

  async updateGoal(dispatch: React.Dispatch<Action>, data: Partial<Goal> & { id: string }) {
    const res = await fetch('/api/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to update goal');
    const goal = await res.json();
    dispatch({ type: 'UPDATE_GOAL', payload: goal });
    return goal;
  },

  async deleteGoal(dispatch: React.Dispatch<Action>, id: string) {
    const res = await fetch(`/api/goals?id=${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete goal');
    dispatch({ type: 'DELETE_GOAL', payload: id });
  },

  async updateSettings(dispatch: React.Dispatch<Action>, data: Partial<UserSettings>) {
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to update settings');
    const settings = await res.json();
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
    return settings;
  },

  async updateProfile(dispatch: React.Dispatch<Action>, data: Partial<User>) {
    const res = await fetch('/api/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to update profile');
    const user = await res.json();
    dispatch({ type: 'SET_USER', payload: user });
    return user;
  },

  async deleteAccount() {
    const res = await fetch('/api/user', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete account');
  },

  async createCategory(dispatch: React.Dispatch<Action>, data: { name: string; icon: string; pillar: string }) {
    const res = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to create category');
    const category = await res.json();
    dispatch({ type: 'ADD_CATEGORY', payload: category });
    return category;
  },

  async deleteCategory(dispatch: React.Dispatch<Action>, id: string) {
    const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete category');
    }
    dispatch({ type: 'DELETE_CATEGORY', payload: id });
  },
};

// ---- Provider ----

const initialState: AppState = {
  user: null,
  transactions: [],
  loading: true,
  snapshot: null,
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchUser = useCallback(() => {
    apiActions.fetchUser(dispatch);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Inject synthetic loyer transactions into the full transaction list
  const allTransactions = useMemo(() => {
    if (!state.user) return state.transactions;
    const loyerTxns = buildLoyerTransactions(state.user);
    return [...loyerTxns, ...state.transactions];
  }, [state.user, state.transactions]);

  const snapshot = useMemo(() => computeSnapshot(state, allTransactions), [state, allTransactions]);

  const value = useMemo(() => ({ state, snapshot, allTransactions, dispatch, actions: apiActions }), [state, snapshot, allTransactions]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
