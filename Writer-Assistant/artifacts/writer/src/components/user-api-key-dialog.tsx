import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserApiConfig, setUserApiKey, setUserBaseUrl, setUserModel, clearUserApiConfig } from "@/lib/api-key";

export function UserApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const existing = getUserApiConfig();
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "https://openrouter.ai/api/v1");
  const [model, setModel] = useState(existing?.model ?? "deepseek/deepseek-v4-flash");

  const handleSave = () => {
    if (apiKey.trim()) {
      setUserApiKey(apiKey);
      setUserBaseUrl(baseUrl);
      setUserModel(model);
    } else {
      clearUserApiConfig();
    }
    onOpenChange(false);
  };

  const handleClear = () => {
    clearUserApiConfig();
    setApiKey("");
    setBaseUrl("https://openrouter.ai/api/v1");
    setModel("deepseek/deepseek-v4-flash");
    onOpenChange(false);
  };

  const hasExisting = !!existing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">AI API Key</DialogTitle>
          <DialogDescription className="text-sm pt-1">
            {hasExisting
              ? "Using your own API key — no daily limits. You can update or remove it below."
              : "Set your own API key to bypass the 10K token daily limit. Uses OpenRouter by default."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="base-url">Base URL (optional)</Label>
            <Input
              id="base-url"
              type="text"
              placeholder="https://openrouter.ai/api/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">OpenAI-compatible API endpoint. Defaults to OpenRouter.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model (optional)</Label>
            <Input
              id="model"
              type="text"
              placeholder="deepseek/deepseek-v4-flash"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Model name for your provider. Defaults to deepseek/deepseek-v4-flash.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {hasExisting && (
            <Button variant="destructive" size="sm" onClick={handleClear}>
              Remove Key
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            {hasExisting ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
