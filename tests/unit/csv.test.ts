import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/csv";
import { formatDateTime, todayIso } from "@/lib/format";

describe("CSV (D-11, RN-18)", () => {
  it.each(["=SOMA(A1)", "+1", "-1", "@cmd"])("neutraliza fórmula em %s", (value) => {
    expect(csvCell(value)).toBe(`'${value}`);
  });

  it("aspas só quando há separador, aspas ou quebra de linha", () => {
    expect(csvCell("Vite")).toBe("Vite");
    expect(csvCell("Vite; Jest")).toBe('"Vite; Jest"');
    expect(csvCell('Bom, "muito" bom')).toBe('"Bom, ""muito"" bom"');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell("=A1;B1")).toBe('"\'=A1;B1"');
  });

  it("linha com ; e CRLF, acentos intactos", () => {
    expect(csvRow(["Ótimo", "ação", ""])).toBe("Ótimo;ação;\r\n");
  });
});

describe("datas no fuso de São Paulo", () => {
  it("formatDateTime e todayIso viram o dia às 0h de Brasília", () => {
    expect(formatDateTime(new Date("2026-10-20T02:30:00Z"))).toBe("19/10/2026 23:30");
    expect(todayIso(new Date("2026-10-20T02:30:00Z"))).toBe("2026-10-19");
    expect(todayIso(new Date("2026-10-20T03:30:00Z"))).toBe("2026-10-20");
  });
});
