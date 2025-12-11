"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DownloadProgress } from "@/types/video";

interface DownloadButtonProps {
  progress: DownloadProgress;
  onDownload: () => void;
  onCancel?: () => void;
  disabled: boolean;
}

export function DownloadButton({
  progress,
  onDownload,
  onCancel,
  disabled,
}: DownloadButtonProps) {
  const isProcessing =
    progress.status === "downloading" || progress.status === "converting";

  return (
    <div className="space-y-3">
      {isProcessing && (
        <div className="space-y-2">
          <Progress value={progress.progress} className="h-2" />
          <p className="text-sm text-muted-foreground text-center">
            {progress.message} ({progress.progress}%)
          </p>
        </div>
      )}

      {progress.status === "error" && (
        <p className="text-sm text-destructive text-center">{progress.message}</p>
      )}

      {progress.status === "complete" && (
        <p className="text-sm text-green-600 text-center">{progress.message}</p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={onDownload}
          disabled={disabled || isProcessing}
          className="flex-1"
          size="lg"
        >
          {isProcessing ? "Processing..." : "Download"}
        </Button>
        {isProcessing && onCancel && (
          <Button
            onClick={onCancel}
            variant="outline"
            size="lg"
            aria-label="Cancel download"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
