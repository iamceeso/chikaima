"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/services/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { AIModel } from "@/types";

interface ModelSelectorProps {
  value?: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const tokens = useAuthStore((state) => state.tokens);
  const token = tokens?.access_token;
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadModels() {
      if (!token) return;
      try {
        setIsLoading(true);
        const data = await api.getModels(token);
        setModels(data);
        if (!value && data.length > 0) {
          onChange(data[0].id);
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadModels();
  }, [token, value, onChange]);

  if (models.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Model</Label>
        <div className="text-sm text-foreground-muted">
          {isLoading ? "Loading models..." : "No models available"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="model-select">Model</Label>
      <Select value={value || ""} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger id="model-select">
          <SelectValue placeholder="Select a model..." />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex items-center gap-2">
                <span>{model.name}</span>
                {model.provider_id && (
                  <span className="text-xs text-foreground-muted">
                    ({model.provider_id})
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
