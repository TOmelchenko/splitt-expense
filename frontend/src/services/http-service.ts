/**
 * HTTP implementation of ExpenseSplitterService, talking to the FastAPI
 * backend in backend/app/ over the contract in /openapi.yaml.
 *
 * Field names on every request/response body already match the backend's
 * schemas exactly (see openapi.yaml's Group/Expense/Payment/... definitions
 * and backend/app/models.py), so bodies are passed through as-is with no
 * mapping layer.
 */
import {
  ServiceError,
  type AddExpenseInput,
  type AddPaymentInput,
  type CreateGroupInput,
  type ExpenseSplitterService,
  type GroupView,
} from "./types";

const DEFAULT_BASE_URL = "http://localhost:8001/api";

function baseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  return fromEnv && fromEnv.trim() ? fromEnv.replace(/\/$/, "") : DEFAULT_BASE_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ServiceError("Could not reach the server. Please check your connection and try again.");
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Request failed (${response.status}).`;
    throw new ServiceError(message);
  }

  return (await response.json()) as T;
}

export function createHttpService(): ExpenseSplitterService {
  return {
    createGroup: (input: CreateGroupInput) =>
      request<GroupView>("/groups", { method: "POST", body: JSON.stringify(input) }),

    getGroup: (groupId: string) => request<GroupView>(`/groups/${groupId}`),

    addParticipant: (groupId: string, name: string) =>
      request<GroupView>(`/groups/${groupId}/participants`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),

    addExpense: (groupId: string, input: AddExpenseInput) =>
      request<GroupView>(`/groups/${groupId}/expenses`, {
        method: "POST",
        body: JSON.stringify(input),
      }),

    addPayment: (groupId: string, input: AddPaymentInput) =>
      request<GroupView>(`/groups/${groupId}/payments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };
}
