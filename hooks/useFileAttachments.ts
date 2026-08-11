import { useState, useCallback } from "react";

export interface AttachedFile {
  id: string;
  file: File;
  uploadedAt?: string;
  status?: "uploading" | "uploaded" | "error";
  documentId?: string;
}

export function useFileAttachments() {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  const addFile = useCallback((file: File) => {
    const id = `${Date.now()}-${Math.random()}`;
    setAttachedFiles((prev) => [
      ...prev,
      {
        id,
        file,
        status: "uploading",
      },
    ]);
    return id;
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const markFileUploaded = useCallback((fileId: string, uploadedAt: string, documentId?: string) => {
    setAttachedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? {
              ...file,
              uploadedAt,
              status: "uploaded",
              documentId,
            }
          : file,
      ),
    );
  }, []);

  const markFileError = useCallback((fileId: string) => {
    setAttachedFiles((prev) =>
      prev.map((file) =>
        file.id === fileId
          ? {
              ...file,
              status: "error",
            }
          : file,
      ),
    );
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  const clearPendingFiles = useCallback(() => {
    setAttachedFiles((prev) => prev.filter((f) => f.uploadedAt));
  }, []);

  return {
    attachedFiles,
    addFile,
    removeFile,
    markFileUploaded,
    markFileError,
    clearFiles,
    clearPendingFiles,
  };
}
