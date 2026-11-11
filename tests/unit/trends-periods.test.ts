import { describe, expect, it } from "vitest";
import { bucketStart, listPeriods, subtractMonths } from "@/features/trends/service";

describe("períodos do painel de tendências", () => {
  it("subtractMonths usa o último dia quando o dia não existe no mês de destino", () => {
    expect(subtractMonths("2026-11-11", 3)).toBe("2026-08-11");
    expect(subtractMonths("2026-05-31", 3)).toBe("2026-02-28");
    expect(subtractMonths("2028-05-31", 3)).toBe("2028-02-29");
    expect(subtractMonths("2026-02-15", 3)).toBe("2025-11-15");
  });

  it("bucketStart: semana começa na segunda; mês no dia 1", () => {
    expect(bucketStart("2026-10-05", "week")).toBe("2026-10-05"); // segunda
    expect(bucketStart("2026-10-11", "week")).toBe("2026-10-05"); // domingo
    expect(bucketStart("2026-01-01", "week")).toBe("2025-12-29");
    expect(bucketStart("2026-10-31", "month")).toBe("2026-10-01");
  });

  it("listPeriods cobre todos os períodos que tocam o intervalo", () => {
    expect(listPeriods({ from: "2026-10-01", to: "2026-10-12" }, "week")).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(listPeriods({ from: "2026-11-15", to: "2027-01-02" }, "month")).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
    expect(listPeriods({ from: "2026-10-07", to: "2026-10-07" }, "week")).toEqual(["2026-10-05"]);
  });
});
