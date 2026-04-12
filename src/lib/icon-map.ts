import type { LucideIcon } from 'lucide-react';
import {
  Home, ShoppingCart, Car, Shield, HeartPulse, Zap, Droplets, Wifi, Phone,
  Utensils, Shirt, GraduationCap, UtensilsCrossed, Ticket, ShoppingBag, Tv,
  Gamepad2, Plane, Gift, Dumbbell, Sparkles, PiggyBank, TrendingUp, CreditCard,
} from 'lucide-react';

// ── Lucide icon name → React component ──
const ICON_COMPONENT: Record<string, LucideIcon> = {
  'home': Home,
  'shopping-cart': ShoppingCart,
  'car': Car,
  'shield': Shield,
  'heart-pulse': HeartPulse,
  'zap': Zap,
  'droplets': Droplets,
  'wifi': Wifi,
  'phone': Phone,
  'utensils': Utensils,
  'shirt': Shirt,
  'graduation-cap': GraduationCap,
  'utensils-crossed': UtensilsCrossed,
  'ticket': Ticket,
  'shopping-bag': ShoppingBag,
  'tv': Tv,
  'gamepad-2': Gamepad2,
  'plane': Plane,
  'gift': Gift,
  'dumbbell': Dumbbell,
  'sparkles': Sparkles,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
};

export function getIconComponent(iconName: string): LucideIcon {
  return ICON_COMPONENT[iconName] || CreditCard;
}

// ── Lucide icon name → emoji (for <option> and plain text contexts) ──
const ICON_EMOJI: Record<string, string> = {
  'home': '🏠',
  'shopping-cart': '🛒',
  'car': '🚗',
  'shield': '🛡️',
  'heart-pulse': '❤️',
  'zap': '⚡',
  'droplets': '💧',
  'wifi': '📶',
  'phone': '📱',
  'utensils': '🍽️',
  'shirt': '👕',
  'graduation-cap': '🎓',
  'utensils-crossed': '🍴',
  'ticket': '🎟️',
  'shopping-bag': '🛍️',
  'tv': '📺',
  'gamepad-2': '🎮',
  'plane': '✈️',
  'gift': '🎁',
  'dumbbell': '💪',
  'sparkles': '✨',
  'piggy-bank': '🐷',
  'trending-up': '📈',
};

export function iconToEmoji(iconName: string): string {
  return ICON_EMOJI[iconName] || '💳';
}
