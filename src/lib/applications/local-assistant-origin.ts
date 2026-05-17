const LOCAL_ASSISTANT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export const LOCAL_ASSISTANT_ERROR =
  "The Playwright assistant can only be launched from a local app URL. Set ENABLE_LOCAL_ASSISTANT=true only for a trusted local deployment.";

export function isLocalAssistantRequest(url: URL) {
  return LOCAL_ASSISTANT_HOSTS.has(url.hostname) || process.env.ENABLE_LOCAL_ASSISTANT === "true";
}
