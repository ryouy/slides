/** Is the paid plan purchasable in this build? Needs the Worker API (Stripe + Google sign-in) to be configured. */
export const billingAvailable = (): boolean => import.meta.env?.VITE_PREMIUM_ENABLED === 'true';

/** Opens Stripe Checkout through the Worker (wired up together with the account layer). */
export async function startCheckout(): Promise<void> {
  /* implemented with the account/billing API */
}
