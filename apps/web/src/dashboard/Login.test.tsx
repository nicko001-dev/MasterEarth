import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Login } from "./Login";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("explains that citoyen accounts can sign in", () => {
  render(<Login onLogged={() => {}} onCancel={() => {}} />);

  expect(screen.getByText(/compte citoyen, agent, analyste, responsable ou administrateur/)).toBeInTheDocument();
});

it("registers a citoyen and signs them in without exposing elevated roles", async () => {
  const onLogged = vi.fn();
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ role: "citoyen" }), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "citoyen-token",
      user: { id: 8, email: "citoyen@example.test", full_name: "Compte Citoyen", role: "citoyen" },
    }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<Login onLogged={onLogged} onCancel={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "Créer un compte citoyen" }));
  expect(screen.getByText(/uniquement un compte citoyen/)).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Nom complet"), { target: { value: "Compte Citoyen" } });
  fireEvent.change(screen.getByPlaceholderText("E-mail"), { target: { value: "citoyen@example.test" } });
  fireEvent.change(screen.getByPlaceholderText("Mot de passe", { exact: true }), { target: { value: "MotDePasseSecurise123" } });
  fireEvent.change(screen.getByPlaceholderText("Confirmer le mot de passe"), { target: { value: "MotDePasseSecurise123" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

  await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
    email: "citoyen@example.test",
    full_name: "Compte Citoyen",
    password: "MotDePasseSecurise123",
  });
  expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
    email: "citoyen@example.test",
    password: "MotDePasseSecurise123",
  });
});
