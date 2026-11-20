import { readFile } from "node:fs/promises";
import { normalise, trigramScore } from "@document-intake/core";
import type { CustomerDirectory, ResolvedCustomer, SourceDocument } from "@document-intake/core";

interface Customer {
  name: string;
  email: string;
  account: string;
  creditLimitCents?: number;
  openBalanceCents?: number;
}

function resolved(customer: Customer, score: number): ResolvedCustomer {
  return {
    account: customer.account,
    score,
    ambiguous: false,
    ...(customer.creditLimitCents === undefined ? {} : { creditLimitCents: customer.creditLimitCents }),
    ...(customer.openBalanceCents === undefined ? {} : { openBalanceCents: customer.openBalanceCents }),
  };
}

export async function jsonCustomerDirectory(file: string): Promise<CustomerDirectory> {
  const customers = JSON.parse(await readFile(file, "utf8")) as Customer[];
  return {
    async resolve(
      _doc: SourceDocument,
      fields: Record<string, string>,
      identity: Record<string, string>,
    ): Promise<ResolvedCustomer> {
      const email = (identity.email ?? "").toLowerCase();
      if (email !== "") {
        const byEmail = customers.find((customer) => customer.email.toLowerCase() === email);
        if (byEmail !== undefined) return resolved(byEmail, 1);
      }

      const account = fields.account;
      if (account !== undefined) {
        const byAccount = customers.find((customer) => customer.account === account);
        if (byAccount !== undefined) return resolved(byAccount, 1);
      }

      const wanted = normalise(identity.company ?? fields.company ?? "");
      if (wanted === "") return { score: 0, ambiguous: false };

      const exact = customers.filter((customer) => normalise(customer.name) === wanted);
      if (exact.length === 1 && exact[0] !== undefined) return resolved(exact[0], 1);
      if (exact.length > 1) return { score: 1, ambiguous: true };

      let best: { customer: Customer; score: number } | undefined;
      for (const customer of customers) {
        const score = trigramScore(wanted, customer.name);
        if (best === undefined || score > best.score) best = { customer, score };
      }
      if (best === undefined || best.score < 0.82) {
        return { score: best?.score ?? 0, ambiguous: false };
      }
      return resolved(best.customer, best.score);
    },
  };
}
