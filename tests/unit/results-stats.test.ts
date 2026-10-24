import { describe, expect, it } from "vitest";
import { percent, weightedMean, weightedMedian } from "@/features/results/stats";
import { periodSchema } from "@/features/results/schemas";

describe("percent (RN-16)", () => {
  it("usa uma casa decimal e 0 sem base", () => {
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(1, 8)).toBe(12.5);
    expect(percent(3, 3)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("média e mediana ponderadas", () => {
  it("calculam sobre as contagens", () => {
    const items = [
      { value: 5, count: 3 },
      { value: 4, count: 3 },
      { value: 3, count: 1 },
      { value: 2, count: 1 },
      { value: 1, count: 1 },
      { value: 0, count: 1 },
    ];
    expect(weightedMean(items)).toBe(3.3);
    expect(weightedMedian(items)).toBe(4);
  });

  it("mediana com total par entre dois valores diferentes", () => {
    expect(
      weightedMedian([
        { value: 1.5, count: 1 },
        { value: 4, count: 1 },
      ]),
    ).toBe(2.75);
  });

  it("mediana com total ímpar e opções sem escolha", () => {
    expect(
      weightedMedian([
        { value: 8, count: 0 },
        { value: 0.5, count: 2 },
        { value: 12, count: 1 },
      ]),
    ).toBe(0.5);
  });

  it("sem escolhas devolvem null", () => {
    expect(weightedMean([{ value: 1, count: 0 }])).toBeNull();
    expect(weightedMedian([])).toBeNull();
  });
});

describe("periodSchema", () => {
  it("aceita período vazio, só início ou início igual ao fim", () => {
    expect(periodSchema.parse({})).toEqual({});
    expect(periodSchema.parse({ from: "2026-10-20" })).toEqual({ from: "2026-10-20" });
    expect(periodSchema.safeParse({ from: "2026-10-20", to: "2026-10-20" }).success).toBe(true);
  });

  it("recusa início depois do fim e data em outro formato", () => {
    const reversed = periodSchema.safeParse({ from: "2026-10-21", to: "2026-10-20" });
    expect(reversed.error?.issues[0]?.path).toEqual(["to"]);
    expect(periodSchema.safeParse({ from: "20/10/2026" }).success).toBe(false);
  });
});
