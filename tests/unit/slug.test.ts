import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify (RN-20)", () => {
  it.each([
    ["Ferramentas JavaScript favoritas", "ferramentas-javascript-favoritas"],
    ["Como você trabalha com JavaScript", "como-voce-trabalha-com-javascript"],
    ["  Ação, Ficção & Comédia!  ", "acao-ficcao-comedia"],
    ["Node.js -- 2026", "node-js-2026"],
  ])("%s → %s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });
});
