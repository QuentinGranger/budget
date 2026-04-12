export type Pillar = 'needs' | 'wants' | 'savings';

export interface CategoryDef {
  name: string;
  icon: string;
  pillar: Pillar;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: 'Loyer', icon: 'home', pillar: 'needs' },
  { name: 'Courses', icon: 'shopping-cart', pillar: 'needs' },
  { name: 'Transport', icon: 'car', pillar: 'needs' },
  { name: 'Assurance', icon: 'shield', pillar: 'needs' },
  { name: 'Sante', icon: 'heart-pulse', pillar: 'needs' },
  { name: 'Electricite', icon: 'zap', pillar: 'needs' },
  { name: 'Eau', icon: 'droplets', pillar: 'needs' },
  { name: 'Internet', icon: 'wifi', pillar: 'needs' },
  { name: 'Telephone', icon: 'phone', pillar: 'needs' },
  { name: 'Alimentation', icon: 'utensils', pillar: 'needs' },
  { name: 'Vetements essentiels', icon: 'shirt', pillar: 'needs' },
  { name: 'Education', icon: 'graduation-cap', pillar: 'needs' },
  { name: 'Restaurants', icon: 'utensils-crossed', pillar: 'wants' },
  { name: 'Sorties', icon: 'ticket', pillar: 'wants' },
  { name: 'Shopping', icon: 'shopping-bag', pillar: 'wants' },
  { name: 'Abonnements', icon: 'tv', pillar: 'wants' },
  { name: 'Loisirs', icon: 'gamepad-2', pillar: 'wants' },
  { name: 'Vacances', icon: 'plane', pillar: 'wants' },
  { name: 'Cadeaux', icon: 'gift', pillar: 'wants' },
  { name: 'Sport', icon: 'dumbbell', pillar: 'wants' },
  { name: 'Beaute', icon: 'sparkles', pillar: 'wants' },
  { name: 'Epargne', icon: 'piggy-bank', pillar: 'savings' },
  { name: 'Investissement', icon: 'trending-up', pillar: 'savings' },
];

export interface SmartSplitInput {
  totalIncome: number;
  monthlyFixedExpenses: number;
  financialGoal: string;
  comfortLevel: string;
  incomeType: string;
  disciplineLevel: string;
}

export interface SmartSplitResult {
  needs: number;
  wants: number;
  savings: number;
  reasoning: string[];
  isRealistic: boolean;
  resteAVivre: number;
  incomeProfile: 'low' | 'medium' | 'high';
  pressureLevel: 'low' | 'moderate' | 'high' | 'critical';
}
