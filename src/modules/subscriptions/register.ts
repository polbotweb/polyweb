/** Branchement du module subscriptions sur core/payments (récepteur des événements d'abonnement). */
import { setSubscriptionEventSink } from "@/core/payments/subscription-sink";
import { handleSubscriptionEvent } from "./services/webhook";

export const registerSubscriptions = (): void => setSubscriptionEventSink((provider, event) => handleSubscriptionEvent(provider, event));
