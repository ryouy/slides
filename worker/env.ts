/** The few Cloudflare types the Worker uses (kept local so the site build needs no extra packages). */
export interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
export interface Fetcher { fetch(request: Request): Promise<Response> }

export interface Env {
  /** Static site (the built `dist`). */
  ASSETS: Fetcher;
  /** D1 database binding. Absent until the database is created and bound: the API then answers 503. */
  DB?: D1Database;
  // Secrets / variables (see README "Premium: setup")
  SITE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
}

export const authConfigured = (e: Env): boolean => !!(e.DB && e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.SESSION_SECRET && e.SITE_URL);
export const billingConfigured = (e: Env): boolean => !!(authConfigured(e) && e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_ID);
