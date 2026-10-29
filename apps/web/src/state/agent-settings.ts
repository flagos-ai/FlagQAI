import type {
  ProviderDraft,
  ProviderProtocol,
} from "../../../../packages/sdk/index.d.ts";
export type ProviderForm = {
  kind: "catalog" | "custom";
  route: string;
  baseURL: string;
  api: ProviderProtocol | "";
  apiKey: string;
  models: string;
};
export const blankProvider = (): ProviderForm => ({
  kind: "catalog",
  route: "",
  baseURL: "",
  api: "",
  apiKey: "",
  models: "",
});
export function providerInput(form: ProviderForm): ProviderDraft {
  return {
    kind: form.kind,
    route: form.route.trim(),
    ...(form.baseURL.trim() ? { baseURL: form.baseURL.trim() } : {}),
    ...(form.api ? { api: form.api } : {}),
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
  };
}
