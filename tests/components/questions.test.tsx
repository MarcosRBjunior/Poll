// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { QuestionRenderer } from "@/components/questions/question-renderer";
import type { FormValue, PublicQuestion } from "@/features/responses/schemas";

afterEach(cleanup);

function question(overrides: Partial<PublicQuestion>): PublicQuestion {
  return {
    id: "q1",
    type: "SINGLE_CHOICE",
    title: "Qual framework?",
    helpText: null,
    required: true,
    minSelections: null,
    maxSelections: null,
    options: [
      { id: "react", label: "React" },
      { id: "vue", label: "Vue" },
      { id: "svelte", label: "Svelte" },
    ],
    ...overrides,
  };
}

/** Renderiza controlado, como o formulário faz, e expõe o último valor. */
function setup(q: PublicQuestion, initial: FormValue, error?: string) {
  const seen: { value: FormValue } = { value: initial };
  function Harness() {
    const [value, setValue] = useState<FormValue>(initial);
    return (
      <QuestionRenderer
        question={q}
        value={value}
        error={error}
        onChange={(v) => {
          seen.value = v;
          setValue(v);
        }}
      />
    );
  }
  render(<Harness />);
  return { user: userEvent.setup(), seen };
}

describe("SINGLE_CHOICE", () => {
  it("agrupa os rádios sob o enunciado e escolhe uma opção por teclado", async () => {
    const { user, seen } = setup(question({}), "");
    const group = screen.getByRole("group", { name: /Qual framework\?/ });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);

    await user.tab();
    await user.keyboard(" ");
    expect(seen.value).toBe("react");
    await user.keyboard("{ArrowDown}");
    expect(seen.value).toBe("vue");
    expect((screen.getByRole("radio", { name: "Vue" }) as HTMLInputElement).checked).toBe(true);
  });

  it("marca obrigatória e liga o erro ao grupo", () => {
    setup(question({}), "", "Responda esta pergunta.");
    const group = screen.getByRole("group", { name: /obrigatória/ });
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toBe("q-q1-error");
    expect(screen.getByText("Responda esta pergunta.").id).toBe("q-q1-error");
  });
});

describe("MULTIPLE_CHOICE", () => {
  it("usa caixas de seleção, mostra a faixa e mantém a ordem das opções", async () => {
    const { user, seen } = setup(
      question({
        type: "MULTIPLE_CHOICE",
        minSelections: 2,
        maxSelections: 3,
        options: [...question({}).options, { id: "solid", label: "Solid" }],
      }),
      [],
    );
    expect(screen.getByText("Escolha de 2 a 3 opções.")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Svelte" }));
    await user.click(screen.getByRole("checkbox", { name: "React" }));
    expect(seen.value).toEqual(["react", "svelte"]);
    await user.click(screen.getByRole("checkbox", { name: "Svelte" }));
    expect(seen.value).toEqual(["react"]);
  });
});

describe("SHORT_TEXT e LONG_TEXT", () => {
  it("campo de uma linha com rótulo, limite de 200 e contador", async () => {
    const { user, seen } = setup(
      question({ type: "SHORT_TEXT", required: false, options: [] }),
      "",
    );
    const input = screen.getByRole("textbox", { name: /Qual framework\? \(opcional\)/ });
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("maxlength")).toBe("200");
    await user.type(input, "Next.js");
    expect(seen.value).toBe("Next.js");
    expect(screen.getByText(/^7\/200/)).toBeTruthy();
  });

  it("área de texto com limite de 2.000 e contador", async () => {
    const { user } = setup(question({ type: "LONG_TEXT", required: false, options: [] }), "");
    const textarea = screen.getByRole("textbox", { name: /Qual framework\?/ });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.getAttribute("maxlength")).toBe("2000");
    expect(screen.getByText(/^0\/2\.000/)).toBeTruthy();
    await user.type(textarea, "abc");
    expect(screen.getByText(/^3\/2\.000/)).toBeTruthy();
  });
});
