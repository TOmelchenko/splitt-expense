import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpService } from "./http-service";
import { ServiceError } from "./types";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("http-service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs createGroup to /groups with a JSON body and returns the parsed view", async () => {
    const view = { group: { id: "g_1" }, totalCents: 0, balances: [], status: "empty" };
    fetchMock.mockResolvedValueOnce(jsonResponse(view, 201));

    const service = createHttpService();
    const result = await service.createGroup({ creatorName: "Mara" });

    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8001/api/groups");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ creatorName: "Mara" });
  });

  it("GETs a group by id", async () => {
    const view = { group: { id: "g_1" }, totalCents: 0, balances: [], status: "empty" };
    fetchMock.mockResolvedValueOnce(jsonResponse(view));

    const service = createHttpService();
    await service.getGroup("g_1");

    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8001/api/groups/g_1");
  });

  it("raises a ServiceError with the backend's message on a 400", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "A payment needs two different people." }, 400));

    const service = createHttpService();
    await expect(service.addPayment("g_1", { fromId: "p_1", toId: "p_1", amount: "10" })).rejects.toMatchObject(
      { message: "A payment needs two different people." },
    );
  });

  it("raises a ServiceError on a 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "This group doesn't exist." }, 404));

    const service = createHttpService();
    const error = await service.getGroup("g_missing").catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.message).toBe("This group doesn't exist.");
  });

  it("raises a friendly ServiceError when the network request itself fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const service = createHttpService();
    const error = await service.getGroup("g_1").catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.message).toMatch(/could not reach the server/i);
  });
});
