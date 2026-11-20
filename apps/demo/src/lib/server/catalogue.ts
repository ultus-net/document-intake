import { readFile } from "node:fs/promises";
import { classify, normalise, trigramScore } from "@document-intake/core";
import type { Catalogue, MatchResult } from "@document-intake/core";

interface Product {
  sku: string;
  name: string;
  manufacturerRef: string;
}

export async function jsonCatalogue(file: string): Promise<Catalogue> {
  const products = JSON.parse(await readFile(file, "utf8")) as Product[];
  return {
    async match(description: string): Promise<MatchResult> {
      const wanted = normalise(description);
      let best: { product: Product; score: number } | undefined;
      for (const product of products) {
        const name = normalise(product.name);
        if (name === wanted || wanted.includes(normalise(product.manufacturerRef))) {
          return { sku: product.sku, score: 1, exactReference: true, rule: "accept" };
        }
        const score = trigramScore(description, product.name);
        if (best === undefined || score > best.score) best = { product, score };
      }
      if (best === undefined) {
        return { score: 0, exactReference: false, rule: "reject" };
      }
      const rule = classify(best.score, false);
      return {
        ...(rule === "reject" ? {} : { sku: best.product.sku }),
        score: best.score,
        exactReference: false,
        rule,
      };
    },
  };
}
