import { beforeEach, describe, expect, it, vi } from "vitest";
import { logout, NETWORK_ERROR_MESSAGE } from "./auth";

describe("logout", () => {
  beforeEach(() => {
    localStorage.setItem("intelliflood.session.v1", JSON.stringify({ token: "access-token" }));
    vi.restoreAllMocks();
  });

  it("revokes the server session and clears the local session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await logout("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/logout"),
      expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer access-token" } }),
    );
    expect(localStorage.getItem("intelliflood.session.v1")).toBeNull();
  });

  it("clears the local session and reports a friendly network message when revocation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(logout("access-token")).rejects.toThrow(NETWORK_ERROR_MESSAGE);

    expect(localStorage.getItem("intelliflood.session.v1")).toBeNull();
  });
});
