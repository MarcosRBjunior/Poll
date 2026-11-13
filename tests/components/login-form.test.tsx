// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
};
let search = new URLSearchParams();

vi.mock("@/lib/supabase/client", () => ({ createSupabaseBrowserClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

const assign = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
  fetchMock.mockResolvedValue(Response.json({ redirectTo: "/requests" }));
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, origin: "http://localhost", assign },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function requestCode(email = "pessoa@example.com") {
  const user = userEvent.setup();
  render(<LoginForm />);
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.click(screen.getByRole("button", { name: "Receber código por e-mail" }));
  return user;
}

describe("T04: login por código de 6 dígitos (D-01)", () => {
  it("envia o código, confere no Supabase e conclui no servidor com a origem", async () => {
    search = new URLSearchParams({ next: "/s/pesquisa" });
    const user = await requestCode();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: "pessoa@example.com" });
    expect(screen.getByRole("status").textContent).toContain("pessoa@example.com");

    await user.type(screen.getByLabelText("Código"), "123456");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "pessoa@example.com",
      token: "123456",
      type: "email",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ next: "/s/pesquisa" }),
    });
    expect(assign).toHaveBeenCalledWith("/requests");
  });

  it("código com formato errado não chega ao Supabase", async () => {
    const user = await requestCode();
    await user.type(screen.getByLabelText("Código"), "12a4");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByText("Digite os 6 números do código.")).toBeTruthy();
    expect(screen.getByLabelText("Código").getAttribute("aria-invalid")).toBe("true");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("código recusado avisa e não conclui o login", async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { status: 403, message: "expired" } });
    const user = await requestCode();
    await user.type(screen.getByLabelText("Código"), "000000");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("alert").textContent).toContain("Código inválido ou expirado");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("dá para pedir outro código ou trocar o e-mail", async () => {
    const user = await requestCode();
    await user.click(screen.getByRole("button", { name: "Enviar outro código" }));
    expect(auth.signInWithOtp).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Usar outro e-mail" }));
    expect(screen.getByLabelText("E-mail")).toBeTruthy();
  });

  it("e-mail inválido não chama o Supabase", async () => {
    await requestCode("não é e-mail");
    expect(screen.getByText("Informe um e-mail válido.")).toBeTruthy();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});
