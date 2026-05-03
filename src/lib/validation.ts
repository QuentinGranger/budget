// ============================================================================
// Input Validation Helpers for API Routes
// ============================================================================

import { NextResponse } from 'next/server';

// ---- Numeric Validation ----

export function safeFloat(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return n;
}

export function safeInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? Math.round(value) : parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function requireFloat(value: unknown, field: string, opts?: { min?: number; max?: number }): { value: number } | { error: string } {
  const n = safeFloat(value);
  if (n === null) return { error: `${field} must be a valid number` };
  if (opts?.min !== undefined && n < opts.min) return { error: `${field} must be >= ${opts.min}` };
  if (opts?.max !== undefined && n > opts.max) return { error: `${field} must be <= ${opts.max}` };
  return { value: n };
}

export function requireInt(value: unknown, field: string, opts?: { min?: number; max?: number }): { value: number } | { error: string } {
  const n = safeInt(value);
  if (n === null) return { error: `${field} must be a valid integer` };
  if (opts?.min !== undefined && n < opts.min) return { error: `${field} must be >= ${opts.min}` };
  if (opts?.max !== undefined && n > opts.max) return { error: `${field} must be <= ${opts.max}` };
  return { value: n };
}

// ---- String Validation ----

export function requireString(value: unknown, field: string, opts?: { minLength?: number; maxLength?: number }): { value: string } | { error: string } {
  if (typeof value !== 'string' || value.trim().length === 0) return { error: `${field} is required` };
  const trimmed = value.trim();
  if (opts?.minLength !== undefined && trimmed.length < opts.minLength) return { error: `${field} must be at least ${opts.minLength} characters` };
  if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) return { error: `${field} must not exceed ${opts.maxLength} characters` };
  return { value: trimmed };
}

export function optionalString(value: unknown, field: string, opts?: { maxLength?: number }): { value: string | undefined } | { error: string } {
  if (value === undefined || value === null || value === '') return { value: undefined };
  if (typeof value !== 'string') return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (opts?.maxLength !== undefined && trimmed.length > opts.maxLength) return { error: `${field} must not exceed ${opts.maxLength} characters` };
  return { value: trimmed };
}

// ---- Enum Validation ----

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): { value: T } | { error: string } {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return { error: `${field} must be one of: ${allowed.join(', ')}` };
  }
  return { value: value as T };
}

export function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): { value: T | undefined } | { error: string } {
  if (value === undefined || value === null || value === '') return { value: undefined };
  return requireEnum(value, field, allowed);
}

// ---- Date Validation ----

export function requireDate(value: unknown, field: string): { value: Date } | { error: string } {
  if (!value) return { error: `${field} is required` };
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return { error: `${field} must be a valid date` };
  return { value: d };
}

export function optionalDate(value: unknown, field: string): { value: Date | undefined } | { error: string } {
  if (value === undefined || value === null || value === '') return { value: undefined };
  return requireDate(value, field) as { value: Date | undefined } | { error: string };
}

// ---- Boolean Validation ----

export function optionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return Boolean(value);
}

// ---- Batch Validation Helper ----

type ValidationResult = { error: string } | { value: unknown } | { value: undefined };

export function hasError(result: ValidationResult): result is { error: string } {
  return 'error' in result;
}

export function validationError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

// ---- Constants ----

export const PILLARS = ['needs', 'wants', 'savings'] as const;
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'MAD', 'XOF', 'XAF'] as const;
export const FINANCIAL_GOALS = ['control', 'savings', 'debt', 'growth', 'freedom'] as const;
export const COMFORT_LEVELS = ['frugal', 'moderate', 'comfortable'] as const;
export const DISCIPLINE_LEVELS = ['flexible', 'moderate', 'strict'] as const;
export const INCOME_TYPES = ['stable', 'variable', 'mixed'] as const;
export const INCOME_FREQUENCIES = ['monthly', 'biweekly', 'weekly', 'yearly'] as const;
export const INCOME_CATEGORIES = ['primary', 'secondary', 'passive', 'other'] as const;

export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_NOTE_LENGTH = 1000;
export const MAX_AMOUNT = 999_999_999;
