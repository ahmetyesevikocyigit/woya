import type { Order } from "../admin/schema";
import type { Address, Customer } from "./schema";
export type AccountData = { customer: Customer | null; addresses: Address[] };
export type ServiceRequest = {
  id: string;
  kind: "cancel" | "return" | "support";
  status: "open" | "reviewing" | "approved" | "rejected" | "closed";
  version: number;
  created_at: string;
  history: { status: string; at: string }[];
  messages: {
    id: string;
    author: "customer" | "admin";
    body: string;
    created_at: string;
  }[];
};
export type CustomerOrder = Pick<
  Order,
  "reference" | "status" | "customer" | "items" | "note" | "history" | "payment"
> & {
  id: string;
  created_at: string;
  linked: boolean;
  billing: Order["billing"];
  shipment: { carrier: string; trackingNumber: string } | null;
  requests: ServiceRequest[];
  documents?: { id: string; created_at: string }[];
  refunds?: {
    amount: number;
    provider_reference: string;
    performed_at: string;
    reason: string;
  }[];
  legal_snapshot?: {
    version: string;
    acceptedAt: string;
    store: import("../commerce/schema").StoreSettings;
  } | null;
};
