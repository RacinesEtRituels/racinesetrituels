import Stripe from 'stripe';

// Stripe should be initialized after the server has loaded environment variables.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export { stripe };
